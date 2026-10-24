/**
 * The HTTP surface: a JSON API under /api and the phone app from public/.
 * Plain node:http; the routing table is small enough to read in one go.
 */

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { createPims } from './pims/index.js';
import { createModel } from './ai/client.js';
import { Scribe } from './ai/scribe.js';
import { createTranscriber } from './transcribe/index.js';
import { VisitService } from './visits.js';
import { publicConfig } from './config.js';

const PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2',
};
const JSON_LIMIT = 2 * 1024 * 1024;
const AUDIO_LIMIT = 25 * 1024 * 1024;

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const buf = await readBody(req, JSON_LIMIT);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': typeof body === 'object' && !Buffer.isBuffer(body) ? 'application/json' : (headers['content-type'] ?? 'text/plain; charset=utf-8'), 'cache-control': 'no-store', ...headers });
  res.end(data);
}

/**
 * Wires the pieces together. Everything is injectable so tests can run the
 * real routes against the mock PIMS, the mock model and a temp directory.
 */
export async function createApp(cfg, deps = {}) {
  const log = deps.log ?? ((level, msg) => console[level === 'error' ? 'error' : 'log'](`[${level}] ${msg}`));
  const store = deps.store ?? await new Store(cfg.dataDir).init();
  const pims = deps.pims ?? createPims(cfg);
  const model = deps.model ?? createModel(cfg);
  const scribe = deps.scribe ?? new Scribe({ model, practiceName: cfg.practiceName });
  const transcriber = deps.transcriber ?? createTranscriber(cfg);
  const visits = deps.visits ?? new VisitService({ store, pims, scribe, transcriber, log, now: deps.now, keepAudio: cfg.privacy?.keepAudio !== false });

  const routes = [];
  const route = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[\\w-]+)')}/?$`), handler, raw: Boolean(opts.raw) });

  route('GET', '/api/health', async () => ({ ok: true, ...publicConfig(cfg), model: model.name(), transcriber: transcriber.name(), pims: pims.name() }));
  route('GET', '/api/schedule', async ({ url }) => ({ date: url.searchParams.get('date'), appointments: await visits.schedule({ date: url.searchParams.get('date') ?? undefined }) }));
  route('GET', '/api/appointments/:id/brief', async ({ params, url }) => visits.brief(params.id, { date: url.searchParams.get('date') ?? undefined }));
  route('GET', '/api/visits', async () => ({ visits: await visits.list() }));
  route('POST', '/api/visits', async ({ body }) => {
    if (!body.appointmentId) throw Object.assign(new Error('appointmentId required'), { status: 400 });
    return visits.open({ appointmentId: body.appointmentId, date: body.date, startedBy: body.startedBy ?? '' });
  });
  route('GET', '/api/visits/:id', async ({ params }) => visits.get(params.id));
  route('POST', '/api/visits/:id/segments', async ({ params, body }) => visits.startSegment(params.id, { role: body.role, speaker: body.speaker, mime: body.mime }));
  route('PUT', '/api/visits/:id/segments/:sid/audio', async ({ params, req }) => visits.appendAudio(params.id, params.sid, await readBody(req, AUDIO_LIMIT)), { raw: true });
  route('POST', '/api/visits/:id/segments/:sid/finish', async ({ params, body }) => visits.finishSegment(params.id, params.sid, { liveTranscript: body.liveTranscript ?? '', typedTranscript: body.typedTranscript ?? '' }));
  route('DELETE', '/api/visits/:id/segments/:sid', async ({ params }) => visits.removeSegment(params.id, params.sid));
  route('PUT', '/api/visits/:id/segments/:sid/transcript', async ({ params, body }) => visits.setTranscript(params.id, params.sid, String(body.transcript ?? '')));
  route('POST', '/api/visits/:id/redraft', async ({ params }) => visits.requestRedraft(params.id));
  route('PUT', '/api/visits/:id/draft', async ({ params, body }) => visits.updateDraft(params.id, { intake: body.intake, soap: body.soap, noteText: body.noteText }));
  route('GET', '/api/visits/:id/note.txt', async ({ params }) => ({ __text: visits.noteText(await visits.get(params.id)) }));
  route('POST', '/api/visits/:id/finalize', async ({ params, body }) => visits.finalize(params.id, { signedBy: body.signedBy ?? '', actions: body.actions ?? null }));
  route('POST', '/api/visits/:id/reopen', async ({ params }) => visits.reopen(params.id));

  async function serveStatic(req, res, pathname) {
    let p = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    if (p === '/' || p === '') p = '/index.html';
    let file = join(PUBLIC_DIR, p);
    if (!file.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
    try {
      const st = await stat(file);
      if (st.isDirectory()) file = join(file, 'index.html');
    } catch {
      if (extname(p)) return send(res, 404, 'Not found');
      file = join(PUBLIC_DIR, 'index.html'); // app routes like /visit/abc
    }
    try {
      const data = await readFile(file);
      const type = TYPES[extname(file)] ?? 'application/octet-stream';
      const cache = extname(file) === '.html' || file.endsWith('sw.js') ? 'no-cache' : 'public, max-age=3600';
      res.writeHead(200, { 'content-type': type, 'cache-control': cache });
      res.end(data);
    } catch {
      send(res, 404, 'Not found');
    }
  }

  function authorized(req, url) {
    if (!cfg.authToken) return true;
    const h = req.headers.authorization ?? '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : url.searchParams.get('token');
    return t === cfg.authToken;
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return serveStatic(req, res, url.pathname);
    }
    if (!authorized(req, url)) return send(res, 401, { error: 'Device token required' });
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.pathname.match(r.re);
      if (!m) continue;
      try {
        const body = r.raw || req.method === 'GET' || req.method === 'DELETE' ? {} : await readJson(req);
        const out = await r.handler({ params: m.groups ?? {}, url, body, req });
        if (out && typeof out === 'object' && '__text' in out) return send(res, 200, out.__text, { 'content-type': 'text/plain; charset=utf-8' });
        return send(res, 200, out ?? {});
      } catch (e) {
        const status = e.status ?? 500;
        if (status >= 500) log('error', `${req.method} ${url.pathname}: ${e.stack ?? e.message}`);
        return send(res, status, { error: e.message, code: e.code ?? null });
      }
    }
    send(res, 404, { error: 'No such endpoint' });
  });

  return { server, store, pims, model, scribe, transcriber, visits, cfg };
}
