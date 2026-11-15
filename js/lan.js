/*
 * B-Chess Desktop · Modo LAN (Red local / PC↔PC y PC↔APK)
 * Modo host (crea sala): servidor TCP en 0.0.0.0:5891 (LAN).
 * Modo guest: conexión TCP a IP:puerto del anfitrión.
 * Protocolo de líneas compatible con el APK (v:2 JSON por línea).
 */
(function () {
  'use strict';

  const LAN_PORT = 5891;
  const state = {
    isHost: false,
    connected: false,
    code: null,
    name: 'Jugador',
    remoteName: 'Rival'
  };

  const handlers = {
    onCreated: null,
    onConnected: null,
    onMessage: null,
    onDisconnected: null,
    onError: null
  };

  const listeners = [];
  const stateListeners = [];

  // ================= Emisión =================
  function emitRaw(line) {
    listeners.forEach(function (cb) { try { cb(line); } catch (e) {} });
    if (handlers.onMessage) handlers.onMessage(line);
  }

  function emitState(s) {
    stateListeners.forEach(function (cb) { try { cb(s); } catch (e) {} });
  }

  // ================= API público (mirror BCHESS_NET) =================
  function setName(n) { state.name = n || 'Jugador'; }
  function setRemoteName(n) { state.remoteName = n || 'Rival'; }
  function getCode() { return state.code; }
  function isHost() { return state.isHost; }
  function isConnected() { return state.connected; }
  function isElectron() { return !!(window.BCHESS_LAN && window.BCHESS_LAN.isElectron); }

  function onState(cb) { stateListeners.push(cb); }
  function onMessage(cb) { listeners.push(cb); }

  function createRoom(code, _handlers) {
    if (!window.BCHESS_LAN || !window.BCHESS_LAN.host) {
      _handlers && _handlers.onError && _handlers.onError('Modo LAN solo disponible en Electron (no navegador)');
      return;
    }
    handlers.onCreated = _handlers && _handlers.onCreated;
    handlers.onConnected = _handlers && _handlers.onConnected;
    handlers.onMessage = _handlers && _handlers.onMessage;
    handlers.onDisconnected = _handlers && _handlers.onDisconnected;
    handlers.onError = _handlers && _handlers.onError;

    // code puede traer el puerto deseado ("5891"); si no, puerto por defecto
    var port = parseInt(code, 10);
    if (!port || isNaN(port) || port < 1024 || port > 65535) port = LAN_PORT;

    state.isHost = true;
    state.connected = false;
    state.code = 'LAN:' + port;
    state.port = port;
    _handlers.onCreated && _handlers.onCreated(state.code);
    emitState({ state: 'connecting', code: state.code, host: true, port: port });

    window.BCHESS_LAN.host(port).then(function (result) {
      // servidor listo, emitiendo connecting (el invitado se conectará)
      emitState({ state: 'connecting', code: state.code, host: true, port: result.port });
    }).catch(function (err) {
      emitState({ state: 'error', reason: (err && err.message) || String(err) });
      if (handlers.onError) handlers.onError('No se pudo abrir LAN: ' + ((err && err.message) || err));
    });
  }

  function joinRoom(code, _handlers) {
    if (!window.BCHESS_LAN || !window.BCHESS_LAN.connect) {
      _handlers && _handlers.onError && _handlers.onError('Modo LAN solo disponible en Electron');
      return;
    }
    handlers.onCreated = _handlers && _handlers.onCreated;
    handlers.onConnected = _handlers && _handlers.onConnected;
    handlers.onMessage = _handlers && _handlers.onMessage;
    handlers.onDisconnected = _handlers && _handlers.onDisconnected;
    handlers.onError = _handlers && _handlers.onError;

    var raw = (code || '').trim();
    var hostIP = raw;
    var port = LAN_PORT;
    var idx = raw.indexOf(':');
    if (idx !== -1) {
      hostIP = raw.substring(0, idx);
      port = parseInt(raw.substring(idx + 1), 10) || LAN_PORT;
    }
    if (!hostIP) {
      if (handlers.onError) handlers.onError('Introduce IP del anfitrión');
      return;
    }
    state.isHost = false;
    state.connected = false;
    state.code = hostIP + ':' + port;
    emitState({ state: 'connecting', code: hostIP + ':' + port, host: false });

    window.BCHESS_LAN.connect(hostIP, port).then(function (result) {
      state.connected = true;
      emitState({ state: 'connected', code: state.code, host: false });
      _handlers.onConnected && _handlers.onConnected();
    }).catch(function (err) {
      var msg = (err && err.message) || String(err);
      emitState({ state: 'error', reason: msg });
      if (handlers.onError) handlers.onError('No se pudo conectar a ' + hostIP + ':' + port + ' — ' + msg);
    });
  }

  function sendLine(line) {
    if (!state.connected) return false;
    if (isElectron()) {
      return window.BCHESS_LAN.send('client', line);
    }
    return false;
  }

  function cleanup(removeRoom) {
    state.connected = false;
    state.isHost = false;
    state.code = null;
    if (isElectron() && window.BCHESS_LAN && window.BCHESS_LAN.disconnect) {
      try { window.BCHESS_LAN.disconnect(); } catch (e) {}
    }
    emitState({ state: 'idle' });
  }

  // ================= Wire up preload IPC → renderer =================
  if (isElectron() && window.BCHESS_LAN) {
    if (window.BCHESS_LAN.onMessage) {
      window.BCHESS_LAN.onMessage(function (payload) {
        var line = String(payload.data || '').trim();
        if (!line) return;
        emitRaw(line);
      });
    }
    if (window.BCHESS_LAN.onState) {
      window.BCHESS_LAN.onState(function (payload) {
        if (!payload) return;
        if (payload.state === 'host_ready') emitState({ state: 'connecting', code: state.code, host: true, port: payload.port });
        else if (payload.state === 'host_stopped') emitState({ state: 'idle' });
        else if (payload.state === 'guest_connected') { state.connected = true; emitState({ state: 'connected', code: state.code, host: state.isHost }); if (handlers.onConnected) handlers.onConnected(); }
        else if (payload.state === 'guest_disconnected' || payload.state === 'client_disconnected') { state.connected = false; emitState({ state: 'disconnected' }); if (handlers.onDisconnected) handlers.onDisconnected('El rival desconectó'); }
        else if (payload.state === 'client_connected') { state.connected = true; emitState({ state: 'connected', code: state.code, host: false }); if (handlers.onConnected) handlers.onConnected(); }
        else if (payload.state === 'host_error' || payload.state === 'guest_error') emitState({ state: 'error', reason: payload.error });
      });
    }
  }

  return {
    setName: setName,
    setRemoteName: setRemoteName,
    getCode: getCode,
    isHost: isHost,
    isConnected: isConnected,
    createRoom: createRoom,
    joinRoom: joinRoom,
    sendLine: sendLine,
    cleanup: cleanup,
    onState: onState,
    onMessage: onMessage,
    isElectron: isElectron
  };
})();