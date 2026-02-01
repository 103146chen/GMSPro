# Change Log

All notable changes to the **GMSPro** project will be documented in this file.

The project consists of two main modules: `[GradeFlow]` and `[Notifier]`.

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