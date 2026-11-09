"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  advanceToFrame,
  applyTap,
  buildLocalPlayPackage,
  emptyScoreState,
  liveIdsFromSnapshot,
  resolveOpenFrame,
  scoreOverlay,
  type LocalScoreState,
} from "./localEngine";
import type { ClientMessage, PlayPackage, RoomSnapshot } from "./types";

export type PeriClientEvent = {
  type: "clientEvent";
  event: "tap";
  deviceId: string;
  frameStartedAt?: number | null;
};

/**
 * コントローラ側でパッケージ生成・採点し hostPush する。
 * DO は tap を clientEvent として中継するだけ。
 */
export function usePeriLocalHost(
  snapshot: RoomSnapshot | null,
  send: (msg: ClientMessage) => void
) {
  const pkgRef = useRef<PlayPackage | null>(null);
  const scoreRef = useRef<LocalScoreState>(emptyScoreState());
  const finishedRef = useRef(false);
  const runningRef = useRef(false);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTick = useCallback(() => {
    if (tickTimer.current) {
      clearInterval(tickTimer.current);
      tickTimer.current = null;
    }
  }, []);

  const pushScores = useCallback(
    (finishedAt: number | null = null) => {
      send({
        type: "hostPush",
        overlay: scoreOverlay(pkgRef.current, scoreRef.current, finishedAt),
      });
    },
    [send]
  );

  const finishLocal = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    runningRef.current = false;
    clearTick();
    const pkg = pkgRef.current;
    if (pkg) {
      scoreRef.current = resolveOpenFrame(pkg, scoreRef.current);
    }
    const at = Date.now();
    pushScores(at);
    send({ type: "stop" });
  }, [clearTick, pushScores, send]);

  const syncFrame = useCallback(() => {
    const pkg = pkgRef.current;
    if (!pkg || finishedRef.current) return;
    const now = Date.now();
    if (now < pkg.playStartedAt) return;

    const index = Math.min(
      pkg.frames.length - 1,
      Math.max(0, Math.floor((now - pkg.playStartedAt) / pkg.intervalMs))
    );
    const endsAt = pkg.playStartedAt + pkg.frames.length * pkg.intervalMs;
    if (now >= endsAt) {
      scoreRef.current = resolveOpenFrame(pkg, scoreRef.current);
      finishLocal();
      return;
    }

    if (index !== scoreRef.current.frameIndex) {
      if (scoreRef.current.frameIndex >= 0) {
        scoreRef.current = resolveOpenFrame(pkg, scoreRef.current);
      }
      scoreRef.current = advanceToFrame(scoreRef.current, index);
      pushScores(null);
    }
  }, [finishLocal, pushScores]);

  useEffect(() => {
    return () => clearTick();
  }, [clearTick]);

  const startLocal = useCallback(() => {
    if (!snapshot) return;
    const ids = liveIdsFromSnapshot(snapshot);
    if (ids.length < 2) return;

    clearTick();
    finishedRef.current = false;
    runningRef.current = true;
    scoreRef.current = emptyScoreState();
    const pkg = buildLocalPlayPackage(ids, snapshot.config);
    pkgRef.current = pkg;

    send({ type: "start", local: true });
    send({
      type: "hostPush",
      overlay: {
        ...scoreOverlay(pkg, scoreRef.current, null),
        playPackage: pkg,
        hostNow: Date.now(),
      },
    });

    tickTimer.current = setInterval(syncFrame, 100);
  }, [snapshot, send, clearTick, syncFrame]);

  const stopLocal = useCallback(() => {
    clearTick();
    runningRef.current = false;
    pkgRef.current = null;
    scoreRef.current = emptyScoreState();
    finishedRef.current = false;
    send({ type: "stop" });
  }, [clearTick, send]);

  const onClientEvent = useCallback(
    (ev: PeriClientEvent) => {
      if (ev.event !== "tap") return;
      const pkg = pkgRef.current;
      if (!pkg || finishedRef.current || !runningRef.current) return;
      if (Date.now() < pkg.playStartedAt) return;

      const next = applyTap(pkg, scoreRef.current, ev.deviceId, ev.frameStartedAt);
      if (!next) return;
      scoreRef.current = next;
      pushScores(null);
    },
    [pushScores]
  );

  return { startLocal, stopLocal, onClientEvent };
}
