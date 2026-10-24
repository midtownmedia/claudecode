# VetScribe

An ambient scribe for a veterinary practice. A phone on a lanyard records the
technician's intake and the doctor's exam, the server transcribes each
recording and drafts the SOAP note grounded in what the practice management
system (PIMS) already knows about the patient, and the finished note goes back
into the PIMS with the discrete actions (vitals, vaccines given, lab orders,
prescriptions, declined recommendations) that someone would otherwise have to
re-key.

```
phone (PWA, badge mode)  ->  server (Node, no framework)  ->  Claude (SOAP draft)
         ^                           |        ^
         |                           v        |
     schedule, briefing          PIMS bridge  transcription (phone captions or Whisper-compatible)
```

## What a visit looks like

1. **Schedule.** The phone shows today's appointments from the PIMS. Each row
   carries the flags the record raises before anyone walks in: weight change
   since last visit, overdue vaccines and preventives, alerts (fractious,
   brachycephalic, Fear Free), allergies, chronic problems, and the
   recommendations the client declined last time.
2. **Tech intake.** The technician taps the patient, then *Tech intake*, and the
   phone goes into badge mode: one big stop button, a timer, and live captions.
   When they stop, the server transcribes and drafts the **intake form** plus
   the **S and O** of the SOAP. The assessment is marked *doctor exam pending*;
   the owner's questions land under *For the doctor*.
3. **Doctor exam.** The doctor taps *Doctor exam* and talks through the exam and
   the conversation as usual. Stopping completes the SOAP: physical exam by
   system, the doctor's assessment and differentials (only the ones the doctor
   said), treatments, prescriptions as spoken, client communication (what was
   discussed, declined, estimated, consented to), follow-up, and the PIMS
   actions.
4. **Voice note.** Any time, from anyone. The note redrafts and lists what
   changed.
5. **Review and send.** The visit page shows the note, *Check before signing*
   flags (missing vitals, numbers that contradict the record, drug doses
   that need confirming, open recommendations that were never addressed), the
   transcript quotes behind the key statements, and a checklist of PIMS
   actions. *Send to PIMS* posts the note text, the structured SOAP, the
   vitals and the ticked actions through the bridge.

Nothing is invented. A vital nobody said is null. A body system the doctor did
not examine aloud is left out rather than marked normal. When the room and the
record disagree, the note says what was said in the room and flags the record.

## Run it

```bash
cd vetscribe
npm install
cp .env.example .env     # fill in what you have
npm start                # http://localhost:8090
```

With an empty `.env` it runs end to end on a seeded demo day, a keyword-based
mock scribe and the phone's own captions, so you can learn the flow before
spending anything. Open it on a phone on the same network, add it to the home
screen, set your name in Settings.

### Settings that matter

| Variable | What it does |
|---|---|
| `ANTHROPIC_API_KEY` | Turns on the real scribe. |
| `VETSCRIBE_MODEL` | `claude-sonnet-5-5` by default. It is accurate on doses and vitals and costs about 4 to 5 cents per complete visit. `claude-haiku-5-5` is roughly 20x cheaper; trial it on your own transcripts before switching. |
| `VETSCRIBE_EFFORT` | `medium`. This is organisation work, not reasoning. |
| `TRANSCRIBE_PROVIDER` | `browser` uses the live captions the phone captured (free; Chrome on Android and Safari on iOS both do this). `openai` posts the audio to any OpenAI-compatible `/v1/audio/transcriptions` endpoint: OpenAI, Groq, or a local whisper.cpp / faster-whisper server. If that call fails, the captions are used and the note says so. |
| `PIMS_ADAPTER` | `mock` for the demo day; `bridge` for your practice system. |
| `AUTH_TOKEN` | A shared device token. Each phone enters it once in Settings. |
| `DATA_DIR` | Where visits, drafts and audio live. One JSON file per visit; back it up like any other record. |

## Connecting the practice management system

