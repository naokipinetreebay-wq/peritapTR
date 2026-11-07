"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AdGate } from "@/components/AdGate";
import { bootstrapSession, type TrBootstrapResponse } from "@/lib/trApi";
import { createRoom } from "@/lib/ws";

export default function HomePage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [bootstrap, setBootstrap] = useState<TrBootstrapResponse | null>(null);

  const goRoom = (code: string) => {
    router.push(`/r/?code=${code}`);
  };

  const onCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const code = await createRoom();
      let boot: TrBootstrapResponse | null = null;
      try {
        boot = await bootstrapSession({ app: "peritap", roomCode: code });
      } catch {
        // オフラインでも部屋作成は通す
      }
      if (boot?.ad.show && boot.ad.creatives.length > 0) {
        setPendingCode(code);
        setBootstrap(boot);
        setBusy(false);
        return;
      }
      goRoom(code);
    } catch (e) {
      setError(e instanceof Error ? e.message : "作成に失敗しました");
      setBusy(false);
    }
  };

  if (bootstrap && pendingCode) {
    return (
      <AdGate
        bootstrap={bootstrap}
        onDone={() => {
          const code = pendingCode;
          setBootstrap(null);
          setPendingCode(null);
          goRoom(code);
        }}
      />
    );
  }

  return (
    <main className="home">
      <div className="home-card">
        <p className="eyebrow">PeriTap · TRwebapp</p>
        <h1>周辺視タップ</h1>
        <p>
          真ん中の数字を見たまま、数字が緑のときだけ同じ数字の端末をタップします。数字が赤なら押しません。
        </p>
        <div className="home-actions">
          <button type="button" className="btn primary" disabled={busy} onClick={onCreate}>
            {busy ? "作成中…" : "ルームを作成"}
          </button>
          <a className="btn" href="https://tr.rojiura.app">
            ポータル（tr）に戻る
          </a>
        </div>
        {error ? (
          <p className="muted" style={{ marginTop: 12, color: "var(--bad)" }}>
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
