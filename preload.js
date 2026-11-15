'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('BCHESS_DESKTOP', {
  platform: process.platform,
  version: require('electron').app.getVersion()
});

// Bridge for LAN/TCP (host-only architecture)
contextBridge.exposeInMainWorld('BCHESS_LAN', {
  // Host: crea servidor TCP
  host: function (port) {
    return ipcRenderer.invoke('lan-host', port || 5891);
  },
  // Client: conecta a un host
  connect: function (host, port) {
    return ipcRenderer.invoke('lan-connect', host, port || 5891);
  },
  // Enviar mensaje (línea de texto)
  send: function (target, message) {
    // target puede ser 'client' o la dirección del cliente
    return ipcRenderer.invoke('lan-send', target, message);
  },
  // Cerrar servidor y todas las conexiones
  disconnect: function () {
    return ipcRenderer.invoke('lan-disconnect');
  },
  // IPs LAN del equipo (IPv4) para compartir con el rival
  getLocalAddresses: function () {
    return ipcRenderer.invoke('lan-get-addresses');
  },
  // Suscribirse a mensajes/eventos
  onMessage: function (callback) {
    var handler = function (event, payload) {
      callback(payload);
    };
    ipcRenderer.on('lan-message', handler);
    return function () {
      ipcRenderer.removeListener('lan-message', handler);
    };
  },
  onState: function (callback) {
    var handler = function (event, payload) {
      callback(payload);
    };
    ipcRenderer.on('lan-state', handler);
    return function () {
      ipcRenderer.removeListener('lan-state', handler);
    };
  },
  // Detecta si estamos en Electron (no navegador)
  isElectron: true
});