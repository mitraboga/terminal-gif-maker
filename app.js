/* Terminal Gif Maker (GitHub Pages friendly)
   FIXES:
   - GIF export: create SAME-ORIGIN worker via Blob URL (avoids worker/CORS issues on Pages)
   - show real error message in UI
   - modals mutually exclusive + closed on load (kept)
*/

const STORAGE_KEY = "tgm_state_v2";

/** ---------- Defaults ---------- */
const DEFAULT_STATE = {
  settings: {
    typingMsPerChar: 28,
    fontSizePx: 16,
    paddingPx: 18,
    gifScale: 2,
    gifQuality: 10,

    videoFps: 30,
    videoTimeScale: 1.0,
    videoBitrateMbps: 8,

    theme: "midnight",
  },
  multiline: false,
  selectedIndex: 0,
  steps: [
    { path: "/home", text: "cat index.js", typing: true, timeout: 10 },
    { path: "", text: "const helper = require('helper.js')", typing: false, timeout: 0 },
    { path: "", text: "helper.startValidation()", typing: false, timeout: 0 },
    { path: "/home", text: "node index.js", typing: true, timeout: 50 },
    { path: "", text: "validation started!", typing: false, timeout: 100 },
    { path: "", text: "validation completed!", typing: false, timeout: 300 },
    { path: "/home", text: "", typing: false, timeout: 50 },
    { path: "", text: "git commit --amend", typing: true, timeout: 150 },
  ],
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
function safeInt(v, fallback = 0) {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}
function safeFloat(v, fallback = 1) {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);

    const merged = {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      settings: { ...structuredClone(DEFAULT_STATE.settings), ...(parsed.settings || {}) },
      steps: Array.isArray(parsed.steps) ? parsed.steps : structuredClone(DEFAULT_STATE.steps),
    };

    merged.selectedIndex = clamp(safeInt(merged.selectedIndex, 0), 0, merged.steps.length - 1);
    return merged;
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}
function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

/** ---------- DOM ---------- */
const terminalScreen = document.getElementById("terminalScreen");
const rowsEl = document.getElementById("rows");

const btnSim = document.getElementById("btnSim");
const btnExport = document.getElementById("btnExport");
const btnSettings = document.getElementById("btnSettings");

const exportRow = document.getElementById("exportRow");
const spinner = document.getElementById("spinner");
const exportStatus = document.getElementById("exportStatus");
const downloadLink = document.getElementById("downloadLink");

/* bottom multiline bar */
const multilineToggle = document.getElementById("multilineToggle");
const multilineEditor = document.getElementById("multilineEditor");

/* settings modal */
const settingsModal = document.getElementById("settingsModal");
const closeSettings = document.getElementById("closeSettings");
const btnSaveSettings = document.getElementById("btnSaveSettings");
const btnResetDemo = document.getElementById("btnResetDemo");

const setTyping = document.getElementById("setTyping");
const setFontSize = document.getElementById("setFontSize");
const setPad = document.getElementById("setPad");
const setScale = document.getElementById("setScale");
const setQuality = document.getElementById("setQuality");
const setFps = document.getElementById("setFps");
const setVideoScale = document.getElementById("setVideoScale");
const setBitrate = document.getElementById("setBitrate");
const setTheme = document.getElementById("setTheme");

/* presets */
const presetTextarea = document.getElementById("presetTextarea");
const btnCopyJson = document.getElementById("btnCopyJson");
const btnDownloadJson = document.getElementById("btnDownloadJson");
const btnLoadJson = document.getElementById("btnLoadJson");
const fileJson = document.getElementById("fileJson");

/* export modal */
const exportModal = document.getElementById("exportModal");
const closeExport = document.getElementById("closeExport");
const btnExportGif = document.getElementById("btnExportGif");
const btnExportMp4 = document.getElementById("btnExportMp4");
const exportMiniStatus = document.getElementById("exportMiniStatus");
const downloadLinkModal = document.getElementById("downloadLinkModal");

let simRunning = false;

