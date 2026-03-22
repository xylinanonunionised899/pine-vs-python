"use strict";

const { app, BrowserWindow, shell, ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");
const fs = require("fs");
const os = require("os");

// ── Debug log (lazy init so app.getPath is never called before ready) ─────────
let _logFile = null;
function logFile() {
  if (!_logFile) {
    try {
      _logFile = path.join(app.getPath("userData"), "startup.log");
    } catch (_) {
      _logFile = path.join(os.tmpdir(), "trading-startup.log");
    }
  }
  return _logFile;
}

// Swallow EPIPE/ERR_STREAM_DESTROYED on the console streams — these fire when
// Electron is launched as a GUI process (shortcut / installer) and stdout/stderr
// are disconnected. Without this the write below would throw and crash main.
if (process.stdout) process.stdout.on("error", () => {});
if (process.stderr) process.stderr.on("error", () => {});

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  // In packaged mode stdout may be a broken/closed pipe — skip it entirely.
  if (!app.isPackaged &&
      process.stdout &&
      !process.stdout.destroyed &&
      process.stdout.writable) {
    try { process.stdout.write(line); } catch (_) {}
  }
  try { fs.appendFileSync(logFile(), line); } catch (_) {}
}

// ── Config ────────────────────────────────────────────────────────────────────
const BACKEND_PORT = 8000;
const BACKEND_URL  = `http://127.0.0.1:${BACKEND_PORT}`;
const HEALTH_URL   = `${BACKEND_URL}/health`;
const MAX_HEALTH_ATTEMPTS = 60;
const HEALTH_INTERVAL_MS  = 1000;

// ── State ─────────────────────────────────────────────────────────────────────
let mainWindow     = null;
let backendProcess = null;
let backendReady   = false;
let statusMsg      = "Starting backend service…";

// ── Backend helpers ───────────────────────────────────────────────────────────
function getBackendExePath() {
  if (app.isPackaged) {
    const p = path.join(process.resourcesPath, "backend", "trading-backend.exe");
    log(`isPackaged → backend: ${p}  exists=${fs.existsSync(p)}`);
    return p;
  }
  // win-unpacked: resources/backend/ sits next to the exe
  const candidate = path.join(
    path.dirname(process.execPath), "resources", "backend", "trading-backend.exe"
  );
  log(`win-unpacked candidate: ${candidate}  exists=${fs.existsSync(candidate)}`);
  if (fs.existsSync(candidate)) return candidate;
  log("dev mode — no backend exe, will poll for existing server");
  return null;
}

function setStatus(msg) {
  statusMsg = msg;
  log(`STATUS: ${msg}`);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript(
      `document.getElementById('status-text') && (document.getElementById('status-text').textContent = ${JSON.stringify(msg)})`
    ).catch(() => {});
  }
}

