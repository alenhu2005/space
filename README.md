# 胡哥哥天體運動 3D 實驗室

以 Vite、TypeScript、Three.js 與 Astronomy Engine 製作的 108 課綱天體運動教師演示工具。六個模組涵蓋天球、太陽視運動、月相、日月食、潮汐，以及克卜勒與行星運動；桌機、平板和手機具備相同功能。

## 本機執行

需要 Node.js 22 以上版本。

```bash
npm ci
npm run dev
```

## 驗證

```bash
npm test
npm run test:coverage
npm run build
npx playwright install chromium
npm run test:e2e
```

目前版本包含 49 個單元測試（語句覆蓋率 99.24%、分支覆蓋率 95.09%）、85 個 Chromium／Firefox／WebKit 互動案例，以及 18 個 macOS 視窗尺寸視覺案例。視覺基準刻意與 Darwin 平台綁定，避免不同作業系統的字型與 WebGL 差異造成誤報。

## GitHub Pages

推送到 `main` 或 `master` 後，GitHub Actions 會先執行測試與建置，再部署 `dist/`。Vite 的正式環境 base path 已設定為 `/space/`；舊的 `public.html` 會導向首頁。

## 教材邊界

- 教學模式會為理解而誇張尺寸、距離、軌道傾角或潮汐隆起，畫面會持續標示「非等比例」。
- 真實模式使用實際日期、方向與軌道計算，但天體顯示尺寸仍非等比例。
- 潮汐模組只呈現日月引潮方向與大小潮關係，不提供沿岸潮位預報。
- 定位權限只在使用者主動按下「使用裝置位置」後要求；拒絕後仍可輸入經緯度。

素材授權與資料來源詳見 [`public/assets/SOURCES.md`](public/assets/SOURCES.md)。
