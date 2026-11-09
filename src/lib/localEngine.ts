import { buildFrames, judgeTap, type PlannedFrame } from "./frames";
import { plannedRounds, type PlayPackage, type RoomConfig, type RoomSnapshot } from "./types";

export const COUNTDOWN_FROM = 3;
export const COUNTDOWN_MS = 1000;
export const TAP_GRACE_MS = 1200;

export type HostOverlay = {
  playPackage?: PlayPackage | null;
  correct?: number;
  wrong?: number;
  miss?: number;
  asked?: number;
  startedAt?: number | null;
  endsAt?: number | null;
  finishedAt?: number | null;
  countdown?: number | null;
  cue?: PlayPackage["frames"][number]["cue"] | null;
  centerDigit?: number | null;
  scored?: boolean;
  frameStartedAt?: number | null;
  digits?: Record<string, number>;
  hostNow?: number;
};

export type LocalScoreState = {
  correct: number;
  wrong: number;
  miss: number;
  asked: number;
  tappedFrames: number[];
  missedFrames: number[];
  judged: boolean;
  frameIndex: number;
};

export function liveIdsFromSnapshot(snapshot: RoomSnapshot): string[] {
  return snapshot.displays.filter((d) => d.connected).map((d) => d.id);
}

export function buildLocalPlayPackage(
  ids: string[],
  config: RoomConfig,
  now = Date.now()
): PlayPackage {
  const intervalMs = Math.round(config.intervalSeconds * 1000);
  const rounds = plannedRounds(config.durationSeconds, config.intervalSeconds);
  const frames = buildFrames(ids, rounds, config.level === "hard", Math.random);
  const countdownStartedAt = now;
  return {
    intervalMs,
    countdownMs: COUNTDOWN_MS,
    countdownFrom: COUNTDOWN_FROM,
    countdownStartedAt,
    playStartedAt: countdownStartedAt + COUNTDOWN_FROM * COUNTDOWN_MS,
    frames: frames.map((frame) => ({
      cue: frame.cue,
      center: frame.center,
      digits: { ...frame.digits },
      scored: frame.scored,
    })),
  };
}

export function emptyScoreState(): LocalScoreState {
  return {
    correct: 0,
    wrong: 0,
    miss: 0,
    asked: 0,
    tappedFrames: [],
    missedFrames: [],
    judged: true,
    frameIndex: -1,
  };
}

export function scoreOverlay(
  pkg: PlayPackage | null,
  score: LocalScoreState,
  finishedAt: number | null,
  hostNow = Date.now()
): HostOverlay {
  const startedAt = pkg?.playStartedAt ?? null;
  const endsAt =
    pkg && startedAt != null ? startedAt + pkg.frames.length * pkg.intervalMs : null;
  return {
    playPackage: finishedAt != null ? null : pkg,
    correct: score.correct,
    wrong: score.wrong,
    miss: score.miss,
    asked: score.asked,
    startedAt,
    endsAt,
    finishedAt,
    hostNow,
  };
}

export function indexForSeen(
  pkg: PlayPackage,
  seenAt: number | null | undefined,
  score: LocalScoreState
): number | null {
  if (score.frameIndex < 0) return null;
  if (seenAt == null) return score.judged ? null : score.frameIndex;
  const interval = pkg.intervalMs;
  if (interval <= 0) return score.judged ? null : score.frameIndex;
  const index = Math.round((seenAt - pkg.playStartedAt) / interval);
  const start = pkg.playStartedAt + index * interval;
  if (index < 0 || index >= pkg.frames.length || start !== seenAt) {
    return score.judged ? null : score.frameIndex;
  }
  return index;
}

export function applyTap(
  pkg: PlayPackage,
  score: LocalScoreState,
  deviceId: string,
  frameStartedAt: number | null | undefined,
  now = Date.now()
): LocalScoreState | null {
  const index = indexForSeen(pkg, frameStartedAt, score);
  if (index == null || score.tappedFrames.includes(index)) return null;
  const frame = pkg.frames[index] as PlannedFrame | undefined;
  if (!frame || frame.digits[deviceId] == null) return null;
  const start = pkg.playStartedAt + index * pkg.intervalMs;
  if (now > start + pkg.intervalMs + TAP_GRACE_MS) return null;

  const next: LocalScoreState = {
    ...score,
    tappedFrames: [...score.tappedFrames],
    missedFrames: [...score.missedFrames],
  };
  const missedAt = next.missedFrames.indexOf(index);
  if (missedAt >= 0) {
    next.missedFrames.splice(missedAt, 1);
    next.miss = Math.max(0, next.miss - 1);
    next.asked = Math.max(0, next.asked - 1);
  }
  const judgement = judgeTap(frame, deviceId);
  if (judgement === "correct") next.correct += 1;
  else next.wrong += 1;
  if (frame.scored) next.asked += 1;
  next.tappedFrames.push(index);
  if (index === next.frameIndex) next.judged = true;
  return next;
}

export function resolveOpenFrame(
  pkg: PlayPackage,
  score: LocalScoreState
): LocalScoreState {
  if (score.judged || score.tappedFrames.includes(score.frameIndex)) return score;
  const frame = pkg.frames[score.frameIndex];
  const next: LocalScoreState = {
    ...score,
    missedFrames: [...score.missedFrames],
    judged: true,
  };
  if (frame?.scored) {
    next.miss += 1;
    next.asked += 1;
    if (!next.missedFrames.includes(score.frameIndex)) {
      next.missedFrames.push(score.frameIndex);
    }
  }
  return next;
}

export function advanceToFrame(
  score: LocalScoreState,
  index: number
): LocalScoreState {
  return {
    ...score,
    frameIndex: index,
    judged: false,
  };
}
