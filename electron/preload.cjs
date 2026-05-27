// Preload bridge — exposes a tiny safe API to the renderer.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('vectorStudio', {
  isDesktop: true,
  platform: process.platform,
  versions: { ...process.versions },
});
