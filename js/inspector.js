/*
 * B-Chess V2 · Inspector de desarrollo (F2)
 * - F2 activa/desactiva el modo inspector.
 * - En modo inspector, al pasar el ratón se resalta el elemento.
 * - Al hacer clic se copia su data-dev (o un selector generado) al portapapeles.
 *
 * Los listeners de ratón en fase de captura solo existen MIENTRAS el modo está activo:
 * mantenerlos activos siempre penaliza cada evento del navegador (ardida con mouseover).
 */
(function () {
  let enabled = false;
  let panel = null;

  function makePanel() {
    if (panel) return panel;
    panel = document.createElement('div');
    panel.className = 'dev-panel';
    panel.textContent = 'MODO DEV · F2 para salir · clic copia selector';
    document.body.appendChild(panel);
    return panel;
  }

  function ensureSelector(el) {
    const id = el.getAttribute('data-dev');
    if (id) return '[data-dev="' + id + '"]';
    if (el.id) return '#' + el.id;
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body && parts.length < 4) {
      let sel = cur.tagName.toLowerCase();
      if (cur.className) {
        const cls = String(cur.className).trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
        if (cls) sel += '.' + cls;
      }
      parts.unshift(sel);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function getOutlinedEl(target) {
    return target && target.nodeType === 1 ? target : (target && target.parentElement) || null;
  }

  // Listeners capturadores: solo existen mientras el modo está activo.
  function onMouseOverCapture(e) {
    const t = getOutlinedEl(e.target);
    if (!t || !t.classList) return;
    t.classList.add('dev-highlight');
    if (panel) panel.textContent = ensureSelector(t);
  }

  function onMouseOutCapture(e) {
    const t = getOutlinedEl(e.target);
    if (t && t.classList) t.classList.remove('dev-highlight');
  }

  function onClickCapture(e) {
    e.preventDefault();
    e.stopPropagation();
    const sel = ensureSelector(e.target);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(sel).catch(function () {});
    }
    if (window.showToast) window.showToast('Copiado: ' + sel);
  }

  function toggle() {
    enabled = !enabled;
    document.body.classList.toggle('dev-mode', enabled);
    if (enabled) {
      makePanel();
      document.addEventListener('mouseover', onMouseOverCapture, true);
      document.addEventListener('mouseout', onMouseOutCapture, true);
      document.addEventListener('click', onClickCapture, true);
    } else {
      document.removeEventListener('mouseover', onMouseOverCapture, true);
      document.removeEventListener('mouseout', onMouseOutCapture, true);
      document.removeEventListener('click', onClickCapture, true);
      if (panel) { panel.remove(); panel = null; }
      // Limpiar cualquier resaltado que quedara pendiente
      document.querySelectorAll('.dev-highlight').forEach(function (el) { el.classList.remove('dev-highlight'); });
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'F2') { e.preventDefault(); toggle(); }
  });
})();
