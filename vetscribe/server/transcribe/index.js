/**
 * Speech to text. Two providers:
 *  - browser : the phone's live captions (Web Speech API) are the transcript.
 *              Free, instant, and good enough in a quiet exam room.
 *  - openai  : POST the recorded audio to any OpenAI-compatible
 *              /v1/audio/transcriptions endpoint (OpenAI, Groq, a local
 *              whisper.cpp or faster-whisper server). Falls back to the live
 *              captions if the call fails, and says so.
 *
 * transcribe({ audio, mime, liveTranscript }) -> { text, source, warning }
 */

export class BrowserTranscriber {
  name() { return 'browser'; }

  async transcribe({ liveTranscript }) {
    const text = (liveTranscript ?? '').trim();
    return {
      text,
      source: 'browser',
      warning: text ? null : 'No live captions were captured on the phone. Type or dictate the notes, or set up a transcription provider.',
    };
  }
}

export class OpenAICompatibleTranscriber {
  constructor({ url, apiKey, model, language = '', fetchImpl = globalThis.fetch, timeoutMs = 120000 }) {
    this.url = url;
    this.language = language;
    this.apiKey = apiKey;
    this.model = model;
    this.fetch = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  name() { return `openai-compatible:${this.model}`; }

  async transcribe({ audio, mime, liveTranscript, prompt }) {
    if (!audio || !audio.length) return new BrowserTranscriber().transcribe({ liveTranscript });
    if (audio.length > 25 * 1024 * 1024) {
      const live = (liveTranscript ?? '').trim();
      return { text: live, source: live ? 'browser (fallback)' : 'none', warning: 'The recording is over the 25 MB limit most Whisper endpoints accept. Record in shorter segments.' };
    }
    const form = new FormData();
    const ext = (mime ?? '').includes('mp4') ? 'mp4' : (mime ?? '').includes('ogg') ? 'ogg' : (mime ?? '').includes('wav') ? 'wav' : 'webm';
    form.append('file', new Blob([audio], { type: mime || 'audio/webm' }), `segment.${ext}`);
    form.append('model', this.model);
    form.append('response_format', 'json');
    if (this.language) form.append('language', this.language);
    if (prompt) form.append('prompt', prompt.slice(0, 800));
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(this.url, {
        method: 'POST',
        headers: this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {},
        body: form,
        signal: ctrl.signal,
      });
      const body = await res.text();
      if (!res.ok) throw new Error(`${res.status}: ${body.slice(0, 200)}`);
      const json = JSON.parse(body);
      const text = (json.text ?? '').trim();
      return { text, source: this.name(), warning: text ? null : 'The transcription service returned no text.' };
    } catch (e) {
      const live = (liveTranscript ?? '').trim();
      return {
        text: live,
        source: live ? 'browser (fallback)' : 'none',
        warning: `Transcription service failed (${e.message}). ${live ? 'Used the live captions from the phone instead.' : 'No live captions were available either.'}`,
      };
    } finally {
      clearTimeout(t);
    }
  }
}

export function createTranscriber(cfg) {
  switch (cfg.transcribe.provider) {
    case 'browser': return new BrowserTranscriber();
    case 'openai': return new OpenAICompatibleTranscriber({ url: cfg.transcribe.url, apiKey: cfg.transcribe.apiKey, model: cfg.transcribe.model, language: cfg.transcribe.language });
    default: throw new Error(`Unknown TRANSCRIBE_PROVIDER "${cfg.transcribe.provider}" (browser | openai)`);
  }
}
