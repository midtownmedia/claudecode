/**
 * The shapes the scribe fills in. One draft = a structured intake (the
 * technician's form) + a SOAP note. Both stages use the same shape so the
 * doctor's draft is a completion of the technician's, not a second document.
 *
 * Nullable fields are nullable on purpose: the scribe must leave a vital null
 * when nobody said it, never guess one.
 */

const nullable = (type) => ({ type: [type, 'null'] });
const strings = { type: 'array', items: { type: 'string' } };

export const VITALS_SCHEMA = {
  type: 'object',
  description: 'Only values stated aloud or read from a device during this visit. Null otherwise.',
  properties: {
    weight: {
      type: 'object',
      properties: { value: nullable('number'), unit: { type: ['string', 'null'], enum: ['kg', 'lb', null] } },
      required: ['value', 'unit'],
      additionalProperties: false,
    },
    temperature_f: nullable('number'),
    heart_rate: nullable('integer'),
    resp_rate: nullable('integer'),
    mucous_membranes: nullable('string'),
    crt_seconds: nullable('number'),
    bcs_9: { type: ['integer', 'null'], description: 'Body condition score on the 9-point scale' },
    pain_score_10: nullable('integer'),
    hydration: nullable('string'),
    attitude: { type: ['string', 'null'], description: 'BAR, QAR, depressed, etc.' },
  },
  required: ['weight', 'temperature_f', 'heart_rate', 'resp_rate', 'mucous_membranes', 'crt_seconds', 'bcs_9', 'pain_score_10', 'hydration', 'attitude'],
  additionalProperties: false,
};

export const EXAM_SYSTEMS = [
  'General', 'Integument', 'Eyes', 'Ears', 'Oral/Dental', 'Nose/Throat', 'Lymph nodes', 'Cardiovascular', 'Respiratory',
  'Abdomen/GI', 'Urogenital', 'Musculoskeletal', 'Neurologic', 'Rectal', 'Other',
];

export const INTAKE_SCHEMA = {
  type: 'object',
  description: "The technician's intake form, filled from the intake conversation.",
  properties: {
    presenting_complaint: { type: 'string', description: "Why they're here today, in one or two sentences." },
    history: {
      type: 'object',
      properties: {
        onset: nullable('string'),
        duration: nullable('string'),
        progression: nullable('string'),
        frequency: nullable('string'),
        prior_treatment_or_home_care: nullable('string'),
        appetite: nullable('string'),
        water_intake: nullable('string'),
        urination: nullable('string'),
        defecation: nullable('string'),
        vomiting: nullable('string'),
        energy_activity: nullable('string'),
        coughing_sneezing: nullable('string'),
      },
      required: ['onset', 'duration', 'progression', 'frequency', 'prior_treatment_or_home_care', 'appetite', 'water_intake', 'urination', 'defecation', 'vomiting', 'energy_activity', 'coughing_sneezing'],
      additionalProperties: false,
    },
    owner_concerns: { ...strings, description: 'Each distinct thing the owner is worried about or asked.' },
    diet: nullable('string'),
    medications_and_supplements_reported: strings,
    preventives_reported: {
      type: 'object',
      properties: { heartworm: nullable('string'), flea_tick: nullable('string') },
      required: ['heartworm', 'flea_tick'],
      additionalProperties: false,
    },
    lifestyle_environment: { type: ['string', 'null'], description: 'Indoor/outdoor, other pets, travel, boarding, dog parks, toxin exposure.' },
    vitals: VITALS_SCHEMA,
    tech_observations: { ...strings, description: 'What the technician saw or noted, not what the owner said.' },
    items_for_doctor: { ...strings, description: 'Things the doctor should know or address, including questions the owner wants answered.' },
  },
  required: ['presenting_complaint', 'history', 'owner_concerns', 'diet', 'medications_and_supplements_reported', 'preventives_reported', 'lifestyle_environment', 'vitals', 'tech_observations', 'items_for_doctor'],
  additionalProperties: false,
};

