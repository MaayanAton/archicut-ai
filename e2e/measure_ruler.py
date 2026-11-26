import sys
from PIL import Image
import numpy as np
img, dpi = sys.argv[1], float(sys.argv[2])
a = np.array(Image.open(img).convert('L')) < 128
expect = 100 / 25.4 * dpi
best = None
for r in range(a.shape[0]):
    cols = np.where(a[r])[0]
    if len(cols) == 0: continue
    s = p = cols[0]
    for c in list(cols[1:]) + [None]:
        if c is None or c != p + 1:
            L = p - s + 1
            if abs(L - expect) < expect * 0.05 and (best is None or abs(L - expect) < abs(best[2] - expect)):
                best = (r, s, L)
            if c is not None: s = c
        if c is not None: p = c
if best:
    r, s, L = best
    # the line has a stroke width; ends are at line centre +/- half stroke (butt caps => exact)
    print(f'ruler row {r}: {L} px = {L / dpi * 25.4:.3f} mm (expected 100.000 mm, {expect:.1f} px)')
else:
    print('ruler not found')