/** ---------- Modal control ---------- */
function anyModalOpen() {
  return !settingsModal.hidden || !exportModal.hidden;
}
function lockBodyScroll(locked) {
  document.body.style.overflow = locked ? "hidden" : "";
}
function closeSettingsModal() {
  settingsModal.hidden = true;
  if (!anyModalOpen()) lockBodyScroll(false);
}
function closeExportModal() {
  exportModal.hidden = true;
  if (!anyModalOpen()) lockBodyScroll(false);
}
function closeAllModals() {
  settingsModal.hidden = true;
  exportModal.hidden = true;
  lockBodyScroll(false);
}
function openSettings() {
  closeExportModal();

  setTyping.value = String(state.settings.typingMsPerChar);
  setFontSize.value = String(state.settings.fontSizePx);
  setPad.value = String(state.settings.paddingPx);
  setScale.value = String(state.settings.gifScale);
  setQuality.value = String(state.settings.gifQuality);
  setFps.value = String(state.settings.videoFps);
  setVideoScale.value = String(state.settings.videoTimeScale);
  setBitrate.value = String(state.settings.videoBitrateMbps);
  setTheme.value = state.settings.theme;

  presetTextarea.value = getPresetJsonString();

  settingsModal.hidden = false;
  lockBodyScroll(true);
}
function openExport() {
  closeSettingsModal();
  setExportModalUI({ status: "Ready", downloadableUrl: null, filename: "" });
  exportModal.hidden = false;
  lockBodyScroll(true);
}

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!exportModal.hidden) closeExportModal();
  else if (!settingsModal.hidden) closeSettingsModal();
});

settingsModal.addEventListener("click", (e) => {
  if (e.target === settingsModal) closeSettingsModal();
});
exportModal.addEventListener("click", (e) => {
  if (e.target === exportModal) closeExportModal();
});

/** ---------- UI helpers ---------- */
function setExportUI({ show, status, busy, downloadableUrl, filename }) {
  exportRow.hidden = !show;
  spinner.hidden = !busy;
  exportStatus.textContent = status || "Ready";

  if (downloadableUrl) {
    downloadLink.hidden = false;
    downloadLink.href = downloadableUrl;
    downloadLink.download = filename || "terminal.gif";
    downloadLink.textContent = "Download";
  } else {
    downloadLink.hidden = true;
    downloadLink.href = "#";
  }
}
function setExportModalUI({ status, downloadableUrl, filename }) {
  exportMiniStatus.textContent = status || "Ready";

  if (downloadableUrl) {
    downloadLinkModal.hidden = false;
    downloadLinkModal.href = downloadableUrl;
    downloadLinkModal.download = filename || "terminal.gif";
    downloadLinkModal.textContent = `Download ${filename || ""}`.trim();
  } else {
    downloadLinkModal.hidden = true;
    downloadLinkModal.href = "#";
  }
}

function applySettingsToPreview() {
  terminalScreen.style.fontSize = `${state.settings.fontSizePx}px`;
  terminalScreen.style.padding = `${state.settings.paddingPx}px`;
  terminalScreen.dataset.theme = state.settings.theme;
}
applySettingsToPreview();

