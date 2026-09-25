# 天體運動 3D 實驗室

以 **Vite、TypeScript、Three.js 與 Astronomy Engine** 製作的互動式天體運動教材：

**https://alenhu2005.github.io/space/**

網站以台灣 108 課綱中適合用動態模型理解的天體運動為範圍。主要教材依序為 **1 太陽、2 月相、3 日月食**；天球、潮汐與克卜勒收在「開發者功能」，避免課堂誤觸但保留完整內容。

## 教材場景

| 場景 ID | 教材 | 主要內容 | 入口 |
| --- | --- | --- | --- |
| `sun-path` | 太陽視運動與四季 | 高度與方位、日出日落、晝長、地軸傾斜、四季、極晝極夜 | 主場景 1 |
| `moon-phases` | 月相與月球運動 | 日地月位置、地面月面、同步自轉、月升／中天／月落 | 主場景 2 |
| `eclipses` | 日食與月食 | 軌道交點、影錐、日全食／偏食／環食、月全食／偏食 | 主場景 3 |
| `celestial-sphere` | 天球與星空運動 | 天球座標、天極、赤道、黃道、星軌與周年變化 | 開發者功能 |
| `tides` | 日月引潮力與潮汐 | 近月與背月隆起、大潮與小潮 | 開發者功能 |
| `kepler` | 克卜勒與行星運動 | 橢圓、等時等面積、週期、逆行與參考系 | 開發者功能 |

所有場景共用播放／暫停、逐格、速度、時間軸、相機預設、自由旋轉、平移、縮放、圖層、全螢幕、重設與分享網址。介面同時支援桌機、平板和手機。

開發者功能密碼為 `0000`。這只是避免課堂誤操作的前端介面鎖，**不是安全驗證**；解鎖狀態只存在目前瀏覽器分頁的 `sessionStorage`。

## 技術選型

| 技術 | 版本 | 用途 |
| --- | ---: | --- |
| TypeScript | 5.9 | 型別、狀態與場景契約 |
| Vite | 8.2 | 開發伺服器、資源處理與建置 |
| Three.js | 0.185 | WebGL 2 場景、材質、光源、相機與控制 |
| Astronomy Engine | 2.1 | 日月行星位置、地平座標、升落、月相與日月食 |
| Vitest | 4.1 | 數學、狀態與服務層單元測試 |
| Playwright | 1.62 | 跨瀏覽器互動與視覺回歸 |

前端使用原生 DOM，不引入 React 或其他 UI 框架。六個教材共用同一套播放、狀態、控制面板和 WebGL 渲染生命週期。

## 架構概覽

```text
URL / DOM 操作 / 播放時鐘
            │
            ▼
    simulationReducer
            │  產生新的 SimulationState
            ├──────────────────────────┐
            ▼                          ▼
      UI 與分享網址               StageController
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
            SceneDefinition                        SceneVisual
          教材資料、控制與預設          Three.js 物件、相機、update()
                                                          │
                                                          ▼
                                                AstronomyProvider
                                              Astronomy Engine 隔離層
```

主要目錄：

```text
src/
├── core/
│   ├── types.ts              # 場景、狀態、控制項與預設型別
│   ├── state.ts              # reducer、輸入驗證、URL 解析與序列化
│   ├── astro-math.ts         # 晝長、月相、克卜勒、潮汐純函式
│   ├── local-horizon.ts      # 共用 ENU 地平座標、方位與觀測相機角度邊界
│   ├── geometry.ts           # 影錐、遮掩比例與食分類
│   └── moon-observer.ts      # 月相觀測者、時區與事件格式化
├── services/
│   └── astronomy-provider.ts # 第三方天文計算封裝
├── rendering/
│   ├── stage.ts              # renderer、相機、動畫與場景生命週期
│   ├── observer-view.ts      # 地面天空、示意地景、固定觀測相機與天體位置
│   └── helpers.ts            # 天體、線、標籤、影錐與 GPU 資源釋放
├── scenes/
│   ├── definitions.ts        # 六個資料驅動教材定義
│   ├── visuals.ts            # 場景工廠
│   ├── shared.ts             # SceneVisual 契約與共用座標工具
│   └── *.ts                  # 各教材的 Three.js 實作
├── main.ts                   # DOM、事件、模式切換與 URL 同步
└── style.css                 # 桌機、平板、手機與全螢幕版面
```

