/*
 * B-Chess Desktop · Actualizador
 * - Electron: autoUpdater nativo (GitHub Releases). El modal de la app muestra
 *   "Hay una versión nueva" y al confirmar se dispara la descarga y el reinicio.
 * - Navegador: consulta GitHub API Releases; muestra el mismo modal. El botón
 *   "Descargar e instalar" hace recarga/aplicación del SW si hay uno nuevo.
 */
window.BCHESS_UPDATE = (function () {
  'use strict';

  var CURRENT_VERSION = '2.2.17';
  var REPO = 'ElalChico/B-Chess-Desktop';
  var CHECK_URL = 'https://api.github.com/repos/' + REPO + '/releases/latest';

  // ---------- Registro del Service Worker (auto-update al instante) ----------
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
        var notes = (data.body || '').replace(/\s+$/, '').split('\n').filter(function (l) { return l.trim(); }).join('\n');
        return { latest: latest, available: available, url: data.html_url, notes: notes };
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

  // ---------- Modal de actualización estilizado ----------
  var modalState = { version: null, downloaded: false, notes: '', downloading: false, progress: 0 };

  function openModal(opts) {
    opts = opts || {};
    var modal = document.getElementById('update-modal');
    if (!modal) return;

    var title = document.getElementById('update-modal-title');
    var notes = document.getElementById('update-notes');
    var badge = document.getElementById('update-badge');
    var nowTitle = document.querySelector('#btn-update-now .end-option-title');
    var nowSub = document.querySelector('#btn-update-now .end-option-sub');

    var ver = opts.version || modalState.version || CURRENT_VERSION;
    var downloaded = !!opts.downloaded;
    var downloading = !!opts.downloading;
    var progress = Number(opts.progress || 0);

    modalState.version = ver;
    modalState.downloaded = downloaded;
    modalState.downloading = downloading;
    modalState.progress = progress;

    if (title) title.textContent = 'B-Chess Desktop v' + ver;
    if (notes) notes.textContent = opts.notes || '';
    if (badge) badge.textContent = downloaded ? 'Lista para instalar' : (downloading ? 'Descargando… ' + Math.round(progress) + '%' : 'Actualización disponible');
    if (nowTitle) nowTitle.textContent = downloaded ? 'Reiniciar ahora' : (downloading ? 'Cancelar aviso' : 'Descargar e instalar');
    if (nowSub) nowSub.textContent = downloaded ? 'Se aplicará el reinicio' : (downloading ? 'Ya está en marcha…' : 'Se aplicará al reiniciar');

    modal.classList.add('show');
  }

  function setProgress(p) {
    var pct = Math.max(0, Math.min(100, p || 0));
    var notes = document.getElementById('update-notes');
    var badge = document.getElementById('update-badge');
    if (badge) badge.textContent = 'Descargando… ' + Math.round(pct) + '%';
    if (notes) {
      notes.textContent = 'Descargando B-Chess Desktop v' + (modalState.version || CURRENT_VERSION) + ' desde GitHub… ' + Math.round(pct) + '%';
    }
  }

  function setError(message) {
    var notes = document.getElementById('update-notes');
    var badge = document.getElementById('update-badge');
    var nowTitle = document.querySelector('#btn-update-now .end-option-title');
    var nowSub = document.querySelector('#btn-update-now .end-option-sub');
    if (badge) badge.textContent = 'Error de actualización';
    if (notes) notes.textContent = 'No se pudo descargar la actualización:\n' + (message || 'fallo desconocido');
    if (nowTitle) nowTitle.textContent = 'Reintentar';
    if (nowSub) nowSub.textContent = 'Pulsa para volver a intentar la descarga';
  }

  function closeModal() {
    var modal = document.getElementById('update-modal');
    if (modal) modal.classList.remove('show');
  }

  function wireModalButtons() {
    var laterBtn = document.getElementById('btn-update-later');
    var nowBtn = document.getElementById('btn-update-now');
    if (laterBtn) laterBtn.addEventListener('click', closeModal);
    if (nowBtn) nowBtn.addEventListener('click', function () {
      // Si ya estaba descargada (Electron), reiniciar para aplicar.
      // Si no, disparar la descarga manualmente (es efectuada automáticamente al arrancar).
      var isElectron = !!(window.BCHESS_DESKTOP && window.BCHESS_DESKTOP.isElectron);
      if (isElectron) {
        if (modalState.downloaded && typeof window.BCHESS_DESKTOP.quitAndInstall === 'function') {
          window.BCHESS_DESKTOP.quitAndInstall();
          return;
        }
        if (typeof window.BCHESS_DESKTOP.downloadUpdate === 'function') {
          openModal({ version: modalState.version || CURRENT_VERSION, notes: 'Descargando actualización v' + (modalState.version || CURRENT_VERSION) + '…', downloading: true, progress: 0 });
          window.BCHESS_DESKTOP.downloadUpdate();
          return;
        }
      } else {
        applyUpdateNow();
      }
    });
  }

  function markOutdated(badgeEl, info) {
    if (!badgeEl) return;
    badgeEl.textContent = 'Actualización v' + info.latest + ' disponible';
    badgeEl.classList.add('has-update');
  }

  function updateFooterBadge() {
    var badge = document.getElementById('version-badge');
    if (badge) badge.textContent = 'B-Chess Desktop v' + CURRENT_VERSION;
  }

  function wireBadge() {
    var badge = document.getElementById('version-badge');
    if (!badge) return;
    badge.classList.add('is-clickable');
    badge.title = 'Comprobar actualizaciones';
    badge.addEventListener('click', function () {
      checkForUpdate().then(function (info) {
        if (info && info.available) {
          markOutdated(badge, info);
          openModal({ version: info.latest, notes: info.notes });
        } else {
          var t = document.getElementById('toast');
          if (t) {
            t.textContent = 'Estás en la última versión (v' + CURRENT_VERSION + ')';
            t.classList.add('show');
            setTimeout(function () { t.classList.remove('show'); }, 2500);
          }
        }
      });
    });
  }

  // ---------- Electron: recibir eventos del main process ----------
  function wireElectronUpdater() {
    var desk = window.BCHESS_DESKTOP;
    if (!desk || !desk.isElectron) return false;

    desk.onUpdateAvailable && desk.onUpdateAvailable(function (info) {
      var ver = (info && info.version) || CURRENT_VERSION;
      // Iniciar la descarga automáticamente; el modal muestra el progreso
      openModal({ version: ver, notes: 'Descargando actualización v' + ver + '…', downloading: true, progress: 0 });
      if (typeof desk.downloadUpdate === 'function') desk.downloadUpdate();
    });
    desk.onUpdateDownloaded && desk.onUpdateDownloaded(function (info) {
      openModal({ version: (info && info.version) || CURRENT_VERSION, downloaded: true, notes: 'Descarga completada. Reinicia para aplicar la actualización.' });
    });
    desk.onUpdateProgress && desk.onUpdateProgress(function (p) {
      if (p && typeof p.percent === 'number') setProgress(p.percent);
    });
    desk.onUpdateError && desk.onUpdateError(function (err) {
      // No cerrar el modal: mostrar el motivo y dejar que el usuario puede reintentar
      var message = (err && err.message) ? err.message : String(err || 'error desconocido');
      setError(message);
      var modal = document.getElementById('update-modal');
      if (modal) modal.classList.add('show');
    });
    return true;
  }

  // ---------- Navegador: chequeo periódico al arrancar ----------
  function wireBrowserAutoCheck() {
    var isElectron = !!(window.BCHESS_DESKTOP && window.BCHESS_DESKTOP.isElectron);
    if (isElectron) return; // Electron maneja esto con autoUpdater
    var t = setTimeout(function () {
      checkForUpdate().then(function (info) {
        if (info && info.available) openModal({ version: info.latest, notes: info.notes });
      });
    }, 1500);
    return function () { clearTimeout(t); };
  }

  registerSW();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      updateFooterBadge(); wireModalButtons(); wireElectronUpdater(); wireBrowserAutoCheck(); wireBadge();
    });
  } else {
    updateFooterBadge(); wireModalButtons(); wireElectronUpdater(); wireBrowserAutoCheck(); wireBadge();
  }

  return {
    CURRENT_VERSION: CURRENT_VERSION,
    checkForUpdate: checkForUpdate,
    applyUpdateNow: applyUpdateNow
  };
})();
