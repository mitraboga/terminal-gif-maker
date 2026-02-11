/* Terminal Gif Maker (static GitHub Pages friendly)
   - Simulate typing/output in a terminal preview
   - Export as GIF using gif.js (runs fully in-browser)
*/

const STORAGE_KEY = "tgm_state_v1";

const DEFAULT_STATE = {
  settings: {
    typingMsPerChar: 28,
    fontSizePx: 16,
    paddingPx: 18,
    gifScale: 2,
    gifQuality: 10,
    theme: "midnight",
  },
  multiline: false,
  steps: [
    { path: "/home", text: "cat index.js", typing: true, timeout: 10, kind: "cmd" },
    { path: "", text: "const helper = require('helper.js')", typing: false, timeout: 0, kind: "out" },
    { path: "", text: "helper.startValidation()", typing: false, timeout: 0, kind: "out" },
    { path: "/home", text: "node index.js", typing: true, timeout: 50, kind: "cmd" },
    { path: "", text: "validation started!", typing: false, timeout: 100, kind: "out" },
    { path: "", text: "validation completed!", typing: false, timeout: 300, kind: "out" },
    { path: "/home", text: "", typing: false, timeout: 50, kind: "cmd" },
    { path: "", text: "git commit --amend", typing: true, timeout: 150, kind: "cmd" },
  ],
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);

    // gentle merge for forward-compat
    return {
      ...structuredClone(DEFAULT_STATE),
      ...parsed,
      settings: { ...structuredClone(DEFAULT_STATE.settings), ...(parsed.settings || {}) },
      steps: Array.isArray(parsed.steps) ? parsed.steps : structuredClone(DEFAULT_STATE.steps),
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

let state = loadState();

// DOM
const terminalScreen = document.getElementById("terminalScreen");
const rowsEl = document.getElementById("rows");
const btnSim = document.getElementById("btnSim");
const btnExport = document.getElementById("btnExport");
const btnSettings = document.getElementById("btnSettings");

const exportRow = document.getElementById("exportRow");
const spinner = document.getElementById("spinner");
const exportStatus = document.getElementById("exportStatus");
const downloadLink = document.getElementById("downloadLink");

const modal = document.getElementById("modal");
const closeModal = document.getElementById("closeModal");
const btnSaveSettings = document.getElementById("btnSaveSettings");
const btnReset = document.getElementById("btnReset");

const setTyping = document.getElementById("setTyping");
const setFontSize = document.getElementById("setFontSize");
const setPad = document.getElementById("setPad");
const setScale = document.getElementById("setScale");
const setQuality = document.getElementById("setQuality");
const setTheme = document.getElementById("setTheme");

const multilineToggle = document.getElementById("multilineToggle");

// terminal render model (what you see + what we draw into GIF)
let renderLines = []; // each: {type:'prompt'|'out', path, text}
let cursorOn = true;
let simRunning = false;

// Apply settings to preview
function applySettingsToPreview() {
  terminalScreen.style.fontSize = `${state.settings.fontSizePx}px`;
  terminalScreen.style.padding = `${state.settings.paddingPx}px`;
  terminalScreen.dataset.theme = state.settings.theme;
}
applySettingsToPreview();

function setExportUI({ show, status, busy, downloadableUrl }) {
  exportRow.hidden = !show;
  spinner.hidden = !busy;
  exportStatus.textContent = status || "Ready";

  if (downloadableUrl) {
    downloadLink.hidden = false;
    downloadLink.href = downloadableUrl;
  } else {
    downloadLink.hidden = true;
    downloadLink.href = "#";
  }
}

function iconBtn(label) {
  const b = document.createElement("button");
  b.className = "iconBtn";
  b.type = "button";
  b.textContent = label;
  return b;
}

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

// --- UI rows ---
function renderRows() {
  rowsEl.innerHTML = "";

  state.steps.forEach((step, idx) => {
    const row = document.createElement("div");
    row.className = "row";

    const path = document.createElement("input");
    path.className = "input";
    path.placeholder = "/home";
    path.value = step.path ?? "";
    path.addEventListener("input", () => {
      step.path = path.value;
      saveState();
    });

    const cmdWrap = document.createElement("div");
    if (state.multiline) {
      const ta = document.createElement("textarea");
      ta.className = "textarea";
      ta.placeholder = "command or output text...";
      ta.value = step.text ?? "";
      ta.addEventListener("input", () => {
        step.text = ta.value;
        saveState();
      });
      cmdWrap.appendChild(ta);
    } else {
      const cmd = document.createElement("input");
      cmd.className = "input";
      cmd.placeholder = "command or output text...";
      cmd.value = step.text ?? "";
      cmd.addEventListener("input", () => {
        step.text = cmd.value;
        saveState();
      });
      cmdWrap.appendChild(cmd);
    }

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
      step.timeout = clamp(parseInt(timeout.value || "0", 10), 0, 600000);
      saveState();
    });

    const ops = document.createElement("div");
    ops.style.display = "flex";
    ops.style.justifyContent = "center";
    ops.style.gap = "8px";

    const del = iconBtn("−");
    del.title = "Remove row";
    del.addEventListener("click", () => {
      state.steps.splice(idx, 1);
      if (state.steps.length === 0) state.steps.push({ path: "/home", text: "", typing: true, timeout: 0, kind: "cmd" });
      saveState();
      renderRows();
    });

    const add = iconBtn("+");
    add.title = "Add row below";
    add.addEventListener("click", () => {
      state.steps.splice(idx + 1, 0, { path: "", text: "", typing: false, timeout: 0, kind: "out" });
      saveState();
      renderRows();
    });

    ops.appendChild(del);
    ops.appendChild(add);

    row.appendChild(path);
    row.appendChild(cmdWrap);
    row.appendChild(typing);
    row.appendChild(timeout);
    row.appendChild(ops);

    rowsEl.appendChild(row);
  });
}

