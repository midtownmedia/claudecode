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

### Things it deliberately does

- **Refuses to convert mg to IU.** That conversion is compound specific, so
  guessing it is exactly the kind of error this app exists to catch.
- **Shows what the rounded mark really delivers**, not just the ideal number.
  If 6.67 units rounds to 7, it says you are getting 5% more than you asked for.
- **Recommends a diluent volume** that makes the ladder land on whole marks. For
  a 60 mg bottle, 6 mL makes one unit exactly 0.1 mg, so units and mg differ only
  by a decimal point.
- **Catches doses it cannot measure.** A 60 mg bottle cannot deliver 0.25 mg on
  any readable mark, so it works out a secondary dilution into a second sterile
  vial instead.
- **Enforces a first-dose ceiling** on the compounds where that matters.

## Running it

No build step. It is plain ES modules.

```sh
npm run serve      # http://localhost:8080
npm test           # 45 tests, no dependencies
```

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
- `ladder` — the protocol, always in mg

`test/protocol.test.js` checks each compound for internal consistency: the
default strength has to be a listed bottle size, the default diluent has to fit
the vial, and no ladder step may trip its own redline. Run `npm test` after
editing.

## Scope

This works out how far to pull a syringe plunger and what that costs. It cannot
tell you whether any of this is safe for you, it knows nothing about your health,
and it is not medical advice. Several compounds in the reference have never been
approved for human use at any dose.