### `SceneDefinition` 與 `SceneVisual`

`SceneDefinition` 是可直接驅動介面的教材資料，包含穩定 ID、標題、年級、課綱代碼、觀察重點、常見迷思、控制項、預設情境與預設參數。

`SceneVisual` 負責 WebGL 內容：

- `root`：加入 Three.js scene 的根節點。
- `cameras`：場景可用的相機預設。
- `update(state)`：由狀態更新位置、材質、標籤並回傳即時指標。
- `comparison`：可選的第二個同步視窗，目前用於太陽教材。
- `cameraScale(state)`：依顯示比例調整相機尺度。
- `dispose()`：清除場景自己的監聽器與額外資源。

控制面板因此不用知道軌道、影錐或月面如何繪製；渲染器也不用理解每個控制項的教材意義。

## 狀態管理與分享網址

全站只有一份唯讀 `SimulationState`：

```ts
interface SimulationState {
  sceneId: SceneId
  mode: 'teaching' | 'real'
  viewMode: 'space' | 'observer'
  observerView: { azimuth: number; altitude: number; fov: number }
  instant: string
  observer: { latitude: number; longitude: number; elevation: number }
  playing: boolean
  speed: number
  timeline: number
  presetId: string
  cameraPreset: string
  layers: { labels: boolean; paths: boolean; shadows: boolean }
  parameters: Readonly<Record<string, number>>
}
```

所有變更都經過 `simulationReducer` 並建立新物件。reducer 同時負責輸入邊界：緯度 `-90…90°`、經度 `-180…180°`、海拔 `0…10,000 m`、速度 `0.1…128×`、時間軸 `0…1`；非有限數字與無效日期不會進入狀態。

`parseUrlState()` 只接受白名單內的場景、模式、相機與圖層，無效值回到安全預設。`toUrlSearchParams()` 將目前狀態寫回網址，所以任何課堂情境都能收藏或分享：

```text
?scene=moon-phases
&mode=real
&time=2026-09-21T00:00:00.000Z
&lat=25.0330
&lon=121.5654
&t=0.25000
&camera=top
&speed=1
&layers=labels,paths,shadows
&p.inclination=5.145
```

場景專用參數使用 `p.` 前綴，避免與全域狀態衝突。真實模式與地面觀測視角都會寫入日期和觀測者座標；地面觀測另以 `view=observer&az=…&alt=…&fov=…` 保存朝向與視角。URL 解析會驗證所有數字並限制高度角 `-12…90°`、FOV `12…85°`，不適用的場景會安全回到太空視角。

## Three.js 渲染系統

### WebGL 2 與材質

`createStage()` 直接要求 WebGL 2 context，成功後建立一個 `THREE.WebGLRenderer`：

- sRGB 輸出色彩空間。
- ACES Filmic tone mapping。
- PCF shadow map，且只在需要的場景啟用。
- local clipping，用於地平面等幾何表達。
- `OrbitControls.zoomToCursor = true`，朝游標或觸控焦點縮放。
- 阻尼控制，避免旋轉與縮放突然停止。

切換教材時不重建 renderer。`setScene()` 會斷開舊控制器、移除 overlay、釋放 geometry、material、texture，再建立新的 `SceneVisual`，避免 GPU 資源隨切換次數累積。

### 地面觀測視角

太陽、月相、日月食與天球可在「太空視角／地面觀測」間切換。Stage 保留原 `SceneVisual` 與第三人稱相機，只切換同一個 renderer 的顯示相機及場景；模擬時間、經緯度、模型參數、播放狀態與原相機 preset 均不重設。潮汐與克卜勒仍只提供太空視角。

共用 local horizon frame 採 ENU：東 `+X`、上 `+Y`、北 `-Z`。Astronomy Engine 的高度角與方位角先經 `horizonDirection()` 轉換，再放入天空場景；`0/90/180/270°` 分別是北／東／南／西。相機層級分成觀測錨點、地平 frame、yaw rig、pitch rig 與 PerspectiveCamera。拖曳只改 yaw／pitch，滾輪和雙指縮放只改 FOV，觀測者不會在地表移動。桌機方向鍵按住可連續平滑轉向，Shift 加速；按下畫面底部半透明的「看向太陽／月球」會以最短方位角路徑平滑轉向，天體在地平線下時不會假裝可見。觀看位置切換在頂欄。

