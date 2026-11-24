#!/usr/bin/env python3
"""Build index.html of the supplementary page from the manifests in data/ (python3 tools/build.py).

The page is one static file with its data inline, so it opens from a folder without a server and loads nothing from the network.
A section whose manifest is missing is left out. tools/ and data/ are not part of the submitted archive (tools/pack.py).
"""
import html
import json
from pathlib import Path

WEB = Path(__file__).resolve().parents[1]
DATA = WEB/'data'

GROUPS = {
    'Falls, throws and flight': ['balloon', 'drag_wind', 'drop', 'gravity_change', 'orbital', 'projectile', 'rocket', 'spin', 'top'],
    'Slides, rolls and collisions': ['billiards', 'bowling', 'carrying_cart', 'collision', 'granular', 'ramp', 'sliding', 'slip_roll', 'rolling_race', 'circular_track'],
    'Toppling, towers and dominoes': ['cabinet_tip_shed', 'cascade', 'chair_row_domino', 'domino_branch', 'launcher_tower', 'pendulum_jenga', 'pendulum_tower_box', 'rubble', 'table_topple_items', 'topple'],
    'Furniture and catching': ['ball_block_catch', 'books_ball_catch', 'chair_push_table', 'chair_spill', 'chair_throw_table', 'crate_drop_table'],
    'Pendulums, springs and elastic parts': ['coupled_springs', 'diving_board', 'double_pendulum', 'elastic_bridge', 'pendulum', 'pendulum_spring', 'rope_chain', 'trampoline'],
    'Mechanisms': ['catapult', 'composite', 'crank', 'hinge_slider', 'lever', 'opposing_wheels', 'pulley', 'ramp_lever_projectile', 'ramp_spring_domino', 'rotating_apparatus', 'funnel', 'spinning_rod'],
}
GROUP_OF = {f: g for g, fs in GROUPS.items() for f in fs}
BRANCH = {'factual': '', 'counterfactual_gravity': 'gravity changed', 'counterfactual_floor': 'floor friction changed', 'counterfactual_material': 'material changed',
          'counterfactual_shape': 'shape changed', 'counterfactual': 'an object property changed', 'counterfactual_pair': 'two properties changed', 'removal': 'an object is removed during the motion',
          'removal_late': 'an object is removed late in the motion', 'intervention': 'the action changes during the motion', 'intervention_late': 'the action changes late in the motion'}
NOVELTY = {'unseen_room': 'new room', 'unseen_scene': 'new arrangement', 'unseen_structure': 'new structure'}
VARIANT = {'reg': 'NeuWorld+Reg', 'fm': 'NeuWorld+FM', 'ddpm': 'NeuWorld+DDPM'}

# First version: records cut from the existing renders (scripts/supp_webpage/v1_tiles.py). id -> (title, caption)
V1_TEXT = {
    'ramp_spring_domino__r9': ('A ball rolls down a ramp into a row of dominoes', 'An arm releases the ball at the top of the ramp. It rolls down, hits a block, and the row of tiles topples.'),
    'ramp_spring_domino__r53': ('A ball rolls down a ramp into a row of dominoes', 'The ball leaves the ramp, hits a block, and the row of tiles topples one after another.'),
    'rolling_race__r3079': ('Round bodies race down a ramp', 'A sphere, a cylinder and a tube are released together, roll down at different rates and stop at a bar.'),
    'launcher_tower__r112': ('A launcher fires a ball into a tower', 'The ball hits the tower of bricks and topples it.'),
    'books_ball_catch__r1077': ('A ball knocks over a row of books', 'A ball is pushed into books standing on a table. They fall like dominoes.'),
    'books_ball_catch__r1215': ('A ball knocks over books and drops into a box', 'A ball is pushed along a table through a row of books and falls into the box below.'),
    'ball_block_catch__r2106': ('A ball and blocks are pushed off a table', 'The pieces slide off the edge and land in the box below.'),
    'ball_block_catch__r13': ('A ball and a block are pushed off a table', 'Both leave the table edge and land in the box below.'),
    'pendulum_jenga__r43': ('A pendulum strikes a block tower', 'The swinging ball knocks blocks off the tower.'),
    'billiards__r149': ('A cue ball breaks a cluster of balls', 'A tool pushes one ball into the others, and they scatter across the floor.'),
    'billiards__r49': ('A cue ball breaks a cluster of balls', 'A tool pushes one ball into the others, and they scatter across the floor.'),
    'collision__r41': ('Two balls collide', 'One ball is pushed into the other and both roll away.'),
    'ramp__r8': ('A ball rolls down a ramp', 'The ball is released on the ramp and rolls out across the floor.'),
    'trampoline__r4': ('A block lands on a trampoline', 'The block is dropped onto the sprung surface and bounces.'),
    'trampoline__r17': ('A ball bounces off a trampoline', 'The arm drops the ball onto the sprung surface. It bounces off and rolls across the floor.'),
    'funnel__r3116': ('A ball circles in a funnel', 'The ball rolls around the inside of the bowl as it loses speed.'),
    'catapult__r15': ('A catapult flings a block', 'The arm of the catapult swings up and throws its load.'),
    'catapult__r9': ('A catapult flings a ball', 'The arm of the catapult swings up and the ball flies across the room.'),
    'carrying_cart__r0': ('A cart carrying a ball rolls into two blocks', 'The cart is pushed, hits the blocks and stops. The ball stays on the cart.'),
    'pendulum_tower_box__r0': ('A pendulum knocks a tower off a cabinet', 'The swinging ball hits the block tower, and the blocks fall into the box below.'),
    'rubble__r49': ('An arm pulls a piece out of a rubble pile', 'The pile above the piece shifts and settles.'),
}
V1_FORWARD = ['ramp_spring_domino__r9', 'launcher_tower__r112', 'books_ball_catch__r1077', 'rolling_race__r3079', 'ball_block_catch__r2106', 'pendulum_jenga__r43',
              'billiards__r149', 'collision__r41', 'ramp__r8', 'trampoline__r4', 'funnel__r3116', 'catapult__r15']
V1_MODES = {'completion': ['books_ball_catch__r1215', 'trampoline__r17', 'catapult__r9'], 'infilling': ['ramp_spring_domino__r53', 'books_ball_catch__r1215', 'carrying_cart__r0'],
            'backward': ['pendulum_tower_box__r0', 'billiards__r49', 'ball_block_catch__r13', 'rubble__r49'], 'unknown': ['ball_block_catch__r13']}

