# PeriTap — 周辺視タップ

真ん中の数字を見て、緑のときだけ同じ数字の周囲端末をタップするビジョントレーニングです。

## 起動

```bash
npm install
npm run dev
```

ブラウザで http://localhost:3000 を開き、「ルームを作成」。周囲の端末は QR または `/d/コード`。

## 本番

```bash
npm run build
npm start
```

公開 URL は https://peritap.rojiura.app （Render `peritap-tr` を Cloudflare Worker で中継）。
