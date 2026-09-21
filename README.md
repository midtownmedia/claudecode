# Peptide dosing

A reconstitution calculator, bottle-strength checker, dose log and running cost
tracker for injectable peptide protocols. Static site, no backend, no accounts,
nothing leaves the browser.

## The problem it exists to solve

Protocol sheets are written in **syringe units**: "week 1, 6 units". But a unit
is not a dose. A unit is 0.01 mL of whatever happens to be in the bottle, so the
same instruction means completely different amounts depending on the bottle
strength and how much water went in.

Suppliers have been changing bottle strengths while keeping the bottle physically
identical. When that happens, every number on the sheet silently becomes wrong:

| Compound | Sheet written for | Bottles now | Drawing the old units gives |
|---|---|---|---|
| MOTS-c | 10 mg | 40 mg | **4x** the intended dose |
| BPC-157 / TB-500 blend | 10 mg | 20 mg | **2x** the intended dose |
| Retatrutide | strength unstated | 60 mg | up to **6x**, depending on assumption |

SS-31 is the one that has not moved: its sheet quoted both the unit counts and
the resulting mg, and those only reconcile at 50 mg in 3 mL, which is still what
ships.

The app stores every protocol as a **dose in mg** and derives the units from
whichever bottle you tell it you have. Change the bottle in the dropdown and the
whole ladder is rewritten.

## What it does

- **Draw** — pick the compound, your bottle strength and how much bac water you
  added, and it tells you how far to pull the plunger, with the syringe drawn to
  the mark. Shows units and mg together, always.
- **Bottle changed** — put the old bottle and the new one side by side. Get the
  headline multiplier ("draw a quarter the units"), the rewritten ladder, and a
  loud warning if drawing by habit would overdose.
- **Protocols** — track the live vial, its beyond-use date, where you are on a
  titration ladder, and when the next dose is due.
- **Log** — dose history with injection-site rotation that suggests the least
  recently used spot.
- **Cost** — cost per dose, per day, per month and per year, including
  bac water and syringes. Course-based compounds report both the on-cycle cost
  and the figure averaged across the year.
- **Order** — price a whole order and see how many days it actually covers, plus
  which line runs dry first.
- **Reference** — dose ranges, risks, evidence level, red-flag symptoms and
  handling notes.

### Terms

The **peptide** is the drug. It arrives as a dried powder and the label states
how many **mg** are in the bottle.

**Bacteriostatic water** is the diluent. You add it in **mL** — 3 mL is common,
5 mL is the most a bottle takes. It is the only diluent here; plain sterile
water holds sterility for about a day, so it is no use for a vial you will draw
from for weeks.

**Units** are neither. They are the marks on the syringe, used only to measure a
dose. On a U-100 syringe 1 mL = 100 units, which is also how you measure the bac
water going in: 3 mL is 300 units on the same syringe.

### Things it deliberately does

- **Refuses to convert mg to IU.** That conversion is compound specific, so
  guessing it is exactly the kind of error this app exists to catch.
- **Shows what the rounded mark really delivers**, not just the ideal number.
  If 6.67 units rounds to 7, it says you are getting 5% more than you asked for.
- **Recommends how much bac water to add** so the ladder lands on whole marks,
  and treats a measurable starting dose as a hard constraint rather than
  something to trade off against tidiness.
- **Knows the smallest dose a bottle can deliver.** Below a few marks you are
  estimating rather than measuring, so each bottle has a floor. A 60 mg
  retatrutide bottle at full dilution bottoms out near 0.5 mg, which is why
  that is the starting dose rather than anything lower.
- **Caps bac water at 5 mL**, which is all a bottle will take.
- **Shows the money on the screen you actually use.** Cost per dose sits under
  the draw itself, broken into the share of the bottle, the water and the
  syringe, so the figure is checkable rather than something to take on trust.
- **Enforces a first-dose ceiling** on the compounds where that matters, and
  stands down once you have logged a dose or saved a protocol, so it does not
  cry wolf at someone already mid-ladder.
- **Offers to halve a dose** on compounds commonly split for nausea. The daily
  amount is unchanged — it shows the same draw as two halves, morning and
  night, and says so only as a suggestion.

## Running it

No build step. It is plain ES modules.

```sh
npm run serve      # http://localhost:8080
npm test           # 61 tests, no dependencies
```

## Putting it on a phone

The app installs to a home screen as-is. That is the route worth taking: it
works on both Android and iPhone, it updates itself the next time it is opened,
and there is no sideloading to talk anyone through.

1. Deploy it (below) and open the URL on the phone.
2. **Android / Chrome:** the browser offers "Install app", or use the menu →
   Add to Home screen.
3. **iPhone / Safari:** Share → Add to Home Screen. iOS has no install prompt,
   so this step has to be done by hand.

It then opens full screen with its own icon, and **works with no signal** — the
whole app is precached by a service worker, which matters because this gets
used at a fridge or in a bathroom where reception is often bad. `npm test`
fails if the cache list drifts out of step with the files that actually ship.

### Building an APK

Only worth it if you specifically need a sideloadable file. An APK has to be
rebuilt and redistributed to everyone for every change, only covers Android,
and needs "install from unknown sources" turned on.

The Capacitor scaffold is configured and ready; it bundles the web files into
the app, so it does not depend on the site being hosted anywhere. It needs a
JDK (17+) and the Android SDK, which is why it cannot be built in a sandbox
without access to Google's download hosts.

```sh
npm run android:init    # installs Capacitor and creates android/
npm run android:apk     # -> android/app/build/outputs/apk/debug/app-debug.apk
```

`npm run android:open` opens the project in Android Studio if you would rather
build a signed release there. After changing anything under `public/`, run
`npm run android:sync` to copy it across.

## Deploying to Netlify

`netlify.toml` is configured to publish `public/` with no build command.

- **Git:** connect the repo. Netlify reads `netlify.toml` and deploys as-is.
- **Drag and drop:** drop the `public/` folder onto the Netlify dashboard.
- **CLI:** `npx netlify-cli deploy --prod`

The site ships a Content-Security-Policy with `connect-src 'self'` and no
external origins. There is no backend to talk to, and the policy is there to
keep it that way.

## Your data

Everything lives in `localStorage` in one browser. There is no account, no sync
and no analytics. Clearing site data erases it, so Reference → Export backup
writes a JSON file you can import again later.

## Keeping the data current

Bottle strengths and prices move. They live in one file,
`public/js/data/peptides.js`:

- `strengthOptions` — the sizes that show up in the dropdown
- `defaultStrength` — what is currently shipping
- `strengthChanged` — records a strength that has moved, which drives the
  warning banner on the reference screen
- `pricing` — bottle price and the strength it applies to
- `ladder` — the protocol, always in mg, and always the dose as written rather
  than a dose already divided up
- `splitDose` — offers the halving suggestion on compounds where splitting
  helps tolerability

`test/protocol.test.js` checks each compound for internal consistency: the
default strength has to be a listed bottle size, the default diluent has to fit
the vial, and no ladder step may trip its own redline. Run `npm test` after
editing.

## Building another version

`HANDOFF.md` is written for someone implementing this independently: the domain
facts, the constraints that came from the people using it, the bugs that are
easy to hit, and what was deliberately left out.

## Scope

This works out how far to pull a syringe plunger and what that costs. It cannot
tell you whether any of this is safe for you, it knows nothing about your health,
and it is not medical advice. Several compounds in the reference have never been
approved for human use at any dose.
