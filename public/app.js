import * as pdfjsLib from '/vendor/pdfjs/pdf.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.mjs';

// Page navigation
const page1 = document.getElementById('page1');
const page2 = document.getElementById('page2');
const page3 = document.getElementById('page3');
const goToPage2Btn = document.getElementById('goToPage2Btn');
const startOverBtn = document.getElementById('startOverBtn');
const featuresMenuBtn = document.getElementById('featuresMenuBtn');
const featuresDropdown = document.getElementById('featuresDropdown');
const pricingMenuBtn = document.getElementById('pricingMenuBtn');
const pricingDropdown = document.getElementById('pricingDropdown');
const benefitsMenuBtn = document.getElementById('benefitsMenuBtn');
const benefitsSection = document.getElementById('benefits');
const mobileNavToggle = document.getElementById('mobileNavToggle');
const primaryNav = document.getElementById('primaryNav');

// Upload UI elements
const input = document.getElementById('pdfInput');
const uploadPrompt = document.getElementById('uploadPrompt');
const fileSelectedCard = document.getElementById('fileSelectedCard');
const fileName = document.getElementById('fileName');
const fileSizeSpan = document.getElementById('fileSize');
const pageCountSpan = document.getElementById('pageCountSpan');
const removeFileBtn = document.getElementById('removeFileBtn');
const processButton = document.getElementById('processButton');

// Exclude Region UI elements
const noPdfMessage = document.getElementById('noPdfMessage');
const pdfPreviewContainer = document.getElementById('pdfPreviewContainer');
const pdfCanvas = document.getElementById('pdfCanvas');
const selectionOverlay = document.getElementById('selectionOverlay');
const canvasWrapper = document.getElementById('canvasWrapper');
const openExcludeRegionBtn = document.getElementById('openExcludeRegionBtn');
const doneExcludeRegionBtn = document.getElementById('doneExcludeRegionBtn');
const excludeRegionStatus = document.getElementById('excludeRegionStatus');
const excludeRegionHint = document.getElementById('excludeRegionHint');
const excludedColorsPreview = document.getElementById('excludedColorsPreview');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');
const pageNumSpan = document.getElementById('pageNum');
const modeSelectBtn = document.getElementById('modeSelectBtn');
const clearRegionBtn = document.getElementById('clearRegionBtn');

// Processing and Results UI
const processingState = document.getElementById('processingState');
const statusBox = document.getElementById('status');
const processingDetail = document.getElementById('processingDetail');
const queueMeta = document.getElementById('queueMeta');
const notificationPrompt = document.getElementById('notificationPrompt');
const enableNotificationsBtn = document.getElementById('enableNotificationsBtn');
const processingRetryBtn = document.getElementById('processingRetryBtn');
const results = document.getElementById('results');
const origPageCountBadge = document.getElementById('origPageCountBadge');

const bwCount = document.getElementById('bwCount');
const bwPages = document.getElementById('bwPages');
const bwLink = document.getElementById('bwLink');

const colorCount = document.getElementById('colorCount');
const colorPages = document.getElementById('colorPages');
const colorLink = document.getElementById('colorLink');

// Mode variables
let currentPdf = null;
let currentPageNum = 1;
let isSelectMode = true;
let isEyedropMode = false;
let excludedRegion = null;
let dragStart = null;
let dragCurrent = null;
let ignoreColors = []; // Array of {r,g,b,label?}
let colorPickPageNum = 1;
let queuePollTimer = null;

