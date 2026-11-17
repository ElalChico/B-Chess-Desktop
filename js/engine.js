/*
 * B-Chess Desktop · Motor único (Stockfish + escalonado Elo)
 * Un worker por jugada: nunca hay estado corrupto entre búsquedas,
 * y el motor se desentiende del reloj con tiempo por jugada escalado por el reloj real.
 * Bajo la IA: niveles con Elo aproximado y blunders aleatorios para simular fuerza humana novata.
 */
window.BCHESS_ENGINE = (function () {
  const LADDER = [
    { elo: 400,  label: 'Iniciación ≈400',    blunder: 0.78, eloOpt: null,  skill: 0,  depth: 6,  limit: false },
    { elo: 800,  label: 'Principiante ≈800',  blunder: 0.55, eloOpt: null,  skill: 2,  depth: 7,  limit: false },
    { elo: 1200, label: 'Aprendiz ≈1200',     blunder: 0.30, eloOpt: null,  skill: 4,  depth: 8,  limit: false },
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

  // Calcula ms de búsqueda según dificultad y el reloj de quien juega
  function thinkTimeMs(difficulty, opts) {
    var base = 400 + difficulty * 200;
    if (opts && opts.timeOn && isFinite(opts.turnMs)) {
      var rem = Math.max(0, opts.turnMs);
      if (rem < 3000) return Math.max(150, Math.floor(rem * 0.08));
      return Math.max(200, Math.min(base, Math.floor(rem / 22)));
    }
    return base;
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

    return new Promise(function (resolve) {
      let w = null;
      let settled = false;
      const finish = function (val) { if (settled) return; settled = true; clearTimeout(timer); try { w && w.terminate(); } catch (e) {} resolve(val); };

      try {
        w = new Worker('js/vendor/stockfish-19-lite-single.js');
      } catch (e) {
        console.error('[engine] no se pudo crear worker', e);
        return resolve(null);
      }

      const timer = setTimeout(function () { finish(null); }, 10000);

      w.onmessage = function (e) {
        const line = String(e.data || '');
        if (line === 'uciok') { w.postMessage('isready'); return; }
        if (line === 'readyok') {
          try {
            w.postMessage('setoption name Threads value 1');
            w.postMessage('setoption name Hash value 64');
            w.postMessage('setoption name MultiPV value 1');
            w.postMessage('setoption name UCI_LimitStrength value ' + (level.limit ? 'true' : 'false'));
            if (level.limit && level.eloOpt) w.postMessage('setoption name UCI_Elo value ' + level.eloOpt);
            w.postMessage('setoption name Skill Level value ' + level.skill);
            w.postMessage('position fen ' + fen);
            // con reloj bajo: sólo movetime para que el motor no piense más de lo que hay en el reloj
            if (opts.timeOn && isFinite(opts.turnMs) && opts.turnMs < 3000) {
              w.postMessage('go movetime ' + thinkMs);
            } else {
              w.postMessage('go depth ' + level.depth + ' movetime ' + thinkMs);
            }
          } catch (err) {
            finish(null);
          }
          return;
        }
        if (line.indexOf('bestmove') === 0) {
          const move = line.split(/\s+/)[1] || '';
          if (move) finish(move);
          else finish(null);
        }
      };

      w.onerror = function () { finish(null); };
      w.postMessage('uci');
    });
  }

  function stop() {}
  function quit() {}

  function ladder() { return LADDER.slice(); }

  return { findBestMove: findBestMove, stop: stop, quit: quit, ladder: ladder };
})();
