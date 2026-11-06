import {
  MAX_DRY_SPELL,
  QUESTION_TOTAL,
  clamp,
  type Cue,
} from "./types";

export type Rng = () => number;

export interface PlannedFrame {
  cue: Cue;
  center: number;
  digits: Record<string, number>;
  scored: boolean;
}

export type TapJudgement = "correct" | "wrong";

export function randomDigit(rng: Rng, except?: number): number {
  if (except == null) return Math.floor(rng() * 10);
  const n = Math.floor(rng() * 9);
  return n >= except ? n + 1 : n;
}

function pickIndexes(count: number, take: number, rng: Rng): number[] {
  const bag = Array.from({ length: count }, (_, i) => i);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = bag[i];
    bag[i] = bag[j];
    bag[j] = tmp;
  }
  return bag.slice(0, Math.min(take, bag.length));
}

function assignDigits(
  ids: string[],
  center: number,
  rng: Rng,
  match: boolean
): Record<string, number> {
  const digits: Record<string, number> = {};
  const matchAt = match ? ids[Math.floor(rng() * ids.length)] : null;
  for (const id of ids) {
    digits[id] = id === matchAt ? center : randomDigit(rng, center);
  }
  return digits;
}

function validMask(rounds: number, rng: Rng): boolean[] {
  const total = clamp(rounds, QUESTION_TOTAL, QUESTION_TOTAL * (MAX_DRY_SPELL + 1));
  const buckets = new Array<number>(QUESTION_TOTAL).fill(0);
  let left = total - QUESTION_TOTAL;
  let guard = 0;
  while (left > 0 && guard < 10000) {
    guard += 1;
    const open: number[] = [];
    buckets.forEach((count, index) => {
      if (count < MAX_DRY_SPELL) open.push(index);
    });
    if (open.length === 0) break;
    buckets[open[Math.floor(rng() * open.length)]] += 1;
    left -= 1;
  }
  const mask: boolean[] = [];
  for (const duds of buckets) {
    for (let i = 0; i < duds; i++) mask.push(false);
    mask.push(true);
  }
  return mask;
}

/**
 * ハズレを混ぜ、押せる問題（緑で同じ数字が1台ある）はちょうど10。
 * 最後のコマは必ず正当。正当が来ない連続は4回まで。
 * 10回目の正当が終わるとセッションも終わる。
 */
export function buildFrames(
  ids: string[],
  rounds: number,
  hard: boolean,
  rng: Rng = Math.random
): PlannedFrame[] {
  const mask = validMask(rounds, rng);
  const dudIndexes = mask.flatMap((scored, index) => (scored ? [] : [index]));
  const emptyCount = hard
    ? Math.min(dudIndexes.length, Math.max(dudIndexes.length >= 4 ? 2 : 0, Math.floor(dudIndexes.length * 0.4)))
    : 0;
  const empty = new Set(pickIndexes(dudIndexes.length, emptyCount, rng).map((index) => dudIndexes[index]));

  return mask.map((scored, index) => {
    const center = randomDigit(rng);
    const emptyFrame = empty.has(index);
    return {
      cue: scored || emptyFrame ? "green" : "red",
      center,
      digits: assignDigits(ids, center, rng, !emptyFrame),
      scored,
    };
  });
}

export function judgeTap(frame: PlannedFrame, deviceId: string): TapJudgement {
  if (frame.scored && frame.digits[deviceId] === frame.center) return "correct";
  return "wrong";
}
