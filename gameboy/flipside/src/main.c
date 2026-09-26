/*
 * FLIPSIDE - a gravity-flipping endless runner for Game Boy Color
 * (also runs on the original Game Boy in greyscale).
 *
 * You are Blip, a little light-blob racing through an endless night corridor.
 * You cannot jump. You can only flip gravity: press A and you fall to the
 * ceiling (or back to the floor). Dodge spike strips, time your way past
 * spinning saws that sweep the corridor, and grab gems for bonus points.
 * The corridor keeps getting faster.
 */
#include <gb/gb.h>
#include <gb/cgb.h>
#include <rand.h>
#include <stdint.h>
#include "assets.h"

/* ------------------------------------------------------------ layout */
#define PLAY_ROWS    17          /* BG rows 0..16 are the corridor        */
#define HUD_Y        136         /* window top during play (one HUD row)  */
#define PANEL_Y      72          /* window top when the game-over panel is up */
#define FLOOR_Y      112         /* player top y when standing on floor   */
#define CEIL_Y       8           /* player top y when standing on ceiling */
#define PLAYER_MIN_X 12
#define PLAYER_MAX_X 120

#define COL_FLOOR_SPIKE 1
#define COL_CEIL_SPIKE  2

/* ------------------------------------------------------------ physics (8.8) */
#define GRAVITY      0x5A
#define MAX_FALL     0x600
#define FLIP_KICK    0x100
#define SPEED_START  0x140
#define SPEED_MAX    0x2C0
#define FLIP_BUFFER  6

/* ------------------------------------------------------------ OAM slots */
#define OAM_PLAYER   0   /* 4 */
#define OAM_SAW      4   /* 2 saws x 4 */
#define OAM_GEM      12  /* 6 gems */
#define OAM_PART     18  /* 8 particles */
#define MAX_SAWS     2
#define MAX_GEMS     6
#define MAX_PARTS    8

/* ------------------------------------------------------------ palettes */
static const palette_color_t bg_pals[] = {
    /* 0 walls */  RGB8(10,10,30),  RGB8(44,26,80),   RGB8(96,60,150),  RGB8(180,160,240),
    /* 1 spikes */ RGB8(10,10,30),  RGB8(110,20,44),  RGB8(236,96,44),  RGB8(255,232,150),
    /* 2 stars */  RGB8(10,10,30),  RGB8(40,50,100),  RGB8(110,130,210), RGB8(240,240,255),
    /* 3 text */   RGB8(10,10,30),  RGB8(40,34,90),   RGB8(255,200,80), RGB8(255,255,255),
    /* 4 logo */   RGB8(10,10,30),  RGB8(90,24,90),   RGB8(255,110,70), RGB8(255,222,90),
    /* 5 HUD */    RGB8(30,20,56),  RGB8(12,8,26),    RGB8(255,200,80), RGB8(255,255,255),
    /* 6 accent */ RGB8(10,10,30),  RGB8(40,34,90),   RGB8(255,200,80), RGB8(120,240,200),
};
static const palette_color_t spr_pals[] = {
    /* 0 player */ RGB8(0,0,0), RGB8(16,40,64),  RGB8(80,224,204), RGB8(255,255,255),
    /* 1 saw */    RGB8(0,0,0), RGB8(60,50,70),  RGB8(176,176,200), RGB8(255,110,100),
    /* 2 gem */    RGB8(0,0,0), RGB8(20,90,50),  RGB8(70,226,130), RGB8(230,255,230),
    /* 3 spark */  RGB8(0,0,0), RGB8(255,120,40), RGB8(255,220,80), RGB8(255,255,255),
};
#define PAL_WALL  0
#define PAL_SPIKE 1
#define PAL_STAR  2
#define PAL_TEXT  3
#define PAL_LOGO  4
#define PAL_HUD   5
#define PAL_ACC   6

/* ------------------------------------------------------------ state */
static uint8_t is_cgb;
static uint8_t keys, prev_keys;
#define PRESSED(k) ((keys & (k)) && !(prev_keys & (k)))

/* world scroll */
static uint8_t cam_x;          /* == SCX, wraps every 32 tiles like the map */
static uint8_t fine_x;         /* 0..7 pixels into the current column */
static uint8_t cam_col;        /* leftmost visible column (mod 256) */
static uint16_t scroll_frac;   /* sub-pixel accumulator (8.8) */
static uint16_t speed;         /* scroll speed, px/frame in 8.8 */
static uint8_t cols_since_speedup;
static uint8_t colflags[32];   /* hazards per map column (ring buffer) */

