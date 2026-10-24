/**
 * Everything the server needs from the environment, read once.
 * Defaults make `npm start` work with no key and no PIMS: a seeded day, a
 * mock scribe, and the phone's own live captions as the transcript.
 */

import { resolve } from 'node:path';

const env = (k, d = '') => (process.env[k] ?? d).toString().trim();

export function loadConfig(overrides = {}) {
  const hasKey = Boolean(env('ANTHROPIC_API_KEY'));
  const aiProvider = env('AI_PROVIDER', hasKey ? 'anthropic' : 'mock');
  const cfg = {
    port: Number(env('PORT', '8090')),
    dataDir: resolve(env('DATA_DIR', './data')),
    practiceName: env('PRACTICE_NAME', 'Veterinary Practice'),
    practiceTz: env('PRACTICE_TZ', 'America/New_York'),
    authToken: env('AUTH_TOKEN'),
    privacy: {
      keepAudio: env('KEEP_AUDIO', 'true') !== 'false',
      audioRetentionDays: Number(env('AUDIO_RETENTION_DAYS', '30')),
      // Live captions use the phone browser's speech service (Google on
      // Android Chrome, Apple on iOS). Off by default once Whisper is in use.
      captions: env('CAPTIONS', env('TRANSCRIBE_PROVIDER', env('TRANSCRIBE_API_KEY') ? 'openai' : 'browser') === 'browser' ? 'on' : 'off') === 'on',
    },
    ai: {
      provider: aiProvider,
      model: env('VETSCRIBE_MODEL', 'claude-sonnet-5-5'),
      effort: env('VETSCRIBE_EFFORT', 'medium'),
      hasKey,
    },
    transcribe: {
      // Whisper whenever a key is present; the phone's captions only as the fallback.
      provider: env('TRANSCRIBE_PROVIDER', env('TRANSCRIBE_API_KEY') ? 'openai' : 'browser'),
      url: env('TRANSCRIBE_URL', 'https://api.openai.com/v1/audio/transcriptions'),
      apiKey: env('TRANSCRIBE_API_KEY'),
      model: env('TRANSCRIBE_MODEL', 'whisper-1'),
      language: env('TRANSCRIBE_LANGUAGE', 'en'),
    },
    pims: {
      adapter: env('PIMS_ADAPTER', env('DAYSMART_API_KEY') ? 'daysmart' : 'mock'),
      bridgeUrl: env('PIMS_BRIDGE_URL', 'http://localhost:9000'),
      bridgeToken: env('PIMS_BRIDGE_TOKEN'),
      daysmart: {
        domain: env('DAYSMART_DOMAIN', 'app.vettersoftware.com'),
        apiKey: env('DAYSMART_API_KEY'),
        clientId: env('DAYSMART_CLIENT_ID'),
        clientSecret: env('DAYSMART_CLIENT_SECRET'),
        clinicId: env('DAYSMART_CLINIC_ID'),
        clinicHeader: env('DAYSMART_CLINIC_HEADER', 'x-clinic-id'),
        scope: env('DAYSMART_SCOPE'),
        tokenPath: env('DAYSMART_TOKEN_PATH', '/oauth/access_token'),
        staticToken: env('DAYSMART_ACCESS_TOKEN'),
        recordsPath: env('DAYSMART_RECORDS_PATH'),
        scheduleQuery: env('DAYSMART_SCHEDULE_QUERY'),
        noteMode: env('DAYSMART_NOTE_MODE', 'outbox'),
        communicationType: Number(env('DAYSMART_COMMUNICATION_TYPE', '2')),
      },
    },
    ...overrides,
  };
  if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(cfg.ai.effort)) cfg.ai.effort = 'medium';
  return cfg;
}

/** What the phone is allowed to know about the server's setup. */
export function publicConfig(cfg) {
  return {
    practiceName: cfg.practiceName,
    practiceTz: cfg.practiceTz,
    ai: { provider: cfg.ai.provider, model: cfg.ai.model, effort: cfg.ai.effort },
    transcribe: { provider: cfg.transcribe.provider },
    pims: { adapter: cfg.pims.adapter },
    authRequired: Boolean(cfg.authToken),
    captions: cfg.privacy.captions,
    keepAudio: cfg.privacy.keepAudio,
    warnings: [
      cfg.ai.provider === 'mock' ? 'SOAP drafting is running on the built-in mock. Set ANTHROPIC_API_KEY for real notes.' : null,
      cfg.pims.adapter === 'mock' ? 'Schedule is the demo day, not your practice management system.' : null,
      cfg.pims.adapter === 'daysmart' && cfg.pims.daysmart.noteMode === 'outbox' ? 'Finished notes go to the outbox for pasting into Vetter; DaySmart has no documented write endpoint yet.' : null,
    ].filter(Boolean),
  };
}
