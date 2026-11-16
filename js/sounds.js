/*
 * B-Chess Desktop · Sonidos
 * Dos paquetes con los mismos sonidos del APK:
 *  - GM      → set gm_* (por defecto)
 *  - Clásico → set lichess/clásico (capture, check, checkmate…)
 * Nunca suena al seleccionar una pieza ni al soltarla.
 */
window.BCHESS_SOUNDS = (function () {
  const base = 'assets/sounds/';

  var packs = {
    gm: {
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
  const audio = {};

  function load(name) {
    if (!audio[name] && files[name]) {
      audio[name] = new Audio(base + files[name]);
      audio[name].preload = 'auto';
    }
    return audio[name];
  }

  function play(name) {
    if (!enabled) return;
    const a = load(name);
    if (!a) return;
    try {
      a.pause();
      a.currentTime = 0;
      a.volume = volume;
      a.play().catch(function () {});
    } catch (e) { /* silencio */ }
  }

  function setPack(pack) {
    files = packs[pack] || packs.gm;
    for (var k in audio) delete audio[k];
  }

  function getPack() {
    for (var id in packs) if (packs[id] === files) return id;
    return 'gm';
  }

  function setEnabled(v) { enabled = !!v; }
  function isEnabled() { return enabled; }
  function setVolume(v) { volume = Math.max(0, Math.min(1, v / 100)); }
  function getVolume() { return Math.round(volume * 100); }

  // Precarga
  Object.keys(files).forEach(load);

  return { play, setPack, getPack, setEnabled, isEnabled, setVolume, getVolume };
})();