MODE_INFO = {
    'forward': {'label': 'Forward prediction', 'props': 'given', 'action': 'given', 'motion': 'gen', 'given_view': 'first',
                'what': 'NeuWorld is given the scene graph, <b class="g">every physical property</b> and <b class="g">the action</b>. It <b class="o">generates the whole motion</b>.',
                'given_short': 'scene, properties, action', 'gen_short': 'the whole motion'},
    'unknown': {'label': 'Unknown properties', 'props': 'gen', 'action': 'given', 'motion': 'gen', 'given_view': 'first',
                'what': 'Every mass, friction and restitution is hidden. From the scene graph and <b class="g">the action</b> alone, NeuWorld <b class="o">generates the motion and the hidden properties</b>.',
                'given_short': 'scene and action only', 'gen_short': 'the motion and the properties'},
    'completion': {'label': 'Completion', 'props': 'given', 'action': 'given', 'motion': 'part', 'given_view': 'clip',
                   'what': 'NeuWorld observes <b class="g">the first part of the motion</b> (with the properties and the action) and <b class="o">generates the rest</b>.',
                   'given_short': 'the start of the motion', 'gen_short': 'the rest of the motion'},
    'infilling': {'label': 'Infilling', 'props': 'given', 'action': 'given', 'motion': 'part', 'given_view': 'clip',
                  'what': 'NeuWorld observes <b class="g">the start and the end of the motion</b> and <b class="o">generates the middle</b>.',
                  'given_short': 'both ends of the motion', 'gen_short': 'the middle of the motion'},
    'backward': {'label': 'Backward: what caused this?', 'props': 'given', 'action': 'gen', 'motion': 'part', 'given_view': 'ends',
                 'what': 'NeuWorld is given only <b class="g">the start state and the end state</b>. It <b class="o">generates the action and the motion</b> that connect them.',
                 'given_short': 'start state and end state', 'gen_short': 'the action and the motion'},
}
MODE_INFO['property'] = {'label': 'Property inference', 'props': 'gen', 'action': 'given', 'motion': 'given', 'given_view': 'clip', 'output': 'values',
                         'what': 'NeuWorld observes <b class="g">the whole motion</b> and <b class="g">the action</b>. It <b class="o">infers the mass, friction and restitution</b> of every movable object.',
                         'given_short': 'the action and the whole motion', 'gen_short': 'the physical properties'}
MODE_ORDER = ['forward', 'unknown', 'completion', 'infilling', 'backward', 'property']
SHOW_MODES = {'fwd': 'forward', 'unk100': 'unknown', 'prefix': 'completion', 'bridge': 'infilling', 'cause': 'backward', 'prop': 'property'}


def props_table(rows, total):
    def cell(v, unit=''):
        t, x = v['true'], v['estimate']
        return f'<td><b>{x:.3g}</b>{unit}</td><td class="tr">{t:.3g}{unit}</td>'
    body = ''.join(f'<tr><td>{e(r["object"])}</td>{cell(r["mass_kg"])}{cell(r["friction"])}{cell(r["restitution"])}</tr>' for r in rows)
    more = f'<p class="sp-note">{len(rows)} of {total} movable objects shown.</p>' if total and total > len(rows) else ''
    return ('<table class="props"><thead><tr><th rowspan="2">Object</th><th colspan="2">Mass (kg)</th><th colspan="2">Friction</th><th colspan="2">Restitution</th></tr>'
            '<tr><th>inferred</th><th class="tr">true</th><th>inferred</th><th class="tr">true</th><th>inferred</th><th class="tr">true</th></tr></thead><tbody>' + body + '</tbody></table>' + more)


def showcase_scenes(sc):
    scenes = []
    for r in sc['records']:
        if r.get('role') != 'modes':
            continue
        ph = r['physics']; T = r['duration_s']; ov = r.get('action_overlay') or {}
        scene = {'id': r['id'], 'title': r['family_title'], 'short': r['family_title'], 'caption': f"{r['description']} Test scene ({r['novelty']}), {r['furniture_pieces']} pieces of furniture." if r.get('furniture_pieces') else f"{r['description']} Test scene ({r['novelty']}).",
                 'action_overlay': ov, 'modes': {}}
        for key, m in r['modes'].items():
            name = SHOW_MODES.get(key)
            if not name or not m.get('variants'):
                continue
            out = {'seconds': T, 'physics': ph['video'], 'first': ph['first'], 'last': ph['last'], 'action_given': r['action']['label']}
            if name == 'property':
                out['variants'] = {v: {} for v in m['variants']}
                out['values_html'] = {v: props_table(x['objects'], x.get('objects_total')) for v, x in m['variants'].items()}
            else:
                out['variants'] = {v: {'video': x['video'], 'error_m': x.get('error_m')} for v, x in m['variants'].items()}
                below = {v: props_table(x['properties'], x.get('properties_total')) for v, x in m['variants'].items() if x.get('properties')}
                if below:
                    out['values_below'] = below
            if name in ('completion', 'infilling'):
                out['given'] = m.get('given_s') or []
            if name == 'backward':
                out['given'] = [[0, .06], [T-.06, T]]
                ta = m.get('true_action') or {}
                out['action'] = {'true': ta.get('text') or ta.get('label') or r['action']['label'], **{v: x.get('action_text') for v, x in m['variants'].items() if x.get('action_text')}}
            scene['modes'][name] = out
        if scene['modes']:
            scenes.append(scene)
    return scenes





def e(s):
    return html.escape(str(s), quote=True)


def load(name):
    p = DATA/name
    return json.loads(p.read_text()) if p.exists() else None


def short_id(row):
    root, action, _ = row['record'].split('/')
    return root


def vid(src, poster, tag, cls='', variants=None):
    extra = f" data-variants='{e(json.dumps(variants))}'" if variants else ''
    name = ' data-variant-name' if variants else ''
    return (f'<div class="vid"><video data-src="{e(src)}" poster="{e(poster)}"{extra} muted playsinline preload="none"></video>'
            f'<span class="vid-tag {cls}"{name}>{e(tag)}</span></div>')


def note_of(row):
    parts = [NOVELTY.get(row.get('novelty') or '', 'test scene')]
    if BRANCH.get(row['branch'], row['branch'].startswith('counterfactual') and 'a counterfactual branch' or ''):
        parts.append(BRANCH.get(row['branch'], 'a counterfactual branch'))
    return ' · '.join(parts)


# ---------------------------------------------------------------- sections
def hero(nav):
    links = ''.join(f'<a href="#{k}">{e(v)}</a>' for k, v in nav)
    return f'''<header class="hero sp-hero"><div class="sp-container sp-wide">
<h1 class="title is-1 publication-title">NeuWorld: Neural World Emulator</h1>
<p class="sp-kicker">Supplementary results</p>
<p class="sp-anon">Anonymous CVPR submission</p>
<nav class="sp-links" aria-label="Sections">{links}</nav>
</div></header>'''


def overview():
    return '''<section class="section sp-section" id="overview" style="padding-top:1.2rem"><div class="sp-container sp-text">
<p class="sp-lead">NeuWorld is one network that models physical properties, actions and trajectories of a scene graph together. Hiding a different part of
that input turns the same network into a forward simulator, a tool that infers properties, or an inverse model that finds the action behind an outcome.
This page shows rendered results for the experiments of the paper.</p>
<div class="sp-stats">
<div><b>1</b><span>network answers every inference mode, chosen by which tokens are hidden</span></div>
<div><b>505K</b><span>PhysX simulations from 56 motion families in the training data</span></div>
<div><b>25,413</b><span>test simulations in 822 scenes that never appear in training</span></div>
<div><b>0.10 s</b><span>for one forward prediction of a whole simulation on one GPU</span></div>
</div>
<div class="sp-legend"><span class="chip given">given to NeuWorld</span><span class="chip gen">generated by NeuWorld</span><span class="chip ref">PhysX, the ground-truth simulation</span></div>
<p class="sp-note has-text-centered">Every clip of NeuWorld shows a test scene that was not seen in training. NeuWorld outputs the pose of every object over time, and we render
those poses with the same renderer and camera as the PhysX simulation. Clips play while they are on screen. Click a clip to pause it.</p>
</div></section>'''