/* generator */
static uint8_t gen_gap;        /* empty columns before next feature */
static uint8_t gen_strip;      /* spike columns still to emit */
static uint8_t gen_side;       /* current/next feature: spike side, or 0 = saw */
static uint8_t gen_gem_left, gen_gem_y, gen_gem_step;

/* player */
static uint8_t px;
static int16_t py;             /* 8.8 */
static int16_t pvy;            /* 8.8 */
static int8_t gdir;            /* +1 gravity down, -1 gravity up */
static uint8_t grounded;
static uint8_t flip_buffer;
static uint8_t anim;

/* entities */
static int16_t saw_x[MAX_SAWS];
static int16_t saw_y[MAX_SAWS];   /* 8.8 */
static int16_t saw_vy[MAX_SAWS];  /* 8.8 */
static uint8_t saw_on[MAX_SAWS];
static int16_t gem_x[MAX_GEMS];
static uint8_t gem_y[MAX_GEMS];
static uint8_t gem_on[MAX_GEMS];
static int16_t part_x[MAX_PARTS], part_y[MAX_PARTS];   /* 8.8 */
static int16_t part_vx[MAX_PARTS], part_vy[MAX_PARTS];
static uint8_t part_life[MAX_PARTS];

static uint16_t score, hiscore;
static uint8_t gems;
static uint8_t frame;
static uint8_t music_on = 1;

/* ------------------------------------------------------------ save RAM */
#define SAVE ((uint8_t *)0xA000)

static void load_hiscore(void) {
    ENABLE_RAM;
    if (SAVE[0] == 'F' && SAVE[1] == 'S' && SAVE[2] == '1')
        hiscore = SAVE[3] | ((uint16_t)SAVE[4] << 8);
    else
        hiscore = 0;
    DISABLE_RAM;
}

static void save_hiscore(void) {
    ENABLE_RAM;
    SAVE[0] = 'F'; SAVE[1] = 'S'; SAVE[2] = '1';
    SAVE[3] = (uint8_t)hiscore;
    SAVE[4] = (uint8_t)(hiscore >> 8);
    DISABLE_RAM;
}

/* ------------------------------------------------------------ text */
static uint8_t char_tile(char c) {
    const char *f = FONT_CHARS;
    uint8_t i = 0;
    if (c >= 'a' && c <= 'z') c -= 32;
    while (f[i]) {
        if (f[i] == c) return T_FONT + i;
        i++;
    }
    return T_BLANK;
}

static void put_text(uint8_t x, uint8_t y, const char *s, uint8_t pal, uint8_t win) {
    uint8_t t;
    while (*s) {
        t = char_tile(*s++);
        if (is_cgb) {
            VBK_REG = 1;
            if (win) set_win_tile_xy(x, y, pal); else set_bkg_tile_xy(x, y, pal);
            VBK_REG = 0;
        }
        if (win) set_win_tile_xy(x, y, t); else set_bkg_tile_xy(x, y, t);
        x++;
    }
}

static void put_number(uint8_t x, uint8_t y, uint16_t n, uint8_t digits, uint8_t pal, uint8_t win) {
    char buf[6];
    uint8_t i = digits;
    buf[digits] = 0;
    while (i) {
        buf[--i] = '0' + (n % 10);
        n /= 10;
    }
    put_text(x, y, buf, pal, win);
}

static void fill_area(uint8_t x, uint8_t y, uint8_t w, uint8_t h, uint8_t tile, uint8_t pal, uint8_t win) {
    if (is_cgb) {
        VBK_REG = 1;
        if (win) fill_win_rect(x, y, w, h, pal); else fill_bkg_rect(x, y, w, h, pal);
        VBK_REG = 0;
    }
    if (win) fill_win_rect(x, y, w, h, tile); else fill_bkg_rect(x, y, w, h, tile);
}

/* ------------------------------------------------------------ sound */
static void sfx_flip(uint8_t up) {
    NR10_REG = up ? 0x16 : 0x1E;
    NR11_REG = 0x80;
    NR12_REG = 0x92;
    NR13_REG = 0x00;
    NR14_REG = 0x86;
}