真實模式按選定 UTC 時刻與經緯度計算日月、亮星的當地地平位置；教學模式沿用場景的季節、月相和時間軸，因此屬示意天空。兩種模式皆依太陽高度連續漸變白天、晨昏與夜空，星光亦逐漸顯隱。橘色太陽、青色月球周日軌跡按場景顯示，可用「軌跡」圖層開關；真實模式取選定時刻前後各 12 小時的日月地平位置，教學模式的完整周日線則封閉接合，且月相播放不逐格重建相同軌跡。太陽場景另外顯示夏至、春秋分、冬至三條路徑，以及北極星和南十字座的方位參照；南十字座依日期、時間和緯度升落，並以導向線連到獨立標記的南天極，兩者不是同一位置。北極星只是接近北天極，南天極沒有明亮的定位星。低矮遠山、地面方位柱與 30°／60° 天空高度圈是方向參照，不代表選定地點的實際地形或地平遮蔽；一般日月圓盤為方便辨識而放大，日食模式則以實際或標明的教學視角半徑比較。天氣與真實民用時區不由經緯度推算。天文位置只在時間、地點或教學參數變更時重算；單純轉頭只更新相機 transform。畫面上方只留精簡方位角，其餘觀測資料不遮擋天空。

### 太陽雙視窗

太陽教材的「當地太陽視運動」與「地球公轉與四季」不是兩套獨立動畫。兩者使用同一份狀態和同一個動畫時鐘，再以 `setViewport()` 與 `setScissor()` 在同一張 WebGL canvas 中繪製兩個 scene/camera。

這樣可以保證時間、季節、緯度與播放速度完全同步，也只占用一個 WebGL context。桌機由 CSS 並排顯示，手機則切換為全尺寸單一視窗。

### 相機追蹤

相機預設包含位置、目標與是否保留自由軌道。使用地球／月球特寫時，每次更新只把天體目標的位移加到相機和 OrbitControls target，保留使用者自己旋轉的角度與縮放倍率。

相機切換通常使用指數插值平滑移動；開啟 `prefers-reduced-motion` 時直接到達目標位置。

### 3D 標籤避讓

標籤是 CanvasTexture sprite。渲染前把世界座標投影到螢幕，估算矩形；若位於鏡頭外、地平面下、父節點隱藏、超出 viewport，或與按鈕／其他標籤重疊，就暫時隱藏。手機標籤放大為基準的 `1.5×`，平板為 `1.18×`。

## 天文計算與兩種模式

### 教學模式

教學模式讓使用者直接改變緯度、季節、公轉角、月相、軌道傾角或離心率。尺寸、距離、影錐、傾角與潮汐隆起可以誇張，以便在課堂畫面辨識。

純數學集中於 `src/core/`：

- 由緯度、赤緯與時角換算高度角與方位角。
- 以日出時角計算晝長、極晝與極夜。
- 將日月黃經差轉為月相與照亮比例。
- 用牛頓法解克卜勒方程，再算軌道位置和速度。
- 以 `P² = a³` 表示第三定律。
- 由視圓、距離與影錐判斷全食、偏食、環食或未命中。
- 由日月夾角表示引潮力疊加程度。

### 真實模式

`AstronomyProvider` 將 Astronomy Engine 隔離在單一介面後方，場景不直接依賴第三方型別。它提供：

- 太陽、月球與行星的日心／地心向量。
- 指定時間、經緯度與海拔的高度角、方位角。
- J2000 亮星經歲差和自行修正後的地平位置。
- 月相角、照亮比例、黃道緯度與指定月相時間。
- 日月升起、中天與落下時間。
- 當地恆星時。
- 下一次月食、全球日食、指定地點日食。
- 春分、夏至、秋分與冬至。

狀態以 UTC ISO 字串保存 `instant`，顯示時才依指定民用時區格式化。太陽、月相、日月食的真實模式在桌機控制面板與手機模型下方都可直接改日期、緯度和經度。定位權限只在使用者按下「使用裝置位置」後要求；拒絕後仍可手動輸入座標。經緯度不會自動推定民用時區。

