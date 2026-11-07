# PeriTap — 周辺視タップ

真ん中の数字を見て、緑のときだけ同じ数字の周囲端末をタップするビジョントレーニングです。

## 公開 URL

https://tr.rojiura.app/peritap/  
ルーム／WS: https://tr-api.rojiura.app  
旧ホスト `https://peritap.rojiura.app` は新 URL へ 301 します。

## 起動（ローカル）

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開き、「ルームを作成」。周囲の端末は QR または `/d/?code=`。

## 本番ビルド（Pages 用）

```bash
npm run build
```

静的 export（`basePath: /peritap`）を `trwebapp` 配下へ載せて Pages デプロイします。
