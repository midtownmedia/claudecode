# Handoff: peptide dosing tool

Everything worth knowing before building a version of this. Written for someone
starting fresh, not for someone reading the code — the findings below cost a
round-trip each to discover, and most of them are not obvious from the outside.

## What it is for

A small group of people injecting research peptides, who are not medically
trained and find arithmetic genuinely hard. They already have written protocols
from a supplier. They are not asking whether to do this; they are asking how
many units to draw. The tool exists so they don't get that wrong.

One person in the group does have a medical background and answers everyone
else's maths questions by text. The tool is meant to replace those texts.

## The one idea the whole thing rests on

**Protocol sheets are written in syringe units, and a unit is not a dose.**

A unit is 0.01 mL of whatever happens to be in the bottle. So "week 1: 6 units"
only means something for one exact bottle strength and one exact amount of
water. Change either and the same written instruction delivers a different dose,
silently.

Suppliers have been changing bottle strengths while keeping the bottle
physically identical:

| Compound | Sheet written for | Now ships as | Same units now gives |
|---|---|---|---|
| MOTS-c | 10 mg | 40 mg | **4×** the dose |
| BPC-157/TB-500 blend | 10 mg | 20 mg | **2×** the dose |
| Retatrutide | strength never stated | 60 mg | up to **6×**, depending what you assume |

So: **store every protocol as a dose in mg; derive units from the bottle.**
Never store a unit count. Changing the bottle should rewrite the whole schedule
automatically. If you store units, you have rebuilt the bug.

Corollary: the unit multiplier is **not** the strength ratio whenever the water
volume also differs. MOTS-c went 10→40 mg (4×) but with 4 mL instead of the
sheet's 3 mL the units actually move by a third. Compute from concentrations,
and if you show both numbers, explain why they differ or it reads as a
contradiction.

## Verified domain facts

Reconstitution: `concentration = strength / water`, `units = dose / concentration × 100`
on a U-100 syringe (100 units = 1 mL, 1 unit = 0.01 mL).

Real constraints from the people using it:

- **A bottle takes at most 5 mL of bac water.** Not negotiable, not per-compound.
- **Bacteriostatic water is the diluent.** Not a choice among diluents. It is
  0.9% benzyl alcohol, multi-dose, commonly 28 days refrigerated after first
  puncture. Plain sterile water holds sterility about 24 hours and is not used.
- **Nobody has spare empty sterile vials.** This kills secondary dilution as a
  recommendation, which matters — see retatrutide below.
- Prices per bottle, as of this writing: Retatrutide 60 mg $200 · MOTS-c 40 mg
  $275 · SS-31 50 mg $230 · NAD+ 500 mg $120 · GLOW 70 mg $130 · BPC/TB-500
  blend 20 mg $120 · Melanotan I 10 mg $45 · Epitalon 50 mg $170.

### Compound specifics that took work to pin down

**Retatrutide (60 mg) — the only one with real harm potential.**
Start at 0.5 mg, never exceed 1 mg for a first dose, escalate slowly.
A 60 mg bottle **cannot measure 0.25 mg at any dilution it will hold** — at the
full 5 mL it works out to about 2 marks, which is a guess, not a measurement.
That is why 0.5 mg is the starting dose: at 5 mL it lands on 4 units. Use
5 mL (max dilution) even though 3 mL gives a tidier ladder, because a
measurable first dose beats a tidy tenth step.

**MOTS-c (40 mg) — use 4 mL, not 5.** At 4 mL one unit is exactly 0.1 mg, so
the whole 0.2–1.0 mg schedule lands on whole marks and units ÷ 10 = mg. At 5 mL
you get 2.5, 7.5, 12.5. More water is not automatically better; hitting a round
number per unit is what matters.

**SS-31 (50 mg) — has not drifted.** Its sheet quoted both units and mg, and
30 units = 5 mg only resolves at 50 mg in 3 mL. Worth knowing because the price
makes people suspect a strength change. At 10 mg/day it is **$46/dose, ~$1,400
a month**, which is over half the group's total spend.

**Epitalon (50 mg) — 5 mg/day for 20 days, roughly twice a year.** Split into
two halves morning and night to cut nausea. The split must not change anything:
same daily total, same bottles per course (2), same cost. Assert that.

## Bugs you will probably hit

