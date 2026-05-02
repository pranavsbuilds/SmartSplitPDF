# SmartSplitPDF

> **Split your PDF into Color and Black & White streams — automatically.**  
> Save up to 80% on printing costs by sending only the pages that need color to a color printer.

---

## ✨ Features

- **Automatic Color Detection** — Inspects every page's drawing commands (RGB, CMYK, image pixels) to classify it as color or black & white.
- **Ignore a Color** — Pick specific colors (e.g., a logo tint) that should not trigger the "color" classification. Useful when a brand color appears on every page but you still want to print those pages in B&W.
- **Exclude a Region** — Draw a rectangle over any area (header, logo, watermark) on the PDF preview; that region is skipped during color detection.
- **Original Page Numbers Preserved** — Each output page is stamped with its original page number so you can match printed pages back to the source document.
- **No Cloud Storage** — Files are processed on your local server and returned directly as Base64-encoded data. Nothing is persisted externally.
- **4-Step Wizard UI** — Clean, guided workflow: Upload → Configure → Preview & Process → Download.

---

## 🖥️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESM) |
| Web Server | Express 5 |
| File Upload | Multer |
| PDF Inspection | PDF.js (`pdfjs-dist`) |
| PDF Generation | pdf-lib |
| Frontend | Vanilla HTML, CSS, JavaScript |
| Fonts | Inter (Google Fonts) |

---

## 📋 Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later

---

## 🚀 Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/pranavsupugade1489-stack/SmartSplitPDF.git
cd SmartSplitPDF
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start the server

```bash
npm start
```

The app will be available at **http://localhost:3000**.

For debug mode (Node.js inspector):

```bash
npm run debug
```

---

## 🗂️ Project Structure

```
SmartSplitPDF/
├── public/
│   ├── index.html      # 4-page wizard UI
│   ├── style.css       # All styles (dark-mode-ready, Inter font)
│   └── app.js          # Frontend logic (upload, preview, eyedropper, download)
├── uploads/            # Temporary upload directory (auto-created)
├── server.js           # Express server + color detection + PDF splitting
├── package.json
└── TECHNOLOGY_AND_PROCESS.md   # In-depth technical documentation
```

---

## ⚙️ How It Works

### Color Detection

Each PDF page is inspected using **two complementary checks**:

1. **PDF Color Operators**  
   PDF.js reads each page's drawing instructions. If any `setFillRGBColor`, `setStrokeRGBColor`, `setFillCMYKColor`, or similar operator sets a color whose channels differ enough to indicate visible hue, the page is marked as color.

2. **Embedded Image Pixels**  
   For pages containing images, the pixel data is sampled. If any pixel has a meaningful difference between its R, G, and B channels (threshold > 8), the image — and thus the page — is considered color.

A **Euclidean distance threshold** (radius = 40 in RGB space) is used for the "ignore color" feature, so minor color variations around the picked color are also suppressed.

### Page Splitting

After classification, `pdf-lib` copies each page into one of two new PDF documents:

- `<filename>-color.pdf` — pages with detected color
- `<filename>-black-white.pdf` — pages without detected color

Each copied page receives a stamped original page number at the bottom center.

---

## 🎨 UI Walkthrough

| Step | Description |
|---|---|
| **1 — Upload** | Drag & drop or browse to select a PDF (max 100 MB). |
| **2 — Configure** | Optionally pick colors to ignore (eyedropper) and/or draw an exclusion region on the PDF preview. |
| **3 — Preview & Process** | The server analyzes the document. A thumbnail grid shows original, color, and B&W pages. |
| **4 — Download** | Download the Color PDF and/or the Black & White PDF separately. |

---

## ⚠️ Known Limitations & Edge Cases

- PDFs using **non-standard or device-specific color spaces** may not be classified correctly.
- Pages with **tiny colored marks** (e.g., a single colored pixel) will still be classified as color.
- Scanned B&W pages **saved as slightly tinted color images** may be detected as color due to scanner noise.
- JPEG compression artifacts can introduce subtle color differences that exceed the grayscale threshold.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open an issue or submit a pull request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes (`git commit -m 'Add my feature'`)
4. Push to the branch (`git push origin feature/my-feature`)
5. Open a Pull Request