// New UI Elements
const eyedropperBtn = document.getElementById('eyedropperBtn');
const pickedColorsContainer = document.getElementById('pickedColors');
const noColorsText = document.getElementById('noColorsText');
const colorPickPreview = document.getElementById('colorPickPreview');
const closeColorPickBtn = document.getElementById('closeColorPickBtn');
const colorPickCanvas = document.getElementById('colorPickCanvas');
const colorPickOverlay = document.getElementById('colorPickOverlay');
const colorSampleHud = document.getElementById('colorSampleHud');
const colorSampleSwatch = document.getElementById('colorSampleSwatch');
const colorSampleRgb = document.getElementById('colorSampleRgb');
const colorSampleName = document.getElementById('colorSampleName');
const colorCursorMarker = document.getElementById('colorCursorMarker');
const pickerLiveValue = document.getElementById('pickerLiveValue');
const colorPickerExcludedColors = document.getElementById('colorPickerExcludedColors');
const colorPrevPageBtn = document.getElementById('colorPrevPageBtn');
const colorNextPageBtn = document.getElementById('colorNextPageBtn');
const colorPageNumSpan = document.getElementById('colorPageNum');
const previewModeTitle = document.getElementById('previewModeTitle');
const previewModeHint = document.getElementById('previewModeHint');
const previewModal = document.getElementById('previewModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalTitle = document.getElementById('modalTitle');
const pdfIframe = document.getElementById('pdfIframe');
const printCostBtn = document.getElementById('printCostBtn');
const costModal = document.getElementById('costModal');
const closeCostModalBtn = document.getElementById('closeCostModalBtn');
const costSettingsForm = document.getElementById('costSettingsForm');
const bwPageCostInput = document.getElementById('bwPageCostInput');
const colorPageCostInput = document.getElementById('colorPageCostInput');
const savingsNotice = document.getElementById('savingsNotice');
const savingsAmount = document.getElementById('savingsAmount');
const printCostBreakdown = document.getElementById('printCostBreakdown');
const origPrintCostBadge = document.getElementById('origPrintCostBadge');
const colorPrintCostBadge = document.getElementById('colorPrintCostBadge');
const bwPrintCostBadge = document.getElementById('bwPrintCostBadge');
const legacyPrintCostStorageKey = 'splitsmart-print-costs';
const printCostStorageKey = 'smartsplit-print-costs';
let latestCostSummary = null;

function readPrintCosts() {
  return {
    bw: Number.parseFloat(bwPageCostInput?.value || ''),
    color: Number.parseFloat(colorPageCostInput?.value || '')
  };
}

function hasValidPrintCosts(costs = readPrintCosts()) {
  return Number.isFinite(costs.bw) && costs.bw >= 0 &&
    Number.isFinite(costs.color) && costs.color >= 0 &&
    costs.color >= costs.bw;
}

function formatMoney(value) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function savePrintCosts() {
  const costs = readPrintCosts();
  if (!Number.isFinite(costs.bw) || !Number.isFinite(costs.color)) return;
  localStorage.setItem(printCostStorageKey, JSON.stringify(costs));
}

function loadPrintCosts() {
  try {
    const storedRaw = localStorage.getItem(printCostStorageKey) || localStorage.getItem(legacyPrintCostStorageKey);
    const stored = JSON.parse(storedRaw || 'null');
    if (!stored) return;
    if (Number.isFinite(stored.bw)) bwPageCostInput.value = stored.bw;
    if (Number.isFinite(stored.color)) colorPageCostInput.value = stored.color;
    if (!localStorage.getItem(printCostStorageKey)) savePrintCosts();
  } catch {
    localStorage.removeItem(printCostStorageKey);
    localStorage.removeItem(legacyPrintCostStorageKey);
  }
}

function openCostModal() {
  if (!costModal) return;
  costModal.style.display = 'flex';
  document.body.classList.add('modal-open');
  setTimeout(() => bwPageCostInput?.focus(), 0);
}

function closeCostModal() {
  if (!costModal) return;
  costModal.style.display = 'none';
  document.body.classList.remove('modal-open');
}

function updateSavingsNotice() {
  if (!latestCostSummary) return;

  const costs = readPrintCosts();
  if (!hasValidPrintCosts(costs)) {
    if (savingsNotice) savingsNotice.hidden = true;
    [origPrintCostBadge, colorPrintCostBadge, bwPrintCostBadge].forEach((badge) => {
      if (badge) badge.hidden = true;
    });
    return;
  }

  const allColorCost = latestCostSummary.totalPages * costs.color;
  const colorPrintCost = latestCostSummary.colorPages * costs.color;
  const bwPrintCost = latestCostSummary.bwPages * costs.bw;
  const splitCost = colorPrintCost + bwPrintCost;
  const saved = Math.max(0, allColorCost - splitCost);

  if (origPrintCostBadge) {
    origPrintCostBadge.textContent = `Color print: ${formatMoney(allColorCost)}`;
    origPrintCostBadge.hidden = false;
  }
  if (colorPrintCostBadge) {
    colorPrintCostBadge.textContent = `Print cost: ${formatMoney(colorPrintCost)}`;
    colorPrintCostBadge.hidden = latestCostSummary.colorPages === 0;
  }
  if (bwPrintCostBadge) {
    bwPrintCostBadge.textContent = `Print cost: ${formatMoney(bwPrintCost)}`;
    bwPrintCostBadge.hidden = latestCostSummary.bwPages === 0;
  }
  if (savingsNotice) {
    savingsAmount.textContent = formatMoney(saved);
    printCostBreakdown.textContent = `Split print cost: ${formatMoney(splitCost)} vs all-color cost: ${formatMoney(allColorCost)}.`;
    savingsNotice.hidden = false;
  }
}

loadPrintCosts();

function setFeaturesMenuOpen(isOpen) {
  if (!featuresMenuBtn || !featuresDropdown) return;
  featuresDropdown.hidden = !isOpen;
  featuresMenuBtn.setAttribute('aria-expanded', String(isOpen));
}

function setPricingMenuOpen(isOpen) {
  if (!pricingMenuBtn || !pricingDropdown) return;
  pricingDropdown.hidden = !isOpen;
  pricingMenuBtn.setAttribute('aria-expanded', String(isOpen));
}

function closeNavMenus() {
  setFeaturesMenuOpen(false);
  setPricingMenuOpen(false);
}

function setMobileNavOpen(isOpen) {
  if (!mobileNavToggle || !primaryNav) return;
  primaryNav.classList.toggle('is-open', isOpen);
  mobileNavToggle.classList.toggle('is-open', isOpen);
  mobileNavToggle.setAttribute('aria-expanded', String(isOpen));
  mobileNavToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  if (!isOpen) closeNavMenus();
}

function showPage1() {
  page1.classList.add('active');
  page1.style.display = 'block';
  page2.classList.remove('active');
  page2.style.display = 'none';
  if (page3) {
    page3.classList.remove('active');
    page3.style.display = 'none';
  }
}

function scrollToBenefits() {
  closeNavMenus();
  setMobileNavOpen(false);
  showPage1();
  requestAnimationFrame(() => {
    benefitsSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

mobileNavToggle?.addEventListener('click', (event) => {
  event.stopPropagation();
  setMobileNavOpen(!primaryNav.classList.contains('is-open'));
});

printCostBtn?.addEventListener('click', openCostModal);
closeCostModalBtn?.addEventListener('click', closeCostModal);
costModal?.addEventListener('click', (event) => {
  if (event.target === costModal) closeCostModal();
});
costSettingsForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  savePrintCosts();
  updateSavingsNotice();
  closeCostModal();
});
[bwPageCostInput, colorPageCostInput].forEach((field) => {
  field?.addEventListener('input', updateSavingsNotice);
});

featuresMenuBtn?.addEventListener('click', (event) => {
  event.stopPropagation();
  const isOpen = featuresDropdown && !featuresDropdown.hidden;
  closeNavMenus();
  setFeaturesMenuOpen(!isOpen);
});

pricingMenuBtn?.addEventListener('click', (event) => {
  event.stopPropagation();
  const isOpen = pricingDropdown && !pricingDropdown.hidden;
  closeNavMenus();
  setPricingMenuOpen(!isOpen);
});

benefitsMenuBtn?.addEventListener('click', (event) => {
  event.preventDefault();
  scrollToBenefits();
});

document.addEventListener('click', (event) => {
  const clickedFeatures = featuresMenuBtn && featuresDropdown && (featuresMenuBtn.contains(event.target) || featuresDropdown.contains(event.target));
  const clickedPricing = pricingMenuBtn && pricingDropdown && (pricingMenuBtn.contains(event.target) || pricingDropdown.contains(event.target));
  const clickedMobileNav = mobileNavToggle && primaryNav && (mobileNavToggle.contains(event.target) || primaryNav.contains(event.target));
  if (!clickedFeatures && !clickedPricing) closeNavMenus();
  if (!clickedMobileNav) setMobileNavOpen(false);
});

// Navigation logic
goToPage2Btn.addEventListener('click', () => {
  page1.classList.remove('active');
  page2.classList.add('active');
  page2.style.display = 'block';
  page1.style.display = 'none';
});

startOverBtn.addEventListener('click', () => {
  location.reload();
});

processingRetryBtn.addEventListener('click', () => {
  location.reload();
});

enableNotificationsBtn.addEventListener('click', async () => {
  if (!('Notification' in window)) {
    notificationPrompt.hidden = true;
    return;
  }

  const permission = await Notification.requestPermission();
  if (permission === 'granted' || permission === 'denied') {
    notificationPrompt.hidden = true;
  }
});

// Selection mode logic
clearRegionBtn?.addEventListener('click', () => {
  excludedRegion = null;
  updateExcludeRegionState();
  drawOverlay();
});

function setMode(select) {
  isSelectMode = select;
  isEyedropMode = false;
  if (select) {
    if(modeSelectBtn) modeSelectBtn.classList.add('active');
    eyedropperBtn.classList.remove('active');
    selectionOverlay.style.cursor = 'crosshair';
    if (previewModeTitle) previewModeTitle.textContent = 'Drag to select';
    if (previewModeHint) previewModeHint.textContent = 'Logo, header, watermark, or any area you want to exclude.';
  }
}

modeSelectBtn?.addEventListener('click', () => setMode(true));
eyedropperBtn.addEventListener('click', async () => {
  if (!currentPdf) return;
  if (colorPickPreview.style.display === 'none') {
    await openColorPicker();
  } else {
    closeColorPicker();
  }
});
closeColorPickBtn.addEventListener('click', closeColorPicker);
openExcludeRegionBtn.addEventListener('click', openExcludeRegionPicker);
doneExcludeRegionBtn.addEventListener('click', closeExcludeRegionPicker);
colorPrevPageBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
colorNextPageBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
prevPageBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
nextPageBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
setMode(true);

async function openColorPicker() {
  colorPickPreview.style.display = 'block';
  document.body.classList.add('modal-open');
  eyedropperBtn.classList.add('active');
  colorPickPageNum = currentPageNum;
  renderExcludedColorsPreview();
  await renderColorPickPage(colorPickPageNum);
}

function closeColorPicker() {
  colorPickPreview.style.display = 'none';
  document.body.classList.remove('modal-open');
  eyedropperBtn.classList.remove('active');
  hideColorSampleHud();
}

async function openExcludeRegionPicker() {
  if (!currentPdf) return;
  closeColorPicker();
  pdfPreviewContainer.style.display = 'block';
  document.body.classList.add('modal-open');
  setMode(true);
  renderExcludedColorsPreview();
  await renderPage(currentPageNum);
}

function closeExcludeRegionPicker() {
  pdfPreviewContainer.style.display = 'none';
  document.body.classList.remove('modal-open');
  dragStart = null;
  dragCurrent = null;
}

function updateExcludeRegionState() {
  if (excludedRegion) {
    openExcludeRegionBtn.textContent = 'Edit Exclude Region';
    excludeRegionStatus.textContent = 'Region selected';
    excludeRegionHint.textContent = 'An exclusion region is selected. Open the preview to adjust or clear it.';
  } else {
    openExcludeRegionBtn.textContent = 'Select Exclude Region';
    excludeRegionStatus.textContent = 'No region selected';
    excludeRegionHint.textContent = currentPdf
      ? 'Open the preview only if you want to ignore a logo, header, watermark, or selected area.'
      : 'Upload a PDF to draw an exclusion region.';
  }
  renderExcludedColorsPreview();
}

function renderExcludedColorsPreview() {
  const previewTargets = [excludedColorsPreview, colorPickerExcludedColors].filter(Boolean);
  if (previewTargets.length === 0) return;

  const html = ignoreColors.length === 0
    ? `
      <span class="excluded-colors-empty">No ignored colors selected.</span>
    `
    : `
    <div class="excluded-colors-label">Ignored colors</div>
    <div class="excluded-color-list">
      ${ignoreColors.map((color) => {
        const hex = rgbToHex(color.r, color.g, color.b);
        return `
          <div class="excluded-color-pill" title="${hex} | tolerance ${color.tolerance}">
            <span class="excluded-color-dot" style="background:${hex}"></span>
            <span>${hex}</span>
          </div>
        `;
      }).join('')}
    </div>
  `;

  previewTargets.forEach((target) => {
    target.innerHTML = html;
  });
}

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeNavMenus();
    setMobileNavOpen(false);
    closeCostModal();
  }
  if (event.key === 'Escape' && colorPickPreview.style.display !== 'none') {
    closeColorPicker();
  }
  if (event.key === 'Escape' && pdfPreviewContainer.style.display !== 'none') {
    closeExcludeRegionPicker();
  }
});

