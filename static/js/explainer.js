/* The masking explainer: one test scene seen from the side, one inference mode at a time, chosen by the reader.
   Left: what the network is given (blue) and what is hidden from it (hatched). Right: what it generates (magenta), with the saved
   outputs of the flow-matching model for that mode. A mode runs once when it is chosen: ten sampling steps, drawn on the straight
   path from noise to the output, then the motion played once; then it rests. Plain script, no modules, no network requests. */
(function () {
  'use strict';
  var root = document.getElementById('ex-masking'); if (!root) { return; }
  var D = JSON.parse(root.getAttribute('data-ex')), G = D.geom, N = D.times.length, DUR = D.seconds;
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var S = 100, V = G.view, W = (V[1] - V[0]) * S, H = (V[3] - V[2]) * S + 8;
  function X(x) { return +((x - V[0]) * S).toFixed(1); }
  function Y(z) { return +((V[3] - z) * S + 3).toFixed(1); }
  function q(sel, el) { return (el || root).querySelector(sel); }
  function all(sel, el) { return Array.prototype.slice.call((el || root).querySelectorAll(sel)); }
  function card(name) { return q('[data-ex-card="' + name + '"]'); }
  function frameAt(t) { return Math.max(0, Math.min(N - 1, Math.round(t / DUR * (N - 1)))); }
  function sec(x) { return String(Math.round(x * 10) / 10); }

  /* ---- the side view: floor, ramp, the spring-mounted block, six tiles and the ball ---- */
  function makeView(svg) {
    var tw = G.tile[0] * S, th = G.tile[1] * S, bw = G.bumper[0] * S, bh = G.bumper[1] * S, h = '', k;
    svg.setAttribute('viewBox', '0 0 ' + W.toFixed(0) + ' ' + H.toFixed(0));
    h += '<line class="ex-floor" x1="0" x2="' + W + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/>';
    h += '<polygon class="ex-ramp" points="' + G.ramp.map(function (p) { return X(p[0]) + ',' + Y(p[1]); }).join(' ') + '"/>';
    h += '<polyline class="ex-trail ex-t-given" points=""/><polyline class="ex-trail ex-t-gen" points=""/><g class="ex-bodies">';
    h += '<rect class="ex-bumper" y="' + (Y(G.bumper[2]) - bh / 2) + '" width="' + bw + '" height="' + bh + '" rx="2"/>';
    for (k = 0; k < 6; k++) { h += '<rect class="ex-tile" x="' + (-tw / 2) + '" y="' + (-th / 2) + '" width="' + tw + '" height="' + th + '" rx="1"/>'; }
    h += '<circle class="ex-ball" r="' + (G.ball_r * S) + '"/></g>';
    svg.innerHTML = h;
    return { svg: svg, ball: q('.ex-ball', svg), bump: q('.ex-bumper', svg), tiles: all('.ex-tile', svg), tg: q('.ex-t-given', svg), to: q('.ex-t-gen', svg) };
  }
  function pose(v, src, i, amp, rnd) {
    var s = D.src[src], b = s.ball[i];
    function j(f) { return amp ? (rnd() - 0.5) * 2 * amp * f : 0; }
    v.ball.setAttribute('cx', X(b[0] + j(1))); v.ball.setAttribute('cy', Y(Math.max(G.ball_r, b[1] + j(0.5))));
    v.bump.setAttribute('x', X(s.bumper[i] - G.bumper[0] / 2 + j(0.5)));
    s.tiles[i].forEach(function (t, k) {
      v.tiles[k].setAttribute('transform', 'translate(' + X(t[0] + j(0.6)) + ',' + Y(Math.max(0.02, t[1] + j(0.3))) + ') rotate(' + ((t[2] + j(2)) * 180 / Math.PI).toFixed(1) + ')');
    });
  }
  function trail(el, src, i0, i1, amp, rnd) {
    var s = D.src[src], pts = [], i;
    for (i = i0; i <= i1; i++) { pts.push(X(s.ball[i][0] + (amp ? (rnd() - 0.5) * 2 * amp : 0)) + ',' + Y(Math.max(G.ball_r, s.ball[i][1] + (amp ? (rnd() - 0.5) * amp : 0)))); }
    el.setAttribute('points', i1 > i0 ? pts.join(' ') : '');
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

  var views = {}, modes = D.order, current = modes[0], runId = 0, raf = null;
  views.scene = makeView(q('[data-ex-view="scene"]')); look(views.scene, 'ex-v-given'); pose(views.scene, 'physx', 0);

  function render(m) {
    var md = D.modes[m.key], sp = spansOf(m.key), g = md.given, motionGen = m.key !== 'property', inText, outText, state;
    if (m.key === 'property') { inText = 'given: 0 to ' + sec(DUR) + ' s'; state = 'given'; }
    else if (!g.length) { inText = md.end_given ? 'hidden; only the start and the end state are given' : 'hidden: 0 to ' + sec(DUR) + ' s'; state = 'hidden'; }
    else if (g.length === 1) { inText = 'given: 0 to ' + sec(g[0][1]) + ' s &middot; hidden: ' + sec(g[0][1]) + ' to ' + sec(DUR) + ' s'; state = 'mixed'; }
    else { inText = 'given: 0 to ' + sec(g[0][1]) + ' s and ' + sec(g[1][0]) + ' to ' + sec(DUR) + ' s &middot; hidden: ' + sec(g[0][1]) + ' to ' + sec(g[1][0]) + ' s'; state = 'mixed'; }
    outText = !motionGen ? 'given, so not generated' : !g.length ? 'generated: 0 to ' + sec(DUR) + ' s' : g.length === 1 ? 'generated: ' + sec(g[0][1]) + ' to ' + sec(DUR) + ' s' : 'generated: ' + sec(g[0][1]) + ' to ' + sec(g[1][0]) + ' s';
    setCard(card('props-in'), m.props ? 'hidden' : 'given', head('Properties', m.props ? 'hidden' : D.props.objects.length + ' of ' + D.counts.movable + ' movable objects') + propsTable(m.props ? null : D.props['true']));
    setCard(card('action-in'), m.action ? 'hidden' : 'given', head('Action', m.action ? 'hidden' : '') + (m.action ? '<p class="ex-at ex-unk">?</p>' : actionText(D.action['true'])));
    setCard(card('motion-in'), state, head('Motion', inText) + '<div class="ex-vw"><svg aria-hidden="true"></svg><div class="ex-cover">hidden from the network</div></div>' + timeline(sp, 'in'));
    setCard(card('props-out'), m.props ? 'gen' : 'off', head('Properties', m.props ? 'generated' : 'given, so not generated') + (m.props ? propsTable(D.props[m.key]) : ''));
    setCard(card('action-out'), m.action ? 'gen' : 'off', head('Action', m.action ? 'generated' : 'given, so not generated') + (m.action ? actionText(D.action.backward) : ''));
    setCard(card('motion-out'), motionGen ? 'gen' : 'off', head('Motion', outText) + (motionGen ? '<div class="ex-vw"><svg aria-hidden="true"></svg></div>' + timeline(sp, 'out') : ''));
    views.min = makeView(q('svg', card('motion-in'))); views.mout = motionGen ? makeView(q('svg', card('motion-out'))) : null;
    q('[data-ex-ask]').textContent = m.ask; q('[data-ex-given]').textContent = m.given; q('[data-ex-gen]').textContent = m.gen;
    all('.ex-tab').forEach(function (b) { var on = b.getAttribute('data-ex-mode') === m.key; b.classList.toggle('ex-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
  }

  function run(m, animate) {
    var id = ++runId, md = D.modes[m.key], sp = spansOf(m.key), src = md.src, vin = views.min, vout = views.mout, cover = q('.ex-cover', card('motion-in'));
    var g = md.given, h0 = g.length ? frameAt(g[0][1]) : 0, h1 = g.length > 1 ? frameAt(g[1][0]) : N - 1;        /* the hidden span of the motion, in frames */
    var heads = all('.ex-head'), ticks = all('.ex-ticks i'), stepEl = q('[data-ex-step]');
    var nums = all('.ex-is-gen [data-ex-n]'), acts = all('.ex-is-gen [data-ex-a]'), finalP = m.props ? D.props[m.key] : null, finalA = m.action ? D.action.backward : null;
    var seed = 12345; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    if (raf) { cancelAnimationFrame(raf); raf = null; }

    function numbers(tau) {
      nums.forEach(function (el) { var ik = el.getAttribute('data-ex-n').split(','), v = finalP[+ik[0]][+ik[1]]; el.textContent = fmt(Math.max(0, v + (tau ? (rnd() - 0.5) * 2 * tau * (ik[1] === '0' ? Math.max(0.25, 0.6 * v) : 0.45) : 0))); });
      acts.forEach(function (el) { var k = +el.getAttribute('data-ex-a'), v = finalA[k], x = Math.max(0, v + (tau ? (rnd() - 0.5) * 2 * tau * (k === 0 ? 20 : 0.5) : 0)); el.textContent = k === 0 ? x.toFixed(1) : fmt(x); });
    }
    function steps(k) { ticks.forEach(function (t, i) { t.classList.toggle('ex-on', i < k); }); stepEl.textContent = k ? 'step ' + k + ' of 10' : ' '; }
    function inputAt(i, given) {                                       /* the motion as the network sees it at one time */
      cover.classList.toggle('ex-on', !given);
      look(vin, given ? 'ex-v-given' : 'ex-v-none');
      if (given) { pose(vin, 'physx', i); }
      trail(vin.tg, 'physx', 0, Math.min(i, m.key === 'property' ? N - 1 : h0), 0);
    }
    function outputAt(i, amp) {
      if (!vout) { return; }
      var given = i < h0 || (g.length > 1 && i > h1) || (i === 0);
      look(vout, given && !amp ? 'ex-v-copy' : 'ex-v-gen');
      pose(vout, src, i, amp, rnd);
      trail(vout.tg, src, 0, Math.min(i, h0), 0);
      trail(vout.to, src, h0, Math.max(h0, Math.min(i, h1)), amp, rnd);
    }
    function rest() {
      numbers(0); steps(10); stepEl.textContent = '10 sampling steps'; root.classList.remove('ex-running');
      heads.forEach(function (x) { x.style.opacity = 0; });
      if (m.key === 'property') { inputAt(N - 1, true); }
      else if (g.length) { inputAt(h0, true); }
      else if (md.end_given) { inputAt(N - 1, true); vin.tg.setAttribute('points', ''); }
      else { inputAt(0, false); }
      if (vout) { outputAt(h1, 0); look(vout, 'ex-v-gen'); }
    }
    if (!animate || reduced) { rest(); return; }

    var A = 1300, B = 3400, t0 = null, last = -1, playing = false;
    root.classList.add('ex-running');
    if (g.length || md.end_given || m.key === 'property') { inputAt(m.key === 'property' ? N - 1 : md.end_given && !g.length ? N - 1 : h0, true); if (md.end_given && !g.length) { vin.tg.setAttribute('points', ''); } } else { inputAt(0, false); }
    function frame(now) {
      if (id !== runId) { return; }
      if (t0 === null) { t0 = now; }
      var el = now - t0;
      if (el < A) {                                                    /* ten sampling steps: noise to output */
        var k = Math.min(9, Math.floor(el / A * 10));
        if (k !== last) { last = k; var tau = 1 - (k + 1) / 10; steps(k + 1); numbers(tau); outputAt(h1, 0.32 * tau); }
      } else if (el < A + B) {                                         /* the motion, played once */
        if (!playing) { playing = true; numbers(0); steps(10); root.classList.remove('ex-running'); heads.forEach(function (x) { x.style.opacity = 1; }); }
        var t = (el - A) / B * DUR, i = frameAt(t);
        heads.forEach(function (x) { x.style.left = (100 * t / DUR) + '%'; });
        inputAt(i, m.key === 'property' || inGiven(sp, t));
        outputAt(i, 0);
      } else { rest(); return; }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  function show(key, animate) { current = modes.filter(function (m) { return m.key === key; })[0] || modes[0]; render(current); run(current, animate); }
  root.addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) { return; }
    if (b.hasAttribute('data-ex-mode')) { show(b.getAttribute('data-ex-mode'), true); }
    else if (b.hasAttribute('data-ex-replay')) { run(current, true); }
  });
  show(modes[0].key, false);
  /* the first mode runs once when the figure first comes into view; after that only the reader starts a run */
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) { if (entries[0].isIntersecting) { io.disconnect(); run(current, true); } }, { threshold: 0.6 });
    io.observe(root);
  }
}());
