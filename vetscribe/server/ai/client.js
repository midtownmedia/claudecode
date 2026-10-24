/**
 * The model behind the scribe. Two implementations with one method:
 *   generate({ system, user, schema }) -> { output, usage, model }
 *
 * `anthropic` calls Claude with structured output so the draft always comes
 * back in the schema. `mock` is a keyword extractor that lets the whole app
 * run, and be tested, with no key.
 */

import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { mockDraft } from './mock-model.js';

export class AnthropicModel {
  constructor({ model, effort, client, maxTokens = 16000 }) {
    this.model = model;
    this.effort = effort;
    this.maxTokens = maxTokens;
    this.client = client ?? new Anthropic();
  }

  name() { return `anthropic:${this.model}`; }

  async generate({ system, user, schema }) {
    const res = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: this.maxTokens,
      // A policy decline on the primary model re-runs server-side on Anthropic's
      // default fallback instead of leaving the visit without a note.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
      output_config: { effort: this.effort, format: jsonSchemaOutputFormat(schema) },
    });
    if (res.stop_reason === 'refusal') {
      const why = res.stop_details?.explanation ?? res.stop_details?.category ?? 'unspecified';
      throw Object.assign(new Error(`The model declined to draft this note (${why}).`), { status: 502, code: 'refusal' });
    }
    if (res.stop_reason === 'max_tokens') {
      throw Object.assign(new Error('The draft ran past the output limit; try again with a shorter recording or raise the limit.'), { status: 502, code: 'max_tokens' });
    }
    if (!res.parsed_output) {
      throw Object.assign(new Error('The model returned something that was not the note schema.'), { status: 502, code: 'parse' });
    }
    return {
      output: res.parsed_output,
      usage: res.usage,
      model: res.model,
      fellBack: (res.usage?.iterations ?? []).some((i) => i.type === 'fallback_message'),
    };
  }
}

export class MockModel {
  name() { return 'mock'; }

  async generate({ user, schema }) {
    const text = (Array.isArray(user) ? user : [user]).map((b) => (typeof b === 'string' ? b : b.text ?? '')).join('\n');
    return { output: mockDraft(text, schema), usage: { input_tokens: 0, output_tokens: 0 }, model: 'mock', fellBack: false };
  }
}

export function createModel(cfg, { client } = {}) {
  if (cfg.ai.provider === 'mock') return new MockModel();
  if (cfg.ai.provider === 'anthropic') return new AnthropicModel({ model: cfg.ai.model, effort: cfg.ai.effort, client });
  throw new Error(`Unknown AI_PROVIDER "${cfg.ai.provider}" (anthropic | mock)`);
}
