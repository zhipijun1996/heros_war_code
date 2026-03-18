import { MapConfig } from './types';

export const HEX_SIZE = 45;

export function hexToPixel(q: number, r: number) {
  const x = HEX_SIZE * 1.5 * q;
  const y = HEX_SIZE * Math.sqrt(3) * (r + q/2);
  return { x, y };
}

export function pixelToHex(x: number, y: number) {
  const q = (2/3 * x) / HEX_SIZE;
  const r = (-1/3 * x + Math.sqrt(3)/3 * y) / HEX_SIZE;
  return hexRound(q, r);
}

export function hexRound(q: number, r: number) {
  let rq = Math.round(q);
  let rr = Math.round(r);
  let rs = Math.round(-q - r);
  const qDiff = Math.abs(rq - q);
  const rDiff = Math.abs(rr - r);
  const sDiff = Math.abs(rs - (-q - r));
  if (qDiff > rDiff && qDiff > sDiff) {
    rq = -rr - rs;
  } else if (rDiff > sDiff) {
    rr = -rq - rs;
  }
  return { q: rq, r: rr };
}

export const DEFAULT_MAP: MapConfig = {
  name: 'Default Map',
  crystal: { q: 0, r: 0 },
  castles: {
    0: [{ q: 0, r: 4 }, { q: 4, r: 0 }],
    1: [{ q: 0, r: -4 }, { q: -4, r: 0 }]
  },
  chests: [
    { q: -1, r: 3, type: 'T1' }, { q: 1, r: -3, type: 'T1' },
    { q: 1, r: 1, type: 'T2' }, { q: -1, r: -1, type: 'T2' }
  ],
  monsters: [
    { q: -2, r: 4, level: 1 }, { q: 2, r: 2, level: 1 }, { q: -2, r: -2, level: 1 }, { q: 2, r: -4, level: 1 },
    { q: -3, r: 1, level: 2 }, { q: -1, r: 1, level: 2 }, { q: 3, r: -1, level: 2 }, { q: 1, r: -1, level: 2 },
    { q: -3, r: 3, level: 3 }, { q: 3, r: -3, level: 3 }
  ],
  magicCircles: [
    { q: -2, r: 1 }, { q: 2, r: -1 }
  ],
  traps: [],
  turrets: [],
  watchtowers: [],
  obstacles: [],
  water: [],
  bushes: []
};
