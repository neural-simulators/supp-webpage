#!/usr/bin/env python3
"""Pack the page for the supplementary archive and check it (python3 tools/pack.py [--out DIR] [--zip]).

Copies index.html and only the files under static/ that the page references into DIR (default: ../supp_webpage_package/webpage), so
the archive holds no build tools, manifests or unused media. Checks, and fails on: a reference to a missing file, any URL that leaves the
folder (http, https, protocol-relative), identifying strings in text files (user, cluster, organisation and repository names, absolute
paths), and metadata in the mp4 files (encoder tags are allowed). Prints the total size against the 100 MB limit of the venue.
"""
import argparse
import re
import shutil
import sys
import zipfile
from pathlib import Path

WEB = Path(__file__).resolve().parents[1]
FORBIDDEN = [r'spaul', r'mvp18', r'soumava', r'schaud', r'shravan', r'chaudhari', r'yuille', r'neural-simulators', r'honeycomb', r'github\.com', r'github\.io', r'/weka/', r'/home/',
             r'/cis/', r'\bjhu\b', r'ccvl', r'hopkins', r'io79', r'io9[01]', r'simagent', r'slurm', r'@gmail', r'claude\.ai']
URL = re.compile(r'''(?:https?:)?//[A-Za-z0-9.-]+\.[A-Za-z]{2,}[^\s"'<>)]*''')
REF = re.compile(r'''static/[A-Za-z0-9_./+-]+\.(?:mp4|jpg|jpeg|png|webp|svg|css|js|woff2|json|gif)''')
ALLOWED_URLS = ('//www.w3.org/2000/svg', '//www.w3.org/1999/xhtml', '//www.w3.org/1999/xlink')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--out', type=Path, default=WEB.parent/'supp_webpage_package/webpage'); ap.add_argument('--zip', action='store_true')
    a = ap.parse_args()
    html = (WEB/'index.html').read_text(); problems = []
    refs = set(REF.findall(html)); todo = list(refs); seen = set()
    while todo:                                                      # css and js may reference further files (fonts)
        r = todo.pop()
        if r in seen:
            continue
        seen.add(r); p = WEB/r
        if not p.exists():
            problems.append(f'missing file: {r}'); continue
        if p.suffix in ('.css', '.js'):
            text = p.read_text(errors='replace')
            for m in re.findall(r'''url\(["']?([^"')]+)["']?\)''', text):
                if m.startswith('data:'):
                    continue
                q = (p.parent/m).resolve()
                if WEB in q.parents:
                    todo.append(str(q.relative_to(WEB)))
    files = sorted(seen)
    if a.out.exists():
        shutil.rmtree(a.out)
    a.out.mkdir(parents=True); shutil.copy2(WEB/'index.html', a.out/'index.html')
    total = (WEB/'index.html').stat().st_size
    for r in files:
        src = WEB/r
        if not src.exists():
            continue
        dst = a.out/r; dst.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(src, dst); total += src.stat().st_size
    for p in [a.out/'index.html', *[a.out/r for r in files if (a.out/r).suffix in ('.css', '.js', '.json', '.svg')]]:
        text = p.read_text(errors='replace'); name = p.relative_to(a.out)
        for u in set(URL.findall(text)):
            if not any(u.endswith(x) or x in u for x in ALLOWED_URLS) and not (name.name == 'bulma.min.css' and 'bulma.io' in u):
                problems.append(f'{name}: external URL {u[:80]}')
        if name.name == 'bulma.min.css':                               # its MIT licence line names the library's own repository; it must stay
            text = re.sub(r'github\.com/jgthms/[a-z.]+', '', text)
        for pat in FORBIDDEN:
            for m in set(re.findall(pat, text, flags=re.I)):
                problems.append(f'{name}: identifying string "{m}"')
    def text_runs(data):                                              # readable text inside a binary file (tags, comments, paths), not chance bytes of the compressed stream
        return b' '.join(re.findall(rb'[\x20-\x7e]{8,}', data)).decode('ascii')
    for p in [*a.out.rglob('*.mp4'), *a.out.rglob('*.jpg'), *a.out.rglob('*.png'), *a.out.rglob('*.woff2')]:
        runs = text_runs(p.read_bytes())
        for pat in FORBIDDEN:
            m = re.search(pat, runs, flags=re.I)
            if m:
                problems.append(f'{p.relative_to(a.out)}: identifying text "{runs[max(0, m.start()-20):m.end()+20]}"')
    print(f'{len(files)+1} files, {total/1e6:.1f} MB in {a.out}')
    by = {}
    for r in files:
        k = '/'.join(r.split('/')[:3]); by[k] = by.get(k, 0)+(WEB/r).stat().st_size
    for k, v in sorted(by.items(), key=lambda x: -x[1]):
        print(f'  {v/1e6:6.1f} MB  {k}')
    if a.zip:
        z = a.out.parent/'webpage.zip'
        with zipfile.ZipFile(z, 'w', zipfile.ZIP_STORED) as f:
            for p in sorted(a.out.rglob('*')):
                if p.is_file():
                    f.write(p, Path('webpage')/p.relative_to(a.out))
        print(f'zip: {z} {z.stat().st_size/1e6:.1f} MB')
    if problems:
        print(f'{len(problems)} PROBLEMS:'); [print('  '+x) for x in sorted(set(problems))[:60]]
        sys.exit(1)
    print('checks passed: no missing files, no external URLs, no identifying strings')


if __name__ == '__main__':
    main()
