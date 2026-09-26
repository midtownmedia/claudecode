#!/usr/bin/env python3
"""Turn the ASCII art below into Game Boy 2bpp tile data (src/assets.c/.h).

Pixel characters: '.' = colour 0, '1' / '2' / '3' = colours 1-3.
For backgrounds colour 0 is the night sky; for sprites it is transparent.
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "src")


def tile_bytes(rows):
    """8 strings of 8 pixels -> 16 bytes of 2bpp."""
    assert len(rows) == 8, rows
    out = []
    for row in rows:
        assert len(row) == 8, row
        lo = hi = 0
        for x, ch in enumerate(row):
            v = 0 if ch == "." else int(ch)
            bit = 7 - x
            lo |= (v & 1) << bit
            hi |= ((v >> 1) & 1) << bit
        out += [lo, hi]
    return out


def split16(rows):
    """16x16 art -> 4 tiles ordered TL, TR, BL, BR."""
    assert len(rows) == 16
    tl = [r[:8] for r in rows[:8]]
    tr = [r[8:] for r in rows[:8]]
    bl = [r[:8] for r in rows[8:]]
    br = [r[8:] for r in rows[8:]]
    return [tl, tr, bl, br]


def art(s):
    return [line for line in s.strip("\n").split("\n")]


# --------------------------------------------------------------- background
BG = {}
BG["BLANK"] = art("""
........
........
........
........
........
........
........
........""")
BG["STAR1"] = art("""
........
........
........
...2....
........
........
........
........""")
BG["STAR2"] = art("""
........
....1...
....2...
..12321.
....2...
....1...
........
........""")
BG["FLOOR"] = art("""
33333333
22222222
21112111
11111111
11121111
11111111
12111112
11111111""")
BG["CEIL"] = art("""
11111111
12111112
11111111
11121111
11111111
21112111
22222222
33333333""")
BG["SPIKE_UP"] = art("""
...3....
...3....
..323...
..323...
.32221..
.32221..
3222211.
32222111""")
BG["SPIKE_DOWN"] = art("""
32222111
3222211.
.32221..
.32221..
..323...
..323...
...3....
...3....""")
BG["HUDBAR"] = art("""
33333333
........
........
........
........
........
........
........""")
BG["GEMICON"] = art("""
........
...33...
..3322..
.332221.
..3221..
...21...
........
........""")

# 5x7 font drawn at x=1..5, y=0..6 of each tile, with a colour-1 drop shadow.
FONT = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "B": ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
    "C": ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
    "D": ["11100", "10010", "10001", "10001", "10001", "10010", "11100"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "F": ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
    "G": ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
    "H": ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
    "I": ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
    "J": ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "L": ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
    "M": ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
    "N": ["10001", "10001", "11001", "10101", "10011", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "Q": ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "U": ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
    "V": ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
    "X": ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
    "Y": ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
    "Z": ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
    ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
    "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
    ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
    "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
    "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
    "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
    ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
    "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
}
FONT_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ:!.-/<>+"


def glyph_grid(ch, scale):
    """Return a (7*scale)x(5*scale) boolean grid for a font char."""
    g = FONT[ch]
    return [[g[y // scale][x // scale] == "1" for x in range(5 * scale)]
            for y in range(7 * scale)]


def render(grid, w, h, ox, oy, colour_for_row):
    """Draw grid into a w*h canvas with a colour-1 drop shadow."""
    canvas = [["."] * w for _ in range(h)]
    gh, gw = len(grid), len(grid[0])
    for y in range(gh):
        for x in range(gw):
            if grid[y][x]:
                sx, sy = ox + x + 1, oy + y + 1
                if sx < w and sy < h:
                    canvas[sy][sx] = "1"
    for y in range(gh):
        for x in range(gw):
            if grid[y][x]:
                canvas[oy + y][ox + x] = colour_for_row(y)
    return ["".join(r) for r in canvas]


font_tiles = []
for ch in FONT_CHARS:
    font_tiles.append(render(glyph_grid(ch, 1), 8, 8, 1, 0, lambda y: "3"))

# Big 2x logo letters for the title: 10x14 glyph in a 16x16 cell, gradient.
LOGO_WORD = "FLIPSIDE"
logo_letters = []
for ch in LOGO_WORD:
    if ch not in logo_letters:
        logo_letters.append(ch)
logo_tiles = []
for ch in logo_letters:
    grid = glyph_grid(ch, 2)
    c = render(grid, 16, 16, 2, 0, lambda y: "3" if y < 6 else ("2" if y < 10 else "3"))
    logo_tiles += split16(c)

# ------------------------------------------------------------------ sprites
PLAYER_RUN_A = art("""
......1111......
....11222211....
...1222222221...
..122222222221..
..122223332221..
.1222233313221..
.1222233313221..
.1222223332221..
.1222222222221..
.1222222222221..
..122222222221..
..112222222211..
...1111111111...
....12....21....
...122....122...
...111....111...""")
PLAYER_RUN_B = art("""
......1111......
....11222211....
...1222222221...
..122222222221..
..122223332221..
.1222233313221..
.1222233313221..
.1222223332221..
.1222222222221..
.1222222222221..
..122222222221..
..112222222211..
...1111111111...
.....12..21.....
.....122.122....
.....111.111....""")
PLAYER_AIR = art("""
......1111......
....11222211....
...1222222221...
..122222222221..
..122223332221..
.1222233333221..
.1222233313221..
.1222223332221..
.1222222222221..
.1222222222221..
..122222222221..
..112222222211..
...1111111111...
...12......21...
..122......221..
..11........11..""")


def saw_frame(phase):
    rows = []
    cx = cy = 7.5
    for y in range(16):
        row = ""
        for x in range(16):
            dx, dy = x - cx, y - cy
            r = math.hypot(dx, dy)
            a = math.atan2(dy, dx) + phase
            tooth = 5.2 + 2.2 * ((a * 8 / (2 * math.pi)) % 1.0)
            if r < 1.6:
                row += "3"
            elif r < 2.6:
                row += "1"
            elif r < 5.0:
                row += "2"
            elif r < tooth:
                row += "3" if r < tooth - 0.9 else "1"
            else:
                row += "."
        rows.append(row)
    return rows


SAW_A = saw_frame(0.0)
SAW_B = saw_frame(math.pi / 8)

GEM_A = art("""
...11...
..1331..
.133221.
13322221
.122221.
..1221..
...11...
........""")
GEM_B = art("""
...11...
..1321..
.132221.
13222221
.122221.
..1221..
...11...
........""")
SPARK = art("""
........
........
...2....
..232...
...2....
........
........
........""")
DOT = art("""
........
........
........
...3....
........
........
........
........""")

sprite_tiles = []
SPR = {}


def add_sprite(name, tiles):
    SPR[name] = len(sprite_tiles)
    sprite_tiles.extend(tiles)


add_sprite("PLAYER_A", split16(PLAYER_RUN_A))
add_sprite("PLAYER_B", split16(PLAYER_RUN_B))
add_sprite("PLAYER_AIR", split16(PLAYER_AIR))
add_sprite("SAW_A", split16(SAW_A))
add_sprite("SAW_B", split16(SAW_B))
add_sprite("GEM_A", [GEM_A])
add_sprite("GEM_B", [GEM_B])
add_sprite("SPARK", [SPARK])
add_sprite("DOT", [DOT])

# ------------------------------------------------------------------ emit C
bg_tiles = []
BGI = {}
for name, t in BG.items():
    BGI[name] = len(bg_tiles)
    bg_tiles.append(t)
FONT_BASE = len(bg_tiles)
bg_tiles += font_tiles
LOGO_BASE = len(bg_tiles)
bg_tiles += logo_tiles


def c_array(name, tiles):
    data = []
    for t in tiles:
        data += tile_bytes(t)
    lines = []
    for i in range(0, len(data), 16):
        lines.append("    " + ",".join("0x%02X" % b for b in data[i:i + 16]) + ",")
    return "const uint8_t %s[%d] = {\n%s\n};\n" % (name, len(data), "\n".join(lines))


with open(os.path.join(SRC, "assets.h"), "w") as f:
    f.write("/* Generated by tools/gen_assets.py - do not edit. */\n")
    f.write("#ifndef ASSETS_H\n#define ASSETS_H\n#include <stdint.h>\n\n")
    for name, i in BGI.items():
        f.write("#define T_%s %d\n" % (name, i))
    f.write("#define T_FONT %d\n#define T_LOGO %d\n" % (FONT_BASE, LOGO_BASE))
    f.write("#define BG_TILE_COUNT %d\n\n" % len(bg_tiles))
    f.write('#define FONT_CHARS "%s"\n' % FONT_CHARS)
    f.write('#define LOGO_LETTERS "%s"\n\n' % "".join(logo_letters))
    for name, i in SPR.items():
        f.write("#define S_%s %d\n" % (name, i))
    f.write("#define SPRITE_TILE_COUNT %d\n\n" % len(sprite_tiles))
    f.write("extern const uint8_t bg_tile_data[];\n")
    f.write("extern const uint8_t sprite_tile_data[];\n\n#endif\n")

with open(os.path.join(SRC, "assets.c"), "w") as f:
    f.write("/* Generated by tools/gen_assets.py - do not edit. */\n")
    f.write('#include "assets.h"\n\n')
    f.write(c_array("bg_tile_data", bg_tiles))
    f.write("\n")
    f.write(c_array("sprite_tile_data", sprite_tiles))

print("bg tiles:", len(bg_tiles), "sprite tiles:", len(sprite_tiles))

# ------------------------------------------------------- note frequency table
# GB pulse channel period value for MIDI notes 36..96: x = 2048 - 131072 / f.
with open(os.path.join(SRC, "assets.c"), "a") as f:
    vals = []
    for n in range(36, 97):
        hz = 440.0 * 2 ** ((n - 69) / 12.0)
        vals.append(max(0, min(2047, round(2048 - 131072 / hz))))
    f.write("\nconst uint16_t note_period[%d] = {\n    %s\n};\n"
            % (len(vals), ",".join(str(v) for v in vals)))
with open(os.path.join(SRC, "assets.h"), "r+") as f:
    text = f.read().replace(
        "\n#endif\n",
        "#define NOTE_BASE 36\nextern const uint16_t note_period[];\n\n#endif\n")
    f.seek(0)
    f.write(text)
    f.truncate()
