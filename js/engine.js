/*
 * B-Chess Desktop · Motor único (Stockfish + escalonado Elo)
 * Un worker singleton compartido entre jugadas (no se crea uno por jugada).
 * Escalones de Elo aproximados con blunders aleatorios para niveles bajos.
 * El motor se desentiende del reloj con tiempo de búsqueda escalado por el reloj.
 * Siempre responde: si algo fallara, devolver 'null' fuerza un movimiento aleatorio seguro.
 */
window.BCHESS_ENGINE = (function () {
  const LADDER = [
    { elo: 400,  label: 'Iniciación ≈400',    blunder: 0.78, eloOpt: null,  skill: 0,  depth: 5,  limit: false },
    { elo: 800,  label: 'Principiante ≈800',  blunder: 0.55, eloOpt: null,  skill: 2,  depth: 6,  limit: false },
    { elo: 1200, label: 'Aprendiz ≈1200',     blunder: 0.30, eloOpt: null,  skill: 4,  depth: 7,  limit: false },
    { elo: 1350, label: 'Casual ≈1350',       blunder: 0,    eloOpt: 1320,  skill: 0,  depth: 9,  limit: true },
    { elo: 1600, label: 'Normal ≈1600',       blunder: 0,    eloOpt: 1600,  skill: 3,  depth: 10, limit: true },
    { elo: 1800, label: 'Intermedio ≈1800',   blunder: 0,    eloOpt: 1800,  skill: 5,  depth: 12, limit: true },
    { elo: 2050, label: 'Avanzado ≈2050',     blunder: 0,    eloOpt: 2050,  skill: 8,  depth: 14, limit: true },
    { elo: 2300, label: 'Competitivo ≈2300',  blunder: 0,    eloOpt: 2300,  skill: 11, depth: 16, limit: true },
    { elo: 2600, label: 'Maestro ≈2600',      blunder: 0,    eloOpt: 2600,  skill: 15, depth: 18, limit: true },
    { elo: 3190, label: 'Ultra ≈3190',        blunder: 0,    eloOpt: 3190,  skill: 20, depth: 22, limit: true }
  ];

  // Debug solo con ?debug=1 en la URL
  const DEBUG = (function () {
    try { return /(?:\?|&)debug=1(?:&|$)/.test(window.location.search) || window.BCHESS_DEBUG === true; }
    catch (e) { return false; }
  })();
  function log(...args) { if (DEBUG) try { console.log('[engine]', ...args); } catch (e) {} }

  // ---------- singleton worker ----------
  let worker = null;
  let workerReady = false;
  let workerBooting = false;
  let bootResolvers = [];
  let pending = []; // [{resolve, timer}]

  function randomLegalMove(fen) {
    try {
      if (typeof window.Chess !== 'function') return null;
      const game = new window.Chess(fen);
      const moves = game.moves({ verbose: true });
      if (!moves.length) return null;
      const mv = moves[Math.floor(Math.random() * moves.length)];
      return mv.from + mv.to + (mv.promotion || '');
    } catch (e) { return null; }
  }

  function difficultyClamped(opts) {
    return Math.max(1, Math.min(10, parseInt(opts && opts.difficulty, 10) || 5));
  }

  function thinkTimeMs(difficulty, opts) {
    var base = 500 + difficulty * 200; // dificultad 5 → 1500ms
    if (opts && opts.timeOn && isFinite(opts.turnMs)) {
      var rem = Math.max(0, opts.turnMs);
      if (rem < 3000) return Math.max(150, Math.floor(rem * 0.08));
      return Math.max(250, Math.min(base, Math.floor(rem / 20)));
    }
    return base;
  }

  function drainPending(val) {
    var queue = pending.slice();
    pending = [];
    queue.forEach(function (p) {
      clearTimeout(p.timer);
      try { p.resolve(val); } catch (e) {}
    });
  }

  function killWorker() {
    if (worker) {
      try { worker.terminate(); } catch (e) {}
    }
    worker = null;
    workerReady = false;
    workerBooting = false;
  }

  function handleLine(line) {
    if (line === 'uciok') {
      // El motor responde con su lista de comandos tras 'uci'; respondemos 'isready' como señal simple
      try { worker.postMessage('isready'); } catch (e) { killWorker(); bootResolvers.forEach(function (r) { r(false); }); bootResolvers = []; }
      return;
    }
    if (line === 'readyok') {
      workerReady = true;
      workerBooting = false;
      var rs = bootResolvers.slice();
      bootResolvers = [];
      rs.forEach(function (r) { r(true); });
      return;
    }
    if (line.indexOf('bestmove') === 0) {
      var move = line.split(/\s+/)[1] || '';
      if (move === '(none)' || move === 'none') move = '';
      drainPending(move || null);
      return;
    }
    // ignorar otras líneas (info depth, curr. move, etc.)
  }

  function bootWorker() {
    if (workerReady) return Promise.resolve(true);
    if (workerBooting) return new Promise(function (res) { bootResolvers.push(res); });

    workerBooting = true;
    return new Promise(function (resolve) {
      bootResolvers.push(resolve);
      try {
        worker = new Worker('js/vendor/stockfish-19-lite-single.js');
        worker.onmessage = function (e) {
          try { handleLine(String(e && e.data || '')); } catch (err) { log('onmessage error', err); drainPending(null); }
        };
        worker.onerror = function (err) {
          log('worker error', err);
          drainPending(null);
          var rs = bootResolvers.slice();
          bootResolvers = [];
          rs.forEach(function (r) { r(false); });
        };
        worker.postMessage('uci');
      } catch (e) {
        log('no se pudo crear worker', e);
        var rs = bootResolvers.slice();
        bootResolvers = [];
        rs.forEach(function (r) { r(false); });
      }
    });
  }

  function findBestMove(fen, opts) {
    opts = opts || {};
    const difficulty = difficultyClamped(opts);
    const level = LADDER[difficulty - 1];

    // Niveles novatos: a veces juega jugadas aleatorias (errores humanos)
    if (level.blunder > 0 && Math.random() < level.blunder) {
      const r = randomLegalMove(fen);
      if (r) { log('random move', r); return Promise.resolve(r); }
    }

    const thinkMs = thinkTimeMs(difficulty, opts);
    log('findBestMove', { difficulty, elo: level.elo, thinkMs });

    return bootWorker().then(function (ok) {
      if (!ok || !workerReady) return null;

      return new Promise(function (resolve) {
        const timer = setTimeout(function () {
          log('engine move timeout');
          drainPending(null);
        }, 15000);

        pending.push({ resolve: resolve, timer: timer });

        try {
          worker.postMessage('setoption name Threads value 1');
          worker.postMessage('setoption name Hash value 64');
          worker.postMessage('setoption name MultiPV value 1');
          worker.postMessage('setoption name UCI_LimitStrength value ' + (level.limit ? 'true' : 'false'));
          if (level.limit && level.eloOpt) worker.postMessage('setoption name UCI_Elo value ' + level.eloOpt);
          worker.postMessage('setoption name Skill Level value ' + level.skill);
          worker.postMessage('position fen ' + fen);
          if (opts.timeOn && isFinite(opts.turnMs) && opts.turnMs < 3000) {
            worker.postMessage('go movetime ' + thinkMs);
          } else {
            worker.postMessage('go depth ' + level.depth + ' movetime ' + thinkMs);
          }
        } catch (e) {
          log('findBestMove error', e);
          drainPending(null);
        }
      });
    });
  }

  function stop() {
    drainPending(null);
    try { if (worker) worker.postMessage('stop'); } catch (e) {}
  }

  function quit() {
    drainPending(null);
    killWorker();
    bootResolvers.forEach(function(r){ r(false); });
    bootResolvers = [];
  }

  function ladder() { return LADDER.slice(); }

  return { findBestMove: findBestMove, stop: stop, quit: quit, ladder: ladder };
})();
