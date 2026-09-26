#!/usr/bin/env python3
"""Search-based bot: every few frames, try each action on a save-state copy of
the emulator, roll forward, and pick one that keeps Blip alive. If it can keep
going for minutes, the level generator isn't producing impossible sections.

    python3 test/bot.py flipside.gbc [seconds] [--dmg]
"""
import io
import sys
from pyboy import PyBoy

rom = sys.argv[1]
seconds = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].isdigit() else 180
pb = PyBoy(rom, window="null", cgb="--dmg" not in sys.argv, sound_emulated=False)
pb.set_emulation_speed(0)

ACTIONS = [(), ("a",), ("left",), ("right",), ("a", "left"), ("a", "right")]
STEP = 4
HORIZON = 48


def dead():
    return pb.memory[0xFE00] == 0 or pb.memory[0xFF4A] < 136


def run(action, frames):
    for b in action:
        pb.button_press(b)
    pb.tick(1)
    for b in action:
        pb.button_release(b)
    for _ in range(frames - 1):
        pb.tick(1)
        if dead():
            return False
    return not dead()


def spike_ahead():
    """Reactive policy: is a spike on our surface just ahead of us?"""
    m = pb.memory
    px, py, flipped = m[0xFE01] - 8, m[0xFE00] - 16, m[0xFE03] & 0x40
    row, tile = (1, 6) if flipped else (15, 5)
    for dx in range(0, 32, 4):
        col = ((m[0xFF43] + px + 12 + dx) // 8) & 31
        if m[0x9800 + row * 32 + col] == tile:
            return True
    return False


def saw_threat():
    """Is a saw about to reach us on our side of the corridor?"""
    m = pb.memory
    px, py = m[0xFE01] - 8, m[0xFE00] - 16
    for oam in (0xFE10, 0xFE20):
        sy, sx = m[oam] - 16, m[oam + 1] - 8
        if m[oam] == 0 or sx < px - 12 or sx > px + 48:
            continue
        if abs(sy - py) < 40:
            return True
    return False


def policy(variant):
    if spike_ahead():
        return ("a",)
    if variant >= 1 and saw_threat():
        return ("a",) if variant == 1 else ("left",)
    return ()


def rollout(frames):
    for variant in (0, 1, 2):
        snap = io.BytesIO()
        pb.save_state(snap)
        ok = all(run(policy(variant), STEP) for _ in range(0, frames, STEP))
        snap.seek(0)
        pb.load_state(snap)
        if ok:
            return True
    return False


def survives(action, depth):
    snap = io.BytesIO()
    pb.save_state(snap)
    ok = run(action, STEP)
    if ok and depth > 0:
        ok = any(survives(a, depth - 1) for a in [(), ("a",), ("left",)])
    elif ok:
        ok = rollout(HORIZON)
    snap.seek(0)
    pb.load_state(snap)
    return ok


pb.tick(120)
pb.button_press("start"); pb.tick(2); pb.button_release("start"); pb.tick(30)

frames = 0
history = []
while frames < seconds * 60:
    choice = next((a for a in ACTIONS if survives(a, 1)), ())
    run(choice, STEP)
    frames += STEP
    snap = io.BytesIO(); pb.save_state(snap)
    history.append((choice, pb.screen.image.convert("RGB"), snap.getvalue()))
    del history[:-16]
    if dead():
        break
    if frames % 1800 == 0:
        print("  %ds alive, score tiles: %s" % (frames // 60, bytes(pb.memory[0x9C06:0x9C0B])))

print("RESULT: survived %.1f s (%s)" % (frames / 60, "died" if dead() else "still alive"))
pb.screen.image.convert("RGB").resize((480, 432), 0).save("/tmp/claude-0/bot_end.png")
if "--frames" in sys.argv:
    for i, (a, img, st) in enumerate(history):
        img.save("/tmp/claude-0/hist_%02d_%s.png" % (i, "+".join(a) or "none"))
        open("/tmp/claude-0/hist_%02d.state" % i, "wb").write(st)
pb.stop(save=False)
