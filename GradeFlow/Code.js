/**
 * 學生成績查詢系統 v13.4 (Open Source Ready)
 * 修正重點：支援 AES 解密與 Key Exchange
 */
function getOrLoadSecretKey_() {
  let key = getSystemConfig_("AES_KEY");
  if (key) return key;
  return null;
}

// --- Sheet Config Helpers ---
const CONFIG_SHEET_NAME = "系統設定";

function getSystemConfigSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET_NAME);
    sheet.getRange(1, 1, 1, 2).setValues([["Key", "Value"]]);
    sheet.setFrozenRows(1);
    sheet.hideSheet(); // Hide from students
  }
  return sheet;
}

function saveSystemConfig_(key, value) {
  const sheet = getSystemConfigSheet_();
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

function getSystemConfig_(key) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

function doGet(e) {
  // Check if we are configured.
  // 1. DB Connection: Either DB_URL in System Config is set, OR we are bound to a Sheet that has DB_Source.
  // 2. Security: AES_KEY must be known (derived from Salt) in System Config.

  const dbUrlProp = getSystemConfig_("DB_URL");
  const aesKey = getSystemConfig_("AES_KEY");

  // Determine effective DB URL
  let isDbReady = false;
  if (dbUrlProp) {
    isDbReady = true;
  } else {
    // Check local
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss.getSheetByName("DB_Source")) isDbReady = true;
  }

  // If Key is missing, forcing Setup.
  if (isDbReady && aesKey) {
    var tpl = HtmlService.createTemplateFromFile('Index');
    tpl.sysMode = 'LOGIN';
    return tpl.evaluate()
      .setTitle('學生成績查詢系統')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } else {
    // Show Admin Setup
    return HtmlService.createTemplateFromFile('ADMIN_SETUP')
      .evaluate()
      .setTitle('系統初始化 | GradeFlow')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function normalizeSeat_(seat) {
  let s = String(seat).trim();
  if (s.length > 0 && s.length < 2) {
    s = "0" + s;
  }
  return s;
}

/**
 * API：登入邏輯
 */
function apiLogin(seatNo, password) {
  try {
    let dbUrl = getSystemConfig_("DB_URL");

    let ss;
    if (dbUrl) {
      try { ss = SpreadsheetApp.openByUrl(dbUrl); } catch (e) { return { success: false, msg: "無法開啟外部資料庫" }; }
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }

    // ... rest of logic uses `ss`

    // --- 0. 資料正規化 ---

    // 強制將輸入座號補零 (例如 "5" -> "05")
    const targetSeat = normalizeSeat_(seatNo);

    // --- 1. 驗證身分 (Auth) ---
    const authSheet = ss.getSheetByName("DB_Auth");
    if (!authSheet) return { success: false, msg: "資料庫結構錯誤 (Auth)" };

    const authData = authSheet.getDataRange().getDisplayValues();
    let isValid = false;
    let role = "";
    const inputHash = hashPassword_(password);

    for (let i = 1; i < authData.length; i++) {
      const dbSeat = normalizeSeat_(authData[i][0]);

      if (dbSeat === targetSeat) {
        const sHash = String(authData[i][1] || "").trim();
        const pHash = String(authData[i][2] || "").trim();
        if (inputHash === pHash) { isValid = true; role = "parent"; }
        else if (inputHash === sHash) { isValid = true; role = "student"; }
        break;
      }
    }

    if (!isValid) return { success: false, msg: "座號或密碼錯誤" };

    // --- 2. 讀取並解密成績 (Source) ---
    const sourceSheet = ss.getSheetByName("DB_Source");
    // 若無成績表，直接回傳空資料
    if (!sourceSheet) {
      return sanitizeResponse_({
        success: true, role: role, seat: targetSeat,
        name: "座號 " + targetSeat, payload: [], time: "尚無資料"
      });
    }

    const sourceData = sourceSheet.getDataRange().getValues();
    let studentName = "";
    let combinedPayload = [];
    let timeStr = "";

    // 預先取得解密金鑰
    const secretKey = getOrLoadSecretKey_();
    if (!secretKey) return { success: false, msg: "系統錯誤：尚未連結加密金鑰 (Key Missing)" };

    for (let i = 1; i < sourceData.length; i++) {
      const rowSeat = normalizeSeat_(sourceData[i][0]);

      if (rowSeat === targetSeat) {
        // 取得時間 (若尚未取得)
        if (!timeStr) {
          const rawTime = sourceData[i][2];
          // 簡易轉型，後續 sanitizeResponse_ 會做更完整的處理
          if (rawTime instanceof Date) {
            timeStr = Utilities.formatDate(rawTime, "GMT+8", "yyyy/MM/dd HH:mm");
          } else {
            timeStr = String(rawTime || "").trim();
          }
        }

        const encryptedBlob = String(sourceData[i][1] || "");

        try {
          // 解密 (AES)
          const jsonStr = cipherData_(encryptedBlob, false, secretKey);

          if (jsonStr && jsonStr.startsWith("{")) {
            const record = JSON.parse(jsonStr);

            if (!studentName && record.nm) studentName = record.nm;

            combinedPayload.push({
              subject: record.sb,
              task: record.tk,
              score: record.sc,
              rank: record.rk,
              stats: record.st,
              date: record.dt,
              sheet: record.sh
            });
          }
        } catch (err) {
          // 生產環境：解密失敗時僅在後台記錄，不回傳給前端
          console.error(`Row ${i + 1} 解密失敗: ${err.toString()}`);
        }
      }
    }

    const displayName = studentName || ("座號 " + targetSeat);

    // --- 3. 最終回傳 (經過清洗，防止 Date 物件導致 Crash) ---
    const response = {
      success: true,
      role: role,
      seat: targetSeat,
      name: displayName,
      payload: combinedPayload,
      time: timeStr || "無資料"
    };

    return sanitizeResponse_(response);

  } catch (e) {
    return { success: false, msg: "系統錯誤，請稍後再試。" };
  }
}

function sanitizeResponse_(data) {
  if (data === null) return null;
  if (data === undefined) return null;

  if (data instanceof Date) {
    return Utilities.formatDate(data, "GMT+8", "yyyy/MM/dd HH:mm:ss");
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeResponse_(item));
  }

  if (typeof data === 'object') {
    const cleanObj = {};
    for (const key in data) {
      cleanObj[key] = sanitizeResponse_(data[key]);
    }
    return cleanObj;
  }

  return data;
}

function apiChangePassword(seatNo, oldPwd, newPwd) {
  try {
    // v13.5: Use Active Spreadsheet
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const authSheet = ss.getSheetByName("DB_Auth");
    if (!authSheet) return { success: false, msg: "找不到權限表 (Auth)" };

    const data = authSheet.getDataRange().getDisplayValues();
    const targetSeat = normalizeSeat_(seatNo);

    const oldHash = hashPassword_(oldPwd);
    const newHash = hashPassword_(newPwd);

    for (let i = 1; i < data.length; i++) {
      if (normalizeSeat_(data[i][0]) === targetSeat) {
        const sHash = String(data[i][1]).trim();
        const pHash = String(data[i][2]).trim();

        if (oldHash === pHash) { authSheet.getRange(i + 1, 3).setValue(newHash); return { success: true, msg: "家長密碼已更新" }; }
        else if (oldHash === sHash) { authSheet.getRange(i + 1, 2).setValue(newHash); return { success: true, msg: "學生密碼已更新" }; }
        else { return { success: false, msg: "舊密碼錯誤" }; }
      }
    }
    return { success: false, msg: "帳號不存在" };
  } catch (e) { return { success: false, msg: e.message }; }
}

function apiSaveSettings(url, salt, isInit) {
  try {
    // 1. Save DB URL (Optional - if provided, it overrides local)
    if (url && url.length > 5) {
      saveSystemConfig_("DB_URL", url);
    } else {
      // If empty, user means "Local". We can clear DB_URL to fallback to active sheet.
      // Implementing "clear" by setting empty or removing row is implicit if we just don't save it, 
      // but to be explicit we might want a delete function. 
      // For now, saving empty string is effectively clearing it if getSystemConfig_ handles it.
      saveSystemConfig_("DB_URL", "");
    }

    // 2. Save Salt -> Derive Key
    if (salt) {
      const derivedKey = hashPassword_(salt);

      // Save to Sheet (Per User Request: "SALT ... imported to Google Sheet")
      saveSystemConfig_("AES_KEY", derivedKey);

    } else if (isInit) {
      return { success: false, msg: "初始化必須設定金鑰 (Salt)" };
    }

    return { success: true };
  } catch (e) { return { success: false, msg: e.toString() }; }
}



// --- 資安核心  ---

function hashPassword_(rawPassword) {
  if (!rawPassword) return "";
  const raw = String(rawPassword).trim();
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  let txtHash = "";
  for (let i = 0; i < digest.length; i++) {
    let hashVal = digest[i];
    if (hashVal < 0) hashVal += 256;
    if (hashVal.toString(16).length == 1) txtHash += "0";
    txtHash += hashVal.toString(16);
  }
  return txtHash;
}

/**
 * [更新版] 解密核心 (AES)
 * text: 密文
 * secretKey: 32-byte Key
 */
function cipherData_(text, isEncrypt, secretKey) {
  if (!text) return "";

  if (isEncrypt) {
    // 學生端理論上不需要加密功能，但保留介面
    try {
      if (typeof CryptoJS === 'undefined') return "Error: CryptoJS library not found.";
      const encrypted = CryptoJS.AES.encrypt(text, secretKey).toString();
      return encrypted;
    } catch (e) { return ""; }
  } else {
    // 解密
    try {
      if (typeof CryptoJS === 'undefined') return "";

      const decryptedBytes = CryptoJS.AES.decrypt(text, secretKey);
      const decrypted = decryptedBytes.toString(CryptoJS.enc.Utf8);
      return decrypted;
    } catch (e) {
      return "";
    }
  }
}
