import { MockPims } from './mock.js';
import { BridgePims } from './bridge.js';

export function createPims(cfg) {
  switch (cfg.pims.adapter) {
    case 'mock': return new MockPims();
    case 'bridge': return new BridgePims({ baseUrl: cfg.pims.bridgeUrl, token: cfg.pims.bridgeToken });
    default: throw new Error(`Unknown PIMS_ADAPTER "${cfg.pims.adapter}" (mock | bridge)`);
  }
}