def modes_data(v1, showcase):
    scenes = {}
    if v1:
        fwd = {short_id(r): r for r in v1['forward']}
        for r in v1['modes']:
            sid = short_id(r)
            if sid not in V1_MODES.get(r['mode'], []):
                continue
            title, caption = V1_TEXT[sid]
            s = scenes.setdefault(sid, {'id': sid, 'title': title, 'short': title, 'caption': caption + ' ' + note_of(r).capitalize() + '.', 'modes': {}})
            m = {'seconds': r['seconds'], 'physics': r['physics'], 'first': r['first'], 'last': r['last'], 'variants': r['variants']}
            if r['mode'] in ('completion', 'infilling'):
                m['given'] = r['given']
            if r['mode'] == 'backward':
                m['given'] = [[0, .06], [r['seconds']-.06, r['seconds']]]; m['action'] = r.get('action') or {}
            s['modes'][r['mode']] = m
        for sid in ['ramp_spring_domino__r9', 'launcher_tower__r112', 'books_ball_catch__r1077', 'pendulum_jenga__r43']:   # forward mode: scenes of the gallery
            if sid in fwd:
                r = fwd[sid]; title, caption = V1_TEXT[sid]
                s = scenes.setdefault(sid, {'id': sid, 'title': title, 'short': title, 'caption': caption + ' ' + note_of(r).capitalize() + '.', 'modes': {}})
                s['modes']['forward'] = {'seconds': r['seconds'], 'physics': r['physics'], 'first': r['first'], 'last': r['last'], 'variants': r['variants']}
    rank = {sid: i for i, sid in enumerate(['ramp_spring_domino__r9', 'launcher_tower__r112', 'books_ball_catch__r1077', 'pendulum_jenga__r43', *sum(V1_MODES.values(), [])])}
    ordered = sorted(scenes.values(), key=lambda s: rank.get(s['id'], 99))
    if showcase:
        new = showcase_scenes(showcase)
        ordered = new if len(new) >= 6 else new + ordered            # the first-version clips step aside once enough re-rendered scenes exist
        scenes = {s['id']: s for s in ordered}
    order = [m for m in MODE_ORDER if any(m in s['modes'] for s in ordered)]
    return {'order': order, 'info': MODE_INFO, 'default_variant': 'reg', 'scenes': ordered} if ordered else None


def modes_section(md, showcase=None):
    if not md:
        return ''
    spans = ' For completion, the first 30% of the motion is given; for infilling, the first and the last 20%.' if showcase else ''
    return f'''<section class="section sp-section sp-band" id="modes"><div class="sp-container sp-wide">
<h2 class="title is-3 has-text-centered">One network, several inference modes</h2>
<p class="sp-lead">The modes differ only in which tokens are hidden. Pick a mode to see what NeuWorld is given (blue), what it generates (magenta), and the PhysX simulation
of the same scene, which the model never sees. The bar under <i>Motion</i> marks the given and the generated part of the trajectory, with the current time.</p>
<div class="mv" id="mode-viewer"></div>
<p class="sp-note" style="margin-top:0.8rem">The same weights answer every mode. Switch between the three variants of NeuWorld (regression, flow matching, diffusion) with the buttons on the right.
In completion and infilling, the generated clip also shows the given frames, with a blue outline while a frame is copied from the input and a magenta outline while it is generated.{spans}</p>
</div></section>'''


def forward_section(v1, showcase=None):
    if not v1 and not showcase:
        return ''
    rows = {short_id(r): r for r in (v1 or {'forward': []})['forward']}; cards = []; used = []
    recs = [r for r in (showcase or {'records': []})['records'] if r['modes'].get('fwd', {}).get('variants', {}).get('reg')]
    for r in recs:
        f = r['modes']['fwd']['variants']; group = r['group']; used.append(group); ph = r['physics']
        variants = {k: v['video'] for k, v in f.items()}; errs = {k: f"{v['error_m']:.2f} m" for k, v in f.items()}
        note = f"Test scene ({r['novelty']})"
        cards.append(f'''<div class="card-x" data-group="{e(group)}"><div class="pair sync-group">{vid(ph['video'], ph['first'], 'PhysX', 'tag-ref')}{vid(variants['reg'], ph['first'], VARIANT['reg'], 'tag-ours', variants)}</div>
<p class="cap"><b>{e(r['family_title'])}.</b> {e(r['description'])} <span class="m">{e(note)}. Position error <span data-err='{e(json.dumps(errs))}'>{errs['reg']}</span>.</span></p></div>''')
    for sid in ([] if len(recs) >= 10 else V1_FORWARD):
        if sid not in rows:
            continue
        r = rows[sid]; title, caption = V1_TEXT[sid]; group = GROUP_OF.get(r['family'], 'Mechanisms'); used.append(group)
        variants = {k: v['video'] for k, v in r['variants'].items()}; errs = {k: f"{v['error_m']:.2f} m" for k, v in r['variants'].items()}
        cards.append(f'''<div class="card-x" data-group="{e(group)}"><div class="pair sync-group">{vid(r['physics'], r['first'], 'PhysX', 'tag-ref')}{vid(variants['reg'], r['first'], VARIANT['reg'], 'tag-ours', variants)}</div>
<p class="cap"><b>{e(title)}.</b> {e(caption)} <span class="m">{e(note_of(r).capitalize())}. Position error <span data-err='{e(json.dumps(errs))}'>{errs['reg']}</span>.</span></p></div>''')
    groups = [g for g in GROUPS if g in used]
    filt = '<button type="button" data-filter="all" class="on">All</button>' + ''.join(f'<button type="button" data-filter="{e(g)}">{e(g)}</button>' for g in groups)
    var = ''.join('<button type="button" data-variant="%s" data-label="%s" class="%s">%s</button>' % (k, v, 'on' if k == 'reg' else '', v) for k, v in VARIANT.items())
    return f'''<section class="section sp-section" id="forward"><div class="sp-container sp-wide">
<h2 class="title is-3 has-text-centered">Forward prediction in unseen scenes</h2>
<p class="sp-lead">Given the scene graph, the physical properties and the action, NeuWorld predicts the motion of every object in one pass. Each pair shows the PhysX simulation
(left) and NeuWorld (right) on a test scene from a different motion family.</p>
<div class="gal-bar"><div><span class="seg-label">Variant</span><span class="seg" data-variant-switch="fwd-gal">{var}</span></div>
<div><span class="seg-label">Motion</span><span class="seg" data-filter-switch="fwd-gal">{filt}</span></div></div>
<div class="gal" id="fwd-gal">{''.join(cards)}</div>
<p class="sp-note" style="margin-top:0.8rem">Position error is the mean distance between the predicted and the PhysX position of the moving objects, over all time steps of the clip.</p>
</div></section>'''


