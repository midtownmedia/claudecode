import { loadConfig } from './config.js';
import { createApp } from './app.js';

const cfg = loadConfig();
const app = await createApp(cfg);
app.server.listen(cfg.port, () => {
  console.log(`VetScribe for ${cfg.practiceName} on http://localhost:${cfg.port}`);
  console.log(`  scribe: ${app.model.name()}  transcription: ${app.transcriber.name()}  PIMS: ${app.pims.name()}  data: ${cfg.dataDir}`);
  if (cfg.ai.provider === 'mock') console.log('  (mock scribe: set ANTHROPIC_API_KEY for real notes)');
});