### 地球貼圖與觀測者

地球幾何座標、Blue Marble 貼圖本初子午線、地球自轉角與天文向量使用同一套轉換。觀測點由緯度、經度計算地表法向量，再跟隨地球由西向東自轉，避免時間顯示為晚上但標記仍停在晨線附近。

## 各場景的實作重點

### 太陽視運動與四季

- 當地模型顯示地平圈、不透明地面、夏至／春秋分／冬至日行軌跡與指向北極星的地軸。南十字座四顆亮星依時刻和緯度定位，南天極則獨立標記並與十字座相連；白天標記只供方向教學，不代表肉眼能看到星星。
- 高度、方位、日出日落和晝長由同一份日期／緯度更新。
- 正午高度使用 `h = 90° − |φ − δ|`。
- 公轉模型顯示平行日光、明暗面、晨昏線和青色觀測者自轉軌跡。
- 原始 2D 版本保留於 `public/legacy-sun.html`，返回新版時保存新版參數。

### 月相與月球運動

- 3D 視角顯示日地月相對位置，地面月面以獨立 2D canvas 計算亮暗邊界。
- 月球貼圖的近地面中心固定朝向地球；太空模型與第一人稱都使用同一面，可比較教學比例與地月等比例（未模擬天秤動）。
- 教學模式由月相角估算月升、中天與月落的太陽時。
- 「觀測當地太陽時」可直接調到 15 分鐘刻度，不必靠跨越整個朔望月的時間軸找時刻；設定當前時刻不改月相，之後播放時仍會推進地球自轉。
- 真實模式由 Astronomy Engine 搜尋事件，並以指定民用時區顯示。
- 觀測者標記、所在地時間、地球貼圖與太陽高度共用同一個 `instant`。

### 日食與月食

- `geometry.ts` 計算本影、半影、視圓重疊和遮掩比例。
- 教學模式可放大月球軌道傾角，說明朔望不一定發生日月食。五個預設都從食前開始（時間軸約 10%），拖至 50% 為食甚，再往後可看復圓；地球同步自轉，食甚預設對應當地正午（日食）或午夜（月食），當地太陽時仍可手動微調。此時間軸是示意事件過程，不代表實際接觸時刻；真實模式依實際時間旋轉地球。
- 太空視角的教學觀測者標記會依所選緯度與當地太陽時轉到地球受光面或背光面。教學預設在赤道中心線呈現日全／環食，移開緯度後當地食分會改變；教學偏移與天體大小仍屬非等比例示意。
- 地面視角用日月所見圓盤的角半徑與重疊面積呈現全食、偏食與環食；環食保留完整光環。教學日食以太空模型相同的日地月位置、尺寸和觀測者地表位置投影視圓，再把角尺度一致縮小以方便觀看；因此地面食象與太空影區相符，半影外不會顯示偏食。真實模式使用選定地點的地平座標判斷日食，不把全球有食誤當成當地可見。
- 教學模式的太空與地面視角共用同一份地球本影／月球相對位置，月球仍在本影內時不會因另一套相位近似公式提前結束月食；另檢查當地月球是否升起。月面紅化僅為示意，沒有大氣散射模型。
- 可切換太空、月球附近、地表附近；月食地表鏡頭位於地球夜側。
- 真實模式可搜尋下一次食，區分全球事件與指定地點可見性。
- 真實模式的太空影錐依當日太陽、地球、月球向量和實際半徑計算；食象附近使用較近的相機及強化透明度呈現本影、半影。日食地表鏡頭則位於所選經緯度上方，太空指標同時列出全球與所在地食象。
- 真實模式另提供「假設月軌傾角」實驗。預設約 `5.145°` 時直接使用真實月球位置；調離後保留當日月球黃經、距離與交點，按所選傾角縮放黃道緯度，並同步重算太空影錐及地面日月食。畫面持續顯示「傾角假設・非真實天象」，可一鍵重設。這只用來比較傾角對食象的影響，不是重新求解受攝動的真實月球軌道，也不會改變「下一次食象」搜尋的真實結果；恰在交點時改傾角仍可能發生食。
- 未模擬地球大氣折射，月面有微弱示意補光。

