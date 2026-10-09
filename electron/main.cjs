// Electron main process for Anchorworks desktop client.
// Usage:
//   npm run dev              # runs Vite + Electron pointing at the dev server
//   npm run build && npm run electron:build  # produces an installer
const { app, BrowserWindow, Menu, shell, screen } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const devURL = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';

// ---------------------------------------------------------------------------
// Window geometry persistence — the Electron counterpart of
// tauri-plugin-window-state on the Tauri side. Bounds + maximised flag are
// saved to <userData>/window-state.json on close and restored on launch so
// the 1440×900 defaults below only seed the very first run.
// ---------------------------------------------------------------------------
const DEFAULT_BOUNDS = { width: 1440, height: 900 };
const MIN_WIDTH = 900;
const MIN_HEIGHT = 600;
const STATE_FILE = 'window-state.json';

function stateFilePath() {
  return path.join(app.getPath('userData'), STATE_FILE);
}

/** Read the last-saved window state. Returns null when missing, corrupt,
 *  or shaped like something we didn't write (defensive against hand edits
 *  and version skew). */
function loadWindowState() {
  try {
    const raw = JSON.parse(fs.readFileSync(stateFilePath(), 'utf8'));
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const x = num(raw.x); const y = num(raw.y);
    const width = num(raw.width); const height = num(raw.height);
    if (x === null || y === null || width === null || height === null) return null;
    return {
      x, y,
      width: Math.max(width, MIN_WIDTH),
      height: Math.max(height, MIN_HEIGHT),
      maximized: raw.maximized === true,
    };
  } catch {
    return null; // first launch, deleted file, or unreadable JSON
  }
}

/** True when at least part of the given rect overlaps a display's work
 *  area. Windows that landed entirely on a since-unplugged monitor would
 *  otherwise reopen invisible — those fall back to the defaults. */
function intersectsAnyWorkArea(state) {
  for (const display of screen.getAllDisplays()) {
    const wa = display.workArea;
    const overlapWidth = Math.min(state.x + state.width, wa.x + wa.width) - Math.max(state.x, wa.x);
    const overlapHeight = Math.min(state.y + state.height, wa.y + wa.height) - Math.max(state.y, wa.y);
    if (overlapWidth > 0 && overlapHeight > 0) return true;
  }
  return false;
}

/** Persist the window's normal (pre-maximise) bounds so un-maximising after
 *  restore returns to the size the user chose. Fire-and-forget: a failed
 *  write just means we fall back to defaults next launch. */
function saveWindowState(win) {
  const bounds = win.getNormalBounds();
  const state = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    maximized: win.isMaximized(),
  };
  try {
    fs.writeFileSync(stateFilePath(), JSON.stringify(state));
  } catch { /* userData unwritable — skip persistence this session */ }
}

function createWindow() {
  // Restore the previous session's geometry when it's still at least
  // partially on a connected display; otherwise reopen at the defaults.
  const saved = loadWindowState();
  const geometry = saved && intersectsAnyWorkArea(saved) ? saved : null;

  const win = new BrowserWindow({
    width: geometry ? geometry.width : DEFAULT_BOUNDS.width,
    height: geometry ? geometry.height : DEFAULT_BOUNDS.height,
    x: geometry ? geometry.x : undefined,
    y: geometry ? geometry.y : undefined,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    backgroundColor: '#15151a',
    autoHideMenuBar: false,
    titleBarStyle: 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // Disabling websecurity is sometimes needed to call the Anthropic API
      // directly from the renderer; we keep it on by default and rely on the
      // 'anthropic-dangerous-direct-browser-access' header instead.
    },
  });
  // Restoring maximise after `show` keeps the first paint flash-free; the
  // saved normal bounds above are reapplied when the user un-maximises.
  if (geometry && geometry.maximized) win.maximize();

  // Save on close (not on every move/resize tick) — one write per session.
  win.on('close', () => saveWindowState(win));

  if (isDev) {
    win.loadURL(devURL);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
