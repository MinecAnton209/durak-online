import { eq, sql } from 'drizzle-orm';
import db from '../db/drizzle.js';
import { user } from '../db/schema.ts';
import type { Server as SocketIOServer } from 'socket.io';

interface RouletteBet {
  amount: number;
  type: 'number' | 'color' | 'even-odd';
  value: string;
}

interface RouletteState {
    phase: 'waiting' | 'betting' | 'spinning' | 'results';
    timer: number;
    history: number[];
    winningNumber: number | null;
    bets: Record<number, RouletteBet[]>;
}

const rouletteState: RouletteState = {
  phase: 'waiting',
  timer: 0,
  history: [],
  winningNumber: null,
  bets: {}
};

const BETTING_TIME = 20;
const RESULTS_TIME = 10;
const ROULETTE_RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];

let io: SocketIOServer | null;
let onlineUsers: Map<number, string>;

function init(socketIo: SocketIOServer, usersMap: Map<number, string>): void {
  io = socketIo;
  onlineUsers = usersMap;
  setInterval(rouletteTick, 1000);
}

function getRouletteState(): RouletteState {
  return rouletteState;
}

function rouletteTick(): void {
  if (rouletteState.timer > 0) {
    rouletteState.timer--;
    if (rouletteState.timer === 0) {
      handlePhaseTransition();
    }
    if (io) io.emit('roulette:updateState', rouletteState);
  } else {
    handlePhaseTransition();
  }
}

function handlePhaseTransition(): void {
  if (rouletteState.phase === 'waiting' || rouletteState.phase === 'results') {
    startBettingPhase();
  } else if (rouletteState.phase === 'betting') {
    startSpinningPhase();
  } else if (rouletteState.phase === 'spinning') {
    void startResultsPhase();
  }
}

function startBettingPhase(): void {
  rouletteState.phase = 'betting';
  rouletteState.timer = BETTING_TIME;
  rouletteState.winningNumber = null;
  rouletteState.bets = {};
  if (io) io.emit('roulette:updateState', rouletteState);
}

function startSpinningPhase(): void {
  rouletteState.phase = 'spinning';
  rouletteState.timer = 1;
  rouletteState.winningNumber = Math.floor(Math.random() * 37);

  rouletteState.history.unshift(rouletteState.winningNumber!);
  if (rouletteState.history.length > 15) rouletteState.history.pop();

  if (io) io.emit('roulette:updateState', rouletteState);
}

async function startResultsPhase(): Promise<void> {
  rouletteState.phase = 'results';
  rouletteState.timer = RESULTS_TIME;

  const winningNumber = rouletteState.winningNumber;
  const payoutPromises: Promise<unknown>[] = [];

  for (const userId in rouletteState.bets) {
    const userBets = rouletteState.bets[userId as any as number]!; if (!userBets) continue;
    let totalPayout = 0;

    userBets.forEach((bet: RouletteBet) => {
      if (checkWin(winningNumber, bet)) {
        let payout = 0;
        if (bet.type === 'number') {
          payout = bet.amount * 36;
        } else {
          payout = bet.amount * 2;
        }
        totalPayout += payout;
      }
    });

    if (totalPayout > 0) {
      const userIdNum = parseInt(userId, 10);
      const promise = processPayout(userIdNum, totalPayout);
      payoutPromises.push(promise);
    }
  }

  try {
    await Promise.all(payoutPromises);
  } catch (err: any) {
    console.error('[Roulette] Error processing payouts:', err);
  }

  if (io) io.emit('roulette:updateState', rouletteState);
}

async function processPayout(userId: number, amount: number): Promise<any> {
  try {
    const updated = await db
      .update(user)
      .set({ coins: sql`${user.coins} + ${amount}` })
      .where(eq(user.id, userId))
      .returning({ coins: user.coins });

    const updatedUser = updated[0];
    if (!updatedUser) return null;

    const userSocketId = onlineUsers.get(userId);
    if (userSocketId && io) {
      io.to(userSocketId).emit('updateBalance', { coins: updatedUser.coins });
      io.to(userSocketId).emit('roulette:win', { amount: amount });
    }
    return updatedUser;
  } catch (e: any) {
    console.error(`[Roulette] Payout failed for user ${userId}:`, e);
  }
}

function checkWin(winningNumber: number | null, bet: RouletteBet): boolean {
  const wn = winningNumber ?? 0;
  const betValue = bet.value;

  switch (bet.type) {
    case 'number':
      return wn === parseInt(betValue, 10);
    case 'color':
      if (betValue === 'red') return ROULETTE_RED_NUMBERS.includes(wn);
      if (betValue === 'black') return wn !== 0 && !ROULETTE_RED_NUMBERS.includes(wn);
      return false;
    case 'even-odd':
      if (wn === 0) return false;
      if (betValue === 'even') return wn % 2 === 0;
      if (betValue === 'odd') return wn % 2 !== 0;
      return false;
    default:
      return false;
  }
}

function placeBet(userId: number, bet: RouletteBet): boolean {
  if (rouletteState.phase !== 'betting') return false;

  if (!rouletteState.bets[userId]) {
    rouletteState.bets[userId] = [];
  }
  rouletteState.bets[userId].push(bet);
  return true;
}

export {
  init,
  getRouletteState,
  placeBet
};

export default { init, getRouletteState, placeBet };
