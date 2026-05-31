import express from 'express';
import multer from 'multer';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createCanvas } from '@napi-rs/canvas';
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const maxUploadMb = clampNumber(Number(process.env.MAX_UPLOAD_MB), 1, 50, 25);
const maxPdfPages = clampNumber(Number(process.env.MAX_PDF_PAGES), 1, 1000, 150);
const maxConcurrentJobs = clampNumber(Number(process.env.MAX_CONCURRENT_JOBS), 1, 8, 2);
const resultTtlMs = clampNumber(Number(process.env.RESULT_TTL_MS), 60_000, 3_600_000, 15 * 60_000);
const rateLimitWindowMs = clampNumber(Number(process.env.RATE_LIMIT_WINDOW_MS), 10_000, 3_600_000, 15 * 60_000);
const rateLimitMax = clampNumber(Number(process.env.RATE_LIMIT_MAX), 1, 200, 20);
const forceHttps = process.env.FORCE_HTTPS === 'true';
let activeJobs = 0;
const uploadHitsByIp = new Map();

const uploadDir = path.join(__dirname, 'uploads');
const resultDir = path.join(uploadDir, 'results');
await fs.mkdir(uploadDir, { recursive: true });
await fs.mkdir(resultDir, { recursive: true });
await cleanupExpiredResults();

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true);
      return;
    }
    cb(new Error('Only PDF files are supported.'));
  }
});

app.set('trust proxy', 1);
app.use(enforceHttps);
app.use(securityHeaders);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/vendor/pdfjs', express.static(path.join(__dirname, 'node_modules', 'pdfjs-dist', 'build'), {
  immutable: true,
  maxAge: '1y'
}));

app.get('/api/download/:jobId/:kind', async (req, res) => {
  const { jobId, kind } = req.params;
  const fileName = typeof req.query.name === 'string' ? safeBaseName(req.query.name) : 'document';

  if (!isValidJobId(jobId) || !['blackWhite', 'color'].includes(kind)) {
    res.status(404).json({ error: 'File not found.' });
    return;
  }

  const diskName = kind === 'blackWhite' ? 'black-white.pdf' : 'color.pdf';
  const downloadSuffix = kind === 'blackWhite' ? 'bw' : 'color';
  const filePath = path.join(resultDir, jobId, diskName);

  try {
    await fs.access(filePath);
    res.download(filePath, `${fileName}-${downloadSuffix}.pdf`);
  } catch {
    res.status(404).json({ error: 'File not found or expired.' });
  }
});

app.post('/api/process', rateLimitUploads, (req, res, next) => {
  if (activeJobs >= maxConcurrentJobs) {
    res.status(429).json({ error: 'Server is busy. Please try again in a moment.' });
    return;
  }

  activeJobs += 1;
  upload.single('pdf')(req, res, (error) => {
    if (error) {
      activeJobs -= 1;
      next(error);
      return;
    }
    next();
  });
}, async (req, res) => {
  if (!req.file) {
    activeJobs -= 1;
    res.status(400).json({ error: 'Upload a PDF file first.' });
    return;
  }

  try {
    const inputBytes = await fs.readFile(req.file.path);
    
    let excludedRegion = null;
    if (req.body.excludeRegion) {
      try {
        const p = JSON.parse(req.body.excludeRegion);
        if (typeof p.x === 'number' && typeof p.y === 'number' &&
            typeof p.width === 'number' && typeof p.height === 'number') {
          excludedRegion = p;
        }
      } catch { /* ignore malformed */ }
    }

    let ignoreColors = [];
    if (req.body.ignoreColors) {
      try {
        ignoreColors = JSON.parse(req.body.ignoreColors); // Array of {r, g, b}
      } catch { /* ignore malformed */ }
    }

    const colorTolerance = clampNumber(Number(req.body.colorTolerance), 20, 80, 40);
    const pageColors = await classifyPdfPages(inputBytes, excludedRegion, ignoreColors, colorTolerance);
    const split = await createNumberedSplits(inputBytes, pageColors);
    const id = crypto.randomUUID();
    const baseName = safeBaseName(req.file.originalname);
    const jobDir = path.join(resultDir, id);
    await fs.mkdir(jobDir, { recursive: true });

    if (split.blackWhitePages.length) {
      await fs.writeFile(path.join(jobDir, 'black-white.pdf'), split.blackWhiteBytes);
    }
    if (split.colorPages.length) {
      await fs.writeFile(path.join(jobDir, 'color.pdf'), split.colorBytes);
    }

    await fs.unlink(req.file.path).catch(() => {});
    scheduleResultCleanup(jobDir);

    res.json({
      jobId: id,
      fileName: baseName,
      pages: pageColors.length,
      blackWhitePages: split.blackWhitePages,
      colorPages: split.colorPages,
      files: {
        blackWhite: split.blackWhitePages.length
          ? `/api/download/${id}/blackWhite?name=${encodeURIComponent(baseName)}`
          : null,
        color: split.colorPages.length
          ? `/api/download/${id}/color?name=${encodeURIComponent(baseName)}`
          : null
      }
    });
  } catch (error) {
    await fs.unlink(req.file.path).catch(() => {});
    console.error(error);
    res.status(500).json({ error: error.message || 'Could not process the PDF.' });
  } finally {
    activeJobs -= 1;
  }
});

