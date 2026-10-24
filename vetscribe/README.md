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
| `TRANSCRIBE_PROVIDER` | `openai` (the default once `TRANSCRIBE_API_KEY` is set) posts each recording to any OpenAI-compatible `/v1/audio/transcriptions` endpoint: OpenAI's hosted Whisper, Groq, or a whisper.cpp / faster-whisper server inside the practice. `browser` uses only the phone's live captions. If the Whisper call fails, the captions are used as a fallback and the note says so. |
| `CAPTIONS` | Live captions on the badge screen. They use the phone's speech service (Google on Android, Apple on iOS), so they default to off once Whisper is configured. |
| `KEEP_AUDIO`, `AUDIO_RETENTION_DAYS` | Delete each recording as soon as it is transcribed, or keep it for review and sweep it after N days. Transcripts and notes are kept either way. |
| `PIMS_ADAPTER` | `mock` for the demo day; `daysmart` for DaySmart Vet (Vetter); `bridge` for anything else. |
| `AUTH_TOKEN` | A shared device token. Each phone enters it once in Settings. |
| `DATA_DIR` | Where visits, drafts and audio live. One JSON file per visit; back it up like any other record. |

## Connecting DaySmart Vet (Vetter)

`server/pims/daysmart.js` is built from DaySmart's public API reference
(`sandbox.vettersoftware.com/docs`). What that reference establishes, and what
the adapter therefore does:

- **Auth:** OAuth2 client credentials. `POST /oauth/access_token` with
  `grant_type=client_credentials`, `client_id`, `client_secret` and an
  `x-api-key` header; the token lasts an hour and is cached. Every request
  then carries `Authorization: Bearer`, `x-api-key` and the clinic ID in a
  header. The reference does not show that header's name, so it is
  `DAYSMART_CLINIC_HEADER` (default `x-clinic-id`).
- **Paths:** `https://{domain}/api/1.0.0/{apiKey}/appointments`,
  `/patients`, `/clients`, `/appointment-providers`, `/appointment-types`,
  `/communications`. Lists take `page` and `perPage` (max 200) and come back
  as `{ response: { message, meta, resources: [...] } }`.
- **Reads:** the day's appointments (the reference documents no date filter,
  so the day is selected from the list; `DAYSMART_SCHEDULE_QUERY` adds one if
  the probe finds it), each enriched from `/patients/{id}` and
  `/clients/{id}`. Patient resources carry name, species, breeds, sex,
  birthdate, color and chip; weight is not on the patient.
- **What is not documented:** where weights, vaccines and prior SOAPs live,
  and any endpoint that writes a medical record. `DAYSMART_RECORDS_PATH`, once
  the probe shows a records list, is mined by field name for weights,
  vaccines, labs, prescriptions and notes. Write-back defaults to an
  **outbox**: the finished note is saved under `DATA_DIR/outbox/` and the
  phone shows *Paste into Vetter* with a Copy button. `DAYSMART_NOTE_MODE=communication`
  additionally posts the note as a communication entry on the client record.

First day with credentials:

```bash
node --env-file=.env scripts/daysmart-probe.mjs
```

It gets a token, pulls one page each of appointments, providers, types,
patients and clients, tries the likely patient-record paths, saves every raw
response under `DATA_DIR/probe/`, prints the field names it saw, and shows the
first appointment as VetScribe would map it. Compare the keys with the
`pick()` names in `server/pims/daysmart.js`; field names the reference did not
show are guesses with the camelCase and snake_case variants covered.

Things to ask DaySmart for when requesting developer access: the clinic ID
header name, whether the appointments list takes a date range, the patient
records or medical history endpoint, and whether a SOAP or medical record can
be created through the API. The last one turns the outbox into a real
write-back.

## Connecting any other practice management system

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
    daysmart.js     DaySmart Vet (Vetter): OAuth2, reads, outbox write-back
    bridge.js       the HTTP contract above
  transcribe/       Whisper (any OpenAI-compatible endpoint), or browser captions
public/             the phone app: schedule, visit, badge mode, settings
scripts/            daysmart-probe.mjs (confirm the live API shapes), icon rendering
test/               node --test; runs the real routes against the mock stack
```

`npm test` covers the store, the PIMS adapters, the briefing, the scribe (with
the mock model and with a fake Claude client that checks the request shape),
the visit lifecycle, the HTTP API including the device token, and the PWA
shell.

## Privacy: what leaves the building, and what does not

Veterinary records are not HIPAA, but client names, phone numbers and
addresses are personal data and the practice is responsible for them. The
defaults are set so the minimum leaves the practice.

**What Claude receives** per draft: the pre-visit briefing and the transcripts.
The briefing carries the patient's record (signalment, weights, problems,
medications, vaccines, labs, last visit, open recommendations), the owner's
**first name only**, their preferred contact method, and the practice's client
notes. It never carries phone numbers, email addresses or postal addresses;
the note header is filled from the record on your server after the draft comes
back. Transcripts contain whatever was said in the room. Anthropic does not
train on API inputs; check the data retention setting on your Anthropic
organisation (zero data retention can be requested).

**What the transcription service receives:** the audio of each segment, plus a
vocabulary hint made of the patient's name and current medications (not the
client's name). With OpenAI or Groq that is their servers; with whisper.cpp or
faster-whisper on a machine in the practice it never leaves the network, and
the adapter is the same either way (`TRANSCRIBE_URL`).

**What the phone's browser sends:** nothing, unless live captions are on.
Captions use the browser's speech service (Google on Android Chrome, Apple on
iOS Safari), so they are off by default once Whisper is configured.

**What is stored on your server:** one JSON file per visit under `DATA_DIR`
(the record snapshot with phone and email stripped, transcripts, drafts, the
final note) and the audio. Audio is deleted after transcription with
`KEEP_AUDIO=false`, or kept and swept after `AUDIO_RETENTION_DAYS`. Visit files
are kept; they are your medical record of the draft and should be backed up
with the rest of the practice data.

**What the app reads from DaySmart:** appointments, patients and clients for
the day being shown, and patient records if a path is configured. It writes
nothing to the PIMS unless `DAYSMART_NOTE_MODE=communication`. The developer
credentials DaySmart issues are clinic-wide; the app cannot narrow their scope,
so treat `.env` as a secret and run the server on a machine the practice
controls.

**Limitations to know before connecting**

- One shared device token, no per-user accounts, no audit trail beyond the
  signer's self-reported name on each visit. Fine for a single practice on its
  own network; not an access-control system.
- Traffic between phone and server is plain HTTP unless you put TLS in front
  of it (a reverse proxy with a certificate, or Tailscale). Do that before the
  phones leave the building's Wi-Fi.
- Audio is not diarised. A client's own words are attributed by context, not
  by voice.
- The phone captions, if enabled, are a third-party speech service.
- The DaySmart write-back is an outbox until DaySmart confirms a medical
  record endpoint. Nothing is written to the EMR automatically by default.

## What to know before relying on it

- **Transcription quality decides note quality.** Whisper is the default for
  that reason. The server passes the patient's name and current medications
  to the transcriber as a vocabulary hint; the phone's captions are only a
  fallback if the Whisper call fails.
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
- **The DaySmart mapping is unverified against a live tenant.** It follows
  the public reference and tolerates the usual naming variants, and the probe
  script exists to confirm it on day one. Expect to adjust a few field names.
