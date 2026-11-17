/*
 * B-Chess Desktop · Actualizador
 * - Electron: autoUpdater nativo (GitHub Releases). El modal de la app muestra
 *   "Hay una versión nueva" y al confirmar se dispara la descarga y el reinicio.
 * - Navegador: consulta GitHub API Releases; muestra el mismo modal. El botón
 *   "Descargar e instalar" hace recarga/aplicación del SW si hay uno nuevo.
 */
window.BCHESS_UPDATE = (function () {
  'use strict';

  var CURRENT_VERSION = '2.2.15';
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
  var modalState = { version: null, downloaded: false };

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
    modalState.version = ver;
    modalState.downloaded = downloaded;

    if (title) title.textContent = 'B-Chess Desktop v' + ver;
    if (notes) notes.textContent = opts.notes || '';
    if (badge) badge.textContent = downloaded ? 'Lista para instalar' : 'Actualización disponible';
    if (nowTitle) nowTitle.textContent = downloaded ? 'Reiniciar ahora' : 'Descargar e instalar';
    if (nowSub) nowSub.textContent = downloaded ? 'Se aplicará el reinicio' : 'Se aplicará al reiniciar';

    modal.classList.add('show');
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
      closeModal();
      // Si ya estaba descargada (Electron), reiniciar para aplicar.
      // Si no, disparar la descarga; el "downloaded" llegará como segundo evento
      // y el modal se reabre con el botón de "Reiniciar ahora".
      var isElectron = !!(window.BCHESS_DESKTOP && window.BCHESS_DESKTOP.isElectron);
      if (isElectron) {
        if (modalState.downloaded && typeof window.BCHESS_DESKTOP.quitAndInstall === 'function') {
          window.BCHESS_DESKTOP.quitAndInstall();
        } else if (typeof window.BCHESS_DESKTOP.downloadUpdate === 'function') {
          window.BCHESS_DESKTOP.downloadUpdate();
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
      openModal({ version: info && info.version, notes: '' });
    });
    desk.onUpdateDownloaded && desk.onUpdateDownloaded(function (info) {
      openModal({ version: info && info.version, downloaded: true });
    });
    desk.onUpdateError && desk.onUpdateError(function (err) {
      var t = document.getElementById('toast');
      if (t) {
        t.textContent = 'No se pudo comprobar la actualización';
        t.classList.add('show');
        setTimeout(function () { t.classList.remove('show'); }, 3000);
      }
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
