/* The masking explainer: one test scene seen from the side, one inference mode at a time, chosen by the reader.
   Left: what the network is given (blue) and what is hidden from it (hatched). Right: what it generates (magenta), with the saved
   outputs of the flow-matching model for that mode.
   A run has two parts, in the order of the computation. First the input: an observed part of the motion is played once. Then the ten
   sampling steps: every hidden value (property numbers, the action, and the motion at all of its time steps) starts as noise and moves
   to the output together, drawn on the straight path x = (1 - s) output + s noise with one fixed noise sample, so each step shows a
   cleaner version of the whole answer and step 10 is the complete trajectory. The slider steps through the same states by hand.
   A generated motion is then played once over time, and "Play the motion" plays it again. Plain script, no modules, no network requests. */
(function () {
  'use strict';
  var root = document.getElementById('ex-masking'); if (!root) { return; }
  var D = JSON.parse(root.getAttribute('data-ex')), G = D.geom, N = D.times.length, DUR = D.seconds;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var S = 100, V = G.view, W = (V[1] - V[0]) * S, H = (V[3] - V[2]) * S + 8, NS = 'http://www.w3.org/2000/svg';
  function X(x) { return +((x - V[0]) * S).toFixed(1); }
  function Y(z) { return +((V[3] - z) * S + 3).toFixed(1); }
  function q(sel, el) { return (el || root).querySelector(sel); }
  function all(sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); }
  function card(name) { return q('[data-ex-card="' + name + '"]'); }
  function frameAt(t) { return Math.max(0, Math.min(N - 1, Math.round(t / DUR * (N - 1)))); }
  function sec(x) { return String(Math.round(x * 10) / 10); }
  function mix(a, b, s) { return (1 - s) * a + s * b; }

  /* ---- the side view: floor, ramp, the spring-mounted block, six tiles, the ball, and the ball's path as one dot per 0.1 s ---- */
  function makeView(svg) {
    var tw = G.tile[0] * S, th = G.tile[1] * S, bw = G.bumper[0] * S, bh = G.bumper[1] * S, h = '', k;
    svg.setAttribute('viewBox', '0 0 ' + W.toFixed(0) + ' ' + H.toFixed(0));
    h += '<line class="ex-floor" x1="0" x2="' + W + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
    h += '<polygon class="ex-ramp" points="' + G.ramp.map(function (p) { return X(p[0]) + ',' + Y(p[1]); }).join(' ') + '"/>';
    h += '<g class="ex-dots ex-d-given"></g><g class="ex-dots ex-d-gen"></g><g class="ex-bodies">';
    h += '<rect class="ex-bumper" y="' + (Y(G.bumper[2]) - bh / 2) + '" width="' + bw + '" height="' + bh + '" rx="2"/>';
    for (k = 0; k < 6; k++) { h += '<rect class="ex-tile" x="' + (-tw / 2) + '" y="' + (-th / 2) + '" width="' + tw + '" height="' + th + '" rx="1"/>'; }
    h += '<circle class="ex-ball" r="' + (G.ball_r * S) + '"/></g>';
    svg.innerHTML = h;
    return { svg: svg, ball: q('.ex-ball', svg), bump: q('.ex-bumper', svg), tiles: all('.ex-tile', svg), dg: q('.ex-d-given', svg), dz: q('.ex-d-gen', svg) };
  }
  /* the bodies at frame i of a source; with s > 0 they sit on the straight path between that pose and the noise sample e */
  function pose(v, src, i, s, e) {
    var d = D.src[src], b = d.ball[i]; s = s || 0;
    v.ball.setAttribute('cx', X(s ? mix(b[0], e.ball[0], s) : b[0])); v.ball.setAttribute('cy', Y(s ? mix(b[1], e.ball[1], s) : b[1]));
    v.bump.setAttribute('x', X((s ? mix(d.bumper[i], e.bump, s) : d.bumper[i]) - G.bumper[0] / 2));
    d.tiles[i].forEach(function (t, k) {
      var n = s ? e.tiles[k] : t;
      v.tiles[k].setAttribute('transform', 'translate(' + X(mix(t[0], n[0], s)) + ',' + Y(mix(t[1], n[1], s)) + ') rotate(' + (mix(t[2], n[2], s) * 180 / Math.PI).toFixed(1) + ')');
    });
  }
  function dots(g, src, i0, i1, s, e) {
    var d = D.src[src], n = Math.max(0, i1 - i0 + 1), k, c, p;
    while (g.childNodes.length < n) { c = document.createElementNS(NS, 'circle'); c.setAttribute('r', '1.7'); g.appendChild(c); }
    while (g.childNodes.length > n) { g.removeChild(g.lastChild); }
    for (k = 0; k < n; k++) {
      p = d.ball[i0 + k]; c = g.childNodes[k];
      c.setAttribute('cx', X(s ? mix(p[0], e[i0 + k][0], s) : p[0])); c.setAttribute('cy', Y(s ? mix(p[1], e[i0 + k][1], s) : p[1]));
    }
  }
  function look(v, cls) { v.svg.setAttribute('class', 'ex-v ' + cls); }

  /* ---- cards ---- */
  function head(title, small) { return '<div class="ex-ch"><b>' + title + '</b><small>' + (small || '') + '</small></div>'; }
  function fmt(x) { return x.toFixed(2); }
  function propsTable(vals) {
    var h = '<table class="ex-pt"><thead><tr><th></th><th>mass (kg)</th><th>friction</th><th>restitution</th></tr></thead><tbody>';
    D.props.objects.forEach(function (o, i) {
      h += '<tr><td>' + o + '</td>' + [0, 1, 2].map(function (k) { return '<td data-ex-n="' + i + ',' + k + '">' + (vals ? fmt(vals[i][k]) : '?') + '</td>'; }).join('') + '</tr>';
    });
    return h + '</tbody></table>';
  }
  function actionText(a) {
    return '<p class="ex-at">the gripper pulls with <b data-ex-a="0">' + a[0].toFixed(1) + '</b> N<br>from <b data-ex-a="1">' + fmt(a[1]) + '</b> s to <b data-ex-a="2">' + fmt(a[2]) + '</b> s, then lets go</p>';
  }
  function timeline(spans, kind) {
    var h = '<div class="ex-tl ex-tl-' + kind + '">';
    spans.forEach(function (r) { var w = Math.max(1.4, 100 * (r[1] - r[0]) / DUR); h += '<i style="left:' + Math.min(100 - w, 100 * r[0] / DUR) + '%;width:' + w + '%"></i>'; });
    return h + '<b class="ex-head"></b></div><div class="ex-tt"><span>0 s</span><span>' + DUR + ' s</span></div>';
  }
  function setCard(el, state, html) { el.className = 'ex-card ex-is-' + state; el.innerHTML = html; }
  function spansOf(key) {
    var md = D.modes[key], g = md.given.slice();
    if (!g.length) { g = [[0, 0]]; }
    if (md.end_given) { g.push([DUR, DUR]); }
    return g;
  }
  function inGiven(sp, t) { return sp.some(function (r) { return t >= r[0] - 0.02 && t <= r[1] + 0.02; }); }

  var views = {}, modes = D.order, current = modes[0], runId = 0, raf = null, scrub = q('[data-ex-scrub]'), ctx = null;
  views.scene = makeView(q('[data-ex-view="scene"]')); look(views.scene, 'ex-v-given'); pose(views.scene, 'physx', 0);

  function render(m) {
    var md = D.modes[m.key], sp = spansOf(m.key), g = md.given, motionGen = m.key !== 'property', inText, outText, state;
    if (m.key === 'property') { inText = 'given: 0 to ' + sec(DUR) + ' s'; state = 'given'; }
    else if (!g.length) { inText = md.end_given ? 'hidden; only the start and the end state are given' : 'hidden: 0 to ' + sec(DUR) + ' s'; state = 'hidden'; }
    else if (g.length === 1) { inText = 'given: 0 to ' + sec(g[0][1]) + ' s &middot; hidden: ' + sec(g[0][1]) + ' to ' + sec(DUR) + ' s'; state = 'mixed'; }
    else { inText = 'given: 0 to ' + sec(g[0][1]) + ' s and ' + sec(g[1][0]) + ' to ' + sec(DUR) + ' s &middot; hidden: ' + sec(g[0][1]) + ' to ' + sec(g[1][0]) + ' s'; state = 'mixed'; }
    outText = !motionGen ? 'given, so not generated' : !g.length ? 'generated: 0 to ' + sec(DUR) + ' s, all time steps together' : g.length === 1 ? 'generated: ' + sec(g[0][1]) + ' to ' + sec(DUR) + ' s, all time steps together' : 'generated: ' + sec(g[0][1]) + ' to ' + sec(g[1][0]) + ' s, all time steps together';
    setCard(card('props-in'), m.props ? 'hidden' : 'given', head('Properties', m.props ? 'hidden' : D.props.objects.length + ' of ' + D.counts.movable + ' movable objects') + propsTable(m.props ? null : D.props['true']));
    setCard(card('action-in'), m.action ? 'hidden' : 'given', head('Action', m.action ? 'hidden' : '') + (m.action ? '<p class="ex-at ex-unk">?</p>' : actionText(D.action['true'])));
    setCard(card('motion-in'), state, head('Motion', inText) + '<div class="ex-vw"><svg aria-hidden="true"></svg><div class="ex-cover">hidden from the network</div></div>' + timeline(sp, 'in'));
    setCard(card('props-out'), m.props ? 'gen' : 'off', head('Properties', m.props ? 'generated' : 'given, so not generated') + (m.props ? propsTable(D.props[m.key]) : ''));
    setCard(card('action-out'), m.action ? 'gen' : 'off', head('Action', m.action ? 'generated' : 'given, so not generated') + (m.action ? actionText(D.action.backward) : ''));
    setCard(card('motion-out'), motionGen ? 'gen' : 'off', head('Motion', outText) + (motionGen ? '<div class="ex-vw"><svg aria-hidden="true"></svg><span class="ex-playtag">the generated motion, played back</span></div>' + timeline(sp, 'out') : ''));
    views.min = makeView(q('svg', card('motion-in'))); views.mout = motionGen ? makeView(q('svg', card('motion-out'))) : null;
    q('[data-ex-ask]').textContent = m.ask; q('[data-ex-given]').textContent = m.given; q('[data-ex-gen]').textContent = m.gen;
    all('.ex-tab').forEach(function (b) { var on = b.getAttribute('data-ex-mode') === m.key; b.classList.toggle('ex-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    ctx = context(m);
  }

  /* everything a mode needs to be drawn at any sampling step or time: its spans, its outputs, and one fixed noise sample */
  function context(m) {
    var md = D.modes[m.key], g = md.given, seed = 20261 + m.key.length * 977, c;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    function u(a, b) { return a + (b - a) * rnd(); }
    c = { m: m, md: md, sp: spansOf(m.key), src: md.src, vin: views.min, vout: views.mout, cover: q('.ex-cover', card('motion-in')),
          h0: g.length ? frameAt(g[0][1]) : 0, h1: g.length > 1 ? frameAt(g[1][0]) : N - 1,                 /* the hidden span of the motion, in frames */
          heads: all('.ex-head'), ticks: all('.ex-ticks i'), stepEl: q('[data-ex-step]'),
          nums: all('.ex-is-gen [data-ex-n]'), acts: all('.ex-is-gen [data-ex-a]'), finalP: m.props ? D.props[m.key] : null, finalA: m.action ? D.action.backward : null };
    c.eN = c.nums.map(function (el) { return el.getAttribute('data-ex-n').split(',')[1] === '0' ? u(0.02, 5) : u(0.05, 0.95); });
    c.eA = [u(5, 80), u(0, 1.5), u(0.3, 2.2)];
    c.eB = { ball: [u(-1.2, 1.5), u(0.15, 0.6)], bump: u(-1.1, 1.5), tiles: [0, 1, 2, 3, 4, 5].map(function () { return [u(-1.3, 1.7), u(0.12, 0.5), u(-1.6, 1.6)]; }) };
    c.eD = []; for (var i = 0; i < N; i++) { c.eD.push([u(-1.5, 1.8), u(0.06, 0.68)]); }
    return c;
  }
  function inputRest(c) {                                              /* the motion as the network is given it */
    var k = c.m.key, hasSpan = c.md.given.length > 0;
    if (k === 'property') { showInput(c, N - 1, true); dots(c.vin.dg, 'physx', 0, N - 1); }
    else if (hasSpan) { showInput(c, c.h0, true); dots(c.vin.dg, 'physx', 0, c.h0); }
    else if (c.md.end_given) { showInput(c, N - 1, true); dots(c.vin.dg, 'physx', 0, -1); }
    else { showInput(c, 0, false); dots(c.vin.dg, 'physx', 0, -1); }
  }
  function showInput(c, i, given) { c.cover.classList.toggle('ex-on', !given); look(c.vin, given ? 'ex-v-given' : 'ex-v-none'); if (given) { pose(c.vin, 'physx', i); } }
  /* the output at noise level s (1 = noise, 0 = the output): every hidden value at once, the given ones untouched */
  function drawSigma(c, s) {
    var k = Math.round((1 - s) * 10);
    c.ticks.forEach(function (t, i) { t.classList.toggle('ex-on', i < k); });
    c.stepEl.textContent = 'step ' + k + ' of 10'; scrub.value = k;
    c.nums.forEach(function (el, n) { var ik = el.getAttribute('data-ex-n').split(','); el.textContent = fmt(Math.max(0, mix(c.finalP[+ik[0]][+ik[1]], c.eN[n], s))); });
    c.acts.forEach(function (el) { var a = +el.getAttribute('data-ex-a'), x = Math.max(0, mix(c.finalA[a], c.eA[a], s)); el.textContent = a === 0 ? x.toFixed(1) : fmt(x); });
    root.classList.toggle('ex-noisy', s > 0.001);
    if (c.vout) {
      look(c.vout, 'ex-v-gen'); pose(c.vout, c.src, c.h1, s, c.eB);
      dots(c.vout.dg, c.src, 0, c.h0 > 0 ? c.h0 : -1);
      dots(c.vout.dz, c.src, c.h0 + (c.h0 > 0 ? 1 : 0), c.h1, s, c.eD);
    }
  }
  function stop() { runId++; if (raf) { cancelAnimationFrame(raf); raf = null; } root.classList.remove('ex-running'); root.classList.remove('ex-playing'); if (ctx) { ctx.heads.forEach(function (x) { x.style.opacity = 0; }); } }

  /* a run: the observed motion once (if any), then the ten sampling steps */
  function run(animate) {
    var c = ctx, id, t0 = null, A, B = 3000, k = c.m.key;
    stop(); id = runId;
    if (!animate || reduced) { inputRest(c); drawSigma(c, 0); return; }
    A = k === 'property' ? 1700 : c.md.given.length ? 1300 : 450;      /* time spent on the input before the steps start */
    inputRest(c); drawSigma(c, 1);
    function frame(now) {
      if (id !== runId) { return; }
      if (t0 === null) { t0 = now; }
      var el = now - t0, t, i, uu, kk, f;
      if (el < A) {
        if (A > 500) {                                                 /* the observed part of the motion, played once on the input side */
          t = el / A * DUR; i = frameAt(t);
          c.heads[0].style.opacity = 1; c.heads[0].style.left = (100 * t / DUR) + '%';
          showInput(c, i, k === 'property' || inGiven(c.sp, t));
        }
      } else if (el < A + B) {
        if (!root.classList.contains('ex-running')) { root.classList.add('ex-running'); c.heads[0].style.opacity = 0; inputRest(c); }
        uu = (el - A) / (B / 10); kk = Math.min(9, Math.floor(uu)); f = Math.min(1, (uu - kk) / 0.7); f = f * f * (3 - 2 * f);
        drawSigma(c, Math.max(0, 1 - (kk + f) / 10));                   /* each step moves every hidden value a tenth of the way, then holds */
      } else {                                                         /* step 10: the whole answer is there; a generated motion is then played once */
        root.classList.remove('ex-running'); drawSigma(c, 0);
        if (c.vout) { setTimeout(function () { if (id === runId) { play(); } }, 650); }
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }
  /* the finished motion over time: the given spans on the input side, the generated span on the output side */
  function play() {
    var c = ctx, id, t0 = null, B = 3400, k = c.m.key;
    stop(); id = runId; inputRest(c); drawSigma(c, 0);
    if (reduced) { return; }
    c.heads.forEach(function (x) { x.style.opacity = 1; }); root.classList.add('ex-playing');
    function frame(now) {
      if (id !== runId) { return; }
      if (t0 === null) { t0 = now; }
      var el = now - t0, t = Math.min(DUR, el / B * DUR), i = frameAt(t), given = k === 'property' || inGiven(c.sp, t);
      c.heads.forEach(function (x) { x.style.left = (100 * t / DUR) + '%'; });
      showInput(c, i, given);
      if (c.vout) { look(c.vout, (i <= c.h0 && c.h0 > 0) || i > c.h1 || i === 0 ? 'ex-v-copy' : 'ex-v-gen'); pose(c.vout, c.src, i); }
      if (el >= B) { c.heads.forEach(function (x) { x.style.opacity = 0; }); root.classList.remove('ex-playing'); inputRest(c); drawSigma(c, 0); return; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  function show(key, animate) { current = modes.filter(function (m) { return m.key === key; })[0] || modes[0]; stop(); render(current); run(animate); }
  root.addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) { return; }
    if (b.hasAttribute('data-ex-mode')) { show(b.getAttribute('data-ex-mode'), true); }
    else if (b.hasAttribute('data-ex-replay')) { run(true); }
    else if (b.hasAttribute('data-ex-play')) { play(); }
  });
  scrub.addEventListener('input', function () { stop(); inputRest(ctx); drawSigma(ctx, 1 - (+scrub.value) / 10); });
  show(modes[0].key, false);
  /* the first mode runs once when the figure first comes into view; after that only the reader starts a run */
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) { if (entries[0].isIntersecting) { io.disconnect(); run(true); } }, { threshold: 0.6 });
    io.observe(root);
  }
}());
