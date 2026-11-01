"""Turn rendered PNG frames into web images: full size for desktop and half size for phones.
python3 to_web.py <png_dir> <site_public_dir> [prefix_in=car_] [folder=frames] [prefix_out=f_]"""
import os, sys, glob
from PIL import Image
src, pub = sys.argv[1], sys.argv[2]
pin = sys.argv[3] if len(sys.argv) > 3 else "car_"
folder = sys.argv[4] if len(sys.argv) > 4 else "frames"
pout = sys.argv[5] if len(sys.argv) > 5 else "f_"
os.makedirs(f"{pub}/{folder}", exist_ok=True); os.makedirs(f"{pub}/{folder}-m", exist_ok=True)
n = 0
for p in sorted(glob.glob(f"{src}/{pin}*.png")):
    k = int(os.path.basename(p)[len(pin):len(pin) + 3])
    out, outm = f"{pub}/{folder}/{pout}{k:03d}.webp", f"{pub}/{folder}-m/{pout}{k:03d}.webp"
    if os.path.exists(out) and os.path.getmtime(out) > os.path.getmtime(p): continue
    im = Image.open(p).convert("RGB")
    im.save(out, quality=80, method=5)
    im.resize((im.width // 2, im.height // 2), Image.LANCZOS).save(outm, quality=78, method=5)
    n += 1
print("converted", n)