function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();
}

function getColorName(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const spread = max - min;
  const brightness = max / 255;

  if (brightness < 0.12) return 'Black';
  if (brightness > 0.92 && spread < 18) return 'White';
  if (spread < 14) return 'Gray';

  const hue = rgbToHue(r, g, b);
  if (hue < 15 || hue >= 345) return 'Red';
  if (hue < 45) return 'Orange';
  if (hue < 70) return 'Yellow';
  if (hue < 165) return 'Green';
  if (hue < 195) return 'Cyan';
  if (hue < 255) return 'Blue';
  if (hue < 285) return 'Purple';
  if (hue < 345) return 'Pink';
  return 'Color';
}

function rgbToHue(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  if (delta === 0) return 0;
  let hue;
  if (max === rn) {
    hue = ((gn - bn) / delta) % 6;
  } else if (max === gn) {
    hue = (bn - rn) / delta + 2;
  } else {
    hue = (rn - gn) / delta + 4;
  }
  return (hue * 60 + 360) % 360;
}

function parsePdfColor(value) {
  if (typeof value === 'string') {
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

  if (Array.isArray(value) && value.length >= 3 && value.every((item) => typeof item === 'number')) {
    let [r, g, b] = value;
    if (r <= 1 && g <= 1 && b <= 1) {
      r *= 255;
      g *= 255;
      b *= 255;
    }
    return { r, g, b };
  }

  return null;
}

function normalizeColor(color, label = 'Picked') {
  return {
    r: Math.min(255, Math.max(0, Math.round(color.r))),
    g: Math.min(255, Math.max(0, Math.round(color.g))),
    b: Math.min(255, Math.max(0, Math.round(color.b))),
    label,
    tolerance: Math.min(80, Math.max(20, Number(color.tolerance) || 40))
  };
}

function colorDistanceSq(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function addIgnoredColor(color, label = 'Picked') {
  const normalized = normalizeColor(color, label);
  const existing = ignoreColors.find((item) => colorDistanceSq(item, normalized) < item.tolerance * item.tolerance);

  if (existing) {
    if (existing.label === 'Picked' && label !== 'Picked') {
      existing.label = label;
    }
    return false;
  }

  ignoreColors.push(normalized);
  return true;
}

function matMul(m, a) {
  return [
    a[0] * m[0] + a[1] * m[2],
    a[0] * m[1] + a[1] * m[3],
    a[2] * m[0] + a[3] * m[2],
    a[2] * m[1] + a[3] * m[3],
    a[4] * m[0] + a[5] * m[2] + m[4],
    a[4] * m[1] + a[5] * m[3] + m[5]
  ];
}

function transformPt(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
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

function pointInBbox(point, bbox, tolerance = 3) {
  return point.x >= bbox.x1 - tolerance && point.x <= bbox.x2 + tolerance &&
    point.y >= bbox.y1 - tolerance && point.y <= bbox.y2 + tolerance;
}

async function getVectorColorsAtPoint(canvasX, canvasY) {
  if (!currentPdf) return [];

  const page = await currentPdf.getPage(currentPageNum);
  const operatorList = await page.getOperatorList();
  const ops = pdfjsLib.OPS;
  const point = { x: canvasX, y: pdfCanvas.height - canvasY };
  const hits = [];
  const graphicsStateStack = [];

  let ctm = [1, 0, 0, 1, 0, 0];
  let fillColor = null;
  let strokeColor = null;

  for (let i = 0; i < operatorList.fnArray.length; i += 1) {
    const fn = operatorList.fnArray[i];
    const args = operatorList.argsArray[i] || [];

    if (fn === ops.transform) {
      ctm = matMul(ctm, args);
    } else if (fn === ops.save) {
      graphicsStateStack.push({ ctm: [...ctm], fillColor, strokeColor });
    } else if (fn === ops.restore && graphicsStateStack.length) {
      const state = graphicsStateStack.pop();
      ctm = state.ctm;
      fillColor = state.fillColor;
      strokeColor = state.strokeColor;
    } else if (fn === ops.setFillRGBColor || fn === ops.setFillColorN) {
      fillColor = parsePdfColor(args[0] ?? args);
    } else if (fn === ops.setStrokeRGBColor || fn === ops.setStrokeColorN) {
      strokeColor = parsePdfColor(args[0] ?? args);
    } else if (fn === ops.constructPath) {
      const bbox = bboxFromMinMax(args[2], ctm);
      if (bbox && pointInBbox(point, bbox)) {
        if (fillColor) hits.push({ ...fillColor, label: 'Fill' });
        if (strokeColor) hits.push({ ...strokeColor, label: 'Border' });
      }
    }
  }

  page.cleanup();
  return hits;
}

async function addIgnoredColorFromPoint(clientX, clientY) {
  const sample = sampleColorAtPoint(clientX, clientY);
  if (!sample) return;

  if (sample.a > 0) {
    addIgnoredColor({ r: sample.r, g: sample.g, b: sample.b }, sample.name);
    renderPickedColors();
    renderExcludedColorsPreview();
  }
}

function sampleColorAtPoint(clientX, clientY) {
  const rect = colorPickOverlay.getBoundingClientRect();
  const scaleX = colorPickCanvas.width / rect.width;
  const scaleY = colorPickCanvas.height / rect.height;
  const x = Math.floor((clientX - rect.left) * scaleX);
  const y = Math.floor((clientY - rect.top) * scaleY);

  if (x < 0 || y < 0 || x >= colorPickCanvas.width || y >= colorPickCanvas.height) {
    return null;
  }

  const pixel = colorPickCanvas.getContext('2d').getImageData(x, y, 1, 1).data;
  const sample = {
    r: pixel[0],
    g: pixel[1],
    b: pixel[2],
    a: pixel[3]
  };
  sample.hex = rgbToHex(sample.r, sample.g, sample.b);
  sample.name = getColorName(sample.r, sample.g, sample.b);
  sample.canvasX = x;
  sample.canvasY = y;
  sample.uiX = clientX - rect.left;
  sample.uiY = clientY - rect.top;
  sample.rect = rect;
  return sample;
}

function updateColorSampleHud(clientX, clientY) {
  const sample = sampleColorAtPoint(clientX, clientY);
  if (!sample || sample.a === 0) {
    hideColorSampleHud();
    return;
  }

  colorSampleSwatch.style.backgroundColor = sample.hex;
  colorSampleRgb.textContent = `rgb(${sample.r}, ${sample.g}, ${sample.b})`;
  colorSampleName.textContent = sample.name;
  pickerLiveValue.textContent = `${sample.name} ${sample.hex}`;

  colorSampleHud.hidden = false;
  colorCursorMarker.hidden = false;

  const hudWidth = Math.max(120, Math.min(250, sample.rect.width - 24));
  const maxHudX = Math.max(12, sample.rect.width - hudWidth - 12);
  colorSampleHud.style.width = `${hudWidth}px`;
  const hudX = Math.min(Math.max(sample.uiX - hudWidth / 2, 12), maxHudX);
  const hudY = Math.max(sample.uiY - 120, 12);

  colorSampleHud.style.left = `${hudX}px`;
  colorSampleHud.style.top = `${hudY}px`;
  colorCursorMarker.style.left = `${sample.uiX - 18}px`;
  colorCursorMarker.style.top = `${sample.uiY - 60}px`;
}

function hideColorSampleHud() {
  colorSampleHud.hidden = true;
  colorCursorMarker.hidden = true;
}

function getOverlayPoint(e) {
  const r = selectionOverlay.getBoundingClientRect();
  return {
    x: Math.min(Math.max(e.clientX - r.left, 0), r.width),
    y: Math.min(Math.max(e.clientY - r.top, 0), r.height),
    rect: r
  };
}

function renderPickedColors() {
  if (ignoreColors.length === 0) {
    noColorsText.style.display = 'block';
    pickedColorsContainer.innerHTML = '';
    pickedColorsContainer.appendChild(noColorsText);
    return;
  }
  noColorsText.style.display = 'none';
  pickedColorsContainer.innerHTML = '';
  
  const list = document.createElement('div');
  list.className = 'picked-color-chips';
  
  ignoreColors.forEach((color, idx) => {
    const item = document.createElement('div');
    item.className = 'picked-color-chip';
    
    const hex = rgbToHex(color.r, color.g, color.b);
    
    item.innerHTML = `
      <button type="button" class="remove-color-btn chip-remove" title="Remove">&times;</button>
      <div class="round-swatch" style="background-color: ${hex}" aria-hidden="true"></div>
      <div class="chip-meta">
        <strong>${hex}</strong>
        <span>RGB ${color.r}, ${color.g}, ${color.b}</span>
      </div>
      <div class="chip-tolerance">
        <label>Tolerance <strong>${color.tolerance}</strong></label>
        <input class="chip-tolerance-slider" type="range" min="20" max="80" step="10" value="${color.tolerance}">
      </div>
    `;
    
    item.querySelector('.remove-color-btn').addEventListener('click', () => {
      ignoreColors.splice(idx, 1);
      renderPickedColors();
      renderExcludedColorsPreview();
    });
    item.querySelector('.chip-tolerance-slider').addEventListener('input', (event) => {
      color.tolerance = Number(event.target.value);
      item.querySelector('.chip-tolerance strong').textContent = color.tolerance;
      renderExcludedColorsPreview();
    });
    
    list.appendChild(item);
  });
  
  pickedColorsContainer.appendChild(list);
}

// Canvas overlay logic
selectionOverlay.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  selectionOverlay.setPointerCapture(e.pointerId);
  const point = getOverlayPoint(e);
  dragStart = { x: point.x, y: point.y };
  dragCurrent = { ...dragStart };
});

colorPickOverlay.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  addIgnoredColorFromPoint(e.clientX, e.clientY);
});