// --- Terminal preview render ---
function renderTerminalPreview({ showCursor = true } = {}) {
  terminalScreen.innerHTML = "";

  renderLines.forEach((ln, i) => {
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
      cmd.textContent = ln.text ?? "";

      line.appendChild(path);
      line.appendChild(dollar);
      line.appendChild(cmd);
    } else {
      const out = document.createElement("span");
      out.className = "segOut";
      out.textContent = ln.text ?? "";
      line.appendChild(out);
    }

    // cursor on last line
    const isLast = i === renderLines.length - 1;
    if (showCursor && isLast) {
      const cur = document.createElement("span");
      cur.className = "cursor";
      line.appendChild(cur);
    }

    terminalScreen.appendChild(line);
  });

  // if empty, show a cursor line
  if (renderLines.length === 0) {
    const line = document.createElement("div");
    line.className = "termLine";
    const cur = document.createElement("span");
    cur.className = "cursor";
    line.appendChild(cur);
    terminalScreen.appendChild(line);
  }
}

// --- Canvas render for GIF ---
function makeCanvasForGif() {
  const rect = terminalScreen.getBoundingClientRect();
  const scale = clamp(state.settings.gifScale, 1, 3);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(2, Math.floor(rect.width * scale));
  canvas.height = Math.max(2, Math.floor(rect.height * scale));
  return { canvas, scale };
}

