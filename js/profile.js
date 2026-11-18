/*
 * B-Chess V2 · Perfil e historial (estilo Instagram, 100 % local)
 * Guarda partidas en localStorage['bchess-v2-games'] y datos de perfil en
 * localStorage['bchess-v2-profile']. El futuro mensaje PROFILE P2P usará este modelo.
 */
window.BCHESS_PROFILE = (function () {
  'use strict';

  var GAMES_KEY = 'bchess-v2-games';
  var PROFILE_KEY = 'bchess-v2-profile';
  var MAX_GAMES = 50;

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // El identificador público es el nombre de usuario (sin @).
  // Permite letras, números, espacios, y símbolos: _ - . ( ) !
  function cleanHandle(raw) {
    var h = String(raw == null ? '' : raw).trim().replace(/^@+/, '').replace(/[^a-zA-Z0-9_.()! -]/g, '');
    return h.slice(0, 24);
  }

  function nameFromHandle(handle) {
    var h = cleanHandle(handle);
    return h || 'Jugador';
  }

  // ================= Perfil =================
  function defaultProfile() {
    var name = 'Jugador';
    try {
      var raw = localStorage.getItem('bchess-v2-settings');
      if (raw) name = (JSON.parse(raw).name || 'Jugador');
    } catch (e) {}
    var handle = cleanHandle(name) || 'jugador';
    return {
      name: nameFromHandle(handle),
      handle: handle || 'jugador',
      bio: '',
      avatar: null
    };
  }

  function getProfile() {
    var base = defaultProfile();
    try {
      var raw = localStorage.getItem(PROFILE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        var handle = cleanHandle(p.handle || '');
        if (!handle && p.name) handle = cleanHandle(p.name);
        if (handle) base.handle = handle;
        base.name = nameFromHandle(handle || base.handle);
        base.bio = p.bio || '';
        base.avatar = typeof p.avatar === 'string' ? p.avatar : null;
      }
    } catch (e) {}
    base.name = nameFromHandle(base.handle);
    return base;
  }

  function saveProfile(profile) {
    var handle = cleanHandle(profile.handle || '');
    if (!handle) handle = cleanHandle(profile.name) || 'jugador';
    var stored = {
      handle: handle || 'jugador',
      name: nameFromHandle(handle),
      bio: profile.bio || '',
      avatar: typeof profile.avatar === 'string' ? profile.avatar : null
    };
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(stored)); } catch (e) {}
    syncNameToSettings(stored.name);
    return stored;
  }

  function syncNameToSettings(name) {
    // Avisa a la app principal para que actualice su estado en memoria y persista.
    try { window.dispatchEvent(new CustomEvent('bchess:profile-saved', { detail: { name: name } })); } catch (e) {}
  }

  function avatarInitial(name) {
    return (name || 'J').trim().charAt(0).toUpperCase() || 'J';
  }

  function renderAvatar(el, profile) {
    if (!el) return;
    if (profile.avatar) {
      el.textContent = '';
      el.style.backgroundImage = 'url("' + profile.avatar + '")';
      el.style.backgroundSize = 'cover';
      el.style.backgroundPosition = 'center';
      el.classList.add('has-photo');
    } else {
      el.textContent = avatarInitial(profile.name);
      el.style.backgroundImage = '';
      el.classList.remove('has-photo');
    }
  }

  // ================= Partidas =================
  function getGames() {
    try {
      var raw = localStorage.getItem(GAMES_KEY);
      var games = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(games)) return [];
      return games.map(normalizeRecord);
    } catch (e) { return []; }
  }

  function normalizeRecord(g) {
    g = g || {};
    if (!g.myResult) {
      if (g.result === '1/2-1/2') g.myResult = 'draw';
      else if (g.result === '1-0') g.myResult = (g.localColor === 'w') ? 'win' : (g.localColor === 'b' ? 'loss' : 'win');
      else if (g.result === '0-1') g.myResult = (g.localColor === 'b') ? 'win' : 'loss';
      else g.myResult = 'win';
    }
    if (!g.mode) g.mode = 'ai';
    if (!g.movesSan && g.pgn) g.movesSan = extractSansFromPgn(g.pgn);
    return g;
  }

  function extractSansFromPgn(pgn) {
    try {
      var text = String(pgn);
      var body = text.replace(/\[[^\]]*\]/g, ' ').replace(/\{[^}]*\}/g, ' ');
      var tokens = body.split(/\s+/);
      var sans = [];
      for (var i = 0; i < tokens.length; i++) {
        var t = tokens[i];
        if (!t || /^\d+\.(\.\.)?$/.test(t) || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(t) || /^\$\d+$/.test(t)) continue;
        sans.push(t);
      }
      return sans;
    } catch (e) { return []; }
  }

  function myResultFrom(winner, localColor) {
    if (winner === null || winner === undefined) return 'draw';
    return winner === localColor ? 'win' : 'loss';
  }

  function saveGame(record) {
    try {
      var games = getGames();
      games.unshift(record);
      localStorage.setItem(GAMES_KEY, JSON.stringify(games.slice(0, MAX_GAMES)));
    } catch (e) {}
  }

  function computeStats(games) {
    var stats = {
      total: games.length, wins: 0, draws: 0, losses: 0,
      ai: { total: 0, wins: 0, draws: 0, losses: 0 },
      online: { total: 0, wins: 0, draws: 0, losses: 0 },
      winRate: 0, bestStreak: 0, currentStreak: 0, totalMoves: 0
    };
    var streak = 0, best = 0;
    games.slice().reverse().forEach(function (g) {
      var r = g.myResult;
      if (r === 'win') { streak = streak > 0 ? streak + 1 : 1; }
      else if (r === 'loss') { streak = streak < 0 ? streak - 1 : -1; }
      else { streak = 0; }
      best = Math.max(best, streak);
      stats.totalMoves += (g.moves | 0);
    });
    stats.currentStreak = streak;
    stats.bestStreak = best;

    games.forEach(function (g) {
      var r = g.myResult;
      if (r === 'win') stats.wins++;
      else if (r === 'loss') stats.losses++;
      else stats.draws++;
      var bucket = g.mode === 'online' ? stats.online : stats.ai;
      bucket.total++;
      if (r === 'win') bucket.wins++;
      else if (r === 'loss') bucket.losses++;
      else bucket.draws++;
    });
    stats.winRate = stats.total ? Math.round((stats.wins / stats.total) * 100) : 0;
    return stats;
  }

  // ================= Miniatura del tablero final =================
  var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  function buildThumb(fen, resultTag) {
    var wrap = document.createElement('div');
    wrap.className = 'game-thumb';
    var set = 'cburnett';
    try {
      var raw = localStorage.getItem('bchess-v2-settings');
      if (raw) set = JSON.parse(raw).pieceSet || set;
    } catch (e) {}
    var parts = String(fen || START_FEN).split(' ');
    var rows = parts[0].split('/');
    var map = { r: 'r', n: 'n', b: 'b', q: 'q', k: 'k', p: 'p' };
    for (var row = 0; row < 8; row++) {
      var col = 0;
      for (var i = 0; i < rows[row].length; i++) {
        var ch = rows[row].charAt(i);
        if (/[1-8]/.test(ch)) {
          var n = parseInt(ch, 10);
          for (var e = 0; e < n; e++) { wrap.appendChild(thumbSquare(row, col, null)); col++; }
        } else {
          var color = ch === ch.toLowerCase() ? 'b' : 'w';
          wrap.appendChild(thumbSquare(row, col, { color: color, type: map[ch.toLowerCase()] }));
          col++;
        }
      }
    }
    function thumbSquare(row, col, piece) {
      var sq = document.createElement('div');
      sq.className = 'thumb-sq ' + (((row + col) % 2 === 0) ? 'light' : 'dark');
      if (piece) {
        var img = document.createElement('img');
        img.src = (window.BCHESS_PIECES && BCHESS_PIECES.pieceUrl)
          ? BCHESS_PIECES.pieceUrl(set, piece.color, piece.type)
          : ('assets/pieces/lichess/' + set + '/' + piece.color + piece.type + '.svg');
        img.alt = '';
        sq.appendChild(img);
      }
      return sq;
    }
    if (resultTag === '1-0' || resultTag === '0-1') {
      var badge = document.createElement('div');
      badge.className = 'thumb-result ' + (resultTag === '1-0' ? 'white-won' : 'black-won');
      badge.textContent = resultTag;
      wrap.appendChild(badge);
    }
    return wrap;
  }

  // ================= Tarjetas / cuadrícula =================
  function formatDate(iso) {
    try {
      var d = new Date(iso);
      return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (e) { return ''; }
  }

  function resultLabel(record) {
    if (record.myResult === 'win') return 'Victoria';
    if (record.myResult === 'loss') return 'Derrota';
    return 'Tablas';
  }

  function opponentName(record, profile) {
    // El rival es quien no soy yo.
    var myColor = myColorOf(record);
    return myColor === 'w' ? record.black : record.white;
  }

  function myColorOf(record) {
    if (record.localColor === 'w' || record.localColor === 'b') return record.localColor;
    if (record.result === '1/2-1/2' || !record.result) return 'w';
    var winner = record.result === '1-0' ? 'w' : 'b';
    if (record.myResult === 'win') return winner;
    return winner === 'w' ? 'b' : 'w';
  }

  function buildGameCard(record, viewMode) {
    var profile = getProfile();
    var card = document.createElement('button');
    card.className = 'game-card ' + record.myResult + (viewMode === 'list' ? ' list-row' : '') + ' view-' + viewMode;
    card.type = 'button';

    var thumb = buildThumb(record.finalFen, record.result);

    var footer = document.createElement('div');
    footer.className = 'game-card-footer';
    var modeLabel = record.mode === 'online' ? 'En línea' : 'vs IA';
    footer.innerHTML =
      '<span class="game-card-mode">' + modeLabel + '</span>' +
      '<span class="game-card-opp">' + escapeHtml(opponentName(record, profile)) + '</span>' +
      '<span class="game-card-date">' + escapeHtml(formatDate(record.date)) + '</span>';

    var badge = document.createElement('div');
    badge.className = 'game-card-badge ' + record.myResult;
    badge.textContent = resultLabel(record);

    card.appendChild(thumb);
    card.appendChild(badge);
    card.appendChild(footer);
    card.addEventListener('click', function () { openSavedGame(record); });
    return card;
  }

  function renderGrid(container, emptyEl, filter) {
    if (!container || !emptyEl) return;
    var games = getGames();
    var filtered = games.filter(function (g) {
      if (filter === 'ai') return g.mode !== 'online';
      if (filter === 'online') return g.mode === 'online';
      return true;
    });
    container.innerHTML = '';
    container.className = 'games-grid view-' + (viewMode || 'grid');
    filtered.forEach(function (g) { container.appendChild(buildGameCard(g, viewMode)); });
    emptyEl.classList.toggle('hidden', filtered.length > 0);
  }

  var filters = { profile: 'all', history: 'all' };
  var viewMode = 'grid'; // 'grid' | 'compact' | 'list'

  try { viewMode = localStorage.getItem('bchess-history-view') || 'grid'; } catch (e) {}

  function bindViewToggle() {
    var containers = document.querySelectorAll('.history-view-toggle');
    if (!containers.length) return;
    // Restaurar estado activo guardado en todos los selectores de vista
    Array.prototype.forEach.call(containers, function (container) {
      Array.prototype.forEach.call(container.querySelectorAll('button[data-view]'), function (b) {
        b.classList.toggle('selected', b.getAttribute('data-view') === viewMode);
      });
      container.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-view]');
        if (!btn) return;
        viewMode = btn.getAttribute('data-view') || 'grid';
        try { localStorage.setItem('bchess-history-view', viewMode); } catch (e2) {}
        // Sincronizar todos los toggles visibles (historial y perfil)
        Array.prototype.forEach.call(containers, function (c2) {
          Array.prototype.forEach.call(c2.querySelectorAll('button[data-view]'), function (b2) {
            b2.classList.toggle('selected', b2.getAttribute('data-view') === viewMode);
          });
        });
        // Aplicar la vista de inmediato en ambos grids (layout depende del contenedor)
        ['profile-games-grid', 'history-grid'].forEach(function (id) {
          var g = document.getElementById(id);
          if (g) g.className = 'games-grid view-' + viewMode;
        });
      });
    });
  }

  function bindFilterGroup(id, key, onChange) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', function (e) {
      var btn = e.target.closest('button'); if (!btn) return;
      filters[key] = btn.getAttribute('data-f') || 'all';
      Array.prototype.forEach.call(el.querySelectorAll('button'), function (b) {
        b.classList.toggle('selected', b === btn);
      });
      onChange && onChange();
    });
  }

  function renderProfileStats(stats) {
    var el = document.getElementById('profile-stats');
    if (el) {
      el.innerHTML =
        statBlock(stats.total, 'Partidas', 'total') +
        statBlock(stats.wins, 'Victorias', 'win') +
        statBlock(stats.draws, 'Tablas', 'draw') +
        statBlock(stats.losses, 'Derrotas', 'loss');
    }
    function statBlock(n, label, cls) {
      return '<div class="stat ' + cls + '"><b>' + n + '</b><span>' + label + '</span></div>';
    }
  }

  function renderStatsPanel(stats) {
    var el = document.getElementById('profile-stats-panel');
    if (!el) return;
    var table = document.getElementById('stats-summary-table');
    if (!table) {
      table = document.createElement('div');
      table.id = 'stats-summary-table';
      el.insertBefore(table, el.firstChild);
    }
    var rows = [
      ['Win rate', stats.winRate + '%'],
      ['vs IA', stats.ai.wins + 'V · ' + stats.ai.draws + 'T · ' + stats.ai.losses + 'D (' + stats.ai.total + ')'],
      ['En línea', stats.online.wins + 'V · ' + stats.online.draws + 'T · ' + stats.online.losses + 'D (' + stats.online.total + ')'],
      ['Mejor racha', stats.bestStreak > 0 ? '+' + stats.bestStreak : '0'],
      ['Racha actual', (stats.currentStreak > 0 ? '+' : '') + stats.currentStreak],
      ['Movimientos totales', String(stats.totalMoves)],
      ['Media por partida', stats.total ? Math.round(stats.totalMoves / stats.total) : 0]
    ];
    table.innerHTML = '<table class="stats-table"><tbody>' +
      rows.map(function (r) { return '<tr><th>' + escapeHtml(r[0]) + '</th><td>' + escapeHtml(r[1]) + '</td></tr>'; }).join('') +
      '</tbody></table>';
  }

  function setProfileTab(which) {
    var gamesBtn = document.getElementById('profile-tab-games');
    var statsBtn = document.getElementById('profile-tab-stats');
    var filtersEl = document.getElementById('profile-filters');
    var grid = document.getElementById('profile-games-grid');
    var empty = document.getElementById('profile-empty');
    var statsPanel = document.getElementById('profile-stats-panel');
    if (gamesBtn) gamesBtn.classList.toggle('active', which === 'games');
    if (statsBtn) statsBtn.classList.toggle('active', which === 'stats');
    if (filtersEl) filtersEl.classList.toggle('hidden', which !== 'games');
    if (grid) grid.classList.toggle('hidden', which !== 'games');
    if (statsPanel) statsPanel.classList.toggle('hidden', which !== 'stats');
    if (empty) empty.classList.toggle('hidden', !(which === 'games' && getGames().length === 0));
    if (which === 'stats' && window.BCHESS_STATS) {
      window.BCHESS_STATS.render(getGames(), getProfile());
    }
    // El rail de navegación refleja la pestaña visible (Perfil vs Estadísticas)
    try { if (window.__updateRailActive) window.__updateRailActive(); } catch (e) {}
  }

  function refreshProfile() {
    var profile = getProfile();
    var games = getGames();
    var stats = computeStats(games);

    var avatar = document.getElementById('profile-avatar');
    renderAvatar(avatar, profile);

    var handle = document.getElementById('profile-handle');
    if (handle) handle.textContent = profile.handle;
    var bio = document.getElementById('profile-bio');
    if (bio) bio.textContent = profile.bio || 'Sin bio todavía. Pulsa «Editar perfil» para añadir una.';

    renderProfileStats(stats);
    renderStatsPanel(stats);
    renderGrid(document.getElementById('profile-games-grid'), document.getElementById('profile-empty'), filters.profile);

    // Avatar y usuario de la barra superior
    var topAvatar = document.getElementById('top-avatar');
    renderAvatar(topAvatar, profile);
    var topHandle = document.getElementById('top-profile-handle');
    if (topHandle) topHandle.textContent = profile.handle || profile.name || 'Elal_Chico';
  }

  function refreshHistory() {
    var games = getGames();
    var count = document.getElementById('history-count');
    if (count) count.textContent = games.length + (games.length === 1 ? ' partida' : ' partidas');
    renderGrid(document.getElementById('history-grid'), document.getElementById('history-empty'), filters.history);
  }

  // ================= Modal de partida guardada =================
  var currentSavedGame = null;

  function moveRowsHtml(movesSan, myColor) {
    var html = '';
    var mine = myColor === 'b' ? 'opp' : 'own';
    var theirs = myColor === 'b' ? 'own' : 'opp';
    for (var i = 0; i < movesSan.length; i += 2) {
      var num = Math.floor(i / 2) + 1;
      var w = movesSan[i] || '';
      var b = movesSan[i + 1] || '';
      html += '<div class="mv-row"><span class="mv-num">' + num + '.</span>' +
        '<span class="mv-cell ' + mine + '">' + escapeHtml(w) + '</span>' +
        '<span class="mv-cell ' + theirs + '">' + escapeHtml(b) + '</span></div>';
    }
    return html || '<span class="muted">Sin jugadas.</span>';
  }

  function openSavedGame(record) {
    currentSavedGame = record;
    var profile = getProfile();
    var resultEl = document.getElementById('sg-result');
    if (resultEl) {
      var label = resultLabel(record);
      resultEl.textContent = label + ' · ' + record.result;
      resultEl.className = 'sg-result ' + record.myResult;
    }
    var sub = document.getElementById('sg-sub');
    if (sub) {
      var modeLabel = record.mode === 'online' ? 'En línea' : 'vs IA';
      sub.textContent = modeLabel + ' · ' + opponentName(record, profile) + ' · ' + formatDate(record.date) + (record.reason ? ' · ' + record.reason : '');
    }
    var moves = document.getElementById('sg-moves');
    if (moves) moves.innerHTML = moveRowsHtml(record.movesSan || extractSansFromPgn(record.pgn), myColorOf(record));
    var modal = document.getElementById('saved-game-modal');
    if (modal) modal.classList.add('show');
  }

  function closeSavedGame() {
    var modal = document.getElementById('saved-game-modal');
    if (modal) modal.classList.remove('show');
    currentSavedGame = null;
  }

  function downloadPgn(record, filename) {
    var blob = new Blob([record.pgn || ''], { type: 'application/x-chess-pgn' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename || ('bchess-' + String(record.date).slice(0, 10) + '.pgn');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ================= Recorte de avatar =================
  var cropImg = null, cropZoom = 1, cropOffset = { x: 0, y: 0 };
  var CROP_STAGE = 320;

  function cropClamp() {
    if (!cropImg) return;
    var base = Math.max(CROP_STAGE / cropImg.width, CROP_STAGE / cropImg.height) * cropZoom;
    var w = cropImg.width * base, h = cropImg.height * base;
    var maxX = Math.max(0, (w - CROP_STAGE) / 2);
    var maxY = Math.max(0, (h - CROP_STAGE) / 2);
    cropOffset.x = Math.max(-maxX, Math.min(maxX, cropOffset.x));
    cropOffset.y = Math.max(-maxY, Math.min(maxY, cropOffset.y));
  }

  function cropDraw() {
    var canvas = document.getElementById('cropper-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, CROP_STAGE, CROP_STAGE);
    if (!cropImg) return;
    var base = Math.max(CROP_STAGE / cropImg.width, CROP_STAGE / cropImg.height) * cropZoom;
    var w = cropImg.width * base, h = cropImg.height * base;
    ctx.drawImage(cropImg, (CROP_STAGE - w) / 2 + cropOffset.x, (CROP_STAGE - h) / 2 + cropOffset.y, w, h);
  }

  function cropResult() {
    var out = 256;
    var ratio = out / CROP_STAGE;
    var canvas = document.createElement('canvas');
    canvas.width = out; canvas.height = out;
    var ctx = canvas.getContext('2d');
    if (!cropImg) return null;
    var base = Math.max(out / cropImg.width, out / cropImg.height) * cropZoom;
    var w = cropImg.width * base, h = cropImg.height * base;
    ctx.drawImage(cropImg, (out - w) / 2 + cropOffset.x * ratio, (out - h) / 2 + cropOffset.y * ratio, w, h);
    return canvas.toDataURL('image/jpeg', 0.88);
  }

  function openCropper(file, onDone) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var img = new Image();
      img.onload = function () {
        cropImg = img;
        cropZoom = 1;
        cropOffset = { x: 0, y: 0 };
        var slider = document.getElementById('cropper-zoom');
        if (slider) slider.value = '100';
        cropDraw();
        var modal = document.getElementById('avatar-cropper-modal');
        if (modal) {
          modal._onDone = onDone;
          modal.classList.add('show');
        }
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  function closeCropper() {
    var modal = document.getElementById('avatar-cropper-modal');
    if (modal) modal.classList.remove('show');
    var input = document.getElementById('edit-avatar-input');
    if (input) input.value = '';
  }

  // ================= Perfil de oponente (modal pequeño + detallado) =================

  function isStockfishName(str) {
    var s = String(str == null ? '' : str).trim().toLowerCase();
    return s === 'stockfish';
  }

  function computeWinLossDraw(games) {
    var wins = 0, draws = 0, losses = 0;
    (games || []).forEach(function (g) {
      if (!g) return;
      var r = g.myResult;
      if (!r && g.res) {
        if (g.res === '1/2-1/2') r = 'draw';
        else if (g.res === '1-0') r = 'win';
        else if (g.res === '0-1') r = 'loss';
      }
      if (r === 'win') wins++;
      else if (r === 'draw') draws++;
      else losses++;
    });
    var total = (games || []).length;
    var winRate = total ? Math.round((wins / total) * 100) : 0;
    return { total: total, wins: wins, draws: draws, losses: losses, winRate: winRate };
  }

  function statBlock(n, label, cls) {
    return '<div class="stat ' + cls + '"><b>' + n + '</b><span>' + label + '</span></div>';
  }

  function renderStatsHtml(s) {
    return (
      statBlock(s.total, 'Partidas', 'total') +
      statBlock(s.wins, 'Victorias', 'win') +
      statBlock(s.draws, 'Tablas', 'draw') +
      statBlock(s.losses, 'Derrotas', 'loss')
    );
  }

  function renderDetailStatsHtml(s) {
    return (
      '<div class="opp-detail-stat win"><b>' + s.wins + '</b><span>Victorias</span></div>' +
      '<div class="opp-detail-stat draw"><b>' + s.draws + '</b><span>Tablas</span></div>' +
      '<div class="opp-detail-stat loss"><b>' + s.losses + '</b><span>Derrotas</span></div>' +
      '<div class="opp-detail-stat"><b>' + s.winRate + '%</b><span>Win Rate</span></div>'
    );
  }

  function renderDetailSummaryHtml(s, display) {
    var fmt = function (label, val) {
      return '<div class="opp-detail-row"><span>' + escapeHtml(label) + '</span><b>' + escapeHtml(String(val)) + '</b></div>';
    };
    return (
      '<div class="opp-detail-summary">' +
        fmt('Oponente', display) +
        fmt('Partidas', s.total) +
        fmt('Resultados', s.wins + 'V / ' + s.draws + 'T / ' + s.losses + 'D') +
        fmt('Win Rate', s.winRate + '%') +
      '</div>'
    );
  }

  function sortGamesByDateDesc(games) {
    return (games || []).slice().sort(function (a, b) {
      var da = a && a.d ? new Date(a.d).getTime() : 0;
      var db = b && b.d ? new Date(b.d).getTime() : 0;
      return db - da;
    });
  }

  function renderGamesListHtml(games) {
    var recent = sortGamesByDateDesc(games).slice(0, 50);
    if (!recent.length) {
      return '<div class="opp-games-empty">Sin partidas registradas</div>';
    }
    return recent.map(function (g) {
      var lw = g.lw === undefined ? null : (g.lw ? 'win' : 'loss');
      if (g.res === '1/2-1/2') lw = 'draw';
      var label = lw === 'win' ? 'V' : (lw === 'draw' ? 'T' : 'D');
      var cls = lw === 'win' ? 'win' : (lw === 'draw' ? 'draw' : 'loss');
      var date = '';
      if (g.d) { try { date = new Date(g.d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: '2-digit' }); } catch (e) {} }
      var opp = String(g.opp || 'Rival');
      var diff = g.dif ? String(g.dif) : '';
      return '<div class="opp-game-row">' +
        '<span class="opp-game-badge ' + cls + '">' + label + '</span>' +
        '<span class="opp-game-info"><b>' + escapeHtml(opp) + '</b>' +
          '<small>' + escapeHtml(String(g.t || '')) + (date ? ' · ' + escapeHtml(date) : '') + (diff ? ' · ' + escapeHtml(diff) : '') +
            ' · ' + (parseInt(g.n, 10) || 0) + ' movs.</small>' +
        '</span>' +
        '<span class="opp-game-result">' + escapeHtml(String(g.res || '')) + '</span>' +
      '</div>';
    }).join('');
  }

  function gameCardForBoard(record) {
    record = record || {};
    record.lw = record.myResult === 'win';
    if (record.myResult === 'draw') record.lw = 'draw';
    record.opp = record.opponentName || record.opp || 'Rival';
    record.t = record.mode === 'online' ? 'En línea' : 'vs IA';
    record.n = Array.isArray(record.movesSan) ? record.movesSan.length : (record.moves | 0) || 0;
    record.res = record.result || '';
    record.d = record.date || '';
    record.dif = record.mode === 'ai' ? 'IA' : (record.mode === 'online' ? 'En línea' : '');
    return record;
  }

  function setAvatarImage(el, photo, display) {
    if (!el) return;
    if (photo) {
      el.style.backgroundImage = 'url("' + photo + '")';
      el.textContent = '';
      el.classList.add('has-photo');
    } else {
      el.style.backgroundImage = '';
      el.textContent = String(display || 'R').charAt(0).toUpperCase();
      el.classList.remove('has-photo');
    }
  }

  function stockfishAvatarUrl() {
    return 'assets/img/stockfish.png';
  }

  function wireOpponentDetailButton() {
    var btn = document.getElementById('btn-opp-detail');
    if (!btn) return;
    btn.addEventListener('click', function () {
      var small = document.getElementById('opponent-profile-modal');
      var detail = document.getElementById('opponent-detail-modal');
      if (small) small.classList.remove('show');
      if (detail) detail.classList.add('show');
    });
    var back = document.getElementById('btn-opp-detail-back');
    if (back) {
      back.addEventListener('click', function () {
        var small = document.getElementById('opponent-profile-modal');
        var detail = document.getElementById('opponent-detail-modal');
        if (detail) detail.classList.remove('show');
        if (small) small.classList.add('show');
      });
    }
  }

  function fillOpponentModals(display, photo, subtitle, games) {
    var name = document.getElementById('opp-name');
    var sub = document.getElementById('opp-sub');
    var avatar = document.getElementById('opp-avatar');
    var stats = document.getElementById('opp-stats');
    var gamesList = document.getElementById('opp-games-list');
    var btnDetail = document.getElementById('btn-opp-detail');

    var dAvatar = document.getElementById('opp-detail-avatar');
    var dName = document.getElementById('opp-detail-name');
    var dSub = document.getElementById('opp-detail-sub');
    var dStats = document.getElementById('opp-detail-stats');
    var dGames = document.getElementById('opp-detail-games');
    var dSummary = document.getElementById('opp-detail-summary');

    if (name) name.textContent = display;
    if (sub) sub.textContent = subtitle;
    if (dName) dName.textContent = display;
    if (dSub) dSub.textContent = subtitle;

    setAvatarImage(avatar, photo, display);
    setAvatarImage(dAvatar, photo, display);

    var s = computeWinLossDraw(games);
    if (stats) stats.innerHTML = renderStatsHtml(s);
    if (dStats) dStats.innerHTML = renderDetailStatsHtml(s);
    if (dSummary) dSummary.innerHTML = renderDetailSummaryHtml(s, display);
    if (dGames) dGames.innerHTML = renderGamesListHtml((games || []).map(function (g) { return g && g.lw !== undefined ? g : gameCardForBoard(g); }));
    if (gamesList) gamesList.innerHTML = renderGamesListHtml((games || []).map(function (g) { return g && g.lw !== undefined ? g : gameCardForBoard(g); }));

    // "Ver perfil detallado" solo si NO es Stockfish
    if (btnDetail) btnDetail.classList.toggle('hidden', isStockfishName(display));
  }

  // ================= Perfil del rival (datos recibidos por red) =================
  function openOpponentProfileRemote(remote) {
    remote = remote || {};
    var display = String(remote.name || 'Rival').trim() || 'Rival';
    var photo = remote.photo || null;
    // Determinar si el oponente es motor
    var subtitle = /^stockfish$/i.test(display) ? 'Motor de ajedrez' : (remote.handle ? ('@' + remote.handle) : 'Rival en línea');
    var games = Array.isArray(remote.games) ? remote.games : [];
    fillOpponentModals(display, photo, subtitle, games);
    var modal = document.getElementById('opponent-profile-modal');
    if (modal) modal.classList.add('show');
    wireOpponentDetailButton();
  }

  function openOpponentProfile(name) {
    var display = String(name == null ? '' : name).trim() || 'Rival';
    var isEngine = isStockfishName(display);
    var profile = getProfile();
    var games = getGames();
    var hisGames = [];

    if (isEngine) {
      // Todos los juegos vs IA (modo 'ai'), o vs Stockfish explícitamente
      hisGames = games.filter(function (g) { return g.mode === 'ai'; });
    } else {
      hisGames = games.filter(function (g) {
        if (!g) return false;
        var opponent = g.localColor === 'w' ? g.black : g.white;
        return String(opponent).trim() === display;
      });
    }

    // Foto: Stockfish → icono del motor; humano → null (sin foto conocida)
    var photo = isEngine ? stockfishAvatarUrl() : null;
    var subtitle = isEngine ? 'Motor de ajedrez' : 'Rival en línea';
    fillOpponentModals(display, photo, subtitle, hisGames);
    var modal = document.getElementById('opponent-profile-modal');
    if (modal) modal.classList.add('show');
    wireOpponentDetailButton();
  }

  // ================= Wiring =================
  function init() {
    bindFilterGroup('profile-filters', 'profile', refreshProfile);
    bindFilterGroup('history-filters', 'history', refreshHistory);
    bindViewToggle();

    var tabGames = document.getElementById('profile-tab-games');
    var tabStats = document.getElementById('profile-tab-stats');
    if (tabGames) tabGames.addEventListener('click', function () { setProfileTab('games'); });
    if (tabStats) tabStats.addEventListener('click', function () { setProfileTab('stats'); });

    // Editar perfil
    var editBtn = document.getElementById('btn-edit-profile');
    var editModal = document.getElementById('profile-edit-modal');
    var avatarPreview = document.getElementById('edit-avatar-preview');
    var avatarInput = document.getElementById('edit-avatar-input');
    var pendingAvatar = undefined;

    function openEdit() {
      var p = getProfile();
      document.getElementById('edit-handle').value = p.handle;
      document.getElementById('edit-bio').value = p.bio || '';
      pendingAvatar = undefined;
      renderAvatar(avatarPreview, p);
      editModal.classList.add('show');
    }

    if (editBtn) editBtn.addEventListener('click', openEdit);
    if (avatarInput) avatarInput.addEventListener('change', function () {
      var file = this.files && this.files[0];
      if (!file) return;
      openCropper(file, function (dataUrl) {
        pendingAvatar = dataUrl;
        renderAvatar(avatarPreview, {
          name: (document.getElementById('edit-handle').value || 'J'),
          handle: '', bio: '', avatar: dataUrl
        });
      });
    });
    var cancelEdit = document.getElementById('btn-cancel-profile');
    if (cancelEdit) cancelEdit.addEventListener('click', function () { editModal.classList.remove('show'); });

    var saveEdit = document.getElementById('btn-save-profile');
    if (saveEdit) saveEdit.addEventListener('click', function () {
      try {
        var p = getProfile();
        var handle = cleanHandle(document.getElementById('edit-handle').value || '');
        p.handle = handle || 'jugador';
        p.bio = (document.getElementById('edit-bio').value || '').trim();
        if (pendingAvatar !== undefined) p.avatar = pendingAvatar;
        saveProfile(p);
        editModal.classList.remove('show');
        refreshProfile();
        if (window.showToast) window.showToast('Perfil guardado');
      } catch (e) {
        console.error('Error saving profile:', e);
        if (window.showToast) window.showToast('Error al guardar perfil');
      }
    });

    // Cropper
    var cropStage = document.getElementById('cropper-stage');
    var cropSlider = document.getElementById('cropper-zoom');
    if (cropSlider) cropSlider.addEventListener('input', function () {
      cropZoom = Math.max(1, parseFloat(this.value) / 100 || 1);
      cropClamp();
      cropDraw();
    });
    if (cropStage) {
      var dragging = false, lastX = 0, lastY = 0;
      cropStage.addEventListener('pointerdown', function (e) {
        if (!cropImg) return;
        dragging = true; lastX = e.clientX; lastY = e.clientY;
        try { cropStage.setPointerCapture(e.pointerId); } catch (err) {}
      });
      cropStage.addEventListener('pointermove', function (e) {
        if (!dragging || !cropImg) return;
        cropOffset.x += e.clientX - lastX;
        cropOffset.y += e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        cropClamp();
        cropDraw();
      });
      function endDrag() { dragging = false; }
      cropStage.addEventListener('pointerup', endDrag);
      cropStage.addEventListener('pointercancel', endDrag);
      cropStage.addEventListener('wheel', function (e) {
        if (!cropImg) return;
        e.preventDefault();
        var delta = e.deltaY < 0 ? 0.08 : -0.08;
        cropZoom = Math.max(1, Math.min(3.2, cropZoom + delta));
        if (cropSlider) cropSlider.value = String(Math.round(cropZoom * 100));
        cropClamp();
        cropDraw();
      }, { passive: false });
    }
    var cropCancel = document.getElementById('btn-crop-cancel');
    if (cropCancel) cropCancel.addEventListener('click', closeCropper);
    var cropApply = document.getElementById('btn-crop-apply');
    if (cropApply) cropApply.addEventListener('click', function () {
      var datum = cropResult();
      var modal = document.getElementById('avatar-cropper-modal');
      if (datum && modal && typeof modal._onDone === 'function') modal._onDone(datum);
      closeCropper();
    });

    // Modal de partida guardada
    var sgClose = document.getElementById('sg-close');
    if (sgClose) sgClose.addEventListener('click', closeSavedGame);
    var sgCopy = document.getElementById('sg-copy');
    if (sgCopy) sgCopy.addEventListener('click', function () {
      if (!currentSavedGame) return;
      var text = currentSavedGame.pgn || '';
      var done = function () { if (window.showToast) window.showToast('PGN copiado al portapapeles'); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else { if (window.showToast) window.showToast('PGN copiado'); }
    });
    var sgDownload = document.getElementById('sg-download');
    if (sgDownload) sgDownload.addEventListener('click', function () {
      if (currentSavedGame) downloadPgn(currentSavedGame);
    });
    var sgReview = document.getElementById('sg-review');
    if (sgReview) sgReview.addEventListener('click', function () {
      if (currentSavedGame && window.BCHESS_OPEN_SAVED_GAME) {
        var record = currentSavedGame;
        closeSavedGame();
        window.BCHESS_OPEN_SAVED_GAME(record);
      }
    });

    var oppClose = document.getElementById('opp-close');
    if (oppClose) oppClose.addEventListener('click', function () {
      var modal = document.getElementById('opponent-profile-modal');
      if (modal) modal.classList.remove('show');
    });

    // Reset stats button
    var resetStats = document.getElementById('btn-reset-stats');
    if (resetStats) resetStats.addEventListener('click', function () {
      if (confirm('Esto borrará TODAS las partidas guardadas y reiniciará las estadísticas. ¿Continuar?')) {
        localStorage.removeItem('bchess-v2-games');
        localStorage.removeItem('bchess-v2-profile');
        // Reiniciar perfil por defecto
        var def = { handle: '@jugador', name: 'jugador', bio: '', avatar: null };
        localStorage.setItem('bchess-v2-profile', JSON.stringify(def));
        if (window.showToast) window.showToast('Estadísticas y historial borrados');
        refreshProfile();
        refreshHistory();
        if (window.BCHESS_STATS) window.BCHESS_STATS.render([], def);
      }
    });

    // Cerrar modales al pulsar fuera
    ['saved-game-modal', 'profile-edit-modal', 'rail-modal', 'avatar-cropper-modal', 'opponent-profile-modal'].forEach(function (id) {
      var modal = document.getElementById(id);
      if (!modal) return;
      modal.addEventListener('click', function (e) {
        if (e.target === modal) modal.classList.remove('show');
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return {
    getProfile: getProfile,
    saveProfile: saveProfile,
    renderAvatar: renderAvatar,
    getGames: getGames,
    saveGame: saveGame,
    myResultFrom: myResultFrom,
    computeStats: computeStats,
    refreshProfile: refreshProfile,
    refreshHistory: refreshHistory,
    openSavedGame: openSavedGame,
    closeSavedGame: closeSavedGame,
    openOpponentProfile: openOpponentProfile,
    openOpponentProfileRemote: openOpponentProfileRemote,
    downloadPgn: downloadPgn
  };
})();