These are not hypothetical. Each one shipped and had to be caught.

1. **`<input type="number">` swallows decimals.** Mid-way through typing "12."
   the browser reports `value === ""`, so the decimal point cannot survive a
   round trip through state. Typing "12.5" yields "12" or "125". Use
   `type="text" inputmode="decimal"` and parse yourself. Bonus: a stray scroll
   wheel can no longer change a dose.
2. **A full re-render on every keystroke destroys focus.** If you rebuild the
   DOM on input, the caret leaves the field after the first character. Either
   don't rebuild, or give controls stable keys and restore focus, caret and the
   half-typed text afterwards. Disclosures need the same treatment or they snap
   shut while you type inside them.
3. **Draw the syringe scale *after* the plunger rod.** The rod is opaque; drawn
   over the graduations it hides every mark to its right, which on a small draw
   is nearly all of them. Only visible at wide viewports or small doses.
4. **Doses-per-period maths must know the cadence.** A "bottles per course"
   helper that assumes one dose a day under-orders a split protocol by half.
5. **Don't let a ladder's top step equal its own redline**, or the highest
   legitimate dose flags as a reconstitution error.
6. **A first-dose ceiling that only checks a dose log cries wolf.** On a fresh
   browser every experienced user gets a red DANGER banner. Count a saved
   protocol as history too, and phrase it conditionally. A warning that fires
   when it shouldn't teaches people to ignore the ones that matter.
7. **Show money to the penny wherever it has to add up.** `$46 + $0.60 + $0.20`
   under a total of `$47` reads as an arithmetic error and undermines every
   other number on the page.

## Interface lesson

The first version put six input fields, five stat tiles and seven tabs on the
screen people would use daily. It was correct and overwhelming.

**Separate setting it up from using it.** Everything needed to answer "how many
units tonight" is entered once, at setup. The daily screen should have **zero
inputs**: the syringe drawn to the mark, the number in the largest type on the
page, what it is in mg, and a button that says "I took this dose". Everything
else is one tap away, not in front of you.

Other things that helped: plain language ("bac water", not "diluent"; "your
schedule", not "titration ladder"), one control per value (a dropdown plus an
always-visible number box for the same field reads as a puzzle), and menu labels
that match the headings they lead to.

Show units and mg together, always. Draw the syringe — for this audience the
picture is the answer and the number is the footnote.

## What it must do

- Reconstitution both directions: dose → units, and units → dose.
- Report what the **rounded** mark actually delivers, not the ideal number.
- Recommend a water volume that lands the schedule on whole marks, treating a
  measurable first dose as a hard constraint rather than a tiebreaker.
- Know each bottle's floor — the smallest dose it can deliver — and say so when
  a protocol asks for less.
- Compare two bottles side by side and rewrite the schedule between them.
- Refuse to convert mg to IU. That conversion is compound-specific; guessing it
  is exactly the class of error the tool exists to catch.
- Cost per dose / day / month / year, including bac water and syringes, with
  on-cycle and annualised figures separated for course-based compounds.
- Work offline. It gets used at a fridge and in a bathroom.
- Keep all data on the device. No account, no backend, no analytics. Health
  data about other people should not leave the phone.

## Deliberately not done

- **Secondary dilution into a second vial.** The maths is implemented and
  tested but not surfaced, because nobody has spare sterile vials. Revisit if
  that changes.
- **An APK.** Installing to the home screen covers iPhones too and updates
  itself; an APK is Android-only, needs unknown-sources enabled, and has to be
  rebuilt and redistributed for every change.
- **Any "should I take this" guidance.** The tool answers how much, not whether.

## Open questions

- Whether SS-31 at 10 mg/day is what anyone actually wants to run at $1,400 a
  month. Left as-is deliberately, so the cost is visible at every dose.
- Epitalon's schedule came verbally rather than from a sheet; worth confirming.
- Bottle strengths drift without notice. Whatever you build needs an obvious
  place to change them, and should warn loudly when a sheet predates a change.

## Ground rules

Dose figures describe what these compounds are commonly given at — from trial
protocols where they exist and circulated sheets where they do not. They are not
recommendations, and several of these compounds have no approved human dose at
any level. Say so in the product.

Don't put real people's names, doses or sensitivities in source control. The
protocol data here is arithmetic; who takes what is not.
