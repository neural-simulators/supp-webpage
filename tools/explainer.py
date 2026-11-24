#!/usr/bin/env python3
"""The masking explainer of the supplementary page: explainer_section() returns the section's HTML.

The page needs two more tags for it: <link rel="stylesheet" href="static/css/explainer.css"> in the head and
<script src="static/js/explainer.js"></script> before the closing body tag. The markup below draws the first mode in its final
state, so the figure is complete without scripts and under prefers-reduced-motion; the script only switches the mask.
Masks follow Sec. 3.4 and Appendix B.2 of the paper: properties are hidden per object, the action as a whole, the motion in
patches of time; the scene graph with the start state is always given; backward inference adds the end state as a given token.
Completion gives the first 30% of the motion and infilling the first and last 20%, as in the mode viewer of the page.
"""
import html
import json

N_OBJECTS = 5      # property cells drawn (one per object)
N_PATCHES = 10     # motion cells drawn (one per patch of time)

# key, tab label, properties hidden, action hidden, motion mask per patch (1 = hidden), end state given, the two halves of the caption line
MODES = [
    ('forward', 'Forward prediction', 0, 0, '1111111111', 0, 'the scene graph, every physical property and the action', 'the whole motion'),
    ('unknown', 'Unknown properties', 1, 0, '1111111111', 0, 'the scene graph and the action only', 'the motion and the hidden properties'),
    ('completion', 'Completion', 0, 0, '0001111111', 0, 'properties, action and the first 30% of the motion', 'the rest of the motion'),
    ('infilling', 'Infilling', 0, 0, '0011111100', 0, 'properties, action, and the first and last 20% of the motion', 'the middle of the motion'),
    ('backward', 'Backward inference', 0, 1, '1111111111', 1, 'properties, the start state and the end state', 'the action and the motion that connect them'),
    ('property', 'Property inference', 1, 0, '0000000000', 0, 'the action and the whole motion', 'the mass, friction and restitution of every movable object'),
]

TITLE = 'How masking selects the inference mode'
LEAD = ('NeuWorld reads a scene as tokens. The scene graph is always given; the physical properties, the action and the motion can each be given or hidden, '
        'in whole or in part. A mask marks the hidden tokens and the network generates exactly those, so every mode below uses the same weights and differs only in the mask.')
NOTE = ('Hidden tokens enter as zeros for NeuWorld+Reg, which predicts them in one pass, and as noise for NeuWorld+FM and NeuWorld+DDPM, which denoise them '
        'over ten sampling steps while the given tokens stay fixed. The loss is computed on the hidden tokens only. '
        'More detail: Sec. 3.2 (inference modes), Sec. 3.3 (tokens) and Sec. 3.4 (masked joint modeling, Eqs. 2 and 3) of the paper; '
        'Appendix B.2 (token contents) and Appendix B.5 (samplers and mode curriculum).')


def e(s):
    return html.escape(str(s), quote=True)


def _cell(group, state, text='', wide=False, i=None):
    """One token cell. state: '' (given) or 'ex-m' (masked) on the input side; 'ex-off', 'ex-wait' or 'ex-gen' on the output side."""
    inner = (f'<i class="ex-v">{e(text)}</i>' if text else '') + ('<i class="ex-q">?</i>' if text and group != 'scene' else '')
    style = f' style="--i:{i}"' if i is not None else ''
    return f'<span class="ex-c{" ex-wide" if wide else ""}{" " + state if state else ""}" data-ex-g="{group}"{style}>{inner}</span>'


