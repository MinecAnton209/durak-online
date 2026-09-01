import type { BlindLevel } from '../types/poker.js';

/** Default blind structure for cash games (fixed). */
export const CASH_BLIND_STRUCTURE: BlindLevel[] = [
  { smallBlind: 5, bigBlind: 10, durationMs: 0 },
];

/** Default tournament blind structure (progressive, 3 min levels). */
export function createPokerBlindStructure(startSB: number, startBB: number, multiplier: number, levels: number, durationMs: number): BlindLevel[] {
  const result: BlindLevel[] = [];
  let sb = startSB;
  let bb = startBB;
  for (let i = 0; i < levels; i++) {
    result.push({ smallBlind: sb, bigBlind: bb, durationMs });
    sb = Math.round(sb * multiplier);
    bb = Math.round(bb * multiplier);
  }
  return result;
}

/** Default tournament blind structure for Sit & Go. */
export function getDefaultTournamentBlinds(): BlindLevel[] {
  return createPokerBlindStructure(5, 10, 2, 8, 180000); // 3 min levels
}
