/**
 * LARPABLE — Proportional viewport scaling
 *
 * Usage: add data-scale-target="NATURAL_WIDTH" to the central content element.
 * When the viewport is narrower than NATURAL_WIDTH the element scales down
 * uniformly via CSS transform — no text reflow, no horizontal scroll.
 *
 * Works by:
 *  1. Keeping the element at its natural (fixed) width in the layout.
 *  2. Applying transform: scale() so it visually fits the viewport.
 *  3. Collapsing the extra vertical layout space with a negative bottom margin.
 *
 * Pages must set  body { overflow-x: hidden; }  to hide the unscaled overflow.
 */
(function () {
  'use strict';

  var el, NATURAL;

  function rescale() {
    if (!el) return;
    var vw = document.documentElement.clientWidth;

    if (vw < NATURAL) {
      var s = vw / NATURAL;
      el.style.transform = 'scale(' + s + ')';
      el.style.transformOrigin = 'top left';
      el.style.marginLeft = '0';

      // el.offsetHeight is the layout height at the unscaled width.
      // The visual height after scale is h * s, so the layout "wastes"
      // h * (1 - s) pixels of vertical space.  Collapse it.
      var h = el.offsetHeight;
      el.style.marginBottom = '-' + Math.round(h * (1 - s)) + 'px';
    } else {
      el.style.transform = '';
      el.style.transformOrigin = '';
      el.style.marginLeft = '';
      el.style.marginBottom = '';
    }
  }

  function init() {
    el = document.querySelector('[data-scale-target]');
    if (!el) return;
    NATURAL = parseInt(el.getAttribute('data-scale-target'), 10);
    if (!NATURAL) return;
    rescale();
    window.addEventListener('resize', rescale);
  }

  // Run as early as possible (width correction) and again after full load
  // (height correction once images / fonts are in).
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('load', rescale);
})();
