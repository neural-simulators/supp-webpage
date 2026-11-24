/* Supplementary results page: clips that play together, the inference-mode viewer and gallery switches.
   Plain script (no modules, no network requests), so the page works when opened from a folder. */
(function () {
  'use strict';

  var SUPP = window.SUPP || {};
  function all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function make(tag, cls, html) { var e = document.createElement(tag); if (cls) { e.className = cls; } if (html != null) { e.innerHTML = html; } return e; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* ---- Clips of one group start, loop and pause together; they load when the group first comes into view. ---- */
  var groups = [];
  function Group(root) {
    this.root = root; this.visible = false; this.held = false; this.onTime = null;
    var self = this;
    root.addEventListener('click', function (ev) { if (ev.target.closest('button, a, summary')) { return; } self.held = !self.held; self.update(); });
    this.refresh();
  }
  Group.prototype.refresh = function () {
    var self = this;
    this.videos = all('video', this.root);
    this.master = this.videos[0] || null;
    this.videos.forEach(function (v) { v.muted = true; v.playsInline = true; v.loop = false; v.preload = 'none'; });
    if (this.master) {
      this.master.addEventListener('ended', function () { self.restart(); });
      this.master.addEventListener('timeupdate', function () { self.tick(); });
    }
    this.update();
  };
  Group.prototype.load = function () {
    this.videos.forEach(function (v) { if (!v.getAttribute('src') && v.dataset.src) { v.src = v.dataset.src; } });
  };
  Group.prototype.restart = function () {
    this.videos.forEach(function (v) { try { v.currentTime = 0; } catch (e) { /* not loaded yet */ } });
    this.update();
  };
  Group.prototype.tick = function () {
    var m = this.master, t = m.currentTime;
    this.videos.forEach(function (v) { if (v !== m && v.readyState >= 2 && Math.abs(v.currentTime - t) > 0.12) { v.currentTime = t; } });
    if (this.onTime) { this.onTime(t, m.duration || 0); }
  };
  Group.prototype.update = function () {
    var play = this.visible && !this.held;
    if (play) { this.load(); }
    this.videos.forEach(function (v) {
      if (play) { var p = v.play(); if (p && p.catch) { p.catch(function () {}); } } else { v.pause(); }
    });
  };
  function watch(root) { var g = new Group(root); groups.push(g); if (observer) { observer.observe(root); } else { g.visible = true; g.update(); } root._group = g; return g; }
  var observer = ('IntersectionObserver' in window) ? new IntersectionObserver(function (entries) {
    entries.forEach(function (en) { var g = en.target._group; if (g) { g.visible = en.isIntersecting; g.update(); } });
  }, { rootMargin: '150px 0px', threshold: 0.2 }) : null;

  /* ---- Galleries: a switch that swaps the NeuWorld variant of every card, and a filter by kind of motion. ---- */
  function initGalleries() {
    all('[data-variant-switch]').forEach(function (bar) {
      var target = document.getElementById(bar.dataset.variantSwitch);
      bar.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-variant]'); if (!b) { return; }
        all('button', bar).forEach(function (x) { x.classList.toggle('on', x === b); });
        all('video[data-variants]', target).forEach(function (v) {
          var map = JSON.parse(v.dataset.variants), src = map[b.dataset.variant]; if (!src) { return; }
          v.dataset.src = src; if (v.getAttribute('src')) { v.src = src; }
        });
        all('[data-err]', target).forEach(function (e) { var m = JSON.parse(e.dataset.err); e.textContent = m[b.dataset.variant] != null ? m[b.dataset.variant] : ''; });
        all('[data-variant-name]', target).forEach(function (e) { e.textContent = b.dataset.label; });
        all('.sync-group', target).forEach(function (g) { if (g._group) { g._group.restart(); } });
      });
    });
    all('[data-filter-switch]').forEach(function (bar) {
      var target = document.getElementById(bar.dataset.filterSwitch);
      bar.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-filter]'); if (!b) { return; }
        all('button', bar).forEach(function (x) { x.classList.toggle('on', x === b); });
        all('[data-group]', target).forEach(function (c) { c.hidden = b.dataset.filter !== 'all' && c.dataset.group !== b.dataset.filter; });
      });
    });
  }

  /* ---- Inference-mode viewer ---- */
  var VARIANT_LABEL = { reg: 'NeuWorld+Reg', fm: 'NeuWorld+FM', ddpm: 'NeuWorld+DDPM' };
  function initModes() {
    var host = document.getElementById('mode-viewer'), data = SUPP.modes; if (!host || !data) { return; }
    var state = { mode: data.order[0], scene: null, variant: data.default_variant || 'reg' };
    function scenesOf(mode) { return data.scenes.filter(function (s) { return s.modes[mode]; }); }
    function pick(mode) { var list = scenesOf(mode); if (!list.some(function (s) { return s.id === state.scene; })) { state.scene = list.length ? list[0].id : null; } }
    pick(state.mode);

    function facts(rows) {
      return '<div class="mv-facts">' + rows.filter(Boolean).map(function (r) { return '<div><span class="k">' + esc(r[0]) + '</span><span class="' + (r[2] || '') + '">' + r[1] + '</span></div>'; }).join('') + '</div>';
    }
    function vid(src, poster, tag, tagCls) {
      return '<div class="vid"><video data-src="' + esc(src) + '" poster="' + esc(poster) + '" muted playsinline preload="none"></video>' + (tag ? '<span class="vid-tag ' + (tagCls || '') + '">' + esc(tag) + '</span>' : '') + '<div class="vid-cover"></div></div>';
    }
    function img(src, tag) { return '<div class="vid"><img src="' + esc(src) + '" alt="' + esc(tag) + '" loading="lazy"><span class="vid-tag">' + esc(tag) + '</span></div>'; }
    function tok(cls, title, text) { return '<div class="tok ' + cls + '"><small>' + esc(title) + '</small>' + text + '</div>'; }

    function render() {
      var info = data.info[state.mode], scene = data.scenes.filter(function (s) { return s.id === state.scene; })[0];
      var m = scene.modes[state.mode], T = m.seconds, vars = Object.keys(m.variants || {});
      if (vars.length && vars.indexOf(state.variant) < 0) { state.variant = vars[0]; }
      var v = (m.variants || {})[state.variant] || {}, given = m.given || info.given_ranges || [];
      var html = '';
      html += '<div class="mv-bar"><div class="mv-tabs">' + data.order.map(function (k) { return '<button type="button" data-mode="' + k + '" class="' + (k === state.mode ? 'on' : '') + '">' + esc(data.info[k].label) + '</button>'; }).join('') + '</div>';
      html += '<div><span class="seg-label">NeuWorld variant</span><span class="seg">' + ['reg', 'fm', 'ddpm'].filter(function (k) { return vars.indexOf(k) >= 0; }).map(function (k) { return '<button type="button" data-var="' + k + '" class="' + (k === state.variant ? 'on' : '') + '">' + VARIANT_LABEL[k].replace('NeuWorld', '') + '</button>'; }).join('') + '</span></div></div>';
      html += '<p class="mv-what">' + info.what + '</p>';
      /* the token strip: what is given (blue) and what is generated (magenta) */
      html += '<div class="tokens">' + tok('given', 'Scene graph', 'objects, shapes, joints, start state') +
        tok(info.props, 'Properties', info.props === 'given' ? 'mass, friction, restitution' : 'hidden, then inferred') +
        tok(info.action, 'Action', info.action === 'given' ? esc(m.action_given || 'type, object, force, timing') : 'hidden, then inferred') +
        '<div class="tok motion ' + (info.motion === 'given' ? 'given' : (given.length ? 'mixed' : 'gen')) + '"><small>Motion, 0 to ' + T.toFixed(1) + ' s</small>' +
        '<div class="tl" style="' + (info.motion === 'given' ? 'background:var(--given)' : '') + '">' + given.map(function (r) { return '<span class="tl-given" style="left:' + (100 * r[0] / T) + '%;width:' + Math.max(0.8, 100 * (r[1] - r[0]) / T) + '%"></span>'; }).join('') + '<span class="tl-head" style="left:0%"></span></div>' +
        '<div class="tl-times"><span>0 s</span><span>' + T.toFixed(1) + ' s</span></div></div></div>';
      /* three panels */
      var gcol = '', ocol = '', rcol = '';
      if (info.given_view === 'ends') {
        gcol = '<div class="mv-stills">' + img(m.first, 'start state') + img(m.last, 'end state') + '</div>';
      } else if (info.given_view === 'clip') {
        gcol = vid(m.physics, m.first, info.motion === 'given' ? 'observed motion' : 'observed part of the motion');
      } else {
        gcol = img(m.first, 'start state');
      }
      gcol += facts([['Properties', info.props === 'given' ? 'every mass, friction and restitution' : 'not given', info.props === 'given' ? '' : 'q'],
        ['Action', info.action === 'given' ? esc((m.action && m.action['true']) || m.action_given || 'the action program (type, object, force, timing)') : 'not given', info.action === 'given' ? '' : 'q'],
        info.given_note ? ['Motion', info.given_note] : null]);
      if (info.output === 'values') {
        ocol = '<div class="mv-values">' + (m.values_html && m.values_html[state.variant] || '') + '</div>';
      } else {
        ocol = vid(v.video, m.first, VARIANT_LABEL[state.variant], 'tag-ours');
        ocol += facts([info.action !== 'given' && m.action && m.action[state.variant] ? ['Action', esc(m.action[state.variant])] : null,
          v.props_html ? ['Properties', v.props_html] : null,
          v.error_m != null ? ['Error', v.error_m.toFixed(2) + ' m mean distance from PhysX over the generated frames'] : null]);
      }
      rcol = vid(m.physics, m.first, 'PhysX', 'tag-ref') + facts([info.action !== 'given' && m.action && m.action['true'] ? ['Action', esc(m.action['true'])] : null, m.truth_html ? ['Properties', m.truth_html] : null]);
      html += '<div class="mv-cols sync-group">' +
        '<div class="mv-col given"><h4>GIVEN<span>' + esc(info.given_short) + '</span></h4>' + gcol + '</div>' +
        '<div class="mv-col gen"><h4>GENERATED by NeuWorld<span>' + esc(info.gen_short) + '</span></h4>' + ocol + '</div>' +
        '<div class="mv-col ref"><h4>PhysX<span>ground truth, for comparison only</span></h4>' + rcol + '</div></div>';
      html += '<p class="mv-caption"><b>' + esc(scene.title) + '.</b> ' + esc(scene.caption || '') + '</p>';
      var list = scenesOf(state.mode);
      html += '<div class="mv-scenes">' + list.map(function (s) { return '<button type="button" data-scene="' + esc(s.id) + '" class="' + (s.id === state.scene ? 'on' : '') + '"><img src="' + esc(s.modes[state.mode].first) + '" alt="" loading="lazy"><span>' + esc(s.short || s.title) + '</span></button>'; }).join('') + '</div>';
      /* swap the content, keep the observer on the new group */
      all('.sync-group', host).forEach(function (g) { if (observer) { observer.unobserve(g); } if (g._group) { g._group.held = true; g._group.update(); } });
      host.innerHTML = html;
      var groupEl = host.querySelector('.sync-group'), g = watch(groupEl);
      var head = host.querySelector('.tl-head'), cover = host.querySelector('.mv-col.given .vid-cover'), genVid = host.querySelector('.mv-col.gen .vid');
      if (cover) { cover.textContent = 'not shown to the model'; }
      g.onTime = function (t) {
        if (head) { head.style.left = Math.min(100, 100 * t / T) + '%'; }
        var inside = info.motion === 'given' || given.some(function (r) { return t >= r[0] - 0.02 && t <= r[1] + 0.02; });
        if (cover && info.given_view === 'clip') { cover.classList.toggle('on', !inside); }
        if (genVid && info.output !== 'values' && given.length) { genVid.classList.toggle('is-given', inside); genVid.classList.toggle('is-gen', !inside); var tag = genVid.querySelector('.vid-tag'); if (tag) { tag.textContent = VARIANT_LABEL[state.variant] + (inside ? ' · frames copied from the input' : ' · generated'); } }
      };
      var rect = host.getBoundingClientRect(); g.visible = rect.top < window.innerHeight && rect.bottom > 0; g.update();
    }
    host.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) { return; }
      if (b.dataset.mode) { state.mode = b.dataset.mode; pick(state.mode); render(); }
      else if (b.dataset['var']) { state.variant = b.dataset['var']; render(); }
      else if (b.dataset.scene) { state.scene = b.dataset.scene; render(); }
    });
    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    all('.sync-group').forEach(watch);
    initGalleries();
    initModes();
  });
}());
