# Peptides (v2)

A simpler, iPhone-style rebuild of the peptide dosing app. It works out how far
to pull the plunger, logs doses and weight, and charts both over time. It is a
static site with no backend and no accounts. Nothing leaves the device.

The first version is still in `../public`. This one shares its domain rules
(everything below is carried over) but has four screens instead of nine.

| Screen | What it does |
|---|---|
| **Today** | One card per peptide: the number of units in large type, the syringe drawn to the mark, and a Log Dose button. Due status, bottle countdown, cost per dose, and a "move to the next step" prompt once a step has been held long enough. |
| **Calculator** | Dose → units, or units → dose ("the sheet says 6 units, what is that?"). Shows the draw, what the rounded mark really gives, and every warning. |
| **Progress** | Weight and dose charts over 1M / 3M / 6M / 1Y / All, with the full history underneath. Open a saved file and it charts straight away. **See an Example** shows sample data, clearly labelled and never saved. |
| **Settings** | The data file, your peptides, pounds or kilograms, warning signs, safe handling, erase. |

It adapts to the screen: a tab bar on phones, a sidebar on iPad and desktop,
side-by-side panels where there is room, and light and dark mode.

## Your data file

The log is saved in the browser on every change. The **file** is the copy you
keep: for a new phone, a cleared browser, or Safari deciding to clear storage
for a site that has not been opened in a while.

| Where | Save | Open |
|---|---|---|
| iPhone / iPad (Safari or home screen) | Settings → **Save a Copy** → *Save to Files* (iCloud Drive or On My iPhone) | Settings or Progress → **Open Saved File** |
| Android | **Save a Copy** → share sheet, or Downloads | **Open Saved File** |
| Chrome / Edge on a computer | **Save to a File** once. Every change after that is written to the same file automatically. If the file is in a synced folder, changes made on another computer are merged in when the app reconnects. | **Open Saved File**, or drag the file onto the window |
| Firefox / Safari on a computer | **Save a Copy** → Downloads | **Open Saved File**, or drag the file onto the window |

Opening a file **merges** it with what is on the device. It never replaces it.
Entries are matched by id, the newer edit of the same entry wins, and deletions
are carried in the file so a merge cannot bring back something you deleted.
Opening an old file can never wipe newer entries.

Today shows a reminder to save once there is something worth keeping and the
last saved file is more than a week behind.

Backups exported from the first version (`peptide-tracker-*.json`) open too.
Their protocols and dose log are converted as they load.

### File format

Plain JSON, readable in any text editor:

```json
{
  "app": "peptides",
  "format": 1,
  "savedAt": "2026-09-23T18:04:00.000Z",
  "weightUnit": "lb",
  "protocols": [{ "id": "…", "peptideId": "retatrutide", "strength": 60, "waterMl": 5, "doseMg": 0.5, "freq": "qw", "syringe": 30, "mixedAt": "…", "doseSince": "…", "price": 200, "active": true }],
  "doses":     [{ "id": "…", "protocolId": "…", "peptideId": "retatrutide", "at": "…", "doseMg": 0.5, "units": 4, "site": "Left thigh" }],
  "weights":   [{ "id": "…", "at": "…", "value": 198.4, "unit": "lb" }],
  "deleted":   { "protocols": [], "doses": [], "weights": [] }
}
```

## Rules carried over from v1

These all came from real mistakes. `HANDOFF.md` in the repo root explains each one.

- Protocols are stored as **mg**. Units are always worked out from the bottle,
  so changing the bottle rewrites every draw.
- The number shown is the **rounded mark** you can actually draw, and the
  calculator says what that mark really gives.
- The measurability floor: a draw under 4 marks on a high-risk compound (under
  2 on the rest) is flagged, with what to change. A 60 mg retatrutide bottle
  cannot measure 0.25 mg at any water it will hold.
- 5 mL is the most bac water a bottle takes.
- Retatrutide first-dose ceiling (0.5 mg to start, never over 1 mg), which
  stands down once there is a logged dose or a saved peptide.
- The redline is strictly above the top of a schedule, so the top step is not
  flagged as an error.
- Doubling from the last dose is flagged, as is more than a 55% jump.
- Bottles that changed strength without changing shape (MOTS-c 10 → 40 mg,
  BPC/TB 10 → 20 mg) show how many times the dose an old sheet's units would give.
- `type="text" inputmode="decimal"` everywhere, so typing "12.5" works, and
  typing only redraws the answer so the caret never leaves the field.
- The syringe scale is drawn after the plunger rod so the rod cannot hide it.
- mg is never converted to IU.

### New in v2

- **Weight tracking** with charts, and dose charts per peptide on the same time range.
- **The data file**, with automatic saving on Chrome and Edge, merging on open,
  and reading v1 backups.
- **Bottle countdown**: doses left and days until the 28-day discard date,
  with a one-tap **New Bottle**.
- **Step-up prompt**: once a schedule step has been held for its weeks, Today
  offers the next dose. It never changes the dose by itself.
- **Injection site rotation** in the Log Dose sheet, suggesting the least
  recently used spot.
- The default syringe is the smallest one that holds the draw, because its
  marks are furthest apart.
- The water suggestion only appears when the current amount causes a real
  problem, so it does not argue with a sheet that works (SS-31 at 3 mL).

### Left out on purpose

- Order planning and the detailed cost breakdown. Cost per dose and per month
  are on Today. v1 still has the full cost screens.
- The side-by-side "bottle changed" screen. The same warning now appears
  wherever the bottle is chosen.
- Any "should I take this" guidance.

## Running it

No build step. Plain ES modules.

```sh
cd v2
npm run serve   # http://localhost:8081
npm test        # node --test, no dependencies
```

## Putting it on a phone

Deploy it, open the address on the phone, then:

- **iPhone:** Share → **Add to Home Screen**
- **Android:** menu → **Install app**

It opens full screen with its own icon and works with no signal, because a
service worker keeps every file on the device. `npm test` fails if the offline
file list and the files that ship drift apart.

## Deploying to Netlify

- **Git:** set the site's *Base directory* to `v2`. Netlify reads `v2/netlify.toml`
  and publishes `v2/public` as-is.
- **Drag and drop:** drop the `v2/public` folder onto the Netlify dashboard.

The Content-Security-Policy allows no outside origins. There is no server to
send anything to.

## Editing the data

Bottle sizes, prices, schedules, notes and risks live in one file,
`public/js/data.js`. `npm test` checks that every schedule step can be drawn
from its default bottle, fits a 1 mL syringe and stays under its own limit.

To change the icon, edit `public/icon.svg` and run
`NODE_PATH=$(npm root -g) npm run icons` (needs Playwright).

## Scope

This works out how far to pull a syringe plunger. It cannot tell anyone
whether a compound is safe for them, it knows nothing about their health, and
it is not medical advice. Several compounds here have never been approved for
human use at any dose.
