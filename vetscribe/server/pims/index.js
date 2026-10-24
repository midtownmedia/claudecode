import { MockPims } from './mock.js';
import { BridgePims } from './bridge.js';
import { DaySmartPims } from './daysmart.js';

export function createPims(cfg) {
  switch (cfg.pims.adapter) {
    case 'mock': return new MockPims();
    case 'bridge': return new BridgePims({ baseUrl: cfg.pims.bridgeUrl, token: cfg.pims.bridgeToken });
    case 'daysmart': { const d = new DaySmartPims({ ...cfg.pims.daysmart, dataDir: cfg.dataDir }); d.scheduleQuery = cfg.pims.daysmart.scheduleQuery; return d; }
    default: throw new Error(`Unknown PIMS_ADAPTER "${cfg.pims.adapter}" (mock | bridge | daysmart)`);
  }
}