/** ---------- ANSI parsing ---------- */
const ANSI_RE = /\x1b\[[0-9;]*m/g;

const BASIC_16 = {
  30: "#111827",
  31: "#ef4444",
  32: "#22c55e",
  33: "#eab308",
  34: "#3b82f6",
  35: "#a855f7",
  36: "#06b6d4",
  37: "#e5e7eb",
  90: "#6b7280",
  91: "#f87171",
  92: "#4ade80",
  93: "#facc15",
  94: "#60a5fa",
  95: "#c084fc",
  96: "#22d3ee",
  97: "#f3f4f6",
};

const BG_16 = {
  40: "#111827",
  41: "#7f1d1d",
  42: "#14532d",
  43: "#713f12",
  44: "#1e3a8a",
  45: "#581c87",
  46: "#155e75",
  47: "#e5e7eb",
  100: "#374151",
  101: "#ef4444",
  102: "#22c55e",
  103: "#eab308",
  104: "#3b82f6",
  105: "#a855f7",
  106: "#06b6d4",
  107: "#f3f4f6",
};

function xterm256ToRgb(n) {
  if (n >= 0 && n <= 15) {
    const map = [
      "#000000","#800000","#008000","#808000","#000080","#800080","#008080","#c0c0c0",
      "#808080","#ff0000","#00ff00","#ffff00","#0000ff","#ff00ff","#00ffff","#ffffff",
    ];
    return map[n];
  }
  if (n >= 16 && n <= 231) {
    const idx = n - 16;
    const r = Math.floor(idx / 36);
    const g = Math.floor((idx % 36) / 6);
    const b = idx % 6;
    const conv = (c) => (c === 0 ? 0 : 55 + c * 40);
    return `rgb(${conv(r)},${conv(g)},${conv(b)})`;
  }
  if (n >= 232 && n <= 255) {
    const v = 8 + (n - 232) * 10;
    return `rgb(${v},${v},${v})`;
  }
  return null;
}

function parseAnsiToSegments(input) {
  const out = [];
  let lastIndex = 0;
  let style = { fg: null, bg: null, bold: false, underline: false };

  function pushText(txt) {
    if (!txt) return;
    out.push({ text: txt, ...style });
  }

  const matches = input.matchAll(ANSI_RE);
  for (const m of matches) {
    const idx = m.index ?? 0;
    const esc = m[0];

    pushText(input.slice(lastIndex, idx));
    lastIndex = idx + esc.length;

    const inside = esc.slice(2, -1);
    const params = inside.length ? inside.split(";").map((x) => safeInt(x, 0)) : [0];

    let i = 0;
    while (i < params.length) {
      const p = params[i];

      if (p === 0) style = { fg: null, bg: null, bold: false, underline: false };
      else if (p === 1) style.bold = true;
      else if (p === 22) style.bold = false;
      else if (p === 4) style.underline = true;
      else if (p === 24) style.underline = false;
      else if ((p >= 30 && p <= 37) || (p >= 90 && p <= 97)) style.fg = BASIC_16[p] || style.fg;
      else if ((p >= 40 && p <= 47) || (p >= 100 && p <= 107)) style.bg = BG_16[p] || style.bg;
      else if (p === 39) style.fg = null;
      else if (p === 49) style.bg = null;
      else if (p === 38 || p === 48) {
        const isFg = p === 38;
        const mode = params[i + 1];

        if (mode === 5) {
          const n = params[i + 2];
          const rgb = xterm256ToRgb(n);
          if (rgb) {
            if (isFg) style.fg = rgb;
            else style.bg = rgb;
          }
          i += 3;
          continue;
        }

        if (mode === 2) {
          const r = params[i + 2];
          const g = params[i + 3];
          const b = params[i + 4];
          if ([r, g, b].every((v) => Number.isFinite(v))) {
            const rgb = `rgb(${clamp(r, 0, 255)},${clamp(g, 0, 255)},${clamp(b, 0, 255)})`;
            if (isFg) style.fg = rgb;
            else style.bg = rgb;
          }
          i += 5;
          continue;
        }
      }

      i += 1;
    }
  }

  pushText(input.slice(lastIndex));
  return out;
}

function tokenizeAnsi(raw) {
  const tokens = [];
  let i = 0;

  while (i < raw.length) {
    const ch = raw[i];
    if (ch === "\x1b" && raw[i + 1] === "[") {
      let j = i + 2;
      while (j < raw.length && raw[j] !== "m") j++;
      if (j < raw.length) {
        tokens.push({ type: "esc", value: raw.slice(i, j + 1) });
        i = j + 1;
        continue;
      }
    }
    tokens.push({ type: "char", value: ch });
    i++;
  }

  return tokens;
}

/** ---------- Render model ---------- */
let renderLines = []; // each {type:'prompt'|'out', path?:string, rawText:string}

function resetTerminal() {
  renderLines = [];
  renderTerminalPreview();
}

function isCommandStep(step) {
  return (step.path || "").trim().length > 0;
}

function ensurePromptLine(path) {
  const line = { type: "prompt", path: path || "/home", rawText: "" };
  renderLines.push(line);
  return line;
}
function ensureOutLine() {
  const line = { type: "out", rawText: "" };
  renderLines.push(line);
  return line;
}

/** ---------- DOM terminal render ---------- */
function makeSpan(seg, defaultColor) {
  const s = document.createElement("span");
  s.textContent = seg.text;

  const fg = seg.fg || defaultColor;
  if (fg) s.style.color = fg;
  if (seg.bg) {
    s.style.backgroundColor = seg.bg;
    s.style.padding = "0 2px";
    s.style.borderRadius = "4px";
  }
  if (seg.bold) s.style.fontWeight = "900";
  if (seg.underline) s.style.textDecoration = "underline";
  return s;
}

function appendAnsiSegments(container, rawText, defaultColor) {
  const segments = parseAnsiToSegments(rawText || "");
  for (const seg of segments) {
    const parts = seg.text.split("\n");
    for (let i = 0; i < parts.length; i++) {
      if (parts[i].length) container.appendChild(makeSpan({ ...seg, text: parts[i] }, defaultColor));
      if (i < parts.length - 1) container.appendChild(document.createElement("br"));
    }
  }
}

function renderTerminalPreview() {
  terminalScreen.innerHTML = "";

  if (renderLines.length === 0) {
    const line = document.createElement("div");
    line.className = "termLine";
    const cur = document.createElement("span");
    cur.className = "cursor";
    line.appendChild(cur);
    terminalScreen.appendChild(line);
    return;
  }

  renderLines.forEach((ln, idx) => {
    const isLast = idx === renderLines.length - 1;

    const line = document.createElement("div");
    line.className = "termLine";

    if (ln.type === "prompt") {
      const path = document.createElement("span");
      path.className = "segPath";
      path.textContent = ln.path || "/";

      const dollar = document.createElement("span");
      dollar.className = "segDollar";
      dollar.textContent = " $ ";

      const cmd = document.createElement("span");
      cmd.className = "segCmd";
      appendAnsiSegments(cmd, ln.rawText || "", "#e5e7eb");

      line.appendChild(path);
      line.appendChild(dollar);
      line.appendChild(cmd);
    } else {
      const out = document.createElement("span");
      appendAnsiSegments(out, ln.rawText || "", "#e5e7eb");
      line.appendChild(out);
    }

    if (isLast) {
      const cur = document.createElement("span");
      cur.className = "cursor";
      line.appendChild(cur);
    }

    terminalScreen.appendChild(line);
  });
}

/** ---------- Canvas drawing ---------- */
function makeCanvasForExport() {
  const rect = terminalScreen.getBoundingClientRect();
  const scale = clamp(state.settings.gifScale, 1, 3);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.floor(rect.width * scale));
  canvas.height = Math.max(2, Math.floor(rect.height * scale));
  return { canvas, scale };
}

