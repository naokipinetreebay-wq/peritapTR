"use client";

import { QRCodeSVG } from "qrcode.react";
import { useMemo, useState } from "react";
import { PlacementMap } from "@/components/PlacementMap";
import { SessionExit } from "@/components/SessionExit";
import { placementsFor } from "@/lib/placement";
import { displayJoinUrl } from "@/lib/roomCode";
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

const STEPS = ["説明", "設定", "配置", "確認"] as const;

export function SetupWizard({
  snapshot,
  connected,
  send,
  onDone,
}: {
  snapshot: RoomSnapshot;
  connected: boolean;
  send: (msg: ClientMessage) => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);
  const cfg = snapshot.config;
  const displayUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return displayJoinUrl(snapshot.code);
  }, [snapshot.code]);
  const joined = snapshot.displays.length;
  const online = snapshot.displays.filter((d) => d.connected).length;
  const roster = online + (connected ? 1 : 0);
  const about = plannedSeconds(cfg.durationSeconds, cfg.intervalSeconds);
  const slots = placementsFor(joined);
  const placeByNo = new Map(slots.map((slot) => [slot.no, slot.clock]));

  const patch = (partial: Partial<RoomConfig>) => {
    send({ type: "updateConfig", config: partial });
  };

  return (
    <div className="wizard">
      <header className="wizard-top">
        <div>
          <p className="eyebrow">PeriTap · セットアップ</p>
          <h1>ルーム {snapshot.code}</h1>
        </div>
        <div className="wizard-top-actions">
          <SessionExit compact />
          <div className={`pill ${connected ? "ok" : "bad"}`}>
            {connected ? "接続中" : "再接続中…"}
          </div>
        </div>
      </header>

      <ol className="wizard-steps" aria-label="手順">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "active" : i < step ? "done" : ""}>
            <span className="n">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      <section className="panel wizard-panel">
        {step === 0 ? (
          <div className="wizard-body">
            <h2>周辺視タップ</h2>
            <ul className="explain-list">
              <li>この端末を真ん中に置き、視点をここに集めます。</li>
              <li>周囲の端末は黒の数字です。指定した秒ごとに、全部が同時に変わります。</li>
              <li>真ん中の数字が緑のとき、同じ数字の端末をタップすると正解です。</li>
              <li>真ん中の数字が赤のときは押しません。押すと失敗です。押しそこねた緑も失敗です。</li>
              <li>ハズレも混ざります。押せる問題は10回だけです。</li>
              <li>10回目の押せる問題が終わると終了します。最後は必ず押せる問題です。</li>
              <li>だいたい選んだ秒数で終わります。5回連続で押せる問題が来ないことはありません。</li>
              <li>結果は「正答 − 誤答」です。正答と誤答の数も出します。</li>
              <li>簡単は、赤でも緑でも同じ数字が必ずどこかにあります。</li>
              <li>
                難しいは、緑でも同じ数字がどこにもないことがあります。そのときは押しません。点数になるのは、緑で正解がある10問だけです。
              </li>
            </ul>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="wizard-body">
            <h2>レベルと時間</h2>
            <label className="field">
              <span>レベル</span>
              <select
                value={cfg.level}
                onChange={(e) => patch({ level: e.target.value as Level })}
              >
                <option value="easy">簡単（同じ数字が必ずどこかにある）</option>
                <option value="hard">難しい（緑でも正解がないことがある）</option>
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
              だいたい{about}秒で終わります。押せる問題は10回で、10回目が終わると終了します。
            </p>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="wizard-body">
            <h2>周囲の端末を置く</h2>
            <p className="join-meter">
              接続中 {roster} 台（コントローラを含む）。3台そろうまで開始できません。
            </p>
            <PlacementMap count={joined} />
            <div className="qr-wrap">
              {displayUrl ? <QRCodeSVG value={displayUrl} size={180} /> : null}
            </div>
            <p className="mono url">{displayUrl}</p>
            {joined > 0 ? (
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
            ) : null}
          </div>
        ) : null}

        {step === 3 ? (
          <div className="wizard-body">
            <h2>準備完了</h2>
            <ul className="summary-list">
              <li>この端末を真ん中に置く</li>
              <li>接続中 {roster} 台（コントローラを含む）</li>
              <li>{cfg.level === "hard" ? "難しい" : "簡単"}</li>
              <li>
                {cfg.intervalSeconds.toFixed(1)}秒ごと、だいたい{about}秒、押せる問題10回
              </li>
            </ul>
            <p className="muted">「はじめる」で真ん中に数字が出ます。</p>
          </div>
        ) : null}
      </section>

      <footer className="wizard-nav">
        <button
          type="button"
          className="btn"
          disabled={step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          戻る
        </button>
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            className="btn primary"
            disabled={step === 2 && (roster < 3 || joined > 6)}
            onClick={() => setStep((s) => s + 1)}
          >
            {step === 2 && roster < 3 ? "3台そろうまで進めません" : "次へ"}
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={roster < 3} onClick={onDone}>
            {roster < 3 ? "3台そろうまで開始できません" : "はじめる"}
          </button>
        )}
      </footer>
      <SessionExit onStop={() => send({ type: "stop" })} />
    </div>
  );
}
