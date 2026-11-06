import { gameScore, type RoomSnapshot } from "@/lib/types";

export function PeriResult({ snapshot }: { snapshot: RoomSnapshot }) {
  const score = gameScore(snapshot.correct, snapshot.wrong);
  return (
    <span className="peri-result">
      <span className="peri-result-label">結果</span>
      <span className="peri-score">{score}</span>
      <span className="peri-result-break">
        <span>正答 {snapshot.correct}</span>
        <span>誤答 {snapshot.wrong}</span>
      </span>
    </span>
  );
}
