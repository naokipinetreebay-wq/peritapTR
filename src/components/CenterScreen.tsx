"use client";

import { useEffect } from "react";
import { PeriResult } from "@/components/PeriResult";
import { usePlayView } from "@/lib/playView";
import type { RoomSnapshot } from "@/lib/types";

function useWakeLock() {
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
}

export function CenterScreen({ snapshot }: { snapshot: RoomSnapshot }) {
  useWakeLock();
  const done = snapshot.finishedAt != null;
  const view = usePlayView(snapshot);
  const cue = view.cue;

  return (
    <div className="peri-center">
      {done ? (
        <PeriResult snapshot={snapshot} />
      ) : view.countdown != null ? (
        <span className="peri-digit">{view.countdown}</span>
      ) : (
        <span className={`peri-digit ${cue === "red" ? "cue-red" : "cue-green"}`}>
          {view.centerDigit ?? ""}
        </span>
      )}
    </div>
  );
}