function drawBackground(ctx, w, h) {
  const g = ctx.createRadialGradient(w * 0.3, h * 0.25, w * 0.05, w * 0.3, h * 0.25, w * 1.2);
  if (state.settings.theme === "charcoal") {
    g.addColorStop(0, "#141821");
    g.addColorStop(1, "#0c0f16");
  } else {
    g.addColorStop(0, "#0a1428");
    g.addColorStop(1, "#0b1020");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function measureText(ctx, txt) {
  return ctx.measureText(txt).width;
}

function drawTextChunk(ctx, txt, x, y, fg, bg, fontSize) {
  if (!txt) return 0;
  const w = measureText(ctx, txt);

  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(x, y + Math.floor(fontSize * 0.15), w, Math.floor(fontSize * 1.15));
  }

  ctx.fillStyle = fg || "#e5e7eb";
  ctx.fillText(txt, x, y);
  return w;
}

function drawSegmentsWrapped(ctx, segments, xStart, yStart, maxWidth, lineH, fontSize, defaultFg) {
  let x = xStart;
  let y = yStart;

  const pushLine = () => {
    x = xStart;
    y += lineH;
  };

  for (const seg of segments) {
    const fg = seg.fg || defaultFg;
    const bg = seg.bg || null;

    const parts = (seg.text || "").split("\n");
    for (let pi = 0; pi < parts.length; pi++) {
      const text = parts[pi];

      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        const w = measureText(ctx, ch);

        if (x + w > xStart + maxWidth) pushLine();

        drawTextChunk(ctx, ch, x, y, fg, bg, fontSize);
        x += w;
      }

      if (pi < parts.length - 1) pushLine();
    }
  }

  return { x, y };
}

