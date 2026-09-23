/**
 * Example data for the Progress screen, so someone can see what the charts do
 * before they have logged anything. It is never saved and never mixed with
 * real entries.
 */

import { emptyState } from './store.js';
import { draw } from './math.js';

const DAY = 86400000;

function rng(seed) {
  let x = seed;
  return () => {
    x = (x * 1664525 + 1013904223) % 4294967296;
    return x / 4294967296;
  };
}

function at(now, daysAgo, hour) {
  const d = new Date(now - daysAgo * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export function makeExample(now = Date.now()) {
  const rand = rng(7);
  const s = emptyState();
  s.example = true;

  s.protocols = [
    { id: 'ex-reta', peptideId: 'retatrutide', name: '', strength: 60, waterMl: 5, doseMg: 4, freq: 'qw', syringe: 50, active: true },
    { id: 'ex-mots', peptideId: 'mots-c', name: '', strength: 40, waterMl: 4, doseMg: 0.8, freq: 'qd', syringe: 30, active: true },
  ];

  const reta = [0.5, 0.5, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4];
  reta.forEach((mg, i) => {
    const daysAgo = (reta.length - 1 - i) * 7 + 1;
    s.doses.push({
      id: `ex-r${i}`, protocolId: 'ex-reta', peptideId: 'retatrutide', name: 'Retatrutide',
      at: at(now, daysAgo, 8), doseMg: mg, units: draw({ strength: 60, waterMl: 5, doseMg: mg, syringeUnits: mg > 3 ? 50 : 30 }).rounded, site: null,
    });
  });

  for (let day = 55; day >= 1; day -= 1) {
    if (rand() < 0.1) continue; // a few missed days
    const mg = day > 41 ? 0.2 : day > 27 ? 0.4 : day > 13 ? 0.6 : 0.8;
    s.doses.push({
      id: `ex-m${day}`, protocolId: 'ex-mots', peptideId: 'mots-c', name: 'MOTS-c',
      at: at(now, day, 7), doseMg: mg, units: draw({ strength: 40, waterMl: 4, doseMg: mg, syringeUnits: 30 }).rounded, site: null,
    });
  }

  let w = 214.6;
  for (let day = 110; day >= 0; day -= rand() < 0.5 ? 2 : 3) {
    const weekly = day > 96 ? 0.35 : day > 60 ? 1.1 : 1.5;
    w -= (weekly / 7) * 2.5;
    s.weights.push({
      id: `ex-w${day}`, at: at(now, day, 7), value: Number((w + (rand() - 0.5) * 1.2).toFixed(1)), unit: 'lb',
    });
  }
  return s;
}
