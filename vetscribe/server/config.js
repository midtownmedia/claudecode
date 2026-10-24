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
    ai: {
      provider: aiProvider,
      model: env('VETSCRIBE_MODEL', 'claude-sonnet-5-5'),
      effort: env('VETSCRIBE_EFFORT', 'medium'),
      hasKey,
    },
    transcribe: {
      provider: env('TRANSCRIBE_PROVIDER', 'browser'),
      url: env('TRANSCRIBE_URL', 'https://api.openai.com/v1/audio/transcriptions'),
      apiKey: env('TRANSCRIBE_API_KEY'),
      model: env('TRANSCRIBE_MODEL', 'whisper-1'),
    },
    pims: {
      adapter: env('PIMS_ADAPTER', 'mock'),
      bridgeUrl: env('PIMS_BRIDGE_URL', 'http://localhost:9000'),
      bridgeToken: env('PIMS_BRIDGE_TOKEN'),
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
    warnings: [
      cfg.ai.provider === 'mock' ? 'SOAP drafting is running on the built-in mock. Set ANTHROPIC_API_KEY for real notes.' : null,
      cfg.pims.adapter === 'mock' ? 'Schedule is the demo day, not your practice management system.' : null,
    ].filter(Boolean),
  };
}