function drawTerminalToCanvas(ctx, w, h, scale) {
  drawBackground(ctx, w, h);

  const fontSize = state.settings.fontSizePx * scale;
  const pad = state.settings.paddingPx * scale;

  ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
  ctx.textBaseline = "top";

  const lineH = Math.floor(fontSize * 1.45);
  let y = pad;
  const maxWidth = w - pad * 2;

  for (const ln of renderLines) {
    if (y > h - pad - lineH) break;

    if (ln.type === "prompt") {
      const path = ln.path || "/home";
      const dollar = " $ ";

      let x = pad;
      ctx.fillStyle = "#39d353";
      ctx.fillText(path, x, y);
      x += measureText(ctx, path);

      ctx.fillStyle = "#b8c2d1";
      ctx.fillText(dollar, x, y);
      x += measureText(ctx, dollar);

      const segs = parseAnsiToSegments(ln.rawText || "");
      drawSegmentsWrapped(ctx, segs, x, y, maxWidth - (x - pad), lineH, fontSize, "#e5e7eb");
    } else {
      const segs = parseAnsiToSegments(ln.rawText || "");
      drawSegmentsWrapped(ctx, segs, pad, y, maxWidth, lineH, fontSize, "#e5e7eb");
    }

    y += lineH;
  }

  ctx.fillStyle = "#39d353";
  ctx.fillRect(
    pad,
    Math.min(h - pad - lineH, y) + Math.floor(fontSize * 0.15),
    Math.floor(fontSize * 0.55),
    Math.floor(fontSize * 1.05)
  );
}

/** ---------- Simulation engine ---------- */
async function simulate({ mode, gif, canvasCtx, canvasW, canvasH, canvasScale, timeScale }) {
  const typingDelay = clamp(state.settings.typingMsPerChar, 1, 200);
  const scaled = clamp(timeScale ?? 1, 0.05, 5);

  resetTerminal();

  function drawAndMaybeFrame(delayMs) {
    renderTerminalPreview();

    if (mode === "gif" && gif) {
      if (canvasCtx) {
        drawTerminalToCanvas(canvasCtx, canvasW, canvasH, canvasScale);
        gif.addFrame(canvasCtx.canvas, { copy: true, delay: clamp(delayMs, 0, 600000) });
      }
    }

    if (mode === "video" && canvasCtx) {
      drawTerminalToCanvas(canvasCtx, canvasW, canvasH, canvasScale);
    }
  }

  if (mode === "gif") drawAndMaybeFrame(200);
  else drawAndMaybeFrame(0);

  for (const step of state.steps) {
    const cmd = isCommandStep(step);
    const text = step.text ?? "";
    const path = (step.path || "/home").trim();

    const line = cmd ? ensurePromptLine(path) : ensureOutLine();

    if (step.typing) {
      const tokens = tokenizeAnsi(text);
      let built = "";

      for (const t of tokens) {
        built += t.value;
        line.rawText = built;

        if (t.type === "char") {
          if (mode === "gif") drawAndMaybeFrame(typingDelay);
          else {
            drawAndMaybeFrame(0);
            await sleep(typingDelay * scaled);
          }
        }
      }

      if (mode === "gif") drawAndMaybeFrame(40);
      else drawAndMaybeFrame(0);
    } else {
      line.rawText = text;

      if (mode === "gif") drawAndMaybeFrame(40);
      else {
        drawAndMaybeFrame(0);
        await sleep(40 * scaled);
      }
    }

    const hold = clamp(step.timeout ?? 0, 0, 600000);
    if (mode === "gif") drawAndMaybeFrame(hold);
    else await sleep(hold * scaled);
  }

  if (mode === "gif") drawAndMaybeFrame(400);
  else drawAndMaybeFrame(0);
}

/** ---------- Rows UI ---------- */
function createSwitch(checked, onChange) {
  const wrap = document.createElement("label");
  wrap.className = "switch";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = !!checked;

  const slider = document.createElement("span");
  slider.className = "slider";

  input.addEventListener("change", () => onChange(input.checked));

  wrap.appendChild(input);
  wrap.appendChild(slider);
  return wrap;
}

function createOpBtn(label, title, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "opBtn";
  b.textContent = label;
  b.title = title;
  b.addEventListener("click", onClick);
  return b;
}

function setSelectedIndex(idx) {
  state.selectedIndex = clamp(idx, 0, state.steps.length - 1);
  saveState();
  renderRows();
  syncMultilineEditorFromSelection();
}

function syncMultilineEditorFromSelection() {
  const step = state.steps[state.selectedIndex];
  multilineEditor.value = step?.text ?? "";
  multilineEditor.classList.toggle("big", !!state.multiline);
}

