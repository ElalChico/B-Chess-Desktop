/*
 * B-Chess Desktop · Sonidos
 * Dos paquetes con los mismos sonidos del APK:
 *  - GM      → set gm_* (por defecto)
 *  - Clásico → set lichess/clásico (capture, check, checkmate…)
 * Nunca suena al seleccionar una pieza ni al soltarla.
 *
 * Reproduzco con un <Audio> nuevo por sonido: evita que un fallo puntual
 * (elemento saturado, currentTime antes de cargar, etc.) silencie todo el motor.
 */
window.BCHESS_SOUNDS = (function () {
  const base = 'assets/sounds/';

  var packs = {
    gm: {
      move: 'gm_move.mp3',
      capture: 'gm_capture.mp3',
      check: 'gm_check.mp3',
      mate: 'gm_mate.mp3',
      error: 'gm_error.mp3',
      draw: 'gm_draw.mp3',
      start: 'gm_start.mp3',
      enroque: 'gm_enroque.mp3',
      torre: 'gm_torre.mp3',
      victory: 'victory.mp3',
      defeat: 'defeat.mp3',
      connect: 'gm_connect.mp3',
      connectError: 'gm_connect_error.mp3',
      lowtime: 'lowtime.mp3',
      countdown3: 'countdown3.mp3',
      countdown2: 'countdown2.mp3',
      countdown1: 'countdown1.mp3'
    },
    clasico: {
      move: 'move.mp3',
      capture: 'capture.mp3',
      check: 'check.mp3',
      mate: 'checkmate.mp3',
      error: 'error.mp3',
      draw: 'draw.mp3',
      start: 'confirmation.mp3',
      enroque: 'move.mp3',
      torre: 'move.mp3',
      victory: 'victory.mp3',
      defeat: 'defeat.mp3',
      connect: 'confirmation.mp3',
      connectError: 'error.mp3',
      lowtime: 'lowtime.mp3',
      countdown3: 'countdown3.mp3',
      countdown2: 'countdown2.mp3',
      countdown1: 'countdown1.mp3'
    }
  };

  let files = packs.gm;
  let enabled = true;
  let volume = 0.8;

  function play(name) {
    if (!enabled) return;
    var src = files[name];
    if (!src) return;
    try {
      var a = new Audio(base + src);
      var v = volume;
      if (!isFinite(v) || v < 0 || v > 1) v = 0.8;
      a.volume = v;
      a.preload = 'auto';
      var p = a.play();
      if (p && p.catch) p.catch(function () { /* sin gesto o bloqueado: silencio */ });
    } catch (e) { /* silencio */ }
  }

  function setPack(pack) {
    files = packs[pack] || packs.gm;
  }

  function getPack() {
    for (var id in packs) if (packs[id] === files) return id;
    return 'gm';
  }

  function setEnabled(v) { enabled = !!v; }
  function isEnabled() { return enabled; }
  function setVolume(v) {
    var n = Number(v);
    if (!isFinite(n)) n = 80;
    volume = Math.max(0, Math.min(1, n / 100));
  }
  function getVolume() { return Math.round(volume * 100); }

  // Precarga básica (deja la música lista para el primer click)
  try {
    Object.keys(files).forEach(function (k) {
      var a = new Audio(base + files[k]);
      a.preload = 'auto';
    });
  } catch (e) {}

  return { play, setPack, getPack, setEnabled, isEnabled, setVolume, getVolume };
})();
