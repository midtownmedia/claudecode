/**
 * One JSON file per record, written atomically, plus an append-only audio
 * directory. Small on purpose: a practice's day is a few dozen visits, and a
 * file per visit survives crashes, is trivial to back up, and needs no
 * database to stand up. Swap this module for a database when it hurts.
 */

import { mkdir, readFile, writeFile, rename, readdir, appendFile, stat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.locks = new Map();
  }

  async init() {
    await mkdir(join(this.dir, 'visits'), { recursive: true });
    await mkdir(join(this.dir, 'audio'), { recursive: true });
    return this;
  }

  newId() { return randomUUID(); }

  path(collection, id) {
    if (!/^[\w-]+$/.test(id) || !/^[\w-]+$/.test(collection)) throw new Error('bad id');
    return join(this.dir, collection, `${id}.json`);
  }

  async get(collection, id) {
    try {
      return JSON.parse(await readFile(this.path(collection, id), 'utf8'));
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      throw e;
    }
  }

  async put(collection, id, record) {
    await mkdir(join(this.dir, collection), { recursive: true });
    const p = this.path(collection, id);
    const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(record, null, 2));
    await rename(tmp, p);
    return record;
  }

  /** Read-modify-write under a per-record lock so two phones can't clobber each other. */
  async update(collection, id, mutate) {
    const key = `${collection}/${id}`;
    const prev = this.locks.get(key) ?? Promise.resolve();
    let release;
    const mine = new Promise((r) => { release = r; });
    this.locks.set(key, prev.then(() => mine));
    await prev;
    try {
      const rec = await this.get(collection, id);
      if (!rec) throw Object.assign(new Error(`${collection} ${id} not found`), { status: 404 });
      const next = (await mutate(rec)) ?? rec;
      await this.put(collection, id, next);
      return next;
    } finally {
      release();
      if (this.locks.get(key) === mine) this.locks.delete(key);
    }
  }

  async list(collection) {
    let names;
    try { names = await readdir(join(this.dir, collection)); } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
    const out = [];
    for (const n of names) {
      if (!n.endsWith('.json')) continue;
      const rec = await this.get(collection, n.slice(0, -5));
      if (rec) out.push(rec);
    }
    return out;
  }

  async remove(collection, id) {
    await rm(this.path(collection, id), { force: true });
  }

  audioPath(visitId, segmentId, ext = 'webm') {
    if (!/^[\w-]+$/.test(visitId) || !/^[\w-]+$/.test(segmentId) || !/^\w+$/.test(ext)) throw new Error('bad id');
    return join(this.dir, 'audio', visitId, `${segmentId}.${ext}`);
  }

  async appendAudio(visitId, segmentId, chunk, ext) {
    const p = this.audioPath(visitId, segmentId, ext);
    await mkdir(join(this.dir, 'audio', visitId), { recursive: true });
    await appendFile(p, chunk);
    return (await stat(p)).size;
  }

  async removeAudio(visitId, segmentId, ext) {
    await rm(this.audioPath(visitId, segmentId, ext), { force: true });
  }

  /** Deletes audio older than `days`. Transcripts and notes are kept. */
  async sweepAudio(days) {
    if (!days || days <= 0) return 0;
    const cutoff = Date.now() - days * 86400000;
    let removed = 0;
    let visits;
    try { visits = await readdir(join(this.dir, 'audio')); } catch { return 0; }
    for (const v of visits) {
      let files;
      try { files = await readdir(join(this.dir, 'audio', v)); } catch { continue; }
      for (const f of files) {
        const p = join(this.dir, 'audio', v, f);
        try { if ((await stat(p)).mtimeMs < cutoff) { await rm(p, { force: true }); removed += 1; } } catch { /* ignore */ }
      }
    }
    return removed;
  }

  async readAudio(visitId, segmentId, ext) {
    try { return await readFile(this.audioPath(visitId, segmentId, ext)); } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  }
}