function renderRows() {
  rowsEl.innerHTML = "";

  state.steps.forEach((step, idx) => {
    const row = document.createElement("div");
    row.className = "row" + (idx === state.selectedIndex ? " selected" : "");
    row.addEventListener("click", () => setSelectedIndex(idx));

    const path = document.createElement("input");
    path.className = "input";
    path.placeholder = "/home";
    path.value = step.path ?? "";
    path.addEventListener("input", () => {
      step.path = path.value;
      saveState();
    });

    const cmd = document.createElement("input");
    cmd.className = "input";
    cmd.placeholder = "command or output text…";
    cmd.value = (step.text ?? "").split("\n")[0];
    cmd.addEventListener("input", () => {
      const current = step.text ?? "";
      const lines = current.split("\n");
      lines[0] = cmd.value;
      step.text = lines.join("\n");
      saveState();
      if (idx === state.selectedIndex) multilineEditor.value = step.text ?? "";
    });

    const typing = document.createElement("div");
    typing.style.display = "flex";
    typing.style.justifyContent = "center";
    typing.appendChild(
      createSwitch(step.typing, (v) => {
        step.typing = v;
        saveState();
      })
    );

    const timeout = document.createElement("input");
    timeout.className = "input smallNum";
    timeout.type = "number";
    timeout.min = "0";
    timeout.step = "10";
    timeout.value = String(step.timeout ?? 0);
    timeout.addEventListener("input", () => {
      step.timeout = clamp(safeInt(timeout.value, 0), 0, 600000);
      saveState();
    });

    const ops = document.createElement("div");
    ops.className = "ops";

    const del = createOpBtn("−", "Remove row", (e) => {
      e.stopPropagation();
      if (state.steps.length === 1) return;

      state.steps.splice(idx, 1);
      if (state.selectedIndex >= state.steps.length) state.selectedIndex = state.steps.length - 1;
      saveState();
      renderRows();
      syncMultilineEditorFromSelection();
    });

    const add = createOpBtn("+", "Add row below", (e) => {
      e.stopPropagation();
      state.steps.splice(idx + 1, 0, { path: "", text: "", typing: false, timeout: 0 });
      saveState();
      renderRows();
      setSelectedIndex(idx + 1);
    });

    ops.appendChild(del);
    ops.appendChild(add);

    row.appendChild(path);
    row.appendChild(cmd);
    row.appendChild(typing);
    row.appendChild(timeout);
    row.appendChild(ops);

    rowsEl.appendChild(row);
  });
}

/** ---------- Presets ---------- */
function getPresetJsonString() {
  const preset = {
    version: 2,
    settings: state.settings,
    multiline: state.multiline,
    steps: state.steps,
  };
  return JSON.stringify(preset, null, 2);
}

function loadPresetFromObject(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Invalid JSON");

  const next = structuredClone(DEFAULT_STATE);

  if (obj.settings && typeof obj.settings === "object") next.settings = { ...next.settings, ...obj.settings };
  if (typeof obj.multiline === "boolean") next.multiline = obj.multiline;

  if (Array.isArray(obj.steps)) {
    next.steps = obj.steps.map((s) => ({
      path: String(s.path ?? ""),
      text: String(s.text ?? ""),
      typing: !!s.typing,
      timeout: clamp(safeInt(s.timeout, 0), 0, 600000),
    }));
    if (next.steps.length === 0) next.steps = structuredClone(DEFAULT_STATE.steps);
  }

  next.selectedIndex = 0;

  state = next;
  saveState();

  applySettingsToPreview();
  multilineToggle.checked = !!state.multiline;
  renderRows();
  syncMultilineEditorFromSelection();
  resetTerminal();
}

