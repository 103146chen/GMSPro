/**
 * 設定存取模組 (Refactored for v12)
 * 負責處理屬性儲存與應用程式設定
 * Single Source of Truth: Host Sheet "系統設定_班級清單"
 */

const CONFIG_SHEET_NAME = "系統設定_班級清單";

// 初始化或取得設定頁面
function getConfigSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET_NAME);
    // Schema: [Mode, Name, URL, Status, Metadata]
    sheet.getRange(1, 1, 1, 5).setValues([["類別 (Mode)", "名稱 (Name)", "網址 (URL)", "狀態 (Status)", "參數 (Metadata)"]]);
    sheet.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#e2e8f0");
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * 根據 Mode 讀取清單
 * @param {string} mode - 'subject', 'homeroom', 'pending' ...
 */
function getListByMode(mode) {
  const sheet = getConfigSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  // Read 5 columns now
  const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  const list = [];

  data.forEach(row => {
    const [rowMode, name, url, status, metaJson] = row;
    if (!name || !url) return;

    // Parse Metadata
    let meta = {};
    try { meta = metaJson ? JSON.parse(metaJson) : {}; } catch (e) { }

    const item = {
      mode: rowMode,
      name: String(name),
      url: String(url),
      status: String(status),
      ...meta // Merge metadata (e.g. syncTargets) into object
    };

    if (mode) {
      if (String(rowMode).trim().toLowerCase() === String(mode).trim().toLowerCase()) {
        list.push(item);
      }
    } else {
      list.push(item);
    }
  });

  return list;
}

function initAppData() {
  return {
    subject: getListByMode('subject'),
    homeroom: getListByMode('homeroom')
  };
}

/**
 * 儲存所有資料 (改寫為覆蓋 Sheet)
 * @param {Array} subjectList 
 * @param {Array} homeroomList 
 * @param {Array} pendingList 
 */
function apiSaveAllData(subjectList, homeroomList, pendingList) {
  try {
    const sheet = getConfigSheet_();
    // 清空舊資料
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).clearContent();
    }

    const rows = [];

    // Helper to push rows
    const pushRows = (list, mode) => {
      if (list && Array.isArray(list)) {
        list.forEach(item => {
          // Extract standard props, treat rest as metadata
          const { name, url, status, mode: _m, ...rest } = item;

          // Serialize remaining props (like syncTargets) to JSON
          // Clean up internal keys if any
          const metaStr = Object.keys(rest).length > 0 ? JSON.stringify(rest) : "";

          rows.push([
            mode,
            name,
            url,
            status || 'active',
            metaStr
          ]);
        });
      }
    };

    pushRows(subjectList, 'subject');
    pushRows(homeroomList, 'homeroom');
    pushRows(pendingList, 'pending');

    if (rows.length > 0) {
      sheet.getRange(2, 1, rows.length, 5).setValues(rows);
    }

    return sanitizeForFrontend({ success: true });
  } catch (e) {
    return sanitizeForFrontend({ success: false, msg: e.toString() });
  }
}

/**
 * [New] 部分更新 Homeroom 設定 (for Database.js)
 * 讀取所有資料，替換 Homeroom 部分，再存回。
 */
function apiUpdateHomeroomList(newHomeroomList) {
  try {
    const subjectList = getListByMode('subject');
    const pendingList = getListByMode('pending');
    return sanitizeForFrontend(apiSaveAllData(subjectList, newHomeroomList, pendingList));
  } catch (e) {
    return sanitizeForFrontend({ success: false, msg: e.toString() });
  }
}

/**
 * 將新檔案加入清單
 * @param {string} name 
 * @param {string} url 
 * @param {string} mode - Default 'pending' -> 'subject'? 
 * User requirement says "when a new spreadsheet is created ... call Config.addToPendingList".
 * Usually created sheets are 'subject' sheets waiting to be configured, so maybe 'subject' or 'pending'?
 * Let's stick to 'pending' as a mode if that determines visibility in UI, or 'subject' with status 'pending'.
 * Original code distinguished lists by property keys.
 * Let's use mode='subject' and status='pending' seems more semantic, but User said "Schema: [Mode, Name, URL, Status]".
 * And "Read Logic: getListByMode(mode)".
 * If I use `getListByMode('subject')`, I expect subject sheets.
 * If I use `apiGetPendingFiles`, I expect pending ones.
 * Let's use Mode='subject' for created sheets, but maybe Status='pending'.
 * Wait, `Creator` calls `addToPendingList`.
 * Let's create a specific `addToPendingList` that separates them or uses a specific mode.
 */
