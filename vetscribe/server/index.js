import { loadConfig } from './config.js';
import { createApp } from './app.js';

const cfg = loadConfig();
const app = await createApp(cfg);
const sweep = async () => {
  const n = await app.store.sweepAudio(cfg.privacy.audioRetentionDays);
  if (n) console.log(`  removed ${n} audio file(s) older than ${cfg.privacy.audioRetentionDays} days`);
};
await sweep();
setInterval(sweep, 6 * 3600 * 1000).unref();
app.server.listen(cfg.port, () => {
  console.log(`VetScribe for ${cfg.practiceName} on http://localhost:${cfg.port}`);
  console.log(`  scribe: ${app.model.name()}  transcription: ${app.transcriber.name()}  PIMS: ${app.pims.name()}  data: ${cfg.dataDir}`);
  console.log(`  audio: ${cfg.privacy.keepAudio ? `kept ${cfg.privacy.audioRetentionDays} days` : 'deleted after transcription'}  captions: ${cfg.privacy.captions ? 'on' : 'off'}`);
  if (cfg.ai.provider === 'mock') console.log('  (mock scribe: set ANTHROPIC_API_KEY for real notes)');
});
