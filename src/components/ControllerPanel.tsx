"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useState } from "react";
import { SessionExit } from "@/components/SessionExit";
import { placementsFor } from "@/lib/placement";
import {
  MAX_DURATION,
  MAX_INTERVAL,
  MIN_DURATION,
  MIN_INTERVAL,
  plannedSeconds,
  type ClientMessage,
  type Level,
  type RoomConfig,
  type RoomSnapshot,
} from "@/lib/types";

export function ControllerPanel({
  snapshot,
  connected,
  send,
  clearSessionKeys,
}: {
  snapshot: RoomSnapshot;
  connected: boolean;
  send: (msg: ClientMessage) => void;
  clearSessionKeys?: string[];
}) {
  const cfg = snapshot.config;
  const displayUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/d/${snapshot.code}`;
  }, [snapshot.code]);
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!cfg.running || snapshot.startedAt == null) return;
    const id = setInterval(() => setTick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [cfg.running, snapshot.startedAt]);

  const skew = snapshot.serverNow - Date.now();
  const leftMs =
    cfg.running && snapshot.endsAt != null
      ? Math.max(0, snapshot.endsAt - (Date.now() + skew))
      : null;
  const about = plannedSeconds(cfg.durationSeconds, cfg.intervalSeconds);
  const slots = placementsFor(snapshot.displays.length);
  const placeByNo = new Map(slots.map((slot) => [slot.no, slot.clock]));
  const online = snapshot.displays.filter((d) => d.connected).length;
  const canStart = connected && online >= 2 && snapshot.displays.length <= 6;

  const patch = (partial: Partial<RoomConfig>) => {
    send({ type: "updateConfig", config: partial });
  };

  return (
    <div className="controller">
      <header className="controller-header">
        <div>
          <p className="eyebrow">PeriTap</p>
          <h1>ルーム {snapshot.code}</h1>
        </div>
        <div className={`pill ${connected ? "ok" : "bad"}`}>
          {connected ? "接続中" : "再接続中…"}
        </div>
      </header>

      <section className="panel">
        <h2>正答</h2>
        <p className="time-read">
          {snapshot.correct}
          <span className="score-denom">/{snapshot.questionTotal}</span>
        </p>
        <p className="muted">
          {leftMs != null
            ? `残り ${(leftMs / 1000).toFixed(0)}秒で終了 · `
            : snapshot.finishedAt != null
              ? "制限時間終了 · "
              : ""}
          正答 {snapshot.correct}/{snapshot.questionTotal} · ミス {snapshot.miss} · お手つき{" "}
          {snapshot.wrong}
        </p>
      </section>

      <section className="grid-2">
        <div className="panel">
          <h2>周囲の端末</h2>
          <p className="muted">周囲 {snapshot.displays.length} 台</p>
          <div className="qr-wrap">
            {displayUrl ? <QRCodeSVG value={displayUrl} size={160} /> : null}
          </div>
          <p className="mono url">{displayUrl}</p>
          <button
            type="button"
            className="btn ghost"
            onClick={() => navigator.clipboard.writeText(displayUrl)}
          >
            URLをコピー
          </button>
        </div>
        <div className="panel">
          <h2>操作</h2>
          <div className="btn-row">
            <button
              type="button"
              className="btn primary"
              disabled={!canStart}
              onClick={() => send({ type: "start" })}
            >
              {snapshot.finishedAt != null ? "もう一度" : "開始"}
            </button>
            <button type="button" className="btn danger" onClick={() => send({ type: "stop" })}>
              一時停止
            </button>
          </div>
          <label className="field">
            <span>レベル</span>
            <select
              value={cfg.level}
              onChange={(e) => patch({ level: e.target.value as Level })}
            >
              <option value="easy">簡単</option>
              <option value="hard">難しい</option>
            </select>
          </label>
          <label className="field">
            <span>切り替え: {cfg.intervalSeconds.toFixed(1)}秒</span>
            <input
              type="range"
              min={MIN_INTERVAL}
              max={MAX_INTERVAL}
              step={0.1}
              value={cfg.intervalSeconds}
              onChange={(e) => patch({ intervalSeconds: Number(e.target.value) })}
            />
          </label>
          <label className="field">
            <span>制限時間: {cfg.durationSeconds}秒</span>
            <input
              type="range"
              min={MIN_DURATION}
              max={MAX_DURATION}
              step={1}
              value={cfg.durationSeconds}
              onChange={(e) => patch({ durationSeconds: Number(e.target.value) })}
            />
          </label>
          <p className="muted">
            {!canStart
              ? "コントローラを含めて3台つながるまで開始できません。"
              : `だいたい${about}秒で終わります。押せる問題は10回で、10回目が終わると終了します。`}
          </p>
        </div>
      </section>

      <section className="panel">
        <h2>配置</h2>
        {snapshot.displays.length === 0 ? (
          <p className="muted">まだ端末がありません。QRを読み取ってください。</p>
        ) : (
          <ul className="device-list">
            {snapshot.displays.map((d) => (
              <li key={d.id}>
                <span className="place-badge">{d.place}</span>
                <input
                  className="label-input"
                  value={d.label}
                  onChange={(e) =>
                    send({ type: "setLabel", deviceId: d.id, label: e.target.value })
                  }
                />
                <span className="clock-label">{placeByNo.get(d.place) ?? ""}</span>
                <span className={`dot ${d.connected ? "ok" : "bad"}`} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <SessionExit onStop={() => send({ type: "stop" })} clearSessionKeys={clearSessionKeys} />
    </div>
  );
}
