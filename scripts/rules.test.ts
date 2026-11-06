import { WebSocket } from "ws";
import { buildFrames, judgeTap, randomDigit } from "../src/lib/frames";
import { placementsFor } from "../src/lib/placement";
import { Room, type ClientSocket } from "../src/server/room";
import { plannedRounds, QUESTION_TOTAL } from "../src/lib/types";

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

function matches(digits: Record<string, number>, center: number) {
  return Object.values(digits).filter((digit) => digit === center).length;
}

function fakeSocket(): ClientSocket {
  return { readyState: WebSocket.OPEN, send() {} } as unknown as ClientSocket;
}

const ids = ["a", "b", "c"];

function longestDry(frames: { scored: boolean }[]) {
  let best = 0;
  let run = 0;
  for (const frame of frames) {
    if (frame.scored) run = 0;
    else {
      run += 1;
      best = Math.max(best, run);
    }
  }
  return best;
}

for (let trial = 0; trial < 30; trial++) {
  const easy = buildFrames(ids, 20, false);
  assert(easy.length === 20, "easy length");
  assert(easy.filter((frame) => frame.scored).length === QUESTION_TOTAL, "easy scored count");
  assert(easy[easy.length - 1]?.scored, "last frame is valid");
  assert(longestDry(easy) <= 4, "no five duds in a row");
  for (const frame of easy) {
    assert(matches(frame.digits, frame.center) === 1, "easy always one match");
    assert(frame.digits.a !== undefined && frame.center >= 0 && frame.center <= 9, "digits 0-9");
    if (frame.scored) assert(frame.cue === "green", "scored frames are green");
    else assert(frame.cue === "red", "easy non-scored frames are red");
  }

  const hard = buildFrames(ids, 30, true);
  const hardScored = hard.filter((frame) => frame.scored);
  const hardEmpty = hard.filter((frame) => frame.cue === "green" && matches(frame.digits, frame.center) === 0);
  assert(hardScored.length === QUESTION_TOTAL, "hard scored count");
  assert(hard[hard.length - 1]?.scored, "hard ends on a valid question");
  assert(longestDry(hard) <= 4, "hard dry spell");
  assert(hardEmpty.length > 0, "hard has green with no answer");
  for (const frame of hardScored) {
    assert(frame.cue === "green" && matches(frame.digits, frame.center) === 1, "hard question has one answer");
  }
  for (const frame of hardEmpty) assert(!frame.scored, "empty green is not a scored question");
  for (const frame of hard.filter((item) => item.cue === "red")) {
    assert(matches(frame.digits, frame.center) === 1, "red still shows the number somewhere");
  }
}

const tight = buildFrames(ids, 10, true);
assert(tight.every((frame) => frame.scored && frame.cue === "green"), "no spare ticks means 10 greens");

const sample = buildFrames(ids, 12, false, () => 0);
const scoredFrame = sample.find((frame) => frame.scored);
assert(scoredFrame, "a scored frame exists");
const target = Object.entries(scoredFrame!.digits).find(([, digit]) => digit === scoredFrame!.center)?.[0];
assert(target, "a target exists");
assert(judgeTap(scoredFrame!, target!) === "correct", "matching tap on a scored frame");
const other = ids.find((id) => id !== target)!;
assert(judgeTap(scoredFrame!, other) === "wrong", "other device is wrong");

let excluded = 0;
for (let i = 0; i < 200; i++) {
  const digit = randomDigit(Math.random, 4);
  assert(digit !== 4 && digit >= 0 && digit <= 9, "excluded digit");
  excluded += 1;
}
assert(excluded === 200, "exclusion loop");

assert(plannedRounds(30, 1) === 30, "30 seconds at 1 second");
assert(plannedRounds(20, 3) === 10, "long interval still fits 10 questions");
assert(plannedRounds(45, 0.5) === 50, "fast interval stops before a five-dud run");

const clocks: Record<number, string[]> = {
  2: ["9時", "3時"],
  3: ["10時", "2時", "6時"],
  4: ["10時", "8時", "4時", "2時"],
  6: ["12時", "10時", "8時", "6時", "4時", "2時"],
};
for (const [count, expected] of Object.entries(clocks)) {
  const got = placementsFor(Number(count)).map((slot) => slot.clock);
  assert(got.join(",") === expected.join(","), `${count} clocks ${got.join(",")}`);
}
const five = placementsFor(5).map((slot) => slot.clock);
assert(five[0] === "12時", "pentagon starts at 12");
assert(five[1].includes("9時") && five[1].includes("10時"), "pentagon goes counterclockwise");

