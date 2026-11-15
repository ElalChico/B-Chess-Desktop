/*
 * B-Chess V2 · Estadísticas con ECharts (carga perezosa desde CDN).
 * Gráficos: resumen (pie), flujo (sankey), aperturas (tree) y progreso (line).
 * Los datos provienen de las partidas guardadas en localStorage.
 */
window.BCHESS_STATS = (function () {
  'use strict';

  var EC_URL = 'https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js';
  var loading = null;
  var instances = {};
  var rendered = false;

  var C = {
    win: '#2ea043',
    loss: '#f85149',
    draw: '#d29922',
    white: '#58a6ff',
    black: '#a371f7',
    ai: '#f0883e',
    online: '#39d2c0',
    line1: '#58a6ff',
    line2: '#2ea043',
    line3: '#f0883e',
    text: '#e6e6e6',
    muted: '#8b949e',
    axis: '#21262d',
    border: '#30363d'
  };

  function loadEcharts() {
    if (window.echarts) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = EC_URL;
      s.onload = resolve;
      s.onerror = function () { loading = null; reject(new Error('No se pudo cargar ECharts')); };
      document.head.appendChild(s);
    });
    return loading;
  }

  function clearEmpty(el) {
    var note = el.querySelector('.chart-empty');
    if (note) note.remove();
  }

  function markEmpty(el, msg) {
    if (el.querySelector('.chart-empty')) return;
    var d = document.createElement('div');
    d.className = 'chart-empty';
    d.textContent = msg || 'Sin datos todavía: juega partidas para ver esta gráfica.';
    el.appendChild(d);
  }

  function dispose(id) {
    var chart = instances[id];
    if (chart) { chart.dispose(); delete instances[id]; }
  }

  function mount(id, option) {
    var el = document.getElementById(id);
    if (!el || !window.echarts) return;
    clearEmpty(el);
    var chart = instances[id] || echarts.init(el);
    instances[id] = chart;
    chart.setOption(option, true);
    chart.resize();
  }

  // ================= Resumen general (donut de resultados) =================
  // Nota: una tarta con G/P/E + Blancas/Negras + vs-IA/En-línea mezcla tres
  // agrupaciones distintas y los arcos sumarían el triple de partidas.
  // Por eso el donut muestra SOLO el resultado, y el resto va en chips.
  function optionSummary(games, stats) {
    var data = [];
    if (stats.wins) data.push({ value: stats.wins, name: 'Ganadas', itemStyle: { color: C.win } });
    if (stats.losses) data.push({ value: stats.losses, name: 'Perdidas', itemStyle: { color: C.loss } });
    if (stats.draws) data.push({ value: stats.draws, name: 'Empates', itemStyle: { color: C.draw } });
    if (!data.length) return null;
    var total = (stats.wins || 0) + (stats.losses || 0) + (stats.draws || 0);
    var winrate = total ? Math.round((stats.wins / total) * 100) : 0;
    var expl = {
      'Ganadas': 'partidas que has ganado',
      'Perdidas': 'partidas que has perdido',
      'Empates': 'partidas terminadas en tablas'
    };
    return {
      tooltip: {
        trigger: 'item',
        formatter: function (p) {
          var pct = total ? Math.round((p.value / total) * 100) : 0;
          return '<b>' + p.name + ': ' + p.value + ' de ' + total + '</b> (' + pct + '%)<br/>' + (expl[p.name] || '');
        }
      },
      title: {
        text: String(total),
        subtext: 'partidas\n' + winrate + '% victorias',
        left: 'center',
        top: 'center',
        textStyle: { color: C.text, fontSize: 30, fontWeight: 700 },
        subtextStyle: { color: C.muted, fontSize: 11, lineHeight: 15 }
      },
      series: [{
        type: 'pie',
        radius: ['52%', '85%'],
        center: ['50%', '50%'],
        itemStyle: { borderRadius: 8, borderColor: '#0d1117', borderWidth: 3 },
        label: { show: true, color: C.text, fontSize: 12, formatter: '{b}\n{c}' },
        data: data
      }]
    };
  }

  function fillSummaryChips(games) {
    var chips = document.getElementById('summary-chips');
    if (!chips) return;
    var w = games.filter(function (g) { return g.localColor === 'w'; }).length;
    var b = games.length - w;
    var ai = games.filter(function (g) { return g.mode === 'ai'; }).length;
    var on = games.length - ai;
    var items = [
      ['Blancas', w, C.white],
      ['Negras', b, C.black],
      ['vs IA', ai, C.ai],
      ['En línea', on, C.online]
    ];
    chips.innerHTML = items.map(function (it) {
      return '<span class="summary-chip" style="border-color:' + it[2] + '55"><i style="background:' + it[2] + '"></i>' + it[0] + ': <b>' + it[1] + '</b></span>';
    }).join('');
  }

  // ================= Flujo (sankey) =================
  function firstMove(g) {
    var san = (g.movesSan && g.movesSan[0]) || extractSans(g.pgn)[0];
    if (!san) return null;
    var f = san.replace(/[+#]/g, '');
    if (f === 'e4' || f === 'd4' || f === 'c4' || f === 'Nf3' || f === 'f4' || f === 'g3' || f === 'b3') return f;
    return 'Otra';
  }

  function extractSans(pgn) {
    var sans = [];
    var text = String(pgn || '').replace(/\[[^\]]*\]/g, ' ');
    var re = /(?:\d+\.+\s*)?([NBRQKP][a-h1-8]?[x:@]?[a-h1-8]+|O-O(?:-O)?|[a-h][1-8](?:=[NBRQ])?)[+#]?\s*/g;
    var m;
    while ((m = re.exec(text))) sans.push(m[1]);
    return sans;
  }

  function reasonKind(g) {
    var r = String(g.reason || '').toLowerCase();
    if (r.indexOf('mate') >= 0) return 'Mate';
    if (r.indexOf('tiempo') >= 0) return 'Tiempo';
    if (r.indexOf('rendi') >= 0 || r.indexOf('aband') >= 0 || r.indexOf('desconec') >= 0) return 'Abandono';
    if (r.indexOf('tablas') >= 0) return 'Acuerdo';
    return 'Otro';
  }

  function optionFlow(games) {
    var nodes = [
      { name: 'Blancas', itemStyle: { color: C.white } },
      { name: 'Negras', itemStyle: { color: C.black } },
      { name: 'Ganadas', itemStyle: { color: C.win } },
      { name: 'Perdidas', itemStyle: { color: C.loss } },
      { name: 'Empates', itemStyle: { color: C.draw } },
      { name: 'Mate', itemStyle: { color: C.ai } },
      { name: 'Tiempo', itemStyle: { color: C.online } },
      { name: 'Abandono', itemStyle: { color: '#db61a2' } },
      { name: 'Otro', itemStyle: { color: C.muted } }
    ];
    var moves = {};
    games.forEach(function (g) {
      var mv = firstMove(g);
      if (!mv) return;
      if (!moves[mv]) moves[mv] = true;
      if (mv !== 'Otra' && !nodes.some(function (n) { return n.name === mv; })) {
        nodes.unshift({ name: mv, itemStyle: { color: mv === 'e4' ? C.white : (mv === 'd4' ? C.win : C.black) } });
      }
    });
    var counts = {};
    function bump(a, b) {
      var k = a + '→' + b;
      counts[k] = (counts[k] || 0) + 1;
    }
    games.forEach(function (g) {
      var mv = firstMove(g);
      var color = g.localColor === 'w' ? 'Blancas' : 'Negras';
      var res = g.myResult === 'win' ? 'Ganadas' : (g.myResult === 'loss' ? 'Perdidas' : 'Empates');
      if (mv) bump(mv, color);
      bump(color, res);
      bump(res, reasonKind(g));
    });
    var links = Object.keys(counts).map(function (k) {
      var parts = k.split('→');
      return { source: parts[0], target: parts[1], value: counts[k] };
    });
    return {
      tooltip: {
        trigger: 'item',
        formatter: function (p) {
          if (p.dataType === 'edge') {
            return '<b>' + p.data.source + ' → ' + p.data.target + '</b><br/>Partidas: ' + p.data.value;
          }
          return '<b>' + p.name + '</b><br/>Partidas que pasan por este nodo';
        }
      },
      series: [{
        type: 'sankey',
        layout: 'none',
        emphasis: { focus: 'adjacency' },
        nodeAlign: 'justify',
        nodeWidth: 20,
        nodeGap: 12,
        layoutIterations: 32,
        label: { color: C.text, fontSize: 13, position: 'right' },
        lineStyle: { color: 'gradient', curveness: 0.5, opacity: 0.4 },
        itemStyle: { borderWidth: 1, borderColor: C.border },
        data: nodes,
        links: links
      }]
    };
  }

  // ================= Aperturas (tree) =================
  // Cuenta partidas por secuencia w1 → b1 → w2 → b2.
  // El color de cada nodo codifica frecuencia de uso (azul = poco, rojo = mucho).
  function optionOpenings(games) {
    var root = {};
    games.forEach(function (g) {
      var sans = (g.movesSan && g.movesSan.length ? g.movesSan : extractSans(g.pgn)).slice(0, 6);
      if (!sans.length) return;
      var w1 = sans[0].replace(/[+#]/g, '');
      var b1 = sans[1] ? sans[1].replace(/[+#]/g, '') : null;
      var w2 = sans[2] ? sans[2].replace(/[+#]/g, '') : null;
      var b2 = sans[3] ? sans[3].replace(/[+#]/g, '') : null;
      if (!root[w1]) root[w1] = { total: 0, children: {} };
      var L1 = root[w1];
      L1.total++;
      if (!b1) return;
      if (!L1.children[b1]) L1.children[b1] = { total: 0, children: {} };
      var L2 = L1.children[b1];
      L2.total++;
      if (!w2) return;
      if (!L2.children[w2]) L2.children[w2] = { total: 0, children: {} };
      var L3 = L2.children[w2];
      L3.total++;
      if (!b2) return;
      L3.children[b2] = (L3.children[b2] || 0) + 1;
    });
    var names = Object.keys(root);
    if (!names.length) return null;

    // Máximo global para normalizar la escala de color
    var maxCount = 1;
    Object.keys(root).forEach(function (w1) {
      maxCount = Math.max(maxCount, root[w1].total);
      Object.keys(root[w1].children).forEach(function (b1) {
        maxCount = Math.max(maxCount, root[w1].children[b1].total);
        Object.keys(root[w1].children[b1].children).forEach(function (w2) {
          maxCount = Math.max(maxCount, root[w1].children[b1].children[w2].total);
          Object.keys(root[w1].children[b1].children[w2].children).forEach(function (b2) {
            maxCount = Math.max(maxCount, root[w1].children[b1].children[w2].children[b2]);
          });
        });
      });
    });
    function heatColor(v) {
      var t = Math.min(1, (v || 0) / maxCount);
      if (t < 0.2) return '#58a6ff';   // azul  — poco usada
      if (t < 0.4) return '#79c0ff';   // celeste — algo usada
      if (t < 0.65) return '#eac54f';  // amarillo — media
      if (t < 0.85) return '#f0883e';  // naranja — muy usada
      return '#f85149';                // rojo — la más usada
    }
    var data = names.map(function (w1) {
      var L1 = root[w1];
      return {
        name: '1. ' + w1,
        value: L1.total,
        itemStyle: { color: heatColor(L1.total) },
        children: Object.keys(L1.children)
          .sort(function (a, b) { return L1.children[b].total - L1.children[a].total; })
          .slice(0, 5)
          .map(function (b1) {
            var L2 = L1.children[b1];
            return {
              name: '1… ' + b1,
              value: L2.total,
              itemStyle: { color: heatColor(L2.total) },
              children: Object.keys(L2.children)
                .sort(function (a, b) { return L2.children[b].total - L2.children[a].total; })
                .slice(0, 4)
                .map(function (w2) {
                  var L3 = L2.children[w2];
                  return {
                    name: '2. ' + w2,
                    value: L3.total,
                    itemStyle: { color: heatColor(L3.total) },
                    children: Object.keys(L3.children)
                      .sort(function (a, b) { return L3.children[b] - L3.children[a]; })
                      .slice(0, 3)
                      .map(function (b2) {
                        var n = L3.children[b2];
                        return { name: '2… ' + b2, value: n, itemStyle: { color: heatColor(n) } };
                      })
                  };
                })
            };
          })
      };
    });
    return {
      tooltip: {
        trigger: 'item',
        formatter: function (p) {
          return '<b>' + p.name + '</b><br/>Partidas con esta jugada: ' + (p.value || 0) + '<br/>Color = frecuencia de uso';
        }
      },
      series: [{
        type: 'tree',
        data: data,
        top: '8%',
        left: '8%',
        bottom: '8%',
        right: '18%',
        symbolSize: 12,
        orient: 'LR',
        label: { position: 'left', verticalAlign: 'middle', align: 'right', color: C.text, fontSize: 12 },
        leaves: { label: { position: 'right', verticalAlign: 'middle', align: 'left', fontSize: 12 } },
        expandAndCollapse: true,
        initialTreeDepth: 2,
        animationDuration: 550,
        animationDurationUpdate: 750,
        lineStyle: { color: C.border, width: 2, curveness: 0.5 }
      }]
    };
  }

  // ================= Progreso (line) =================
  function optionProgress(games) {
    if (!games.length) return null;
    var chrono = games.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    function seriesFor(filter, color) {
      var running = { n: 0, w: 0 };
      var pts = [];
      chrono.forEach(function (g) {
        if (!filter(g)) return;
        running.n++;
        if (g.myResult === 'win') running.w++;
        pts.push(running.n ? Math.round((running.w / running.n) * 1000) / 10 : null);
      });
      return pts;
    }
    var labels = chrono.map(function (g, i) { return 'P' + (i + 1); });
    function mk(name, color, filter) {
      return {
        name: name,
        type: 'line',
        smooth: 0.3,
        showSymbol: false,
        data: seriesFor(filter, color),
        lineStyle: { width: 4, color: color }
      };
    }
    return {
      tooltip: {
        trigger: 'axis',
        formatter: function (params) {
          var head = '<b>Tras ' + params[0].axisValue + '</b><br/>';
          var body = params.map(function (p) {
            return p.marker + ' ' + p.seriesName + ': <b>' + (p.value == null ? '—' : p.value + '%') + '</b> de victorias';
          }).join('<br/>');
          return head + body;
        }
      },
      legend: { textStyle: { color: C.muted }, top: 0 },
      grid: { left: '4%', right: '4%', bottom: '5%', top: '18%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: labels,
        axisLine: { lineStyle: { color: C.axis } },
        axisLabel: { color: C.muted, hideOverlap: true }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: C.axis, type: 'dashed' } },
        axisLabel: { color: C.muted, formatter: '{value}%' }
      },
      series: [
        mk('Todas', C.line1, function () { return true; }),
        mk('vs IA', C.line2, function (g) { return g.mode === 'ai'; }),
        mk('En línea', C.line3, function (g) { return g.mode === 'online'; })
      ]
    };
  }

  // ================= Resultados por color (line ×6) =================
  function optionColorForm(games) {
    if (!games.length) return null;
    var chrono = games.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
    var labels = chrono.map(function (g, i) { return 'P' + (i + 1); });

    function seriesDef(name, color, dash, filter) {
      var acc = 0, pts = [];
      chrono.forEach(function (g) {
        if (filter(g)) acc++;
        pts.push(acc);
      });
      return {
        name: name,
        type: 'line',
        smooth: 0.25,
        showSymbol: false,
        step: false,
        data: pts,
        lineStyle: { width: 3, type: dash ? 'dashed' : 'solid', color: color },
        emphasis: { focus: 'series' }
      };
    }
    var isWhite = function (g) { return g.localColor === 'w'; };
    var isBlack = function (g) { return g.localColor !== 'w'; };
    var win = function (g) { return g.myResult === 'win'; };
    var loss = function (g) { return g.myResult === 'loss'; };
    var draw = function (g) { return g.myResult === 'draw'; };

    return {
      tooltip: {
        trigger: 'axis',
        formatter: function (params) {
          var head = '<b>Tras ' + params[0].axisValue + '</b><br/>Acumulado de partidas:<br/>';
          var body = params.map(function (p) {
            return p.marker + ' ' + p.seriesName + ': <b>' + p.value + '</b>';
          }).join('<br/>');
          return head + body;
        }
      },
      legend: { textStyle: { color: C.muted, fontSize: 11 }, top: 0, itemWidth: 18 },
      grid: { left: '4%', right: '4%', bottom: '5%', top: '24%', containLabel: true },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: labels,
        axisLine: { lineStyle: { color: C.axis } },
        axisLabel: { color: C.muted, hideOverlap: true }
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLine: { show: false },
        splitLine: { lineStyle: { color: C.axis, type: 'dashed' } },
        axisLabel: { color: C.muted }
      },
      series: [
        seriesDef('Ganadas blancas', '#2ea043', false, function (g) { return isWhite(g) && win(g); }),
        seriesDef('Empates blancas', '#d29922', false, function (g) { return isWhite(g) && draw(g); }),
        seriesDef('Perdidas blancas', '#f85149', false, function (g) { return isWhite(g) && loss(g); }),
        seriesDef('Ganadas negras', '#3fb950', true, function (g) { return isBlack(g) && win(g); }),
        seriesDef('Empates negras', '#eac54f', true, function (g) { return isBlack(g) && draw(g); }),
        seriesDef('Perdidas negras', '#ff7b72', true, function (g) { return isBlack(g) && loss(g); })
      ]
    };
  }

  // ================= Expandir gráfica en grande (modal) =================
  var lastOptions = {};   // id → option (para clonar en el modal)
  var chartTitles = {};   // id → { title, desc }
  var modalChart = null;

  function collectChartMeta() {
    chartTitles = {};
    document.querySelectorAll('.chart-block[data-chart]').forEach(function (block) {
      var id = block.getAttribute('data-chart');
      var t = block.querySelector('.chart-title');
      var d = block.querySelector('.chart-desc');
      chartTitles[id] = {
        title: t ? t.textContent.trim() : id,
        desc: d ? d.textContent.trim() : ''
      };
    });
  }

  function openExpandModal(id) {
    var opt = lastOptions[id];
    var body = document.getElementById('chart-expand-body');
    var modal = document.getElementById('chart-expand-modal');
    if (!body || !modal) return;
    collectChartMeta();
    var meta = chartTitles[id] || { title: id, desc: '' };
    var titleEl = document.getElementById('chart-expand-title');
    var descEl = document.getElementById('chart-expand-desc');
    if (titleEl) titleEl.textContent = meta.title;
    if (descEl) descEl.textContent = meta.desc;
    modal.classList.add('show');
    // Esperar a que el modal sea visible para que echarts mida el tamaño real
    setTimeout(function () {
      if (modalChart) { try { modalChart.dispose(); } catch (e) {} modalChart = null; }
      if (!opt || !window.echarts) {
        body.innerHTML = '<div class="chart-empty" style="position:static;height:100%">Sin datos para esta gráfica todavía. Juega partidas y vuelve a intentarlo.</div>';
        return;
      }
      body.innerHTML = '';
      modalChart = echarts.init(body, null, { renderer: 'canvas' });
      modalChart.setOption(opt, true);
      modalChart.resize();
    }, 60);
  }

  function closeExpandModal() {
    var modal = document.getElementById('chart-expand-modal');
    if (modal) modal.classList.remove('show');
    if (modalChart) { try { modalChart.dispose(); } catch (e) {} modalChart = null; }
  }

  function bindExpandHandlers() {
    document.addEventListener('click', function (ev) {
      var btn = ev.target.closest ? ev.target.closest('.chart-expand-btn') : null;
      if (btn) {
        var target = btn.getAttribute('data-expand');
        if (target) openExpandModal(target);
        return;
      }
      var closeBtn = ev.target.closest ? ev.target.closest('#chart-expand-close') : null;
      if (closeBtn) closeExpandModal();
    });
    var modal = document.getElementById('chart-expand-modal');
    if (modal) {
      modal.addEventListener('click', function (e) {
        if (e.target === modal) closeExpandModal();
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') closeExpandModal();
    });
  }

  // ================= Render =================
  function render(games, profile) {
    loadEcharts().then(function () {
      var stats = window.BCHESS_PROFILE.computeStats(games);
      var summary = optionSummary(games, stats);
      var flow = optionFlow(games);
      var openings = optionOpenings(games);
      var progress = optionProgress(games);
      var colorForm = optionColorForm(games);
      rendered = true;
      fillSummaryChips(games);

      var spec = [
        ['chart-summary', summary, 'Sin partidas todavía: juega una y aparecerán aquí'],
        ['chart-flow', games.length ? flow : null, 'Sin datos todavía: juega partidas para ver el flujo'],
        ['chart-openings', openings, 'Sin aperturas registradas: juega partidas con más de una jugada'],
        ['chart-progress', progress, 'Sin datos todavía: juega partidas para ver tu progreso'],
        ['chart-colorform', colorForm, 'Sin datos todavía: juega partidas con ambos colores']
      ];
      lastOptions = {};
      spec.forEach(function (s) {
        var id = s[0], opt = s[1], emptyMsg = s[2];
        var el = document.getElementById(id);
        if (!el) return;
        if (!opt) { dispose(id); markEmpty(el, emptyMsg); return; }
        lastOptions[id] = opt;
        mount(id, opt);
      });
    }).catch(function (err) {
      ['chart-summary', 'chart-flow', 'chart-openings', 'chart-progress', 'chart-colorform'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) markEmpty(el, 'No se pudo cargar ECharts (sin conexión a internet).');
      });
    });
  }

  function onProfileShown() {
    // Redimensiona los gráficos visibles cuando el panel se muestra.
    if (!rendered) return;
    setTimeout(function () {
      Object.keys(instances).forEach(function (id) {
        try { instances[id].resize(); } catch (e) {}
      });
    }, 60);
  }

  window.addEventListener('resize', function () {
    if (!rendered) return;
    Object.keys(instances).forEach(function (id) {
      try { instances[id].resize(); } catch (e) {}
    });
    if (modalChart) { try { modalChart.resize(); } catch (e) {} }
  });

  bindExpandHandlers();

  return { render: render, onProfileShown: onProfileShown };
})();