app.use((error, _req, res, _next) => {
  res.status(400).json({ error: error.message || 'Upload failed.' });
});

app.listen(port, () => {
  console.log(`PDF separator running at http://localhost:${port}`);
});

async function classifyPdfPages(inputBytes, excludedRegion, ignoreColors, colorTolerance) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(inputBytes),
    disableWorker: true,
    useSystemFonts: true
  });
  const pdf = await loadingTask.promise;
  const results = [];

  try {
    if (pdf.numPages > maxPdfPages) {
      throw new Error(`PDF has ${pdf.numPages} pages. The current limit is ${maxPdfPages} pages.`);
    }

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const operatorList = await page.getOperatorList();
      const viewport = page.getViewport({ scale: 1 });
      results.push(await pageHasColor(page, operatorList, excludedRegion, viewport, ignoreColors, colorTolerance));
      page.cleanup();
    }
  } finally {
    await pdf.destroy();
  }

  return results;
}

async function pageHasColor(page, operatorList, excludedRegion, viewport, ignoreColors, colorTolerance) {
  const ops = pdfjsLib.OPS;

  // Convert excluded region (normalised canvas/top-left coords) to PDF pts (bottom-left origin)
  let excl = null;
  if (excludedRegion && viewport) {
    const pw = viewport.width;
    const ph = viewport.height;
    excl = {
      x1: excludedRegion.x * pw,
      x2: (excludedRegion.x + excludedRegion.width) * pw,
      y1: (1 - excludedRegion.y - excludedRegion.height) * ph,
      y2: (1 - excludedRegion.y) * ph
    };
  }

  // CTM tracking (identity matrix)
  let ctm = [1, 0, 0, 1, 0, 0];
  let currentFillColored = false;
  let currentStrokeColored = false;
  const graphicsStateStack = [];

  for (let i = 0; i < operatorList.fnArray.length; i += 1) {
    const fn = operatorList.fnArray[i];
    const args = operatorList.argsArray[i] || [];

    // Update current transformation matrix
    if (fn === ops.transform) {
      ctm = matMul(ctm, args);
    } else if (fn === ops.save) {
      graphicsStateStack.push({
        ctm: [...ctm],
        fillColored: currentFillColored,
        strokeColored: currentStrokeColored
      });
    } else if (fn === ops.restore && graphicsStateStack.length) {
      const state = graphicsStateStack.pop();
      ctm = state.ctm;
      currentFillColored = state.fillColored;
      currentStrokeColored = state.strokeColored;
    }

    if (isColorOperator(fn)) {
      const isColored = colorArgsAreColored(args, ignoreColors, colorTolerance);

      if (!excl && isColored) {
        return true;
      }

      if (isFillColorOperator(fn)) {
        currentFillColored = isColored;
      }
      if (isStrokeColorOperator(fn)) {
        currentStrokeColored = isColored;
      }
    }

    if (fn === ops.constructPath && (currentFillColored || currentStrokeColored)) {
      const bbox = pathBbox(args, ctm);
      if (!bbox || !excl || !bboxInsideRegion(bbox, excl)) {
        return true;
      }
    }

    if (isImageOperator(fn)) {
      // Skip image if its centre lies inside the excluded region
      if (excl) {
        const bbox = imageBbox(ctm);
        const cx = (bbox.x1 + bbox.x2) / 2;
        const cy = (bbox.y1 + bbox.y2) / 2;
        if (cx >= excl.x1 && cx <= excl.x2 && cy >= excl.y1 && cy <= excl.y2) {
          continue;
        }
      }
      const images = await getPdfImages(page, args);
      if (images.some((image) => imageHasColor(image, ignoreColors, colorTolerance))) {
        return true;
      }
    }
  }

  return false;
}

