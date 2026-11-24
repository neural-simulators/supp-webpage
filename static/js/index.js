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
    function vid(src, poster, tag, tagCls, ov) {
      return '<div class="vid"><video data-src="' + esc(src) + '" poster="' + esc(poster) + '" muted playsinline preload="none"></video>' + (ov || '') + (tag ? '<span class="vid-tag ' + (tagCls || '') + '">' + esc(tag) + '</span>' : '') + '<div class="vid-cover"></div></div>';
    }
    /* an action drawn on the start frame: a dot on the object it acts on and an arrow along the force or launch direction (normalised image coordinates) */
    function overlay(list, color, timed) {
      if (!list) { return ''; }
      if (!Array.isArray(list)) { list = [list]; }
      var W = 1600, H = 900, out = '<svg class="ov' + (timed ? ' ov-timed' : '') + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">', labels = '';
      list.forEach(function (o) {
        if (!o || !o.point) { return; }
        var x0 = o.point[0] * W, y0 = o.point[1] * H;
        if (o.tip) {
          var x1 = o.tip[0] * W, y1 = o.tip[1] * H, dx = x1 - x0, dy = y1 - y0, n = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / n, uy = dy / n, hl = 60, hw = 30;
          var bx = x1 - ux * hl, by = y1 - uy * hl, head = [x1, y1, bx - uy * hw, by + ux * hw, bx + uy * hw, by - ux * hw].map(function (v) { return v.toFixed(1); });
          out += '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + bx + '" y2="' + by + '" stroke="#fff" stroke-width="27" stroke-linecap="round"/>' +
            '<polygon points="' + head[0] + ',' + head[1] + ' ' + head[2] + ',' + head[3] + ' ' + head[4] + ',' + head[5] + '" fill="' + color + '" stroke="#fff" stroke-width="7" stroke-linejoin="round"/>' +
            '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + bx + '" y2="' + by + '" stroke="' + color + '" stroke-width="16" stroke-linecap="round"/>';
        }
        out += '<circle cx="' + x0 + '" cy="' + y0 + '" r="17" fill="' + color + '" stroke="#fff" stroke-width="7"/>';
        if (o.label) { labels += '<span class="ov-label ' + (o.point[0] < 0.5 ? 'al' : 'ar') + (o.point[1] > 0.78 ? ' up' : '') + (timed ? ' ov-timed' : '') + '" style="left:' + (100 * o.point[0]) + '%;top:' + (100 * o.point[1]) + '%;color:' + color + '">' + esc(o.label) + '</span>'; }
      });
      return out + '</svg>' + labels;
    }
    function img(src, tag, ov) { return '<div class="vid"><img src="' + esc(src) + '" alt="' + esc(tag) + '" loading="lazy">' + (ov || '') + '<span class="vid-tag">' + esc(tag) + '</span></div>'; }
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
      var gcol = '', ocol = '', rcol = '', BLUE = '#2563c9', MAG = '#c2187a', GREY = '#3c4448';
      var ovs = scene.action_overlay || m.action_overlay || null, ovTrue = ovs && (ovs['true'] || (ovs.point ? ovs : null)), ovGen = ovs && ovs[state.variant];
      var actionGiven = info.action === 'given';
      if (info.given_view === 'ends') {
        gcol = '<div class="mv-stills">' + img(m.first, 'start state') + img(m.last, 'end state') + '</div>';
      } else if (info.given_view === 'clip') {
        gcol = vid(m.physics, m.first, info.motion === 'given' ? 'observed motion' : 'observed part of the motion', '', actionGiven ? overlay(ovTrue, BLUE, true) : '');
      } else {
        gcol = img(m.first_plain || m.first, actionGiven ? 'start state and action' : 'start state', actionGiven ? overlay(ovTrue, BLUE, false) : '');
      }
      gcol += facts([['Properties', info.props === 'given' ? 'every mass, friction and restitution' : 'not given', info.props === 'given' ? '' : 'q'],
        ['Action', info.action === 'given' ? esc((m.action && m.action['true']) || m.action_given || 'the action program (type, object, force, timing)') : 'not given', info.action === 'given' ? '' : 'q'],
        info.given_note ? ['Motion', info.given_note] : null]);
      if (info.output === 'values') {
        ocol = '<div class="mv-values">' + (m.values_html && m.values_html[state.variant] || '') + '</div>';
      } else {
        ocol = vid(v.video, m.first, VARIANT_LABEL[state.variant], 'tag-ours', actionGiven ? '' : overlay(ovGen, MAG, true));
        ocol += facts([info.action !== 'given' && m.action && m.action[state.variant] ? ['Action', esc(m.action[state.variant])] : null,
          v.props_html ? ['Properties', v.props_html] : null,
          v.error_m != null ? ['Error', v.error_m.toFixed(2) + ' m mean distance from PhysX over the generated frames'] : null]);
        if (m.values_below && m.values_below[state.variant]) { ocol += '<details class="mv-more" open><summary>Properties it inferred along with the motion</summary><div class="mv-values">' + m.values_below[state.variant] + '</div></details>'; }
      }
      rcol = vid(m.physics, m.first, 'PhysX', 'tag-ref', actionGiven ? '' : overlay(ovTrue, GREY, true)) + facts([info.action !== 'given' && m.action && m.action['true'] ? ['Action', esc(m.action['true'])] : null, m.truth_html ? ['Properties', m.truth_html] : null]);
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
        all('.ov-timed', groupEl).forEach(function (o) { o.style.opacity = t < 1.4 ? 1 : 0; });
        var inside = info.motion === 'given' || given.some(function (r) { return t >= r[0] - 0.02 && t <= r[1] + 0.02; });
        if (cover && info.given_view === 'clip') { cover.classList.toggle('on', !inside); }
        if (genVid && info.output !== 'values' && given.length) { genVid.classList.toggle('is-given', inside); genVid.classList.toggle('is-gen', !inside); var tag = genVid.querySelector('.vid-tag'); if (tag) { tag.textContent = VARIANT_LABEL[state.variant] + (inside ? ' · frames copied from the input' : ' · generated'); } }
      };
      var rect = host.getBoundingClientRect(); g.visible = rect.top < window.innerHeight && rect.bottom > 0; g.update();
    }
    host.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b) { return; }
      if (b.dataset.mode) { state.mode = b.dataset.mode; state.variant = data.info[state.mode].default_variant || data.default_variant || 'reg'; pick(state.mode); render(); }
      else if (b.dataset['var']) { state.variant = b.dataset['var']; render(); }
      else if (b.dataset.scene) { state.scene = b.dataset.scene; render(); }
    });
    render();
  }

  /* ---- Pickers: one row of clips that play together, with a strip of scenes to choose from ---- */
  function initPickers() {
    all('.picker[data-picker]').forEach(function (host) {
      var data = (SUPP.pickers || {})[host.dataset.picker]; if (!data || !data.items.length) { return; }
      var current = data.items[0].id, variant = 'reg';
      function tileHtml(it, t) {
        var ar = it.aspect ? ' style="aspect-ratio:' + esc(it.aspect) + '"' : '';
        var src = t.variants ? (t.variants[variant] || t.variants.reg) : t.src, label = t.variants ? VARIANT_LABEL[t.variants[variant] ? variant : 'reg'] : t.label;
        var note = t.notes ? (t.notes[t.variants && t.variants[variant] ? variant : 'reg'] || '') : (t.note || '');
        return '<div class="pk-tile ' + (t.cls || '') + '"><h4>' + esc(label) + (t.sub ? '<span>' + esc(t.sub) + '</span>' : '') + '</h4><div class="vid"' + ar + '><video data-src="' + esc(src) + '" poster="' + esc(t.poster || it.poster || '') + '" muted playsinline preload="none"></video>' + (t.overlay || '') + '</div>' + (note ? '<p class="pk-note">' + note + '</p>' : '') + '</div>';
      }
      function render() {
        var it = data.items.filter(function (x) { return x.id === current; })[0], n = (it.tiles || []).length;
        if (it.rows) {
          var avail = (data.variants || []).filter(function (k) { return it.rows.every(function (r) { return r.tiles.some(function (t) { return t.variants && t.variants[k]; }); }); });
          if (avail.indexOf(variant) < 0) { variant = 'reg'; }
          var bar = avail.length > 1 ? '<div class="gal-bar" style="justify-content:flex-end;margin-bottom:0.6rem"><div><span class="seg-label">NeuWorld variant</span><span class="seg">' + avail.map(function (k) { return '<button type="button" data-pkvar="' + k + '" class="' + (k === variant ? 'on' : '') + '">' + VARIANT_LABEL[k].replace('NeuWorld', '') + '</button>'; }).join('') + '</span></div></div>' : '';
          var rowsHtml = bar + '<div class="wf sync-group">' + it.rows.map(function (r) {
            return '<div class="wf-row"><div class="wf-text ' + (r.cls || '') + '"><small>' + esc(r.kind || '') + '</small><b>' + esc(r.label) + '</b>' + (r.texts ? (r.texts[variant] || r.texts.reg || '') : (r.text || '')) + '</div>' + r.tiles.map(function (t) { return tileHtml(it, t); }).join('') + '</div>';
          }).join('') + '</div><div class="pk-cap">' + (it.caption || '') + '</div>' + (it.details || '');
          if (data.items.length > 1) { rowsHtml += '<div class="mv-scenes">' + data.items.map(function (x) { return '<button type="button" data-item="' + esc(x.id) + '" class="' + (x.id === current ? 'on' : '') + '"><img src="' + esc(x.thumb) + '" alt="" loading="lazy"><span>' + esc(x.short || x.title) + '</span></button>'; }).join('') + '</div>'; }
          all('.sync-group', host).forEach(function (g) { if (observer) { observer.unobserve(g); } if (g._group) { g._group.held = true; g._group.update(); } });
          host.innerHTML = rowsHtml;
          var gg = watch(host.querySelector('.sync-group')), rr = host.getBoundingClientRect(); gg.visible = rr.top < window.innerHeight && rr.bottom > 0; gg.update();
          var ovs = all('.ov, .ov-label', host); gg.onTime = function (t) { ovs.forEach(function (o) { var a = parseFloat(o.dataset.from || '0'), b = parseFloat(o.dataset.to || '1.4'); o.style.opacity = (t >= a && t < b) ? 1 : 0; }); };
          return;
        }
        var html = '<div class="pk-tiles sync-group" style="--n:' + n + '">' + it.tiles.map(function (t) {
          var ar = it.aspect ? ' style="aspect-ratio:' + esc(it.aspect) + '"' : '';
          var media = t.image ? '<div class="vid"' + ar + '><img src="' + esc(t.image) + '" alt="" loading="lazy"></div>'
            : '<div class="vid"' + ar + '><video data-src="' + esc(t.src) + '" poster="' + esc(t.poster || it.poster || '') + '" muted playsinline preload="none"></video></div>';
          return '<div class="pk-tile ' + (t.cls || '') + '"><h4>' + esc(t.label) + (t.sub ? '<span>' + esc(t.sub) + '</span>' : '') + '</h4>' + media + (t.note ? '<p class="pk-note">' + t.note + '</p>' : '') + '</div>';
        }).join('') + '</div>';
        html += '<div class="pk-cap">' + (it.caption || '') + '</div>' + (it.details || '');
        if (data.items.length > 1) {
          html += '<div class="mv-scenes">' + data.items.map(function (x) { return '<button type="button" data-item="' + esc(x.id) + '" class="' + (x.id === current ? 'on' : '') + '"><img src="' + esc(x.thumb) + '" alt="" loading="lazy"><span>' + esc(x.short || x.title) + '</span></button>'; }).join('') + '</div>';
        }
        all('.sync-group', host).forEach(function (g) { if (observer) { observer.unobserve(g); } if (g._group) { g._group.held = true; g._group.update(); } });
        host.innerHTML = html;
        var g = watch(host.querySelector('.sync-group')), rect = host.getBoundingClientRect(); g.visible = rect.top < window.innerHeight && rect.bottom > 0; g.update();
      }
      host.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-item]'); if (b) { current = b.dataset.item; render(); return; }
        var v = ev.target.closest('button[data-pkvar]'); if (v) { variant = v.dataset.pkvar; render(); }
      });
      render();
    });
  }

  /* ---- Small helpers: tab switches, clips that play under the pointer, the read-out of a line chart ---- */
  function initTabs() {
    all('[data-tabs]').forEach(function (bar) {
      bar.addEventListener('click', function (ev) {
        var b = ev.target.closest('button[data-tab]'); if (!b) { return; }
        all('button[data-tab]', bar).forEach(function (x) { x.classList.toggle('on', x === b); var p = document.getElementById(x.dataset.tab); if (p) { p.hidden = x !== b; } });
      });
    });
  }
  function initToggles() {
    all('[data-toggle-class]').forEach(function (bar) {
      var parts = bar.dataset.toggleClass.split(':'), target = document.getElementById(parts[0]), b = bar.querySelector('button');
      bar.addEventListener('click', function () { var on = target.classList.toggle(parts[1]); b.textContent = on ? b.dataset.on : b.dataset.off; b.classList.toggle('on', on); });
    });
  }
  function initHoverPlay() {
    all('.hover-play').forEach(function (card) {
      var v = card.querySelector('video'); if (!v) { return; }
      function start() { if (!v.getAttribute('src') && v.dataset.src) { v.src = v.dataset.src; } var p = v.play(); if (p && p.catch) { p.catch(function () {}); } }
      card.addEventListener('mouseenter', start);
      card.addEventListener('mouseleave', function () { v.pause(); });
      card.addEventListener('click', function () { if (v.paused) { start(); } else { v.pause(); } });
    });
  }
  function initCharts() {
    all('.chart[data-chart]').forEach(function (host) {
      var d = JSON.parse(host.dataset.chart), svg = host.querySelector('svg'), cross = host.querySelector('.cross'), tip = host.querySelector('.chart-tip');
      svg.addEventListener('mousemove', function (ev) {
        var r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * d.size[0];
        if (x < d.box[0] || x > d.box[2]) { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; return; }
        var t = (x - d.box[0]) / (d.box[2] - d.box[0]) * d.tmax, i = 0, best = 1e9;
        d.t.forEach(function (tt, k) { if (Math.abs(tt - t) < best) { best = Math.abs(tt - t); i = k; } });
        cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
        tip.hidden = false; tip.innerHTML = '<b>' + d.t[i].toFixed(2) + ' s</b>' + d.names.map(function (n, k) { return '<span>' + esc(n) + ': ' + d.v[k][i].toFixed(2) + ' m/s</span>'; }).join('');
        tip.style.left = Math.min(r.width - 190, Math.max(0, ev.clientX - r.left + 12)) + 'px';
      });
      svg.addEventListener('mouseleave', function () { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    all('.sync-group').forEach(watch);
    initGalleries();
    initModes();
    initPickers();
    initTabs();
    initToggles();
    initHoverPlay();
    initCharts();
  });
}());