static void sfx_gem(void) {
    NR10_REG = 0x15;
    NR11_REG = 0x40;
    NR12_REG = 0xC2;
    NR13_REG = 0x80;
    NR14_REG = 0x87;
}

static void sfx_death(void) {
    NR41_REG = 0x00;
    NR42_REG = 0xF4;
    NR43_REG = 0x63;
    NR44_REG = 0x80;
}

static void sfx_start(void) {
    NR10_REG = 0x17;
    NR11_REG = 0x80;
    NR12_REG = 0xF3;
    NR13_REG = 0x00;
    NR14_REG = 0x85;
}

/* A-minor loop: 32 steps of arpeggio, then 32 steps of melody.
 * Chords Am F C G; 0 = no new note. */
static const uint8_t song_lead[64] = {
    69,72,76,81,76,72,69,76,  65,69,72,77,72,69,65,72,
    72,76,79,84,79,76,72,79,  67,71,74,79,74,71,67,74,
    76, 0,74,72, 0,71,72, 0,  69, 0, 0,72, 0,77,76, 0,
    76, 0,79, 0,76,74,72, 0,  74, 0,71, 0,67, 0,71,74,
};
static const uint8_t song_bass[8] = { 45, 41, 48, 43, 45, 41, 48, 43 };
static const uint8_t wave_pattern[16] = {
    0x01,0x23,0x45,0x67,0x89,0xAB,0xCD,0xEF,0xFE,0xDC,0xBA,0x98,0x76,0x54,0x32,0x10
};
static uint8_t song_step, song_tick;

static void music_reset(void) {
    uint8_t i;
    song_step = 0;
    song_tick = 0;
    NR30_REG = 0x00;
    for (i = 0; i < 16; i++) (&AUD3WAVE[0])[i] = wave_pattern[i];
    NR30_REG = 0x80;
}

static void music_silence(void) {
    NR22_REG = 0x00; NR24_REG = 0x80;
    NR32_REG = 0x00;
}

static void music_tick(void) {
    uint8_t n;
    uint16_t p;
    if (!music_on) return;
    if (song_tick) { song_tick--; return; }
    song_tick = 7;

    n = song_lead[song_step];
    if (n) {
        p = note_period[n - NOTE_BASE];
        NR21_REG = 0x80;
        NR22_REG = 0x53;
        NR23_REG = (uint8_t)p;
        NR24_REG = 0x80 | (uint8_t)(p >> 8);
    }
    if ((song_step & 1) == 0) {
        n = song_bass[song_step >> 3];
        if (song_step & 2) n += 12;
        p = note_period[n + 12 - NOTE_BASE];   /* wave channel sounds an octave low */
        NR32_REG = 0x40;
        NR31_REG = 0xD0;
        NR33_REG = (uint8_t)p;
        NR34_REG = 0xC0 | (uint8_t)(p >> 8);
    }
    song_step = (song_step + 1) & 63;
}

/* ------------------------------------------------------------ sprites */
static void hide_all_sprites(void) {
    uint8_t i;
    for (i = 0; i < 40; i++) move_sprite(i, 0, 0);
}

static void draw_player(void) {
    uint8_t base, y, flip;
    if (!grounded) base = S_PLAYER_AIR;
    else base = (anim & 8) ? S_PLAYER_B : S_PLAYER_A;
    y = (uint8_t)(py >> 8);
    flip = gdir < 0;
    /* upside down: swap which half goes on top and mirror each tile */
    set_sprite_tile(OAM_PLAYER + 0, base + (flip ? 2 : 0));
    set_sprite_tile(OAM_PLAYER + 1, base + (flip ? 3 : 1));
    set_sprite_tile(OAM_PLAYER + 2, base + (flip ? 0 : 2));
    set_sprite_tile(OAM_PLAYER + 3, base + (flip ? 1 : 3));
    base = flip ? S_FLIPY : 0;
    set_sprite_prop(OAM_PLAYER + 0, base);
    set_sprite_prop(OAM_PLAYER + 1, base);
    set_sprite_prop(OAM_PLAYER + 2, base);
    set_sprite_prop(OAM_PLAYER + 3, base);
    move_sprite(OAM_PLAYER + 0, px + 8, y + 16);
    move_sprite(OAM_PLAYER + 1, px + 16, y + 16);
    move_sprite(OAM_PLAYER + 2, px + 8, y + 24);
    move_sprite(OAM_PLAYER + 3, px + 16, y + 24);
}