### 天球與星空運動

- 顯示地平圈、天頂／天底、子午圈、天極、天球赤道與黃道。
- 內建 523 顆 `V ≤ 4` 的 HYG 亮星，不依賴執行時 CDN。
- 真實模式把 J2000 座標轉換為指定日期和地點的地平座標。
- 教學模式可直接改變緯度，比較天極高度、拱極星與升落軌跡。

### 潮汐

- 同時呈現近月側與背月側隆起，不把海水畫成只被月球單向拉走。
- 朔、望顯示大潮；上弦、下弦顯示小潮。
- 隆起與箭頭是教學誇張，不是沿岸潮位預報。

### 克卜勒與行星運動

- 橢圓由半長軸和離心率建立，太陽在一個焦點。
- 平均近點角等速推進，再解克卜勒方程得到非等速位置。
- 掃掠面積和速度向量解釋第二定律，軌道尺度與週期解釋第三定律。
- 日心比較與地心火星逆行共用行星位置，只改變參考座標。

## 響應式介面與觸控

桌機使用左側場景導覽、中央模型、右側控制面板。手機把高頻控制放在模型下方，進階內容放入底部抽屜：

- 太陽：季節、時間、緯度、速度與常用緯度常駐。
- 月相：月面、照亮比例、觀察地時間、月升／中天／月落常駐。
- 真實模式的太陽、月相、日月食：日期與經緯度可在模型下方快速輸入。
- 三個主場景使用固定等寬頁籤。
- 太陽雙模型在窄直式畫面改成全尺寸切換。
- 次要相機、圖層與教材資訊放進控制抽屜。

為避免手機誤放大整個教材頁面，viewport 使用 `maximum-scale=1.0, user-scalable=no`，一般介面使用 `touch-action: pan-x pan-y`。可操作的 3D canvas 和太陽雙視窗則使用 `touch-action: none`，把觸控交給 OrbitControls，所以仍可單指旋轉、雙指縮放和平移。

## 效能、資源與錯誤處理

### 自動畫質

啟動時依 `deviceMemory`、CPU 核心數與 `devicePixelRatio` 設定像素比上限：低階約 `1.15`、中階 `1.5`、高階 `1.85`。每 120 幀取樣 FPS：低於 34 FPS 時逐步降低像素比，高於 56 FPS 時逐步恢復，但不超過裝置上限。

### 動畫與背景分頁

- 使用 `WebGLRenderer.setAnimationLoop()`。
- 單幀時間差最多 `0.1 s`，避免切回分頁後突然跳躍。
- `document.hidden` 時停止更新和繪製。
- 指標最多約每 140 ms 更新一次，內容相同時不重畫 DOM。
- `ResizeObserver` 同步模型與分割視窗尺寸。

### WebGL fallback

無法建立 WebGL 2 時顯示瀏覽器／硬體加速提示，不留下空白 canvas。收到 `webglcontextlost` 時暫停渲染，`webglcontextrestored` 後恢復。場景切換與頁面卸載都會釋放 geometry、material、texture、controls 和 renderer。

## 本機開發

需要 **Node.js 22 以上版本**。

```bash
git clone https://github.com/alenhu2005/space.git
cd space
npm ci
npm run dev
```

開發網址預設為 `http://127.0.0.1:4173/`。

```bash
npm run dev            # Vite 開發伺服器
npm run build          # TypeScript 型別檢查 + 正式建置
npm run preview        # 預覽 dist/
npm test               # Vitest 單元測試
npm run test:coverage  # 單元測試與 V8 覆蓋率
npm run test:e2e       # Playwright 互動與視覺測試
```

正式檔案輸出至 `dist/`。Vite 開發模式使用 `/`，正式建置使用 GitHub Pages 所需的 `/space/` base path。

## 測試策略

### 單元測試

`tests/unit/` 驗證 ENU 地平座標、方位正規化、相機角度邊界、晝長、極晝極夜、月相、觀測者時間、地球自轉方向、貼圖經緯度、影錐、食分類、潮汐、克卜勒三定律、reducer、URL 安全回復與 AstronomyProvider 固定案例。

