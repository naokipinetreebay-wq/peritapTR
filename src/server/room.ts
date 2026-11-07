import { WebSocket } from "ws";
import { buildFrames, judgeTap, type PlannedFrame } from "../lib/frames";
import {
  DEFAULT_CONFIG,
  MAX_DURATION,
  MAX_INTERVAL,
  MAX_PERIPHERALS,
  MIN_DURATION,
  MIN_INTERVAL,
  MIN_PERIPHERALS,
  QUESTION_TOTAL,
  clamp,
  plannedRounds,
  type Cue,
  type DisplayInfo,
  type PlayPackage,
  type RoomConfig,
  type RoomSnapshot,
} from "../lib/types";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ROOM_TTL_MS = 90 * 60 * 1000;
/** 数字が消えたあとも、見ていたコマへのタップを受け付ける。通信の遅れ分。 */
const TAP_GRACE_MS = 1200;
const COUNTDOWN_FROM = 3;
const COUNTDOWN_MS = 1000;

function randomCode(length = 6): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export type ClientSocket = WebSocket & {
  role?: "controller" | "display";
  deviceId?: string;
  roomCode?: string;
};

interface DisplayClient {
  id: string;
  label: string;
  place: number;
  socket: ClientSocket | null;
}

export class Room {
  code: string;
  config: RoomConfig = { ...DEFAULT_CONFIG };
  displays = new Map<string, DisplayClient>();
  controllers = new Set<ClientSocket>();
  cue: Cue | null = null;
  centerDigit: number | null = null;
  scored = false;
  correct = 0;
  wrong = 0;
  miss = 0;
  asked = 0;
  frameStartedAt: number | null = null;
  startedAt: number | null = null;
  /** セッションはこの時刻で終わる。正解が10に達しても終わらない */
  endsAt: number | null = null;
  finishedAt: number | null = null;
  countdown: number | null = null;
  playPackage: PlayPackage | null = null;
  lastActivity = Date.now();

  rng: () => number = Math.random;
  /** テスト用。本番は 1000ms。 */
  countdownMs = COUNTDOWN_MS;
  private frames: PlannedFrame[] = [];
  private frameIndex = -1;
  private runIntervalMs = 1000;
  private digits: Record<string, number> = {};
  private judged = false;
  private tappedFrames = new Set<number>();
  private missedFrames = new Set<number>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  touch() {
    this.lastActivity = Date.now();
  }

  isExpired(now = Date.now()) {
    if (this.config.running) return false;
    if (this.controllers.size > 0) return false;
    if ([...this.displays.values()].some((d) => d.socket)) return false;
    return now - this.lastActivity > ROOM_TTL_MS;
  }

  addController(socket: ClientSocket) {
    this.controllers.add(socket);
    this.touch();
    this.sendSnapshot(socket);
  }

  removeController(socket: ClientSocket) {
    this.controllers.delete(socket);
  }

  addDisplay(socket: ClientSocket, deviceId: string, label?: string) {
    this.touch();
    const existing = this.displays.get(deviceId);
    if (existing) {
      existing.socket = socket;
      if (label) existing.label = label;
      this.broadcast();
      return { ok: true as const };
    }
    if (this.displays.size >= MAX_PERIPHERALS) {
      return { ok: false as const, error: "周囲の端末は6台までです" };
    }
    const place = this.displays.size + 1;
    this.displays.set(deviceId, {
      id: deviceId,
      label: label || `No.${place}`,
      place,
      socket,
    });
    this.broadcast();
    return { ok: true as const };
  }

  removeDisplaySocket(socket: ClientSocket) {
    for (const d of this.displays.values()) {
      if (d.socket === socket) {
        d.socket = null;
        break;
      }
    }
    this.broadcast();
  }

  setLabel(deviceId: string, label: string) {
    const d = this.displays.get(deviceId);
    if (d) {
      d.label = label.slice(0, 24);
      this.touch();
      this.broadcast();
    }
  }

  updateConfig(partial: Partial<RoomConfig>) {
    const next = { ...this.config, ...partial, running: this.config.running };
    next.level = next.level === "hard" ? "hard" : "easy";
    next.intervalSeconds = clamp(
      Math.round(next.intervalSeconds * 10) / 10,
      MIN_INTERVAL,
      MAX_INTERVAL
    );
    next.durationSeconds = clamp(Math.round(next.durationSeconds), MIN_DURATION, MAX_DURATION);
    this.config = next;
    this.touch();
    this.broadcast();
  }

