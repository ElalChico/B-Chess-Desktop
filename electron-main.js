'use strict';
const { app, BrowserWindow, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

let mainWindow = null;
let updateNotified = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 640,
    icon: path.join(__dirname, 'icono.ico'),
    backgroundColor: '#0e0e10',
    title: 'B-Chess Desktop',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.once('ready-to-show', function () {
    if (mainWindow) {
      try { mainWindow.setBackgroundColor('#0e0e10'); } catch (e) {}
      mainWindow.show();
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.webContents.setWindowOpenHandler(function ({ url }) {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// ================= Auto-update desde GitHub Releases (igual que el APK) =================
// Si hay un release nuevo en ElalChico/B-Chess, descarga el instalador
// y se aplica al reiniciar/actualizar la app, sin desinstalar ni perder datos.
function setupAutoUpdater() {
  if (process.platform !== 'win32') return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', function (err) {
    console.error('[updater] error:', err == null ? 'unknown' : (err.stack || err.message || err));
  });

  autoUpdater.on('update-available', function (info) {
    if (updateNotified) return;
    updateNotified = true;
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Descargar y actualizar', 'Más tarde'],
        defaultId: 0,
        cancelId: 1,
        title: 'Actualización disponible',
        message: 'Hay una versión nueva de B-Chess Desktop (' + info.version + ')',
        detail: 'Se descargará en segundo plano y se aplicará al reiniciar la app. Tu historial y perfil se conservan.'
      }).then(function (res) {
        if (res.response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
    }
  });

  autoUpdater.on('update-downloaded', function (info) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        buttons: ['Reiniciar y actualizar', 'Al cerrar la app'],
        defaultId: 0,
        cancelId: 1,
        title: 'Actualización lista',
        message: 'B-Chess Desktop v' + info.version + ' está lista para instalarse',
        detail: 'Al reiniciar, la nueva versión quedará instalada y tus partidas se conservarán.'
      }).then(function (res) {
        if (res.response === 0) autoUpdater.quitAndInstall();
      });
    }
  });

  autoUpdater.checkForUpdates().catch(function (err) {
    console.error('[updater] checkForUpdates:', err == null ? 'unknown' : err.message);
  });
}

app.whenReady().then(function () {
  createWindow();
  setupAutoUpdater();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
