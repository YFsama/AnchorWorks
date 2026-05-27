// Electron main process for Anchorworks desktop client.
// Usage:
//   npm run dev              # runs Vite + Electron pointing at the dev server
//   npm run build && npm run electron:build  # produces an installer
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

const isDev = process.env.VITE_DEV_SERVER_URL || !app.isPackaged;
const devURL = process.env.VITE_DEV_SERVER_URL || 'http://127.0.0.1:5173';

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
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
