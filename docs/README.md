# 🎓 GMSPro - Educational Application Toolset

![Version](https://img.shields.io/badge/version-10.10-blue) ![License](https://img.shields.io/badge/license-AGPLv3-red) ![Platform](https://img.shields.io/badge/platform-Google%20Apps%20Script-4285F4)

**GMSPro** (Grade Management System Pro) 是一套專為教育工作者打造的開源工具集。基於 Google Apps Script (GAS) 開發，整合了成績管理、數據分析與自動化通知功能，旨在解決教學現場的繁瑣行政工作。

## 📦 Core Modules (核心模組)

本專案包含兩個並行運作的核心模組：

### 1. 🟢 GradeFlow (成績管理系統)
專注於成績數據的處理、分析與親師生溝通。
* **雙軌模式 (Dual Mode)**：支援 **「任課教師 (Subject)」** 與 **「班級導師 (Homeroom)」** 兩種介面模式，並以主題色（藍/粉紫）區分。
* **學生/家長入口 (Client Portal)**：響應式 Web App，提供五標分析、排名查詢與成績落點視覺化。
* **資安架構**：採用 `DB_Source` (資料) 與 `DB_Auth` (權限) 分離設計，並支援雙重密碼驗證。

### 2. 🔵 AutomaticHomeworkNotifier (缺勤通知機器人)
專注於作業繳交狀況的監控與自動化提醒。
* **智能掃描**：自動掃描 Google Sheets 中的缺交紀錄，排除無效日期與未來作業。
* **郵件通知**：支援 HTML 郵件模板，可設定排程自動寄送缺交週報或即時提醒。
* **建立器 (The Creator)**：支援 Excel 名單批次匯入，一鍵建立班級試算表並設定權限。

---

## 🛠️ Tech Stack (技術棧)

* **Backend**: Google Apps Script (Server-side JavaScript)
* **Frontend**: HTML5, **Tailwind CSS** (via CDN), JavaScript (ES6+)
* **Database**: Google Sheets (作為 NoSQL-like 資料來源)
* **Auth**: Custom Hash-based Authentication & LocalStorage

---

## 🚀 Quick Start (快速開始)

1.  **建立專案**：在 Google Drive 新增一個 Google Apps Script 專案。
2.  **部署程式碼**：將 `GradeFlow/` 或 `AutomaticHomeworkNotifier/` 目錄下的檔案複製到專案中。
3.  **首次設定**：
    * 執行 `_setup.js` 或初始化函式以建立必要的 Script Properties。
    * 授權存取 Google Drive 與 Gmail 權限。
4.  **發布 (Deploy)**：
    * 選擇 **Deploy as Web App**。
    * **Execute as**: `Me` (您的帳號)。
    * **Who has access**: `Anyone` (或是 `Anyone with Google Account`)。

---

## 📄 License (授權條款)

本專案採用 **GNU Affero General Public License v3.0 (AGPLv3)** 開源授權。

這是一個具有「強烈傳染性」的 Copyleft 授權，旨在確保軟體自由能延伸至網路服務使用者：
1.  **分享相同授權**：如果您修改了本程式並提供服務（例如部署給學校使用），您必須向使用者公開您的修改後原始碼。
2.  **保持開源**：任何基於本專案衍生的作品，都必須沿用 AGPLv3 授權，不得轉為閉源。
3.  **無擔保聲明**：本程式基於分享精神提供，**不附帶任何形式的擔保**。

詳細條款請參閱 [LICENSE](LICENSE) 文件。