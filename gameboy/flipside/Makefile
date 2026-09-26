# Build FLIPSIDE with GBDK-2020 (https://github.com/gbdk-2020/gbdk-2020).
# Set GBDK_HOME to your GBDK install, e.g. make GBDK_HOME=~/gbdk
GBDK_HOME ?= /opt/gbdk
LCC = $(GBDK_HOME)/bin/lcc

# -Wm-yc      : Game Boy Color enhanced, still runs on original Game Boy
# -Wl-yt0x03  : MBC1 + RAM + battery (the high score is saved)
# -Wl-ya1     : one 8 KB bank of cartridge RAM
LCCFLAGS = -Wm-yc -Wl-yt0x03 -Wl-ya1 -Wm-yn"FLIPSIDE" -Wm-yk"MM"

ROM = flipside.gbc

all: $(ROM)

src/assets.c src/assets.h: tools/gen_assets.py
	python3 tools/gen_assets.py

$(ROM): src/main.c src/assets.c src/assets.h
	$(LCC) $(LCCFLAGS) -o $@ src/main.c src/assets.c

clean:
	rm -f $(ROM) *.map *.noi *.sym src/*.o src/*.lst src/*.asm *.ihx

.PHONY: all clean
