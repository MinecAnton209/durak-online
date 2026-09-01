import type { Card, PokerRank, HandResult } from '../types/poker.js';
import { RANK_VALUES } from './pokerDeck.js';

export type HandRankName =
  | 'high-card'
  | 'pair'
  | 'two-pair'
  | 'three-of-a-kind'
  | 'straight'
  | 'flush'
  | 'full-house'
  | 'four-of-a-kind'
  | 'straight-flush'
  | 'royal-flush';

/** Evaluate the best 5-card hand from a list of 2–7 cards (5 community + 2 hole). */
export function evaluateHand(cards: Card[]): HandResult {
  const rankCounts: Record<PokerRank, number> = {
    '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7': 0, '8': 0,
    '9': 0, 'T': 0, 'J': 0, 'Q': 0, 'K': 0, 'A': 0,
  };
  const suitGroups: Record<string, Card[]> = { '♠': [], '♥': [], '♦': [], '♣': [] };
  for (const card of cards) {
    rankCounts[card.rank] += 1;
    const suitGroup = suitGroups[card.suit];
    if (suitGroup) {
      suitGroup.push(card);
    }
  }

  // --- Flush check ---
  const flushSuit = (Object.values(suitGroups) as Card[][]).find((s) => s.length >= 5);
  if (flushSuit) {
    const flushRanks = flushSuit
      .map((c) => RANK_VALUES[c.rank])
      .sort((a, b) => b - a);
    const straightResult = findStraight(flushRanks);
    if (straightResult) {
      const { high, isWheel } = straightResult;
      let kickers: number[] = [];
      if (isWheel) {
        kickers = [5, 4, 3, 2, 1]; // 5-high straight flush
      } else {
        kickers = [high, ...getKickersFromSorted(flushRanks, high)];
      }
      const isRoyal = high === 14 && kickers[0] === 13;
      const name: HandRankName = isRoyal ? 'royal-flush' : 'straight-flush';
      return { rank: getRankValue(name), name, kickers };
    }
    // Regular flush — top 5 cards
    return { rank: getRankValue('flush'), name: 'flush', kickers: flushRanks.slice(0, 5) };
  }

  // --- Straight check ---
  const allRanks = Object.keys(rankCounts)
    .map((r) => RANK_VALUES[r as PokerRank])
    .filter((v) => v > 0)
    .sort((a, b) => b - a);

  const straightResult = findStraight(allRanks);
  if (straightResult) {
    const { high } = straightResult;
    const name: HandRankName = 'straight';
    return { rank: getRankValue(name), name, kickers: [high] };
  }

  // --- Multiples (pair, two-pair, trips, quads, full house) ---
  const counts: Array<[PokerRank, number]> = [];
  for (const rank of RANKS_ORDER) {
    const count = rankCounts[rank]!;
    if (count > 0) {
      counts.push([rank, count]);
    }
  }
  // sort by count desc, then rank desc
  counts.sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return RANK_VALUES[b[0]] - RANK_VALUES[a[0]];
  });

  if (counts[0]![1] === 4) {
    const quadRank = counts[0]![0];
    const kickerRank = counts[counts.length - 1]![0];
    const kickers = [RANK_VALUES[quadRank], RANK_VALUES[kickerRank]];
    return { rank: getRankValue('four-of-a-kind'), name: 'four-of-a-kind', kickers };
  }

  if (counts[0]![1] === 3 && counts[1] && counts[1]![1] >= 2) {
    const tripRank = counts[0]![0];
    const pairRank = counts[1]![0];
    const kickers = [RANK_VALUES[tripRank], RANK_VALUES[pairRank]];
    return { rank: getRankValue('full-house'), name: 'full-house', kickers };
  }

  if (counts[0]![1] === 3) {
    const tripRank = counts[0]![0];
    const kickers = [RANK_VALUES[tripRank]];
    // add two kickers
    let added = 1;
    for (let i = 1; i < counts.length && added < 3; i++) {
      kickers.push(RANK_VALUES[counts[i]![0]]);
      added++;
    }
    return { rank: getRankValue('three-of-a-kind'), name: 'three-of-a-kind', kickers };
  }

  if (counts[0]![1] === 2 && counts[1] && counts[1]![1] === 2) {
    const pair1 = RANK_VALUES[counts[0]![0]];
    const pair2 = RANK_VALUES[counts[1]![0]];
    const kickers = [pair1, pair2];
    let added = 2;
    for (let i = 2; i < counts.length && added < 3; i++) {
      kickers.push(RANK_VALUES[counts[i]![0]]);
      added++;
    }
    return { rank: getRankValue('two-pair'), name: 'two-pair', kickers };
  }

  if (counts[0]![1] === 2) {
    const pairRank = RANK_VALUES[counts[0]![0]];
    const kickers = [pairRank];
    let added = 1;
    for (let i = 1; i < counts.length && added < 4; i++) {
      kickers.push(RANK_VALUES[counts[i]![0]]);
      added++;
    }
    return { rank: getRankValue('pair'), name: 'pair', kickers };
  }

  // High card
  const kickers = allRanks.slice(0, 5);
  return { rank: getRankValue('high-card'), name: 'high-card', kickers };
}

const RANKS_ORDER: PokerRank[] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];

const HAND_RANK_VALUES: Record<HandRankName, number> = {
  'high-card': 1,
  'pair': 2,
  'two-pair': 3,
  'three-of-a-kind': 4,
  'straight': 5,
  'flush': 6,
  'full-house': 7,
  'four-of-a-kind': 8,
  'straight-flush': 9,
  'royal-flush': 10,
};

function getRankValue(name: HandRankName): number {
  return HAND_RANK_VALUES[name];
}

interface StraightResult {
  high: number;
  isWheel: boolean;
}

function findStraight(sortedRanksDesc: number[]): StraightResult | null {
  if (sortedRanksDesc.length < 5) return null;

  // Deduplicate
  const uniq = Array.from(new Set(sortedRanksDesc));
  if (uniq.length < 5) return null;

  // Check for ace-low straight (A-2-3-4-5)
  const hasAce = uniq.includes(14);
  if (hasAce) {
    uniq.push(1);
  }

  uniq.sort((a, b) => b - a);

  // Find 5 consecutive
  for (let i = 0; i <= uniq.length - 5; i++) {
    let isStraight = true;
    for (let j = 0; j < 4; j++) {
      if (uniq[i + j] !== uniq[i + j + 1]! + 1) {
        isStraight = false;
        break;
      }
    }
    if (isStraight) {
      const high = uniq[i]!;
      return { high, isWheel: high === 5 };
    }
  }

  return null;
}

function getKickersFromSorted(sortedRanksDesc: number[], exclude: number): number[] {
  return sortedRanksDesc.filter((r) => r !== exclude).slice(0, 4);
}

/** Compare two hand results. Returns >0 if a wins, <0 if b wins, 0 if tie. */
export function compareHands(a: HandResult, b: HandResult): number {
  if (a.rank !== b.rank) return a.rank - b.rank;
  for (let i = 0; i < Math.min(a.kickers.length, b.kickers.length); i++) {
    if (a.kickers[i] !== b.kickers[i]) {
      return a.kickers[i]! - b.kickers[i]!;
    }
  }
  return 0;
}