def table_html(columns, rows, ours=('NeuWorld',)):
    head = ''.join(f'<th>{e(c)}</th>' for c in columns)
    fmt = lambda c: ('%.2f' % c) if isinstance(c, float) else c
    body = ''.join('<tr>' + ''.join('<td>%s</td>' % (('<b>%s</b>' % e(fmt(c))) if str(row[0]).startswith(ours) else e(fmt(c))) for c in row) + '</tr>' for row in rows)
    return f'<div class="sp-table-wrap"><table class="sp-table"><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table></div>'


VDM_TILES = {'physx': ('PhysX', 'ground truth', 'ref'), 'neuworld': ('NeuWorld+Reg', 'input: scene graph and action', 'ours'),
             'wan14b': ('Wan2.2 14B', 'input: first frame and text', ''), 'cosmos14b': ('Cosmos-Predict2.5 14B', 'input: first frame and text', '')}


def vdm_section(d, pickers):
    if not d:
        return ''
    items = []
    for it in d['items']:
        tiles = [{'label': VDM_TILES[t['key']][0], 'sub': VDM_TILES[t['key']][1], 'cls': VDM_TILES[t['key']][2], 'src': t['src'], 'poster': it.get('poster')} for t in it['tiles'] if t['key'] in VDM_TILES]
        cap = (f"<b>{e(it['description'])}</b> <span class=\"m\">Test scene, not seen in training.</span><br>"
               f"<b style=\"color:var(--gen)\">NeuWorld:</b> {e(it['neuworld_note'])} <b>Video models:</b> {e(it['video_model_note'])}")
        same = it.get('prompt_cosmos', it['prompt']) == it['prompt']
        details = ('<details class="sp-more"><summary>What the video models received: the first frame and this prompt</summary>'
                   f'<div style="display:grid;grid-template-columns:minmax(160px,240px) 1fr;gap:0.9rem;align-items:start;margin-top:0.6rem"><div class="vid"><img src="{e(it["first_frame"])}" alt="first frame" loading="lazy"></div>'
                   f'<div><blockquote class="sp-prompt">{e(it["prompt"])}</blockquote>'
                   + ('' if same else f'<p class="sp-note">Cosmos-Predict2.5 received the same prompt with a few words replaced so that it passes the model\'s input filter:</p><blockquote class="sp-prompt">{e(it["prompt_cosmos"])}</blockquote>')
                   + '</div></div></details>')
        title = it['family'].replace('_', ' ')
        items.append({'id': it['id'], 'title': title, 'short': title, 'thumb': it.get('poster') or it['first_frame'], 'poster': it.get('poster'), 'tiles': tiles, 'caption': cap, 'details': details})
    pickers['vdm'] = {'items': items}
    t = d.get('table')
    table = ''
    if t:
        table = (f'<details class="sp-more" open><summary>Measured over 36 test scenes</summary><p class="sp-note" style="margin:0.5rem 0">{e(t["caption"])}</p>'
                 + table_html(t['columns'], t['rows']) + '</details>')
    return f'''<section class="section sp-section" id="video-models"><div class="sp-container sp-wide">
<h2 class="title is-3 has-text-centered">Comparison with video diffusion models</h2>
<p class="sp-lead">Video models take one frame and a sentence, so they get an easier input: the rendered first frame and a prompt that says, in order, what should happen.
NeuWorld gets the scene graph and the action, with no image and no description of the outcome. All four clips of a scene play together.</p>
<div class="picker" data-picker="vdm"></div>
{table}
<p class="sp-note" style="margin-top:0.7rem">The remarks on what each model does are observations by eye. Video-model clips are generated at 16 frames per second and shown at their own clock.</p>
</div></section>'''


def yesno(ok, yes, no):
    return f'<span class="chip {"okc" if ok else "noc"}">{e(yes if ok else no)}</span>'


def vla_section(d, pickers):
    if not d:
        return ''
    tiles_of = {'physx': ('PhysX', 'the recorded motion; its end state is the goal', 'ref'), 'neuworld': ('NeuWorld+Reg', 'forward prediction of the recorded action', 'ours'),
                'pi05': ('π₀.₅-DROID, zero-shot', 'a 30 s attempt, shown at 6x speed', '')}
    items = []
    for it in d['items']:
        tiles = [{'label': tiles_of[t['key']][0], 'sub': tiles_of[t['key']][1], 'cls': tiles_of[t['key']][2], 'src': t['src'], 'poster': it.get('poster')} for t in it['tiles']]
        o = it['outcome']
        cap = (f"<b>{e(it['description'])}</b><br><b>Instruction to the policy</b> <span class=\"m\">({e(it['instruction_kind'])})</span>: \u201c{e(it['instruction'])}\u201d<br>"
               f"<b>What the policy does:</b> {e(it['policy_note'])} {yesno(o['moved_the_acted_object'], 'moves the right object', 'does not move the right object')} {yesno(o['reached_end_state'], 'reaches the end state', 'does not reach the end state')}")
        title = it['family'].replace('_', ' ')
        items.append({'id': it['id'], 'title': title, 'short': title, 'thumb': it['poster'], 'poster': it['poster'], 'tiles': tiles, 'caption': cap})
    pickers['vla'] = {'items': items}
    t = d['table']
    return f'''<h3 class="title is-4 has-text-centered sp-sub">A zero-shot robot policy</h3>
<p class="sp-lead">{e(d['setup'])}</p>
<div class="picker" data-picker="vla"></div>
<details class="sp-more"><summary>All 41 scenes: how often the policy moves the right object and reaches the end state</summary><p class="sp-note" style="margin:0.5rem 0">{e(t['caption'])}</p>{table_html(t['columns'], t['rows'])}</details>
<p class="sp-note" style="margin-top:0.7rem">{e(d['tile_note'])} {e(d['selection_note'])} The remarks on what the policy does are observations by eye.</p>'''


