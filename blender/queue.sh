#!/bin/bash
# Waits for the turntable render to finish, then renders the close-up stills and the exploded view.
B=/Applications/Blender.app/Contents/MacOS/Blender
M=~/Downloads/assets/car/supra/toyota_gr_supra_gt_gt300.glb
H=~/Downloads/assets/car/studio/studio_4k.hdr
while pgrep -f "supra/frames 0 119" >/dev/null; do sleep 30; done
STUDIO_KEEP=1 STUDIO_STILLS=1 $B -b --factory-startup -P ~/Downloads/assets/car/blender/studio.py -- $M $H ~/Downloads/assets/car/supra/stills 0 0 1 128 2400 1350 > ~/Downloads/assets/car/supra/stills.log 2>&1
STUDIO_KEEP=1 STUDIO_EXPLODE=1 $B -b --factory-startup -P ~/Downloads/assets/car/blender/studio.py -- $M $H ~/Downloads/assets/car/supra/exploded 0 47 48 64 1600 900 > ~/Downloads/assets/car/supra/exploded.log 2>&1
echo ALL_DONE