colorPickOverlay.addEventListener('pointermove', (e) => {
  updateColorSampleHud(e.clientX, e.clientY);
});

colorPickOverlay.addEventListener('pointerleave', hideColorSampleHud);

selectionOverlay.addEventListener('pointermove', (e) => {
  if (!dragStart || isEyedropMode) return;
  e.preventDefault();
  const point = getOverlayPoint(e);
  dragCurrent = { x: point.x, y: point.y };
  drawOverlay();
});

selectionOverlay.addEventListener('pointerup', (e) => {
  if (!dragStart || isEyedropMode) return;
  const point = getOverlayPoint(e);
  const r = point.rect;
  const end = { x: point.x, y: point.y };
  const w = Math.abs(end.x - dragStart.x);
  const h = Math.abs(end.y - dragStart.y);
  if (w > 5 && h > 5) {
    excludedRegion = {
      x: Math.min(dragStart.x, end.x) / r.width,
      y: Math.min(dragStart.y, end.y) / r.height,
      width: w / r.width,
      height: h / r.height
    };
    updateExcludeRegionState();
  }
  dragStart = null;
  dragCurrent = null;
  if (selectionOverlay.hasPointerCapture(e.pointerId)) {
    selectionOverlay.releasePointerCapture(e.pointerId);
  }
  drawOverlay();
});