def llm_section(d):
    if not d:
        return ''
    tasks = d['tasks']
    def cell(ans):
        ok = '(correct)' in ans
        return f'<span class="chip {"okc" if ok else "noc"}">{e(ans.replace(" (correct)", "").replace(" (wrong)", ""))}</span>'
    head = '<tr><th></th>' + ''.join(f'<th>{e(t["mode"])}<small>{e(t["condition"])}</small></th>' for t in tasks) + '</tr>'
    rows = '<tr><td class="rowh ref">PhysX<small>ground truth</small></td>' + ''.join(f'<td><div class="vid"><img src="{e(t["frames"]["physx"])}" alt="" loading="lazy"></div><div class="ans">{e(t["physx"])}</div></td>' for t in tasks) + '</tr>'
    rows += '<tr><td class="rowh ours">NeuWorld+Reg<small>scene graph and action</small></td>' + ''.join(f'<td><div class="vid"><img src="{e(t["frames"]["neuworld"])}" alt="" loading="lazy"></div><div class="ans">{cell(t["neuworld_reg"])}</div></td>' for t in tasks) + '</tr>'
    for key, name in (('claude_opus_5_5', 'Claude Opus 5.5'), ('claude_fable_5_2', 'Claude Fable 5.2')):
        rows += f'<tr><td class="rowh">{name}<small>scene graph as text, two calls</small></td>' + ''.join('<td><div class="ans">' + ' '.join(cell(x) for x in t[key]) + '</div></td>' for t in tasks) + '</tr>'
    sc = d['score']; pl = d['planner']
    prompts = ''.join(f'<p class="sp-note" style="margin-top:0.5rem"><b>{e(k)}</b></p><blockquote class="sp-prompt" style="white-space:pre-wrap">{e(v)}</blockquote>' for k, v in d['prompts'].items())
    return f'''<h3 class="title is-4 has-text-centered sp-sub">Language models reading the same scene graph</h3>
<p class="sp-lead">{e(d['scene'])}</p>
<div class="sp-table-wrap"><table class="llm-grid"><thead>{head}</thead><tbody>{rows}</tbody></table></div>
<p class="sp-note has-text-centered" style="margin-top:0.6rem">Correct: NeuWorld+Reg {e(sc['neuworld_reg'])}, Claude Opus 5.5 {e(sc['claude_opus_5_5'])}, Claude Fable 5.2 {e(sc['claude_fable_5_2'])}. Frames show the end of each motion.
{e(d['inputs']['language_models'])}</p>
<details class="sp-more"><summary>The prompts sent to the language models</summary>{prompts}</details>
<h3 class="title is-4 has-text-centered sp-sub">A planner that tests its actions before acting</h3>
<p class="sp-lead">{e(pl['text'])}</p>
<details class="sp-more"><summary>Planner results on the 206 tasks</summary><p class="sp-note" style="margin:0.5rem 0">{e(pl['table']['caption'])}</p>{table_html(pl['table']['columns'], pl['table']['rows'], ours=('Claude Opus 5.5, tries predicted by NeuWorld',))}</details>'''


def others_section(llm, vla, pickers):
    a, b = llm_section(llm), vla_section(vla, pickers)
    if not (a or b):
        return ''
    return f'''<section class="section sp-section sp-band" id="llm-vla"><div class="sp-container sp-wide">
<h2 class="title is-3 has-text-centered">Comparison with language models and a robot policy</h2>
{a}{b}
</div></section>'''


def twins_section(d, pickers):
    if not d:
        return ''
    items = []
    for it in d['items']:
        n = it['numbers']; model = it['model']
        tiles = [{'label': 'PhysX', 'sub': 'ground truth', 'cls': 'ref', 'src': it['tiles'][0]['src'], 'poster': it.get('poster')},
                 {'label': model.split(',')[0], 'sub': model.split(',', 1)[1].strip() if ',' in model else '', 'cls': 'ours', 'src': it['tiles'][1]['src'], 'poster': it.get('poster')}]
        cap = (f"<b>{e(it['description'])}</b> <span class=\"m\">{e(it['place'][0].upper() + it['place'][1:])}, never used in training.</span><br>"
               f"Position error {n['neuworld_position_error_m']:.2f} m, against {n['no_motion_error_m']:.2f} m for a prediction in which nothing moves.")
        title = it['place'].split(' (')[0]
        items.append({'id': it['id'], 'title': title, 'short': title[0].upper() + title[1:], 'thumb': it['poster'], 'poster': it['poster'], 'tiles': tiles, 'caption': cap, 'aspect': '%d / %d' % tuple(it['size'])})
    pickers['twins'] = {'items': items}
    fig = d.get('pipeline_figure')
    figure = f'<details class="sp-more"><summary>How a scan becomes a simulation-ready scene</summary><img src="{e(fig["src"])}" alt="" loading="lazy" style="width:100%;margin-top:0.6rem;border-radius:8px"><p class="sp-note">{e(fig["caption"])}</p></details>' if fig else ''
    pf = d.get('paper_figure_frames'); frames = ''
    if pf:
        blocks = ''
        for sc in pf['scenes']:
            head = '<div></div>' + ''.join('<div class="kf-t">%.1f s</div>' % t for t in sc['times_s'])
            rows = ''.join('<div class="kf-l">%s</div>' % e(r['label'].split(',')[0].replace(' (ground truth)', '').replace(' (ours)', '')) + ''.join(f'<div class="vid" style="aspect-ratio:auto"><img src="{e(f)}" alt="" loading="lazy" style="height:auto"></div>' for f in r['frames']) for r in sc['rows'])
            blocks += f'<div><p class="cap" style="margin:0 0 0.4rem"><b>{e(sc["title"])}</b></p><div class="kf" style="--n:{len(sc["times_s"])}">{head}{rows}</div></div>'
        frames = f'<details class="sp-more" open><summary>Key frames in two scanned rooms</summary><div class="kf-wrap">{blocks}</div><p class="sp-note">{e(pf["caption"])} NeuWorld+Reg is fine-tuned here for 14,000 updates on simulations that resemble scanned rooms.</p></details>'
    return f'''<section class="section sp-section" id="twins"><div class="sp-container sp-wide">
<h2 class="title is-3 has-text-centered">Scans of real rooms</h2>
<p class="sp-lead">{e(d['setup'])}</p>
<div class="picker" data-picker="twins" style="max-width:1000px;margin-inline:auto"></div>
{frames}
{figure}
<p class="sp-note" style="margin-top:0.7rem">{e(d['headline']['text'])} The clips are chosen among the simulations where NeuWorld follows PhysX. The model shown is named above each clip.
The view is from above the cut walls, with the scan as background and each scanned object as its textured mesh.</p>
</div></section>'''


def overlay_svg(items, color='#2563c9'):
    """An action drawn on a start frame (the same drawing as the page script's overlay): a dot on the acted object, an arrow along the force or launch direction."""
    W, H = 1600, 900; out = f'<svg class="ov" viewBox="0 0 {W} {H}" preserveAspectRatio="none" aria-hidden="true">'; labels = ''
    for o in items or []:
        if not o or not o.get('point'):
            continue
        x0, y0 = o['point'][0]*W, o['point'][1]*H
        if o.get('tip'):
            x1, y1 = o['tip'][0]*W, o['tip'][1]*H; dx, dy = x1-x0, y1-y0; n = (dx*dx+dy*dy)**.5 or 1.; ux, uy = dx/n, dy/n; hl, hw = 46, 22
            bx, by = x1-ux*hl, y1-uy*hl
            out += (f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{bx:.1f}" y2="{by:.1f}" stroke="#fff" stroke-width="20" stroke-linecap="round"/>'
                    f'<polygon points="{x1:.1f},{y1:.1f} {bx-uy*hw:.1f},{by+ux*hw:.1f} {bx+uy*hw:.1f},{by-ux*hw:.1f}" fill="{color}" stroke="#fff" stroke-width="7" stroke-linejoin="round"/>'
                    f'<line x1="{x0:.1f}" y1="{y0:.1f}" x2="{bx:.1f}" y2="{by:.1f}" stroke="{color}" stroke-width="11" stroke-linecap="round"/>')
        out += f'<circle cx="{x0:.1f}" cy="{y0:.1f}" r="13" fill="{color}" stroke="#fff" stroke-width="6"/>'
        if o.get('label'):
            cls = ('al' if o['point'][0] < .5 else 'ar') + (' up' if o['point'][1] > .78 else '')
            labels += f'<span class="ov-label {cls}" style="left:{o["point"][0]*100:.1f}%;top:{o["point"][1]*100:.1f}%;color:{color}">{e(o["label"])}</span>'
    return out + '</svg>' + labels


SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100']   # categorical slots 1 to 4 of the chart palette, in fixed order


def speed_chart(traj, key):
    """Speed of the bodies that travel farthest, as thin lines over time (one axis, legend with line keys, hover read-out added by the page script)."""
    t = traj['series']['time_s']; bodies = []
    for b in traj['series']['bodies']:
        if 'speed_m_s' in b:
            v = b['speed_m_s']
        else:
            x, y, z = b['x_m'], b['y_m'], b['z_m']
            v = [0.] + [(((x[i]-x[i-1])**2+(y[i]-y[i-1])**2+(z[i]-z[i-1])**2)**.5)/max(t[i]-t[i-1], 1e-9) for i in range(1, len(t))]
        travel = sum(vv*(t[i]-t[i-1]) for i, vv in enumerate(v) if i)
        bodies.append((travel, b['name'], v))
    bodies = [b for b in sorted(bodies, key=lambda r: -r[0]) if b[0] > .02][:4]
    if not bodies:
        return ''
    W, H, L, R, T, B = 640, 250, 46, 12, 12, 34; vmax = max(max(b[2]) for b in bodies) or 1.; step = next(s for s in (.25, .5, 1, 2, 5, 10) if vmax/s <= 5); top = step*int(vmax/step+1)
    X = lambda v: L+(W-L-R)*v/t[-1]; Y = lambda v: T+(H-T-B)*(1-v/top)
    grid = ''.join(f'<line x1="{L}" x2="{W-R}" y1="{Y(k*step):.1f}" y2="{Y(k*step):.1f}" stroke="#e3e6e8" stroke-width="1"/><text x="{L-6}" y="{Y(k*step)+4:.1f}" text-anchor="end" class="ax">{k*step:g}</text>' for k in range(int(top/step)+1))
    ticks = ''.join(f'<text x="{X(k):.1f}" y="{H-B+16}" text-anchor="middle" class="ax">{k:g}</text>' for k in range(int(t[-1])+1))
    lines = ''.join(f'<polyline fill="none" stroke="{SERIES[i]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" points="{" ".join("%.1f,%.1f" % (X(tt), Y(vv)) for tt, vv in zip(t, b[2]))}"/>' for i, b in enumerate(bodies))
    legend = ''.join(f'<span><i style="background:{SERIES[i]}"></i>{e(b[1])}</span>' for i, b in enumerate(bodies))
    data = e(json.dumps({'t': t, 'names': [b[1] for b in bodies], 'v': [[round(x, 3) for x in b[2]] for b in bodies], 'box': [L, T, W-R, H-B], 'tmax': t[-1], 'size': [W, H]}))
    return (f'<div class="chart" data-chart=\'{data}\'><div class="chart-legend">{legend}</div><svg viewBox="0 0 {W} {H}" role="img" aria-label="Speed over time">{grid}{ticks}'
            f'<text x="{(L+W-R)/2:.0f}" y="{H-2}" text-anchor="middle" class="ax">time (s)</text><text x="12" y="{(T+H-B)/2:.0f}" text-anchor="middle" class="ax" transform="rotate(-90 12 {(T+H-B)/2:.0f})">speed (m/s)</text>{lines}'
            f'<line class="cross" x1="0" x2="0" y1="{T}" y2="{H-B}" stroke="#5f6b70" stroke-width="1" visibility="hidden"/></svg><div class="chart-tip" hidden></div>'
            f'<p class="sp-note">Speed of the {len(bodies)} bodies that travel farthest, from the saved states (plotted at {traj["plotted_rate_hz"]:g} Hz; stored at {traj["saved_rate_hz"]} Hz).</p></div>')


def kv(rows):
    return '<table class="sp-kv">' + ''.join(f'<tr><th>{e(k)}</th><td>{e(v)}</td></tr>' for k, v in rows) + '</table>'


CHANNELS = [('rgb', 'RGB', 'colour image'), ('depth', 'Depth', 'metres along the optical axis; near is warm'), ('instances', 'Instance masks', 'one colour per movable body'),
            ('optical_flow', 'Optical flow', 'pixels per frame; hue is direction, saturation is magnitude'), ('scene_flow', 'Scene flow', 'metres per frame in the world; red x, green y, blue z')]


