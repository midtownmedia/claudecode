#!/usr/bin/env python3
"""Boot the ROM in PyBoy, play it with a simple bot, and save screenshots.

    pip install pyboy
    python3 test/playtest.py flipside.gbc out_dir [--dmg]
"""
import os
import sys
from pyboy import PyBoy

rom, out = sys.argv[1], sys.argv[2]
cgb = "--dmg" not in sys.argv
os.makedirs(out, exist_ok=True)
pb = PyBoy(rom, window="null", cgb=cgb, sound_emulated=False)
pb.set_emulation_speed(0)


def shot(name):
    pb.screen.image.convert("RGB").resize((480, 432), 0).save(os.path.join(out, name + ".png"))


def press(btn, frames=2):
    pb.button_press(btn)
    pb.tick(frames)
    pb.button_release(btn)
    pb.tick(1)


pb.tick(120)
shot("1_title")
press("start")
pb.tick(60)
shot("2_start")


def mem(addr):
    return pb.memory[addr]


# Bot: look at the BG map ahead of the player and flip when a spike is
# coming on the side we're standing on. Crude, but proves the loop works.
alive_frames = 0
for f in range(3600):
    pb.tick(1)
    alive_frames += 1
    if f in (300, 900, 1800):
        shot("3_play_%04d" % f)
    if f % 4 == 0:
        scx = mem(0xFF43)
        # which surface are we on? read player sprite 0 Y from OAM
        py = mem(0xFE00) - 16
        on_floor = py > 64
        danger = False
        for dx in range(24, 72, 8):
            col = ((scx + 40 + dx) // 8) & 31
            ceil_t = mem(0x9800 + 1 * 32 + col)
            floor_t = mem(0x9800 + 15 * 32 + col)
            if on_floor and floor_t == 5:
                danger = True
            if not on_floor and ceil_t == 6:
                danger = True
        if danger:
            press("a", 1)
    # game over panel raises the window
    if mem(0xFF4A) < 100:
        break

pb.tick(90)
shot("4_gameover")
print("survived frames:", alive_frames, "WY:", mem(0xFF4A))
press("b")
pb.tick(60)
shot("5_menu_after_b")
press("start")
pb.tick(90)
press("start")
pb.tick(10)
shot("6_paused")
pb.stop(save=False)
