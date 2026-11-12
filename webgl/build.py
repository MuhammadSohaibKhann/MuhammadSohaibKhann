# Assemble the WebGL frames into a seamless animated WebP for the README.
import glob, sys
from PIL import Image
frames=[Image.open(p).convert('RGB') for p in sorted(glob.glob('f/*.png'))]
out=sys.argv[1]
frames[0].save(out, save_all=True, append_images=frames[1:], duration=55, loop=0,
               quality=78, method=6, lossless=False)
import os; print(len(frames),'frames ->', round(os.path.getsize(out)/1e6,2),'MB')