selectionOverlay.addEventListener('pointercancel', (e) => {
  dragStart = null;
  dragCurrent = null;
  if (selectionOverlay.hasPointerCapture(e.pointerId)) {
    selectionOverlay.releasePointerCapture(e.pointerId);
  }
  drawOverlay();
});

function drawOverlay() {
  const ctx = selectionOverlay.getContext('2d');
  const W = selectionOverlay.width;
  const H = selectionOverlay.height;
  ctx.clearRect(0, 0, W, H);

  function drawRect(nx, ny, nw, nh, fill, stroke) {
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.fillRect(nx * W, ny * H, nw * W, nh * H);
    ctx.strokeRect(nx * W, ny * H, nw * W, nh * H);
    ctx.restore();
  }

  if (excludedRegion) {
    drawRect(excludedRegion.x, excludedRegion.y, excludedRegion.width, excludedRegion.height,
      'rgba(255,80,0,0.18)', 'rgba(255,80,0,0.85)');
  }

  if (dragStart && dragCurrent && !isEyedropMode) {
    const r = selectionOverlay.getBoundingClientRect();
    const rw = r.width || 1;
    const rh = r.height || 1;
    const x = Math.min(dragStart.x, dragCurrent.x) / rw;
    const y = Math.min(dragStart.y, dragCurrent.y) / rh;
    const w = Math.abs(dragCurrent.x - dragStart.x) / rw;
    const h = Math.abs(dragCurrent.y - dragStart.y) / rh;
    drawRect(x, y, w, h, 'rgba(255,80,0,0.10)', 'rgba(255,80,0,0.6)');
  }
}

