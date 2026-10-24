/**
 * Badge mode: the phone on a lanyard. One screen, one big button. Start is
 * instant, stop sends the audio and the captions to the server, and the draft
 * shows up on the visit screen when it lands.
 */

import { h, clear, icon, mmss, toast, ask } from '../ui.js';
import { api } from '../api.js';
import { Recorder, support } from '../recorder.js';

const ROLE_LABEL = { tech: 'Technician intake', doctor: 'Doctor exam', addendum: 'Voice note' };

export function openBadge({ visit, role, onFinished }) {
  const layer = h('div', { class: 'badge-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': ROLE_LABEL[role] });
  const timer = h('div', { class: 'badge-timer' }, '00:00');
  const level = h('div', { class: 'badge-level' }, icon('mic'));
  const captions = h('div', { class: 'badge-captions' }, h('span', { class: 'hint' }, support.speech ? 'Listening…' : 'Recording. Live captions are not available in this browser; the server will transcribe.'));
  const status = h('div', { class: 'badge-status' });
  const stopBtn = h('button', { type: 'button', class: 'btn btn-stop', onclick: () => stop() }, icon('stop'), h('span', {}, 'Stop and draft'));
  const typeBtn = h('button', { type: 'button', class: 'btn btn-ghost', onclick: () => typeInstead() }, icon('keyboard'), h('span', {}, 'Type instead'));
  const closeBtn = h('button', { type: 'button', class: 'badge-close', 'aria-label': 'Cancel', onclick: () => cancel() }, icon('close'));

  layer.append(
    h('div', { class: 'badge-top' },
      h('div', {}, h('div', { class: 'badge-patient' }, visit.appointment.patient.name), h('div', { class: 'badge-role' }, ROLE_LABEL[role])),
      closeBtn),
    h('div', { class: 'badge-mid' }, timer, level, captions),
    h('div', { class: 'badge-bottom' }, status, stopBtn, typeBtn),
  );
  document.body.append(layer);

  let segment = null;
  let uploads = Promise.resolve();
  let failedChunks = 0;
  let tick = null;
  let busy = false;
  const recorder = new Recorder({
    onChunk: (blob) => {
      uploads = uploads.then(() => api.appendAudio(visit.id, segment.id, blob)).catch(() => { failedChunks += 1; status.textContent = `${failedChunks} chunk${failedChunks > 1 ? 's' : ''} failed to upload; captions will still be used.`; });
    },
    onCaption: ({ final, interim }) => {
      clear(captions);
      const tail = final.slice(-400);
      captions.append(h('span', {}, tail.length < final.length ? `…${tail}` : tail), interim ? h('span', { class: 'interim' }, ` ${interim}`) : null);
      captions.scrollTop = captions.scrollHeight;
    },
    onLevel: (rms) => { level.style.transform = `scale(${0.6 + Math.min(1, rms * 6) * 0.5})`; },
    onError: (e) => { status.textContent = e.message; },
  });

  const close = () => { clearInterval(tick); layer.remove(); };

  const start = async () => {
    if (!support.recorder) return typeInstead('Recording is not supported in this browser.');
    try {
      segment = await api.startSegment(visit.id, role, recorder.mime || 'audio/webm');
      await recorder.start();
      tick = setInterval(() => { timer.textContent = mmss(Date.now() - recorder.startedAt); }, 500);
    } catch (e) {
      const msg = e.name === 'NotAllowedError' ? 'Microphone access was refused. Allow it in the browser settings, or type the notes.' : e.message;
      typeInstead(msg);
    }
  };

  const stop = async () => {
    if (busy) return;
    busy = true;
    stopBtn.disabled = true;
    status.textContent = 'Finishing upload…';
    try {
      const { liveTranscript } = await recorder.stop();
      await uploads;
      status.textContent = 'Sending for transcription…';
      await api.finishSegment(visit.id, segment.id, { liveTranscript });
      close();
      toast(`${ROLE_LABEL[role]} saved. Drafting the note…`);
      onFinished?.();
    } catch (e) {
      busy = false;
      stopBtn.disabled = false;
      status.textContent = e.message;
    }
  };

  const cancel = async () => {
    const ok = await ask({ title: 'Discard this recording?', message: 'Nothing from it will go into the note.', actions: [{ label: 'Keep recording', value: false }, { label: 'Discard', value: true, style: 'destructive' }] });
    if (!ok) return;
    try { await recorder.stop(); } catch { /* ignore */ }
    if (segment) { try { await uploads; await api.removeSegment(visit.id, segment.id); } catch { /* best effort */ } }
    close();
    onFinished?.();
  };

  const typeInstead = async (reason) => {
    try { if (recorder.active) await recorder.stop(); } catch { /* ignore */ }
    clearInterval(tick);
    const ta = h('textarea', { class: 'textarea', placeholder: 'Dictate with the keyboard mic, or type what was said in the room…', rows: 8 });
    clear(captions); captions.style.maskImage = 'none'; captions.style.webkitMaskImage = 'none'; captions.style.maxHeight = 'none';
    captions.append(reason ? h('p', { class: 'hint' }, reason) : null, ta);
    level.remove(); timer.remove();
    stopBtn.replaceWith(h('button', {
      type: 'button', class: 'btn btn-filled', onclick: async () => {
        const text = ta.value.trim();
        if (!text) return toast('Nothing to save yet.', { tone: 'error' });
        try {
          if (!segment) segment = await api.startSegment(visit.id, role, 'text/plain');
          await uploads;
          await api.finishSegment(visit.id, segment.id, { typedTranscript: text });
          close();
          toast(`${ROLE_LABEL[role]} saved. Drafting the note…`);
          onFinished?.();
        } catch (e) { toast(e.message, { tone: 'error' }); }
      },
    }, icon('send'), h('span', {}, 'Save and draft')));
    typeBtn.remove();
    setTimeout(() => ta.focus(), 50);
  };

  start();
  return { close };
}