// --- Matrix helpers ---
function matMul(m, a) {
  // Multiply current CTM m by new transform a (both as [a,b,c,d,e,f])
  return [
    a[0]*m[0] + a[1]*m[2],
    a[0]*m[1] + a[1]*m[3],
    a[2]*m[0] + a[3]*m[2],
    a[2]*m[1] + a[3]*m[3],
    a[4]*m[0] + a[5]*m[2] + m[4],
    a[4]*m[1] + a[5]*m[3] + m[5]
  ];
}

function transformPt(m, x, y) {
  return [m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5]];
}

// Bounding box of the unit square [0,0]-[1,1] under ctm (PDF bottom-left coords)
function imageBbox(ctm) {
  const pts = [[0,0],[1,0],[0,1],[1,1]].map(([x,y]) => transformPt(ctm, x, y));
  return {
    x1: Math.min(...pts.map(p => p[0])),
    x2: Math.max(...pts.map(p => p[0])),
    y1: Math.min(...pts.map(p => p[1])),
    y2: Math.max(...pts.map(p => p[1]))
  };
}

function bboxFromMinMax(minMax, ctm) {
  if (!minMax || typeof minMax !== 'object') return null;
  const values = [minMax[0], minMax[1], minMax[2], minMax[3]];
  if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) {
    return null;
  }

  const [x1, y1, x2, y2] = values;
  const pts = [[x1, y1], [x2, y1], [x1, y2], [x2, y2]].map(([x, y]) => transformPt(ctm, x, y));
  return {
    x1: Math.min(...pts.map((p) => p[0])),
    x2: Math.max(...pts.map((p) => p[0])),
    y1: Math.min(...pts.map((p) => p[1])),
    y2: Math.max(...pts.map((p) => p[1]))
  };
}

function pathBbox(args, ctm) {
  return bboxFromMinMax(args?.[2], ctm);
}

function bboxInsideRegion(bbox, region) {
  return bbox.x1 >= region.x1 && bbox.x2 <= region.x2 &&
    bbox.y1 >= region.y1 && bbox.y2 <= region.y2;
}

function isColorOperator(fn) {
  const ops = pdfjsLib.OPS;
  return [
    ops.setFillRGBColor,
    ops.setStrokeRGBColor,
    ops.setFillCMYKColor,
    ops.setStrokeCMYKColor,
    ops.setFillColorN,
    ops.setStrokeColorN
  ].includes(fn);
}

function isFillColorOperator(fn) {
  const ops = pdfjsLib.OPS;
  return [
    ops.setFillRGBColor,
    ops.setFillCMYKColor,
    ops.setFillColorN
  ].includes(fn);
}

function isStrokeColorOperator(fn) {
  const ops = pdfjsLib.OPS;
  return [
    ops.setStrokeRGBColor,
    ops.setStrokeCMYKColor,
    ops.setStrokeColorN
  ].includes(fn);
}