  private liveIds(): string[] {
    return [...this.displays.values()]
      .filter((d) => d.socket && d.socket.readyState === WebSocket.OPEN)
      .map((d) => d.id);
  }

  private hasController(): boolean {
    return [...this.controllers].some((socket) => socket.readyState === WebSocket.OPEN);
  }

  start() {
    const ids = this.liveIds();
    const rounds = plannedRounds(this.config.durationSeconds, this.config.intervalSeconds);
    if (!this.hasController() || ids.length < MIN_PERIPHERALS || this.displays.size > MAX_PERIPHERALS) {
      this.broadcast();
      return;
    }
    this.clearTimer();
    this.runIntervalMs = Math.round(this.config.intervalSeconds * 1000);
    this.frames = buildFrames(ids, rounds, this.config.level === "hard", this.rng);
    this.frameIndex = -1;
    this.correct = 0;
    this.wrong = 0;
    this.miss = 0;
    this.asked = 0;
    this.tappedFrames.clear();
    this.missedFrames.clear();
    this.endsAt = null;
    this.finishedAt = null;
    this.startedAt = null;
    this.frameStartedAt = null;
    this.cue = null;
    this.centerDigit = null;
    this.scored = false;
    this.digits = {};
    this.judged = true;
    this.config.running = true;
    this.countdown = COUNTDOWN_FROM;
    const countdownStartedAt = Date.now();
    const playStartedAt = countdownStartedAt + COUNTDOWN_FROM * this.countdownMs;
    this.playPackage = {
      intervalMs: this.runIntervalMs,
      countdownMs: this.countdownMs,
      countdownFrom: COUNTDOWN_FROM,
      countdownStartedAt,
      playStartedAt,
      frames: this.frames.map((frame) => ({
        cue: frame.cue,
        center: frame.center,
        digits: { ...frame.digits },
        scored: frame.scored,
      })),
    };
    this.touch();
    this.broadcast();
    this.timer = setTimeout(() => this.countdownTick(), this.countdownMs);
  }

  stop() {
    this.clearTimer();
    this.config.running = false;
    this.countdown = null;
    this.playPackage = null;
    this.cue = null;
    this.centerDigit = null;
    this.scored = false;
    this.digits = {};
    this.frames = [];
    this.frameIndex = -1;
    this.tappedFrames.clear();
    this.missedFrames.clear();
    this.judged = true;
    this.touch();
    this.broadcast();
  }

  tap(deviceId: string, seenAt?: number | null, now = Date.now()) {
    if (!this.config.running || this.countdown != null || this.startedAt == null) return;
    const index = this.indexForSeen(seenAt);
    if (index == null || this.tappedFrames.has(index)) return;
    const frame = this.frames[index];
    if (!frame || frame.digits[deviceId] == null) return;
    const start = this.startedAt + index * this.intervalMs();
    if (now > start + this.intervalMs() + TAP_GRACE_MS) return;
    if (this.missedFrames.has(index)) {
      this.missedFrames.delete(index);
      this.miss = Math.max(0, this.miss - 1);
      this.asked = Math.max(0, this.asked - 1);
    }
    const judgement = judgeTap(frame, deviceId);
    if (judgement === "correct") this.correct += 1;
    else this.wrong += 1;
    if (frame.scored) this.asked += 1;
    this.tappedFrames.add(index);
    if (index === this.frameIndex) this.judged = true;
    this.touch();
    this.broadcast();
  }

  private indexForSeen(seenAt?: number | null): number | null {
    if (this.startedAt == null || this.frameIndex < 0) return null;
    if (seenAt == null) return this.judged ? null : this.frameIndex;
    const interval = this.intervalMs();
    if (interval <= 0) return this.judged ? null : this.frameIndex;
    const index = Math.round((seenAt - this.startedAt) / interval);
    const start = this.startedAt + index * interval;
    if (index < 0 || index >= this.frames.length || start !== seenAt) {
      return this.judged ? null : this.frameIndex;
    }
    return index;
  }

