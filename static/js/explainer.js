/* The masking explainer: cycles through the inference modes while the figure is on screen. Each mode sets which input tokens are
   masked; the masked ones pass through the network and come out as generated tokens. A click on a mode holds it; a second click on
   the held mode, or a pause, resumes the cycle. Plain script, no network requests. The masks and texts are in the markup
   (data-ex-modes), and the markup already shows the first mode complete, so the figure reads without this script. */
(function () {
  'use strict';
  var STEP = 2800, T_RUN = 420, T_FILL = 1080, HOLD = 9000, STAGGER = 30;

  function all(sel, root) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }

  function init(root) {
    var modes;
    try { modes = JSON.parse(root.getAttribute('data-ex-modes')); } catch (err) { return; }
    if (!modes || !modes.length) { return; }
    var tabs = all('.ex-tab', root), givenEl = root.querySelector('[data-ex-given]'), genEl = root.querySelector('[data-ex-gen]');
    var inP = root.querySelector('.ex-in'), outP = root.querySelector('.ex-out');
    if (!inP || !outP || tabs.length !== modes.length) { return; }
    function cells(panel) { return { props: all('[data-ex-g="props"]', panel), action: all('[data-ex-g="action"]', panel), motion: all('[data-ex-g="motion"]', panel) }; }
    var L = cells(inP), R = cells(outP), endCells = all('[data-ex-g="end"]', root), endLabel = root.querySelector('[data-ex-endlabel]');
    var reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var idx = 0, held = false, inView = false, timers = [], cycleTimer = null, holdTimer = null;

    root.style.setProperty('--ex-step', STEP + 'ms');
    root.classList.add('ex-js');

    function clearSteps() { timers.forEach(clearTimeout); timers = []; }

    /* Draw mode i. animate: the masked tokens go through the network (noise, then values); otherwise the final state at once. */
    function show(i, animate) {
      clearSteps(); idx = i;
      var m = modes[i], pending = [];
      tabs.forEach(function (b, k) { b.classList.toggle('ex-on', k === i); b.setAttribute('aria-pressed', k === i ? 'true' : 'false'); });
      givenEl.textContent = m.given; genEl.textContent = m.gen;
      root.classList.remove('ex-run', 'ex-done');
      function pair(l, r, masked) {
        l.classList.toggle('ex-m', masked);
        r.style.transitionDelay = '0ms';
        r.classList.remove('ex-noise', 'ex-gen', 'ex-wait', 'ex-off');
        r.classList.add(masked ? 'ex-wait' : 'ex-off');
        if (masked) { pending.push(r); }
      }
      L.props.forEach(function (c, k) { pair(c, R.props[k], !!m.props); });
      L.action.forEach(function (c, k) { pair(c, R.action[k], !!m.action); });
      L.motion.forEach(function (c, k) { pair(c, R.motion[k], m.motion.charAt(k) === '1'); });
      endCells.forEach(function (c) { c.classList.toggle('ex-hide', !m.end); });
      if (endLabel) { endLabel.classList.toggle('ex-hide', !m.end); }
      function fill(stagger) {
        root.classList.remove('ex-run'); root.classList.add('ex-done');
        pending.forEach(function (r, k) { r.style.transitionDelay = (stagger ? k * STAGGER : 0) + 'ms'; r.classList.remove('ex-wait', 'ex-noise'); r.classList.add('ex-gen'); });
      }
      if (!animate) { fill(false); return; }
      timers.push(setTimeout(function () {
        root.classList.add('ex-run');
        pending.forEach(function (r) { r.classList.remove('ex-wait'); r.classList.add('ex-noise'); });
      }, T_RUN));
      timers.push(setTimeout(function () { fill(true); }, T_FILL));
    }

    /* The cycle runs only while the figure is on screen, no mode is held and motion is allowed. */
    function schedule() {
      clearTimeout(cycleTimer); cycleTimer = null;
      var auto = inView && !held && !reduced;
      root.classList.toggle('ex-auto', auto);
      if (auto) { cycleTimer = setTimeout(function () { show((idx + 1) % modes.length, true); schedule(); }, STEP); }
    }

    root.querySelector('.ex-tabs').addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('.ex-tab') : null; if (!b) { return; }
      var i = tabs.indexOf(b);
      clearTimeout(holdTimer); holdTimer = null;
      if (held && i === idx) { held = false; show((idx + 1) % modes.length, !reduced); schedule(); return; }   /* second click: resume */
      held = true; show(i, !reduced); schedule();
      if (!reduced) { holdTimer = setTimeout(function () { held = false; schedule(); }, HOLD); }
    });

    show(0, false);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var now = en.isIntersecting;
          if (now === inView) { return; }
          inView = now;
          if (inView && !held && !reduced) { show(idx, true); } else if (!inView) { show(idx, false); }
          schedule();
        });
      }, { threshold: 0.35 }).observe(root);
    } else {
      inView = true; schedule();
    }
  }

  function start() { all('.ex[data-ex-modes]', document).forEach(init); }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', start); } else { start(); }
}());
