# 🎓 GradeFlow 成績管理系統

> 一套專為教師設計的自動化成績管理、缺交通知與親師生溝通系統。

![Version](https://img.shields.io/badge/version-10.3-blue) ![Status](https://img.shields.io/badge/status-active-success) ![Platform](https://img.shields.io/badge/platform-Google%20Apps%20Script-green)

## 📖 專案簡介 (Overview)

本專案旨在解決教學現場的成績管理痛點。透過 Google Apps Script (GAS) 串接 Google Sheets，實現成績資料的自動化彙整、數據分析與通知發送。系統支援「任課教師」與「班級導師」雙軌模式，並提供響應式的學生成績查詢介面 (Student Portal)。

---

## ✨ 核心功能 (Features)

### 👨‍🏫 教師端 (Admin Dashboard)
* **雙軌模式 (Dual Mode)**：可自由切換 **「任課模式 (Subject)」** 與 **「導師模式 (Homeroom)」**，並以主題色（藍/粉紫）區分。
* **自動化建立 (The Creator)**：支援貼上 Excel 名單批次建立班級成績表，並自動設定權限與連結。
* **數據分析儀表板**：
    * 自動計算單科/總分排名 (Top 3)。
    * 五標 (頂/前/均/後/底) 分布長條圖。
    * 全班成績總覽與缺交掃描。
* **批次管理**：可將待處理檔案批次轉移身分，集中管理外部連結。

### 👨‍👩‍👧‍👦 學生/家長端 (Client Portal)
* **五標視覺化**：以清晰的方塊數值取代傳統進度條，直觀顯示成績落點。
* **自動登入 (Auto-login)**：記住座號與密碼，提升查詢便利性。
* **響應式設計**：基於 Tailwind CSS 開發，完美支援手機與桌機瀏覽。

### 🛡️ 系統架構與資安
* **雙重權限驗證 (Dual Auth)**：
    * **學生權限**：僅能查看個人成績。
    * **家長權限**：獨立密碼機制，確保家長能掌握真實成績狀況。
* **資料庫分離**：
    * `DB_Source`：成績資料 (每日覆寫)。
    * `DB_Auth`：權限與密碼表 (只增不減，保留修改紀錄)。

---

## 🛠️ 技術棧 (Tech Stack)

* **Backend**: Google Apps Script (GAS)
* **Frontend**: HTML5, Tailwind CSS (CDN)
* **Database**: Google Sheets (Data Hub)
* **Deployment**: Web App (executing as user accessing)

---

## 📝 版本歷程 (Change Log)

### v10.3 - 使用者體驗與視覺優化 (Current)
- **【查詢端】五標顯示優化**：改為清晰的「五標方塊」數值呈現 (Bg-slate-50 風格)。
- **【查詢端】自動登入**：新增 `localStorage` 機制，記住使用者座號與密碼。
- **【管理端】預設密碼規範更新**：學生 (`student` + 座號補零) / 家長 (`parent` + 座號補零)。

### v9.1 - 資安架構升級 (Dual Auth)
- **資料庫分離**：拆分為 `DB_Source` (資料) 與 `DB_Auth` (權限)。
- **雙重權限驗證**：區分學生與家長獨立密碼，權限互不干擾。
- **家長端修復**：修正初始化邏輯，確保設定畫面正常觸發。

### v8.5 - 數據分析儀表板
- **分析圖表**：全班成績總覽新增視覺化圖表。
- **排行與分布**：自動計算前三名 (🥇🥈🥉) 與五標分布圖。

### v8.2 - 流程修復與批次管理
- **待處理優化**：修復 `JS_Creator` 欄位錯誤。
- **批次身分轉移**：設定頁面可批次轉換「待處理」檔案為任課或導師班。

### v8.0 - 雙軌模式 (Dual Mode)
- **模式切換**：新增任課/導師模式切換，搭配主題色變更。
- **資料分流**：後端分離 `subjectClasses` 與 `homeroomClasses`。

### v7.0 - 自動化流程重構 (The Creator)
- **檔案建立器**：支援 Excel 名單批次建立試算表。
- **連結管理**：新增 `View_Link` 頁面集中管理。

### v6.2 - 介面簡化
- **UI 減法**：移除多餘選單，改為自動掃描。
- **手動連結**：支援手動輸入網址功能。

### v5.0 (Ultimate) - 系統大整合
- **專案合併**：整合缺交通知與成績單產生器。
- **UI 重構**：全面導入 Tailwind CSS。
- **雲端同步**：表格設定存入 Script Properties。

---

## 🚀 安裝與部署 (Setup)

1.  建立新的 Google Apps Script 專案。
2.  複製專案程式碼至編輯器。
3.  部署為網頁應用程式 (Web App)。
    * **Execute as**: Me (User)
    * **Who has access**: Anyone (or Anyone with Google account)
4.  首次執行需授權存取 Google Drive 與 Google Sheets。

---

> 此專案由開發者維護，用於教育現場實務。