static void hide_player(void) {
    uint8_t i;
    for (i = 0; i < 4; i++) move_sprite(OAM_PLAYER + i, 0, 0);
}

static void draw_saw(uint8_t i, int16_t x, uint8_t y) {
    uint8_t o = OAM_SAW + i * 4;
    uint8_t t = (frame & 4) ? S_SAW_B : S_SAW_A;
    uint8_t k;
    if (x < -16 || x > 160) {
        for (k = 0; k < 4; k++) move_sprite(o + k, 0, 0);
        return;
    }
    for (k = 0; k < 4; k++) {
        set_sprite_tile(o + k, t + k);
        set_sprite_prop(o + k, 1);
    }
    move_sprite(o + 0, (uint8_t)(x + 8), y + 16);
    move_sprite(o + 1, (uint8_t)(x + 16), y + 16);
    move_sprite(o + 2, (uint8_t)(x + 8), y + 24);
    move_sprite(o + 3, (uint8_t)(x + 16), y + 24);
}

/* ------------------------------------------------------------ world */
static uint8_t col_buf[PLAY_ROWS];
static uint8_t col_attr[PLAY_ROWS];

static void write_column(uint8_t mapx, uint8_t flags) {
    uint8_t r, rnd;
    col_buf[0] = T_CEIL;   col_attr[0] = PAL_WALL;
    col_buf[16] = T_FLOOR; col_attr[16] = PAL_WALL;
    for (r = 1; r < 16; r++) {
        rnd = rand();
        col_buf[r] = rnd < 10 ? T_STAR1 : (rnd < 13 ? T_STAR2 : T_BLANK);
        col_attr[r] = PAL_STAR;
    }
    if (flags & COL_CEIL_SPIKE)  { col_buf[1] = T_SPIKE_DOWN; col_attr[1] = PAL_SPIKE; }
    if (flags & COL_FLOOR_SPIKE) { col_buf[15] = T_SPIKE_UP;  col_attr[15] = PAL_SPIKE; }
    colflags[mapx] = flags;
    if (is_cgb) {
        VBK_REG = 1;
        set_bkg_tiles(mapx, 0, 1, PLAY_ROWS, col_attr);
        VBK_REG = 0;
    }
    set_bkg_tiles(mapx, 0, 1, PLAY_ROWS, col_buf);
}

static uint8_t difficulty(void) {
    return (uint8_t)((speed - SPEED_START) >> 6);   /* 0..7 */
}

/* Columns needed to flip from one surface to the other at the current speed. */
static uint8_t flip_cols(void) {
    return (uint8_t)(((uint16_t)27 * speed) >> 11) + 3;
}

static void spawn_saw(int16_t x) {
    uint8_t i;
    for (i = 0; i < MAX_SAWS; i++) {
        if (!saw_on[i]) {
            saw_on[i] = 1;
            saw_x[i] = x;
            saw_y[i] = (int16_t)(CEIL_Y + (rand() % 96)) << 8;
            saw_vy[i] = 0xC0 + difficulty() * 0x18;
            if (rand() & 1) saw_vy[i] = -saw_vy[i];
            return;
        }
    }
}

static void spawn_gem(int16_t x, uint8_t y) {
    uint8_t i;
    for (i = 0; i < MAX_GEMS; i++) {
        if (!gem_on[i]) {
            gem_on[i] = 1;
            gem_x[i] = x;
            gem_y[i] = y;
            return;
        }
    }
}

/* Pick the feature after the one that just finished, and size the empty gap
 * before it. Planning the next feature first means the gap can guarantee a
 * full flip whenever the player must switch surfaces. */
static void gen_plan(void) {
    uint8_t lvl = difficulty();
    uint8_t prev = gen_side;

    if ((rand() & 15) < 3 + (lvl >> 1) && (!saw_on[0] || !saw_on[1]))
        gen_side = 0;   /* a saw sweeping the whole corridor */
    else
        gen_side = (rand() & 1) ? COL_FLOOR_SPIKE : COL_CEIL_SPIKE;

    if (prev && gen_side == prev)
        gen_gap = 2 + (rand() & 3);                     /* stay put */
    else
        gen_gap = flip_cols() + 1 + (rand() % (8 - lvl)); /* time to flip */
}