function startBackend() {
  const exePath = getBackendExePath();
  if (!exePath) {
    setStatus("Connecting to backend…");
    return waitForBackend();
  }
  if (!fs.existsSync(exePath)) {
    return Promise.reject(
      new Error(`Backend not found:\n${exePath}\n\nRun build-installer.ps1 first.`)
    );
  }

  setStatus("Starting backend service…");
  log(`Spawning: ${exePath}`);
  log(`cwd: ${path.dirname(exePath)}`);

  backendProcess = spawn(exePath, [], {
    cwd: path.dirname(exePath),   // ← critical: run in its own directory
    detached: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  log(`Backend PID: ${backendProcess.pid}`);

  // Capture backend output for debugging
  const backendLog = path.join(os.tmpdir(), "trading-backend.log");
  const blogStream = fs.createWriteStream(backendLog, { flags: "a" });
  backendProcess.stdout.pipe(blogStream);
  backendProcess.stderr.pipe(blogStream);
  backendProcess.stdout.on("data", (d) => log(`[backend] ${d.toString().trim()}`));
  backendProcess.stderr.on("data", (d) => log(`[backend-err] ${d.toString().trim()}`));

  backendProcess.on("error", (err) => {
    log(`Backend spawn error: ${err.message}`);
  });
  backendProcess.on("exit", (code, signal) => {
    log(`Backend exited — code=${code} signal=${signal}`);
    backendProcess = null;
  });

  log(`Backend log: ${backendLog}`);
  return waitForBackend();
}

function waitForBackend(attempts = 0) {
  return new Promise((resolve, reject) => {
    function check(n) {
      if (n >= MAX_HEALTH_ATTEMPTS) {
        log(`Health check timed out after ${n}s`);
        return reject(new Error(
          `Backend did not start after ${MAX_HEALTH_ATTEMPTS}s.\n\nCheck log: ${logFile()}`
        ));
      }

      if (n === 5)  setStatus("Loading Python engine…");
      if (n === 15) setStatus("Initialising data store…");
      if (n === 25) setStatus("Warming up FastAPI…");
      if (n === 35) setStatus("Almost ready…");

      const req = http.get(HEALTH_URL, (res) => {
        if (n % 5 === 0) log(`Health attempt ${n}: HTTP ${res.statusCode}`);
        if (res.statusCode === 200) {
          // Read body to check frontend_ready
          let body = "";
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => {
            try {
              const data = JSON.parse(body);
              log(`Health body: ${body.trim()}`);
              if (data.frontend_ready === false) {
                // Backend is up but SPA bundle missing — fail immediately
                backendReady = false;
                const backendPath = getBackendExePath() || "(dev mode)";
                reject(new Error(
                  `Backend started but frontend bundle (frontend_dist/) was not found.\n\n` +
                  `Backend exe: ${backendPath}\n\n` +
                  `This means the backend was not built with the frontend included.\n` +
                  `Re-run build-installer.ps1 without -SkipBackend and -SkipFrontend.`
                ));
                return;
              }
            } catch (_) {
              log("Health body parse failed — allowing (older backend without frontend_ready)");
            }
            backendReady = true;
            setStatus("Ready!");
            log("Backend healthy and frontend ready ✓");
            resolve();
          });
        } else {
          setTimeout(() => check(n + 1), HEALTH_INTERVAL_MS);
        }
      });
      req.on("error", (err) => {
        if (n % 10 === 0) log(`Health attempt ${n}: ${err.code}`);
        setTimeout(() => check(n + 1), HEALTH_INTERVAL_MS);
      });
      req.setTimeout(900, () => { req.destroy(); });
    }
    setTimeout(() => check(attempts), 800);
  });
}

function stopBackend() {
  if (backendProcess) {
    log("Killing backend…");
    try { backendProcess.kill(); } catch (_) {}
    backendProcess = null;
  }
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "Trading Strategy Comparator",
    backgroundColor: "#0b1220",
    show: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.webContents.on("did-fail-load", (event, code, desc, url) => {
    log(`did-fail-load: code=${code} "${desc}" url=${url}`);
  });
  mainWindow.webContents.on("did-finish-load", () => {
    log(`did-finish-load: ${mainWindow.webContents.getURL()}`);
  });
  mainWindow.webContents.on("render-process-gone", (_, details) => {
    log(`render-process-gone: reason=${details.reason} exit=${details.exitCode}`);
  });
  mainWindow.webContents.on("console-message", (_, level, msg) => {
    if (level >= 2) log(`[renderer-console] ${msg}`);  // warnings + errors only
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => { mainWindow = null; });

  log(`Loading loading.html from: ${path.join(__dirname, "loading.html")}`);
  mainWindow.loadFile(path.join(__dirname, "loading.html"))
    .then(() => log("loading.html rendered"))
    .catch((e) => log(`loading.html load error: ${e.message}`));

  return mainWindow;
}

function showError(message) {
  log(`showError: ${message.substring(0, 300)}`);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const safeMsg = message.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body{margin:0;background:#0b1220;color:#d7e1f3;font-family:'Segoe UI',sans-serif;
       display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;}
  .box{max-width:560px;text-align:center;padding:2rem;}
  h2{color:#ff6b6b;margin-bottom:1rem;font-size:1.2rem;}
  pre{background:#0d1829;border-radius:8px;padding:1rem;text-align:left;font-size:0.75rem;
      color:#aab4c8;overflow:auto;white-space:pre-wrap;max-height:200px;}
  p{opacity:.5;font-size:.78rem;margin-top:1.5rem;}
</style></head><body>
<div class="box">
  <h2>&#9888; Failed to start backend</h2>
  <pre>${safeMsg}</pre>
  <p>Log: ${logFile()}</p>
  <p>Close this window and relaunch the app.</p>
</div></body></html>`;
  mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.handle("get-backend-status", () => ({ ready: backendReady, url: BACKEND_URL }));

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  log(`=== App starting ===`);
  log(`isPackaged=${app.isPackaged}  execPath=${process.execPath}`);
  log(`resourcesPath=${process.resourcesPath}`);
  log(`Log file: ${logFile()}`);

  createWindow();

  try {
    await startBackend();
    log(`Navigating to ${BACKEND_URL}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(BACKEND_URL);
      log("loadURL complete ✓");
    }
  } catch (err) {
    log(`STARTUP ERROR: ${err.message}`);
    showError(err.message);
  }
});

app.on("window-all-closed", () => { stopBackend(); app.quit(); });
app.on("before-quit",       () => { stopBackend(); });
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
