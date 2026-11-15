/*
 * B-Chess Desktop · Motor único (Stockfish + escalonado Elo)
 * Un solo worker. La dificultad 1–10 mapea aproximadamente a elo 400 → 3190.
 * En los niveles más bajos se introducen errores aleatorios para emular fuerza humana novata.
 */
window.BCHESS_ENGINE = (function () {
  let worker = null;
  let initPromise = null;
  let initResolve = null;
  let pending = null;

  // Escalera de dificultad aproximada por Elo
  const LADDER = [
    { elo: 400,  label: 'Iniciación ≈400',    blunder: 0.78, eloOpt: null,  skill: 0 },
    { elo: 800,  label: 'Principiante ≈800',  blunder: 0.55, eloOpt: null,  skill: 0 },
    { elo: 1200, label: 'Aprendiz ≈1200',     blunder: 0.30, eloOpt: null,  skill: 0 },
    { elo: 1350, label: 'Casual ≈1350',       blunder: 0,    eloOpt: 1320,  skill: 0 },
    { elo: 1600, label: 'Normal ≈1600',       blunder: 0,    eloOpt: 1600,  skill: 3 },
    { elo: 1800, label: 'Intermedio ≈1800',   blunder: 0,    eloOpt: 1800,  skill: 5 },
    { elo: 2050, label: 'Avanzado ≈2050',     blunder: 0,    eloOpt: 2050,  skill: 8 },
    { elo: 2300, label: 'Competitivo ≈2300',  blunder: 0,    eloOpt: 2300,  skill: 11 },
    { elo: 2600, label: 'Maestro ≈2600',      blunder: 0,    eloOpt: 2600,  skill: 15 },
    { elo: 3190, label: 'Ultra ≈3190',        blunder: 0,    eloOpt: 3190,  skill: 20 }
  ];

  // Debug solo con ?debug=1 en la URL
  const DEBUG = (function () {
    try { return /(?:\?|&)debug=1(?:&|$)/.test(window.location.search) || window.BCHESS_DEBUG === true; }
    catch (e) { return false; }
  })();
  function log(...args) { if (DEBUG) try { console.log('[engine]', ...args); } catch (e) {} }

  function init() {
    if (initPromise) return initPromise;
    initPromise = new Promise(function (resolve) {
      initResolve = resolve;
      try {
        log('creating worker');
        worker = new Worker('js/vendor/stockfish-19-lite-single.js');
        worker.onmessage = function (e) { handleLine(e); };
        worker.onerror = function (e) { console.error('[engine] worker error', e); };
        worker.postMessage('uci');
      } catch (e) {
        console.error('[engine] no se pudo iniciar Stockfish', e);
        initResolve();
      }
    });
    return initPromise;
  }

  function handleLine(e) {
    const line = String((e && e.data) || '');
    if (line === 'uciok') { worker.postMessage('isready'); return; }
    if (line === 'readyok') { log('readyok'); initResolve(); return; }
    if (line.indexOf('bestmove') === 0) {
      const move = line.split(/\s+/)[1] || '';
      if (pending) { const cb = pending; pending = null; cb(move); }
    }
  }

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

  async function findBestMove(fen, opts) {
    opts = opts || {};
    const difficulty = Math.max(1, Math.min(10, parseInt(opts.difficulty, 10) || 5));
    const level = LADDER[difficulty - 1];

    // Niveles novatos: a veces juega jugadas aleatorias (errores humanos)
    if (level.blunder > 0 && Math.random() < level.blunder) {
      const r = randomLegalMove(fen);
      if (r) { log('random move', r); return r; }
    }

    await init();
    if (!worker) return null;

    worker.postMessage('setoption name UCI_LimitStrength value true');
    if (level.eloOpt) worker.postMessage('setoption name UCI_Elo value ' + level.eloOpt);
    worker.postMessage('setoption name Skill Level value ' + level.skill);
    worker.postMessage('position fen ' + fen);
    worker.postMessage('go depth 8 movetime ' + (400 + difficulty * 200));

    return new Promise(function (resolve) {
      pending = resolve;
      // Timeout de seguridad: nunca bloquear la partida
      setTimeout(function () {
        if (!pending) return;
        pending = null;
        try { worker && worker.postMessage('stop'); } catch (e) {}
        resolve(null);
      }, 12000);
    });
  }

  function stop() {
    try { if (worker) worker.postMessage('stop'); } catch (e) {}
  }

  function quit() {
    try { if (worker) { worker.postMessage('quit'); worker.terminate && worker.terminate(); } } catch (e) {}
    worker = null; initPromise = null; initResolve = null; pending = null;
  }

  function ladder() { return LADDER.slice(); }

  return { init: init, findBestMove: findBestMove, stop: stop, quit: quit, ladder: ladder };
})();