/* Decide what the next column holds. `x` is its screen position, used to
 * place any saw or gem that belongs to it. */
static uint8_t gen_column(int16_t x) {
    uint8_t lvl;

    if (gen_gem_left && gen_gem_step == 0) {
        spawn_gem(x, gen_gem_y);
        gen_gem_left--;
        gen_gem_step = 2;
    }
    if (gen_gem_step) gen_gem_step--;

    if (gen_strip) {
        lvl = gen_side;
        if (--gen_strip == 0) gen_plan();
        return lvl;
    }
    if (gen_gap) {
        gen_gap--;
        return 0;
    }

    if (gen_side == 0) {
        spawn_saw(x);
        gen_plan();
        if (gen_gap < flip_cols() + 3) gen_gap = flip_cols() + 3;
        return 0;
    }

    /* a spike strip, on the floor or the ceiling */
    lvl = difficulty();
    gen_strip = 2 + (rand() % (2 + (lvl >> 1)));

    /* reward: gems along the safe side of the strip, sometimes mid-air */
    if ((rand() & 3) == 0 && !gen_gem_left) {
        gen_gem_left = 3;
        gen_gem_step = 0;
        if ((rand() & 3) == 0) gen_gem_y = 68;
        else gen_gem_y = gen_side == COL_FLOOR_SPIKE ? 12 : 116;
    }

    if (--gen_strip == 0) {
        uint8_t side = gen_side;
        gen_plan();
        return side;
    }
    return gen_side;
}

/* ------------------------------------------------------------ HUD */
static void draw_hud(void) {
    put_text(0, 0, "SCORE", PAL_HUD, 1);
    put_number(6, 0, score, 5, PAL_HUD, 1);
    put_text(12, 0, "HI", PAL_HUD, 1);
    put_number(15, 0, hiscore, 5, PAL_HUD, 1);
}

static void setup_palettes(void) {
    if (is_cgb) {
        set_bkg_palette(0, 7, bg_pals);
        set_sprite_palette(0, 4, spr_pals);
    }
    BGP_REG = 0x1B;     /* colour 0 = black: it's night */
    OBP0_REG = 0x1B;
    OBP1_REG = 0x1B;
}

/* ------------------------------------------------------------ title */
static void title_screen(void) {
    uint8_t i, c;
    const char *word = "FLIPSIDE";
    const char *letters = LOGO_LETTERS;
    uint8_t tiles[2];

    DISPLAY_OFF;
    HIDE_WIN;
    hide_all_sprites();
    SCX_REG = 0; SCY_REG = 0;
    cam_x = 0;
    initrand(0x5EED);
    for (i = 0; i < 32; i++) write_column(i, 0);
    /* a few decorative spikes */
    write_column(2, COL_FLOOR_SPIKE);  write_column(3, COL_FLOOR_SPIKE);
    write_column(15, COL_CEIL_SPIKE);  write_column(16, COL_CEIL_SPIKE);
    write_column(17, COL_CEIL_SPIKE);

    /* 2x logo, 16x16 per letter (attributes first, then tiles) */
    fill_area(1, 3, 18, 2, T_BLANK, PAL_LOGO, 0);
    for (i = 0; word[i]; i++) {
        c = 0;
        while (letters[c] != word[i]) c++;
        c = T_LOGO + c * 4;
        tiles[0] = c; tiles[1] = c + 1;
        set_bkg_tiles(2 + i * 2, 3, 2, 1, tiles);
        tiles[0] = c + 2; tiles[1] = c + 3;
        set_bkg_tiles(2 + i * 2, 4, 2, 1, tiles);
    }
    fill_area(3, 6, 14, 1, T_BLANK, PAL_TEXT, 0);
    put_text(4, 6, "GRAVITY  RUN", PAL_ACC, 0);
    fill_area(2, 9, 16, 5, T_BLANK, PAL_TEXT, 0);
    put_text(3, 9, "A:FLIP GRAVITY", PAL_TEXT, 0);
    put_text(3, 10, "<>:MOVE", PAL_TEXT, 0);
    put_text(3, 11, "START:PAUSE", PAL_TEXT, 0);
    put_text(3, 13, "HI", PAL_TEXT, 0);
    put_number(6, 13, hiscore, 5, PAL_ACC, 0);

    /* demo player */
    px = 60; py = FLOOR_Y << 8; pvy = 0; gdir = 1; grounded = 1; anim = 0;
    draw_player();

    SHOW_BKG; SHOW_SPRITES;
    DISPLAY_ON;
    music_reset();

    while (1) {
        wait_vbl_done();
        frame++;
        prev_keys = keys;
        keys = joypad();
        music_tick();

        /* the demo blob flips on its own every so often */
        if ((frame & 63) == 0 && grounded) {
            gdir = -gdir; grounded = 0; pvy = gdir * FLIP_KICK;
        }
        if (!grounded) {
            pvy += gdir * GRAVITY;
            py += pvy;
            if (gdir > 0 && py >= (FLOOR_Y << 8)) { py = FLOOR_Y << 8; pvy = 0; grounded = 1; }
            if (gdir < 0 && py <= (CEIL_Y << 8))  { py = CEIL_Y << 8;  pvy = 0; grounded = 1; }
        }
        anim++;
        draw_player();

        if ((frame & 31) == 0)  fill_area(4, 15, 12, 1, T_BLANK, PAL_TEXT, 0);
        if ((frame & 31) == 16) put_text(4, 15, "PRESS START", PAL_ACC, 0);

        if (PRESSED(J_SELECT)) {
            music_on = !music_on;
            if (!music_on) music_silence();
        }
        if (PRESSED(J_START) || PRESSED(J_A)) {
            initrand(((uint16_t)DIV_REG << 8) | frame);
            sfx_start();
            return;
        }
    }
}