function formatBytes(bytes, decimals = 1) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// File input change logic
input.addEventListener('change', async () => {
  const file = input.files[0];
  if (file) {
    fileName.textContent = file.name;
    fileSizeSpan.textContent = formatBytes(file.size);
    processButton.disabled = false;
    
    uploadPrompt.style.display = 'none';
    fileSelectedCard.style.display = 'flex';

    try {
      const fileReader = new FileReader();
      fileReader.onload = async function() {
        const typedarray = new Uint8Array(this.result);
        currentPdf = await pdfjsLib.getDocument(typedarray).promise;
        currentPageNum = 1;
        pageCountSpan.textContent = currentPdf.numPages;
        origPageCountBadge.textContent = `${currentPdf.numPages} pages`;
        
        noPdfMessage.style.display = 'block';
        pdfPreviewContainer.style.display = 'none';
        eyedropperBtn.style.display = 'inline-flex';
        openExcludeRegionBtn.style.display = 'inline-flex';
        updateExcludeRegionState();
      };
      fileReader.readAsArrayBuffer(file);
    } catch (e) {
      console.error('Error rendering PDF preview:', e);
      resetFileInput();
    }
  } else {
    resetFileInput();
  }
});

removeFileBtn.addEventListener('click', () => {
  input.value = '';
  resetFileInput();
});

function resetFileInput() {
  processButton.disabled = true;
  uploadPrompt.style.display = 'block';
  fileSelectedCard.style.display = 'none';
  noPdfMessage.style.display = 'block';
  pdfPreviewContainer.style.display = 'none';
  eyedropperBtn.style.display = 'none';
  openExcludeRegionBtn.style.display = 'none';
  closeColorPicker();
  closeExcludeRegionPicker();
  currentPdf = null;
  excludedRegion = null;
  ignoreColors = [];
  renderPickedColors();
  updateExcludeRegionState();
}

async function renderPage(num) {
  if (!currentPdf) return;
  const page = await currentPdf.getPage(num);
  const baseViewport = page.getViewport({ scale: 1.0 });
  let viewport = baseViewport;

  if (pdfPreviewContainer.style.display !== 'none') {
    const wrapper = pdfCanvas.closest('.canvas-wrapper');
    const isCompact = window.matchMedia('(max-width: 768px)').matches;
    const horizontalChrome = isCompact ? 28 : 156;
    const verticalChrome = isCompact ? 90 : 120;
    const availableWidth = Math.max(260, (wrapper?.clientWidth || baseViewport.width) - horizontalChrome);
    const availableHeight = Math.max(260, (wrapper?.clientHeight || baseViewport.height) - verticalChrome);
    const scale = Math.max(0.2, Math.min(1.35, availableWidth / baseViewport.width, availableHeight / baseViewport.height));
    viewport = page.getViewport({ scale });
  }

  pdfCanvas.width = viewport.width;
  pdfCanvas.height = viewport.height;
  selectionOverlay.width = viewport.width;
  selectionOverlay.height = viewport.height;

  await page.render({ canvasContext: pdfCanvas.getContext('2d'), viewport }).promise;
  pageNumSpan.textContent = num;
  prevPageBtn.disabled = num <= 1;
  nextPageBtn.disabled = num >= currentPdf.numPages;
  drawOverlay();
}

