"use client";

import { useEffect } from "react";
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
  const cue = snapshot.cue;

  return (
    <div className="peri-center">
      {done ? (
        <span className="peri-result">
          <span className="peri-result-label">正答</span>
          <span className="peri-score">
            {snapshot.correct}
            <span className="peri-score-denom">/{snapshot.questionTotal}</span>
          </span>
        </span>
      ) : (
        <span className={`peri-digit ${cue === "red" ? "cue-red" : "cue-green"}`}>
          {snapshot.centerDigit ?? ""}
        </span>
      )}
    </div>
  );
}