function wrapText(ctx, text, maxWidth) {
  // simple wrap by words; if a word is too long, break by chars
  const words = (text || "").split(" ");
  const lines = [];
  let current = "";

  for (const w of words) {
    const test = current ? `${current} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
      continue;
    }

    if (current) lines.push(current);

    // word itself too long
    if (ctx.measureText(w).width > maxWidth) {
      let chunk = "";
      for (const ch of w) {
        const t = chunk + ch;
        if (ctx.measureText(t).width <= maxWidth) chunk = t;
        else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      current = chunk;
    } else {
      current = w;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function drawTerminalToCanvas(ctx, w, h, scale) {
  // background gradient
  const g = ctx.createRadialGradient(w * 0.3, h * 0.25, w * 0.05, w * 0.3, h * 0.25, w * 1.2);
  g.addColorStop(0, "#0a1428");
  g.addColorStop(1, "#0b1020");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  const fontSize = state.settings.fontSizePx * scale;
  const pad = state.settings.paddingPx * scale;

  ctx.font = `600 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
  ctx.textBaseline = "top";

  const lineH = Math.floor(fontSize * 1.45);
  let y = pad;

  const maxWidth = w - pad * 2;

  for (let i = 0; i < renderLines.length; i++) {
    const ln = renderLines[i];

    if (ln.type === "prompt") {
      const path = ln.path || "/";
      const dollar = " $ ";
      const cmd = ln.text || "";

      // We need wrapping, but keep colors: easiest is build a full string and draw same color except path/dollar.
      // We'll wrap as a combined string, then do a best-effort color split only on first line.
      const full = `${path}${dollar}${cmd}`;
      const wrapped = wrapText(ctx, full, maxWidth);

      for (let wi = 0; wi < wrapped.length; wi++) {
        const lineText = wrapped[wi];

        // draw with segments only if this is the first wrapped line and it starts with the prompt
        if (wi === 0 && lineText.startsWith(path)) {
          const x0 = pad;

          // path green
          ctx.fillStyle = "#39d353";
          ctx.fillText(path, x0, y);
          const pathW = ctx.measureText(path).width;

          // dollar gray
          ctx.fillStyle = "#b8c2d1";
          ctx.fillText(dollar, x0 + pathW, y);
          const dollarW = ctx.measureText(dollar).width;

          // cmd white (remaining)
          const rest = lineText.slice(path.length + dollar.length);
          ctx.fillStyle = "#e5e7eb";
          ctx.fillText(rest, x0 + pathW + dollarW, y);
        } else {
          ctx.fillStyle = "#e5e7eb";
          ctx.fillText(lineText, pad, y);
        }

        y += lineH;
        if (y > h - pad - lineH) break;
      }
    } else {
      const wrapped = wrapText(ctx, ln.text || "", maxWidth);
      ctx.fillStyle = "#e5e7eb";
      for (const t of wrapped) {
        ctx.fillText(t, pad, y);
        y += lineH;
        if (y > h - pad - lineH) break;
      }
    }

    if (y > h - pad - lineH) break;
  }

  // cursor on last line (simple block)
  const lastY = Math.min(h - pad - lineH, y);
  ctx.fillStyle = "#39d353";
  ctx.fillRect(pad, lastY + Math.floor(fontSize * 0.15), Math.floor(fontSize * 0.55), Math.floor(fontSize * 1.05));
}

// --- Simulation engine ---
function resetTerminal() {
  renderLines = [];
  renderTerminalPreview({ showCursor: true });
}

function ensurePromptLine(path) {
  const line = { type: "prompt", path: path || "/home", text: "" };
  renderLines.push(line);
  return line;
}

function ensureOutLine() {
  const line = { type: "out", text: "" };
  renderLines.push(line);
  return line;
}

async function runSimulation({ capture = false, gif = null } = {}) {
  const typingDelay = clamp(state.settings.typingMsPerChar, 1, 200);

  resetTerminal();
  cursorOn = true;

  let captureCanvas = null;
  let captureCtx = null;
  let captureScale = 1;

  if (capture) {
    const { canvas, scale } = makeCanvasForGif();
    captureCanvas = canvas;
    captureScale = scale;
    captureCtx = canvas.getContext("2d");
  }

  function captureFrame(delayMs) {
    if (!capture || !gif) return;

    // draw current terminal to canvas
    drawTerminalToCanvas(captureCtx, captureCanvas.width, captureCanvas.height, captureScale);

    gif.addFrame(captureCanvas, {
      copy: true,
      delay: clamp(delayMs, 0, 600000),
    });
  }

  // initial still
  renderTerminalPreview({ showCursor: true });
  captureFrame(200);

  for (const step of state.steps) {
    const isCmd = (step.kind || "cmd") === "cmd";
    const path = (step.path || "/home").trim();
    const text = step.text ?? "";

    if (isCmd) {
      const line = ensurePromptLine(path);

      if (step.typing) {
        line.text = "";
        renderTerminalPreview({ showCursor: true });
        captureFrame(typingDelay);

        for (const ch of text) {
          line.text += ch;
          renderTerminalPreview({ showCursor: true });
          captureFrame(typingDelay);
          if (!capture) await sleep(typingDelay);
        }
      } else {
        line.text = text;
        renderTerminalPreview({ showCursor: true });
        captureFrame(40);
        if (!capture) await sleep(40);
      }
    } else {
      const line = ensureOutLine();

      if (step.typing) {
        line.text = "";
        renderTerminalPreview({ showCursor: true });
        captureFrame(typingDelay);

        for (const ch of text) {
          line.text += ch;
          renderTerminalPreview({ showCursor: true });
          captureFrame(typingDelay);
          if (!capture) await sleep(typingDelay);
        }
      } else {
        line.text = text;
        renderTerminalPreview({ showCursor: true });
        captureFrame(40);
        if (!capture) await sleep(40);
      }
    }

    const t = clamp(step.timeout ?? 0, 0, 600000);
    // add a “still” frame with delay = timeout (cheap and keeps file small)
    renderTerminalPreview({ showCursor: true });
    captureFrame(t);

    if (!capture) await sleep(t);
  }

  // final hold
  renderTerminalPreview({ showCursor: true });
  captureFrame(400);
}

// --- Settings modal ---
function openSettings() {
  setTyping.value = String(state.settings.typingMsPerChar);
  setFontSize.value = String(state.settings.fontSizePx);
  setPad.value = String(state.settings.paddingPx);
  setScale.value = String(state.settings.gifScale);
  setQuality.value = String(state.settings.gifQuality);
  setTheme.value = state.settings.theme;

  modal.hidden = false;
}
function closeSettings() {
  modal.hidden = true;
}

// --- Events ---
btnSim.addEventListener("click", async () => {
  if (simRunning) return;
  simRunning = true;
  setExportUI({ show: false, status: "", busy: false, downloadableUrl: null });

  // quick normalize: treat empty text command with cmd kind as just a prompt line
  await runSimulation({ capture: false });

  simRunning = false;
});

btnExport.addEventListener("click", async () => {
  if (simRunning) return;
  simRunning = true;

  setExportUI({ show: true, status: "Exporting GIF…", busy: true, downloadableUrl: null });

  // IMPORTANT: tell gif.js where the worker is (CDN), so it works on GitHub Pages
  const workerScript = "https://cdn.jsdelivr.net/npm/gif.js.optimized/dist/gif.worker.js";

  // Build a fresh GIF
  const { canvas } = makeCanvasForGif();

  const gif = new GIF({
    workers: 2,
    quality: clamp(state.settings.gifQuality, 1, 30),
    workerScript,
    width: canvas.width,
    height: canvas.height,
  });

  try {
    // collect frames (fast, no waiting)
    await runSimulation({ capture: true, gif });

    await new Promise((resolve, reject) => {
      gif.on("finished", (blob) => {
        const url = URL.createObjectURL(blob);
        setExportUI({ show: true, status: "Done ✅", busy: false, downloadableUrl: url });
        resolve();
      });
      gif.on("abort", () => reject(new Error("GIF render aborted")));
      gif.render();
    });
  } catch (e) {
    console.error(e);
    setExportUI({ show: true, status: "Export failed. Open console for details.", busy: false, downloadableUrl: null });
  }

  simRunning = false;
});

btnSettings.addEventListener("click", openSettings);
closeModal.addEventListener("click", closeSettings);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeSettings();
});

btnSaveSettings.addEventListener("click", () => {
  state.settings.typingMsPerChar = clamp(parseInt(setTyping.value || "28", 10), 1, 200);
  state.settings.fontSizePx = clamp(parseInt(setFontSize.value || "16", 10), 10, 28);
  state.settings.paddingPx = clamp(parseInt(setPad.value || "18", 10), 8, 40);
  state.settings.gifScale = clamp(parseInt(setScale.value || "2", 10), 1, 3);
  state.settings.gifQuality = clamp(parseInt(setQuality.value || "10", 10), 1, 30);
  state.settings.theme = setTheme.value || "midnight";

  applySettingsToPreview();
  saveState();
  closeSettings();
});

btnReset.addEventListener("click", () => {
  state = structuredClone(DEFAULT_STATE);
  saveState();
  applySettingsToPreview();
  multilineToggle.checked = state.multiline;
  renderRows();
  resetTerminal();
  closeSettings();
});

multilineToggle.checked = !!state.multiline;
multilineToggle.addEventListener("change", () => {
  state.multiline = multilineToggle.checked;
  saveState();
  renderRows();
});

// init
renderRows();
resetTerminal();