function isImageOperator(fn) {
  const ops = pdfjsLib.OPS;
  return [
    ops.paintImageXObject,
    ops.paintImageXObjectRepeat,
    ops.paintJpegXObject,
    ops.paintInlineImageXObject,
    ops.paintInlineImageXObjectGroup,
    ops.paintImageMaskXObject
  ].includes(fn);
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function isValidJobId(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function enforceHttps(req, res, next) {
  if (!forceHttps || req.secure || req.hostname === 'localhost' || req.hostname === '127.0.0.1') {
    next();
    return;
  }

  res.redirect(308, `https://${req.headers.host}${req.originalUrl}`);
}

function securityHeaders(_req, res, next) {
  res.set({
    'Content-Security-Policy': [
      "default-src 'self'",
      "script-src 'self'",
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "frame-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'"
    ].join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin'
  });
  next();
}

function rateLimitUploads(req, res, next) {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const hits = (uploadHitsByIp.get(ip) || []).filter((timestamp) => now - timestamp < rateLimitWindowMs);

  if (hits.length >= rateLimitMax) {
    res.set('Retry-After', String(Math.ceil(rateLimitWindowMs / 1000)));
    res.status(429).json({ error: 'Too many upload attempts. Please try again later.' });
    return;
  }

  hits.push(now);
  uploadHitsByIp.set(ip, hits);
  cleanupRateLimitBuckets(now);
  next();
}

function cleanupRateLimitBuckets(now = Date.now()) {
  for (const [ip, hits] of uploadHitsByIp.entries()) {
    const freshHits = hits.filter((timestamp) => now - timestamp < rateLimitWindowMs);
    if (freshHits.length) {
      uploadHitsByIp.set(ip, freshHits);
    } else {
      uploadHitsByIp.delete(ip);
    }
  }
}

function scheduleResultCleanup(jobDir) {
  setTimeout(() => {
    fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }, resultTtlMs).unref();
}

async function cleanupExpiredResults() {
  const entries = await fs.readdir(resultDir, { withFileTypes: true }).catch(() => []);
  const now = Date.now();

  await Promise.all(entries
    .filter((entry) => entry.isDirectory())
    .map(async (entry) => {
      const jobDir = path.join(resultDir, entry.name);
      const stats = await fs.stat(jobDir).catch(() => null);
      if (stats && now - stats.mtimeMs > resultTtlMs) {
        await fs.rm(jobDir, { recursive: true, force: true }).catch(() => {});
      }
    }));
}

function isColorIgnored(r, g, b, ignoreColors, colorTolerance = 40) {
  if (!ignoreColors || ignoreColors.length === 0) return false;
  for (const ic of ignoreColors) {
    const tolerance = clampNumber(Number(ic.tolerance), 20, 80, colorTolerance);
    const thresholdSq = tolerance * tolerance;
    const dr = r - ic.r;
    const dg = g - ic.g;
    const db = b - ic.b;
    if (dr * dr + dg * dg + db * db < thresholdSq) {
      return true;
    }
  }
  return false;
}

function parseHexColor(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return null;

  const hex = match[1].length === 3
    ? match[1].split('').map((char) => char + char).join('')
    : match[1];

  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function rgbIsColored(r, g, b, ignoreColors, colorTolerance) {
  if (!rgbHasSaturation(r, g, b)) {
    return false;
  }

  return !isColorIgnored(r, g, b, ignoreColors, colorTolerance);
}

function rgbHasSaturation(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const channelSpread = max - min;
  const saturation = max === 0 ? 0 : channelSpread / max;

  return channelSpread > 8 && saturation >= 0.12;
}

function colorArgsAreColored(args, ignoreColors, colorTolerance) {
  const flat = args.flat ? args.flat(Infinity) : args;

  for (const value of flat) {
    const rgbColor = parseHexColor(value);
    if (rgbColor && rgbIsColored(rgbColor.r, rgbColor.g, rgbColor.b, ignoreColors, colorTolerance)) {
      return true;
    }
  }

  const nums = flat.filter((value) => typeof value === 'number');

  // Skip CMYK for simple ignore checking for now, just consider them colored if not grayscale
  if (nums.length >= 4) {
    const [c, m, y, k] = nums;
    if (Math.abs(c - m) > 0.01 || Math.abs(m - y) > 0.01 || Math.abs(c - y) > 0.01) {
      return true;
    }
  }

  if (nums.length >= 3) {
    let [r, g, b] = nums;
    // PDF color operators are typically 0.0 to 1.0
    if (r <= 1 && g <= 1 && b <= 1) {
      r *= 255; g *= 255; b *= 255;
    }
    if (rgbIsColored(r, g, b, ignoreColors, colorTolerance)) {
      return true;
    }
  }

  return false;
}

async function getPdfImages(page, args) {
  const images = [];
  const visited = new Set();

  async function visit(value) {
    if (!value) return;

    if (typeof value === 'string') {
      const image = await getNamedPdfImage(page, value);
      if (image) images.push(image);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        await visit(item);
      }
      return;
    }

    if (typeof value === 'object') {
      if (visited.has(value)) return;
      visited.add(value);

      if (isPdfImageData(value)) {
        images.push(value);
        return;
      }

      for (const item of Object.values(value)) {
        await visit(item);
      }
    }
  }

  await visit(args);
  return images;
}

function getNamedPdfImage(page, imageName) {
  return new Promise((resolve) => {
    const done = (image) => resolve(image || null);
    try {
      page.objs.get(imageName, done);
    } catch {
      try {
        page.commonObjs.get(imageName, done);
      } catch {
        resolve(null);
      }
    }
  });
}

function isPdfImageData(value) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    value.data &&
    typeof value.width === 'number' &&
    typeof value.height === 'number'
  );
}