def record_block(r):
    sg = r['scene_graph']; g = sg['global']; clip = r['clip']
    movable = '<div class="sp-table-wrap"><table class="sp-table small"><thead><tr><th>Object</th><th>Shape</th><th>Material</th><th>Mass (kg)</th><th>Friction</th><th>Restitution</th></tr></thead><tbody>' + ''.join(
        f'<tr><td>{e(o["name"])}</td><td>{e(o["shape"])}</td><td>{e(o.get("material", ""))}</td><td>{o["mass_kg"]:g}</td><td>{o["friction"]:g}</td><td>{o["restitution"]:g}</td></tr>' for o in sg['movable']) + '</tbody></table></div>'
    furniture = ', '.join(f'{n} {k.replace("_", " ")}' for k, n in sg['furniture'].items()) if isinstance(sg['furniture'], dict) else ''
    joints = '; '.join(f'{j["type"]} joint {j["body0"]} to {j["body1"]}' + (f' (stiffness {j["stiffness"]:g}, damping {j["damping"]:g})' if j.get('stiffness') else '') for j in sg['joints'])
    glob = kv([('Gravity', f'{g["gravity_m_s2"]} m/s\u00b2'), ('Floor', f'friction {g["floor_friction"]:g}, restitution {g["floor_restitution"]:g}'), ('Rates', f'solver {g["solver_rate_hz"]} Hz, states saved at {g["saved_rate_hz"]} Hz, {g["horizon_s"]:g} s'),
               ('Room', f'{g.get("room_type", "room")}, {g["room_size_m"][0]:g} x {g["room_size_m"][1]:g} m, with {furniture}' if furniture else str(g.get('room_type', ''))), ('Joints', joints or 'none')])
    prog = r['action'].get('program') or {}
    action = kv([('In words', r['action']['semantic_action']), *[(k.replace('_', ' '), json.dumps(v) if isinstance(v, (list, dict)) else str(v)) for k, v in prog.items() if k != 'semantic_action'],
                 *([('Stated change of this branch', r['action']['stated_change'])] if r['action'].get('stated_change') else [])])
    events = '<ol class="ev">' + ''.join(f'<li><b>{ev["time_s"]:.2f} s</b> {e(ev["text"])}</li>' for ev in r['events']['timeline']) + '</ol>'
    qa = r['qa']
    qa_html = ('<p class="sp-note"><b>Measured on this run</b></p><ul class="qa">' + ''.join(f'<li><span>{e(q["question"])}</span><b>{e(q["answer"])}</b></li>' for q in qa['measured']) + '</ul>'
               + '<p class="sp-note"><b>Comparing this run with another branch of the same action</b></p><ul class="qa">' + ''.join(f'<li><span>{e(q["question"])}</span><b>{e(q["answer"])}</b></li>' for q in qa['comparative'][:4]) + '</ul>'
               + '<p class="sp-note"><b>About the actions of the scene</b></p><ul class="qa">' + ''.join(f'<li><span>{e(q["question"])}</span><b>{e(q["answer"])}</b></li>' for q in qa['scene_bank'][:3]) + '</ul>'
               + f'<p class="sp-note">{e(qa["note"])}</p>')
    keys = []
    for b in r['branches']:
        keys += [k for k in b['measured'] if k not in keys]
    keys = keys[:4]
    branches = '<div class="sp-table-wrap"><table class="sp-table small"><thead><tr><th>Stated change</th>' + ''.join(f'<th>{e(k.replace("_", " "))}</th>' for k in keys) + '</tr></thead><tbody>' + ''.join(
        '<tr><td>%s</td>%s</tr>' % (e(b['stated_change']), ''.join(f'<td>{e(b["measured"].get(k, ""))}</td>' for k in keys)) for b in r['branches']) + '</tbody></table></div>'
    files = ''.join(f'<p class="sp-note" style="margin-top:0.5rem"><b>{e(k)}</b></p><pre class="sp-code">{e(v)}</pre>' for k, v in r['excerpts'].items())
    n_ev = dict(r['facts']).get('Timed events', len(r['events']['timeline']))
    return f'''<div class="rec">
<div class="rec-left">
<div class="vid"><img src="{e(clip['start_frame'])}" alt="start frame" loading="lazy">{overlay_svg(r.get('action_overlay'))}<span class="vid-tag">start state and action</span></div>
<div class="sync-group" style="margin-top:0.6rem"><div class="vid"><video data-src="{e(clip['file'])}" poster="{e(clip['poster'])}" muted playsinline preload="none"></video><span class="vid-tag tag-ref">PhysX simulation</span></div></div>
<p class="cap" style="margin-top:0.6rem">{e(r['summary'])}</p>
</div>
<div class="rec-right">
<details class="sp-more" open><summary>What this record stores</summary>{kv(r['facts'])}</details>
<details class="sp-more"><summary>Scene graph: objects, properties, joints, global settings</summary>{movable}{glob}</details>
<details class="sp-more"><summary>Action program</summary>{action}</details>
<details class="sp-more"><summary>Timed events ({e(n_ev)} in this record; the first {len(r['events']['timeline'])} shown)</summary>{events}</details>
<details class="sp-more"><summary>Trajectory of every object</summary>{speed_chart(r['trajectory'], r['key'])}<p class="sp-note">{e(r['excerpts'].get('trajectory.npz', ''))}</p></details>
<details class="sp-more" open><summary>Question-answer pairs</summary>{qa_html}</details>
<details class="sp-more"><summary>Counterfactual branches of this action ({len(r['branches'])})</summary>{branches}</details>
<details class="sp-more"><summary>Excerpts of the record's files</summary>{files}</details>
</div></div>'''


def dataset_section(d, pickers):
    if not d:
        return ''
    groups = [g for g in GROUPS if any(c['group'] == g for c in d['gallery'])]
    filt = '<button type="button" data-filter="all" class="on">All</button>' + ''.join(f'<button type="button" data-filter="{e(g)}">{e(g)}</button>' for g in groups)
    cards = ''.join(f'''<div class="dcard hover-play" data-group="{e(c['group'])}"><div class="vid"><video data-src="{e(c['file'])}" poster="{e(c['poster'])}" muted playsinline loop preload="none"></video></div>
<p><b>{e(c['family'].replace('_', ' '))}</b> {e(c['description'])}</p></div>''' for c in d['gallery'])
    tabs = ''.join('<button type="button" data-tab="rec-%s" class="%s">%s</button>' % (r['key'], 'on' if i == 0 else '', e(r['title'])) for i, r in enumerate(d['records']))
    panels = ''.join('<div class="tab-panel" id="rec-%s"%s>%s</div>' % (r['key'], '' if i == 0 else ' hidden', record_block(r)) for i, r in enumerate(d['records']))
    cf = []
    for c in d['counterfactual_sets']:
        tiles = [{'label': x['stated_change'][0].upper() + x['stated_change'][1:], 'sub': 'the recorded run' if x['branch'] == 'factual' else 'a counterfactual branch of the same action', 'src': x['file'], 'poster': x['poster'],
                  'cls': 'ref' if x['branch'] == 'factual' else 'given', 'note': '; '.join(f'{e(k.replace("_", " "))}: <b>{e(v)}</b>' for k, v in x['measured'].items())} for x in c['clips']]
        cf.append({'id': c['key'], 'title': c['title'], 'short': c['title'].split(':')[0], 'thumb': c['clips'][0]['poster'], 'tiles': tiles, 'caption': f"<b>{e(c['title'])}.</b> {e(c['summary'])}"})
    pickers['cf'] = {'items': cf}
    ch = []
    for c in d['channels']['records']:
        tiles = [{'label': label, 'sub': sub, 'src': c['tiles'][k]['file'], 'poster': c['tiles'][k]['poster']} for k, label, sub in CHANNELS if k in c['tiles']]
        dep = c['channels'].get('depth', {}); of = c['channels'].get('optical_flow', {}); sf = c['channels'].get('scene_flow', {})
        cap = (f"<b>{e(c['title'])}.</b> <span class=\"m\">Depth is shown from {dep.get('near_m', 0):g} m to {dep.get('far_m', 0):g} m. Optical flow saturates at {of.get('saturates_at_px_per_frame', 0):.0f} pixels per frame, "
               f"scene flow at {sf.get('saturates_at_m_per_s', 0):.1f} m/s.</span>")
        ch.append({'id': c['key'], 'title': c['title'], 'short': c['family'].replace('_', ' '), 'thumb': c['tiles']['rgb']['poster'], 'tiles': tiles, 'caption': cap})
    pickers['channels'] = {'items': ch}
    return f'''<section class="section sp-section" id="dataset"><div class="sp-container sp-wide">
<h2 class="title is-3 has-text-centered">The dataset</h2>
<p class="sp-lead">We train on 505,827 PhysX simulations from 56 motion families, split by scene. Each record stores the scene graph, the action, the state of every object at 120 Hz
and timed contact events. Images, depth, masks and flow are rendered from the saved states when needed.</p>
<details class="sp-more"><summary>The dataset in numbers</summary>{kv(d['numbers']['rows'])}</details>
<details class="sp-more"><summary>Every attribute of the scene graph, the start state and the actions</summary>{kv(d['attributes']['rows'])}</details>
<h3 class="title is-4 has-text-centered sp-sub">Motion families</h3>
<p class="sp-lead">{e(d['gallery_note'])} Move the pointer over a clip to play it.</p>
<div class="gal-bar"><div><span class="seg-label">Motion</span><span class="seg" data-filter-switch="ds-gal">{filt}</span></div></div>
<div class="dgal" id="ds-gal">{cards}</div>
<h3 class="title is-4 has-text-centered sp-sub">One record, everything it stores</h3>
<p class="sp-lead">Three records, opened up. The arrow or dot on the start frame marks the action. Every value below is read from the files of the record.</p>
<div class="gal-bar"><span class="seg" data-tabs>{tabs}</span></div>
{panels}
<h3 class="title is-4 has-text-centered sp-sub">Counterfactual branches</h3>
<p class="sp-lead">Each action of a scene is simulated again under stated changes: a property, a material, a shape, the floor, gravity, a removed object, or a change during the motion.
The answers under each clip are measured from that run.</p>
<div class="picker" data-picker="cf" style="max-width:1100px;margin-inline:auto"></div>
<h3 class="title is-4 has-text-centered sp-sub">Rendered channels</h3>
<p class="sp-lead">RGB, depth, instance masks, optical flow and scene flow of the same saved states, from one camera. They are rendered on demand, without running the physics again.</p>
<div class="picker" data-picker="channels"></div>
<p class="sp-note" style="margin-top:0.7rem">{e(d['channels']['note'])}</p>
</div></section>'''


