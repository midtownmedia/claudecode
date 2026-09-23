/**
 * The saved file, on whatever the browser allows.
 *
 * - Chrome and Edge on a computer can keep a file linked: pick where it lives
 *   once, and every change is written to it from then on.
 * - Phones get the share sheet, which on an iPhone offers "Save to Files".
 * - Everything else downloads a copy.
 *
 * Opening a file works everywhere through a normal file picker.
 */

const inFrame = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;

export const support = {
  /** Keep one file updated automatically. */
  link: !inFrame && typeof window.showSaveFilePicker === 'function',
  /** Creating any file at all. Embedded previews block it. */
  save: !inFrame,
};

const TYPES = [{ description: 'Peptide log', accept: { 'application/json': ['.json'] } }];

/**
 * Hand the person a copy of the file.
 * @returns {'shared'|'downloaded'|'cancelled'}
 */
export async function saveCopy(text, name) {
  const blob = new Blob([text], { type: 'application/json' });
  if (touch && typeof File === 'function' && navigator.canShare) {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return 'shared';
      } catch (err) {
        if (err?.name === 'AbortError') return 'cancelled';
        // Some browsers advertise sharing and then refuse it. Fall through.
      }
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return 'downloaded';
}

/** Let the person pick a file to open. Resolves to { name, text } or null. */
export function pickFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

/* ------------------------------------------------------------------ *
 * A linked file (Chrome and Edge on a computer)
 * ------------------------------------------------------------------ */

const DB = 'peptides-file';
const STORE = 'handles';

function idb(mode, fn) {
  return new Promise((resolve) => {
    let req;
    try {
      req = indexedDB.open(DB, 1);
    } catch {
      resolve(null);
      return;
    }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction(STORE, mode);
        const r = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(r?.result ?? null);
        tx.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    };
  });
}

export async function linkedHandle() {
  if (!support.link) return null;
  return idb('readonly', (s) => s.get('main'));
}

export async function forgetLinked() {
  await idb('readwrite', (s) => s.delete('main'));
}

/** Ask where to keep the file, write it there, and remember it. */
export async function linkNew(text, suggestedName) {
  const handle = await window.showSaveFilePicker({ suggestedName, types: TYPES });
  await write(handle, text);
  await idb('readwrite', (s) => s.put(handle, 'main'));
  return handle;
}

/** Open a file through the picker that can also keep it linked. */
export async function openLinkable() {
  const [handle] = await window.showOpenFilePicker({ types: TYPES });
  const file = await handle.getFile();
  return { handle, name: file.name, text: await file.text() };
}

export async function remember(handle) {
  await idb('readwrite', (s) => s.put(handle, 'main'));
}

/** 'granted' | 'prompt' | 'denied'. Asking needs a tap. */
export async function permission(handle, ask = false) {
  const opts = { mode: 'readwrite' };
  try {
    if ((await handle.queryPermission(opts)) === 'granted') return 'granted';
    return ask ? await handle.requestPermission(opts) : 'prompt';
  } catch {
    return 'denied';
  }
}

export async function readHandle(handle) {
  const file = await handle.getFile();
  return file.text();
}

export async function write(handle, text) {
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}
