'use strict';
const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const net = require('net');
const fs = require('fs');
const os = require('os');

let mainWindow = null;
let updateNotified = false;

// ================= LAN/TCP state (Host-only server) =================
// Se admite UNA partida simultánea por instancia (como el APK).
let lanServer = null;
let lanConnections = new Map(); // remoteAddress:port → net.Socket (libro)
let lanHostGuest = null;        // host: el invitado aceptado (socket activo)
let lanOutbound = null;         // invitado: nuestro socket hacia el anfitrión

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

// ================= Limpieza de cachés de actualización obsoletas =================
// El auto-updater descarga el instalador nuevo en una caché temporal; si no se barren,
// cada versión deja su .exe ocupando espacio. Al arrancar, eliminamos cualquier
// residuo de actualizaciones ya aplicadas (queda instalada la última versión).
function cleanupUpdaterCaches() {
  try {
    var localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    var candidates = [
      path.join(os.tmpdir(), 'b-chess-desktop-updater'),
      path.join(os.tmpdir(), 'B-Chess-Desktop-updater'),
      path.join(localAppData, 'b-chess-desktop-updater'),
      path.join(localAppData, 'B-Chess-Desktop-updater'),
      path.join(localAppData, 'b-chess-desktop', 'pending'),
      path.join(localAppData, 'B-Chess-Desktop', 'pending')
    ];
    candidates.forEach(function (dir) {
      try {
        if (!dir || !fs.existsSync(dir)) return;
        // Barra todo el contenido de la caché de actualizadores (ya están aplicadas)
        fs.readdirSync(dir).forEach(function (entry) {
          try { fs.rmSync(path.join(dir, entry), { recursive: true, force: true }); } catch (e) {}
        });
        try { fs.rmdirSync(dir); } catch (e) {}
        console.log('[updater] caché limpiada:', dir);
      } catch (e) {
        console.error('[updater] no se pudo limpiar', dir, e.message || e);
      }
    });
  } catch (e) {
    console.error('[updater] cleanupUpdaterCaches:', e.message || e);
  }
}

