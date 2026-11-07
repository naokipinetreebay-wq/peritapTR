export type Role = "controller" | "display";
export type Level = "easy" | "hard";
export type Cue = "green" | "red";

export interface RoomConfig {
  level: Level;
  /** 数字が変わる間隔。0.5〜3秒 */
  intervalSeconds: number;
  /** セッションの長さ。20〜45秒 */
  durationSeconds: number;
  running: boolean;
}

export interface DisplayInfo {
  id: string;
  label: string;
  /** 参加順。1がNo.1 */
  place: number;
  digit: number | null;
  connected: boolean;
}

/** 開始時に一度配り、端末側の時計で再生する出題一式 */
export interface PlayFrameWire {
  cue: Cue;
  center: number;
  digits: Record<string, number>;
  scored: boolean;
}

export interface PlayPackage {
  intervalMs: number;
  countdownMs: number;
  countdownFrom: number;
  /** カウントダウン「3」を出したサーバ時刻 */
  countdownStartedAt: number;
  /** コマ0の開始サーバ時刻 */
  playStartedAt: number;
  frames: PlayFrameWire[];
}

export interface RoomSnapshot {
  code: string;
  config: RoomConfig;
  displays: DisplayInfo[];
  cue: Cue | null;
  centerDigit: number | null;
  /** この表示が、点数になる正当のどれか */
  scored: boolean;
  correct: number;
  wrong: number;
  miss: number;
  /** 点数になる問題のうち、すでに決着したもの */
  asked: number;
  questionTotal: number;
  /** 10回目の正当の表示が終わる時刻 */
  endsAt: number | null;
  frameStartedAt: number | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** 問題開始前の 3・2・1。null のときはカウントダウン中ではない */
  countdown: number | null;
  /** あるときは端末側再生の正本。カウントダウン開始時に付く */
  playPackage: PlayPackage | null;
  serverNow: number;
}

export type ClientMessage =
  | { type: "hello"; role: Role; deviceId: string; label?: string }
  | { type: "updateConfig"; config: Partial<RoomConfig> }
  | { type: "setLabel"; deviceId: string; label: string }
  | { type: "start" }
  | { type: "stop" }
  | { type: "tap"; deviceId: string; frameStartedAt?: number | null }
  | { type: "ping" };

export type ServerMessage =
  | { type: "snapshot"; snapshot: RoomSnapshot }
  | { type: "error"; message: string }
  | { type: "pong" };

export const DEFAULT_CONFIG: RoomConfig = {
  level: "easy",
  intervalSeconds: 1,
  durationSeconds: 30,
  running: false,
};

export const QUESTION_TOTAL = 10;
/** 正当が来ない連続は4回まで。5回連続では出さない。 */
export const MAX_DRY_SPELL = 4;
export const MIN_PERIPHERALS = 2;
export const MAX_PERIPHERALS = 6;
export const MIN_DURATION = 20;
export const MAX_DURATION = 45;
export const MIN_INTERVAL = 0.5;
export const MAX_INTERVAL = 3;

export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** 設定秒数に近づけつつ、正当10回とハズレを収めるコマ数。 */
export function plannedRounds(durationSeconds: number, intervalSeconds: number): number {
  const intervalMs = Math.round(intervalSeconds * 1000);
  const maxRounds = QUESTION_TOTAL * (MAX_DRY_SPELL + 1);
  if (intervalMs <= 0) return QUESTION_TOTAL;
  const wanted = Math.round((durationSeconds * 1000) / intervalMs);
  return clamp(wanted, QUESTION_TOTAL, maxRounds);
}

export function plannedSeconds(durationSeconds: number, intervalSeconds: number): number {
  const intervalMs = Math.round(intervalSeconds * 1000);
  return (plannedRounds(durationSeconds, intervalSeconds) * intervalMs) / 1000;
}

/** 正答 − 誤答。マイナスもあり得る。 */
export function gameScore(correct: number, wrong: number): number {
  return correct - wrong;
}
