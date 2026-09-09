/**
 * LARPABLE Landing — Dot-art renderer + adaptive text-collision guard
 *
 * Renders the supplied transparent PNGs as halftone dots and shrinks or
 * hides artwork when its actual dots would collide with protected text.
 */
(function () {
  'use strict';

  var PITCH = 4, DEPTH = 7, EDGE = 10, ATHRESH = 0;
  var TAU = Math.PI * 2;
  var TIER_FRAC = [0.08, 0.18, 0.34, 0.52, 0.62];
  var TIER_RADII = TIER_FRAC.map(function (f) { return PITCH * f; });
  var TIER_COUNT = TIER_FRAC.length;
  var GUARD_DEFAULTS = { protect: null, pad: 16, step: 0.9, minWidth: 200 };
  var guards = [];

  function hexRGB(value) {
    var text = String(value || '').trim();
    var number = parseInt(text.charAt(0) === '#' ? text.slice(1) : text, 16);
    return Number.isFinite(number) ? [(number >> 16) & 255, (number >> 8) & 255, number & 255] : [107, 99, 93];
  }

  function buildTiers(image, width, height) {
    var cols = Math.floor((width - 4) / PITCH), rows = Math.floor((height - 4) / PITCH);
    var sample = document.createElement('canvas');
    sample.width = cols; sample.height = rows;
    var sampleContext = sample.getContext('2d', { willReadFrequently: true });
    sampleContext.imageSmoothingEnabled = true;
    sampleContext.imageSmoothingQuality = 'high';
    sampleContext.translate(cols, 0);
    sampleContext.scale(-cols / width, rows / height);
    sampleContext.drawImage(image, 0, 0);
    var pixels = sampleContext.getImageData(0, 0, cols, rows).data;
    var alpha = new Float32Array(cols * rows), tone = new Float32Array(cols * rows);
    for (var row = 0; row < rows; row++) for (var col = 0; col < cols; col++) {
      var index = (row * cols + col) * 4;
      var opacity = pixels[index + 3] / 255;
      var luminance = 255;
      if (opacity > 0) {
        var inverse = 1 / Math.max(opacity, 0.02);
        luminance = 0.299 * pixels[index] * inverse + 0.587 * pixels[index + 1] * inverse + 0.114 * pixels[index + 2] * inverse;
      }
      alpha[row * cols + col] = opacity;
      tone[row * cols + col] = luminance;
    }
    function sampleAlpha(row, col) {
      row = Math.max(0, Math.min(rows - 1, row));
      col = Math.max(0, Math.min(cols - 1, col));
      return alpha[row * cols + col];
    }
    var gamma = 1 + (10 - DEPTH) * 0.28;
    var tiers = [[], [], [], [], []];
    var x0 = (width - (cols - 1) * PITCH) / 2, y0 = (height - (rows - 1) * PITCH) / 2;
    for (row = 0; row < rows; row++) for (col = 0; col < cols; col++) {
      var cell = row * cols + col;
      if (alpha[cell] <= ATHRESH) continue;
      var darkness = Math.max(0, Math.min(1, 1 - tone[cell] / 255));
      var gx = sampleAlpha(row - 1, col + 1) + 2 * sampleAlpha(row, col + 1) + sampleAlpha(row + 1, col + 1) - sampleAlpha(row - 1, col - 1) - 2 * sampleAlpha(row, col - 1) - sampleAlpha(row + 1, col - 1);
      var gy = sampleAlpha(row + 1, col - 1) + 2 * sampleAlpha(row + 1, col) + sampleAlpha(row + 1, col + 1) - sampleAlpha(row - 1, col - 1) - 2 * sampleAlpha(row - 1, col) - sampleAlpha(row - 1, col + 1);
      var edge = Math.min(1, Math.sqrt(gx * gx + gy * gy) / 4);
      var size = Math.pow(darkness, gamma) + (EDGE / 10) * edge;
      var tier = size < 0.08 ? 0 : size < 0.30 ? 1 : size < 0.58 ? 2 : size < 0.86 ? 3 : 4;
      tiers[tier].push(x0 + col * PITCH, y0 + row * PITCH);
    }
    return tiers.map(function (tier) { return new Float32Array(tier); });
  }

  function drawTiers(context, tiers, ink) {
    context.fillStyle = 'rgb(' + ink.join(',') + ')';
    for (var tier = 0; tier < TIER_COUNT; tier++) {
      var dots = tiers[tier], count = dots.length / 2;
      if (!count) continue;
      var radius = TIER_RADII[tier];
      context.beginPath();
      for (var index = 0; index < count; index++) {
        context.moveTo(dots[index * 2] + radius, dots[index * 2 + 1]);
        context.arc(dots[index * 2], dots[index * 2 + 1], radius, 0, TAU);
      }
      context.fill();
    }
  }

  function loadImage(source, callback) {
    if (window.fetch && window.createImageBitmap) {
      fetch(source).then(function (response) { return response.blob(); }).then(function (blob) { return createImageBitmap(blob); }).then(callback).catch(function () {});
      return;
    }
    var image = new Image();
    image.onload = function () { callback(image); };
    image.src = source;
  }

  function circleHitsRect(x, y, radius, rect) {
    var nearestX = x < rect.left ? rect.left : x > rect.right ? rect.right : x;
    var nearestY = y < rect.top ? rect.top : y > rect.bottom ? rect.bottom : y;
    var dx = x - nearestX, dy = y - nearestY;
    return dx * dx + dy * dy <= radius * radius;
  }

  function isFlipped(element) {
    var transform = getComputedStyle(element).transform;
    var match = transform && transform !== 'none' ? /matrix\(([^)]+)\)/.exec(transform) : null;
    return !!match && parseFloat(match[1].split(',')[0]) < 0;
  }

  function protectedRects(figure, options) {
    if (!options.protect) return [];
    var scope = figure.closest('.d-hero, .d-sec') || figure.parentElement;
    if (!scope) return [];
    var elements = scope.querySelectorAll(options.protect), rects = [];
    for (var index = 0; index < elements.length; index++) {
      var rect = elements[index].getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      rects.push({ left: rect.left - options.pad, right: rect.right + options.pad, top: rect.top - options.pad, bottom: rect.bottom + options.pad });
    }
    return rects;
  }

  function hasContact(state, options) {
    if (!state.tiers) return false;
    var canvasRect = state.canvas.getBoundingClientRect();
    if (canvasRect.width < 1 || canvasRect.height < 1) return false;
    var scaleX = canvasRect.width / state.canvas.width, scaleY = canvasRect.height / state.canvas.height;
    var rects = protectedRects(state.figure, options);
    if (!rects.length) return false;
    var flipped = isFlipped(state.figure), radiusScale = Math.max(scaleX, scaleY);
    for (var tier = 0; tier < TIER_COUNT; tier++) {
      var dots = state.tiers[tier], radius = TIER_RADII[tier] * radiusScale;
      for (var index = 0; index < dots.length / 2; index++) {
        var x = dots[index * 2], y = dots[index * 2 + 1];
        var centerX = flipped ? canvasRect.right - x * scaleX : canvasRect.left + x * scaleX;
        var centerY = canvasRect.top + y * scaleY;
        for (var rectIndex = 0; rectIndex < rects.length; rectIndex++) if (circleHitsRect(centerX, centerY, radius, rects[rectIndex])) return true;
      }
    }
    return false;
  }

  function worstCaseContact(state, options) {
    var hero = state.figure.closest('.d-hero');
    if (!hero) return hasContact(state, options);
    var wasCompact = hero.classList.contains('compact'), previousTransition = hero.style.transition;
    hero.style.transition = 'none';
    hero.classList.add('compact');
    var contact = hasContact(state, options);
    if (!wasCompact) hero.classList.remove('compact');
    void hero.offsetHeight;
    hero.style.transition = previousTransition;
    return contact;
  }

  function runGuard(state, options) {
    if (!state.tiers || !state.figure.isConnected) return;
    state.figure.classList.remove('d-art--hidden');
    state.figure.style.width = '';
    if (!worstCaseContact(state, options)) return;
    var width = state.figure.getBoundingClientRect().width;
    while (width > options.minWidth && worstCaseContact(state, options)) {
      width *= options.step;
      state.figure.style.width = width + 'px';
    }
    if (worstCaseContact(state, options)) state.figure.classList.add('d-art--hidden');
  }

  function protectAll() { guards.forEach(function (guard) { runGuard(guard.state, guard.options); }); }

  function setupFigure(figure) {
    var canvas = figure.querySelector('canvas'), source = figure.getAttribute('data-dot-src');
    if (!canvas || !source) return null;
    var options = {
      protect: figure.getAttribute('data-dot-protect') || GUARD_DEFAULTS.protect,
      pad: parseFloat(figure.getAttribute('data-dot-pad')) || GUARD_DEFAULTS.pad,
      step: parseFloat(figure.getAttribute('data-dot-step')) || GUARD_DEFAULTS.step,
      minWidth: parseFloat(figure.getAttribute('data-dot-min-width')) || GUARD_DEFAULTS.minWidth
    };
    var state = { figure: figure, canvas: canvas, tiers: null };
    var context = canvas.getContext('2d'), ink = hexRGB(getComputedStyle(document.documentElement).getPropertyValue('--fg-secondary'));
    loadImage(source, function (image) {
      state.tiers = buildTiers(image, canvas.width, canvas.height);
      drawTiers(context, state.tiers, ink);
      if (figure.classList.contains('d-hero-art')) {
        window._dHeroArtReady = true;
        if (window._dAnimDone || matchMedia('(prefers-reduced-motion: reduce)').matches) figure.classList.add('reveal');
      } else figure.classList.add('show');
      runGuard(state, options);
    });
    return { state: state, options: options };
  }

  function init() {
    document.querySelectorAll('figure[data-dot-src]').forEach(function (figure) {
      var guard = setupFigure(figure);
      if (guard) guards.push(guard);
    });
    if (!guards.length) return;
    var timer;
    addEventListener('resize', function () { clearTimeout(timer); timer = setTimeout(protectAll, 150); }, { passive: true });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(protectAll);
    setTimeout(protectAll, 600); setTimeout(protectAll, 2000);
    document.addEventListener('animationend', function (event) { if (event.target.classList && event.target.classList.contains('d-hero-art')) protectAll(); });
  }

  window.DotArt = { protectAll: protectAll, report: function () { return guards.map(function (guard) { return { id: guard.state.figure.id, width: Math.round(guard.state.figure.getBoundingClientRect().width), inline: guard.state.figure.style.width || '(css)', hidden: guard.state.figure.classList.contains('d-art--hidden'), contacts: guard.state.tiers ? worstCaseContact(guard.state, guard.options) : -1 }; }); } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();