function downloadTextFile(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** ---------- GIF WORKER (SAME-ORIGIN BLOB) ---------- */
const GIF_WORKER_CDN = "https://cdn.jsdelivr.net/npm/gif.js.optimized@1.0.1/dist/gif.worker.js";
let gifWorkerBlobUrl = null;

async function getGifWorkerScriptUrl() {
  if (gifWorkerBlobUrl) return gifWorkerBlobUrl;

  // If fetch fails (offline, blocked), we still return CDN as fallback.
  try {
    const res = await fetch(GIF_WORKER_CDN, { cache: "reload" });
    if (!res.ok) throw new Error(`Worker fetch failed (${res.status})`);
    const js = await res.text();

    const blob = new Blob([js], { type: "application/javascript" });
    gifWorkerBlobUrl = URL.createObjectURL(blob);
    return gifWorkerBlobUrl;
  } catch (e) {
    console.warn("Falling back to CDN worker URL:", e);
    return GIF_WORKER_CDN;
  }
}

/** ---------- Exports ---------- */
async function exportGif() {
  if (simRunning) return;
  simRunning = true;

  const fail = (msg, err) => {
    console.error(err || msg);
    setExportUI({ show: true, status: msg, busy: false, downloadableUrl: null });
    setExportModalUI({ status: msg, downloadableUrl: null, filename: "" });
  };

  try {
    if (typeof window.GIF !== "function") {
      throw new Error("GIF library not loaded. Hard refresh (Ctrl+Shift+R).");
    }
    if (!window.Worker) {
      throw new Error("Web Workers not supported in this browser (GIF export needs Workers).");
    }

    setExportUI({ show: true, status: "Exporting GIF…", busy: true, downloadableUrl: null });
    setExportModalUI({ status: "Exporting GIF…", downloadableUrl: null, filename: "" });

    const workerScript = await getGifWorkerScriptUrl();

    const { canvas, scale } = makeCanvasForExport();
    const ctx = canvas.getContext("2d");

    const gif = new GIF({
      workers: 2,
      quality: clamp(state.settings.gifQuality, 1, 30),
      workerScript,
      width: canvas.width,
      height: canvas.height,
    });

    await simulate({
      mode: "gif",
      gif,
      canvasCtx: ctx,
      canvasW: canvas.width,
      canvasH: canvas.height,
      canvasScale: scale,
      timeScale: 1,
    });

    await new Promise((resolve, reject) => {
      gif.on("finished", (blob) => {
        const url = URL.createObjectURL(blob);
        const filename = "terminal.gif";
        setExportUI({ show: true, status: "Done ✅", busy: false, downloadableUrl: url, filename });
        setExportModalUI({ status: "Done ✅", downloadableUrl: url, filename });
        resolve();
      });
      gif.on("abort", () => reject(new Error("GIF render aborted")));
      gif.on("error", (e) => reject(e instanceof Error ? e : new Error(String(e))));
      gif.render();
    });
  } catch (e) {
    const msg = `GIF export failed: ${e?.message ? e.message : String(e)}`;
    fail(msg, e);
  } finally {
    simRunning = false;
  }
}

function pickBestVideoMimeType() {
  const candidates = [
    "video/mp4;codecs=avc1.42E01E",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];

  for (const c of candidates) {
    if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

async function exportMp4OrWebm() {
  if (simRunning) return;
  simRunning = true;

  setExportUI({ show: true, status: "Exporting video…", busy: true, downloadableUrl: null });
  setExportModalUI({ status: "Exporting video…", downloadableUrl: null, filename: "" });

  try {
    const mimeType = pickBestVideoMimeType();
    if (!mimeType) throw new Error("MediaRecorder is not supported in this browser.");

    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const filename = `terminal.${ext}`;

    const fps = clamp(safeInt(state.settings.videoFps, 30), 10, 60);
    const timeScale = clamp(safeFloat(state.settings.videoTimeScale, 1.0), 0.25, 2.0);
    const bitrate = clamp(safeInt(state.settings.videoBitrateMbps, 8), 1, 20) * 1_000_000;

    const { canvas, scale } = makeCanvasForExport();
    const ctx = canvas.getContext("2d");

    resetTerminal();
    drawTerminalToCanvas(ctx, canvas.width, canvas.height, scale);

    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitrate });

    const chunks = [];
    const done = new Promise((resolve) => {
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = resolve;
    });

    recorder.start();

    await simulate({
      mode: "video",
      canvasCtx: ctx,
      canvasW: canvas.width,
      canvasH: canvas.height,
      canvasScale: scale,
      timeScale,
    });

    await sleep(250);
    recorder.stop();
    await done;

    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);

    setExportUI({ show: true, status: "Done ✅", busy: false, downloadableUrl: url, filename });
    setExportModalUI({ status: "Done ✅", downloadableUrl: url, filename });
  } catch (e) {
    console.error(e);
    const msg = `Video export failed: ${e?.message ? e.message : String(e)}`;
    setExportUI({ show: true, status: msg, busy: false, downloadableUrl: null });
    setExportModalUI({ status: msg, downloadableUrl: null, filename: "" });
  } finally {
    simRunning = false;
  }
}

