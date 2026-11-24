#!/usr/bin/env python3
"""The masking explainer of the supplementary page: explainer_section() returns the section's HTML.

One worked example, the test scene of the paper's mode figure (a ball released on a ramp pushes a spring-mounted block into a row of
tiles), drawn as a side view. The reader picks an inference mode; the cards on the left show what the network is given and what is
hidden from it, with the record's values, and the cards on the right show what it generates: the trajectories and numbers are the
saved outputs of NeuWorld+FM for that mode (data/explainer.json, written by scripts/supp_webpage/explainer_data.py of the project).
Nothing switches on its own: a mode runs once when it is chosen (the observed motion, then the ten sampling steps over every hidden value at once) and then rests; a slider steps through the sampling steps and a button plays the finished motion.
The page needs static/css/explainer.css and static/js/explainer.js for it.
"""
import html
import json
import re
from pathlib import Path

DATA = Path(__file__).resolve().parents[1]/'data/explainer.json'

# key, tab label, the question, given, generated, properties hidden, action hidden
MODES = [
    ('forward', 'Forward prediction', 'What happens next?', 'the scene graph, every physical property and the action', 'the whole motion', 0, 0),
    ('unknown', 'Unknown properties', 'What happens when the properties are not known?', 'the scene graph and the action only', 'the motion and the hidden properties', 1, 0),
    ('completion', 'Completion', 'The start was observed. How does it continue?', 'properties, action and the first 30% of the motion', 'the rest of the motion', 0, 0),
    ('infilling', 'Infilling', 'Both ends were observed. What happened in between?', 'properties, action, and the first and last 20% of the motion', 'the middle of the motion', 0, 0),
    ('backward', 'Backward inference', 'Which action leads from this start to this end?', 'properties, the start state and the end state', 'the action and the motion that connect them', 0, 1),
    ('property', 'Property inference', 'What are the objects like?', 'the action and the whole motion', 'the mass, friction and restitution of every movable object', 1, 0),
]

TITLE = 'How masking selects the inference mode'
LEAD = ('NeuWorld reads a scene as tokens. The scene graph with the start state is always given; the physical properties, the action and the motion can each be given or hidden, '
        'in whole or in part. The network generates exactly the hidden tokens, so every mode uses the same weights and differs only in the mask. Pick a mode to see it on one test scene.')
NOTE = ('The example is the test scene of Fig. 4 of the paper, seen from the side; the generated trajectories and numbers are the outputs of NeuWorld+FM. '
        'All hidden tokens are generated together: the properties, the action, and the motion at every time step. They enter as noise and are denoised in ten sampling steps '
        'while the given tokens stay fixed, so each step holds a cleaner version of the whole answer and the tenth is the complete trajectory, which is then played back '
        '(NeuWorld+Reg predicts the hidden tokens in one pass from zeros). The intermediate steps are drawn on the straight path from one noise sample to the output. '
        'The loss is computed on the hidden tokens only. '
        'More detail: Sec. 3.2 (inference modes), Sec. 3.3 (tokens) and Sec. 3.4 (masked joint modeling, Eqs. 2 and 3) of the paper; '
        'Appendix B.2 (token contents) and Appendix B.5 (samplers and mode curriculum).')


def e(s):
    return html.escape(str(s), quote=True)


def explainer_section():
    if not DATA.exists():
        return ''
    d = json.loads(DATA.read_text())
    def nums(text):                                                 # the force and the two times of an action sentence of the page
        m = re.search(r'([\d.]+) N from ([\d.]+) s to ([\d.]+) s', text or '')
        return [float(x) for x in m.groups()] if m else None
    a = d['action']
    d['action'] = {'true': nums(a.get('true_text')) or [a['true']['force_N'], a['true']['start_s'], a['true']['stop_s']],
                   'backward': nums(a.get('text')) or [a['backward']['force_N'], a['backward']['start_s'], a['backward']['stop_s']]}
    d['order'] = [{'key': k, 'label': label, 'ask': ask, 'given': g, 'gen': o, 'props': p, 'action': ac} for k, label, ask, g, o, p, ac in MODES]
    tabs = ''.join(f'<button type="button" class="ex-tab{" ex-on" if i == 0 else ""}" data-ex-mode="{k}" aria-pressed="{"true" if i == 0 else "false"}">{e(label)}</button>'
                   for i, (k, label, *_) in enumerate(MODES))
    blob = e(json.dumps(d, separators=(',', ':')))
    return f'''<section class="section sp-section" id="how-it-works"><div class="sp-container sp-wide">
<h2 class="title is-3 has-text-centered">{e(TITLE)}</h2>
<p class="sp-lead">{e(LEAD)}</p>
<div class="ex" id="ex-masking" data-ex='{blob}'>
<div class="ex-tabs" role="group" aria-label="Inference mode">{tabs}</div>
<div class="ex-stage">
<div class="ex-panel ex-in">
<div class="ex-ph"><b>Input</b><small>given, or hidden from the network</small></div>
<div class="ex-card ex-is-given"><div class="ex-ch"><b>Scene graph and start state</b><small>{d['counts']['objects']} objects, {d['counts']['joints']} joints</small></div><svg data-ex-view="scene" aria-hidden="true"></svg></div>
<div class="ex-two"><div class="ex-card" data-ex-card="props-in"></div><div class="ex-card" data-ex-card="action-in"></div></div>
<div class="ex-card" data-ex-card="motion-in"></div>
</div>
<div class="ex-mid"><svg class="ex-arrow" viewBox="0 0 28 12" aria-hidden="true"><path d="M1.5 6h23M19.5 1.5 25 6l-5.5 4.5"/></svg>
<div class="ex-net"><b>NeuWorld</b><small>one transformer</small><span class="ex-ticks" aria-hidden="true">{'<i></i>' * 10}</span><small class="ex-step" data-ex-step>&nbsp;</small>
<input type="range" class="ex-scrub" min="0" max="10" step="1" value="10" data-ex-scrub aria-label="Sampling step"><small class="ex-hint">drag to step through</small></div>
<svg class="ex-arrow" viewBox="0 0 28 12" aria-hidden="true"><path d="M1.5 6h23M19.5 1.5 25 6l-5.5 4.5"/></svg>
<div class="ex-btns"><button type="button" class="ex-replay" data-ex-replay>Run again</button><button type="button" class="ex-replay" data-ex-play>Play the motion</button></div></div>
<div class="ex-panel ex-out">
<div class="ex-ph"><b>Output</b><small>generated where the input was hidden</small></div>
<div class="ex-card ex-ask"><p class="ex-q" data-ex-ask></p><p class="ex-gg"><span class="ex-k ex-kg">Given</span><span data-ex-given></span></p><p class="ex-gg"><span class="ex-k ex-ko">Generated</span><span data-ex-gen></span></p></div>
<div class="ex-two"><div class="ex-card" data-ex-card="props-out"></div><div class="ex-card" data-ex-card="action-out"></div></div>
<div class="ex-card" data-ex-card="motion-out"></div>
</div>
</div>
<div class="ex-legend"><span><i class="ex-sw ex-sw-g"></i>given</span><span><i class="ex-sw ex-sw-m"></i>hidden from the network</span><span><i class="ex-sw ex-sw-o"></i>generated</span>
<span><i class="ex-sw ex-sw-n"></i>given, so not generated</span></div>
</div>
<p class="sp-note has-text-centered" style="max-width:900px;margin:0.8rem auto 0">{e(NOTE)}</p>
</div></section>'''


if __name__ == '__main__':
    print(explainer_section())