The app never talks to the PIMS directly. It talks to a **bridge**: four HTTP
endpoints that you (or your PIMS vendor's integrator) implement once against
whatever you run, whether ezyVet, Cornerstone, AVImark, Shepherd, Pulse,
Vetspire or Digitail. The app only ever changes if the bridge contract does.

```
GET  {PIMS_BRIDGE_URL}/schedule?date=YYYY-MM-DD      -> { "appointments": [Appointment] }
GET  {PIMS_BRIDGE_URL}/appointments/{id}             -> Appointment
POST {PIMS_BRIDGE_URL}/appointments/{id}/status      <- { "status": "in_room" | "complete" }
POST {PIMS_BRIDGE_URL}/appointments/{id}/note        <- { patientId, signedBy, text, soap, intake, vitals, actions }
                                                     -> { "noteId": "...", "accepted": true }
```

Requests carry `Authorization: Bearer {PIMS_BRIDGE_TOKEN}`.

The `Appointment` shape is documented in `server/pims/normalize.js`. The short
version, and why each part is there:

| Field | Why the SOAP wants it |
|---|---|
| `type`, `reason`, `notes` | The chief complaint as booked, and what the front desk heard on the phone. |
| `patient` signalment: species, breed, sex, dob, color, microchip | The note header, and age-appropriate context. |
| `patient.weightHistory` (newest first) | Turns today's weight into a trend; a loss of 5% or more is flagged before the visit. |
| `patient.alerts` | Handling and sedation warnings show on the schedule. |
| `patient.problems`, `medications`, `allergies` | Keeps the plan from contradicting the record; anything the room says differently becomes a flag plus a PIMS action to fix the record. |
| `patient.vaccines`, `preventives` | Overdue items are flagged, and flagged again if the visit never addressed them. |
| `patient.labs` | Recent results in the briefing so the doctor's "same as last time" has a referent. |
| `patient.recentVisits` (assessment and plan) | What this visit is a follow-up to. Carried into *Pertinent history*. |
| `patient.openRecommendations` | What the client declined or never scheduled. Flagged if not raised today. |
| `client` with `preferredContact`, `notes` | How to follow up, and things like "wants written estimates". |

Leave out what your system can't source. Empty fields normalise cleanly and
the briefing says "none recorded" rather than guessing.

The note POST carries three representations so the bridge can choose:
`text` (the finished SOAP as plain text, ready for a medical record entry),
`soap` (the structured note, see `server/ai/schemas.js`), and `actions`, the
ticked checklist of things to record, each with a `kind` such as
`vitals_update`, `vaccine_given`, `lab_order`, `prescription`,
`treatment_charge`, `reminder`, `problem_update`, `recheck_booking`,
`client_note` or `declined_recommendation`, a `detail` and a supporting quote.
A first bridge can file `text` as a note and ignore the rest; a second pass
can map `actions` onto invoice lines and reminders.

## How the draft is made

`server/ai/prompts.js` is the scribe's standing instructions; read it to see
exactly what the model is told. `server/ai/schemas.js` is the shape it must
fill, enforced by Claude's structured output so a draft never comes back as
free text. Every request is:

1. the frozen system prompt (cached),
2. the pre-visit briefing built from the PIMS record (cached per visit),
3. every transcript segment so far, labelled by role, plus the previous draft
   if one exists and whether a person edited it,
4. the stage: technician intake only, doctor exam recorded, voice note, or
   redraft.

The call is `client.beta.messages.parse` with `fallbacks: "default"`, so a
policy decline on the primary model re-runs on Anthropic's fallback rather than
leaving a visit without a note. Refusals and truncation surface as errors on
the visit with a Retry button; they never become an empty note.

## Layout

```
server/
  app.js            routes and static serving (node:http, no framework)
  visits.js         the visit lifecycle: open, record, transcribe, draft, edit, finalize
  store.js          one JSON file per visit, atomic writes, audio appended per segment
  config.js         environment
  ai/
    prompts.js      the scribe's rules and the per-visit request
    schemas.js      intake + SOAP shapes (structured output)
    context.js      PIMS record -> briefing text + schedule flags
    client.js       Anthropic model, and the keyword mock used without a key
    render.js       structured SOAP -> the plain text that goes in the record
  pims/
    normalize.js    the one record shape; adapters produce it
    mock.js         a seeded day
    bridge.js       the HTTP contract above
  transcribe/       browser captions, or an OpenAI-compatible endpoint
public/             the phone app: schedule, visit, badge mode, settings
test/               node --test; runs the real routes against the mock stack
```

`npm test` covers the store, the PIMS adapters, the briefing, the scribe (with
the mock model and with a fake Claude client that checks the request shape),
the visit lifecycle, the HTTP API including the device token, and the PWA
shell.

## What to know before relying on it

- **Transcription quality decides note quality.** Browser captions are fine in
  a quiet room on a recent phone; a Whisper-class provider is better with
  drug names and overlapping speech. The server passes the patient's name and
  current medications to the transcriber as a vocabulary hint.
- **Audio is not diarised.** The scribe infers who is speaking from content.
  Starting the technician and doctor recordings separately is what gives it a
  reliable signal.
- **Every draft is a draft.** The flags are there to be read. The note says
  *doctor exam pending* in capitals until a doctor segment exists, and the app
  asks before sending such a note.
- **Audio and transcripts are medical records.** They stay in `DATA_DIR` on
  your server. Run the server inside the practice network or behind TLS, set
  `AUTH_TOKEN`, and back up the data directory. Claude's API does not train
  on your data; check your retention settings in the Anthropic console.
- **The bridge is yours to build.** The mock shows the shape; no vendor API is
  wired in here, because each one needs credentials and a tenant to test
  against. Say which PIMS you run and the bridge is the next piece.
