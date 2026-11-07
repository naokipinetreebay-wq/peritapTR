import { useEffect, useRef, useState } from "react";
import type { Cue, RoomSnapshot } from "./types";

export type PlayView = {
  countdown: number | null;
  cue: Cue | null;
  centerDigit: number | null;
  digitFor: (deviceId: string) => number | null;
  frameStartedAt: number | null;
  /** パッケージ再生中か（あるときは表示はこっちを優先） */
  usingPackage: boolean;
};

/**
 * 出題パッケージがあるときは端末時計＋serverNow補正で表示を進める。
 * 採点は当面サーバ側。表示の同時性を先に稼ぐ。
 */
export function usePlayView(snapshot: RoomSnapshot | null): PlayView {
  const [tick, setTick] = useState(0);
  const skewRef = useRef(0);
  const pkg = snapshot?.playPackage ?? null;

  useEffect(() => {
    if (!snapshot) return;
    skewRef.current = snapshot.serverNow - Date.now();
  }, [snapshot?.serverNow]);

  useEffect(() => {
    if (!pkg || snapshot?.finishedAt != null) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 50);
    return () => window.clearInterval(id);
  }, [pkg, snapshot?.finishedAt]);

  if (!snapshot) {
    return {
      countdown: null,
      cue: null,
      centerDigit: null,
      digitFor: () => null,
      frameStartedAt: null,
      usingPackage: false,
    };
  }

  if (!pkg || snapshot.finishedAt != null) {
    return {
      countdown: snapshot.countdown,
      cue: snapshot.cue,
      centerDigit: snapshot.centerDigit,
      digitFor: (id) => snapshot.displays.find((d) => d.id === id)?.digit ?? null,
      frameStartedAt: snapshot.frameStartedAt,
      usingPackage: false,
    };
  }

  void tick;
  const now = Date.now() + skewRef.current;

  if (now < pkg.playStartedAt) {
    const elapsed = now - pkg.countdownStartedAt;
    const step = Math.min(
      pkg.countdownFrom,
      Math.max(1, pkg.countdownFrom - Math.floor(elapsed / pkg.countdownMs))
    );
    return {
      countdown: step,
      cue: null,
      centerDigit: null,
      digitFor: () => null,
      frameStartedAt: null,
      usingPackage: true,
    };
  }

  const index = Math.min(
    pkg.frames.length - 1,
    Math.max(0, Math.floor((now - pkg.playStartedAt) / pkg.intervalMs))
  );
  const frame = pkg.frames[index];
  const frameStartedAt = pkg.playStartedAt + index * pkg.intervalMs;
  return {
    countdown: null,
    cue: frame?.cue ?? null,
    centerDigit: frame?.center ?? null,
    digitFor: (id) => frame?.digits[id] ?? null,
    frameStartedAt,
    usingPackage: true,
  };
}
