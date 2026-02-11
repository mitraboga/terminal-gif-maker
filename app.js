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
  35: "#