export const SOAP_SCHEMA = {
  type: 'object',
  properties: {
    subjective: {
      type: 'object',
      properties: {
        presenting_complaint: { type: 'string' },
        history_of_present_illness: { type: 'string', description: 'Narrative. Use the owner\'s own words in quotes where they matter.' },
        owner_reported: strings,
        pertinent_record_history: { ...strings, description: 'Items from the practice record that bear on today (prior problems, last plan, declined items).' },
        diet: nullable('string'),
        current_medications: strings,
        lifestyle_environment: nullable('string'),
      },
      required: ['presenting_complaint', 'history_of_present_illness', 'owner_reported', 'pertinent_record_history', 'diet', 'current_medications', 'lifestyle_environment'],
      additionalProperties: false,
    },
    objective: {
      type: 'object',
      properties: {
        vitals: VITALS_SCHEMA,
        physical_exam: {
          type: 'array',
          description: 'One entry per body system the doctor examined aloud. Systems not mentioned are omitted, not marked normal.',
          items: {
            type: 'object',
            properties: {
              system: { type: 'string', enum: EXAM_SYSTEMS },
              finding: { type: 'string' },
              abnormal: { type: 'boolean' },
            },
            required: ['system', 'finding', 'abnormal'],
            additionalProperties: false,
          },
        },
        diagnostics_results: {
          type: 'array',
          items: {
            type: 'object',
            properties: { test: { type: 'string' }, result: { type: 'string' } },
            required: ['test', 'result'],
            additionalProperties: false,
          },
        },
      },
      required: ['vitals', 'physical_exam', 'diagnostics_results'],
      additionalProperties: false,
    },
    assessment: {
      type: 'object',
      properties: {
        problems: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              problem: { type: 'string' },
              differentials: strings,
              status: { type: 'string', enum: ['new', 'improved', 'unchanged', 'worse', 'resolved', 'unknown'] },
              notes: { type: 'string' },
            },
            required: ['problem', 'differentials', 'status', 'notes'],
            additionalProperties: false,
          },
        },
        summary: { type: 'string' },
        doctor_exam_pending: { type: 'boolean', description: 'True when only the technician has seen the patient so far.' },
      },
      required: ['problems', 'summary', 'doctor_exam_pending'],
      additionalProperties: false,
    },
    plan: {
      type: 'object',
      properties: {
        diagnostics_ordered: strings,
        treatments_given_in_clinic: {
          type: 'array',
          items: {
            type: 'object',
            properties: { name: { type: 'string' }, dose: nullable('string'), route: nullable('string'), notes: nullable('string') },
            required: ['name', 'dose', 'route', 'notes'],
            additionalProperties: false,
          },
        },
        medications_prescribed: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' }, dose: nullable('string'), route: nullable('string'), frequency: nullable('string'),
              duration: nullable('string'), instructions: nullable('string'),
            },
            required: ['name', 'dose', 'route', 'frequency', 'duration', 'instructions'],
            additionalProperties: false,
          },
        },
        procedures_recommended: strings,
        client_communication: {
          type: 'object',
          properties: {
            discussed: strings,
            recommendations_declined: strings,
            estimates_given: strings,
            consent_obtained: strings,
            questions_from_client: strings,
            handouts_or_instructions: strings,
          },
          required: ['discussed', 'recommendations_declined', 'estimates_given', 'consent_obtained', 'questions_from_client', 'handouts_or_instructions'],
          additionalProperties: false,
        },
        follow_up: {
          type: 'object',
          properties: { recheck: nullable('string'), monitoring: strings, call_if: strings },
          required: ['recheck', 'monitoring', 'call_if'],
          additionalProperties: false,
        },
      },
      required: ['diagnostics_ordered', 'treatments_given_in_clinic', 'medications_prescribed', 'procedures_recommended', 'client_communication', 'follow_up'],
      additionalProperties: false,
    },
    flags: {
      type: 'array',
      description: 'Things a person must look at before this note is signed.',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['missing_vital', 'discrepancy_with_record', 'unclear_audio', 'needs_doctor_confirmation', 'safety', 'overdue_preventive', 'open_recommendation_not_addressed'] },
          detail: { type: 'string' },
        },
        required: ['kind', 'detail'],
        additionalProperties: false,
      },
    },
    pims_actions: {
      type: 'array',
      description: 'Discrete things to record or do in the practice management system, each traceable to the transcript.',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['vitals_update', 'vaccine_given', 'lab_order', 'prescription', 'treatment_charge', 'reminder', 'problem_update', 'recheck_booking', 'client_note', 'declined_recommendation'] },
          detail: { type: 'string' },
          source: { type: 'string', description: 'Short transcript quote that supports it.' },
        },
        required: ['kind', 'detail', 'source'],
        additionalProperties: false,
      },
    },
    evidence: {
      type: 'array',
      description: 'Short transcript quotes backing the statements a reviewer is most likely to question (vitals, doses, declined items).',
      items: {
        type: 'object',
        properties: { section: { type: 'string' }, quote: { type: 'string' } },
        required: ['section', 'quote'],
        additionalProperties: false,
      },
    },
    changes_from_previous: { ...strings, description: 'When redrafting after a voice note or edit: what changed and why. Empty on a first draft.' },
  },
  required: ['subjective', 'objective', 'assessment', 'plan', 'flags', 'pims_actions', 'evidence', 'changes_from_previous'],
  additionalProperties: false,
};

export const DRAFT_SCHEMA = {
  type: 'object',
  properties: { intake: INTAKE_SCHEMA, soap: SOAP_SCHEMA },
  required: ['intake', 'soap'],
  additionalProperties: false,
};

export function emptyVitals() {
  return {
    weight: { value: null, unit: null }, temperature_f: null, heart_rate: null, resp_rate: null, mucous_membranes: null,
    crt_seconds: null, bcs_9: null, pain_score_10: null, hydration: null, attitude: null,
  };
}

export function emptyIntake() {
  return {
    presenting_complaint: '',
    history: {
      onset: null, duration: null, progression: null, frequency: null, prior_treatment_or_home_care: null, appetite: null,
      water_intake: null, urination: null, defecation: null, vomiting: null, energy_activity: null, coughing_sneezing: null,
    },
    owner_concerns: [], diet: null, medications_and_supplements_reported: [],
    preventives_reported: { heartworm: null, flea_tick: null }, lifestyle_environment: null,
    vitals: emptyVitals(), tech_observations: [], items_for_doctor: [],
  };
}

export function emptySoap() {
  return {
    subjective: { presenting_complaint: '', history_of_present_illness: '', owner_reported: [], pertinent_record_history: [], diet: null, current_medications: [], lifestyle_environment: null },
    objective: { vitals: emptyVitals(), physical_exam: [], diagnostics_results: [] },
    assessment: { problems: [], summary: '', doctor_exam_pending: true },
    plan: {
      diagnostics_ordered: [], treatments_given_in_clinic: [], medications_prescribed: [], procedures_recommended: [],
      client_communication: { discussed: [], recommendations_declined: [], estimates_given: [], consent_obtained: [], questions_from_client: [], handouts_or_instructions: [] },
      follow_up: { recheck: null, monitoring: [], call_if: [] },
    },
    flags: [], pims_actions: [], evidence: [], changes_from_previous: [],
  };
}