async function renderColorPickPage(num) {
  if (!currentPdf) return;
  const page = await currentPdf.getPage(num);
  const baseViewport = page.getViewport({ scale: 1.0 });
  const wrapper = colorPickCanvas.closest('.color-canvas-wrapper');
  const isCompact = window.matchMedia('(max-width: 768px)').matches;
  const horizontalChrome = isCompact ? 28 : 156;
  const verticalChrome = isCompact ? 90 : 42;
  const availableWidth = Math.max(260, (wrapper?.clientWidth || baseViewport.width) - horizontalChrome);
  const availableHeight = Math.max(260, (wrapper?.clientHeight || baseViewport.height) - verticalChrome);
  const scale = Math.max(0.2, Math.min(1.35, availableWidth / baseViewport.width, availableHeight / baseViewport.height));
  const viewport = page.getViewport({ scale });

  colorPickCanvas.width = viewport.width;
  colorPickCanvas.height = viewport.height;
  colorPickOverlay.width = viewport.width;
  colorPickOverlay.height = viewport.height;

  await page.render({ canvasContext: colorPickCanvas.getContext('2d'), viewport }).promise;
  colorPageNumSpan.textContent = num;
  colorPrevPageBtn.disabled = num <= 1;
  colorNextPageBtn.disabled = num >= currentPdf.numPages;
  hideColorSampleHud();
}

prevPageBtn.addEventListener('click', async () => {
  if (currentPageNum <= 1) return;
  currentPageNum--;
  await renderPage(currentPageNum);
});

nextPageBtn.addEventListener('click', async () => {
  if (!currentPdf || currentPageNum >= currentPdf.numPages) return;
  currentPageNum++;
  await renderPage(currentPageNum);
});

colorPrevPageBtn.addEventListener('click', async () => {
  if (colorPickPageNum <= 1) return;
  colorPickPageNum--;
  await renderColorPickPage(colorPickPageNum);
});

colorNextPageBtn.addEventListener('click', async () => {
  if (!currentPdf || colorPickPageNum >= currentPdf.numPages) return;
  colorPickPageNum++;
  await renderColorPickPage(colorPickPageNum);
});

// Processing logic
processButton.addEventListener('click', async () => {
  if (!input.files[0]) return;
  clearQueuePoll();

  // Move to page 3
  page2.classList.remove('active');
  page2.style.display = 'none';
  page3.classList.add('active');
  page3.style.display = 'block';
  
  processingState.style.display = 'block';
  results.hidden = true;
  resetProcessingState();

  const body = new FormData();
  body.append('pdf', input.files[0]);
  if (excludedRegion) {
    body.append('excludeRegion', JSON.stringify(excludedRegion));
  }
  if (ignoreColors.length > 0) {
    body.append('ignoreColors', JSON.stringify(ignoreColors));
  }

  try {
    const response = await fetch('/api/process', {
      method: 'POST',
      body
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Processing failed.');
    }

    if (data.jobId && data.status) {
      trackQueuedJob(data);
    } else {
      showResults(data);
    }
  } catch (error) {
    showProcessingError(error.message);
  }
});

function resetProcessingState() {
  statusBox.textContent = 'Analyzing PDF...';
  statusBox.classList.remove('error');
  processingDetail.textContent = 'Please wait while we split your document into color and B&W streams.';
  queueMeta.hidden = true;
  queueMeta.textContent = '';
  notificationPrompt.hidden = true;
  processingRetryBtn.hidden = true;
  const spinner = processingState.querySelector('.spinner');
  if (spinner) spinner.style.display = 'block';
}

function trackQueuedJob(initialStatus) {
  handleJobStatus(initialStatus);
  maybeShowNotificationPrompt(initialStatus);

  if (initialStatus.status === 'queued' || initialStatus.status === 'processing') {
    pollJobStatus(initialStatus.jobId);
  }
}

function maybeShowNotificationPrompt(jobStatus) {
  if (jobStatus.status !== 'queued' && jobStatus.status !== 'processing') return;
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    notificationPrompt.hidden = false;
  }
}

