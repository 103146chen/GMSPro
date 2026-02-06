# Change Log

All notable changes to the **GMSPro** project will be documented in this file.

The project consists of two main modules: `[GradeFlow]` and `[Notifier]`.

## v10.11 - The Resilience Update (2026-02-03)
*針對系統安全性、資料同步容錯率以及自動化流程的重大補強。*

### 🔐 Security & Integrity (資安與資料完整性)
- **⚙️ [Database] 讀取權限私有化 (Private Access)**：
  - 將原始成績讀取函式更名為 `fetchHomeroomMasterData_()`（加上底線）。
  - **安全性**：強制該函式僅能由後端內部呼叫，防止惡意使用者透過瀏覽器 Console 執行 `google.script.run` 直接抓取未加密的原始成績資料。
- **⚙️ [Database] 強制覆蓋同步 (Snapshot Sync)**：
  - 捨棄舊有的「增量更新 (Append)」邏輯，改採「先清空 (`clear()`)、後寫入」模式。
  - **效益**：確保資料庫與試算表狀態完全一致，解決重複同步造成的資料膨脹問題，並能自動清除被刪除的作業。
- **⚙️ [Database] 欄位動態定位 (Dynamic Anchor)**：
  - 讀取成績時不再依賴固定欄位順序，改為動態搜尋「座號」與「姓名」標題所在位置。
  - **容錯**：即使小老師移動欄位或插入新欄，系統仍能精準鎖定成績位置，不會讀錯資料。

### ⚡ Automation & Workflow (自動化與流程)
- **🔵 [Creator] 待處理清單直寫 (Direct Pending Write)**：
  - 建立檔案成功後，直接將連結寫入後端 `PENDING_CONFIG_LIST` 屬性，取代不穩定的資料夾掃描機制。
  - **效益**：新建立的檔案會「立即」出現在連結管理中心的黃色待處理區，無須重新整理網頁。
- **🔵 [Creator] 學生名單功能回歸**：
  - 在「單一建立」與「批次建立」介面恢復「學生名單」輸入框。
  - **優化**：放寬格式限制，支援從 Excel 直接貼上（自動解析 Tab、逗號、半形/全形空白）。
- **⚙️ [System] 設定頁自動同步**：
  - 開啟「連結管理中心」或「批次設定視窗」時，自動呼叫後端抓取最新待處理項目。

### 🐛 Bug Fixes (錯誤修復)
- **⚙️ [System] 導航修復**：補上遺失的 `jumpToDbCreator` 函式，解決點擊「建立資料庫」連結時發生的 `ReferenceError`。
- **🟢 [GradeFlow] 批次防呆**：修正批次管理介面因讀取不到 `title` 屬性導致的 `match` 錯誤，並加入防呆檢查避免紅字報錯。

## v10.10 - The Integration Update (2026-02-01)
*整合檔案瀏覽器介面與自動化流程，提升整體協作效率。*
- **[System] 檔案總管 (File Explorer)**：新增統一的檔案瀏覽介面，可直接預覽、開啟或管理由系統產生的試算表。
- **[System] Data Hub 整合**：優化了中繼資料的讀取效率，減少重複的 API 呼叫。

## v10.4 - System Health Check (核心邏輯修復)
*針對系統底層邏輯進行的大規模除錯與效能優化。*
- **🟢 [GradeFlow] 迴圈邏輯反轉 (Loop Reversal)**：
  - 將運算核心從「逐一學生跑所有成績」修正為 **「逐一作業跑所有學生」**。
  - **效益**：確保記憶體中同時只存在單一作業數據，完全杜絕跨作業成績錯置 (Cross-contamination) 風險，並大幅提升運算速度。
- **🟢 [GradeFlow] UID 生成機制更新**：
  - 改用 `sheetName + "_" + columnIndex` 作為作業唯一識別碼，解決同名作業導致的 ID 衝突問題。
- **🔵 [Notifier] 智能日期過濾 (Date Guard)**：
  - 新增 `startDate` 檢查。掃描缺交時先驗證作業日期，避免誤判未來作業。
- **🔵 [Notifier] 發信錯誤處理**：
  - Email 發送功能新增 `try-catch` 機制，若遇額度不足或地址錯誤，系統會回報具體錯誤而非崩潰。

## v10.3 - UX & Security Update
- **🟢 [GradeFlow] 五標視覺化**：前端查詢介面改用「五標方塊」數值呈現 (Bg-slate-50)，取代易誤導的進度條。
- **🟢 [GradeFlow] 自動登入 (Auto-login)**：引入 `localStorage` 機制，記住使用者座號與憑證。
- **⚙️ [System] 密碼規範**：確立 `student/parent` + `{{座號補零}}` 的預設密碼規則。

## v9.1 - Dual Auth Architecture
- **⚙️ [System] 資料庫分離**：將 Data Hub 拆分為 `DB_Source` (成績資料) 與 `DB_Auth` (權限資料)，提升安全性。
- **🟢 [GradeFlow] 雙重驗證**：實作「學生」與「家長」獨立密碼機制。

## v8.5 - Analytics Dashboard
- **🟢 [GradeFlow]**：新增全班成績分布圖、五標落點分析、以及前三名 (🥇🥈🥉) 自動排行。

## v8.0 - Dual Mode (Subject/Homeroom)
- **🟢 [GradeFlow]**：正式支援「任課模式 (藍色)」與「導師模式 (粉紫)」切換。
- **⚙️ [System]**：後端資料結構分流 (`subjectClasses` vs `homeroomClasses`)。

## v7.0 - The Creator (Automation)
- **🔵 [Notifier]**：新增 **Creator** 功能，支援 Excel 名單貼上並批次建立試算表。
- **🔵 [Notifier]**：建立連結管理中心 (`View_Link`)。

## v5.0 - The Merger
- **System**: 正式將 `AutomaticHomeworkNotifier` 與 `GradeFlow` 專案合併，共用函式庫與 Tailwind CSS UI 架構。