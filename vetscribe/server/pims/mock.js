/**
 * A seeded day at a small-animal practice, for demos and tests. Rich on
 * purpose: the point of the demo is to show what the SOAP gains when the
 * record walks into the room with the technician.
 */

import { normalizeAppointment } from './normalize.js';

const DAY = 86400000;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const daysAgo = (base, n) => iso(base.getTime() - n * DAY);
const daysAhead = (base, n) => iso(base.getTime() + n * DAY);

function at(date, h, m = 0) {
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

const DR_PATEL = { id: 'dvm-1', name: 'Dr. Patel' };
const DR_OKAFOR = { id: 'dvm-2', name: 'Dr. Okafor' };
const TECH_SAM = { id: 'tech-1', name: 'Sam (LVT)' };
const TECH_JO = { id: 'tech-2', name: 'Jo (LVT)' };

export function seedDay(date = new Date()) {
  const base = new Date(date);
  const appts = [
    {
      id: 'appt-1001', start: at(base, 8, 0), durationMin: 30, type: 'Wellness', status: 'scheduled', room: '1',
      reason: 'Annual exam and vaccines. Owner mentions he has been slowing down on walks.',
      provider: DR_PATEL, technician: TECH_SAM,
      patient: {
        id: 'pt-3301', name: 'Biscuit', species: 'Canine', breed: 'Labrador Retriever', sex: 'MN', dob: daysAgo(base, 365 * 9 + 40), color: 'Yellow', microchip: '985112003456789',
        weightHistory: [
          { value: 38.6, unit: 'kg', date: daysAgo(base, 370) },
          { value: 37.1, unit: 'kg', date: daysAgo(base, 550) },
          { value: 36.4, unit: 'kg', date: daysAgo(base, 740) },
        ],
        alerts: ['Food motivated; fine with treats', 'Dislikes rear nail trims'],
        problems: [
          { name: 'Overweight (BCS 7/9)', status: 'active', since: daysAgo(base, 370) },
          { name: 'Bilateral hip osteoarthritis, suspected', status: 'active', since: daysAgo(base, 370) },
        ],
        medications: [{ name: 'Simparica Trio', dose: '1 chew (22.1-44 kg)', frequency: 'monthly', since: daysAgo(base, 900) }],
        allergies: [],
        vaccines: [
          { name: 'Rabies (3 yr)', given: daysAgo(base, 370), due: daysAhead(base, 725) },
          { name: 'DAPP', given: daysAgo(base, 370), due: daysAgo(base, 5) },
          { name: 'Leptospirosis', given: daysAgo(base, 370), due: daysAgo(base, 5) },
          { name: 'Bordetella', given: daysAgo(base, 370), due: daysAgo(base, 5) },
        ],
        preventives: [
          { name: 'Heartworm test (4Dx)', lastGiven: daysAgo(base, 370), due: daysAgo(base, 5) },
          { name: 'Fecal', lastGiven: daysAgo(base, 370), due: daysAgo(base, 5) },
        ],
        labs: [{ name: 'Senior wellness panel', date: daysAgo(base, 370), summary: 'CBC unremarkable. ALP mildly elevated (210). T4 low-normal (1.1).' }],
        recentVisits: [{
          date: daysAgo(base, 370), reason: 'Annual exam',
          assessment: 'Healthy senior. Overweight BCS 7/9. Mild discomfort on hip extension bilaterally; early OA suspected.',
          plan: 'Recommended hip radiographs (declined, cost). Weight-loss diet discussed, target 34 kg. Recheck weight in 3 months (not scheduled). Consider omega-3 and joint supplement.',
        }],
        openRecommendations: ['Hip radiographs (declined last visit)', 'Weight recheck never scheduled', 'Thyroid recheck if lethargy persists'],
      },
      client: { id: 'cl-210', name: 'Maria Alvarez', phone: '555-0142', email: 'maria@example.com', preferredContact: 'text', notes: 'Prefers written estimates before approving anything over $300.' },
      notes: 'Owner asked if the slowing down could be his thyroid.',
    },
    {
      id: 'appt-1002', start: at(base, 8, 30), durationMin: 30, type: 'Sick', status: 'scheduled', room: '2',
      reason: 'Vomiting x2 days, not eating since yesterday.',
      provider: DR_PATEL, technician: TECH_SAM,
      patient: {
        id: 'pt-4410', name: 'Mochi', species: 'Feline', breed: 'Domestic Shorthair', sex: 'FS', dob: daysAgo(base, 365 * 4 + 100), color: 'Calico', microchip: null,
        weightHistory: [
          { value: 4.9, unit: 'kg', date: daysAgo(base, 200) },
          { value: 5.0, unit: 'kg', date: daysAgo(base, 560) },
        ],
        alerts: ['Fractious: towel wrap, minimal restraint'],
        problems: [],
        medications: [],
        allergies: [],
        vaccines: [
          { name: 'Rabies (1 yr)', given: daysAgo(base, 200), due: daysAhead(base, 165) },
          { name: 'FVRCP', given: daysAgo(base, 200), due: daysAhead(base, 165) },
        ],
        preventives: [{ name: 'Revolution Plus', lastGiven: daysAgo(base, 200), due: daysAgo(base, 170) }],
        labs: [],
        recentVisits: [{ date: daysAgo(base, 200), reason: 'Annual exam', assessment: 'Healthy adult. Mild dental calculus.', plan: 'Dental cleaning recommended within the year.' }],
        openRecommendations: ['Dental cleaning'],
      },
      client: { id: 'cl-318', name: 'Devon Lee', phone: '555-0177', email: 'devon@example.com', preferredContact: 'phone', notes: 'Indoor only. Two other cats in the home.' },
      notes: 'Owner mentioned a new houseplant and a lily bouquet from the weekend.',
    },
    {
      id: 'appt-1003', start: at(base, 9, 0), durationMin: 30, type: 'Puppy visit', status: 'scheduled', room: '1',
      reason: 'Second puppy visit, boosters.',
      provider: DR_PATEL, technician: TECH_JO,
      patient: {
        id: 'pt-5120', name: 'Pepper', species: 'Canine', breed: 'Australian Shepherd', sex: 'F', dob: daysAgo(base, 98), color: 'Blue merle', microchip: null,
        weightHistory: [{ value: 6.2, unit: 'kg', date: daysAgo(base, 21) }],
        alerts: ['MDR1 status unknown (herding breed)'],
        problems: [],
        medications: [],
        allergies: [],
        vaccines: [
          { name: 'DAPP #1', given: daysAgo(base, 21), due: daysAhead(base, 0) },
          { name: 'Leptospirosis #1', given: daysAgo(base, 21), due: daysAhead(base, 0) },
        ],
        preventives: [{ name: 'Fecal', lastGiven: daysAgo(base, 21), due: daysAhead(base, 0) }],
        labs: [{ name: 'Fecal flotation', date: daysAgo(base, 21), summary: 'Negative.' }],
        recentVisits: [{ date: daysAgo(base, 21), reason: 'First puppy visit', assessment: 'Healthy puppy. Mild umbilical hernia, reducible.', plan: 'Boosters in 3 weeks. Start heartworm prevention. Discuss MDR1 test and spay timing. Monitor hernia; repair at spay if persistent.' }],
        openRecommendations: ['MDR1 genetic test', 'Microchip', 'Spay timing discussion'],
      },
      client: { id: 'cl-402', name: 'Priya Natarajan', phone: '555-0190', email: 'priya@example.com', preferredContact: 'email', notes: 'First-time dog owner. Appreciates written take-home instructions.' },
      notes: '',
    },
    {
      id: 'appt-1004', start: at(base, 9, 30), durationMin: 45, type: 'Recheck', status: 'scheduled', room: '3',
      reason: 'CKD recheck, bloodwork and blood pressure. Owner says water intake is up.',
      provider: DR_OKAFOR, technician: TECH_JO,
      patient: {
        id: 'pt-2208', name: 'Duchess', species: 'Feline', breed: 'Siamese', sex: 'FS', dob: daysAgo(base, 365 * 15 + 200), color: 'Seal point', microchip: '981020012345678',
        weightHistory: [
          { value: 3.4, unit: 'kg', date: daysAgo(base, 90) },
          { value: 3.7, unit: 'kg', date: daysAgo(base, 180) },
          { value: 4.1, unit: 'kg', date: daysAgo(base, 365) },
        ],
        alerts: ['Senior: warm room, non-slip mat'],
        problems: [
          { name: 'Chronic kidney disease, IRIS stage 2', status: 'chronic', since: daysAgo(base, 365) },
          { name: 'Hypertension', status: 'chronic', since: daysAgo(base, 180) },
        ],
        medications: [
          { name: 'Amlodipine', dose: '0.625 mg PO', frequency: 'q24h', since: daysAgo(base, 180) },
          { name: 'Hill\'s k/d', dose: 'as sole diet', frequency: 'daily', since: daysAgo(base, 365) },
        ],
        allergies: ['Methimazole (GI upset, discontinued)'],
        vaccines: [{ name: 'Rabies (3 yr)', given: daysAgo(base, 500), due: daysAhead(base, 595) }],
        preventives: [],
        labs: [
          { name: 'Chem/CBC/UA', date: daysAgo(base, 90), summary: 'Creatinine 2.3, SDMA 22, phosphorus 4.8, USG 1.014, UPC 0.3. PCV 30.' },
          { name: 'Blood pressure', date: daysAgo(base, 90), summary: 'Systolic 150 (on amlodipine).' },
        ],
        recentVisits: [{ date: daysAgo(base, 90), reason: 'CKD recheck', assessment: 'CKD IRIS stage 2, stable. Hypertension controlled. Weight loss 0.3 kg in 3 months is concerning.', plan: 'Continue amlodipine and k/d. Recheck 3 months with chem, CBC, UA, BP. Discussed appetite stimulant if intake drops. Consider SQ fluids teaching.' }],
        openRecommendations: ['SQ fluids at home (owner hesitant)', 'Appetite stimulant if weight loss continues'],
      },
      client: { id: 'cl-115', name: 'Harold Finch', phone: '555-0103', email: '', preferredContact: 'phone', notes: 'Retired, available any time. Hard of hearing; speak up and write the plan down.' },
      notes: 'Owner wants to know if the increased drinking means it is getting worse.',
    },
    {
      id: 'appt-1005', start: at(base, 10, 30), durationMin: 30, type: 'Sick', status: 'scheduled', room: '2',
      reason: 'Itchy, chewing feet, red belly. Third time this year.',
      provider: DR_OKAFOR, technician: TECH_SAM,
      patient: {
        id: 'pt-6677', name: 'Rufus', species: 'Canine', breed: 'French Bulldog', sex: 'MN', dob: daysAgo(base, 365 * 3 + 10), color: 'Fawn', microchip: '956000012349876',
        weightHistory: [{ value: 12.8, unit: 'kg', date: daysAgo(base, 60) }, { value: 12.5, unit: 'kg', date: daysAgo(base, 150) }],
        alerts: ['Brachycephalic: avoid heavy sedation, keep cool'],
        problems: [
          { name: 'Atopic dermatitis, suspected', status: 'active', since: daysAgo(base, 300) },
          { name: 'Recurrent otitis externa', status: 'active', since: daysAgo(base, 300) },
        ],
        medications: [{ name: 'Apoquel', dose: '5.4 mg PO', frequency: 'q12h x14d then q24h', since: daysAgo(base, 60) }],
        allergies: ['Chicken (suspected food trigger)'],
        vaccines: [{ name: 'Rabies (3 yr)', given: daysAgo(base, 400), due: daysAhead(base, 695) }, { name: 'DAPP', given: daysAgo(base, 400), due: daysAhead(base, 695) }],
        preventives: [{ name: 'NexGard', lastGiven: daysAgo(base, 60), due: daysAgo(base, 30) }],
        labs: [{ name: 'Skin cytology', date: daysAgo(base, 60), summary: 'Malassezia 2+ interdigital, cocci 1+ ventral abdomen.' }],
        recentVisits: [{ date: daysAgo(base, 60), reason: 'Pruritus', assessment: 'Atopic dermatitis flare with secondary Malassezia and bacterial overgrowth.', plan: 'Apoquel, chlorhexidine/ketoconazole wipes BID, 8-week hydrolyzed diet trial (owner agreed). Recheck 4 weeks (missed).' }],
        openRecommendations: ['Diet trial adherence check', 'Cytovet referral to dermatology if 3+ flares/yr', 'Consider Cytopoint'],
      },
      client: { id: 'cl-509', name: 'Tom Nguyen', phone: '555-0155', email: 'tom@example.com', preferredContact: 'text', notes: 'Works nights; morning appointments only.' },
      notes: 'Flea prevention is a month overdue per record.',
    },
    {
      id: 'appt-1006', start: at(base, 11, 0), durationMin: 30, type: 'Consult', status: 'scheduled', room: '1',
      reason: 'Dental consult. Bad breath, dropped food last week.',
      provider: DR_PATEL, technician: TECH_JO,
      patient: {
        id: 'pt-7781', name: 'Ziggy', species: 'Canine', breed: 'Dachshund', sex: 'M', dob: daysAgo(base, 365 * 7), color: 'Red', microchip: null,
        weightHistory: [{ value: 9.1, unit: 'kg', date: daysAgo(base, 400) }],
        alerts: ['Back: no jumping on/off table, support spine'],
        problems: [{ name: 'Grade 3 periodontal disease', status: 'active', since: daysAgo(base, 400) }],
        medications: [],
        allergies: [],
        vaccines: [{ name: 'Rabies (3 yr)', given: daysAgo(base, 400), due: daysAhead(base, 695) }],
        preventives: [{ name: 'Heartworm test (4Dx)', lastGiven: daysAgo(base, 400), due: daysAgo(base, 35) }],
        labs: [],
        recentVisits: [{ date: daysAgo(base, 400), reason: 'Annual', assessment: 'Grade 3 periodontal disease. Likely extractions needed.', plan: 'Dental with full-mouth radiographs recommended; estimate given, owner to think about it. Pre-anesthetic bloodwork at time of dental.' }],
        openRecommendations: ['Dental cleaning with radiographs and probable extractions (estimate given)', 'Pre-anesthetic bloodwork', 'Neuter'],
      },
      client: { id: 'cl-611', name: 'Angela Brooks', phone: '555-0128', email: 'angela@example.com', preferredContact: 'phone', notes: '' },
      notes: '',
    },
    {
      id: 'appt-1007', start: at(base, 13, 30), durationMin: 30, type: 'Sick', status: 'scheduled', room: '3',
      reason: 'Limping on the right front since playing at the park Saturday.',
      provider: DR_OKAFOR, technician: TECH_SAM,
      patient: {
        id: 'pt-8890', name: 'Nala', species: 'Canine', breed: 'Border Collie mix', sex: 'FS', dob: daysAgo(base, 365 * 2 + 30), color: 'Black and white', microchip: '900164001234567',
        weightHistory: [{ value: 19.5, unit: 'kg', date: daysAgo(base, 120) }],
        alerts: [],
        problems: [],
        medications: [{ name: 'Heartgard Plus', dose: '1 chew', frequency: 'monthly', since: daysAgo(base, 600) }],
        allergies: [],
        vaccines: [{ name: 'Rabies (3 yr)', given: daysAgo(base, 120), due: daysAhead(base, 975) }, { name: 'DAPP', given: daysAgo(base, 120), due: daysAhead(base, 975) }],
        preventives: [{ name: 'Heartworm test (4Dx)', lastGiven: daysAgo(base, 120), due: daysAhead(base, 245) }],
        labs: [],
        recentVisits: [{ date: daysAgo(base, 120), reason: 'Annual', assessment: 'Healthy young adult.', plan: 'Routine.' }],
        openRecommendations: [],
      },
      client: { id: 'cl-720', name: 'Chris Whitaker', phone: '555-0166', email: 'chris@example.com', preferredContact: 'text', notes: 'Agility dog; owner will ask about return to sport.' },
      notes: '',
    },
    {
      id: 'appt-1008', start: at(base, 14, 0), durationMin: 30, type: 'Recheck', status: 'scheduled', room: '2',
      reason: 'Post-op recheck, mass removal left flank 10 days ago. Suture check.',
      provider: DR_PATEL, technician: TECH_JO,
      patient: {
        id: 'pt-9932', name: 'Gus', species: 'Canine', breed: 'Boxer', sex: 'MN', dob: daysAgo(base, 365 * 8 + 120), color: 'Brindle', microchip: '985141000987654',
        weightHistory: [{ value: 31.2, unit: 'kg', date: daysAgo(base, 10) }],
        alerts: [],
        problems: [{ name: 'Mast cell tumor, left flank, excised', status: 'active', since: daysAgo(base, 10) }],
        medications: [
          { name: 'Carprofen', dose: '75 mg PO', frequency: 'q12h', since: daysAgo(base, 10) },
          { name: 'Diphenhydramine', dose: '50 mg PO', frequency: 'q12h', since: daysAgo(base, 10) },
        ],
        allergies: [],
        vaccines: [{ name: 'Rabies (3 yr)', given: daysAgo(base, 300), due: daysAhead(base, 795) }],
        preventives: [],
        labs: [{ name: 'Histopathology', date: daysAgo(base, 4), summary: 'Mast cell tumor, low grade (Kiupel), margins complete (closest 4 mm). Mitotic index 1.' }],
        recentVisits: [{ date: daysAgo(base, 10), reason: 'Mass removal', assessment: 'Cutaneous mass left flank, cytology consistent with MCT.', plan: 'Excision with 2 cm margins. Histopath pending. E-collar, carprofen, diphenhydramine. Recheck 10-14 days, suture removal.' }],
        openRecommendations: ['Discuss histopath result and follow-up plan', 'Suture removal'],
      },
      client: { id: 'cl-833', name: 'Dana Morales', phone: '555-0119', email: 'dana@example.com', preferredContact: 'phone', notes: 'Anxious about cancer; wants the full picture in plain language.' },
      notes: 'Histopath came back; doctor to discuss.',
    },
  ];
  return appts.map(normalizeAppointment);
}

export class MockPims {
  constructor({ now = () => new Date() } = {}) {
    this.now = now;
    this.notes = [];
    this.statuses = new Map();
  }

  name() { return 'mock'; }

  async getSchedule({ date } = {}) {
    const d = date ? new Date(`${date}T12:00:00`) : this.now();
    return seedDay(d).map((a) => ({ ...a, status: this.statuses.get(a.id) ?? a.status }));
  }

  async getAppointment(id, { date } = {}) {
    const list = await this.getSchedule({ date });
    return list.find((a) => a.id === id) ?? null;
  }

  async setAppointmentStatus(id, status) {
    this.statuses.set(id, status);
    return { id, status };
  }

  /**
   * @param {{appointmentId:string, patientId:string, text:string, soap:object, vitals:object|null, actions:object[]}} note
   */
  async postNote(note) {
    const id = `note-${this.notes.length + 1}`;
    this.notes.push({ id, receivedAt: this.now().toISOString(), ...note });
    return { noteId: id, accepted: true };
  }
}
