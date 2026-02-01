/**
 * 學生成績查詢系統 v13.4 (Open Source Ready)
 * 修正重點：對應管理端的 IV 加密邏輯，支援每行獨立金鑰解密
 */

function doGet(e) {
  var props = PropertiesService.getScriptProperties();
  var dbUrl = props.getProperty("DB_URL");
  
  if (dbUrl) {
    var tpl = HtmlService.createTemplateFromFile('Index');
    tpl.sysMode = 'LOGIN'; 
    return tpl.evaluate()
        .setTitle('學生成績查詢系統')
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
        .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } else {
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

/**
 * API：登入邏輯
 */
function apiLogin(seatNo, password) {
  try {
    const props = PropertiesService.getScriptProperties();
    const DB_URL = props.getProperty("DB_URL");
    const SYSTEM_SALT = props.getProperty("SYSTEM_SALT"); // 直接取得 Salt

    if(!DB_URL) return { success: false, msg: "系統未設定資料庫連結" };

    let ss;
    try { ss = SpreadsheetApp.openByUrl(DB_URL); } 
    catch(e) { return { success: false, msg: "無法開啟資料庫" }; }
    
    const FILE_ID = ss.getId(); // 取得檔案 ID 作為基礎金鑰的一部分

    // 1. 驗證身分 (Auth)
    const authSheet = ss.getSheetByName("DB_Auth");
    if(!authSheet) return { success: false, msg: "資料庫結構錯誤 (Auth)" };
    
    const authData = authSheet.getDataRange().getDisplayValues(); 
    let isValid = false;
    let role = ""; 
    const targetSeat = String(seatNo).trim();
    const inputHash = hashPassword_(password); 

    for(let i=1; i<authData.length; i++) {
      const dbSeat = String(authData[i][0] || "").trim();
      if(dbSeat === targetSeat) {
        const sHash = String(authData[i][1] || "").trim();
        const pHash = String(authData[i][2] || "").trim();
        if (inputHash === pHash) { isValid = true; role = "parent"; }
        else if (inputHash === sHash) { isValid = true; role = "student"; }
        break;
      }
    }

    if (!isValid) return { success: false, msg: "座號或密碼錯誤" };

    // 2. 讀取並解密成績
    const sourceSheet = ss.getSheetByName("DB_Source");
    if (!sourceSheet) return { success: false, msg: "資料庫無成績資料" };

    const sourceData = sourceSheet.getDataRange().getValues();
    let studentName = "";
    let combinedPayload = []; 
    let timeStr = ""; 
    
    for(let i=1; i<sourceData.length; i++) {
       const rowSeat = String(sourceData[i][0]).trim();
       
       if(rowSeat === targetSeat) {
          if(!studentName) studentName = String(sourceData[i][1] || "");
          
          if(!timeStr) {
             const rawTime = sourceData[i][5];
             timeStr = (rawTime instanceof Date) ? Utilities.formatDate(rawTime, "GMT+8", "yyyy/MM/dd HH:mm") : String(rawTime || "");
          }

          const subjectName = String(sourceData[i][2] || "");
          const taskName = String(sourceData[i][3] || "");
          const encryptedBlob = String(sourceData[i][4] || "");

          try {
             // ★★★ 修改：傳入 SYSTEM_SALT 與 FILE_ID，讓函式自己去算這一行的 Key ★★★
             const jsonStr = cipherData_(encryptedBlob, false, SYSTEM_SALT, FILE_ID);
             
             if(jsonStr) {
                 // 這裡不再需要 substring(8)，因為 cipherData_ 已經處理完 IV 了
                 const record = JSON.parse(jsonStr);
                 
                 combinedPayload.push({
                     subject: subjectName,
                     task: taskName,
                     score: record.sc,
                     rank: record.rk,
                     stats: record.st,
                     date: record.dt,
                     sheet: record.sh
                 });
             }
          } catch(err) { 
             console.error("解密失敗 (Row " + (i+1) + ")"); 
          }
       }
    }

    if(combinedPayload.length === 0) {
        return { 
            success: true, 
            role: role, 
            seat: targetSeat, 
            name: studentName || "同學", 
            payload: [], 
            time: timeStr || "無資料"
        };
    }

    return { 
      success: true, 
      role: role, 
      seat: targetSeat, 
      name: studentName, 
      payload: combinedPayload, 
      time: timeStr 
    };

  } catch(e) { return { success: false, msg: "系統錯誤: " + e.toString() }; }
}

function apiChangePassword(seatNo, oldPwd, newPwd) {
  try {
    const DB_URL = PropertiesService.getScriptProperties().getProperty("DB_URL");
    const ss = SpreadsheetApp.openByUrl(DB_URL);
    const authSheet = ss.getSheetByName("DB_Auth");
    const data = authSheet.getDataRange().getDisplayValues();
    const targetSeat = String(seatNo).trim();
    
    const oldHash = hashPassword_(oldPwd);
    const newHash = hashPassword_(newPwd);

    for(let i=1; i<data.length; i++) {
      if(String(data[i][0]).trim() === targetSeat) {
        const sHash = String(data[i][1]).trim();
        const pHash = String(data[i][2]).trim();
        
        if (oldHash === pHash) { authSheet.getRange(i+1, 3).setValue(newHash); return { success: true, msg: "家長密碼已更新" }; } 
        else if (oldHash === sHash) { authSheet.getRange(i+1, 2).setValue(newHash); return { success: true, msg: "學生密碼已更新" }; } 
        else { return { success: false, msg: "舊密碼錯誤" }; }
      }
    }
    return { success: false, msg: "帳號不存在" };
  } catch(e) { return { success: false, msg: e.message }; }
}

function apiSaveSettings(url, salt, isInit) {
  try {
    PropertiesService.getScriptProperties().setProperty("DB_URL", url);
    if(salt) PropertiesService.getScriptProperties().setProperty("SYSTEM_SALT", salt);
    return { success: true };
  } catch(e) { return { success: false, msg: e.toString() }; }
}

function getProperty_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || "";
}

// --- 資安核心 (與管理端 Security.gs 對應) ---

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
 * [更新版] 解密核心
 * 支援解析 "IV|Ciphertext" 格式
 */
function cipherData_(text, isEncrypt, systemSalt, fileId) {
  if (!text) return "";
  
  // 基礎秘密：檔案ID + 系統Salt
  const baseSecret = fileId + (systemSalt || "");

  // 查詢端通常只負責解密 (isEncrypt = false)
  if (isEncrypt) {
      // (保留結構以免未來擴充需要)
      const rowIv = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
      const rowKey = hashPassword_(baseSecret + rowIv);
      const encryptedBody = xorProcess_(text, rowKey, true);
      return rowIv + "|" + encryptedBody;
  } else {
    try {
      // 1. 切割 IV 與 密文
      const parts = text.split("|");
      // 如果格式不對 (舊資料或壞檔)，回傳空
      if (parts.length !== 2) return ""; 
      
      const rowIv = parts[0];
      const encryptedBody = parts[1];
      
      // 2. 還原這行專用的 Key
      const rowKey = hashPassword_(baseSecret + rowIv);
      
      // 3. 解密
      return xorProcess_(encryptedBody, rowKey, false);
      
    } catch (e) { return ""; }
  }
}

/**
 * XOR 運算邏輯
 */
function xorProcess_(text, key, isEncrypt) {
    const keyLen = key.length;
    
    if (isEncrypt) {
        const textBytes = Utilities.newBlob(text).getBytes();
        const resultBytes = [];
        for (let i = 0; i < textBytes.length; i++) {
            resultBytes.push(textBytes[i] ^ key.charCodeAt(i % keyLen));
        }
        return Utilities.base64Encode(resultBytes);
    } else {
        const textBytes = Utilities.base64Decode(text);
        const resultBytes = [];
        for (let i = 0; i < textBytes.length; i++) {
            resultBytes.push(textBytes[i] ^ key.charCodeAt(i % keyLen));
        }
        return Utilities.newBlob(resultBytes).getDataAsString();
    }
}