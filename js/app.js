/*
 * B-Chess V2 · Lógica principal
 * Tablero con temas/piezas, reloj, IA (Stockfish/Atlas) y P2P (Firebase + WebRTC).
 * Sin sonido de colocación de pieza. Reloj siempre con sonidos lichess.
 */
(function () {
  'use strict';

  // Referencias originales (P2P y LAN)
  var _p2pNet = window.BCHESS_NET;
  var _lanNet = window.BCHESS_LAN;
  var currentTransport = 'p2p'; // 'p2p' | 'lan'

  // Estado de conexión por transporte (lo que muestras las antenas: no depende del modo elegido)
  var transportStates = { p2p: 'idle', lan: 'idle' };

  function antStateFor(connState) {
    if (connState === 'connected') return 'connected';
    if (connState === 'connecting' || connState === 'failed') return connState === 'failed' ? 'failed' : 'connecting';
    return 'idle';
  }

  function antLabel(state) {
    if (state === 'connected') return 'Conectado';
    if (state === 'connecting') return 'Conectando…';
    if (state === 'failed') return 'Error';
    return 'Apagado';
  }

  function updateAntennas() {
    ['p2p', 'lan'].forEach(function (m) {
      var el = document.getElementById('antenna-' + m);
      if (!el) return;
      var st = transportStates[m] || 'idle';
      el.setAttribute('data-state', st);
      var lbl = el.querySelector('.ant-state');
      if (lbl) lbl.textContent = antLabel(st);
    });
  }

  function setTransportState(mode, connState) {
    transportStates[mode] = antStateFor(connState);
    updateAntennas();
  }

  // En la PWA (navegador) no hay sockets TCP crudos → LAN solo en el .exe (Electron)
  function isDesktopApp() {
    return !!(window.BCHESS_DESKTOP && window.BCHESS_DESKTOP.platform) ||
           !!(window.BCHESS_LAN && window.BCHESS_LAN.isElectron === true);
  }

  function lanAvailable() { return isDesktopApp(); }

  // En la web: tile LAN deshabilitado con aviso; antena LAN oculta
  function disableLanForWeb() {
    if (isDesktopApp()) return;
    var tile = document.getElementById('conn-mode-lan');
    if (tile) {
      tile.disabled = true;
      tile.classList.add('conn-mode-soon');
      tile.classList.remove('conn-mode-active');
      tile.title = 'LAN solo disponible en la app de escritorio (.exe)';
      var sub = tile.querySelector('.conn-mode-sub');
      if (sub) sub.textContent = 'Solo en .exe';
    }
    var antenna = document.getElementById('antenna-lan');
    if (antenna) antenna.classList.add('hidden');
    var lanPanel = document.getElementById('online-lan');
    if (lanPanel) lanPanel.classList.add('hidden');
  }

  // Activa un transporte swappando la implementación global BCHESS_NET
  function applyTransport(mode) {
    if (mode === 'lan' && !lanAvailable()) mode = 'p2p';
    currentTransport = mode;
    S.transport = mode;
    window.BCHESS_NET = (mode === 'lan' && _lanNet) ? _lanNet : _p2pNet;
    var p2pSec = document.getElementById('online-p2p');
    var lanSec = document.getElementById('online-lan');
    if (p2pSec) p2pSec.classList.toggle('hidden', mode !== 'p2p');
    if (lanSec) lanSec.classList.toggle('hidden', mode !== 'lan');

    var p2pBtn = document.getElementById('conn-mode-p2p');
    var lanBtn = document.getElementById('conn-mode-lan');
    if (p2pBtn) p2pBtn.classList.toggle('conn-mode-active', mode === 'p2p');
    if (lanBtn) lanBtn.classList.toggle('conn-mode-active', mode === 'lan');
    updateAntennas();

    // Estado en Home (opacidad del indicador) — según transporte actual
    var homeDot = document.querySelector('#home-conn-state .conn-dot');
    var isConn = transportStates[mode] === 'connected';
    if (homeDot) homeDot.classList.toggle('on', isConn);
    var homeTxt = document.getElementById('home-conn-state');
    if (homeTxt) homeTxt.innerHTML = '<span class="conn-dot' + (isConn ? ' on' : '') + '"></span>' + (mode === 'lan' ? 'LAN' : 'P2P') + (isConn ? ' conectado' : ' desconectado');
  }

  // ================= Estado global =================  
  var S = {
    hasBoard: false,
    transport: 'p2p',
    settings: {
      name: 'Jugador', pieceSet: 'cburnett', boardTheme: 'lichess',
      sound: true, volume: 80, engine: 'stockfish', difficulty: 5, soundPack: 'gm', aiSpeed: 'fast', aiWinStreak: 0,
      premoveStyle: 'movefull', aiProgressEnabled: true,
      colorAI: 'r', clockAI: '300+0', colorOnline: 'r', clockOnline: '300+0',
      settingsVersion: 2, homeProfileSummary: true, historyCollapsed: false,
      premove: true,
      showCoordinates: true,
      showLegalMoves: true,
      showCheck: true,
      showLastMove: true,
      privacy: { sharePhoto: true, shareIdentity: true, shareStats: true, shareHistory: true }
    },
    game: null,
    mode: 'ai',
    localColor: 'w',
    orientation: 'w',
    selected: null,
    legalTargets: [],
    gameOver: false,
    timeMs: 0,
    incrementMs: 0,
    clocks: { w: 0, b: 0 },
    clockTimer: null,
    lowtime: { w: false, b: false },
    countdown: { w: 0, b: 0 },
    lastMove: null,
    fens: ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'],
    viewPly: 0,
    pendingPromotion: null,
    aiThinking: false,
    aiMoveTimer: null,
    applyingRemote: false,
    onlineConnected: false,
    connState: 'idle',
    rematchCount: 0,
    currentScreen: 'home',
    // Para reproducción automática y guardado de tiempos
    autoPlaying: false,
    autoPlayTimer: null,
    playbackSpeed: 1,
    moveTimes: [], // [{ply, whiteMs, blackMs}] para PGN con tiempos
    reviewingGame: false,
    // Premove - ahora es una COLA (array) para múltiples premoves como chess.com
    premoveQueue: [], // [{from, to, promotion}]
    // Conteo regresivo antes de empezar (como el APK)
    countdownTick: null,     // 3, 2, 1 o null
    countdownTimer: null,
    onlineLastHostColor: 'w', // último hostColor (alternancia en torneo)
    remoteProfile: null,      // perfil del rival recibido por PROFILE
    // Torneo / online
    roomMode: 'individual',  // 'individual' | 'torneo'
    roomRounds: 3,
    tournament: null,        // {games, timeMs, incrementMs, played, localWins, remoteWins, draws, active, finished}
    clockSyncTs: 0,          // último envío CLOCK (anfitrión)
    lastLowtimeSec: 99       // para beeps de bajo tiempo
  };

  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  function showToast(msg) {
    var t = $('#toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  window.showToast = showToast;

  function setScreen(name) {
    S.currentScreen = name;
    $$('.screen').forEach(function (el) { el.classList.remove('active'); });
    var el = $('#screen-' + name);
    if (el) el.classList.add('active');
    if (name === 'home') updateHomeWelcome();
    if (name === 'profile' && window.BCHESS_STATS) BCHESS_STATS.onProfileShown();
    if (name === 'online') {
      // Restaurar transporte elegido
      applyTransport(S.transport || 'p2p');
    }
    updateRailActive();
    try { window.scrollTo(0, 0); } catch (e) {}
  }

  // ================= Fullscreen =================
  function syncFullscreenButton() {
    var btn = document.getElementById('btn-fullscreen-game');
    if (!btn) return;
    var active = document.body.classList.contains('fullscreen');
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.title = active ? 'Salir de pantalla completa' : 'Pantalla completa';
    btn.setAttribute('aria-label', btn.title);
    // Estilos inline para garantizar que se vean aun antes que el CSS cargue
    if (active) {
      btn.style.background = 'linear-gradient(180deg, rgba(111,174,143,.35), rgba(111,174,143,.22))';
      btn.style.borderColor = 'rgba(159,224,186,.65)';
      btn.style.color = '#9fe0ba';
      btn.style.boxShadow = '0 0 0 2px rgba(159,224,186,.55), 0 0 22px rgba(159,224,186,.45)';
      btn.style.animation = 'fullscreen-pulse 1.4s ease-in-out infinite';
    } else {
      btn.style.background = '';
      btn.style.borderColor = '';
      btn.style.color = '';
      btn.style.boxShadow = '';
      btn.style.animation = '';
    }
    var label = btn.querySelector('.fullscreen-label');
    if (label) label.textContent = active ? 'Salir de pantalla' : 'Pantalla completa';
  }

  // Sincroniza el estado del botón con la clase fullscreen incluso cuando cambia por otra vía (atajo F11, F, click)
  (function watchFullscreen() {
    var observer = new MutationObserver(function () { syncFullscreenButton(); });
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  })();

  function toggleFullscreen() {
    var isFull = document.body.classList.toggle('fullscreen');
    // Ajustar tablero
    if (isFull) document.body.classList.remove('full-board');
    if (S.hasBoard) renderBoard();
    syncGameLayout();
    syncFullscreenButton();
    showToast(isFull ? 'Pantalla completa activada' : 'Pantalla completa desactivada');
  }

  // Sincroniza el ancho de las barras de reloj con el ancho real del tablero
  // (para que queden exactamente pegadas como en chess.com).
  function syncGameLayout() {
    var isFullBoard = document.body.classList.contains('full-board');
    // En modo Tablero completo los relojes ya están columna izquierda; no forzar ancho
    if (!isFullBoard) {
      var board = S.hasBoard ? $('#board') : null;
      var bw = board ? board.getBoundingClientRect().width : 0;
      var us = document.getElementById('card-us');
      var them = document.getElementById('card-them');
      if (bw) [us, them].forEach(function (el) { if (el) el.style.width = bw + 'px'; });
    } else {
      var us = document.getElementById('card-us');
      var them = document.getElementById('card-them');
      [us, them].forEach(function (el) { if (el) el.style.width = ''; });
    }
    var panel = document.getElementById('game-panel');
    if (panel && !document.querySelector('.game-wrap.panel-collapsed')) panel.style.height = '';
  }
  window.addEventListener('resize', function () { syncGameLayout(); });

  // ================= Barra lateral =================
  var RAIL_KEY = 'bchess-v2-rail';
  var RAIL_DEFAULT = ['home', 'profile', 'online', 'ai', 'board', 'history', 'stats', 'settings'];

  var RAIL_CATALOG = [
    { id: 'home', label: 'Inicio', svg: '<path d="M4 11l8-7 8 7M6 10v9h12v-9" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' },
    { id: 'ai', label: 'vs IA', svg: '<rect x="7" y="7" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9 3v4M15 3v4M9 17v4M15 17v4M3 9h4M3 15h4M17 9h4M17 15h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' },
    { id: 'online', label: 'Conexión', svg: '<path d="M2.5 9.5a14.5 14.5 0 0 1 19 0M5.5 13a10 10 0 0 1 13 0M8.5 16.5a5 5 0 0 1 7 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="12" cy="20" r="1.4" fill="currentColor"/>' },
    { id: 'board', label: 'Tablero', svg: '<rect x="3.5" y="3.5" width="17" height="17" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 3.5v17M14.5 3.5v17" stroke="currentColor" stroke-width="1.4"/>' },
    { id: 'history', label: 'Historial', svg: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7.5V12l3 2" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>' },
    { id: 'stats', label: 'Estadísticas', svg: '<path d="M5 20v-6M10 20V9M15 20v-9M20 20V4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' },
    { id: 'profile', label: 'Perfil', svg: '<circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>' },
    { id: 'settings', label: 'Ajustes', svg: '<path d="M4 4h16M4 12h16M4 20h16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M8 4v16M16 4v16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>' }
  ];

  var RAIL_SCREENS = {
    home: 'home', ai: 'setup', online: 'online', board: 'game',
    profile: 'profile', history: 'history', stats: 'profile', settings: 'settings'
  };

  // Estado "activo" real: stats/perfil dependen de la pestaña visible; tablero requiere partida
  function railActiveFor(id) {
    var cur = S.currentScreen;
    if (!cur) return false;
    if (id === 'stats') {
      if (cur !== 'profile') return false;
      var panel = document.getElementById('profile-stats-panel');
      return !!panel && !panel.classList.contains('hidden');
    }
    if (id === 'profile') {
      if (cur !== 'profile') return false;
      var panel2 = document.getElementById('profile-stats-panel');
      return !panel2 || panel2.classList.contains('hidden');
    }
    if (id === 'board') return cur === 'game' && S.hasBoard && !!S.game;
    return RAIL_SCREENS[id] === cur;
  }

  function getRailConfig() {
    var def = RAIL_DEFAULT.slice();
    try {
      var raw = localStorage.getItem(RAIL_KEY);
      if (!raw) return def;
      var list = JSON.parse(raw);
      if (!Array.isArray(list)) return def;
      var valid = list.filter(function (id) { return RAIL_CATALOG.some(function (c) { return c.id === id; }); });
      if (!valid.length) return def;
      if (valid.indexOf('settings') === -1) valid.push('settings');
      if (valid.indexOf('stats') === -1) {
        var si = valid.indexOf('settings');
        if (si === -1) valid.push('stats');
        else valid.splice(si, 0, 'stats');
      }
      return valid;
    } catch (e) { return def; }
  }

  function saveRailConfig(list) {
    try { localStorage.setItem(RAIL_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function railIcon(item, size) {
    size = size || 20;
    return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" aria-hidden="true">' + item.svg + '</svg>';
  }

  function navigateRail(id) {
    switch (id) {
      case 'home': setScreen('home'); break;
      case 'ai': setScreen('setup'); break;
      case 'online': setScreen('online'); break;
      case 'board': if (S.hasBoard) setScreen('game'); break;
      case 'profile': BCHESS_PROFILE.refreshProfile(); setScreen('profile'); break;
      case 'history': BCHESS_PROFILE.refreshHistory(); setScreen('history'); break;
      case 'stats':
        BCHESS_PROFILE.refreshProfile();
        setScreen('profile');
        var statsTab = document.getElementById('profile-tab-stats');
        if (statsTab) statsTab.click();
        break;
      case 'settings': renderSettingsUI(); setScreen('settings'); break;
    }
  }

  function renderRail() {
    var rail = $('#side-rail');
    if (!rail) return;
    var config = getRailConfig();
    var html = '';
    config.forEach(function (id) {
      var item = null;
      for (var i = 0; i < RAIL_CATALOG.length; i++) if (RAIL_CATALOG[i].id === id) { item = RAIL_CATALOG[i]; break; }
      if (!item) return;
      var active = railActiveFor(id) ? ' active' : '';
      var disabled = (id === 'board' && !S.hasBoard) ? ' disabled' : '';
      var antenna = id === 'online' ? '<span class="rail-antenna" data-state="idle" title="Sin conexión"></span>' : '';
      var liveDot = id === 'board' ? '<span class="rail-live-dot hidden" title="Partida en curso"></span>' : '';
      html += '<button class="rail-btn' + active + disabled + '" data-rail="' + id + '" title="' + item.label + '" aria-label="' + item.label + '"' + (disabled ? ' disabled' : '') + '>' + antenna + liveDot + railIcon(item) + '<span class="rail-tip">' + item.label + '</span></button>';
    });
    html += '<div class="rail-spacer"></div>';
    rail.innerHTML = html;
    updateRailAntenna();
  }

  function updateRailAntenna() {
    var dot = document.querySelector('[data-rail="online"] .rail-antenna');
    if (dot) dot.setAttribute('data-state', S.connState || 'idle');
  }

  function updateRailActive() {
    var rail = $('#side-rail');
    if (!rail) return;
    var live = !!(S.hasBoard && S.game && !S.gameOver && !S.reviewingGame && S.currentScreen !== 'game');
    Array.prototype.forEach.call(rail.querySelectorAll('[data-rail]'), function (btn) {
      var id = btn.getAttribute('data-rail');
      var active = railActiveFor(id);
      var disabled = id === 'board' && !(S.hasBoard && S.game);
      var liveDot = btn.querySelector('.rail-live-dot');
      if (liveDot) liveDot.classList.toggle('hidden', id !== 'board' || !live);
      btn.classList.toggle('active', !!active && !disabled);
      btn.classList.toggle('disabled', !!disabled);
      btn.disabled = !!disabled;
    });
  }

  // ================= Estado de conexión =================
  function applyConnState(state) {
    var prev = S.connState;
    S.connState = state.state || 'idle';
    var transport = S.transport || currentTransport || 'p2p';
    setTransportState(transport, S.connState);
    updateRailAntenna();

    var transportName = transport === 'lan' ? 'LAN' : 'P2P';
    var subId = transport === 'lan' ? 'conn-lan-state' : 'conn-p2p-state';

    // Insignias de estado en Home y en la tarjeta del modo actual
    var homeDot = document.querySelector('#home-conn-state .conn-dot');
    var homeTxt = document.getElementById('home-conn-state');
    var modeSub = document.getElementById(subId);
    var isConnected = S.connState === 'connected';
    if (homeDot) homeDot.classList.toggle('on', isConnected);
    if (homeTxt) homeTxt.innerHTML = '<span class="conn-dot' + (isConnected ? ' on' : '') + '"></span>' + transportName + (isConnected ? ' conectado' : ' desconectado');
    if (modeSub) {
      if (isConnected) modeSub.textContent = 'Conectado';
      else if (S.connState === 'connecting' || S.connState === 'failed') modeSub.textContent = 'Conexión…';
      else modeSub.textContent = 'Desconectado';
    }
    // El otro transporte queda "apagado" salvo que tenga su propio estado guardado
    var other = transport === 'lan' ? 'p2p' : 'lan';
    var otherSub = document.getElementById(other === 'lan' ? 'conn-lan-state' : 'conn-p2p-state');
    if (otherSub) otherSub.textContent = transportStates[other] === 'connected' ? 'Conectado' : (transportStates[other] === 'connecting' ? 'Conexión…' : 'Desconectado');

    if (S.connState === 'connected') {
      showConnAnim('success', 'Conexión establecida', 'Sincronizando perfiles…');
    } else if (S.connState === 'failed') {
      showConnAnim('static-red', 'Conexión fallida', 'Revisa la red, el código o que la sala no haya expirado (12 h)');
    } else if (S.connState === 'disconnected' && prev === 'connected') {
      showConnAnim('static-red', 'Conexión perdida', 'El rival se desconectó');
    }
  }

  function showConnAnim(kind, label, sub) {
    var host = document.getElementById('conn-anim');
    if (!host) return;
    var cat = host.querySelector('#conn-cat');
    var labelEl = host.querySelector('.conn-anim-label');
    var subEl = host.querySelector('.conn-anim-sub');
    var isFail = kind === 'static-red';
    if (cat) {
      cat.classList.remove('success', 'static-red');
      cat.classList.add(isFail ? 'static-red' : 'success');
    }
    if (labelEl) labelEl.textContent = label;
    if (subEl) subEl.textContent = sub || '';
    host.className = 'conn-anim show ' + kind;
    host.setAttribute('aria-hidden', 'false');
    clearTimeout(showConnAnim._t);
    showConnAnim._t = setTimeout(function () {
      host.className = 'conn-anim';
      host.setAttribute('aria-hidden', 'true');
    }, isFail ? 2600 : 3200);
    if (!host.dataset.clickBound) {
      host.dataset.clickBound = '1';
      host.addEventListener('click', function () {
        clearTimeout(showConnAnim._t);
        host.className = 'conn-anim';
        host.setAttribute('aria-hidden', 'true');
      });
    }
  }

  // ================= Bienvenida del Inicio =================
  function updateHomeWelcome() {
    var welcomeSeen = localStorage.getItem('bchess-home-seen') === 'true';
    var homeScreen = $('#screen-home');
    var quickActions = $('#home-quick-actions');
    if (homeScreen) {
      homeScreen.classList.toggle('welcome-seen', welcomeSeen);
    }
    if (quickActions) {
      quickActions.hidden = !welcomeSeen;
    }
  }

  function openRailModal() {
    var listEl = $('#rail-list');
    if (!listEl) return;
    renderRailList(listEl);
    $('#rail-modal').classList.add('show');
  }

  function renderRailList(listEl) {
    var config = getRailConfig();
    var enabled = {};
    config.forEach(function (id, i) { enabled[id] = { on: true, index: i }; });

    var ordered = config.slice();
    RAIL_CATALOG.forEach(function (c) { if (config.indexOf(c.id) === -1) ordered.push(c.id); });

    listEl.innerHTML = ordered.map(function (id) {
      var item = null;
      for (var i = 0; i < RAIL_CATALOG.length; i++) if (RAIL_CATALOG[i].id === id) { item = RAIL_CATALOG[i]; break; }
      var on = config.indexOf(id) !== -1;
      return '<div class="rail-row" data-id="' + id + '">' +
        '<label class="rail-row-toggle"><input type="checkbox" data-rail-check="' + id + '"' + (on ? ' checked' : '') + '><span class="rail-row-icon">' + railIcon(item, 18) + '</span><span class="rail-row-label">' + item.label + '</span></label>' +
        '<span class="rail-row-order"><button type="button" class="icon-small" data-rail-up="' + id + '" aria-label="Subir"><svg viewBox="0 0 16 16"><path d="M4 10l4-4.5L12 10z" fill="currentColor"/></svg></button>' +
        '<button type="button" class="icon-small" data-rail-down="' + id + '" aria-label="Bajar"><svg viewBox="0 0 16 16"><path d="M4 6l4 4.5L12 6z" fill="currentColor"/></svg></button></span>' +
        '</div>';
    }).join('');
  }

  function applyRailFromDom(listEl) {
    var config = getRailConfig();
    var orderedIds = Array.prototype.map.call(listEl.querySelectorAll('.rail-row'), function (row) { return row.getAttribute('data-id'); });
    var next = [];
    orderedIds.forEach(function (id) {
      var check = listEl.querySelector('[data-rail-check="' + id + '"]');
      if (check && check.checked) next.push(id);
    });
    saveRailConfig(next);
    renderRail();
    updateRailActive();
  }

  function moveRailItem(listEl, id, dir) {
    var rows = Array.prototype.slice.call(listEl.querySelectorAll('.rail-row'));
    var idx = rows.findIndex(function (r) { return r.getAttribute('data-id') === id; });
    var target = idx + dir;
    if (idx < 0 || target < 0 || target >= rows.length) return;
    if (dir < 0) listEl.insertBefore(rows[idx], rows[target]);
    else listEl.insertBefore(rows[target], rows[idx]);
    applyRailFromDom(listEl);
  }

  // ================= Movimientos =================
  function makeMove(from, to) {
    var fromAlg = sqToAlgebraic(from), toAlg = sqToAlgebraic(to);
    var moves = S.game.moves({ square: fromAlg, verbose: true });
    var move = null;
    for (var i = 0; i < moves.length; i++) if (moves[i].to === toAlg) { move = moves[i]; break; }
    if (!move) { S.premoveQueue = []; return false; }
    if (move.promotion) {
      S.pendingPromotion = { from: from, to: to };
      showPromotionModal(move.color);
      return true;
    }
    return executeMove(from, to, null);
  }

  function executeMove(from, to, promotion) {
    var fromAlg = sqToAlgebraic(from), toAlg = sqToAlgebraic(to);
    var beforeWhite = S.clocks.w;
    var beforeBlack = S.clocks.b;
    var result = S.game.move({ from: fromAlg, to: toAlg, promotion: promotion || undefined });
    if (!result) { S.premoveQueue = []; return false; }
    afterMove(result, false, beforeWhite, beforeBlack);
    return true;
  }

  function afterMove(result, fromRemote, beforeWhite, beforeBlack) {
    S.lastMove = { from: result.from, to: result.to };
    S.selected = null;
    S.legalTargets = [];
    S.fens.push(S.game.fen());
    S.viewPly = S.fens.length - 1;

    // Guardar tiempos de reloj en este ply
    if (S.timeMs > 0 && typeof beforeWhite === 'number' && typeof beforeBlack === 'number') {
      var mover = result.color === 'w' ? 'w' : 'b';
      var afterWhite = S.clocks.w;
      var afterBlack = S.clocks.b;
      S.moveTimes.push({
        ply: S.moveTimes.length + 1,
        move: result.san,
        whiteMs: afterWhite,
        blackMs: afterBlack,
        mover: mover
      });
    }

    // Sonidos (sin sonido de colocación)
    var san = result.san || '';
    var isMate = san.indexOf('#') !== -1;
    var isCheck = !isMate && san.indexOf('+') !== -1;
    if (result.captured) BCHESS_SOUNDS.play('capture');
    else if (san.indexOf('O-O') === 0) BCHESS_SOUNDS.play('enroque');
    else if (!isMate && !isCheck) BCHESS_SOUNDS.play('move');
    if (isMate) BCHESS_SOUNDS.play('mate');
    else if (isCheck) BCHESS_SOUNDS.play('check');

    // Reloj: suma incremento al bando que movió
    if (S.timeMs > 0) {
      var mover = S.game.turn() === 'w' ? 'b' : 'w';
      S.clocks[mover] = Math.min(S.clocks[mover] + S.incrementMs, 9999999);
    }

    // Anfitrión: emitir CLOCK inmediatamente tras la jugada (el invitado reconcilia en <1 tick)
    if (S.mode === 'online' && BCHESS_NET.isHost()) emitClockNow();

    updateMoveList();
    checkGameEnd(result, fromRemote);
    renderBoard();
    updateClockDisplay();
    updateStatusLine();

    // P2P: enviar jugada
    if (S.mode === 'online' && !fromRemote && !S.applyingRemote) {
      sendMoveMessage(result);
    }

    // Ejecutar cola de premoves si existe y ahora es nuestro turno
    if (S.premoveQueue.length > 0 && isLocalTurn() && !S.gameOver) {
      // Pequeño delay para que se vea fluido; la cola se ejecuta en cadena
      setTimeout(function() {
        if (S.gameOver || !isLocalTurn()) return;
        // Ejecutamos en cadena (hasta 20) sin bloquear la transparencia de la UI;
        // si una jugada se vuelve ilegal, executeMove/makeMove ya limpian la cola.
        var guard = 0;
        while (S.premoveQueue.length > 0 && isLocalTurn() && !S.gameOver && guard < 20) {
          guard++;
          var pm = S.premoveQueue[0];
          S.premoveQueue.shift();
          if (pm.promotion) executeMove(pm.from, pm.to, pm.promotion);
          else makeMove(pm.from, pm.to);
        }
      }, 35);
    }
    
    // IA
    if (S.mode === 'ai' && !S.gameOver && S.game.turn() !== S.localColor) {
      scheduleEngineMove();
    }
  }

  function updateMoveList() {
    var list = $('#move-list');
    if (!list || !S.game) return;
    var history = S.game.history({ verbose: true });
    var html = '';
    var highlight = S.viewPly - 1;
    for (var i = 0; i < history.length; i += 2) {
      var num = Math.floor(i / 2) + 1;
      var wMove = history[i], bMove = history[i + 1];
      var w = wMove ? wMove.san : '';
      var b = bMove ? bMove.san : '';
      var wCls = 'mv-cell ' + (wMove && wMove.color === S.localColor ? 'own' : 'opp') + (highlight === i ? ' highlight' : '');
      var bCls = 'mv-cell ' + (bMove && bMove.color === S.localColor ? 'own' : 'opp') + (highlight === i + 1 ? ' highlight' : '');
      html += '<div class="mv-row"><span class="mv-num">' + num + '.</span><span class="' + wCls + '">' + w + '</span><span class="' + bCls + '">' + b + '</span></div>';
    }
    list.innerHTML = html || '<span class="muted">Sin jugadas todavía.</span>';
    if (S.viewPly === S.fens.length - 1) list.scrollTop = list.scrollHeight;
  }

  function updatePlaybackUI() {
    var total = S.fens ? S.fens.length - 1 : 0;
    var indicator = $('#ply-indicator');
    if (indicator) indicator.textContent = S.viewPly + '/' + total;
    var first = $('#btn-ply-first'), prev = $('#btn-ply-prev'), next = $('#btn-ply-next'), last = $('#btn-ply-last');
    if (first) first.disabled = S.viewPly === 0;
    if (prev) prev.disabled = S.viewPly === 0;
    if (next) next.disabled = S.viewPly === total;
    if (last) last.disabled = S.viewPly === total;
    var playBtn = $('#btn-play-auto');
    if (playBtn) playBtn.classList.toggle('playing', S.autoPlaying);
    var speedSel = $('#playback-speed');
    if (speedSel) speedSel.value = String(S.playbackSpeed);
  }

  function setViewPly(n) {
    var total = S.fens.length - 1;
    S.viewPly = Math.max(0, Math.min(total, n));
    S.selected = null;
    S.legalTargets = [];
    renderBoard();
    updateMoveList();
    updateStatusLine();
  }

  function checkGameEnd(result, fromRemote) {
    var mover = result.color === 'w' ? 'w' : 'b';
    var winner = null, reason = '';

    if (S.game.in_checkmate()) { winner = mover; reason = 'Jaque mate'; }
    else if (S.game.in_stalemate()) { reason = 'Ahogado'; }
    else if (S.game.in_threefold_repetition()) { reason = 'Triple repetición'; }
    else if (S.game.insufficient_material()) { reason = 'Material insuficiente'; }
    else if (S.game.in_fifty_move && S.game.in_fifty_move()) { reason = 'Regla de los 50 movimientos'; }
    else if (S.game.in_draw()) { reason = 'Tablas'; }

    if (reason) endGame(winner, reason, fromRemote);
  }

  function endGame(winner, reason, fromRemote) {
    if (S.gameOver) return;
    S.gameOver = true;
    if (S.aiMoveTimer) { clearTimeout(S.aiMoveTimer); S.aiMoveTimer = null; }
    S.aiThinking = false;
    stopClock();
    stopAutoPlay();
    updateRailActive();

    var resultTag = winner === null ? '1/2-1/2' : (winner === 'w' ? '1-0' : '0-1');
    try { S.game.header('Result', resultTag); } catch (e) {}

    var title, msg;
    if (winner === null) { title = 'Tablas'; msg = reason; BCHESS_SOUNDS.play('draw'); }
    else {
      var localWon = winner === S.localColor;
      var oppName = S.mode === 'ai'
        ? 'Stockfish'
        : (S.remoteName || 'el rival');
      title = localWon ? '¡Ganaste!' : ('Ganó ' + oppName);
      msg = reason;
      BCHESS_SOUNDS.play(localWon ? 'victory' : 'defeat');
    }
    // Avisar al rival (compatibilidad con el APK)
    if (S.mode === 'online' && !fromRemote) {
      try {
        var winnerArg = winner === null ? 'draw' : (winner === 'w' ? 'white' : 'black');
        BCHESS_NET.sendLine(JSON.stringify({ v: 2, type: 'END', winner: winnerArg, reason: reason || 'Partida terminada' }));
      } catch (e) {}
    }
    // Conteo del torneo (ambos lados lo siguen localmente)
    if (S.mode === 'online' && S.tournament && S.tournament.active) {
      var t = S.tournament;
      t.played++;
      if (winner === null) t.draws++;
      else if (winner === S.localColor) t.localWins++;
      else t.remoteWins++;
      if (t.played >= t.games) {
        t.active = false;
        t.finished = true;
        saveTournamentRecord(t);
      }
    }
    saveGameRecord(resultTag, reason, winner);
    applyAIProgress(winner);
    showEndModal(title, msg, winner, reason);
  }

  function saveTournamentRecord(t) {
    try {
      var raw = localStorage.getItem('bchess-v2-tournaments');
      var list = [];
      try { list = JSON.parse(raw || '[]'); } catch (e) { list = []; }
      var profile = BCHESS_PROFILE.getProfile();
      var winnerName = t.localWins > t.remoteWins ? (profile.handle || profile.name || 'Tú') : (S.remoteName || 'Rival');
      list.push({
        id: 't-' + Date.now(),
        date: new Date().toISOString(),
        games: t.games,
        localWins: t.localWins,
        remoteWins: t.remoteWins,
        draws: t.draws,
        winner: winnerName
      });
      localStorage.setItem('bchess-v2-tournaments', JSON.stringify(list));
    } catch (e) {}
  }

  function pgnText() {
    try { return S.game ? S.game.pgn() : ''; } catch (e) { return ''; }
  }

  function saveGameRecord(resultTag, reason, winner) {
    try {
      var histVerbose = S.game.history({ verbose: true });
      var profile = BCHESS_PROFILE.getProfile();
      var whiteName = S.orientation === 'w' ? profile.name : (S.mode === 'ai' ? 'Stockfish' : 'Rival');
      var blackName = S.orientation === 'w' ? (S.mode === 'ai' ? 'Stockfish' : 'Rival') : profile.name;
      BCHESS_PROFILE.saveGame({
        id: 'g-' + Date.now(),
        date: new Date().toISOString(),
        mode: S.mode,
        white: whiteName,
        black: blackName,
        result: resultTag,
        localColor: S.localColor,
        myResult: BCHESS_PROFILE.myResultFrom(winner, S.localColor),
        movesSan: histVerbose.map(function (m) { return m.san; }),
        moves: histVerbose.length,
        finalFen: S.fens[S.fens.length - 1],
        reason: reason,
        pgn: pgnText(),
        moveTimes: S.moveTimes.slice(),
        initialTimeMs: S.timeMs,
        incrementMs: S.incrementMs
      });
    } catch (e) {}
  }

  function updateStatusLine() {
    var el = $('#game-status');
    if (!el || !S.game) return;
    if (S.countdownTick !== null && S.countdownTick !== undefined) {
      el.textContent = 'Comenzando en ' + S.countdownTick + '…';
      el.classList.remove('yours');
      return;
    }
    if (S.gameOver) { el.textContent = 'Partida terminada'; el.classList.remove('yours'); return; }
    if (!isFullHistoryInView()) {
      el.textContent = 'Revisando jugada ' + S.viewPly + '/' + (S.fens.length - 1);
      el.classList.remove('yours');
      return;
    }
    var yours = isLocalTurn();
    el.textContent = yours ? 'Tu turno' : (S.mode === 'ai' ? 'La IA piensa…' : 'Turno del rival');
    el.classList.toggle('yours', yours);
  }

  // ================= Reloj =================
  function parseTimeControl(tc) {
    if (!tc || tc === '0') return { timeMs: 0, incrementMs: 0 };
    var parts = tc.split('+');
    var base = parseInt(parts[0], 10) || 0;
    var inc = parseInt(parts[1] || '0', 10) || 0;
    return { timeMs: base * 1000, incrementMs: inc * 1000 };
  }

  // Emisión inmediata del estado de relojes (autoridad = anfitrión)
  function emitClockNow(ts) {
    if (S.mode !== 'online' || !BCHESS_NET.isHost()) return;
    try {
      BCHESS_NET.sendLine(JSON.stringify({ v: 2, type: 'CLOCK',
        whiteMs: S.clocks.w, blackMs: S.clocks.b,
        side: S.game ? S.game.turn() : 'w', ts: ts || Date.now(), paused: false }));
    } catch (e) {}
  }

  function startClock() {
    stopClock();
    if (S.timeMs <= 0) return;
    S.clockTimer = setInterval(tickClock, 100);
  }

  function stopClock() {
    if (S.clockTimer) { clearInterval(S.clockTimer); S.clockTimer = null; }
  }

  function tickClock() {
    if (S.gameOver || !S.game) return;
    // El anfitrión es dueño del reloj (como el APK); el invitado cuenta en local
    // pero se reconcilia con cada CLOCK que emite el anfitrión (1 Hz).
    var isOnlineGuest = S.mode === 'online' && !BCHESS_NET.isHost();
    if (isOnlineGuest) {
      if (S.timeMs > 0) {
        var side = S.game.turn();
        if (S.clocks[side] > 0) {
          S.clocks[side] = Math.max(0, S.clocks[side] - 100);
          updateClockDisplay();
          var localMs = S.localColor === 'w' ? S.clocks.w : S.clocks.b;
          if (localMs > 0 && localMs <= 10000) {
            var curSec = Math.floor(localMs / 1000);
            if (curSec < S.lastLowtimeSec) BCHESS_SOUNDS.play('lowtime');
            S.lastLowtimeSec = curSec;
          } else {
            S.lastLowtimeSec = 99;
          }
        }
      }
      return;
    }

    var side = S.game.turn();
    S.clocks[side] = Math.max(0, S.clocks[side] - 100);

    var remaining = S.clocks[side];
    // Estilo APK: al cruzar un segundo entero por debajo de 10 s, tick LOWTIME (solo jugador local)
    var prevMs = remaining + 100;
    if (S.timeMs > 0 && remaining > 0 && remaining <= 10000 && Math.floor(prevMs / 1000) !== Math.floor(remaining / 1000)) {
      if (side === S.localColor) BCHESS_SOUNDS.play('lowtime');
    }

    // Anfitrión online: emitir CLOCK cada 1 s
    if (S.mode === 'online' && BCHESS_NET.isHost()) {
      var now = Date.now();
      if (!S.clockSyncTs || now - S.clockSyncTs >= 1000) {
        S.clockSyncTs = now;
        emitClockNow(now);
      }
    }

    updateClockDisplay();

    if (remaining <= 0) {
      var winner = side === 'w' ? 'b' : 'w';
      endGame(winner, 'Tiempo agotado', false);
    }
  }

  function formatTime(ms) {
    if (ms <= 0) return '0:00';
    var total = Math.max(0, Math.floor(ms / 1000));
    var m = Math.floor(total / 60), s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  function updateClockDisplay() {
    var us = S.localColor, them = S.localColor === 'w' ? 'b' : 'w';
    var usEl = $('#clock-us'), themEl = $('#clock-them');
    var turnUs = S.game && !S.gameOver ? S.game.turn() === us : false;

    function clockCls(el, ms, active) {
      el.classList.remove('active', 'warn', 'critical', 'lowtime');
      if (!S.timeMs) return;
      if (active) el.classList.add('active');
      if (ms <= 10000) { el.classList.add('critical', 'lowtime'); }
      else if (ms <= 30000) { el.classList.add('warn', 'lowtime'); }
    }

    if (usEl) {
      if (S.timeMs <= 0) usEl.textContent = '∞';
      else usEl.textContent = formatTime(S.clocks[us]);
      clockCls(usEl, S.clocks[us], turnUs);
    }
    if (themEl) {
      if (S.timeMs <= 0) themEl.textContent = '∞';
      else themEl.textContent = formatTime(S.clocks[them]);
      clockCls(themEl, S.clocks[them], !turnUs);
    }
  }

  // ================= IA =================
  var AI_SPEED_MIN_MS = { instant: 0, fast: 600, normal: 1600, slow: 3600 };

  function aiSpeedDelay() {
    var speed = S.settings.aiSpeed || 'normal';
    var min = AI_SPEED_MIN_MS[speed] != null ? AI_SPEED_MIN_MS[speed] : 1600;
    if (!min) return 0;
    return Math.round(min + Math.random() * min * 0.35);
  }

  function scheduleEngineMove() {
    S.aiThinking = true;
    updateStatusLine();
    var fen = S.game.fen();
    BCHESS_ENGINE.findBestMove(fen, {
      difficulty: S.settings.difficulty,
      timeOn: S.timeMs > 0,
      turnMs: S.clocks[S.game.turn()]
    }).then(function (move) {
      var apply = function () {
        S.aiMoveTimer = null;
        S.aiThinking = false;
        if (S.gameOver) return;
        if (!move) {
          // Motor no respondió (timeout): hacer un movimiento legal aleatorio para no bloquear la partida
          try {
            var moves = S.game.moves({ verbose: true });
            if (moves.length) {
              var mv = moves[Math.floor(Math.random() * moves.length)];
              var result = S.game.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
              if (result) afterMove(result, false);
            }
          } catch (e) {}
          return;
        }
        var from = move.substring(0, 2), to = move.substring(2, 4), promotion = move.length > 4 ? move.charAt(4) : undefined;
        var result = S.game.move({ from: from, to: to, promotion: promotion });
        if (result) afterMove(result, false);
      };
      var delay = aiSpeedDelay();
      if (delay > 0) {
        if (S.aiMoveTimer) clearTimeout(S.aiMoveTimer);
        S.aiMoveTimer = setTimeout(apply, delay);
      } else {
        apply();
      }
    }).catch(function () {
      S.aiThinking = false;
      if (S.gameOver) return;
      try {
        var moves = S.game.moves({ verbose: true });
        if (moves.length) {
          var mv = moves[Math.floor(Math.random() * moves.length)];
          var result = S.game.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
          if (result) afterMove(result, false);
        }
      } catch (e) {}
    });
  }

  // ================= Promoción / modales =================
  function showPromotionModal(color) {
    var modal = $('#promotion-modal');
    var opts = $('#promotion-options');
    opts.innerHTML = '';
    var pieces = ['q', 'r', 'b', 'n'];
    pieces.forEach(function (type) {
      var btn = document.createElement('button');
      btn.innerHTML = '<img src="' + pieceUrl(color, type) + '" alt="' + type + '">';
      btn.addEventListener('click', function () {
        modal.classList.remove('show');
        var p = S.pendingPromotion;
        S.pendingPromotion = null;
        if (p) executeMove(p.from, p.to, type);
      });
      opts.appendChild(btn);
    });
    modal.classList.add('show');
  }

  function showEndModal(title, message, winner, reason) {
    var profile = BCHESS_PROFILE.getProfile();
    var oppName = ($('#name-them') && $('#name-them').textContent) || 'Rival';
    var outcome = (winner === null || winner === undefined) ? 'draw' : (winner === S.localColor ? 'win' : 'loss');

    var titleEl = $('#end-title');
    titleEl.textContent = title;
    titleEl.className = outcome;

    var badge = $('#end-badge');
    if (badge) {
      badge.textContent = outcome === 'win' ? 'Victoria' : (outcome === 'loss' ? 'Derrota' : 'Tablas');
      badge.className = 'end-badge ' + outcome;
    }

    // Marcar el panel con el outcome (para estilo de marco/glow)
    var endContentEl = document.querySelector('#end-modal .modal-content');
    if (endContentEl) {
      endContentEl.classList.remove('outcome-win', 'outcome-loss', 'outcome-draw');
      endContentEl.classList.add('outcome-' + outcome);
    }

    $('#end-message').textContent = message;

    var meAvatar = $('#end-avatar-me');
    renderOwnAvatarInto(meAvatar);
    var meName = $('#end-name-me');
    if (meName) meName.textContent = profile.handle || profile.name || 'Tú';

    var oppAvatar = $('#end-avatar-opp');
    if (oppAvatar) {
      if (S.mode === 'online' && S.remoteProfile) {
        renderAvatarInto(oppAvatar, S.remoteProfile.name, S.remoteProfile.photo);
      } else if (S.mode === 'ai' || isStockfishOpp(oppName)) {
        applyStockfishAvatar(oppAvatar);
      } else {
        oppAvatar.textContent = (oppName || 'R').trim().charAt(0).toUpperCase();
        oppAvatar.style.backgroundImage = '';
        oppAvatar.classList.remove('has-photo', 'stockfish-avatar');
      }
    }
    var oppNameEl = $('#end-name-opp');
    if (oppNameEl) oppNameEl.textContent = oppName;

    var meBtn = $('#end-player-me');
    var oppBtn = $('#end-player-opp');
    if (meBtn) meBtn.classList.toggle('winner', outcome === 'win' || outcome === 'draw');
    if (oppBtn) oppBtn.classList.toggle('winner', outcome === 'loss' || outcome === 'draw');

    // Animación de jaque mate
    var mateAlert = $('#end-mate-alert');
    if (mateAlert) {
      if (reason === 'Jaque mate') {
        mateAlert.classList.remove('hidden');
        var isWin = winner === S.localColor;
        mateAlert.innerHTML = ''; // reiniciar
        mateAlert.innerHTML =
          '<div class="mt-root">' +
            '<div class="mt-scene"><span class="mt-ring' + (isWin ? ' win' : '') + '"></span><span class="mt-k' + (isWin ? ' win' : '') + '">♚</span></div>' +
            '<div class="mt-floor"></div>' +
            '<div class="mt-t">' +
              '<b class="' + (isWin ? 'win' : '') + '">' + (isWin ? 'JAQUE MATE — VICTORIA' : 'JAQUE MATE — PARTIDA PERDIDA') + '</b>' +
              '<small>mate en la jugada ' + Math.ceil(S.game.history().length / 2) + ' · vs ' + oppName + '</small>' +
            '</div>' +
          '</div>';
        // Forzar reflow para reiniciar animación
        void mateAlert.offsetWidth;
      } else {
        mateAlert.classList.add('hidden');
      }
    }

    refreshEndModalForOnline();
    $('#end-modal').classList.add('show');
    updateStatusLine();
  }

  function refreshEndModalForOnline() {
    var nextBtn = $('#btn-next-tournament');
    var nextSub = $('#btn-next-tournament-sub');
    var backTitle = $('#btn-back-room-title');
    var backSub = $('#btn-back-room-sub');
    var sameBtn = $('#btn-same-game');
    var randomBtn = $('#btn-random-game');
    if (!nextBtn || !backTitle || !backSub || !sameBtn || !randomBtn) return;
    var isOnline = S.mode === 'online';
    backTitle.textContent = isOnline ? 'Volver a la sala' : 'Volver al menú';
    backSub.textContent = isOnline ? 'Continuar en el lobby del rival' : 'Salir y volver al inicio';
    sameBtn.querySelector('.end-option-sub').textContent = isOnline ? 'Mismo color · misma cuenta' : 'Revancha vs IA · mismo color';
    randomBtn.querySelector('.end-option-sub').textContent = isOnline ? 'Aleatorio · siguiente partida' : 'Color aleatorio · siguiente partida';

    var banner = $('#end-tournament-banner');
    var t = S.tournament;
    if (isOnline && t && (t.active || t.finished)) {
      if (t.finished) {
        nextBtn.classList.add('hidden');
        if (banner) {
          var verdict = t.localWins > t.remoteWins ? 'Ganaste el torneo' : (t.localWins < t.remoteWins ? 'El rival ganó el torneo' : 'Torneo empatado');
          banner.classList.remove('hidden');
          banner.innerHTML = '<strong>Torneo finalizado</strong><span>' + t.localWins + ' – ' + t.remoteWins +
            ' · Tablas: ' + t.draws + ' · ' + verdict + '</span>';
        }
      } else {
        nextBtn.classList.remove('hidden');
        if (nextSub) nextSub.textContent = 'Partida ' + (t.played + 2) + ' de ' + t.games + ' · color alternado';
        if (banner) {
          banner.classList.remove('hidden');
          banner.innerHTML = '<strong>Torneo en curso</strong><span>Partida ' + (t.played + 1) + ' de ' + t.games +
            ' · Vas ' + t.localWins + '–' + t.remoteWins + ' (tablas ' + t.draws + ')</span>';
        }
      }
    } else {
      nextBtn.classList.add('hidden');
      if (banner) banner.classList.add('hidden');
    }
  }

  function replayCurrentGame() {
    hideEndModal();
    stopClock();
    stopAutoPlay();
    S.reviewingGame = true;
    S.viewPly = 0;
    S.selected = null; S.legalTargets = [];
    setScreen('game');
    updateMoveList();
    renderBoard();
    updateClockDisplay();
    updatePlaybackUI();
    var el = $('#game-status');
    if (el) { el.textContent = 'Revisando partida'; el.classList.remove('yours'); }
    $('#game-actions-live').classList.add('hidden');
    $('#game-actions-review').classList.remove('hidden');
  }

  function hideEndModal() { $('#end-modal').classList.remove('show'); }

  function newGameFromCurrent(mode) {
    hideEndModal();
    mode = mode || 'same';
    if (S.mode === 'online') {
      var t = S.tournament;
      if (t && t.finished) { backToRoom(); return; }     // Torneo terminado: volver a la sala
      if (mode === 'tournament') { startOnlineRematch('tournament'); return; }
      startOnlineRematch(mode);                          // 'same' | 'random'
      return;
    }
    if (mode === 'random') { S.settings.colorAI = Math.random() < 0.5 ? 'w' : 'b'; saveSettings(); }
    startAIGame();
  }

  // ================= Inicio de partidas =================
  function resetCommon(localColor, tc) {
    S.game = new Chess();
    S.fens = [S.game.fen()];
    S.viewPly = 0;
    S.hasBoard = true;
    S.localColor = localColor;
    S.orientation = localColor;
    S.selected = null; S.legalTargets = []; S.gameOver = false; S.lastMove = null;
    S.premoveQueue = [];
    S.lowtime = { w: false, b: false }; S.countdown = { w: 0, b: 0 };
    S.countdownTick = null;
    if (S.countdownTimer) { clearInterval(S.countdownTimer); S.countdownTimer = null; }
    var countdownOverlay = $('#countdown-overlay');
    if (countdownOverlay) countdownOverlay.classList.add('hidden');
    S.moveTimes = [];
    S.autoPlaying = false;
    S.reviewingGame = false;
    S.clockSyncTs = 0;
    S.lastLowtimeSec = 99;
    var parsed = parseTimeControl(tc);
    S.timeMs = parsed.timeMs; S.incrementMs = parsed.incrementMs;
    S.clocks = { w: S.timeMs, b: S.timeMs };
    $('#game-title').innerHTML = S.mode === 'ai'
      ? '<img class="gt-sf" src="assets/img/stockfish.png" alt="">D. Stockfish'
      : 'Partida en línea';

    // UI jugadores
    $('#role-us').textContent = localColor === 'w' ? 'Blancas' : 'Negras';
    $('#role-them').textContent = localColor === 'w' ? 'Negras' : 'Blancas';
    var profile = BCHESS_PROFILE.getProfile();
    renderOwnAvatarInto($('#avatar-us'));
    if (S.mode === 'online' && S.remoteProfile) {
      renderAvatarInto($('#avatar-them'), S.remoteProfile.name, S.remoteProfile.photo);
    } else if (S.mode === 'ai') {
      applyStockfishAvatar($('#avatar-them'));
    } else {
      $('#avatar-them').textContent = 'R';
      $('#avatar-them').style.backgroundImage = '';
      $('#avatar-them').classList.remove('has-photo', 'stockfish-avatar');
    }
    var myHandle = (profile.handle) || (S.settings.name || 'jugador');
    $('#name-us').textContent = myHandle;
    $('#name-them').textContent = S.mode === 'ai' ? 'Stockfish' : (S.remoteProfile && S.remoteProfile.name ? S.remoteProfile.name : 'Rival');
    setPgnHeaders(localColor);
    updateMoveList();
    setScreen('game');
    if (S.mode === 'online') {
      stopClock(); // El reloj no corre hasta terminar la cuenta regresiva
      S.countdownTick = 3;
    } else {
      startClock();
    }
    renderBoard();
    updateClockDisplay();
    updateStatusLine();
    updatePlaybackUI();
    // Mostrar acciones de juego en vivo, ocultar revisión
    $('#game-actions-live').classList.remove('hidden');
    $('#game-actions-review').classList.add('hidden');
    if (S.mode === 'online') launchCountdown();
  }

  function launchCountdown() {
    var overlay = $('#countdown-overlay');
    var numEl = $('#countdown-num');
    var turnEl = $('#countdown-turn');
    if (overlay) overlay.classList.remove('hidden');
    if (numEl) numEl.textContent = String(S.countdownTick);
    if (turnEl) turnEl.textContent = S.localColor === 'w' ? 'Blancas mueven primero' : 'Negras mueven segundo';
    if (S.countdownTimer) { clearInterval(S.countdownTimer); S.countdownTimer = null; }

    function renderTick() {
      if (numEl) {
        numEl.textContent = String(S.countdownTick);
        numEl.style.animation = 'none';
        void numEl.offsetWidth; // forzar reinicio de la animación
        numEl.style.animation = '';
      }
      if (S.countdownTick === 3) BCHESS_SOUNDS.play('countdown3');
      else if (S.countdownTick === 2) BCHESS_SOUNDS.play('countdown2');
      else if (S.countdownTick === 1) BCHESS_SOUNDS.play('countdown1');
      updateStatusLine();
    }
    renderTick();
    S.countdownTimer = setInterval(function () {
      S.countdownTick--;
      if (S.countdownTick <= 0) {
        clearInterval(S.countdownTimer); S.countdownTimer = null;
        S.countdownTick = null;
        if (overlay) overlay.classList.add('hidden');
        updateStatusLine();
        startClock();
        return;
      }
      renderTick();
    }, 1000);
  }

  function setPgnHeaders(localColor) {
    var us = S.settings.name || 'Jugador';
    var them = S.mode === 'ai' ? 'Stockfish' : 'Rival';
    var white = localColor === 'w' ? us : them;
    var black = localColor === 'w' ? them : us;
    try {
      S.game.header(
        'Event', 'B-Chess V2',
        'Site', 'Localhost',
        'Date', new Date().toISOString().slice(0, 10).replace(/-/g, '.'),
        'Round', '1',
        'White', white,
        'Black', black,
        'Result', '*'
      );
    } catch (e) {}
  }

  // Solo se permite una partida en curso en todo el cliente: evita bucles y partidas en segundo plano
  function ensureNoLiveGame() {
    if (S.hasBoard && S.game && !S.gameOver && !S.reviewingGame) {
      showToast('Termina la partida en curso antes de empezar otra');
      setScreen('game');
      return false;
    }
    return true;
  }

  function startAIGame() {
    if (!ensureNoLiveGame()) return;
    if (S.aiMoveTimer) { clearTimeout(S.aiMoveTimer); S.aiMoveTimer = null; }
    S.mode = 'ai';
    S.onlineConnected = false;
    var color = S.settings.colorAI;
    if (color === 'r') color = Math.random() < 0.5 ? 'w' : 'b';
    S.onlineConnected = false;
    resetCommon(color, S.settings.clockAI);
    if (S.game.turn() !== S.localColor) scheduleEngineMove();
  }

  // ================= P2P =================
  // Código de sala amigable (evita confusos: 0/O, 1/I/L)
  function makeRoomCode() {
    var chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    var out = '';
    for (var i = 0; i < 6; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
    return out;
  }

  function connectNet(isHost, code) {
    var name = S.settings.name || 'Jugador';
    BCHESS_NET.setName(name);
    var handlers = {
      onCreated: function (created) {
        S.onlineCode = created;
        S.tournament = null;
        S.onlineLastHostColor = 'w';
        $('#lobby-code').textContent = created;
        $('#lobby-status').textContent = 'Esperando al rival…';
        $('#lobby-status').className = 'lobby-status';
        $('#lobby-host-controls').classList.remove('hidden');
        $('#lobby-guest-waiting').classList.add('hidden');
        $('#btn-start-online').disabled = true;
        renderLobbyConfigSummary();
        setScreen('lobby');
      },
      onConnected: function () {
        S.onlineConnected = true;
        BCHESS_NET.sendLine(JSON.stringify({ v: 2, type: 'HELLO', name: name, isHost: BCHESS_NET.isHost(), color: S.settings.colorOnline === 'b' ? 'black' : 'white' }));
        // El host envía la configuración (LOBBY) — como el APK
        if (BCHESS_NET.isHost()) {
          var parsedClock = parseTimeControl(S.settings.clockOnline);
          BCHESS_NET.sendLine(JSON.stringify({ v: 2, type: 'LOBBY', hostName: name, guestName: S.remoteName || 'Guest', timeMs: parsedClock.timeMs, incrementMs: parsedClock.incrementMs, hostColor: S.settings.colorOnline === 'b' ? 'black' : 'white' }));
        }
        // Ambos envían su perfil (foto, stats e historial) — como el APK
        sendProfileMessage();
        $('#lobby-status').textContent = 'Rival conectado. Configura la partida.';
        $('#lobby-status').className = 'lobby-status ok';
        if (BCHESS_NET.isHost()) $('#btn-start-online').disabled = false;
        showOnlineRemoteCard();
      },
      onMessage: handleNetMessage,
      onDisconnected: function (reason) {
        S.onlineConnected = false;
        stopClock();
        hideOnlineRemoteCard();
        if (S.game && !S.gameOver) {
          S.gameOver = true;
          showEndModal('Rival desconectado', reason || 'La conexión se cerró.', S.localColor);
        } else {
          showLobbyError(reason || 'Rival desconectado.');
          setScreen('online');
        }
      },
      onError: function (msg) {
        hideOnlineRemoteCard();
        showLobbyError(msg, isHost ? 'create-status' : 'join-status');
        // Volver a la pantalla de origen (crear/unir) para reintentar
        if (isHost) setScreen('create-room'); else setScreen('join-room');
      }
    };

    if (isHost) BCHESS_NET.createRoom(code, handlers);
    else {
      $('#lobby-host-controls').classList.add('hidden');
      $('#lobby-guest-waiting').classList.remove('hidden');
      $('#lobby-status').textContent = 'Conectando con la sala…';
      $('#lobby-code').textContent = code;
      setScreen('lobby');
      BCHESS_NET.joinRoom(code, handlers);
    }
  }

  function showLobbyError(msg, primaryId) {
    // Mostrar el error en la pantalla actual (crear / unir / online)
    var ids = ['create-status', 'join-status'];
    var primary = primaryId || ({ 'create-room': 'create-status', 'join-room': 'join-status' }[S.currentScreen] || 'create-status');
    var order = [primary].concat(ids.filter(function (id) { return id !== primary; }));
    order.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) { el.textContent = msg; el.className = 'online-status error'; }
    });
    // También mostrar un toast con el error para que sea más visible
    showToast(msg);
  }

  function renderLobbyConfigSummary() {
    var el = $('#lobby-config-summary');
    if (!el) return;
    var clockLabel = $('#clock-online') ? ($('#clock-online').options[$('#clock-online').selectedIndex] || {}).textContent || '' : '';
    var colorSel = document.querySelector('#seg-color-online button.selected');
    var colorLabel = colorSel ? colorSel.textContent : '';
    var modeLabel = S.roomMode === 'torneo' ? 'Torneo · ' + ($('#room-rounds') ? $('#room-rounds').value : '3') + ' rondas' : 'Individual';
    el.textContent = modeLabel + ' · ' + clockLabel + ' · Color: ' + colorLabel;
    el.classList.remove('hidden');
  }

  // Tarjeta de rival conectado en la pantalla de Conexión
  function showOnlineRemoteCard() {
    var card = $('#online-remote-card');
    if (!card) return;
    if (!S.onlineConnected) { card.classList.add('hidden'); return; }
    var rp = S.remoteProfile;
    var name = (rp && rp.name) || S.remoteName || 'Rival';
    var avatar = $('#online-remote-avatar');
    if (avatar) {
      if (rp && rp.photo) {
        avatar.style.backgroundImage = 'url("' + rp.photo + '")';
        avatar.textContent = '';
        avatar.classList.add('has-photo');
      } else {
        avatar.style.backgroundImage = '';
        avatar.textContent = (name || 'R').trim().charAt(0).toUpperCase();
        avatar.classList.remove('has-photo');
      }
    }
    var nameEl = $('#online-remote-name'); if (nameEl) nameEl.textContent = name;
    var handleEl = $('#online-remote-handle'); if (handleEl) handleEl.textContent = '@' + name.toLowerCase().replace(/\s+/g, '_');
    var statsEl = $('#online-remote-stats');
    if (statsEl) {
      if (rp) {
        var wr = rp.total ? Math.round((rp.wins / rp.total) * 100) : 0;
        statsEl.textContent = rp.total + ' partidas · ' + rp.wins + 'V · ' + rp.draws + 'T · ' + rp.losses + 'D · ' + wr + '% WR';
      } else {
        statsEl.textContent = 'Esperando perfil del rival…';
      }
    }
    card.classList.remove('hidden');
  }

  function hideOnlineRemoteCard() {
    var card = $('#online-remote-card');
    if (card) card.classList.add('hidden');
  }

  // Renderiza (foto o inicial) un elemento avatar
  var STOCKFISH_IMG = 'assets/img/stockfish.png';
  function applyStockfishAvatar(el) {
    if (!el) return;
    el.style.backgroundImage = 'url("' + STOCKFISH_IMG + '")';
    el.textContent = '';
    el.classList.add('has-photo', 'stockfish-avatar');
  }
  function isStockfishOpp(name) {
    return String(name || '').toLowerCase() === 'stockfish';
  }

  function renderAvatarInto(el, name, photo) {
    if (!el) return;
    if (photo) {
      el.style.backgroundImage = 'url("' + photo + '")';
      el.textContent = '';
      el.classList.add('has-photo');
    } else {
      el.style.backgroundImage = '';
      el.textContent = (name || 'R').trim().charAt(0).toUpperCase();
      el.classList.remove('has-photo');
    }
  }

  function renderOwnAvatarInto(el) {
    if (!el) return;
    try { BCHESS_PROFILE.renderAvatar(el, BCHESS_PROFILE.getProfile()); } catch (e) {
      el.textContent = 'T';
    }
  }

  // Refresca los avatares en partida / lobby / modal de fin con el perfil recibido
  function applyRemoteProfileToUI() {
    var rp = S.remoteProfile;
    if (!rp) return;
    renderAvatarInto($('#avatar-them'), rp.name, rp.photo);
    renderAvatarInto($('#lobby-rival-avatar'), rp.name, rp.photo);
    renderAvatarInto($('#end-avatar-opp'), rp.name, rp.photo);
    var nameEl = $('#lobby-rival-name'); if (nameEl) nameEl.textContent = rp.name;
    var handleEl = $('#lobby-rival-handle'); if (handleEl) handleEl.textContent = '@' + rp.name.toLowerCase().replace(/\s+/g, '_');
    if (S.game) {
      var rc = $('#name-them'); if (rc) rc.textContent = rp.name;
      var on = $('#role-them'); if (on && S.orientation) on.textContent = (S.orientation === 'w' ? 'Negras' : 'Blancas');
    }
    showOnlineRemoteCard();
  }

  // Reduce la foto a <=96px JPEG para caber en el canal (compatible con APK)
  function downscalePhoto(src, maxSide, quality) {
    return new Promise(function (resolve) {
      if (!src) { resolve(''); return; }
      var img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
          var scale = Math.min(1, maxSide / Math.max(w, h || 1));
          var cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
          var c = document.createElement('canvas');
          c.width = cw; c.height = ch;
          var ctx = c.getContext('2d');
          ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          resolve(c.toDataURL('image/jpeg', quality));
        } catch (e) { resolve(''); }
      };
      img.onerror = function () { resolve(''); };
      img.src = src;
    });
  }

  // Construye el JSON de historial al estilo del APK (max 30, ~15 KB)
  function buildHistoryJson(records, p) {
    var arr = [];
    for (var i = 0; i < records.length && arr.length < 30; i++) {
      var r = records[i];
      var opp = r.localColor === 'b' ? r.white : r.black;
      var base = Math.floor((r.initialTimeMs || 0) / 60000);
      var t = base + '+' + Math.floor((r.incrementMs || 0) / 1000);
      var item = {
        d: r.date ? (Date.parse(r.date) || 0) : 0,
        res: r.result || '1/2-1/2',
        lw: r.myResult === 'win' ? true : (r.myResult === 'loss' ? false : undefined),
        n: r.moves || 0,
        t: t,
        me: p.handle || p.name || 'Tú',
        opp: opp || 'Rival',
        white: r.localColor !== 'b',
        san: (r.movesSan || []).slice(0, 200),
        pgn: (r.pgn || '').slice(0, 3000)
      };
      if (item.lw === undefined) delete item.lw;
      var test = JSON.stringify(arr.concat([item]));
      if (test.length > 15000) break;
      arr.push(item);
    }
    return arr;
  }

  function sendProfileMessage() {
    Promise.resolve().then(function () {
      try {
        var p = BCHESS_PROFILE.getProfile();
        var games = [];
        try { games = BCHESS_PROFILE.getGames() || []; } catch (e) {}
        var priv = privacySettings();
        var outName = priv.shareIdentity ? (p.handle || p.name || 'Jugador') : 'Rival';
        var wins = 0, draws = 0, losses = 0;
        if (priv.shareStats) {
          games.forEach(function (g) {
            if (g.myResult === 'win') wins++;
            else if (g.myResult === 'loss') losses++;
            else draws++;
          });
        }
        var arr = priv.shareHistory ? buildHistoryJson(games, { handle: outName, name: outName }) : [];
        return downscalePhoto(p.avatar, 96, 0.4).then(function (photo) {
          var line = JSON.stringify({
            v: 2, type: 'PROFILE',
            name: outName,
            color: S.settings.colorOnline === 'r' ? 'random' : (S.settings.colorOnline === 'b' ? 'black' : 'white'),
            photo: (priv.sharePhoto && photo) ? photo : '',
            total: priv.shareStats ? games.length : 0,
            wins: priv.shareStats ? wins : 0,
            draws: priv.shareStats ? draws : 0,
            losses: priv.shareStats ? losses : 0,
            games: JSON.stringify(arr)
          });
          BCHESS_NET.sendLine(line);
        }).catch(function () {
          var line = JSON.stringify({
            v: 2, type: 'PROFILE',
            name: outName,
            color: S.settings.colorOnline === 'r' ? 'random' : (S.settings.colorOnline === 'b' ? 'black' : 'white'),
            photo: '',
            total: 0, wins: 0, draws: 0, losses: 0,
            games: '[]'
          });
          BCHESS_NET.sendLine(line);
        });
      } catch (e) { console.warn('[net] no se pudo enviar PROFILE', e); }
    });
  }

  function handleProfileMessage(msg) {
    var games = [];
    try { games = JSON.parse(msg.games || '[]'); if (!Array.isArray(games)) games = []; } catch (e) { games = []; }
    S.remoteProfile = {
      name: String(msg.name || 'Rival').slice(0, 32),
      photo: typeof msg.photo === 'string' && msg.photo ? msg.photo : null,
      total: parseInt(msg.total, 10) || 0,
      wins: parseInt(msg.wins, 10) || 0,
      draws: parseInt(msg.draws, 10) || 0,
      losses: parseInt(msg.losses, 10) || 0,
      games: games
    };
    // Actualizar el nombre visible del rival
    if (S.remoteName === 'Rival' && S.remoteProfile.name) S.remoteName = S.remoteProfile.name;
    BCHESS_NET.setRemoteName(S.remoteProfile.name);
    // Repintar avatares donde corresponda
    applyRemoteProfileToUI();
    if ($('#lobby-rival-profile')) $('#lobby-rival-profile').classList.remove('hidden');
  }

  function openRemoteProfile() {
    var rp = S.remoteProfile;
    var name = rp && rp.name ? rp.name : (S.remoteName || 'Rival');
    if (window.BCHESS_PROFILE.openOpponentProfileRemote) {
      window.BCHESS_PROFILE.openOpponentProfileRemote(rp || { name: name });
    } else {
      window.BCHESS_PROFILE.openOpponentProfile(name);
    }
  }

  function handleNetMessage(line) {
    var msg;
    try { msg = JSON.parse(line); } catch (e) { return; }
    if (!msg || !msg.type) return;

    switch (msg.type) {
      case 'HELLO':
        S.remoteName = msg.name || 'Rival';
        $('#lobby-status').textContent = 'Rival conectado: ' + S.remoteName;
        $('#lobby-status').className = 'lobby-status ok';
        BCHESS_NET.setRemoteName(S.remoteName);
        // Mostrar perfil del rival en el lobby
        var rivalProfile = $('#lobby-rival-profile');
        var rivalAvatar = $('#lobby-rival-avatar');
        var rivalName = $('#lobby-rival-name');
        var rivalHandle = $('#lobby-rival-handle');
        if (rivalProfile) {
          rivalProfile.classList.remove('hidden');
          if (rivalAvatar) rivalAvatar.textContent = (S.remoteName || 'R').trim().charAt(0).toUpperCase();
          if (rivalName) rivalName.textContent = S.remoteName;
          if (rivalHandle) rivalHandle.textContent = '@' + (S.remoteName || 'jugador').replace(/\s+/g, '_').toLowerCase();
        }
        if (BCHESS_NET.isHost()) $('#btn-start-online').disabled = false;
        showOnlineRemoteCard();
        break;

      case 'PROFILE':
        try { handleProfileMessage(msg); } catch (e) { console.warn('[net] error procesando PROFILE', e); }
        break;

      case 'CLOCK':
        // El invitado sincroniza los relojes desde el anfitrión (autoridad).
        // Entre paquetes cuenta en local (ver tickClock); al recibir CLOCK:
        //  - deriva grande (>1.2 s) → salta al valor del anfitrión (snap)
        //  - deriva pequeña → fusión 50% (suave, sin saltos visibles)
        if (S.mode === 'online' && !BCHESS_NET.isHost()) {
          var w = parseInt(msg.whiteMs, 10) || 0;
          var b = parseInt(msg.blackMs, 10) || 0;
          var SNAP_MS = 1200, BLEND = 0.5;
          var dw = w - S.clocks.w, db = b - S.clocks.b;
          S.clocks.w = Math.abs(dw) > SNAP_MS ? Math.max(0, w) : Math.max(0, Math.round(S.clocks.w + dw * BLEND));
          S.clocks.b = Math.abs(db) > SNAP_MS ? Math.max(0, b) : Math.max(0, Math.round(S.clocks.b + db * BLEND));
          var localMs = S.localColor === 'w' ? S.clocks.w : S.clocks.b;
          // Beeps de bajo tiempo local (igual que el APK)
          if (S.timeMs > 0 && localMs > 0 && localMs <= 10000) {
            var curSec = Math.floor(localMs / 1000);
            if (curSec < S.lastLowtimeSec) BCHESS_SOUNDS.play('lowtime');
            S.lastLowtimeSec = curSec;
          } else {
            S.lastLowtimeSec = 99;
          }
          updateClockDisplay();
          // Si un reloj llegó a 0, el anfitrión envía END; el invitado también muestra 0
          if (S.clocks.w <= 0 || S.clocks.b <= 0) {
            updateClockDisplay();
          }
        }
        break;

      case 'LOBBY':
        // Guardar config recibida del host (compatibilidad con el APK)
        S.remoteLobby = {
          timeMs: parseInt(msg.timeMs, 10) || 0,
          incrementMs: parseInt(msg.incrementMs, 10) || 0,
          hostColor: msg.hostColor === 'black' ? 'b' : 'w'
        };
        break;

      case 'TOURNAMENT':
        var tGames = Math.max(1, Math.min(20, parseInt(msg.games, 10) || 1));
        S.roomMode = 'torneo';
        S.roomRounds = tGames;
        S.tournament = {
          games: tGames,
          timeMs: parseInt(msg.timeMs, 10) || 0,
          incrementMs: parseInt(msg.incrementMs, 10) || 0,
          played: 0, localWins: 0, remoteWins: 0, draws: 0,
          active: true, finished: false
        };
        showToast('Torneo: ' + tGames + ' partidas');
        break;

      case 'REMATCH':
        // El host es la autoridad en las salas P2P
        if (!BCHESS_NET.isHost()) return;
        var rMode = msg.mode || 'same';
        if (rMode === 'lobby') { backToRoom(); break; }
        if (rMode === 'tournament') { advanceTournamentRound(); break; }
        startOnlineRematch(rMode);
        break;

      case 'START':
        startOnlineGameFromHost(msg);
        break;

      case 'MOVE':
        if (!S.game) return;
        S.applyingRemote = true;
        var from = (msg.uci || '').substring(0, 2), to = (msg.uci || '').substring(2, 4), promotion = (msg.uci || '').charAt(4) || undefined;
        var result = S.game.move({ from: from, to: to, promotion: promotion });
        S.applyingRemote = false;
        if (result) afterMove(result, true);
        break;

      case 'DRAW_OFFER':
        $('#draw-modal').classList.add('show');
        break;

      case 'DRAW_ACCEPT':
        if (S.game && !S.gameOver) {
          if (msg.accepted) endGame(null, 'Tablas acordadas', true);
          else showToast('El rival rechazó las tablas');
        }
        $('#draw-modal').classList.remove('show');
        break;

      case 'RESIGN':
        if (S.game && !S.gameOver) {
          var loser = msg.loserColor === 'black' ? 'b' : 'w';
          endGame(loser === 'w' ? 'b' : 'w', (msg.byName || 'El rival') + ' se rinde', true);
        }
        break;

      case 'END':
        if (S.game && !S.gameOver) {
          var winner = msg.winner === 'white' ? 'w' : (msg.winner === 'black' ? 'b' : null);
          endGame(winner, msg.reason || 'Partida terminada', true);
        }
        break;

      case 'PING':
        BCHESS_NET.sendLine(JSON.stringify({ v: 2, type: 'PONG', ts: msg.ts }));
        break;

      case 'PONG':
        break;

      case 'DISCONNECT':
        if (S.game && !S.gameOver) endGame(null, 'El rival se desconectó', true);
        break;
    }
  }

  function startOnlineGameFromHost(msg) {
    S.mode = 'online';
    var hostColor = msg.hostColor === 'black' ? 'b' : 'w';
    S.onlineLastHostColor = hostColor;
    S.localColor = BCHESS_NET.isHost() ? hostColor : (hostColor === 'w' ? 'b' : 'w');
    S.orientation = S.localColor;
    S.onlineConnected = true;
    // Resetear torneo si no hay uno activo (partida individual)
    // resetCommon recibe tc en SEGUNDOS ("300+0"); msg trae milisegundos
    var tcStr = Math.floor((msg.timeMs || 0) / 1000) + '+' + Math.floor((msg.incrementMs || 0) / 1000);
    resetCommon(S.localColor, tcStr);
    if (msg.fen && S.game) {
      try { S.game.load(msg.fen); } catch (e) {}
      S.fens = [S.game.fen()];
    } else {
      S.fens = [S.game.fen()];
    }
    S.viewPly = 0;
    renderBoard();
  }

  // Envío de START (host) unificado: usado por el botón «Empezar partida» y la revancha
  function sendOnlineStart(hostColorArg) {
    var color = hostColorArg || S.onlineLastHostColor || 'w';
    var t = S.tournament;
    var effectiveTimeMs = t && t.timeMs ? t.timeMs : S.timeMs;
    var effectiveIncMs = t && t.incrementMs !== undefined && t.incrementMs !== null ? t.incrementMs : S.incrementMs;
    var startMsg = {
      v: 2, type: 'START',
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      timeMs: effectiveTimeMs, incrementMs: effectiveIncMs,
      hostColor: color === 'w' ? 'white' : 'black',
      hostName: S.settings.name || 'Host', guestName: S.remoteName || 'Guest',
      ts: Date.now()
    };
    S.onlineLastHostColor = color;
    // Avisar de torneo (compatibilidad con APK)
    if (t && t.active) {
      var tMsg = { v: 2, type: 'TOURNAMENT', games: t.games, timeMs: effectiveTimeMs, incrementMs: effectiveIncMs, hostColorWhite: color === 'w' };
      BCHESS_NET.sendLine(JSON.stringify(tMsg));
    }
    BCHESS_NET.sendLine(JSON.stringify(startMsg));
    // El host también arranca localmente
    startOnlineGameFromHost(startMsg);
  }

  // Host: preparar una revancha / siguiente ronda
  function startOnlineRematch(mode) {
    if (!BCHESS_NET.isHost()) {
      // El invitado pide la revancha al host
      BCHESS_NET.sendLine(JSON.stringify({ v: 2, type: 'REMATCH', mode: mode || 'same', by: S.settings.name || 'Guest' }));
      showToast('Solicitando revancha…');
      return;
    }
    var newHostColor = S.onlineLastHostColor || 'w';
    if (mode === 'random') newHostColor = Math.random() < 0.5 ? 'w' : 'b';
    if (mode === 'tournament') newHostColor = newHostColor === 'w' ? 'b' : 'w'; // alternar colores
    sendOnlineStart(newHostColor);
  }

  function advanceTournamentRound() {
    startOnlineRematch('tournament');
  }

  // Volver a la sala conservando la conexión P2P (sin cerrarla)
  function backToRoom() {
    stopClock();
    stopAutoPlay();
    S.hasBoard = false;
    S.reviewingGame = false;
    S.gameOver = true;
    S.selected = null; S.legalTargets = [];
    setScreen('lobby');
    var statusEl = $('#lobby-status');
    if (statusEl) {
      statusEl.textContent = 'Rival conectado. Configura la partida.';
      statusEl.className = 'lobby-status ok';
    }
    var hostControls = $('#lobby-host-controls');
    var guestWaiting = $('#lobby-guest-waiting');
    if (hostControls) hostControls.classList.toggle('hidden', !BCHESS_NET.isHost());
    if (guestWaiting) guestWaiting.classList.toggle('hidden', !!BCHESS_NET.isHost());
    if (BCHESS_NET.isHost()) {
      var startBtn = $('#btn-start-online');
      if (startBtn) startBtn.disabled = !S.onlineConnected;
    }
    updateRailActive();
  }

  function sendMoveMessage(result) {
    var uci = result.from + result.to + (result.promotion || '');
    var line = JSON.stringify({
      v: 2, type: 'MOVE',
      from: algebraicToSquare(result.from), to: algebraicToSquare(result.to),
      promotion: result.promotion ? result.promotion.toUpperCase() : '',
      san: result.san || '', uci: uci, fen: S.game.fen(), ts: Date.now()
    });
    BCHESS_NET.sendLine(line);
  }

  function sendResign() {
    if (S.gameOver) return;
    if (S.mode === 'online') {
      var line = JSON.stringify({ v: 2, type: 'RESIGN', byName: S.settings.name || 'Rival', loserColor: S.localColor === 'w' ? 'white' : 'black' });
      BCHESS_NET.sendLine(line);
    }
    endGame(S.localColor === 'w' ? 'b' : 'w', 'Te has rendido', false);
  }

  function sendDrawOffer() {
    if (S.gameOver) return;
    if (S.mode === 'online') {
      var line = JSON.stringify({ v: 2, type: 'DRAW_OFFER', byName: S.settings.name || 'Rival' });
      BCHESS_NET.sendLine(line);
      showToast('Oferta de tablas enviada');
    } else {
      endGame(null, 'Tablas acordadas', false);
    }
  }

  function sendDrawResponse(accepted) {
    var line = JSON.stringify({ v: 2, type: 'DRAW_ACCEPT', accepted: !!accepted, byName: S.settings.name || 'Rival' });
    BCHESS_NET.sendLine(line);
    if (accepted) endGame(null, 'Tablas acordadas', false);
    $('#draw-modal').classList.remove('show');
  }

  // ================= Settings UI =================
  function difficultyLabel(v) {
    var i = Math.max(1, Math.min(10, parseInt(v, 10) || 5));
    return window.BCHESS_ENGINE ? window.BCHESS_ENGINE.ladder()[i - 1].label : 'Normal';
  }

  // Sincroniza el toggle de modo progresivo
  function syncProgressiveToggle() {
    var t = $('#toggle-progressive');
    if (!t) return;
    var on = S.settings.aiProgressEnabled !== false;
    t.textContent = on ? 'ON' : 'OFF';
    t.classList.toggle('on', on);
    t.setAttribute('aria-checked', on ? 'true' : 'false');
  }

  // Sincroniza el slider/etiqueta de dificultad y la racha de progreso
  function renderSetupDifficulty() {
    var d = Math.max(1, Math.min(10, parseInt(S.settings.difficulty, 10) || 5));
    var slider = $('#difficulty');
    if (slider) slider.value = d;
    var label = $('#difficulty-value');
    if (label) label.textContent = difficultyLabel(d);
    syncProgressiveToggle();
    var streakEl = $('#difficulty-streak');
    if (streakEl) {
      var streak = Math.max(0, Math.min(6, S.settings.aiWinStreak | 0));
      var enabled = S.settings.aiProgressEnabled !== false;
      if (!enabled) {
        streakEl.textContent = 'Modo progresivo desactivado — la dificultad se mantiene como la elijas.';
      } else if (d >= 10) {
        streakEl.textContent = 'Dificultad máxima (≈3190). Racha actual: ' + streak + '/6.';
      } else {
        streakEl.textContent = 'Racha vs IA: ' + streak + '/6 — gana 6 seguidas y sube un peldaño.';
      }
    }
  }

  // Progreso automático: 6 victorias seguidas vs IA suben la dificultad un nivel (solo si está activado)
  function applyAIProgress(winner) {
    if (S.mode !== 'ai') return;
    if (!S.settings.aiProgressEnabled) {
      S.settings.aiWinStreak = 0;
      saveSettings();
      renderSetupDifficulty();
      return;
    }
    var localWon = !!(winner && winner === S.localColor);
    if (localWon) S.settings.aiWinStreak = (S.settings.aiWinStreak | 0) + 1;
    else S.settings.aiWinStreak = 0;
    var bumped = false;
    if ((S.settings.aiWinStreak | 0) >= 6 && (S.settings.difficulty | 0) < 10) {
      S.settings.difficulty = Math.min(10, (S.settings.difficulty | 0) + 1);
      S.settings.aiWinStreak = 0;
      bumped = true;
    }
    saveSettings();
    renderSetupDifficulty();
    if (bumped) showToast('¡6 victorias seguidas! Dificultad subida a ' + difficultyLabel(S.settings.difficulty));
  }

  function speedLabelFor(v) {
    if (v === 'instant') return 'Instantánea';
    if (v === 'fast') return 'Rápida';
    if (v === 'slow') return 'Pensativa';
    return 'Normal';
  }

  function savePublicHandle(raw) {
    try {
      var p = BCHESS_PROFILE.getProfile();
      p.handle = raw;
      BCHESS_PROFILE.saveProfile(p);
    } catch (e) {}
  }

  function renderSettingsUI() {
    var publicHandle = '@usuario';
    try { publicHandle = BCHESS_PROFILE.getProfile().handle; } catch (e) {}
    $('#toggle-sound').textContent = S.settings.sound ? 'ON' : 'OFF';
    $('#toggle-sound').classList.toggle('on', S.settings.sound);
    $('#toggle-sound').setAttribute('aria-checked', S.settings.sound ? 'true' : 'false');
    $('#volume').value = S.settings.volume;
    renderSetupDifficulty();

    var premoveToggle = $('#toggle-premove');
    if (premoveToggle) {
      var on = S.settings.premove !== false;
      premoveToggle.textContent = on ? 'ON' : 'OFF';
      premoveToggle.classList.toggle('on', on);
      premoveToggle.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    var coordsToggle = $('#toggle-coordinates');
    if (coordsToggle) {
      var on = S.settings.showCoordinates !== false;
      coordsToggle.textContent = on ? 'ON' : 'OFF';
      coordsToggle.classList.toggle('on', on);
      coordsToggle.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    var legalToggle = $('#toggle-legal-moves');
    if (legalToggle) {
      var on = S.settings.showLegalMoves !== false;
      legalToggle.textContent = on ? 'ON' : 'OFF';
      legalToggle.classList.toggle('on', on);
      legalToggle.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    var checkToggle = $('#toggle-check');
    if (checkToggle) {
      var on = S.settings.showCheck !== false;
      checkToggle.textContent = on ? 'ON' : 'OFF';
      checkToggle.classList.toggle('on', on);
      checkToggle.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    var lastMoveToggle = $('#toggle-last-move');
    if (lastMoveToggle) {
      var on = S.settings.showLastMove !== false;
      lastMoveToggle.textContent = on ? 'ON' : 'OFF';
      lastMoveToggle.classList.toggle('on', on);
      lastMoveToggle.setAttribute('aria-checked', on ? 'true' : 'false');
    }

    var priv = privacySettings();
    function syncPrivacyToggle(sel, onOff) {
      var el = $(sel);
      if (!el) return;
      el.textContent = onOff ? 'ON' : 'OFF';
      el.classList.toggle('on', onOff);
      el.setAttribute('aria-checked', onOff ? 'true' : 'false');
    }
    syncPrivacyToggle('#toggle-share-photo', priv.sharePhoto);
    syncPrivacyToggle('#toggle-share-identity', priv.shareIdentity);
    syncPrivacyToggle('#toggle-share-stats', priv.shareStats);
    syncPrivacyToggle('#toggle-share-history', priv.shareHistory);

    syncSeg('#seg-color', S.settings.colorAI);
    syncSeg('#seg-color-online', S.settings.colorOnline);
    syncSeg('#seg-soundpack', S.settings.soundPack || 'gm');
    syncSeg('#seg-premove-style', (S.settings && S.settings.premoveStyle) || 'movefull');

    var speedSel = $('#ai-speed');
    if (speedSel) speedSel.value = S.settings.aiSpeed || 'normal';
    var speedLabel = $('#ai-speed-value');
    if (speedLabel) speedLabel.textContent = speedLabelFor(S.settings.aiSpeed || 'normal');

    syncClockSelect('ai', S.settings.clockAI);
    syncClockSelect('online', S.settings.clockOnline);

    renderPieceGrid();
    renderThemeGrid();
    renderPreviewBoard();
  }

  var CLOCK_PRESETS = ['0', '60+0', '120+1', '180+0', '180+2', '300+0', '300+3', '600+0', '600+5', '900+10', '1800+0'];

  function syncClockSelect(prefix, value) {
    var sel = $('#clock-' + prefix);
    var custom = $('#custom-clock-' + prefix);
    if (!sel || !custom) return;
    if (CLOCK_PRESETS.indexOf(value) !== -1) {
      sel.value = value;
      custom.classList.add('hidden');
      return;
    }
    var parts = String(value).split('+');
    var baseSec = parseInt(parts[0], 10) || 600;
    var incSec = parseInt(parts[1] || '0', 10) || 0;
    var minInput = $('#custom-clock-' + prefix + '-min');
    var incInput = $('#custom-clock-' + prefix + '-inc');
    if (minInput) minInput.value = Math.max(1, Math.min(180, Math.round(baseSec / 60)));
    if (incInput) incInput.value = Math.max(0, Math.min(60, incSec));
    sel.value = 'custom';
    custom.classList.remove('hidden');
  }

  function bindClockControl(prefix, key) {
    var sel = $('#clock-' + prefix);
    var custom = $('#custom-clock-' + prefix);
    var minInput = $('#custom-clock-' + prefix + '-min');
    var incInput = $('#custom-clock-' + prefix + '-inc');
    if (!sel) return;

    sel.addEventListener('change', function () {
      if (sel.value === 'custom') {
        custom.classList.remove('hidden');
        var min = parseInt(minInput.value, 10) || 10;
        var inc = parseInt(incInput.value, 10) || 0;
        S.settings[key] = (min * 60) + '+' + inc;
      } else {
        custom.classList.add('hidden');
        S.settings[key] = sel.value;
      }
      saveSettings();
    });

    function applyCustom() {
      if (sel.value !== 'custom') return;
      var min = parseInt(minInput.value, 10);
      var inc = parseInt(incInput.value, 10);
      if (isNaN(min)) min = 1;
      if (isNaN(inc)) inc = 0;
      min = Math.max(1, Math.min(180, min));
      inc = Math.max(0, Math.min(60, inc));
      S.settings[key] = (min * 60) + '+' + inc;
      saveSettings();
    }
    if (minInput) minInput.addEventListener('input', applyCustom);
    if (incInput) incInput.addEventListener('input', applyCustom);
  }

  function syncSeg(sel, value) {
    $$(sel + ' button').forEach(function (b) {
      b.classList.toggle('selected', b.dataset.v === String(value));
    });
  }

  function renderPieceGrid() {
    var grid = $('#piece-set-grid');
    grid.innerHTML = '';
    BCHESS_PIECES.sets.forEach(function (set) {
      var btn = document.createElement('button');
      btn.className = 'piece-btn' + (set.id === S.settings.pieceSet ? ' selected' : '');
      btn.dataset.set = set.id;
      var img = document.createElement('img');
      img.src = BCHESS_PIECES.pieceUrl(set.id, 'w', 'k');
      img.alt = set.es;
      var span = document.createElement('span'); span.textContent = set.es;
      btn.appendChild(img); btn.appendChild(span);
      btn.addEventListener('click', function () {
        S.settings.pieceSet = set.id; saveSettings(); renderSettingsUI();
      });
      grid.appendChild(btn);
    });
  }

  function renderThemeGrid() {
    var grid = $('#board-theme-grid');
    grid.innerHTML = '';
    BCHESS_PIECES.themes.forEach(function (theme) {
      var btn = document.createElement('button');
      btn.className = 'theme-btn' + (theme.id === S.settings.boardTheme ? ' selected' : '');
      btn.dataset.theme = theme.id;
      var swatch = document.createElement('div');
      swatch.className = 'swatch';
      swatch.style.background = 'linear-gradient(135deg, ' + theme.light + ' 50%, ' + theme.dark + ' 50%)';
      var span = document.createElement('span'); span.textContent = theme.es;
      btn.appendChild(swatch); btn.appendChild(span);
      btn.addEventListener('click', function () {
        S.settings.boardTheme = theme.id; saveSettings(); applyTheme(); renderSettingsUI();
      });
      grid.appendChild(btn);
    });
  }

  function renderPreviewBoard() {
    var preview = $('#preview-board');
    if (!preview) return;
    preview.innerHTML = '';
    var fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w KQkq - 1 9';
    var rows = fen.split(' ')[0].split('/');
    var map = { r: 'r', n: 'n', b: 'b', q: 'q', k: 'k', p: 'p', R: 'r', N: 'n', B: 'b', Q: 'q', K: 'k', P: 'p' };
    var FILES = 'abcdefgh';

    // Ejemplos: caballo f3 seleccionado con sus movimientos legales,
    // último movimiento e2→e4 y jaque de muestra sobre el rey negro (e8).
    var selectedSq = S.settings.showLegalMoves !== false ? 'f3' : null;
    var lastFrom = S.settings.showLastMove !== false ? 'e2' : null;
    var lastTo = S.settings.showLastMove !== false ? 'e4' : null;
    var checkSq = S.settings.showCheck !== false ? 'e8' : null;
    var legalTargets = {};
    if (S.settings.showLegalMoves !== false) {
      var got = false;
      try {
        if (typeof Chess !== 'undefined') {
          var sim = new Chess();
          if (sim.load(fen)) {
            var ms = sim.moves({ square: 'f3', verbose: true });
            ms.forEach(function (m) { legalTargets[m.to] = m; });
            got = true;
          }
        }
      } catch (e) { got = false; }
      if (!got) ['e5', 'g5', 'h4', 'd4', 'e1'].forEach(function (sq) { legalTargets[sq] = { to: sq }; });
    }

    for (var row = 0; row < 8; row++) {
      var col = 0;
      for (var i = 0; i < rows[row].length; i++) {
        var ch = rows[row].charAt(i);
        if (/[1-8]/.test(ch)) {
          var empty = parseInt(ch, 10);
          for (var e = 0; e < empty; e++) { preview.appendChild(previewSquare(row, col, true, null)); col++; }
        } else {
          var color = ch === ch.toLowerCase() ? 'b' : 'w';
          preview.appendChild(previewSquare(row, col, false, { color: color, type: map[ch] }));
          col++;
        }
      }
    }
    function previewSquare(row, col, empty, piece) {
      var sq = document.createElement('div');
      var light = (row + col) % 2 === 0;
      sq.className = 'sq ' + (light ? 'light' : 'dark');
      var alg = FILES.charAt(col) + (8 - row);
      if (alg === selectedSq) sq.classList.add('selected');
      if (alg === lastFrom || alg === lastTo) sq.classList.add('last-move');
      if (legalTargets[alg]) { sq.classList.add('legal'); if (legalTargets[alg].captured) sq.classList.add('capture'); }
      if (alg === checkSq) sq.classList.add('check');
      if (S.settings.showCoordinates !== false) {
        if (col === 0) {
          var rs = document.createElement('span'); rs.className = 'coord rank'; rs.textContent = String(8 - row); sq.appendChild(rs);
        }
        if (row === 7) {
          var fs = document.createElement('span'); fs.className = 'coord file'; fs.textContent = FILES.charAt(col); sq.appendChild(fs);
        }
      }
      if (piece) {
        var img = document.createElement('img');
        img.src = BCHESS_PIECES.pieceUrl(S.settings.pieceSet, piece.color, piece.type);
        img.alt = '';
        // Fix para PNG (Gatos 1/2/3) - escalar mejor (CSS maneja el tamaño)
        var set = BCHESS_PIECES.sets.find(function(s) { return s.id === S.settings.pieceSet; });
        if (set && set.kind === 'png') {
          img.style.objectFit = 'contain';
        }
        sq.appendChild(img);
      }
      return sq;
    }
  }

  // ================= Revisión de partida guardada =================
  var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  window.BCHESS_OPEN_SAVED_GAME = function (record) {
    var replay = new Chess();
    var fens = [replay.fen()];
    var ok = false;
    try { ok = replay.load_pgn(record.pgn || ''); } catch (e) {}
    if (!ok) {
      replay = new Chess();
      try { replay.load(record.finalFen || START_FEN); } catch (e) { replay.reset(); }
      fens = [replay.fen()];
    } else {
      var hist = replay.history({ verbose: true });
      var cur = new Chess();
      fens = [cur.fen()];
      for (var i = 0; i < hist.length; i++) {
        cur.move({ from: hist[i].from, to: hist[i].to, promotion: hist[i].promotion });
        fens.push(cur.fen());
      }
      replay = cur;
    }

    S.mode = record.mode === 'online' ? 'online' : 'ai';
    S.game = replay;
    S.fens = fens;
    S.viewPly = fens.length - 1;
    S.gameOver = true;
    S.localColor = record.localColor || 'w';
    S.orientation = S.localColor;
    S.onlineConnected = false;
    S.hasBoard = true;
    S.selected = null; S.legalTargets = []; S.lastMove = null;
    S.premoveQueue = [];
    S.timeMs = record.initialTimeMs || 0;
    S.incrementMs = record.incrementMs || 0;
    S.clocks = { w: S.timeMs, b: S.timeMs };
    S.moveTimes = record.moveTimes || [];
    S.autoPlaying = false;
    S.reviewingGame = true;
    stopClock();

    var profile = BCHESS_PROFILE.getProfile();
    var oppName = S.mode === 'ai'
      ? (record.localColor === 'w' ? record.black : record.white)
      : (record.localColor === 'w' ? record.black : record.white);
    $('#game-title').textContent = 'Partida guardada';
    $('#role-us').textContent = S.localColor === 'w' ? 'Blancas' : 'Negras';
    $('#role-them').textContent = S.localColor === 'w' ? 'Negras' : 'Blancas';
    renderOwnAvatarInto($('#avatar-us'));
    if (isStockfishOpp(oppName)) {
      applyStockfishAvatar($('#avatar-them'));
    } else {
      $('#avatar-them').textContent = (oppName || 'R').charAt(0).toUpperCase();
      $('#avatar-them').style.backgroundImage = '';
      $('#avatar-them').classList.remove('has-photo', 'stockfish-avatar');
    }
    $('#name-us').textContent = profile.handle || profile.name || 'Tú';
    $('#name-them').textContent = oppName;
    $('#game-status').textContent = 'Partida terminada';
    $('#game-status').classList.remove('yours');

    setScreen('game');
    updateMoveList();
    renderBoard();
    updateClockDisplay();
    updateRailActive();
    // Mostrar acciones de revisión, ocultar en vivo
    $('#game-actions-live').classList.add('hidden');
    $('#game-actions-review').classList.remove('hidden');
  };

  // ================= Playback automático =================
  function toggleAutoPlay() {
    if (S.autoPlaying) {
      stopAutoPlay();
    } else {
      startAutoPlay();
    }
  }

  function startAutoPlay() {
    if (S.autoPlaying) return;
    var total = S.fens.length - 1;
    if (S.viewPly >= total) { setViewPly(0); }
    S.autoPlaying = true;
    updatePlaybackUI();
    tickAutoPlay();
  }

  function stopAutoPlay() {
    S.autoPlaying = false;
    if (S.autoPlayTimer) { clearTimeout(S.autoPlayTimer); S.autoPlayTimer = null; }
    updatePlaybackUI();
  }

  function tickAutoPlay() {
    if (!S.autoPlaying) return;
    var total = S.fens.length - 1;
    if (S.viewPly >= total) {
      stopAutoPlay();
      return;
    }
    var baseDelay = 800; // ms a 1x
    var delay = baseDelay / S.playbackSpeed;
    S.autoPlayTimer = setTimeout(function () {
      if (!S.autoPlaying) return;
      setViewPly(S.viewPly + 1);
      tickAutoPlay();
    }, delay);
  }

  function setPlaybackSpeed(v) {
    S.playbackSpeed = parseFloat(v) || 1;
    var sel = $('#playback-speed');
    if (sel) sel.value = String(S.playbackSpeed);
    if (S.autoPlaying) { stopAutoPlay(); startAutoPlay(); }
  }

  // ================= Wiring =================
  function fallbackCopy(text) {
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) {}
  }

  function bindSeg(id, onChange) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('click', function (e) {
      var btn = e.target.closest('button'); if (!btn) return;
      $$(id + ' button').forEach(function (b) { b.classList.toggle('selected', b === btn); });
      onChange(btn.dataset.v);
    });
  }

  function init() {
    loadSettings();
    try {
      var savedProfile = BCHESS_PROFILE.getProfile();
      if (savedProfile && savedProfile.name) {
        S.settings.name = savedProfile.name;
        saveSettings();
      }
    } catch (e) {}
    applyTheme();
    BCHESS_SOUNDS.setPack(S.settings.soundPack || 'gm');
    BCHESS_SOUNDS.setEnabled(S.settings.sound);
    BCHESS_SOUNDS.setVolume(S.settings.volume);
    renderSettingsUI();

    // Navegación
    S.currentScreen = 'home';
    $('#btn-play-ai').addEventListener('click', function () { renderSetupDifficulty(); setScreen('setup'); });
    $('#btn-play-online').addEventListener('click', function () { setScreen('online'); });
    $('#btn-settings-footer').addEventListener('click', function () { renderSettingsUI(); setScreen('settings'); });
    var topProfile = $('#btn-top-profile');
    if (topProfile) topProfile.addEventListener('click', function () { BCHESS_PROFILE.refreshProfile(); setScreen('profile'); });
    // Mostrar presentación solo una vez
    var showWelcome = $('#btn-show-welcome');
    if (showWelcome) {
      showWelcome.addEventListener('click', function () {
        localStorage.setItem('bchess-home-seen', 'true');
        var homeScreen = $('#screen-home');
        if (homeScreen) {
          homeScreen.classList.add('welcome-seen');
        }
        try { updateHomeWelcome(); } catch (e) { console.error('updateHomeWelcome error:', e); }
      });
    }
    $('#btn-setup-back').addEventListener('click', function () { setScreen('home'); });
    $('#btn-online-back').addEventListener('click', function () { setScreen('home'); });
    $('#btn-settings-back').addEventListener('click', function () { setScreen('home'); });

    $('#btn-lobby-back').addEventListener('click', function () { BCHESS_NET.cleanup(true); setScreen('online'); });

    // Pantalla completa durante la partida
    var btnFullscreenGame = $('#btn-fullscreen-game');
    if (btnFullscreenGame) btnFullscreenGame.addEventListener('click', function () {
      toggleFullscreen();
    });

    // Modo Tablero completo: reloj a la izquierda, tablero en grande, sin panel
    var btnFullBoard = $('#btn-full-board');
    var btnExitFullBoard = $('#btn-exit-full-board');
    var updateExitBtn = function (active) {
      if (btnExitFullBoard) btnExitFullBoard.classList.toggle('hidden', !active);
      if (btnFullBoard) {
        btnFullBoard.classList.toggle('on', active);
        btnFullBoard.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    };
    if (btnFullBoard) btnFullBoard.addEventListener('click', function () {
      var active = !document.body.classList.contains('full-board');
      document.body.classList.toggle('full-board', active);
      updateExitBtn(active);
      if (S.hasBoard) renderBoard();
      syncGameLayout();
    });
    if (btnExitFullBoard) btnExitFullBoard.addEventListener('click', function () {
      document.body.classList.remove('full-board');
      updateExitBtn(false);
      if (S.hasBoard) renderBoard();
      syncGameLayout();
    });

    // Panel colapsable (movimientos): el tablero toma todo el espacio
    var collapseBtn = $('#btn-collapse-panel');
    var expandBtn = $('#btn-expand-panel');
    var gameWrap = document.querySelector('.game-wrap');
    function setPanelCollapsed(collapsed) {
      if (gameWrap) gameWrap.classList.toggle('panel-collapsed', collapsed);
      if (collapseBtn) {
        collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        collapseBtn.title = collapsed ? 'Mostrar panel de movimientos' : 'Ocultar panel de movimientos';
      }
      if (expandBtn) expandBtn.classList.toggle('hidden', !collapsed);
      try { localStorage.setItem('bchess-panel-collapsed', collapsed ? '1' : '0'); } catch (e) {}
    }
    if (collapseBtn) collapseBtn.addEventListener('click', function () {
      var isCollapsed = !!(gameWrap && gameWrap.classList.contains('panel-collapsed'));
      setPanelCollapsed(!isCollapsed);
    });
    if (expandBtn) {
      // La barrita se abre con arrastre hacia la izquierda (>40px) o con un simple toque
      var dragStartX = null, dragOpened = false;
      expandBtn.addEventListener('pointerdown', function (e) {
        dragStartX = e.clientX; dragOpened = false;
        try { expandBtn.setPointerCapture(e.pointerId); } catch (e2) {}
        e.preventDefault();
      });
      expandBtn.addEventListener('pointermove', function (e) {
        if (dragStartX === null || dragOpened) return;
        if (dragStartX - e.clientX > 40) { dragOpened = true; setPanelCollapsed(false); }
      });
      expandBtn.addEventListener('pointerup', function () {
        if (dragStartX !== null && !dragOpened) setPanelCollapsed(false); // toque simple = abrir
        dragStartX = null; dragOpened = false;
      });
      expandBtn.addEventListener('pointercancel', function () { dragStartX = null; dragOpened = false; });
    }
    try { if (localStorage.getItem('bchess-panel-collapsed') === '1') setPanelCollapsed(true); } catch (e) {}

    // Ocultar botón pantalla completa cuando no hay partida activa
    function updateFullscreenBtnVisibility() {
      if (!btnFullscreenGame) return;
      btnFullscreenGame.style.display = (S.hasBoard && !S.reviewingGame) ? 'flex' : 'none';
    }
    var _origSetScreen = setScreen;
    setScreen = function (name) {
      _origSetScreen(name);
      updateFullscreenBtnVisibility();
    };
    // Ocultar por defecto al iniciar
    updateFullscreenBtnVisibility();

    // Online: pantalla de elección
    var createTile = $('#btn-create-room');
    if (createTile) createTile.addEventListener('click', function () {
      var st = $('#create-status');
      if (st) { st.textContent = ''; st.className = 'online-status'; }
      var codeInput = $('#online-code');
      if (codeInput && !codeInput.value.trim()) codeInput.value = makeRoomCode();
      setScreen('create-room');
      codeInput && codeInput.focus();
    });

    var joinTile = $('#btn-join-room');
    if (joinTile) joinTile.addEventListener('click', function () {
      var st = $('#join-status');
      if (st) { st.textContent = ''; st.className = 'online-status'; }
      setScreen('join-room');
      var jc = $('#join-code');
      if (jc) { jc.value = ''; jc.focus(); }
    });

    // ---------- Transporte (P2P / LAN, si está disponible) ----------
    var connP2pBtn = $('#conn-mode-p2p');
    var connLanBtn = $('#conn-mode-lan');
    if (connP2pBtn) connP2pBtn.addEventListener('click', function () { applyTransport('p2p'); });
    if (connLanBtn) connLanBtn.addEventListener('click', function () {
      if (!lanAvailable()) {
        showToast('LAN solo disponible en la app de escritorio (.exe)');
        return;
      }
      applyTransport('lan');
    });

    // LAN: cargar IPs locales en el panel del anfitrión
    function loadLanLocalIps() {
      var host = $('#lan-local-ips');
      if (!host) return;
      if (!window.BCHESS_LAN || !window.BCHESS_LAN.getLocalAddresses) {
        host.innerHTML = '<span class="muted" style="font-size:12px;">La IP local solo se detecta en el .exe de escritorio (Electron). En el navegador no hay acceso a la red.</span>';
        return;
      }
      host.innerHTML = '<span class="muted" style="font-size:12px;">Detectando…</span>';
      window.BCHESS_LAN.getLocalAddresses().then(function (list) {
        if (!list || !list.length) {
          host.innerHTML = '<span class="muted" style="font-size:12px;">No se detectaron IPs (¿sin red?). Comprueba tu WiFi/Ethernet.</span>';
          return;
        }
        var port = ($('#lan-port') && $('#lan-port').value) || '5891';
        host.innerHTML = list.map(function (it) {
          return '<button type="button" class="lan-ip-chip" data-copy="' + it.address + ':' + port + '" title="Clic para copiar ' + it.name + '">' + it.address + ':' + port + '</button>';
        }).join('');
        Array.prototype.forEach.call(host.querySelectorAll('.lan-ip-chip'), function (chip) {
          chip.addEventListener('click', function () {
            var val = chip.getAttribute('data-copy');
            try { navigator.clipboard.writeText(val); } catch (e) {}
            showToast('Copiado: ' + val);
          });
        });
      }).catch(function () {
        host.innerHTML = '<span class="muted" style="font-size:12px;">No se pudo detectar la IP local.</span>';
      });
    }

    // LAN: "Crear sala LAN" abre el panel con la IP visible (como el APK)
    var lanHostBtn = $('#btn-lan-host');
    var lanHostPanel = $('#lan-host-panel');
    var lanJoinPanel = $('#lan-join-panel');
    if (lanHostBtn) lanHostBtn.addEventListener('click', function () {
      if (lanJoinPanel) lanJoinPanel.classList.add('hidden');
      if (lanHostPanel) lanHostPanel.classList.remove('hidden');
      loadLanLocalIps();
      var portInp = $('#lan-port');
      if (portInp) {
        portInp.addEventListener('input', loadLanLocalIps);
        portInp.focus();
      }
    });

    // LAN: arrancar el servidor cuando el anfitrión confirma
    var lanStartBtn = $('#btn-lan-start');
    if (lanStartBtn) lanStartBtn.addEventListener('click', function () {
      var port = parseInt(($('#lan-port').value || '5891'), 10);
      if (!port || port < 1024 || port > 65535) {
        showToast('Puerto no válido (1024–65535)');
        return;
      }
      var st = $('#create-status');
      if (st) { st.textContent = 'Iniciando LAN…'; st.className = 'online-status'; }
      savePublicHandle(BCHESS_PROFILE.getProfile().handle);
      var hostLabel = 'LAN:' + port;
      var handlers = {
        onCreated: function (code) {
          if (st) { st.textContent = 'Sala LAN activa — comparte tu IP:puerto'; st.className = 'online-status ok'; }
          // Mostrar IP:puerto real en el lobby (no solo el número de puerto)
          var ipText = hostLabel;
          if (window.BCHESS_LAN && window.BCHESS_LAN.getLocalAddresses) {
            window.BCHESS_LAN.getLocalAddresses().then(function (list) {
              if (list && list.length) {
                ipText = list[0].address + ':' + port;
                var codeEl = $('#lobby-code');
                if (codeEl) codeEl.textContent = ipText;
                var ls = $('#lobby-status');
                if (ls) ls.textContent = 'Esperando al rival en ' + ipText;
              }
            }).catch(function () {});
          }
          $('#lobby-code').textContent = ipText;
          $('#lobby-status').textContent = 'Esperando al rival en ' + ipText;
          $('#lobby-status').className = 'lobby-status';
          $('#lobby-host-controls').classList.remove('hidden');
          $('#lobby-guest-waiting').classList.add('hidden');
          $('#btn-start-online').disabled = true;
          renderLobbyConfigSummary();
          setScreen('lobby');
        },
        onConnected: function () {
          $('#lobby-status').textContent = 'Rival conectado. Configura la partida.';
          $('#lobby-status').className = 'lobby-status ok';
          if (BCHESS_NET.isHost()) $('#btn-start-online').disabled = false;
        },
        onMessage: handleNetMessage,
        onDisconnected: function (reason) {
          S.onlineConnected = false;
          stopClock();
          hideOnlineRemoteCard();
          showLobbyError(reason || 'Rival desconectado.');
          setScreen('online');
        },
        onError: function (msg) {
          showLobbyError(msg, 'create-status');
          setScreen('create-room');
        }
      };
      BCHESS_NET.createRoom(String(port), handlers);
    });

    // LAN: mostrar panel de unirse
    var lanJoinBtn = $('#btn-lan-join');
    if (lanJoinBtn) lanJoinBtn.addEventListener('click', function () {
      if (lanHostPanel) lanHostPanel.classList.add('hidden');
      if (lanJoinPanel) lanJoinPanel.classList.remove('hidden');
      var inp = $('#lan-host-ip');
      if (inp) inp.focus();
    });

    // LAN: el campo "IP del anfitrión" acepta pegar "ip:puerto" y separa al puerto
    var lanIpInput = $('#lan-host-ip');
    var lanPortInput = $('#lan-join-port');
    if (lanIpInput && lanPortInput) {
      lanIpInput.addEventListener('input', function () {
        var v = (lanIpInput.value || '').trim();
        var idx = v.indexOf(':');
        if (idx !== -1) {
          var ip = v.substring(0, idx).trim();
          var p = parseInt(v.substring(idx + 1), 10);
          if (ip) lanIpInput.value = ip;
          if (p && p >= 1024 && p <= 65535) lanPortInput.value = p;
        }
      });
    }

    // LAN: conectar como invitado
    var lanConnectBtn = $('#btn-lan-connect');
    if (lanConnectBtn) lanConnectBtn.addEventListener('click', function () {
      var hostIP = ($('#lan-host-ip').value || '').trim();
      var port = parseInt(($('#lan-join-port').value || '5891'), 10);
      if (!hostIP) {
        var st = $('#create-status');
        if (st) { st.textContent = 'Introduce la IP del anfitrión'; st.className = 'online-status error'; }
        return;
      }
      if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostIP)) {
        var stIp = $('#create-status');
        if (stIp) { stIp.textContent = 'Formato de IP no válido (ej. 192.168.1.50)'; stIp.className = 'online-status error'; }
        return;
      }
      if (!port || port < 1024 || port > 65535) {
        var st2 = $('#create-status');
        if (st2) { st2.textContent = 'Puerto no válido'; st2.className = 'online-status error'; }
        return;
      }
      savePublicHandle(BCHESS_PROFILE.getProfile().handle);
      var handlers = {
        onCreated: function (code) {},
        onConnected: function () {
          $('#lobby-status').textContent = 'Rival conectado. Configura la partida.';
          $('#lobby-status').className = 'lobby-status ok';
          if (BCHESS_NET.isHost()) $('#btn-start-online').disabled = false;
        },
        onMessage: handleNetMessage,
        onDisconnected: function (reason) {
          S.onlineConnected = false;
          stopClock();
          hideOnlineRemoteCard();
          showLobbyError(reason || 'Rival desconectado.');
          setScreen('online');
        },
        onError: function (msg) {
          showLobbyError(msg, 'join-status');
          setScreen('join-room');
        }
      };
      BCHESS_NET.joinRoom(hostIP + ':' + port, handlers);
    });

    // Crear sala: modo individual/torneo
    bindSeg('#seg-room-mode', function (v) {
      var roundsField = $('#room-rounds-field');
      if (roundsField) roundsField.classList.toggle('hidden', v !== 'torneo');
      S.roomMode = v;
    });

    // Generar código automático
    var genBtn = $('#btn-gen-code');
    if (genBtn) genBtn.addEventListener('click', function () {
      var inp = $('#online-code') || $('#online-code-own');
      if (inp) { inp.value = makeRoomCode(); inp.focus(); }
    });

    // Toggle: generar código vs crear código propio (switch)
    var switchOwnCode = $('#switch-own-code');
    if (switchOwnCode) {
      switchOwnCode.addEventListener('change', function () {
        var genRow = $('#code-row-gen');
        var ownRow = $('#code-row-own');
        var ownInput = $('#online-code-own');
        if (switchOwnCode.checked) {
          if (genRow) genRow.classList.add('hidden');
          if (ownRow) ownRow.classList.remove('hidden');
          if (ownInput) { ownInput.value = ''; ownInput.focus(); }
        } else {
          if (ownRow) ownRow.classList.add('hidden');
          if (genRow) genRow.classList.remove('hidden');
          var genInput = $('#online-code');
          if (genInput && !genInput.value.trim()) genInput.value = makeRoomCode();
        }
      });
    }

    // Confirmar creación de sala
    var createConfirm = $('#btn-create-confirm');
    if (createConfirm) createConfirm.addEventListener('click', function () {
      var useOwn = switchOwnCode && switchOwnCode.checked;
      var code = '';
      if (useOwn) {
        code = ($('#online-code-own').value || '').trim().toUpperCase();
      } else {
        code = ($('#online-code').value || '').trim();
      }
      if (code && !/^[A-Za-z0-9]{4,12}$/.test(code)) {
        var st = $('#create-status');
        if (st) { st.textContent = 'Código no válido: usa de 4 a 12 letras o números.'; st.className = 'online-status error'; }
        return;
      }
      var st2 = $('#create-status');
      if (st2) { st2.textContent = 'Creando sala…'; st2.className = 'online-status'; }
      savePublicHandle(BCHESS_PROFILE.getProfile().handle);
      connectNet(true, code);
    });
    var createBack = $('#btn-create-back');
    if (createBack) createBack.addEventListener('click', function () { setScreen('online'); });

    // Confirmar unirse con código
    var joinConfirm = $('#btn-join-confirm');
    if (joinConfirm) joinConfirm.addEventListener('click', function () {
      var code = ($('#join-code').value || '').trim();
      if (!code) {
        var st = $('#join-status');
        if (st) { st.textContent = 'Introduce el código del anfitrión.'; st.className = 'online-status error'; }
        return;
      }
      var st2 = $('#join-status');
      if (st2) { st2.textContent = 'Conectando con la sala…'; st2.className = 'online-status'; }
      savePublicHandle(BCHESS_PROFILE.getProfile().handle);
      connectNet(false, code);
    });
    var joinBack = $('#btn-join-back');
    if (joinBack) joinBack.addEventListener('click', function () { setScreen('online'); });
    var joinInput = $('#join-code');
    if (joinInput) joinInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && joinConfirm) joinConfirm.click();
    });

    // Barra lateral (delegación)
    var rail = $('#side-rail');
    if (rail) rail.addEventListener('click', function (e) {
      var editBtn = e.target.closest('[data-edit="rail"]');
      if (editBtn) { openRailModal(); return; }
      var btn = e.target.closest('[data-rail]');
      if (btn) navigateRail(btn.getAttribute('data-rail'));
    });
    renderRail();

    // Personalizar barra
    var railList = $('#rail-list');
    if (railList) {
      railList.addEventListener('click', function (e) {
        var up = e.target.closest('[data-rail-up]');
        if (up) { moveRailItem(railList, up.getAttribute('data-rail-up'), -1); return; }
        var down = e.target.closest('[data-rail-down]');
        if (down) { moveRailItem(railList, down.getAttribute('data-rail-down'), 1); return; }
      });
      railList.addEventListener('change', function (e) {
        if (e.target && e.target.hasAttribute('data-rail-check')) applyRailFromDom(railList);
      });
    }
    var closeRail = $('#btn-close-rail');
    if (closeRail) closeRail.addEventListener('click', function () { $('#rail-modal').classList.remove('show'); });
    var resetRail = $('#btn-reset-rail');
    if (resetRail) resetRail.addEventListener('click', function () { saveRailConfig(RAIL_DEFAULT.slice()); renderRailList($('#rail-list')); renderRail(); updateRailActive(); });

    // Perfil guardado sincroniza
    window.addEventListener('bchess:profile-saved', function (e) {
      if (e.detail && e.detail.name) {
        S.settings.name = e.detail.name;
        saveSettings();
        var p = BCHESS_PROFILE.getProfile();
        var topAvatar = $('#top-avatar');
        if (topAvatar) BCHESS_PROFILE.renderAvatar(topAvatar, p);
        var topHandle = $('#top-profile-handle');
        if (topHandle) topHandle.textContent = p.handle || p.name || 'Elal_Chico';
      }
    });

    // En navegador: deshabilitar el modo LAN (requiere Electron)
    disableLanForWeb();

    // Estado de conexión inicial
    applyTransport('p2p');

    // Estado de conexión de ambos transportes (cada evento se etiqueta por origen)
    try { _p2pNet.onState(function (s) { var st = (s && s.state) || 'idle'; if (S.transport === 'p2p') applyConnState(s); else setTransportState('p2p', st); }); } catch (e) {}
    try { if (_lanNet) _lanNet.onState(function (s) { var st = (s && s.state) || 'idle'; if (S.transport === 'lan') applyConnState(s); else setTransportState('lan', st); }); } catch (e) {}

    // Avatar superior
    BCHESS_PROFILE.refreshProfile();

    // Setup IA
    bindSeg('#seg-color', function (v) { S.settings.colorAI = v; saveSettings(); });
    bindClockControl('ai', 'clockAI');
    var progressiva = $('#toggle-progressive');
    if (progressiva) progressiva.addEventListener('click', function () {
      S.settings.aiProgressEnabled = (S.settings.aiProgressEnabled === false);
      // Restaurar racha cuando se activa
      if (S.settings.aiProgressEnabled) S.settings.aiWinStreak = 0;
      saveSettings(); renderSetupDifficulty(); renderSettingsUI();
    });
    $('#difficulty').addEventListener('input', function () {
      S.settings.difficulty = parseInt(this.value, 10);
      // Cambiar la dificultad manualmente rompe la racha (las 6 son seguidas)
      S.settings.aiWinStreak = 0;
      renderSetupDifficulty();
      saveSettings();
    });
    var aiSpeedSel = $('#ai-speed');
    if (aiSpeedSel) aiSpeedSel.addEventListener('change', function () {
      S.settings.aiSpeed = this.value;
      $('#ai-speed-value').textContent = speedLabelFor(this.value);
      saveSettings();
    });
    $('#btn-start-ai').addEventListener('click', startAIGame);

    // Online: ver pantalla de elección (handlers arriba)

    // Lobby host
    bindClockControl('online', 'clockOnline');
    bindSeg('#seg-color-online', function (v) { S.settings.colorOnline = v; saveSettings(); });
    $('#btn-start-online').addEventListener('click', function () {
      if (!S.onlineConnected) return;
      if (!ensureNoLiveGame()) return;
      S.mode = 'online';
      var color = S.settings.colorOnline;
      if (color === 'r') color = Math.random() < 0.5 ? 'w' : 'b';
      var parsed = parseTimeControl(S.settings.clockOnline);
      // Preparar torneo si corresponde
      S.roomRounds = S.roomMode === 'torneo' ? (parseInt(($('#room-rounds') || {}).value, 10) || 3) : 1;
      if (S.roomMode === 'torneo') {
        S.tournament = {
          games: S.roomRounds, timeMs: parsed.timeMs, incrementMs: parsed.incrementMs,
          played: 0, localWins: 0, remoteWins: 0, draws: 0, active: true, finished: false
        };
      } else {
        S.tournament = null;
      }
      S.timeMs = parsed.timeMs; S.incrementMs = parsed.incrementMs;
      sendOnlineStart(color);
    });

    // Copiar código de sala
    var copyCodeBtn = $('#btn-copy-lobby-code');
    if (copyCodeBtn) copyCodeBtn.addEventListener('click', function () {
      var code = $('#lobby-code').textContent;
      if (code && code !== '------') {
        navigator.clipboard.writeText(code).then(function () {
          copyCodeBtn.classList.add('copied');
          copyCodeBtn.title = '¡Copiado!';
          showToast('Código copiado: ' + code);
          setTimeout(function () { copyCodeBtn.classList.remove('copied'); copyCodeBtn.title = 'Copiar código'; }, 2000);
        });
      }
    });

    // Copiar código en línea
    var copyOnlineCodeBtn = $('#btn-copy-online-code');
    if (copyOnlineCodeBtn) copyOnlineCodeBtn.addEventListener('click', function () {
      var code = $('#online-code').value.trim();
      if (code) {
        navigator.clipboard.writeText(code).then(function () {
          copyOnlineCodeBtn.classList.add('copied');
          copyOnlineCodeBtn.title = '¡Copiado!';
          showToast('Código copiado: ' + code);
          setTimeout(function () { copyOnlineCodeBtn.classList.remove('copied'); copyOnlineCodeBtn.title = 'Copiar código'; }, 2000);
        });
      }
    });

    // Copiar código propio
    var copyOwnCodeBtn = $('#btn-copy-own-code');
    if (copyOwnCodeBtn) copyOwnCodeBtn.addEventListener('click', function () {
      var inp = $('#online-code-own');
      var code = (inp.value || '').trim().toUpperCase();
      inp.value = code;
      if (code) {
        navigator.clipboard.writeText(code).then(function () {
          copyOwnCodeBtn.classList.add('copied');
          copyOwnCodeBtn.title = '¡Copiado!';
          showToast('Código copiado: ' + code);
          setTimeout(function () { copyOwnCodeBtn.classList.remove('copied'); copyOwnCodeBtn.title = 'Copiar código'; }, 2000);
        });
      }
    });

    // Input código propio: forzar mayúsculas al escribir
    var ownInput = $('#online-code-own');
    if (ownInput) ownInput.addEventListener('input', function () {
      this.value = this.value.toUpperCase();
    });

    // Settings
    // settings-name eliminado (se edita en perfil)
    $('#toggle-sound').addEventListener('click', function () {
      S.settings.sound = !S.settings.sound;
      BCHESS_SOUNDS.setEnabled(S.settings.sound);
      saveSettings(); renderSettingsUI();
    });
    bindSeg('#seg-soundpack', function (v) {
      S.settings.soundPack = v;
      BCHESS_SOUNDS.setPack(v);
      BCHESS_SOUNDS.play('start');
      saveSettings();
    });
    bindSeg('#seg-premove-style', function (v) {
      S.settings.premoveStyle = v;
      saveSettings(); renderSettingsUI(); renderBoard();
    });
    var premoveToggle = $('#toggle-premove');
    if (premoveToggle) premoveToggle.addEventListener('click', function () {
      S.settings.premove = (S.settings.premove === false);
      saveSettings(); renderSettingsUI(); renderBoard();
    });
    var coordsToggle = $('#toggle-coordinates');
    if (coordsToggle) coordsToggle.addEventListener('click', function () {
      S.settings.showCoordinates = (S.settings.showCoordinates === false);
      saveSettings(); renderSettingsUI(); renderBoard();
    });
    var legalToggle = $('#toggle-legal-moves');
    if (legalToggle) legalToggle.addEventListener('click', function () {
      S.settings.showLegalMoves = (S.settings.showLegalMoves === false);
      saveSettings(); renderSettingsUI(); renderBoard();
    });
    var checkToggle = $('#toggle-check');
    if (checkToggle) checkToggle.addEventListener('click', function () {
      S.settings.showCheck = (S.settings.showCheck === false);
      saveSettings(); renderSettingsUI(); renderBoard();
    });
    var lastMoveToggle = $('#toggle-last-move');
    if (lastMoveToggle) lastMoveToggle.addEventListener('click', function () {
      S.settings.showLastMove = (S.settings.showLastMove === false);
      saveSettings(); renderSettingsUI(); renderBoard();
    });

    // Privacidad: 4 toggles (persistidos en settings.privacy)
    [['#toggle-share-photo', 'sharePhoto'],
     ['#toggle-share-identity', 'shareIdentity'],
     ['#toggle-share-stats', 'shareStats'],
     ['#toggle-share-history', 'shareHistory']].forEach(function (pair) {
      var el = $(pair[0]);
      if (!el) return;
      el.addEventListener('click', function () {
        S.settings.privacy = S.settings.privacy || {};
        var key = pair[1];
        S.settings.privacy[key] = !(S.settings.privacy[key] !== false);
        saveSettings(); renderSettingsUI();
      });
    });
    var railEdit = $('#btn-settings-rail');
    if (railEdit) railEdit.addEventListener('click', openRailModal);
    $('#volume').addEventListener('input', function () {
      S.settings.volume = parseInt(this.value, 10);
      BCHESS_SOUNDS.setVolume(S.settings.volume);
      saveSettings();
    });

    // Game buttons
    $('#btn-resign').addEventListener('click', sendResign);
    $('#btn-offer-draw').addEventListener('click', sendDrawOffer);
    $('#btn-new-game').addEventListener('click', function () {
      if (S.mode === 'ai') startAIGame(); else setScreen('home');
    });
    $('#btn-accept-draw').addEventListener('click', function () { sendDrawResponse(true); });
    $('#btn-decline-draw').addEventListener('click', function () { sendDrawResponse(false); });
    var sameBtn = $('#btn-same-game');
    if (sameBtn) sameBtn.addEventListener('click', function () { newGameFromCurrent('same'); });
    var randomBtn = $('#btn-random-game');
    if (randomBtn) randomBtn.addEventListener('click', function () { newGameFromCurrent('random'); });
    var nextTBtn = $('#btn-next-tournament');
    if (nextTBtn) nextTBtn.addEventListener('click', function () { newGameFromCurrent('tournament'); });
    var replayBtn = $('#btn-replay-pgn');
    if (replayBtn) replayBtn.addEventListener('click', replayCurrentGame);
    var backRoomBtn = $('#btn-back-room');
    if (backRoomBtn) backRoomBtn.addEventListener('click', function () {
      hideEndModal();
      if (S.mode === 'online') backToRoom(); else setScreen('home');
    });
    $('#btn-close-end-modal').addEventListener('click', function () { hideEndModal(); });
    var endPlayerMe = $('#end-player-me');
    if (endPlayerMe) endPlayerMe.addEventListener('click', function () {
      hideEndModal();
      BCHESS_PROFILE.refreshProfile();
      setScreen('profile');
    });
    var endPlayerOpp = $('#end-player-opp');
    if (endPlayerOpp) endPlayerOpp.addEventListener('click', function () {
      var oppName = ($('#name-them') && $('#name-them').textContent) || 'Rival';
      hideEndModal();
      if (S.mode === 'online' && S.remoteProfile) openRemoteProfile();
      else BCHESS_PROFILE.openOpponentProfile(oppName);
    });

    // Clic en tarjetas/avatares del tablero → ver perfil
    var cardThem = $('#card-them');
    if (cardThem) cardThem.addEventListener('click', function () {
      if (S.mode === 'online' && S.remoteProfile) openRemoteProfile();
      else {
        var n = ($('#name-them') && $('#name-them').textContent) || 'Rival';
        BCHESS_PROFILE.openOpponentProfile(n);
      }
    });
    var cardUs = $('#card-us');
    if (cardUs) cardUs.addEventListener('click', function () {
      BCHESS_PROFILE.refreshProfile();
      setScreen('profile');
    });
    var lobbyRivalBtn = $('#btn-lobby-view-rival');
    if (lobbyRivalBtn) lobbyRivalBtn.addEventListener('click', function () {
      openRemoteProfile();
    });
    // Accesos rápidos en sala: historial y perfil propio (anfitrión e invitado)
    var lobbyHistory = $('#btn-lobby-history');
    if (lobbyHistory) lobbyHistory.addEventListener('click', function () { BCHESS_PROFILE.refreshHistory(); setScreen('history'); });
    var lobbyProfile = $('#btn-lobby-profile');
    if (lobbyProfile) lobbyProfile.addEventListener('click', function () { BCHESS_PROFILE.refreshProfile(); setScreen('profile'); });
    // Tarjeta de rival conectado en Conexión → abrir su perfil
    var onlineRemoteInfo = $('#btn-online-remote-info');
    if (onlineRemoteInfo) onlineRemoteInfo.addEventListener('click', function () { openRemoteProfile(); });
    var onlineRemoteInfoKey = onlineRemoteInfo;
    if (onlineRemoteInfoKey) onlineRemoteInfoKey.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRemoteProfile(); }
    });
    var onlineViewRemote = $('#btn-online-view-remote');
    if (onlineViewRemote) onlineViewRemote.addEventListener('click', function () { openRemoteProfile(); });

    // Playback controls
    $('#btn-ply-first').addEventListener('click', function () { stopAutoPlay(); setViewPly(0); });
    $('#btn-ply-prev').addEventListener('click', function () { stopAutoPlay(); setViewPly(S.viewPly - 1); });
    $('#btn-ply-next').addEventListener('click', function () { stopAutoPlay(); setViewPly(S.viewPly + 1); });
    $('#btn-ply-last').addEventListener('click', function () { stopAutoPlay(); setViewPly(S.fens.length - 1); });
    $('#btn-play-auto').addEventListener('click', toggleAutoPlay);
    $('#playback-speed').addEventListener('change', function () { setPlaybackSpeed(this.value); });

    document.addEventListener('keydown', function (e) {
      if (!S.game) return;
      var tag = (e.target && (e.target.tagName || '')).toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if ($('#screen-game').classList.contains('active') === false) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); stopAutoPlay(); setViewPly(S.viewPly - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stopAutoPlay(); setViewPly(S.viewPly + 1); }
      else if (e.key === 'Home') { e.preventDefault(); stopAutoPlay(); setViewPly(0); }
      else if (e.key === 'End') { e.preventDefault(); stopAutoPlay(); setViewPly(S.fens.length - 1); }
      else if (e.key === ' ') { e.preventDefault(); toggleAutoPlay(); }
      else if (e.key === 'f' || e.key === 'F') { toggleFullscreen(); }
    });

    // PGN
    $('#btn-copy-pgn').addEventListener('click', function () {
      var text = pgnText();
      if (!text) { showToast('No hay jugadas para copiar'); return; }
      var done = function () { showToast('PGN copiado al portapapeles'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
      } else { fallbackCopy(text); done(); }
    });
    $('#btn-download-pgn').addEventListener('click', function () {
      var text = pgnText();
      if (!text) { showToast('No hay jugadas para descargar'); return; }
      var blob = new Blob([text], { type: 'application/x-chess-pgn' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'bchess-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.pgn';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });

    // Exit review mode
    var exitReview = $('#btn-exit-review');
    if (exitReview) exitReview.addEventListener('click', function () {
      stopAutoPlay();
      setScreen('home');
    });

    // beforeunload: limpiar sala si somos host
    window.addEventListener('beforeunload', function () {
      if (S.mode === 'online' && BCHESS_NET.isConnected()) {
        BCHESS_NET.sendLine(JSON.stringify({ v: 2, type: 'DISCONNECT', byName: S.settings.name || 'Rival', reason: 'user_disconnect' }));
      }
      BCHESS_NET.cleanup(true);
    });

    setScreen('home');
  }

  // ================= Persistencia settings =================
  // Privacidad para partidas en línea (todo activado por defecto)
  function privacySettings() {
    var p = (S.settings && S.settings.privacy) || {};
    return {
      sharePhoto: p.sharePhoto !== false,
      shareIdentity: p.shareIdentity !== false,
      shareStats: p.shareStats !== false,
      shareHistory: p.shareHistory !== false
    };
  }

  function loadSettings() {
    try {
      var raw = localStorage.getItem('bchess-v2-settings');
      if (raw) {
        var s = JSON.parse(raw);
        for (var k in s) if (s.hasOwnProperty(k)) S.settings[k] = s[k];
        if ((S.settings.settingsVersion || 1) < 2) {
          S.settings.colorAI = 'r';
          S.settings.colorOnline = 'r';
          S.settings.settingsVersion = 2;
        }
      }
    } catch (e) {}
    BCHESS_SOUNDS.setEnabled(S.settings.sound);
    BCHESS_SOUNDS.setVolume(S.settings.volume);
  }

  function saveSettings() {
    try {
      var clone = {};
      for (var k in S.settings) {
        if (!S.settings.hasOwnProperty(k)) continue;
        if (k === 'fens' || k === 'viewPly') continue;
        clone[k] = S.settings[k];
      }
      localStorage.setItem('bchess-v2-settings', JSON.stringify(clone));
    } catch (e) {}
  }

  function applyTheme() {
    var theme = BCHESS_PIECES.themes.find(function (t) { return t.id === S.settings.boardTheme; }) || BCHESS_PIECES.themes[0];
    document.documentElement.style.setProperty('--sq-light', theme.light);
    document.documentElement.style.setProperty('--sq-dark', theme.dark);
  }

  function pieceUrl(color, type) {
    return BCHESS_PIECES.pieceUrl(S.settings.pieceSet, color, type);
  }

  // ================= Tablero =================
  function sqToAlgebraic(sq) {
    return 'abcdefgh'.charAt(sq % 8) + (Math.floor(sq / 8) + 1);
  }
  function algebraicToSquare(alg) {
    return (alg.charCodeAt(1) - 49) * 8 + (alg.charCodeAt(0) - 97);
  }
  function displayToSquare(row, col) {
    return S.orientation === 'w' ? (7 - row) * 8 + col : row * 8 + (7 - col);
  }

  // Cachés para evitar recomputar historial/FEN en cada render
  var histCache = { key: null, hist: null };
  function historyVerbose() {
    if (!S.game) return [];
    var key = S.fens.length + '|' + (S.fens.length ? S.fens[S.fens.length - 1] : '');
    if (histCache.key === key) return histCache.hist;
    histCache.key = key;
    histCache.hist = S.game.history({ verbose: true });
    return histCache.hist;
  }

  function moveAtPly(ply) {
    var hist = historyVerbose();
    return ply > 0 && ply <= hist.length ? hist[ply - 1] : null;
  }

  // viewGame() parsea el FEN solo cuando el ply cambia (no en cada pointer)
  var viewCache = { fen: null, game: null };
  function viewGame() {
    var fen = S.fens[S.viewPly];
    if (!fen) { var t = new Chess(); t.reset(); return t; }
    if (viewCache.fen === fen) return viewCache.game;
    var tmp = new Chess();
    try { tmp.load(fen); } catch (e) { tmp.reset(); }
    viewCache.fen = fen;
    viewCache.game = tmp;
    return tmp;
  }

  function isFullHistoryInView() {
    return S.viewPly === S.fens.length - 1;
  }

  function isLocalTurn() {
    if (S.gameOver || !S.game) return false;
    if (!isFullHistoryInView()) return false;
    if (S.mode === 'online' && !S.onlineConnected) return false;
    return S.game.turn() === S.localColor;
  }

  // ================= Tablero: render incremental =================
  // Se construye el DOM una sola vez; después solo se tocan las celdas que cambian.
  var boardCells = null; // sq(0..63) → { el, img, pieceSig, flags:{lastMove,selected,legal,capture,check,premove} }
  var renderCache = {
    orientation: null,
    showCoords: null,
    fenKey: null,
    legalSig: null,
    lastSig: null,
    checkSq: null,
    pieceSet: null,
    premoveSig: null,
    atLive: null
  };

  function clearBoardCache() {
    boardCells = null;
    renderCache.orientation = null;
    renderCache.showCoords = null;
    renderCache.fenKey = null;
    renderCache.legalSig = null;
    renderCache.lastSig = null;
    renderCache.checkSq = null;
    renderCache.premoveSig = null;
    renderCache.atLive = null;
  }

  function setCellFlag(rec, flag, on) {
    if (rec.flags[flag] === on) return;
    rec.flags[flag] = on;
    rec.el.classList.toggle(flag, on);
  }

  function buildBoardCells() {
    var board = $('#board');
    if (!board) return;
    board.innerHTML = '';
    boardCells = new Array(64);
    for (var row = 0; row < 8; row++) {
      for (var col = 0; col < 8; col++) {
        var sq = displayToSquare(row, col);
        var alg = sqToAlgebraic(sq);
        var cellEl = document.createElement('div');
        var isLight = (row + col) % 2 === 0;
        cellEl.className = 'square ' + (isLight ? 'light' : 'dark');
        cellEl.dataset.square = sq;
        if (S.settings.showCoordinates !== false) {
          if (col === 0) {
            var rs = document.createElement('span');
            rs.className = 'coord rank';
            rs.textContent = alg.charAt(1);
            cellEl.appendChild(rs);
          }
          if (row === 7) {
            var fs = document.createElement('span');
            fs.className = 'coord file';
            fs.textContent = alg.charAt(0);
            cellEl.appendChild(fs);
          }
        }
        var img = document.createElement('img');
        img.className = 'piece';
        img.alt = '';
        img.draggable = false;
        img.style.display = 'none';
        cellEl.appendChild(img);
        cellEl.addEventListener('pointerdown', onSquarePress);
        board.appendChild(cellEl);
        boardCells[sq] = { sq: sq, el: cellEl, img: img, pieceSig: '', flags: {} };
      }
    }
    renderCache.orientation = S.orientation;
    renderCache.showCoords = (S.settings.showCoordinates !== false);
    renderCache.fenKey = null;
    renderCache.legalSig = null;
    renderCache.lastSig = null;
    renderCache.checkSq = null;
    renderCache.pieceSet = null;
    renderCache.premoveSig = null;
    renderCache.atLive = null;
  }

  function detectKingCheck(vg) {
    if (!vg.in_check()) return null;
    var turn = vg.turn();
    var files = 'abcdefgh';
    for (var r = 1; r <= 8; r++) {
      for (var f = 0; f < 8; f++) {
        var p = vg.get(files.charAt(f) + r);
        if (p && p.type === 'k' && p.color === turn) return algebraicToSquare(files.charAt(f) + r);
      }
    }
    return null;
  }

  function computeVisualPieces(vg) {
    const m = {};
    const files = 'abcdefgh';
    const rawBoard = (typeof vg.board === 'function') ? vg.board() : [];
    // rawBoard[0] = rank 8 (negras arriba), rawBoard[7] = rank 1. files a..h → columnas 0..7
    for (let r = 0; r < 8; r++) {
      const row = rawBoard[r] || [];
      for (let c = 0; c < 8; c++) {
        const cell = row[c];
        if (cell) {
          const alg = files[c] + (8 - r);
          m[alg] = { type: cell.type, color: cell.color, ghost: false };
        }
      }
    }
    // Aplicar la cola de premoves en orden (signo de jugadas ya hechas sino conocidas)
    for (const pm of S.premoveQueue) {
      const p = m[pm.from];
      if (!p) continue;
      delete m[pm.from];
      const type = pm.promotion ? pm.promotion : p.type;
      m[pm.to] = { type: type, color: p.color, ghost: true };
    }
    return m;
  }

  function renderBoard() {
    var board = $('#board');
    if (!board) return;
    if (!boardCells ||
        renderCache.orientation !== S.orientation ||
        renderCache.showCoords !== (S.settings.showCoordinates !== false)) {
      buildBoardCells();
    }
    var vg = viewGame();
    var atLive = isFullHistoryInView();
    var fenKey = S.fens[S.viewPly] || 'empty:' + S.viewPly;
    var pmStyle = (S.settings && S.settings.premoveStyle) || 'movefull';
    var visualPieces = computeVisualPieces(vg);
    var pmSig = S.premoveQueue.map(pm => pm.from + '>' + (pm.to === null ? '_' : pm.to)).join('|') || 'none';
    var visualKey = fenKey + '::' + pmSig + '::' + pmStyle;
    var lastMove = moveAtPly(S.viewPly);
    var lastSig = (S.settings.showLastMove !== false && lastMove) ? (lastMove.from + '>' + lastMove.to) : 'none';
    var legalOn = S.settings.showLegalMoves !== false;
    var legalSig = legalOn && atLive ? (S.legalTargets.join(',') + '@' + S.selected) : 'off';
    var checkSq = S.settings.showCheck !== false ? detectKingCheck(vg) : null;
    var premoveSig = visualKey;
    var pieceSet = S.settings.pieceSet;

    var piecesChanged = renderCache.fenKey !== fenKey || renderCache.pieceSet !== pieceSet || renderCache.premoveSig !== premoveSig;
    var clsChanged = piecesChanged || renderCache.legalSig !== legalSig || renderCache.lastSig !== lastSig ||
      renderCache.checkSq !== checkSq || renderCache.atLive !== atLive || (S.premoveQueue && S.premoveQueue.length > 0);
    if (!clsChanged) { updatePlaybackUI(); return; } // nada que pintar

    var showLast = S.settings.showLastMove !== false && lastMove;
    for (var sq = 0; sq < 64; sq++) {
      var rec = boardCells[sq];
      var alg = sqToAlgebraic(sq);

      // Piezas: solo tocar la <img> si cambió el set o el contenido
      if (piecesChanged) {
        var p = visualPieces[alg];
        var sig = p ? pieceSet + ':' + p.color + p.type + (p.ghost ? ':g' : '') : '';
        if (rec.pieceSig !== sig) {
          rec.pieceSig = sig;
          if (p) {
            var url = pieceUrl(p.color, p.type);
            if (rec.img.getAttribute('src') !== url) rec.img.src = url;
            rec.img.style.display = '';
            rec.img.style.opacity = p.ghost ? '0.5' : '';
          } else {
            rec.img.style.display = 'none';
          }
        }
      }

      // Clases
      var style = (S.settings && S.settings.premoveStyle) || 'movefull';
      setCellFlag(rec, 'style-movefull', style === 'movefull');
      setCellFlag(rec, 'style-gm2000', style === 'gm2000');
      var fromIdx = {}, toIdx = {};
      if (style !== 'atenuado') {
        S.premoveQueue.forEach(function (pm) {
          if (pm.from !== undefined && pm.from !== null) fromIdx[pm.from] = true;
          if (pm.to !== undefined && pm.to !== null) toIdx[pm.to] = true;
        });
      }
      setCellFlag(rec, 'premove-from', !!fromIdx[sq]);
      setCellFlag(rec, 'premove-to', !!toIdx[sq]);
      setCellFlag(rec, 'last-move', !!(showLast && lastMove && (lastMove.from === alg || lastMove.to === alg)));
      setCellFlag(rec, 'selected', !!(atLive && S.selected === sq));
      var isLegal = legalOn && atLive && S.legalTargets.indexOf(sq) !== -1;
      setCellFlag(rec, 'legal', isLegal);
      setCellFlag(rec, 'capture', !!(isLegal && vg.get(alg)));
      setCellFlag(rec, 'check', checkSq === sq);
      // premove visual removido a petición del usuario (sin marcas amarillas/azules)
    }

    renderCache.fenKey = fenKey;
    renderCache.legalSig = legalSig;
    renderCache.lastSig = lastSig;
    renderCache.checkSq = checkSq;
    renderCache.pieceSet = pieceSet;
    renderCache.premoveSig = premoveSig;
    renderCache.atLive = atLive;
    updatePlaybackUI();
    syncGameLayout();
  }

  function legalTargetsFrom(sq) {
    var alg = sqToAlgebraic(sq);
    var moves = S.game.moves({ square: alg, verbose: true });
    return moves.map(function (m) { return algebraicToSquare(m.to); });
  }

  function selectSquare(sq) {
    S.selected = sq;
    S.legalTargets = legalTargetsFrom(sq);
    renderBoard();
  }

  function clearSelection() {
    S.selected = null;
    S.legalTargets = [];
    // Solo limpiar cola premove si es nuestro turno (para no cancelar premove del oponente)
    if (isLocalTurn()) {
      S.premoveQueue = [];
    }
    renderBoard();
  }

  function onSquarePress(e) {
    e.preventDefault();
    if (S.gameOver || !S.game || S.countdownTick !== null) return;
    
    var cell = e.target.closest ? e.target.closest('.square') : null;
    if (!cell) return;
    var sq = parseInt(cell.dataset.square, 10);
    var alg = sqToAlgebraic(sq);
    var piece = S.game.get(alg);

    // Si es turno local, comportamiento normal
    if (isLocalTurn()) {
      if (S.selected !== null && S.legalTargets.indexOf(sq) !== -1) {
        makeMove(S.selected, sq);
        return;
      }
      if (piece && piece.color === S.localColor) {
        selectSquare(sq);
        startDrag(e, sq);
      } else {
        clearSelection();
      }
      return;
    }

    // No es turno local - manejar premove si está habilitado
    if (!S.settings.premove) return;

    var isOwn = piece && piece.color === S.localColor;

    // Auto-promoción (peón a última fila → reina); válido también en turno rival
    function detectPromo(fromSq, toSq, fallback) {
      try {
        var fromAlg = sqToAlgebraic(fromSq), toAlg = sqToAlgebraic(toSq);
        var p = S.game.get(fromAlg);
        if (p && p.type === 'p') {
          var rank = toAlg.charAt(1);
          if ((p.color === 'w' && rank === '8') || (p.color === 'b' && rank === '1')) return 'q';
        }
      } catch (e) {}
      return fallback || null;
    }

    // Buscar el premove en construcción (último de la cola con to === null)
    var buildingIdx = -1;
    for (var i = S.premoveQueue.length - 1; i >= 0; i--) {
      if (S.premoveQueue[i].to === null) { buildingIdx = i; break; }
    }

    // Hay un premove en construcción (origen fijado, destino pendiente)
    if (buildingIdx !== -1) {
      var building = S.premoveQueue[buildingIdx];
      // Clic en una pieza propia distinta → re-seleccionar origen + iniciar arrastre
      if (isOwn && sq !== building.from) {
        building.from = sq;
        building.promotion = null;
        startDrag(e, sq);
        renderBoard();
        return;
      }
      // Clic en la misma pieza origen → cancelar este premove
      if (sq === building.from) {
        S.premoveQueue.splice(buildingIdx, 1);
        renderBoard();
        return;
      }
      // Clic en cualquier otra casilla → fijar/actualizar destino y completar este premove
      building.to = sq;
      building.promotion = detectPromo(building.from, sq, building.promotion);
      renderBoard();
      return;
    }

    // Sin premove en construcción: iniciar uno nuevo tocando una pieza propia
    if (isOwn) {
      S.premoveQueue.push({ from: sq, to: null, promotion: null });
      startDrag(e, sq);
      renderBoard();
      return;
    }

    // Clic en casilla vacía u otra pieza: nada (no limpiamos la cola, solo el en construcción)
  }

  // ================= Drag & drop =================
  var drag = { active: false, from: null, ghost: null, boardRect: null, sourceEl: null };

  function startDrag(e, sq) {
    drag.active = true;
    drag.from = sq;
    var alg = sqToAlgebraic(sq);
    var p = S.game.get(alg);
    if (!p) return;
    var board = $('#board');
    // Cachear el rectángulo del tablero una sola vez por arrastre
    drag.boardRect = board.getBoundingClientRect();
    var cell = board.querySelector('.square[data-square="' + sq + '"]');
    var size = cell ? cell.getBoundingClientRect().width : 60;
    var ghost = document.createElement('img');
    ghost.className = 'piece ghost';
    ghost.src = pieceUrl(p.color, p.type);
    ghost.alt = '';
    ghost.style.width = (size * 0.92) + 'px';
    ghost.style.height = (size * 0.92) + 'px';
    // Usar position: fixed + transform para movimiento fluido sin layout
    document.body.appendChild(ghost);
    drag.ghost = ghost;
    if (cell) { cell.classList.add('drag-source'); drag.sourceEl = cell; }
    moveGhost(e.clientX, e.clientY);
    window.addEventListener('pointermove', onDragMove, { passive: false });
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);
    // Evitar scroll nativo durante arrastre
    e.preventDefault();
  }

  function moveGhost(x, y) {
    if (!drag.ghost) return;
    // position: fixed + translate3d = GPU acelerado, sin layout/paint
    drag.ghost.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0) translate(-50%,-50%)';
  }

  function onDragMove(e) {
    if (!drag.active) return;
    // Movimiento directo sin rAF coalescing = 0 latencia percibida
    moveGhost(e.clientX, e.clientY);
    e.preventDefault(); // evita scroll/selección
  }

  function onDragEnd(e) {
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);
    if (drag.ghost) { drag.ghost.remove(); drag.ghost = null; }
    if (drag.sourceEl) { drag.sourceEl.classList.remove('drag-source'); drag.sourceEl = null; }
    if (!drag.active) return;
    drag.active = false;

    var board = $('#board');
    var rect = drag.boardRect || (board ? board.getBoundingClientRect() : null);
    drag.boardRect = null;
    if (!board || !rect) { renderBoard(); return; }
    var x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) { renderBoard(); return; }

    var size = rect.width / 8;
    var displayCol = Math.floor(x / size);
    var displayRow = Math.floor(y / size);
    var target = displayToSquare(displayRow, displayCol);

    // Soltar como premove cuando no es tu turno
    if (!isLocalTurn() && S.settings.premove) {
      if (target !== drag.from) {
        var fromAlg = sqToAlgebraic(drag.from), toAlg = sqToAlgebraic(target);
        var promo = null;
        try {
          var temp = new Chess(S.game.fen());
          var mv = temp.move({ from: fromAlg, to: toAlg });
          if (mv && mv.promotion) promo = mv.promotion;
        } catch (e2) {}
        // Si hay un premove en construcción para esta misma pieza, completarlo
        var buildingIdx = -1;
        for (var i = S.premoveQueue.length - 1; i >= 0; i--) {
          if (S.premoveQueue[i].to === null && S.premoveQueue[i].from === drag.from) {
            buildingIdx = i; break;
          }
        }
        if (buildingIdx !== -1) {
          S.premoveQueue[buildingIdx].to = target;
          S.premoveQueue[buildingIdx].promotion = promo;
        } else {
          // Añadir nuevo premove completado a la cola
          S.premoveQueue.push({ from: drag.from, to: target, promotion: promo });
        }
      }
      renderBoard();
      return;
    }

    if (target !== drag.from && S.legalTargets.indexOf(target) !== -1) {
      makeMove(drag.from, target);
    } else {
      renderBoard();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
  // Expose internal functions globally for event handlers
  window.__onSquarePress = onSquarePress;
  window.__renderBoard = renderBoard;
  window.__updateRailActive = updateRailActive;
  // Also expose renderBoard as global for direct calls
  window.renderBoard = renderBoard;
})();