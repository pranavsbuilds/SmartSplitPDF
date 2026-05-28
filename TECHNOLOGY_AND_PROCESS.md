# Technologies and Process

This document provides a technical overview of the **SmartSplitPDF** architecture, its underlying technologies, and the logic used for precise color detection and page separation.

---

## 🖥️ Core Technologies

### Backend (Node.js & Express)
The server layer is built with **Node.js** using ES Modules. **Express 5** manages the web server, serving static frontend assets and exposing the primary processing endpoint.

### File Handling (Multer)
**Multer** is used to handle `multipart/form-data` uploads. It streams uploaded PDFs to a temporary `uploads/` directory for processing. These files are strictly transient and are deleted immediately after the analysis is complete.

### PDF Inspection (PDF.js)
The application leverages **PDF.js** (specifically `pdfjs-dist`) to parse the internal structure of each page. Unlike simple image converters, PDF.js allows the server to inspect:
- **Operator Lists**: Sequential drawing commands (text, paths, fills).
- **Embedded XObjects**: Raw image data and masks.
- **Common Objects**: Reusable resources like fonts and shared graphics.

### PDF Manipulation (pdf-lib)
**pdf-lib** handles the generation of the final split documents. It performs low-level PDF operations:
- Copying pages from the source document without re-rendering (preserving quality).
- Embedding standard fonts (Helvetica) for page stamping.
- Merging pages into separate "Color" and "Black & White" streams.

---

## ⚙️ Processing Workflow

1.  **Upload**: The user selects a PDF via the browser.
2.  **Transmission**: The file is sent to the `/api/process` endpoint along with optional configuration (excluded regions and colors to ignore).
3.  **Analysis**: The server initializes a PDF.js document and iterates through every page.
4.  **Classification**: Each page is analyzed against the color detection engine (detailed below).
5.  **Assembly**: `pdf-lib` creates two new PDF documents. As pages are copied, the original page index is stamped at the bottom center.
6.  **Encoding**: The resulting PDF buffers are converted to Base64 strings.
7.  **Response**: The server writes generated PDFs to a temporary result folder and returns metadata plus expiring download URLs.

---

## 🎨 Color Detection Engine

The classification engine uses a multi-pass approach to ensure accuracy while allowing for user-defined overrides.

### 1. Vector & Text Operators
The engine monitors the PDF operator list for color-setting commands:
- `setFillRGBColor`, `setStrokeRGBColor`
- `setFillCMYKColor`, `setStrokeCMYKColor`
- `setFillColorN`, `setStrokeColorN`

**Heuristic**: A color is considered "True Color" when its RGB channel spread is above the noise floor and its HSV-style saturation is at least 0.12. This is more precise than channel spread alone because slightly warm/cool anti-aliased grays do not get promoted to color. CMYK colors still use the C/M/Y channel-difference epsilon (0.01 for normalized values). Pure blacks, whites, and grays are ignored.

### 2. Image Pixel Sampling
For embedded images, the engine samples the raw byte data.
- **Grayscale Images**: Automatically treated as B&W.
- **RGB Images**: The engine checks both RGB channel spread and HSV-style saturation. A pixel is flagged as colored when `max(R,G,B) - min(R,G,B) > 8` and `(max-min)/max >= 0.12`.

### 3. Exclude Region (Spatial Filtering)
Users can define a rectangular region (in normalized 0-1 coordinates).
- The engine tracks the **Current Transformation Matrix (CTM)** during page parsing.
- When an image is encountered, its bounding box is calculated in PDF points.
- If the image's center falls within the user-defined "Exclude Region," it is skipped entirely. This is ideal for ignoring colored logos in headers or footers.

### 4. Ignore Color (Chromatic Filtering)
Users can "pick" specific colors from the PDF to be treated as grayscale.
- When a color operator or pixel is analyzed, its Euclidean distance to all "Ignored Colors" is calculated.
- **Formula**: `dist² = (r1-r2)² + (g1-g2)² + (b1-b2)²`
- If the distance is within the tolerance threshold (radius = 40), the color is suppressed, allowing the page to remain classified as Black & White.

---

## 🔢 Page Numbering

To maintain document integrity after splitting, SmartSplitPDF performs **Original Index Stamping**. 
- Even if a page becomes "Page 1" of the `color.pdf` stream, it might have been "Page 42" of the source.
- The original 1-based index is rendered at `y: 18` (bottom center) on every output page using a 10pt Helvetica font.

---

## ⚠️ Accuracy & Limitations

### Compression & Noise
Lossy compression (like JPEG) can introduce "chroma noise" — tiny color variations in what should be a gray area. The engine uses a tolerance threshold of `8` units to avoid false positives from noise.

### Color Spaces
The engine primarily focuses on RGB and CMYK. Advanced or device-specific color spaces (like `Lab` or `Spot Colors`) may be treated as colored by default to ensure no intended color is lost.

### Performance
For extremely large PDFs (1000+ pages), processing is synchronous per-request. Sampling is capped at 2 million pixel values per image to maintain responsiveness.

---

## 🔒 Security & Privacy

- **Host Server Processing**: Files are uploaded to the Node host server for temporary processing and are not sent to 3rd party cloud providers by the application.
- **No Long-Term Persistence**: Source uploads are deleted after processing. Generated result files are stored temporarily for download and removed after the configured `RESULT_TTL_MS`.
- **Transport Security**: Production deployments should terminate HTTPS at the hosting platform or reverse proxy. Set `FORCE_HTTPS=true` when the proxy forwards `X-Forwarded-Proto`.
- **Abuse Protection**: Upload size, concurrent processing, and per-IP upload attempts are capped by environment variables.
- **Memory Safety**: PDF buffers are handled as `Uint8Array` and `Buffer` objects, with explicit cleanup of PDF.js document instances.