/** ---------- Button events ---------- */
btnSim.addEventListener("click", async () => {
  if (simRunning) return;
  simRunning = true;

  setExportUI({ show: false, status: "", busy: false, downloadableUrl: null });

  try {
    await simulate({ mode: "preview", timeScale: 1 });
  } finally {
    simRunning = false;
  }
});

btnExport.addEventListener("click", openExport);
btnSettings.addEventListener("click", openSettings);

closeSettings.addEventListener("click", closeSettingsModal);
closeExport.addEventListener("click", closeExportModal);

btnExportGif.addEventListener("click", exportGif);
btnExportMp4.addEventListener("click", exportMp4OrWebm);

btnSaveSettings.addEventListener("click", () => {
  state.settings.typingMsPerChar = clamp(safeInt(setTyping.value, 28), 1, 200);
  state.settings.fontSizePx = clamp(safeInt(setFontSize.value, 16), 10, 28);
  state.settings.paddingPx = clamp(safeInt(setPad.value, 18), 8, 40);
  state.settings.gifScale = clamp(safeInt(setScale.value, 2), 1, 3);
  state.settings.gifQuality = clamp(safeInt(setQuality.value, 10), 1, 30);

  state.settings.videoFps = clamp(safeInt(setFps.value, 30), 10, 60);
  state.settings.videoTimeScale = clamp(safeFloat(setVideoScale.value, 1.0), 0.25, 2.0);
  state.settings.videoBitrateMbps = clamp(safeInt(setBitrate.value, 8), 1, 20);

  state.settings.theme = setTheme.value || "midnight";

  applySettingsToPreview();
  saveState();
  closeSettingsModal();
});

btnResetDemo.addEventListener("click", () => {
  state = structuredClone(DEFAULT_STATE);
  saveState();

  applySettingsToPreview();
  multilineToggle.checked = !!state.multiline;

  renderRows();
  syncMultilineEditorFromSelection();
  resetTerminal();

  presetTextarea.value = getPresetJsonString();
});

multilineToggle.checked = !!state.multiline;
multilineToggle.addEventListener("change", () => {
  state.multiline = multilineToggle.checked;
  saveState();
  syncMultilineEditorFromSelection();
});

multilineEditor.addEventListener("input", () => {
  const step = state.steps[state.selectedIndex];
  if (!step) return;

  if (!state.multiline) {
    step.text = multilineEditor.value.replace(/\r?\n/g, " ");
    multilineEditor.value = step.text;
  } else {
    step.text = multilineEditor.value;
  }

  saveState();
  renderRows();
});

btnCopyJson.addEventListener("click", async () => {
  try {
    presetTextarea.value = getPresetJsonString();
    await navigator.clipboard.writeText(presetTextarea.value);
    alert("Copied JSON to clipboard.");
  } catch {
    alert("Copy failed (clipboard permissions). You can manually copy from the box.");
  }
});

btnDownloadJson.addEventListener("click", () => {
  presetTextarea.value = getPresetJsonString();
  downloadTextFile("terminal-gif-maker-preset.json", presetTextarea.value);
});

fileJson.addEventListener("change", async () => {
  const file = fileJson.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    presetTextarea.value = text;
    alert("Loaded JSON into the box. Click “Load JSON into editor” to apply.");
  } catch {
    alert("Could not read that file.");
  } finally {
    fileJson.value = "";
  }
});

btnLoadJson.addEventListener("click", () => {
  try {
    const obj = JSON.parse(presetTextarea.value);
    loadPresetFromObject(obj);
    alert("Preset loaded.");
  } catch (e) {
    console.error(e);
    alert("Invalid JSON. Make sure it’s a preset exported by this app.");
  }
});

/** ---------- Init ---------- */
function init() {
  closeAllModals();
  exportRow.hidden = true;

  applySettingsToPreview();
  renderRows();
  syncMultilineEditorFromSelection();
  resetTerminal();
}

init();
