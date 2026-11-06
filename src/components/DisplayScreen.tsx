"use client";

import { useEffect, useRef, useState } from "react";
import { PeriResult } from "@/components/PeriResult";
import { placementsFor } from "@/lib/placement";
import type { ClientMessage, RoomSnapshot } from "@/lib/types";

export function DisplayScreen({
  snapshot,
  deviceId,
  send,
}: {
  snapshot: RoomSnapshot;
  deviceId: string;
  send: (msg: ClientMessage) => void;
}) {
  const mine = snapshot.displays.find((d) => d.id === deviceId);
  const done = snapshot.finishedAt != null;
  const running = snapshot.config.running;
  const countingDown = snapshot.countdown != null;
  const [flash, setFlash] = useState(false);
  const lock = useRef(0);
  const clock = placementsFor(snapshot.displays.length).find((slot) => slot.no === mine?.place)?.clock;

  useEffect(() => {
    let wake: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        if ("wakeLock" in navigator) wake = await navigator.wakeLock.request("screen");
      } catch {
        /* ignore */
      }
    };
    request();
    const onVis = () => {
      if (document.visibilityState === "visible") request();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      wake?.release().catch(() => undefined);
    };
  }, []);

  const onTap = () => {
    if (!running || done || countingDown) return;
    const now = Date.now();
    if (now - lock.current < 200) return;
    lock.current = now;
    setFlash(true);
    window.setTimeout(() => setFlash(false), 90);
    send({ type: "tap", deviceId, frameStartedAt: snapshot.frameStartedAt });
  };

  return (
    <button
      type="button"
      className={`peri-pad ${flash ? "flash" : ""} ${done ? "done" : ""}`}
      onPointerDown={onTap}
    >
      {done ? (
        <PeriResult snapshot={snapshot} />
      ) : countingDown ? null : running ? (
        <span className="peri-digit dark">{mine?.digit ?? ""}</span>
      ) : (
        <span className="peri-wait">
          <span className="peri-wait-no">No.{mine?.place ?? ""}</span>
          <span className="peri-wait-clock">{clock}</span>
        </span>
      )}
    </button>
  );
}