/* ------------------------------------------------------------ game */
static void new_game(void) {
    uint8_t i;
    DISPLAY_OFF;
    hide_all_sprites();

    cam_x = 0; fine_x = 0; cam_col = 0; scroll_frac = 0;
    speed = SPEED_START; cols_since_speedup = 0;
    gen_gap = 26; gen_strip = 0; gen_side = COL_CEIL_SPIKE;
    for (i = 0; i < MAX_SAWS; i++) saw_on[i] = 0;
    for (i = 0; i < MAX_GEMS; i++) gem_on[i] = 0;
    for (i = 0; i < MAX_PARTS; i++) part_life[i] = 0;
    /* a trail of starter gems */
    gen_gem_left = 4; gen_gem_y = 116; gen_gem_step = 8;

    for (i = 0; i < 22; i++) write_column(i, gen_column(i * 8));
    for (; i < 32; i++) write_column(i, 0);
    SCX_REG = 0; SCY_REG = 0;

    px = 40; py = FLOOR_Y << 8; pvy = 0; gdir = 1; grounded = 1;
    flip_buffer = 0; anim = 0;
    score = 0; gems = 0;

    fill_area(0, 0, 20, 8, T_BLANK, PAL_TEXT, 1);
    fill_area(0, 0, 20, 1, T_BLANK, PAL_HUD, 1);
    draw_hud();
    move_win(7, HUD_Y);
    SHOW_WIN;
    DISPLAY_ON;
}

static void add_score(uint16_t n) {
    if (score > 65535u - n) score = 65535u;
    else score += n;
}

static uint8_t hits_hazard(void) {
    uint8_t y = (uint8_t)(py >> 8);
    uint8_t top = y + 3, bottom = y + 13;
    uint8_t c0 = (uint8_t)(cam_x + px + 4) >> 3;
    uint8_t c1 = (uint8_t)(cam_x + px + 11) >> 3;
    uint8_t f = colflags[c0 & 31] | colflags[c1 & 31];
    uint8_t i;
    int16_t dx, dy;

    if ((f & COL_FLOOR_SPIKE) && bottom > 122) return 1;
    if ((f & COL_CEIL_SPIKE) && top < 14) return 1;

    for (i = 0; i < MAX_SAWS; i++) {
        if (!saw_on[i]) continue;
        dx = saw_x[i] - (int16_t)px;
        dy = (saw_y[i] >> 8) - (int16_t)y;
        if (dx > -11 && dx < 11 && dy > -11 && dy < 11) return 1;
    }
    return 0;
}