def _panel(side, mode):
    """side 'in': what the network reads (given or masked). side 'out': what it returns (generated where the input was masked)."""
    _, _, props, action, motion, end, _, _ = mode
    st = (lambda masked: 'ex-m' if masked else '') if side == 'in' else (lambda masked: 'ex-gen' if masked else 'ex-off')
    head = ('<b>Input</b><small>given and masked tokens</small>' if side == 'in' else '<b>Output</b><small>generated where the input was masked</small>')
    scene = _cell('scene', '' if side == 'in' else 'ex-off', 'objects · shapes · joints · start state', wide=True)
    prop = ''.join(_cell('props', st(props), 'm μ e', i=k) for k in range(N_OBJECTS))
    act = _cell('action', st(action), 'type · object · force · timing', wide=True)
    mot = ''.join(_cell('motion', st(motion[k] == '1'), i=k) for k in range(N_PATCHES))
    ends = ('<span class="ex-end ex-s0"></span>', f'<span class="ex-end ex-sT{"" if end else " ex-hide"}" data-ex-g="end"></span>')   # outlines on the output side: given, so not generated
    axis = (f'<div class="ex-axis"><span>start state</span><span class="{"" if end else "ex-hide"}" data-ex-endlabel>end state</span></div>' if side == 'in'
            else '<div class="ex-axis"></div>')
    return f'''<div class="ex-panel ex-{side}">
<div class="ex-ph">{head}</div>
<div class="ex-row"><div class="ex-rl">Scene graph</div><div class="ex-cells">{scene}</div></div>
<div class="ex-row"><div class="ex-rl">Properties<small>per object</small></div><div class="ex-cells">{prop}</div></div>
<div class="ex-row"><div class="ex-rl">Action</div><div class="ex-cells">{act}</div></div>
<div class="ex-row ex-motion"><div class="ex-rl">Motion<small>time &rarr;</small></div><div class="ex-cells">{ends[0]}{mot}{ends[1]}</div></div>
{axis}
</div>'''


def explainer_section():
    first = MODES[0]
    data = [{'key': k, 'props': p, 'action': a, 'motion': m, 'end': en, 'given': g, 'gen': o} for k, _, p, a, m, en, g, o in MODES]
    tabs = ''.join(f'<button type="button" class="ex-tab{" ex-on" if i == 0 else ""}" data-ex-mode="{k}" aria-pressed="{"true" if i == 0 else "false"}"><span>{e(label)}</span></button>'
                   for i, (k, label, *_) in enumerate(MODES))
    ticks = ''.join(f'<i style="--i:{k}"></i>' for k in range(10))
    arrow = '<svg class="ex-arrow {}" viewBox="0 0 28 12" aria-hidden="true"><path d="M1.5 6h23M19.5 1.5 25 6l-5.5 4.5"/></svg>'
    return f'''<section class="section sp-section" id="how-it-works"><div class="sp-container sp-wide">
<h2 class="title is-3 has-text-centered">{e(TITLE)}</h2>
<p class="sp-lead">{e(LEAD)}</p>
<div class="ex ex-done" id="ex-masking" data-ex-modes='{e(json.dumps(data, separators=(",", ":")))}'>
<div class="ex-tabs" role="group" aria-label="Inference mode">{tabs}</div>
<p class="ex-line"><span class="ex-part"><span class="ex-k ex-kg">Given</span><span data-ex-given>{e(first[6])}</span></span> <span class="ex-part"><span class="ex-k ex-ko">Generated</span><span data-ex-gen>{e(first[7])}</span></span></p>
<div class="ex-stage">
{_panel('in', first)}
<div class="ex-mid">{arrow.format('ex-a1')}<div class="ex-net"><b>NeuWorld</b><small>one transformer</small><span class="ex-ticks" aria-hidden="true">{ticks}</span><small class="ex-tl">sampling steps</small></div>{arrow.format('ex-a2')}</div>
{_panel('out', first)}
</div>
<div class="ex-legend"><span><i class="ex-sw ex-sw-g"></i>given</span><span><i class="ex-sw ex-sw-m"></i>masked (hidden from the network)</span><span><i class="ex-sw ex-sw-o"></i>generated</span>
<span><i class="ex-sw ex-sw-n"></i>given, so not generated</span><span>m, &mu;, e: mass, friction, restitution</span><span class="ex-hint">Click a mode to hold it.</span></div>
</div>
<p class="sp-note has-text-centered" style="max-width:880px;margin:0.8rem auto 0">{e(NOTE)}</p>
</div></section>'''


if __name__ == '__main__':
    print(explainer_section())