  private countdownTick() {
    if (!this.config.running || this.countdown == null) return;
    if (this.countdown <= 1) {
      this.beginProblems();
      return;
    }
    this.countdown -= 1;
    this.touch();
    this.broadcast();
    this.timer = setTimeout(() => this.countdownTick(), this.countdownMs);
  }

  private beginProblems() {
    this.countdown = null;
    // パッケージに書いた開始時刻に合わせ、端末側再生とサーバ採点の基準を揃える
    this.startedAt = this.playPackage?.playStartedAt ?? Date.now();
    this.endsAt = this.startedAt + this.frames.length * this.intervalMs();
    this.showFrame(0);
  }

  private showFrame(index: number) {
    const frame = this.frames[index];
    if (!frame || this.startedAt == null) return;
    this.frameIndex = index;
    this.judged = false;
    this.cue = frame.cue;
    this.centerDigit = frame.center;
    this.scored = frame.scored;
    this.digits = frame.digits;
    this.frameStartedAt = this.startedAt + index * this.intervalMs();
    this.broadcast();
    const wait = Math.max(0, this.frameStartedAt + this.intervalMs() - Date.now());
    this.timer = setTimeout(() => this.advance(), wait);
  }

  private advance() {
    this.resolveOpenFrame();
    if (this.frameIndex + 1 >= this.frames.length) {
      this.finish();
      return;
    }
    this.showFrame(this.frameIndex + 1);
  }

  private resolveOpenFrame() {
    if (this.judged || this.tappedFrames.has(this.frameIndex)) return;
    const frame = this.frames[this.frameIndex];
    if (frame?.scored) {
      this.miss += 1;
      this.asked += 1;
      this.missedFrames.add(this.frameIndex);
    }
    this.judged = true;
  }

  private finish() {
    this.clearTimer();
    this.config.running = false;
    this.countdown = null;
    this.playPackage = null;
    this.finishedAt = Date.now();
    this.cue = null;
    this.centerDigit = null;
    this.scored = false;
    this.digits = {};
    this.touch();
    this.broadcast();
  }

  private intervalMs() {
    return this.runIntervalMs;
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  snapshot(): RoomSnapshot {
    const displays: DisplayInfo[] = [...this.displays.values()].map((d) => ({
      id: d.id,
      label: d.label,
      place: d.place,
      digit: this.config.running ? (this.digits[d.id] ?? null) : null,
      connected: !!d.socket && d.socket.readyState === WebSocket.OPEN,
    }));
    return {
      code: this.code,
      config: this.config,
      displays,
      cue: this.config.running ? this.cue : null,
      centerDigit: this.config.running ? this.centerDigit : null,
      scored: this.config.running ? this.scored : false,
      correct: this.correct,
      wrong: this.wrong,
      miss: this.miss,
      asked: this.asked,
      questionTotal: QUESTION_TOTAL,
      endsAt: this.endsAt,
      frameStartedAt: this.frameStartedAt,
      startedAt: this.startedAt,
      finishedAt: this.finishedAt,
      countdown: this.config.running ? this.countdown : null,
      playPackage: this.config.running ? this.playPackage : null,
      serverNow: Date.now(),
    };
  }

  sendSnapshot(socket: ClientSocket) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "snapshot", snapshot: this.snapshot() }));
    }
  }

  broadcast() {
    const payload = JSON.stringify({ type: "snapshot", snapshot: this.snapshot() });
    for (const c of this.controllers) {
      if (c.readyState === WebSocket.OPEN) c.send(payload);
    }
    for (const d of this.displays.values()) {
      if (d.socket && d.socket.readyState === WebSocket.OPEN) d.socket.send(payload);
    }
  }

  destroy() {
    this.clearTimer();
  }
}

export class RoomManager {
  rooms = new Map<string, Room>();

  createRoom(): Room {
    let code = randomCode();
    while (this.rooms.has(code)) code = randomCode();
    const room = new Room(code);
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    const room = this.rooms.get(code.toUpperCase());
    if (room?.isExpired()) {
      room.destroy();
      this.rooms.delete(room.code);
      return undefined;
    }
    return room;
  }

  sweep() {
    for (const [code, room] of this.rooms) {
      if (room.isExpired()) {
        room.destroy();
        this.rooms.delete(code);
      }
    }
  }
}