static void burst(uint8_t x, uint8_t y, uint8_t tile) {
    static const int8_t dirs[16] = { 2,0, 1,1, 0,2, -1,1, -2,0, -1,-1, 0,-2, 1,-1 };
    uint8_t i;
    for (i = 0; i < MAX_PARTS; i++) {
        part_x[i] = (int16_t)x << 8;
        part_y[i] = (int16_t)y << 8;
        part_vx[i] = dirs[i * 2] * 0x90;
        part_vy[i] = dirs[i * 2 + 1] * 0x90;
        part_life[i] = 30 + (i & 3) * 4;
        set_sprite_tile(OAM_PART + i, tile);
        set_sprite_prop(OAM_PART + i, 3);
    }
}

static void update_particles(void) {
    uint8_t i;
    for (i = 0; i < MAX_PARTS; i++) {
        if (part_life[i]) {
            part_life[i]--;
            part_x[i] += part_vx[i];
            part_y[i] += part_vy[i];
            if (part_life[i] && (part_life[i] > 8 || (frame & 1)))
                move_sprite(OAM_PART + i, (uint8_t)(part_x[i] >> 8) + 8, (uint8_t)(part_y[i] >> 8) + 16);
            else
                move_sprite(OAM_PART + i, 0, 0);
        }
    }
}

static void scroll_world(uint8_t dx) {
    uint8_t i;
    cam_x += dx;
    fine_x += dx;
    while (fine_x >= 8) {
        fine_x -= 8;
        cam_col++;
        write_column((cam_col + 21) & 31, gen_column(168 - fine_x));
        add_score(1);
        if (++cols_since_speedup >= 20) {
            cols_since_speedup = 0;
            if (speed < SPEED_MAX) speed += 4;
        }
    }
    for (i = 0; i < MAX_SAWS; i++)
        if (saw_on[i]) {
            saw_x[i] -= dx;
            if (saw_x[i] < -16) saw_on[i] = 0;
        }
    for (i = 0; i < MAX_GEMS; i++)
        if (gem_on[i]) {
            gem_x[i] -= dx;
            if (gem_x[i] < -8) gem_on[i] = 0;
        }
}

static void update_entities(void) {
    uint8_t i, y = (uint8_t)(py >> 8);
    int16_t dx, dy;
    for (i = 0; i < MAX_SAWS; i++) {
        if (saw_on[i]) {
            saw_y[i] += saw_vy[i];
            if (saw_y[i] < (CEIL_Y << 8))  { saw_y[i] = CEIL_Y << 8;  saw_vy[i] = -saw_vy[i]; }
            if (saw_y[i] > (FLOOR_Y << 8)) { saw_y[i] = FLOOR_Y << 8; saw_vy[i] = -saw_vy[i]; }
            draw_saw(i, saw_x[i], (uint8_t)(saw_y[i] >> 8));
        } else {
            draw_saw(i, -100, 0);
        }
    }
    for (i = 0; i < MAX_GEMS; i++) {
        if (gem_on[i]) {
            dx = gem_x[i] + 4 - (int16_t)(px + 8);
            dy = (int16_t)gem_y[i] + 4 - (int16_t)(y + 8);
            if (dx > -10 && dx < 10 && dy > -10 && dy < 10) {
                gem_on[i] = 0;
                gems++;
                add_score(25);
                sfx_gem();
                move_sprite(OAM_GEM + i, 0, 0);
                continue;
            }
            set_sprite_tile(OAM_GEM + i, (frame & 16) ? S_GEM_B : S_GEM_A);
            set_sprite_prop(OAM_GEM + i, 2);
            if (gem_x[i] < 160)
                move_sprite(OAM_GEM + i, (uint8_t)(gem_x[i] + 8), gem_y[i] + 16 + ((frame >> 3) & 1));
            else
                move_sprite(OAM_GEM + i, 0, 0);
        } else {
            move_sprite(OAM_GEM + i, 0, 0);
        }
    }
}

