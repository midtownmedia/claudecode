/**
 * The microphone. Records in chunks (so a dropped connection or a dead
 * battery loses seconds, not the visit), captions live with the browser's own
 * speech recognition where it exists, and keeps the screen awake.
 */

const SR = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export const support = {
  recorder: typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia),
  speech: Boolean(SR),
  wakeLock: typeof navigator !== 'undefined' && 'wakeLock' in navigator,
};

export function pickMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export class Recorder {
  constructor({ onChunk, onCaption, onLevel, onError, timeslice = 5000 }) {
    this.onChunk = onChunk; this.onCaption = onCaption; this.onLevel = onLevel; this.onError = onError;
    this.timeslice = timeslice;
    this.active = false;
    this.finalText = '';
    this.interim = '';
    this.mime = pickMime();
    this.startedAt = 0;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    this.rec = new MediaRecorder(this.stream, this.mime ? { mimeType: this.mime } : undefined);
    this.mime = this.rec.mimeType || this.mime || 'audio/webm';
    this.rec.ondataavailable = (e) => { if (e.data && e.data.size) this.onChunk?.(e.data); };
    this.rec.onerror = (e) => this.onError?.(e.error ?? new Error('Recorder error'));
    this.active = true;
    this.startedAt = Date.now();
    this.rec.start(this.timeslice);
    this.startSpeech();
    this.startMeter();
    await this.keepAwake();
  }

  startSpeech() {
    if (!SR) return;
    const begin = () => {
      if (!this.active) return;
      const r = new SR();
      this.sr = r;
      r.continuous = true;
      r.interimResults = true;
      r.lang = navigator.language || 'en-US';
      r.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i += 1) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) this.finalText += (this.finalText && !/\s$/.test(this.finalText) ? ' ' : '') + t.trim();
          else interim += t;
        }
        this.interim = interim;
        this.onCaption?.({ final: this.finalText, interim });
      };
      r.onerror = (e) => { if (!['no-speech', 'aborted', 'network'].includes(e.error)) this.onError?.(new Error(`Captions: ${e.error}`)); };
      // Browsers stop continuous recognition after a pause; start it again.
      r.onend = () => { if (this.active) setTimeout(begin, 150); };
      try { r.start(); } catch { /* already started */ }
    };
    begin();
  }

  startMeter() {
    if (!this.onLevel || typeof AudioContext === 'undefined') return;
    try {
      this.ctx = new AudioContext();
      const src = this.ctx.createMediaStreamSource(this.stream);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 512;
      src.connect(this.analyser);
      const buf = new Uint8Array(this.analyser.fftSize);
      const tick = () => {
        if (!this.active) return;
        this.analyser.getByteTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
        this.onLevel(Math.sqrt(sum / buf.length));
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    } catch { /* no meter, no problem */ }
  }

  async keepAwake() {
    if (!support.wakeLock) return;
    try {
      this.lock = await navigator.wakeLock.request('screen');
      this.onVisible = async () => { if (this.active && document.visibilityState === 'visible') { try { this.lock = await navigator.wakeLock.request('screen'); } catch { /* ignore */ } } };
      document.addEventListener('visibilitychange', this.onVisible);
    } catch { /* not granted; recording still works with the screen on */ }
  }

  /** Stops everything and resolves once the last chunk has been handed over. */
  async stop() {
    if (!this.active) return { liveTranscript: this.finalText, mime: this.mime, durationMs: 0 };
    this.active = false;
    try { this.sr?.stop(); } catch { /* ignore */ }
    cancelAnimationFrame(this.raf);
    await new Promise((resolve) => {
      if (this.rec.state === 'inactive') return resolve();
      this.rec.onstop = resolve;
      this.rec.stop();
    });
    for (const t of this.stream.getTracks()) t.stop();
    try { await this.ctx?.close(); } catch { /* ignore */ }
    try { await this.lock?.release(); } catch { /* ignore */ }
    if (this.onVisible) document.removeEventListener('visibilitychange', this.onVisible);
    const text = (this.finalText + (this.interim ? ` ${this.interim}` : '')).trim();
    return { liveTranscript: text, mime: this.mime, durationMs: Date.now() - this.startedAt };
  }
}