function imageHasColor(image, ignoreColors, colorTolerance) {
  const data = image?.data;
  if (!data || data.length < 3) return false;
  if (image.kind === 1) return false;

  const stride = image.kind === 3 ? 4 : 3;
  const limit = Math.min(data.length, 2_000_000); // Check up to 2M values
  for (let i = 0; i < limit - 2; i += stride) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (rgbIsColored(r, g, b, ignoreColors, colorTolerance)) {
      return true;
    }
  }

  return false;
}

async function createNumberedSplits(inputBytes, pageColors) {
  const source = await PDFDocument.load(inputBytes);
  const blackWhiteDoc = await PDFDocument.create();
  const colorDoc = await PDFDocument.create();
  const blackWhiteFont = await blackWhiteDoc.embedFont(StandardFonts.Helvetica);
  const colorFont = await colorDoc.embedFont(StandardFonts.Helvetica);
  const blackWhitePages = [];
  const colorPages = [];

  for (let i = 0; i < source.getPageCount(); i += 1) {
    const isColor = pageColors[i];
    
    if (isColor) {
      const [copiedPage] = await colorDoc.copyPages(source, [i]);
      addPageNumber(copiedPage, i + 1, colorFont);
      colorDoc.addPage(copiedPage);
      colorPages.push(i + 1);
    } else {
      const [copiedPage] = await blackWhiteDoc.copyPages(source, [i]);
      addPageNumber(copiedPage, i + 1, blackWhiteFont);
      blackWhiteDoc.addPage(copiedPage);
      blackWhitePages.push(i + 1);
    }
  }

  const blackWhiteBytes = blackWhitePages.length
    ? await renderPagesToGrayscalePdf(inputBytes, blackWhitePages)
    : await blackWhiteDoc.save();

  return {
    blackWhiteBytes,
    colorBytes: await colorDoc.save(),
    blackWhitePages,
    colorPages
  };
}

async function renderPagesToGrayscalePdf(sourceBytes, pageNumbers) {
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(sourceBytes),
    disableWorker: true,
    useSystemFonts: true
  });
  const sourcePdf = await loadingTask.promise;
  const outputDoc = await PDFDocument.create();
  const font = await outputDoc.embedFont(StandardFonts.Helvetica);

  try {
    for (const pageNumber of pageNumbers) {
      const page = await sourcePdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const context = canvas.getContext('2d');

      await page.render({ canvasContext: context, viewport }).promise;
      grayscaleCanvas(context, canvas.width, canvas.height);

      const pngBytes = await canvas.encode('png');
      const image = await outputDoc.embedPng(pngBytes);
      const pdfViewport = page.getViewport({ scale: 1 });
      const outputPage = outputDoc.addPage([pdfViewport.width, pdfViewport.height]);

      outputPage.drawImage(image, {
        x: 0,
        y: 0,
        width: pdfViewport.width,
        height: pdfViewport.height
      });
      addPageNumber(outputPage, pageNumber, font);
      page.cleanup();
    }
  } finally {
    await sourcePdf.destroy();
  }

  return await outputDoc.save();
}

function grayscaleCanvas(context, width, height) {
  const imageData = context.getImageData(0, 0, width, height);
  const { data } = imageData;

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    data[i] = gray;
    data[i + 1] = gray;
    data[i + 2] = gray;
  }

  context.putImageData(imageData, 0, 0);
}

function addPageNumber(page, pageNumber, font) {
  const { width } = page.getSize();
  const text = String(pageNumber);
  const fontSize = 10;
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  page.drawText(text, {
    x: (width - textWidth) / 2,
    y: 18,
    size: fontSize,
    font,
    color: rgb(0, 0, 0)
  });
}

function safeBaseName(fileName) {
  return path
    .basename(fileName, path.extname(fileName))
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'document';
}
