import crypto from 'node:crypto';
import type { GameState, Player } from '../types/index.js';

const RANK_VALUES: Record<string, number> = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    'J': 11,
    'Q': 12,
    'K': 13,
    'A': 14
};

interface Card {
    suit: string;
    rank: string;
}

function createDeck(deckSize = 36): Card[] {
    const SUITS = ['♦', '♥', '♠', '♣'];
    let ranks: string[];
    switch (deckSize) {
        case 52:
            ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
            break;
        case 24:
            ranks = ['9', '10', 'J', 'Q', 'K', 'A'];
            break;
        default:
            ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
            break;
    }
    const deck: Card[] = [];
    for (const suit of SUITS) {
        for (const rank of ranks) {
            deck.push({ suit, rank });
        }
    }
    for (let i = deck.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [deck[i] as Card, deck[j] as Card] = [deck[j] as Card, deck[i] as Card];
    }
    return deck;
}

function canBeat(attackCard: Card | undefined, defendCard: Card | undefined, trumpSuit: any): boolean {
    if (!attackCard || !defendCard) return false;
    if (attackCard.suit === defendCard.suit) return (RANK_VALUES as any)[defendCard.rank] > (RANK_VALUES as any)[attackCard.rank];
    if (defendCard.suit === trumpSuit && attackCard.suit !== trumpSuit) return true;
    return false;
}

function getNextPlayerIndex(currentIndex: number, totalPlayers: number): number {
    if (totalPlayers === 0) return 0;
    return (currentIndex + 1) % totalPlayers;
}

function updateTurn(game: GameState, intendedAttackerIndex: number): void {
    if (game.playerOrder.length < 2) return;
    let currentAttackerIndex = intendedAttackerIndex % game.playerOrder.length;
    let attempts = 0;
    while ((game.players as any)[game.playerOrder[currentAttackerIndex] as any] && (game.players as any)[game.playerOrder[currentAttackerIndex] as any].cards.length === 0 && attempts < game.playerOrder.length) {
        currentAttackerIndex = getNextPlayerIndex(currentAttackerIndex, game.playerOrder.length);
        attempts++;
    }
    if (attempts >= game.playerOrder.length) {
        return;
    }
    game.attackerId = game.playerOrder[currentAttackerIndex] as any;
    let currentDefenderIndex = getNextPlayerIndex(currentAttackerIndex, game.playerOrder.length);
    attempts = 0;
    while (((game.players as any)[game.playerOrder[currentDefenderIndex] as any] && (game.players as any)[game.playerOrder[currentDefenderIndex] as any].cards.length === 0 && game.playerOrder.length > 1) && attempts < game.playerOrder.length) {
        currentDefenderIndex = getNextPlayerIndex(currentDefenderIndex, game.playerOrder.length);
        attempts++;
        if (game.playerOrder.length > 1 && currentDefenderIndex === currentAttackerIndex) {
            currentDefenderIndex = getNextPlayerIndex(currentDefenderIndex, game.playerOrder.length);
        }
    }
    if (attempts >= game.playerOrder.length || (game.playerOrder.length > 1 && currentDefenderIndex === currentAttackerIndex)) {
        game.defenderId = null;
    } else {
        game.defenderId = game.playerOrder[currentDefenderIndex] as any;
    }
    game.turn = game.attackerId as any;
}

function checkGameOver(game: GameState): boolean {
    if (game.deck.length === 0) {
        const playersWithCards = game.playerOrder.map((id: any) => (game.players as any)[id]).filter((p: any) => p && p.cards.length > 0);
        if (playersWithCards.length <= 1) {
            const loser = playersWithCards.length === 1 ? playersWithCards[0]! : null;
            const winners = game.playerOrder.map((id: any) => (game.players as any)[id]).filter((p: any) => p && p.cards.length === 0);
            game.winner = { winners: winners as Player[], loser: loser as Player | null };
            return true;
        }
    }
    return false;
}

export {
    RANK_VALUES,
    createDeck,
    canBeat,
    getNextPlayerIndex,
    updateTurn,
    checkGameOver
};