RESULTS = [  # tables/main_results.tex of the paper: families-equal means over the 25,413 test simulations
    ('Forward (constant velocity: 0.836 m)', [('GNS', '0.157', '24.9*', '0.218', '1.24', '6.0%*', '1.7*', '0.4*', '1.3'), ('NeuWorld+FM', '0.182', '29.9', '0.183', '1.28', '18.5%', '7.3', '3.2', '0.9'),
                                             ('NeuWorld+DDPM', '0.194', '30.7', '0.186', '1.30', '18.2%', '7.1', '2.8', '0.9'), ('NeuWorld+Reg', '0.130*', '25.2', '0.160*', '1.01*', '22.3%', '6.3', '3.2', '0.9')]),
    ('Completion (constant velocity: 0.553 m)', [('NeuWorld+FM', '0.113*', '21.8*', '0.128*', '0.92', '9.5%', '4.6', '1.9', '1.2*'), ('NeuWorld+DDPM', '0.119', '22.5', '0.132', '0.93', '9.2%*', '4.4*', '1.8*', '1.2*'),
                                                ('NeuWorld+Reg', '0.119', '22.0', '0.133', '0.83*', '17.7%', '4.5', '2.4', '1.8')]),
    ('Infilling (straight line: 0.056 m)', [('NeuWorld+FM', '0.047', '9.9*', '0.118*', '0.83*', '2.7%', '2.9', '1.3', '2.3*'), ('NeuWorld+DDPM', '0.045*', '10.1', '0.121', '0.84', '2.2%*', '2.7*', '1.2*', '2.3*'),
                                           ('NeuWorld+Reg', '0.077', '12.8', '0.151', '0.89', '12.2%', '3.5', '1.7', '5.0')]),
    ('Unknown properties (constant velocity: 0.836 m)', [('NeuWorld+FM', '0.227', '31.8', '0.210', '1.43', '26.4%*', '7.7', '3.2', '1.0*'), ('NeuWorld+DDPM', '0.238', '32.2', '0.213', '1.45', '26.8%', '7.5', '3.1*', '1.0*'),
                                                        ('NeuWorld+Reg', '0.183*', '27.7*', '0.189*', '1.17*', '42.2%', '6.6*', '3.3', '1.1')]),
    ('Backward (straight line: 0.246 m)', [('NeuWorld+FM', '0.091', '18.0', '0.170', '1.17', '7.5%', '7.0', '2.8', '0.9'), ('NeuWorld+DDPM', '0.082', '18.1', '0.166', '1.14', '5.0%*', '6.2', '2.4*', '0.9'),
                                          ('NeuWorld+Reg', '0.081*', '16.7*', '0.162*', '1.00*', '18.9%', '5.7*', '2.5', '0.9')]),
]


def results_section():
    body = ''
    for title, rows in RESULTS:
        body += f'<tr class="grp"><td colspan="9">{e(title)}</td></tr>'
        for row in rows:
            body += '<tr>' + ''.join('<td class="%s">%s</td>' % ('best' if c.endswith('*') else '', e(c.rstrip('*'))) for c in row) + '</tr>'
    return f'''<section class="section sp-section sp-band" id="numbers"><div class="sp-container sp-wide">
<h2 class="title is-3 has-text-centered">The numbers behind the clips</h2>
<p class="sp-lead">The main table of the paper, for reference: the three variants of NeuWorld and the graph network simulator (GNS) against PhysX on all 25,413 test simulations,
in the five modes that generate motion. Lower is better in every column. The value in brackets is the position error of the simplest answer that needs no learning.</p>
<div class="sp-table-wrap"><table class="sp-table"><thead><tr><th>Model</th><th>Position (m)</th><th>Orientation (&deg;)</th><th>Velocity (m/s)</th><th>Ang. velocity (rad/s)</th><th>Invented motion</th><th>Overlap (cm)</th><th>Floor (cm)</th><th>Shake (mm)</th></tr></thead>
<tbody>{body}</tbody></table></div>
<p class="sp-note has-text-centered" style="margin-top:0.7rem">Means within a motion family, then over the 56 families. Shading marks the best model per mode. The GNS answers forward prediction only.</p>
</div></section>'''


def footer():
    return '''<footer class="sp-footer"><div class="sp-container sp-text">
<p>Supplementary material of an anonymous submission. This page loads nothing from the network: all clips, fonts, styles and scripts are in its folder.</p>
<p>Colours, floor textures and lighting are choices made at render time. The motion in every clip is the simulation's or the model's.</p>
<p>Page layout adapted from the Nerfies project page template.</p>
</div></footer>'''


def main():
    v1 = load('v1.json'); showcase = load('showcase.json')
    md = modes_data(v1, showcase); pickers = {}
    sections = [('modes', 'Inference modes', modes_section(md, showcase)), ('forward', 'Forward prediction', forward_section(v1, showcase)),
                ('video-models', 'Video models', vdm_section(load('compare_vdm.json'), pickers)),
                ('llm-vla', 'Language models and robot policy', others_section(load('compare_llm.json'), load('compare_vla.json'), pickers)),
                ('twins', 'Real-room scans', twins_section(load('twins.json'), pickers)), ('dataset', 'Dataset', dataset_section(load('dataset.json'), pickers)),
                ('numbers', 'Numbers', results_section())]
    nav = [(k, label) for k, label, body in sections if body]
    body = hero(nav) + overview() + ''.join(b for _, _, b in sections) + footer()
    data = {'modes': md, 'pickers': pickers}
    blob = json.dumps(data, separators=(',', ':')).replace('</', '<\\/')
    page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>NeuWorld: Neural World Emulator (supplementary results)</title>
<link rel="stylesheet" href="static/css/bulma.min.css">
<link rel="stylesheet" href="static/css/index.css">
</head>
<body>
{body}
<script>window.SUPP = {blob};</script>
<script src="static/js/index.js"></script>
</body>
</html>
'''
    (WEB/'index.html').write_text(page)
    print('index.html', len(page), 'bytes; sections:', [k for k, _ in nav])


if __name__ == '__main__':
    main()