// ================= Auto-update desde GitHub Releases (igual que el APK) =================
function setupAutoUpdater() {
  if (process.platform !== 'win32') return;

  // Forzar el feed de GitHub Releases para que siempre apunte al release correcto
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: 'ElalChico',
    repo: 'B-Chess-Desktop'
  });

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('error', function (err) {
    console.error('[updater] error:', err == null ? 'unknown' : (err.stack || err.message || err));
  });

  autoUpdater.on('checking-for-update', function () {
    console.log('[updater] buscando actualizaciones...');
  });

  autoUpdater.on('update-available', function (info) {
    console.log('[updater] actualización disponible:', info.version);
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

  autoUpdater.on('update-not-available', function (info) {
    console.log('[updater] estás en la última versión:', info.version);
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

// ================= LAN/TCP bridge (Desktop ↔ Desktop / Desktop ↔ APK) =================
const LAN_PORT = 5891;

function broadcastToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, payload);
  }
}

function startLanServer(port) {
  return new Promise(function (resolve, reject) {
    if (lanServer || lanHostGuest) {
      stopLanServer(); // cierra servidor y destruye rival previo
    }
    var server = net.createServer(function (socket) {
      var addr = socket.remoteAddress + ':' + socket.remotePort;
      // Si ya había un rival conectado, rechazar extras (una partida simultánea)
      if (lanHostGuest && !lanHostGuest.destroyed) {
        try { socket.destroy(); } catch (e) {}
        return;
      }
      lanHostGuest = socket;
      lanConnections.set(addr, socket);
      broadcastToRenderer('lan-state', { state: 'client_connected', address: addr });

      socket.setEncoding('utf8');
      var buffer = '';

      socket.on('data', function (chunk) {
        buffer += chunk;
        var lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line in buffer
        lines.forEach(function (line) {
          line = line.trim();
          if (line) {
            broadcastToRenderer('lan-message', { from: addr, data: line });
          }
        });
      });

      socket.on('close', function () {
        lanConnections.delete(addr);
        if (lanHostGuest === socket) lanHostGuest = null;
        broadcastToRenderer('lan-state', { state: 'client_disconnected', address: addr });
      });

      socket.on('error', function (err) {
        console.error('[lan] socket error', err);
        lanConnections.delete(addr);
        if (lanHostGuest === socket) lanHostGuest = null;
        broadcastToRenderer('lan-state', { state: 'client_disconnected', address: addr });
      });

      // Handshake: send greeting so guest knows we're alive
      socket.write('BCHESS-PC 1\n');
    });

    server.listen(port || LAN_PORT, '0.0.0.0', function () {
      lanServer = server;
      broadcastToRenderer('lan-state', { state: 'host_ready', port: server.address().port });
      resolve({ port: server.address().port });
    });

    server.on('error', function (err) {
      console.error('[lan] server error', err);
      broadcastToRenderer('lan-state', { state: 'host_error', error: err.message });
      reject(err);
    });
  });
}

function stopLanServer() {
  if (lanHostGuest) {
    try { lanHostGuest.destroy(); } catch (e) {}
    lanHostGuest = null;
  }
  lanConnections.forEach(function (socket, addr) {
    try { socket.destroy(); } catch (e) {}
  });
  lanConnections.clear();
  if (lanServer) {
    try { lanServer.close(); } catch (e) {}
    lanServer = null;
  }
  broadcastToRenderer('lan-state', { state: 'host_stopped' });
  return true;
}

function connectLanClient(host, port) {
  return new Promise(function (resolve, reject) {
    var client = net.createConnection({ host: host, port: port || LAN_PORT }, function () {
      broadcastToRenderer('lan-state', { state: 'guest_connected', host: host, port: client.remotePort });
      client.write('BCHESS-PC 1\n');
      resolve({ host: client.remoteAddress, port: client.remotePort });
    });

    client.setEncoding('utf8');
    var buffer = '';

    client.on('data', function (chunk) {
      buffer += chunk;
      var lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(function (line) {
        line = line.trim();
        if (line) {
          broadcastToRenderer('lan-message', { from: 'host', data: line });
        }
      });
    });

    client.on('close', function () {
      if (lanOutbound === client) lanOutbound = null;
      broadcastToRenderer('lan-state', { state: 'guest_disconnected' });
    });

    client.on('error', function (err) {
      console.error('[lan] client error', err);
      if (lanOutbound === client) lanOutbound = null;
      broadcastToRenderer('lan-state', { state: 'guest_error', error: err.message });
      reject(err);
    });

    // store client globally so we can send messages later
    lanOutbound = client;
    lanConnections.set('client', client);
  });
}

// IPC handlers (async)
ipcMain.handle('lan-host', async function (event, port) {
  return await startLanServer(port);
});

// IPs locales (IPv4, sin loopback) para que el anfitrión pueda compartirlas
ipcMain.handle('lan-get-addresses', async function () {
  try {
    var out = [];
    var ifaces = os.networkInterfaces();
    Object.keys(ifaces || {}).forEach(function (name) {
      (ifaces[name] || []).forEach(function (iface) {
        if (!iface || iface.internal) return;
        var family = iface.family;
        if (family === 'IPv4' || family === 4) out.push({ name: name, address: iface.address });
      });
    });
    return out;
  } catch (e) {
    return [];
  }
});

ipcMain.handle('lan-stop', async function () {
  return stopLanServer();
});

ipcMain.handle('lan-connect', async function (event, host, port) {
  return await connectLanClient(host, port);
});

ipcMain.handle('lan-send', async function (event, target, message) {
  // target 'client' = el rival activo (host→invitado aceptado o invitado→anfitrión)
  var socket = target === 'client'
    ? (lanHostGuest || lanOutbound || lanConnections.get('client'))
    : (lanConnections.get(target) || lanHostGuest || lanOutbound);
  if (!socket) return false;
  try {
    socket.write(message + '\n');
    return true;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('lan-disconnect', async function () {
  stopLanServer(); // destruye anfitrión + rival aceptado
  if (lanOutbound) try { lanOutbound.destroy(); } catch (e) {}
  lanOutbound = null;
  var client = lanConnections.get('client');
  if (client) try { client.destroy(); } catch (e) {}
  lanConnections.clear();
  return true;
});

// ================= App lifecycle =================
app.whenReady().then(function () {
  createWindow();
  // Configurar auto-updater DESPUÉS de que la ventana esté lista
  mainWindow.once('ready-to-show', function () {
    setTimeout(setupAutoUpdater, 3000);
  });
  // Borra instaladores de versiones anteriores de la caché de actualización
  cleanupUpdaterCaches();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
  stopLanServer();
});

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});