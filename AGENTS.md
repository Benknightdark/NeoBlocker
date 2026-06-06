# NeoBlocker 開發規範 (AGENTS.md)

本文件規範 NeoBlocker 擴充套件的架構邊界、自動驗證機制 (Sensors) 與人工審查決策點，以確保程式碼品質與安全性。

---

## 1. 專案現況

* **類型**：WXT 框架 (Manifest V3) 廣告攔截器。
* **技術堆疊**：原生 TypeScript、HTML、CSS (無前端框架，基於 WXT 構建)。
* **規則引擎**：Chrome `declarativeNetRequest` (DNR) 靜態規則。
* **常用指令**：
  * `npm run dev`：啟動開發伺服器 (支援熱更新)。
  * `npm run build`：編譯 Chrome 生產環境產物。
  * `npm run zip`：打包為擴充套件 Zip 壓縮檔。
  * `npm run prepare`：生成 WXT 類型定義。
  * `npm run build:dnr`：下載並編譯 EasyList/EasyPrivacy/EasyList China 與 cjxlist 規則至 `public/rules/`。
  * `npm run test`：執行 Vitest 單元與整合測試。
  * `npm run test:e2e`：執行 Playwright 端到端測試。
* **檢測缺口 (Sensors Gap)**：
  * 缺乏自動化代碼風格檢查 (未配置 ESLint 或 Prettier)。

---

## 2. 可治理性評估 (Harnessability)

* **評估等級**：**高 (High)**
* **說明**：
  * **優勢**：採用 WXT + TypeScript。配置 Playwright E2E 測試，可在實體 Chromium 瀏覽器中自動驗證 Popup、Options 頁面與 DNR 攔截/白名單放行機制。編譯器可自動阻斷非法 Chrome API 呼叫。
  * **劣勢**：無 ESLint 機制，代碼語法風格目前無法自動化強制統一。

---

## 3. 開發規範 (Feedforward Guides)

開始開發前，須嚴格遵守以下架構邊界與編寫規範：

### 3.1 核心架構邊界
* [wxt.config.ts](file:///Users/ben/Projects/NeoBlocker/wxt.config.ts)：WXT 設定檔。定義權限與 rulesets 資源 (編譯時會自動掃描 rules 目錄生成配置)。
* [entrypoints/background.ts](file:///Users/ben/Projects/NeoBlocker/entrypoints/background.ts)：Service Worker 背景腳本。處理生命週期事件、DNR 動態規則重建與靜態防線規則集同步。
* [entrypoints/popup/](file:///Users/ben/Projects/NeoBlocker/entrypoints/popup/)：Popup 快速控制介面與 TypeScript 邏輯。
* [entrypoints/options/](file:///Users/ben/Projects/NeoBlocker/entrypoints/options/)：白名單、自訂規則與防護模組設定主控台 (以獨立新分頁開啟)。
* [public/content.css](file:///Users/ben/Projects/NeoBlocker/public/content.css)：外觀過濾樣式 (Cosmetic CSS)，由背景腳本注入。
* [public/rules/](file:///Users/ben/Projects/NeoBlocker/public/rules/)：DNR 靜態規則 JSON。打包時直接複製至產物根目錄。

### 3.2 程式碼編寫指南
1. **禁用 MV2 API**：必須使用 Manifest V3 標準 (如 `chrome.declarativeNetRequest` 代替 `chrome.webRequest`，`chrome.action` 代替 `chrome.browserAction`)。
2. **TypeScript 規範**：Entrypoints 必須使用 TS 並嚴格宣告型別，嚴禁濫用 `any`。
3. **DNR 規則唯一性**：DNR 規則 `id` 必須為正整數且在同一個 Rule Set 中唯一。
4. **效能與記憶體優化**：
   * 背景與 Options 儲存通訊必須合併為單次 `SYNC_ALL_SETTINGS` 訊息，且背景僅能執行單次 Storage 讀取。
   * 實作路徑快取與變更比對，避免在白名單或 Cosmetic 設定未變動時重複註冊 Content Scripts，以優化記憶體與 CPU 效能。

---

## 4. 自動驗證機制 (Feedback Sensors)

實施以下機制驗證變更並攔截錯誤：

| 檢查層級 | 檢查類型 | 方法 / 指令 | 說明 |
| :--- | :--- | :--- | :--- |
| **本地編譯** | 計算檢查 | `npm run build` | 驗證 TypeScript 編譯與 WXT 構建，確保無語法或型別錯誤。 |
| **規則編譯** | 計算檢查 | `npm run build:dnr` | 驗證規則轉換工具正常運行並生成 JSON 至 `public/rules/`。 |
| **單元與整合測試** | 計算檢查 | `npm run test` | 執行 Vitest，驗證背景服務與設定頁儲存庫狀態。 |
| **端到端測試** | 計算檢查 | `npm run test:e2e` | 執行 Playwright，在真實 Chromium 中驗證 Popup、Options 頁面與 DNR 網路攔截/白名單放行機制。 |
| **語法校驗** | 計算檢查 | *尚未配置 ESLint* | 預計引入 ESLint 強化代碼風格校驗。 |
| **API 審查** | 推論檢查 | 人類/AI 雙重審查 | 審查所有 Chrome API 變更是否符合 MV3 標準。 |

---

## 5. 待改善清單 (Sensors Improvement)

優先執行以下工程改善以提高開發可靠性：

* **P0：引入 ESLint**
  * 配置適用於 TypeScript 與 Chrome Extension 的規則集，防止潛在代碼漏洞。
* **P1：DNR 規則語意校驗器**
  * 在 `tools/build-dnr.mjs` 中加入檢測機制，驗證 DNR 規則 ID 唯一性與正則表達式合規性。
* **P2：自動化測試 (已完成)**
  * 已配置 `Vitest` 與 `happy-dom`，完成單元與整合測試。
* **P3：端端測試 (已完成)**
  * 已配置 `Playwright`，完成真實瀏覽器下的 UI 持久化與 DNR 攔截測試。

---

## 6. 人工決策點 (Human-in-the-Loop)

以下變更嚴禁由 AI 自主決定，必須由工程師審查與簽核：

1. **權限變更 (Permissions)**：
   * 修改 `wxt.config.ts` 中的 `permissions` 與 `host_permissions`。此舉影響 Chrome 線上商店審查層級與隱私。
2. **隱私與個資處理**：
   * 涉及收集、儲存或傳輸瀏覽紀錄、白名單網址的邏輯，需確認符合 [docs/privacy.html](file:///Users/ben/Projects/NeoBlocker/docs/privacy.html)。
3. **打包與釋出**：
   * 執行發佈打包及 Chrome Web Store 上架部署流程。

---

## 7. 驗證步驟

提交或合併變更前，必須執行以下驗證：

1. **編譯驗證**：
   ```bash
   npm run build
   ```
   確認無編譯報錯且 `.output/` 目錄成功生成產物。
2. **自動化測試驗證**：
   ```bash
   npm run test
   npm run test:e2e
   ```
   確保單元、整合及 E2E 測試全部 Pass，無回歸漏洞.
3. **瀏覽器載入測試**：
   * 開啟 Chrome 的 `chrome://extensions/`。
   * 開啟「開發人員模式」。
   * 點擊「載入未封裝項目」，選擇 `.output/chrome-mv3` 目錄。
4. **功能檢驗**：
   * 點擊 NeoBlocker 圖示，確認 Popup UI 正常加載。
   * 瀏覽測試頁面，確認廣告已被封鎖。
   * 檢查 Service Worker 控制台，確認無未捕獲的運行期錯誤。
