/**
 * The scribe: given a visit (briefing + transcript segments + any previous
 * draft), produce the intake form and the SOAP.
 */

import { DRAFT_SCHEMA } from './schemas.js';
import { scribeSystemPrompt, buildDraftRequest } from './prompts.js';

export function stageFor(visit, { reason } = {}) {
  if (reason === 'addendum') return 'addendum';
  if (reason === 'redraft') return 'redraft';
  const roles = new Set(visit.segments.filter((s) => s.transcript?.trim()).map((s) => s.role));
  if (roles.has('doctor')) return 'doctor_exam';
  return 'tech_intake';
}

export class Scribe {
  constructor({ model, practiceName }) {
    this.model = model;
    this.system = scribeSystemPrompt({ practiceName });
  }

  /**
   * @param {{visit:object, reason?:'segment'|'addendum'|'redraft'}} args
   * @returns {Promise<{intake:object, soap:object, meta:object}>}
   */
  async draft({ visit, reason = 'segment' }) {
    const stage = stageFor(visit, { reason });
    const user = buildDraftRequest({
      briefing: visit.briefing,
      visit,
      stage,
      previousDraft: visit.soap ? { intake: visit.intake, soap: visit.soap } : null,
      previousEdited: Boolean(visit.soapEditedAt),
    });
    const started = Date.now();
    const { output, usage, model, fellBack } = await this.model.generate({ system: this.system, user, schema: DRAFT_SCHEMA });
    return {
      intake: output.intake,
      soap: output.soap,
      meta: { stage, model, usage, fellBack, ms: Date.now() - started, at: new Date().toISOString() },
    };
  }
}