static void update_player(void) {
    if (keys & J_LEFT && px > PLAYER_MIN_X) px--;
    if (keys & J_RIGHT && px < PLAYER_MAX_X) px++;

    if (PRESSED(J_A) || PRESSED(J_B)) flip_buffer = FLIP_BUFFER;
    else if (flip_buffer) flip_buffer--;

    if (grounded && flip_buffer) {
        flip_buffer = 0;
        gdir = -gdir;
        grounded = 0;
        pvy = gdir * FLIP_KICK;
        sfx_flip(gdir < 0);
    }

    if (!grounded) {
        pvy += gdir * GRAVITY;
        if (pvy > MAX_FALL) pvy = MAX_FALL;
        if (pvy < -MAX_FALL) pvy = -MAX_FALL;
        py += pvy;
        if (gdir > 0 && py >= (FLOOR_Y << 8)) { py = FLOOR_Y << 8; pvy = 0; grounded = 1; }
        if (gdir < 0 && py <= (CEIL_Y << 8))  { py = CEIL_Y << 8;  pvy = 0; grounded = 1; }
    }
    anim++;
}

static void pause_game(void) {
    uint8_t i;
    music_silence();
    fill_area(0, 0, 20, 1, T_BLANK, PAL_HUD, 1);
    put_text(7, 0, "PAUSED", PAL_HUD, 1);
    while (1) {
        wait_vbl_done();
        prev_keys = keys;
        keys = joypad();
        if (PRESSED(J_START)) break;
    }
    for (i = 0; i < 2; i++) wait_vbl_done();
    fill_area(0, 0, 20, 1, T_BLANK, PAL_HUD, 1);
    draw_hud();
}

/* Returns when the player has died and asked to go again (1) or quit (0). */
static uint8_t play(void) {
    uint8_t dx, t, wy, best;

    new_game();
    music_reset();

    while (1) {
        wait_vbl_done();
        SCX_REG = cam_x;
        frame++;
        prev_keys = keys;
        keys = joypad();
        music_tick();

        if (PRESSED(J_START)) pause_game();
        if (PRESSED(J_SELECT)) {
            music_on = !music_on;
            if (!music_on) music_silence();
        }

        scroll_frac += speed;
        dx = (uint8_t)(scroll_frac >> 8);
        scroll_frac &= 0xFF;
        scroll_world(dx);

        update_player();
        update_entities();
        draw_player();
        update_particles();

        if ((frame & 7) == 0) put_number(6, 0, score, 5, PAL_HUD, 1);

        if (hits_hazard()) break;
    }

    /* --- death --- */
    music_silence();
    sfx_death();
    hide_player();
    burst(px + 4, (uint8_t)(py >> 8) + 4, S_SPARK);
    for (t = 0; t < 45; t++) {
        wait_vbl_done();
        frame++;
        SCY_REG = t < 20 ? ((t & 2) ? 2 : -2) : 0;
        update_particles();
        update_entities();
    }
    SCY_REG = 0;
    hide_all_sprites();   /* keep saws and gems off the panel */

    best = 0;
    if (score > hiscore) {
        hiscore = score;
        save_hiscore();
        best = 1;
    }
    put_number(6, 0, score, 5, PAL_HUD, 1);
    put_number(15, 0, hiscore, 5, PAL_HUD, 1);

    put_text(5, 2, "GAME  OVER", PAL_TEXT, 1);
    put_text(4, 4, "GEMS", PAL_TEXT, 1);
    put_number(9, 4, gems, 3, PAL_ACC, 1);
    if (best) put_text(5, 5, "NEW RECORD!", PAL_ACC, 1);
    put_text(3, 7, "A:RETRY  B:MENU", PAL_TEXT, 1);

    for (wy = HUD_Y; wy > PANEL_Y; wy -= 4) {
        wait_vbl_done();
        move_win(7, wy);
    }
    move_win(7, PANEL_Y);

    t = 0;
    while (1) {
        wait_vbl_done();
        frame++;
        prev_keys = keys;
        keys = joypad();
        if (t < 20) { t++; continue; }   /* ignore button mashing from the run */
        if (PRESSED(J_A) || PRESSED(J_START)) return 1;
        if (PRESSED(J_B)) return 0;
    }
}

void main(void) {
    is_cgb = (_cpu == CGB_TYPE);
    DISPLAY_OFF;
    SPRITES_8x8;

    NR52_REG = 0x80;
    NR51_REG = 0xFF;
    NR50_REG = 0x77;

    set_bkg_data(0, BG_TILE_COUNT, bg_tile_data);
    set_sprite_data(0, SPRITE_TILE_COUNT, sprite_tile_data);
    setup_palettes();
    load_hiscore();

    while (1) {
        title_screen();
        while (play()) { }
    }
}