function waitForProblems(room: Room): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const snap = room.snapshot();
      if (snap.countdown == null && snap.centerDigit != null) {
        resolve();
        return;
      }
      if (Date.now() - started > 2000) {
        reject(new Error("problems did not start after countdown"));
        return;
      }
      setTimeout(tick, 5);
    };
    tick();
  });
}

async function roomFlow(): Promise<void> {
  const room = new Room("TEST01");
  room.countdownMs = 0;
  room.addDisplay(fakeSocket(), "a");
  assert(room.snapshot().config.running === false, "one phone does not start");
  room.start();
  assert(room.snapshot().config.running === false, "start waits for two phones");
  room.addDisplay(fakeSocket(), "b");
  room.addDisplay(fakeSocket(), "c");
  room.updateConfig({ level: "easy", intervalSeconds: 1, durationSeconds: 30 });
  room.start();
  assert(room.snapshot().config.running === false, "start waits for the controller");
  room.addController(fakeSocket());
  room.start();
  const counting = room.snapshot();
  assert(counting.config.running && counting.countdown === 3, "countdown starts at 3");
  assert(counting.centerDigit == null, "center has no problem digit during countdown");
  assert(
    counting.displays.every((d) => d.digit == null),
    "peripherals stay blank during countdown"
  );
  room.tap("a");
  assert(room.snapshot().correct === 0 && room.snapshot().wrong === 0, "taps during countdown are ignored");
  await waitForProblems(room);
  const live = room.snapshot();
  assert(live.config.running && live.centerDigit != null && live.cue != null, "session started");
  assert(live.countdown == null, "countdown cleared when problems begin");
  assert(live.displays.every((d) => d.digit != null), "peripherals have digits");
  const hit = live.displays.find((d) => d.digit === live.centerDigit);
  if (live.scored && live.cue === "green" && hit) {
    room.tap(hit.id);
    assert(room.snapshot().correct === 1 && room.snapshot().asked === 1, "correct tap scores");
    assert(room.snapshot().config.running, "one correct answer does not end the session");
    room.tap(hit.id);
    assert(room.snapshot().correct === 1, "second tap in the same frame is ignored");
  } else if (hit) {
    room.tap(hit.id);
    assert(room.snapshot().wrong === 1 && room.snapshot().correct === 0, "tapping on red is a miss-tap");
  }
  for (const extra of ["d", "e", "f", "g"]) room.addDisplay(fakeSocket(), extra);
  const rejected = room.addDisplay(fakeSocket(), "h");
  assert(!rejected.ok, "seventh peripheral is rejected");
  room.destroy();
}

async function lateTap(): Promise<void> {
  const late = new Room("LATE01");
  late.countdownMs = 0;
  late.addController(fakeSocket());
  late.addDisplay(fakeSocket(), "a");
  late.addDisplay(fakeSocket(), "b");
  late.updateConfig({ level: "easy", intervalSeconds: 1, durationSeconds: 20 });
  late.config.intervalSeconds = 0.2;
  late.config.durationSeconds = 2;
  late.start();
  await waitForProblems(late);
  const snap = late.snapshot();
  const seen = snap.frameStartedAt;
  const hit = snap.displays.find((d) => d.digit === snap.centerDigit);
  if (!snap.scored || seen == null || !hit) {
    late.destroy();
    throw new Error("late-tap setup did not produce a scored frame");
  }
  late.tap(hit.id, seen, seen + 200 + 1200 + 50);
  assert(late.snapshot().correct === 0, "a tap after the grace period does not score");
  await new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      try {
        const missed = late.snapshot().miss;
        assert(missed >= 1, "an unanswered question becomes a miss");
        late.tap(hit.id, seen);
        const after = late.snapshot();
        assert(after.correct === 1 && after.miss === missed - 1, "a late tap on the number still showing counts");
        late.tap(hit.id, seen);
        assert(late.snapshot().correct === 1, "the same frame is not scored twice");
        late.destroy();
        resolve();
      } catch (error) {
        late.destroy();
        reject(error);
      }
    }, 350);
  });
}

roomFlow()
  .then(() => lateTap())
  .then(() => console.log("peritap rules ok"))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
