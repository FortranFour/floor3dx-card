"""Compare two directories of render_views.py output: per view, the share of pixels that differ by
more than a small tolerance and the mean absolute difference, plus a side-by-side-with-diff image.

    python3 dev/harness/compare_views.py <before-dir> <after-dir> [<out-dir>]
"""
import os, sys
import numpy as np
from PIL import Image, ImageChops

a_dir, b_dir = sys.argv[1], sys.argv[2]
out = sys.argv[3] if len(sys.argv) > 3 else None
if out:
    os.makedirs(out, exist_ok=True)
names = sorted(set(os.listdir(a_dir)) & set(os.listdir(b_dir)))
print(f'{"view":<22} {"changed px":>10} {"mean |d|":>9}')
for n in names:
    if not n.endswith('.png'):
        continue
    a = Image.open(os.path.join(a_dir, n)).convert('RGB')
    b = Image.open(os.path.join(b_dir, n)).convert('RGB')
    if a.size != b.size:
        b = b.resize(a.size)
    da = np.asarray(a).astype(int)
    db = np.asarray(b).astype(int)
    d = np.abs(da - db).max(axis=2)
    changed = (d > 12).mean() * 100
    mean = np.abs(da - db).mean()
    print(f'{n:<22} {changed:9.2f}% {mean:9.2f}')
    if out:
        diff = ImageChops.difference(a, b).point(lambda v: min(255, v * 4))
        sheet = Image.new('RGB', (a.width * 3 + 20, a.height), (40, 40, 40))
        sheet.paste(a, (0, 0)); sheet.paste(b, (a.width + 10, 0)); sheet.paste(diff, (a.width * 2 + 20, 0))
        sheet.save(os.path.join(out, n))