function addToPendingList(name, url) {
  try {
    const sheet = getConfigSheet_();
    // v12 Fix: Use Mode='pending' so getListByMode('pending') can find it.
    // This ensures apiUpdateHomeroomList doesn't wipe these rows (since it reads getListByMode('pending')).
    sheet.appendRow(['pending', name, url, 'active', '']);
    return sanitizeForFrontend({ success: true });
  } catch (e) {
    console.error(e);
    return sanitizeForFrontend({ success: false, msg: e.toString() });
  }
}

/**
 * 讀取待處理清單
 */
function apiGetPendingFiles() {
  return sanitizeForFrontend(getListByMode('pending'));
}

const SYSTEM_CONFIG_SHEET_NAME = "系統設定_全域參數";

function getSystemConfigSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SYSTEM_CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SYSTEM_CONFIG_SHEET_NAME);
    // Schema: [Key, Value, Description, UpdatedAt]
    sheet.getRange(1, 1, 1, 4).setValues([["參數名稱 (Key)", "參數值 (Value)", "說明 (Description)", "更新時間"]]);
    sheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#e2e8f0");
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 200);
    sheet.setColumnWidth(2, 300);
  }
  return sheet;
}

/**
 * [全域設定] 讀取參數
 */
function getSystemProperty(key) {
  if (!key) return "";
  const sheet = getSystemConfigSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return ""; // 沒資料

  // 為了效能，通常可以 cache，但 Apps Script 執行一次就結束，cache 效益還好，直接讀取
  // 若資料量大建議用 CacheService，但這裡假設設定不多
  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]) === String(key)) {
      return String(data[i][1]);
    }
  }
  return "";
}

/**
 * [全域設定] 寫入參數
 */
function setSystemProperty(key, value, description) {
  if (!key) return;
  const sheet = getSystemConfigSheet_();
  const lastRow = sheet.getLastRow();
  let rowIndex = -1;
  let currentDesc = "";

  if (lastRow >= 2) {
    const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < data.length; i++) {
      if (String(data[i][0]) === String(key)) {
        rowIndex = i + 2;
        break;
      }
    }
  }

  const now = Utilities.formatDate(new Date(), "GMT+8", "yyyy/MM/dd HH:mm:ss");
  const valStr = String(value);

  if (rowIndex > 0) {
    // Update existing
    sheet.getRange(rowIndex, 2).setValue(valStr);
    sheet.getRange(rowIndex, 4).setValue(now);
    if (description) sheet.getRange(rowIndex, 3).setValue(description);
  } else {
    // Insert new
    sheet.appendRow([key, valStr, description || "", now]);
  }
}

// 相容舊函式介面 (給其他檔案呼叫)
function getProperty_(key) {
  return getSystemProperty(key);
}

function saveUserTemplates(tplJson) {
  setSystemProperty("USER_TEMPLATES", tplJson, "通知信範本設定");
  return sanitizeForFrontend({ success: true });
}

function loadUserTemplates() {
  const json = getSystemProperty("USER_TEMPLATES");
  const defaultTpl = {
    missingSubject: "【作業補交通知】{{姓名}} - 尚有未完成作業",
    missingBody: "{{姓名}} 同學好：\n\n系統檢測到您有以下作業尚未登錄成績。\n\n{{缺交列表}}\n\n{{逾期列表}}\n\n請注意期限，盡速補交。",
    reportSubject: "【成績通知】{{姓名}} - 國文科成績單",
    reportBody: "親愛的家長您好：\n\n這是 {{姓名}} 的成績通知，詳細分數如下表：\n\n{{成績表格}}\n\n請查收，謝謝。"
  };
  if (!json) return defaultTpl;
  let tpl = JSON.parse(json);
  if (tpl.missingBody && !tpl.missingBody.includes("{{逾期列表}}")) {
    tpl.missingBody += "\n\n{{逾期列表}}";
  }
  return sanitizeForFrontend(tpl);
}