function pollJobStatus(jobId) {
  let failCount = 0;

  async function poll() {
    try {
      const response = await fetch(`/api/jobs/${jobId}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Could not check job status.');
      }

      failCount = 0;
      handleJobStatus(data);
      if (data.status === 'queued' || data.status === 'processing') {
        queuePollTimer = setTimeout(poll, 2000);
      }
    } catch (error) {
      failCount += 1;
      if (failCount >= 3) {
        showProcessingError(error.message || 'Connection lost while checking job status.');
      } else {
        queuePollTimer = setTimeout(poll, 2000);
      }
    }
  }

  clearQueuePoll();
  queuePollTimer = setTimeout(poll, 2000);
}

function handleJobStatus(data) {
  if (data.status === 'queued') {
    statusBox.textContent = 'Server is busy';
    processingDetail.textContent = data.message || 'Your PDF has been added to the queue.';
    queueMeta.textContent = data.position ? `Position in queue: ${data.position}` : 'Waiting for the next available slot';
    queueMeta.hidden = false;
    return;
  }

  if (data.status === 'processing') {
    statusBox.textContent = 'Processing your PDF';
    processingDetail.textContent = data.message || 'Your PDF is now being processed.';
    queueMeta.hidden = true;
    return;
  }

  if (data.status === 'done') {
    clearQueuePoll();
    notifyWhenDone();
    showResults(data.result);
    return;
  }

  if (data.status === 'failed') {
    clearQueuePoll();
    showProcessingError(data.error || data.message || 'Could not process the PDF.');
    return;
  }

  if (data.status === 'expired') {
    clearQueuePoll();
    showProcessingError('Result expired. Please upload your file again.');
  }
}

function notifyWhenDone() {
  notificationPrompt.hidden = true;
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('SmartSplitPDF is ready', {
      body: 'Your processed PDFs are ready to download.'
    });
  }
}

function showProcessingError(message) {
  statusBox.textContent = `Error: ${message}`;
  statusBox.classList.add('error');
  processingDetail.textContent = 'Please try again when the server has capacity.';
  queueMeta.hidden = true;
  notificationPrompt.hidden = true;
  processingRetryBtn.hidden = false;
  const spinner = processingState.querySelector('.spinner');
  if (spinner) spinner.style.display = 'none';
}

function clearQueuePoll() {
  if (queuePollTimer) {
    clearTimeout(queuePollTimer);
    queuePollTimer = null;
  }
}

// Modal Logic
function openModal(url, isBw, title) {
  modalTitle.textContent = title;
  pdfIframe.src = url;
  if (isBw) {
    pdfIframe.classList.add('iframe-bw');
  } else {
    pdfIframe.classList.remove('iframe-bw');
  }
  previewModal.style.display = 'flex';
}

closeModalBtn.addEventListener('click', () => {
  previewModal.style.display = 'none';
  pdfIframe.src = '';
});

async function showResults(data) {
  processingState.style.display = 'none';
  
  // Render Original PDF Thumbnails
  const allPageNums = Array.from({length: currentPdf.numPages}, (_, i) => i + 1);
  document.getElementById('origPageCountBadge').textContent = `${currentPdf.numPages} pages`;
  await renderThumbnails(allPageNums, 'origThumbnails', 5, false);

  // Black & White Stream
  const bwCountVal = data.blackWhitePages.length;
  bwCount.textContent = pageLabel(bwCountVal);
  // Optional: In a real implementation you would render real thumbnails here.
  // bwPages.textContent = formatPages(data.blackWhitePages);
  
  if (bwCountVal > 0) {
    bwLink.href = getPdfDownloadUrl(data.files.blackWhite);
    bwLink.download = `${data.fileName}-bw.pdf`;
    bwLink.style.display = 'flex';
    
    // Update meta sizes
    document.getElementById('bwDlMeta').textContent = `${bwCountVal} pages`;
    
    await renderThumbnails(data.blackWhitePages, 'bwPages', 4, false);
  } else {
    bwLink.style.display = 'none';
    document.getElementById('bwPages').innerHTML = '<p class="page-list" style="margin-top:10px;">No pages</p>';
  }

  // Color Stream
  const colorCountVal = data.colorPages.length;
  colorCount.textContent = pageLabel(colorCountVal);
  // colorPages.textContent = formatPages(data.colorPages);
  
  if (colorCountVal > 0) {
    colorLink.href = getPdfDownloadUrl(data.files.color);
    colorLink.download = `${data.fileName}-color.pdf`;
    colorLink.style.display = 'flex';
    
    // Update meta sizes
    document.getElementById('colorDlMeta').textContent = `${colorCountVal} pages`;
    
    await renderThumbnails(data.colorPages, 'colorPages', 4, true);
  } else {
    colorLink.style.display = 'none';
    document.getElementById('colorPages').innerHTML = '<p class="page-list" style="margin-top:10px;">No pages</p>';
  }

  // Summary Text
  const summaryText = document.getElementById('summaryText');
  if (summaryText) {
    summaryText.textContent = `${colorCountVal} pages in color • ${bwCountVal} pages in black & white`;
  }

  latestCostSummary = {
    colorPages: colorCountVal,
    bwPages: bwCountVal,
    totalPages: colorCountVal + bwCountVal
  };
  updateSavingsNotice();

  document.getElementById('startOverBtn').style.display = 'block';
  results.hidden = false;
}

async function appendThumbnails(container, pageNumbers, startIndex, endIndex, insertBeforeEl = null) {
  for (let i = startIndex; i < endIndex; i++) {
    const pageNum = pageNumbers[i];
    
    const wrapper = document.createElement('div');
    wrapper.className = 'thumb-item';
    
    const canvas = document.createElement('canvas');
    canvas.className = 'thumb-canvas';
    
    const pageLabel = document.createElement('span');
    pageLabel.className = 'thumb-page';
    pageLabel.textContent = pageNum;
    
    wrapper.appendChild(canvas);
    wrapper.appendChild(pageLabel);
    
    if (insertBeforeEl) {
      container.insertBefore(wrapper, insertBeforeEl);
    } else {
      container.appendChild(wrapper);
    }
    
    try {
      const page = await currentPdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 0.3 });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    } catch (err) {
      console.error('Error rendering thumbnail for page ' + pageNum, err);
    }
  }
}

async function renderThumbnails(pageNumbers, containerId, maxThumbs = 4, isPinkMore = false) {
  const container = document.getElementById(containerId);
  if (!container || !currentPdf) return;
  
  container.innerHTML = '';
  
  if (pageNumbers.length <= maxThumbs) {
    await appendThumbnails(container, pageNumbers, 0, pageNumbers.length, null);
    return;
  }

  await appendThumbnails(container, pageNumbers, 0, maxThumbs, null);
  
  const more = document.createElement('div');
  more.className = 'thumb-more';
  if (isPinkMore) more.classList.add('pink-more');
  more.textContent = '...';
  more.style.cursor = 'pointer';
  more.title = "Load all remaining pages";
  container.appendChild(more);

  more.addEventListener('click', async () => {
    more.style.cursor = 'default';
    more.style.pointerEvents = 'none';
    more.style.opacity = '0.5';
    
    await appendThumbnails(container, pageNumbers, maxThumbs, pageNumbers.length, more);
    
    more.remove();
  }, { once: true });
}

function getPdfDownloadUrl(fileRef) {
  if (!fileRef) return '#';
  if (!fileRef.startsWith('data:')) return fileRef;

  const blob = base64ToBlob(fileRef);
  return URL.createObjectURL(blob);
}

function base64ToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

function pageLabel(count) {
  return `${count} page${count === 1 ? '' : 's'}`;
}

function formatPages(pages) {
  if (!pages.length) return 'No pages detected in this group.';
  return `Pages ${pages.join(', ')}`;
}
