/*
 * B-Chess Desktop · Actualizador
 * - Electron: autoUpdater nativo (GitHub Releases).
 * - Abre la pantalla #screen-update con novedades, progreso, error y botón para reinstalar.
 * - En navegador: misma pantalla para comprobar versión local vs última versión disponible.
 */
window.BCHESS_UPDATE = (function () {
  'use strict';

  var CURRENT_VERSION = '2.2.20';
  var REPO = 'ElalChico/B-Chess-Desktop';
  var CHECK_URL = 'https://api.github.com/repos/' + REPO + '/releases/latest';

  // Notas de la versión v2.2.20 (editar en cada release)
  var RELEASE_NOTES = [
    { type: 'feat', text: 'Premove encadenado con arrastre: la misma pieza puede premover cualquier cantidad de veces seguidas (e7-e5-e4-e3-e2...) — antes con el gesto de arrastrar solo fijaba el primero y la cadena se atascaba.' },
    { type: 'fix', text: 'premove con gesto de arrastre corregido para premoves sobre piezas ya pre-movidas (capa visual superpuesta con la cola), completando el comportamiento tap y drag igual de bien.' },
    { type: 'fix', text: 'Pantalla dedicada de actualización (#screen-update) con progreso y reintento funcional' },
    { type: 'feat', text: 'Ajustes completo y scrollable (todo alcanzable, nada cortado abajo)' },
    { type: 'fix', text: 'Premove ilegal no se fija (mismo criterio que Lichess): simulación de la cola con un clon del motor.' },
    { type: 'feat', text: 'Rendimiento de clicks: listeners del Inspector solo con F2 activo; cero backdrop-filter blur; ajuste fino de layout para tableros lentos.' }
  ];

  var RELEASE_WARNINGS = [
    'El auto-update requiere que el instalador se ejecute desde la carpeta de programas (no desde un .exe copiado al escritorio).',
    'La actualización se descarga e instala al cerrar la app; si la actualización falla, revisa el mensaje de error en pantalla.',
    'Los datos de la app (partidas, avances, perfil) se conservan porque no se borra AppData/AppData/Roaming/B-Chess-Desktop.',
    'Notas futuras: si quieres ver las nuevas versiones con antelación, v2.3.x incluirá gráficos del perfil y partidas en vivo mejoradas.'
  ];

  function registerSW() {
    var isAllowed = location.protocol === 'https:' ||
      location.hostname === 'localhost' ||
      location.hostname === '127.0.0.1';
    if (!isAllowed) return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('service-worker.js').then(function () {}).catch(function () {});
  }

  function compareSemver(a, b) {
    var pa = String(a).split('.').map(function (n) { return parseInt(n, 10) || 0; });
    var pb = String(b).split('.').map(function (n) { return parseInt(n, 10) || 0; });
    for (var i = 0; i < 3; i++) {
      if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1;
    }
    return 0;
  }

  function checkForUpdate() {
    return fetch(CHECK_URL, { headers: { 'Accept': 'application/vnd.github+json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !data.tag_name) return null;
        var latest = String(data.tag_name).replace(/^v/, '');
        var available = compareSemver(latest, CURRENT_VERSION) > 0;
        return { latest: latest, available: available, url: data.html_url, notes: (data.body || '').trim() };
      })
      .catch(function () { return null; });
  }

  function applyUpdateNow() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.getRegistration().then(function (reg) {
      if (reg && reg.waiting) { reg.waiting.postMessage('skipWaiting'); }
      location.reload();
    });
  }

  function renderReleaseNotes() {
    var host = document.getElementById('update-notes-list');
    if (!host) return;
    var html = RELEASE_NOTES.map(function (n) {
      var prefix = n.type === 'fix' ? '<strong>Corrección</strong>' : (n.type === 'exp' ? '<strong>Experimental</strong>' : '<strong>Nuevo</strong>');
      return '<div class="update-note-item">' + prefix + ' — ' + escapeHtml(n.text) + '</div>';
    }).join('');
    host.innerHTML = html;
  }

  function renderWarnings() {
    var host = document.getElementById('update-warnings-list');
    if (!host) return;
    var html = RELEASE_WARNINGS.map(function (w) {
      return '<div class="update-note-item">' + escapeHtml(w) + '</div>';
    }).join('');
    host.innerHTML = html;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function setProgress(pct, transferred, total) {
    var bar = document.getElementById('update-progress-bar');
    var pctEl = document.getElementById('update-progress-percent');
    var bytesEl = document.getElementById('update-progress-bytes');
    var statusEl = document.getElementById('update-progress-status');
    var p = Math.max(0, Math.min(100, Number(pct) || 0));
    if (bar) bar.style.width = p + '%';
    if (pctEl) pctEl.textContent = Math.round(p) + '%';
    if (bytesEl) bytesEl.textContent = formatBytes(transferred || 0) + ' / ' + formatBytes(total || 0);
    if (statusEl) statusEl.textContent = p >= 100 ? 'Instalando…' : 'Descargando desde GitHub…';
  }

  function formatBytes(bytes) {
    var units = ['B', 'KB', 'MB', 'GB'];
    var i = 0;
    var n = Number(bytes) || 0;
    while (n >= 1024 && i < units.length - 1) { n = n / 1024; i++; }
    return (i === 0 ? n + ' ' : n.toFixed(1) + ' ') + units[i];
  }

  function showUpdateScreen(opts) {
    opts = opts || {};
    var ver = opts.version || CURRENT_VERSION;
    renderReleaseNotes();
    renderWarnings();
    var cur = document.getElementById('update-current-version');
    if (cur) cur.textContent = 'v' + CURRENT_VERSION;
    var latest = document.getElementById('update-latest-version');
    if (latest) latest.textContent = 'v' + ver;
    var link = document.getElementById('link-release-notes');
    if (link) link.href = 'https://github.com/ElalChico/B-Chess-Desktop/releases/tag/v' + ver;
    var primary = document.getElementById('btn-update-primary');
    if (primary) {
      primary.classList.add('hidden');
      // Reiniciar estilo cuando ya esté descargada
    }
    var pWrap = document.getElementById('update-progress-wrap');
    var errWrap = document.getElementById('update-error-wrap');
    if (opts.state === 'downloading') {
      if (pWrap) pWrap.classList.remove('hidden');
      if (errWrap) errWrap.classList.add('hidden');
      if (primary) primary.classList.add('hidden');
      setProgress(0, 0, 0);
    } else if (opts.state === 'downloaded') {
      if (pWrap) pWrap.classList.remove('hidden');
      if (errWrap) errWrap.classList.add('hidden');
      if (primary) {
        primary.classList.remove('hidden');
        var label = primary.querySelector('.update-btn-label');
        if (label) label.textContent = 'Reiniciar ahora';
      }
      setProgress(100, 0, 0);
      if (statusElVisible()) statusText('Descarga completada. Reinicia para actualizar.');
    } else if (opts.state === 'error') {
      if (pWrap) pWrap.classList.add('hidden');
      if (errWrap) errWrap.classList.remove('hidden');
      var detail = document.getElementById('update-error-detail');
      if (detail) detail.textContent = opts.message || 'Fallo al descargar. Revisa la conexión o inténtalo de nuevo.';
      if (primary) primary.classList.remove('hidden');
      var label2 = primary ? primary.querySelector('.update-btn-label') : null;
      if (label2) label2.textContent = 'Reintentar ahora';
    } else {
      // Estado inicial: mostrar botón "Descargar e instalar"
      if (pWrap) pWrap.classList.add('hidden');
      if (errWrap) errWrap.classList.add('hidden');
      if (primary) {
        primary.classList.remove('hidden');
        var label3 = primary.querySelector('.update-btn-label');
        if (label3) label3.textContent = 'Descargar e instalar';
      }
    }
    if (typeof window.setScreen === 'function') window.setScreen('update');
    else if (window.__setScreen) window.__setScreen('update');
  }

  function statusElVisible() { return !!document.getElementById('update-progress-status'); }
  function statusText(t) { var s = document.getElementById('update-progress-status'); if (s) s.textContent = t; }

  function wireButtons() {
    var later = document.getElementById('btn-update-later');
    if (later) later.addEventListener('click', function () {
      if (typeof window.__setScreen === 'function') window.__setScreen('home');
    });
    var primary = document.getElementById('btn-update-primary');
    if (primary) primary.addEventListener('click', function () {
      var label = primary.querySelector('.update-btn-label');
      var text = label ? label.textContent : '';
      var desk = window.BCHESS_DESKTOP;
      if (desk && desk.isElectron && typeof desk.quitAndInstall === 'function' && (text === 'Reiniciar ahora')) {
        desk.quitAndInstall();
      } else if (desk && desk.isElectron && typeof desk.downloadUpdate === 'function') {
        doDownloadFlow();
      } else {
        // En navegador: abrir release
        window.location.href = 'https://github.com/ElalChico/B-Chess-Desktop/releases/latest';
      }
    });
    var retry = document.getElementById('btn-update-retry');
    if (retry) retry.addEventListener('click', function () { doDownloadFlow(); });
    var manual = document.getElementById('btn-update-manual');
    if (manual) manual.addEventListener('click', function () {
      window.open('https://github.com/ElalChico/B-Chess-Desktop/releases/latest', '_blank');
    });
  }

  function doDownloadFlow() {
    var desk = window.BCHESS_DESKTOP;
    showUpdateScreen({ state: 'downloading', version: desk && desk.version ? (String(desk.version).replace(/^v/, '') || CURRENT_VERSION) : CURRENT_VERSION });
    if (desk && typeof desk.downloadUpdate === 'function') desk.downloadUpdate();
  }

  // ---------- Electron: recibir eventos del main process ----------
  function wireElectronUpdater() {
    var desk = window.BCHESS_DESKTOP;
    if (!desk || !desk.isElectron) return false;

    desk.onUpdateAvailable && desk.onUpdateAvailable(function (info) {
      var ver = (info && info.version) || CURRENT_VERSION;
      showUpdateScreen({ state: 'initial', version: ver });
      if (typeof desk.downloadUpdate === 'function') desk.downloadUpdate();
    });
    desk.onUpdateProgress && desk.onUpdateProgress(function (p) {
      var pct = Number(p && p.percent) || 0;
      setProgress(pct, Number(p && p.transferred) || 0, Number(p && p.total) || 0);
    });
    desk.onUpdateDownloaded && desk.onUpdateDownloaded(function (info) {
      var ver = (info && info.version) || CURRENT_VERSION;
      showUpdateScreen({ state: 'downloaded', version: ver });
    });
    desk.onUpdateError && desk.onUpdateError(function (err) {
      showUpdateScreen({ state: 'error', version: (err && err.version) || CURRENT_VERSION, message: (err && err.message) || 'error desconocido' });
    });
    return true;
  }

  // ---------- Navegador: chequeo periódico al arrancar ----------
  function wireBrowserAutoCheck() {
    if (typeof window.BCHESS_DESKTOP !== 'undefined' && window.BCHESS_DESKTOP.isElectron) return;
    var t = setTimeout(function () {
      checkForUpdate().then(function (info) {
        if (info && info.available) showUpdateScreen({ state: 'initial', version: info.latest });
      });
    }, 1500);
    return function () { clearTimeout(t); };
  }

  function wireBadge() {
    var badge = document.getElementById('version-badge');
    if (!badge) return;
    badge.classList.add('is-clickable');
    badge.title = 'Ver actualizaciones';
    badge.addEventListener('click', function () {
      window.BCHESS_UPDATE.showUpdateScreen && window.BCHESS_UPDATE.showUpdateScreen({ state: 'initial' });
    });
  }

  registerSW();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      renderReleaseNotes(); renderWarnings(); wireButtons(); wireElectronUpdater(); wireBrowserAutoCheck(); wireBadge();
    });
  } else {
    renderReleaseNotes(); renderWarnings(); wireButtons(); wireElectronUpdater(); wireBrowserAutoCheck(); wireBadge();
  }

  return {
    CURRENT_VERSION: CURRENT_VERSION,
    checkForUpdate: checkForUpdate,
    applyUpdateNow: applyUpdateNow,
    showUpdateScreen: showUpdateScreen
  };
})();