目前有 **73 個單元測試**。核心和服務層的行、函式、語句、分支覆蓋率門檻皆為 80%；實際覆蓋率請以 `npm run test:coverage` 為準。

### 瀏覽器互動測試

Playwright 涵蓋 Desktop Chrome、Chromium iPad Pro 11、Chromium iPhone 13、Desktop Firefox 與 Desktop WebKit。案例檢查六場景切換、播放、自由調參、定位拒絕、全螢幕、分享網址、WebGL fallback、頁面／模型觸控縮放和螢幕旋轉。

另外覆蓋地面觀測切換、拖曳跨北、pitch 限制、按住方向鍵連續轉向、滾輪／手機雙指 FOV、快速看向天體、半影外無日食及 URL 還原。沒有 WebGL 2 的 runner 會先驗證 fallback，再跳過依賴實際 3D 畫面的案例。

### 視覺回歸

固定日期、時間、相機和參數，在桌機、平板、手機比較六場景、重要特寫與固定方位的地面天空，並在手機檢查日夜變化、南北方星空、三條節氣路徑、教學與真實日月食，共 **54 個 macOS 視覺案例**。截圖前會等待相機轉場到位，避免把動畫中間幀當作基準圖；基準圖刻意綁定 Darwin，避免 Linux 字型與 WebGL 驅動差異造成誤報。

## GitHub Pages 部署

`.github/workflows/deploy.yml` 在推送到 `main` 或 `master` 後執行：

1. `verify`：Node 22、安裝、覆蓋率、建置、Chromium／Firefox／WebKit 互動測試。
2. `visual`：macOS runner 執行桌機、平板、手機視覺回歸。
3. `deploy`：只有前兩項成功才把 `dist/` 發布到 GitHub Pages。

失敗時保存 Playwright 截圖、trace 和錯誤內容 14 天。部署使用 concurrency group，新推送會取消舊流程，避免舊版最後才上線。

舊入口 `public/public.html` 導向新版首頁；`public/legacy-sun.html` 保留原始太陽教材。

## 擴充方式

新增場景最少需要：

1. 在 `SCENE_IDS` 加入穩定 ID。
2. 在 `definitions.ts` 加入 `SceneDefinition`。
3. 建立場景檔案，回傳符合 `SceneVisual` 的 `root`、`cameras` 和 `update()`。
4. 在 `visuals.ts` 的工廠加入分支。
5. 為新數學補單元測試，為主要操作補 Playwright 案例。

`update()` 應更新既有 Three.js 物件，避免每幀建立 geometry 或 material。監聽器與額外資源必須在 `dispose()` 清除。新增第三方天文能力應先擴充 `AstronomyProvider`；新增 URL 參數必須在解析邊界做白名單或範圍驗證。

## 資料、素材與限制

- 地球：NASA Scientific Visualization Studio「Blue Marble」。
- 月球：NASA Scientific Visualization Studio「CGI Moon Kit」與 LRO。
- 亮星：HYG Database v4.1，保留 523 顆 `V ≤ 4` 星體並加入部分繁體中文名稱。
- 南天極與南十字座的區別：[NASA「What is the North Star and How Do You Find It?」](https://science.nasa.gov/solar-system/what-is-the-north-star-and-how-do-you-find-it/)；南天極沒有明亮的極星，南十字座可用來找南方，但不在南天極上。
- 天文計算：Astronomy Engine。

素材隨網站發布，不需要執行時 CDN。完整來源與授權見 [`public/assets/SOURCES.md`](public/assets/SOURCES.md)。

模型限制：

- 教學模式會誇張尺寸、距離、傾角、影錐和潮汐隆起，不能用畫面長度量測真實比例。
- 真實模式使用實際日期、方向與軌道計算，但天體顯示尺寸仍可能不等比例。
- 地表 3D 特寫主要說明日下點／月下點和受光方向；所在地可見性以觀察資訊為準。
- 月食沒有模擬大氣折射、散射造成的紅色月面。
- 潮汐模型不提供沿岸潮高或時間預報。
- 亮星資料是教學子集，不是完整星表。
- 網站需要現代 WebGL 2 瀏覽器；低階裝置功能相同，但畫質可能較低。

課綱參考：[國家教育研究院自然科學領域課綱](https://www.naer.edu.tw/PageSyllabus?fid=177)。
