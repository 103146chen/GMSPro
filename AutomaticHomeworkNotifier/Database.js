/**
 * 資料庫模組
 * 負責成績彙整、同步與封存
 */

function apiGetDbUrl() {
  return getProperty_("DB_URL");
}

function apiSyncToDatabase(dbUrl) {
  try {
    if (dbUrl) PropertiesService.getScriptProperties().setProperty("DB_URL", dbUrl);
    else dbUrl = getProperty_("DB_URL");

    if (!dbUrl) return { success: false, msg: "尚未設定資料庫連結" };

    const result = apiFetchHomeroomMasterData();
    if (!result.success) throw new Error("無法讀取成績資料");
    const masterData = result.data;
    
    const ss = SpreadsheetApp.openByUrl(dbUrl);
    
    // [修正 1] 改用 SYSTEM_SALT 與 FILE_ID (不再使用 DYNAMIC_KEY)
    const SYSTEM_SALT = getProperty_("SYSTEM_SALT");
    const FILE_ID = ss.getId();

    updateAuthDatabase_(ss, masterData);

    let sourceSheet = ss.getSheetByName("DB_Source");
    if (!sourceSheet) sourceSheet = ss.insertSheet("DB_Source");

    let sourceRows = [];
    sourceRows.push(["座號", "姓名", "科目", "作業名稱", "加密數據 (Score/Rank/Stats)", "更新時間"]);
    
    const nowStr = Utilities.formatDate(new Date(), "GMT+8", "yyyy/MM/dd HH:mm");
    
    masterData.forEach(item => {
        let sensitivePayload = {
            sc: item.score,
            rk: item.rank,
            st: item.stats,
            dt: item.date,
            sh: item.sheet,
            uid: item.uid 
        };

        const jsonStr = JSON.stringify(sensitivePayload);
        
        // [修正 2] 移除 randomPadding (因為新的 cipherData_ 已經內建 IV 了)
        // [修正 3] 呼叫新版加密：傳入 (內容, true, Salt, FileID)
        const encryptedPayload = cipherData_(jsonStr, true, SYSTEM_SALT, FILE_ID);

        sourceRows.push([
            String(item.seatNo), 
            item.name, 
            item.subject, 
            item.task, 
            encryptedPayload, 
            nowStr
        ]);
    });

    sourceSheet.clearContents(); 
    if (sourceRows.length > 0) {
        sourceSheet.getRange(1, 1, sourceRows.length, sourceRows[0].length).setValues(sourceRows);
    }
    sourceSheet.getRange("A1:F1").setBackground("#e2e8f0").setFontWeight("bold");
    sourceSheet.setFrozenRows(1);

    writeLog(dbUrl, `同步成功：更新 ${masterData.length} 筆成績紀錄`);

    return { success: true, count: masterData.length };

  } catch (e) { return { success: false, msg: e.toString() }; }
}

function updateAuthDatabase_(ss, masterData) {
  let authSheet = ss.getSheetByName("DB_Auth");
  
  // 自動備份機制
  if (authSheet && authSheet.getLastRow() > 1) {
      let backupSheet = ss.getSheetByName("Backup_Auth");
      if (!backupSheet) {
          backupSheet = ss.insertSheet("Backup_Auth");
          backupSheet.hideSheet();
      }
      backupSheet.clear();
      const range = authSheet.getDataRange();
      range.copyTo(backupSheet.getRange(1, 1));
  }

  if (!authSheet) {
      authSheet = ss.insertSheet("DB_Auth");
      authSheet.getRange(1, 1, 1, 4).setValues([["座號 (Key)", "學生密碼(Hash)", "家長密碼(Hash)", "姓名 (Ref)"]]);
      authSheet.setFrozenRows(1);
  }

  const oldCredentials = getExistingAuthMap_(ss);
  const currentStudents = new Map();
  masterData.forEach(d => {
      const seat = String(d.seatNo).trim();
      const name = String(d.name).trim();
      if(seat && name) currentStudents.set(seat, name);
  });

  let newRows = [];
  const sortedSeats = Array.from(currentStudents.keys()).sort((a,b) => Number(a) - Number(b));

  sortedSeats.forEach(seat => {
      const name = currentStudents.get(seat);
      let sHash, pHash;

      if (oldCredentials.has(name)) {
          const creds = oldCredentials.get(name);
          sHash = creds.s;
          pHash = creds.p;
      } else {
          const padSeat = seat.length < 2 ? "0" + seat : seat;
          sHash = hashPassword_("student" + padSeat);
          pHash = hashPassword_("parent" + padSeat);
      }
      newRows.push([seat, sHash, pHash, name]);
  });

  const lastRow = authSheet.getLastRow();
  if (lastRow > 1) authSheet.getRange(2, 1, lastRow - 1, 4).clearContent();
  if (newRows.length > 0) authSheet.getRange(2, 1, newRows.length, 4).setValues(newRows);
}

function getExistingAuthMap_(ss) {
  const map = new Map();
  const authSheet = ss.getSheetByName("DB_Auth");
  if (!authSheet || authSheet.getLastRow() <= 1) return map;

  const authData = authSheet.getDataRange().getValues();
  
  const sourceSheet = ss.getSheetByName("DB_Source");
  const seatToName = {};
  if (sourceSheet && sourceSheet.getLastRow() > 1) {
      const sourceData = sourceSheet.getDataRange().getValues();
      for (let i = 1; i < sourceData.length; i++) {
          const s = String(sourceData[i][0]).trim();
          const n = String(sourceData[i][1]).trim();
          if (s && n) seatToName[s] = n;
      }
  }

  for (let i = 1; i < authData.length; i++) {
      const row = authData[i];
      const seat = String(row[0]).trim();
      const sHash = row[1];
      const pHash = row[2];
      let name = (row.length > 3) ? String(row[3]).trim() : "";

      if (!name && seatToName[seat]) name = seatToName[seat];
      if (name) map.set(name, { s: sHash, p: pHash });
  }
  return map;
}

function apiGetHomeroomSyncData() {
  const homeroomList = getListByMode('homeroom'); 
  const result = homeroomList.map(config => {
    let sheets = [];
    try {
       sheets = getSheetList(config.url);
       sheets = sheets.filter(s => s !== "設定" && s !== "Setting" && !s.includes("名單"));
    } catch(e) { sheets = ["無法讀取: " + e.message]; }
    return { name: config.name, url: config.url, allSheets: sheets, selected: config.syncTargets || sheets };
  });
  return result;
}

function apiSaveHomeroomSyncSettings(selectionMap) {
  let list = getListByMode('homeroom');
  list = list.map(config => { if (selectionMap[config.name]) { config.syncTargets = selectionMap[config.name]; } return config; });
  PropertiesService.getScriptProperties().setProperty("HOMEROOM_CONFIG_LIST", JSON.stringify(list));
  return { success: true };
}

function apiFetchHomeroomMasterData() {
  const homeroomList = getListByMode('homeroom');
  let masterList = [];
  let log = [];

  homeroomList.forEach(config => {
    try {
      const ss = SpreadsheetApp.openByUrl(config.url);
      const studentMap = getStudentMap(ss); 
      const allSheets = ss.getSheets();
      const targetSet = (config.syncTargets && config.syncTargets.length > 0) ? new Set(config.syncTargets) : null;

      allSheets.forEach(sheet => {
        const sheetName = sheet.getName();
        if (sheetName === "設定" || sheetName === "Setting" || sheetName.includes("名單")) return;
        if (targetSet && !targetSet.has(sheetName)) return;

        const lastRow = sheet.getLastRow();
        const lastCol = sheet.getLastColumn();
        if (lastRow < 3 || lastCol < 3) return; 

        const allValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();
        
        let headerRowIdx = 1; 
        for(let r=0; r<Math.min(5, allValues.length); r++) { 
            if(allValues[r].join("").includes("座號")) { headerRowIdx = r; break; } 
        }
        
        const taskNameRow = allValues[headerRowIdx]; 
        const dateRow = headerRowIdx > 0 ? allValues[headerRowIdx - 1] : null;
        
        for (let c = 2; c < lastCol; c++) {
            const taskName = taskNameRow[c];
            if (!taskName || String(taskName).trim() === "") continue;

            const colUid = Utilities.base64Encode(`${sheetName}_${c}`).replace(/=/g, '');
            let currentColumnData = [];

            for(let r = headerRowIdx + 1; r < allValues.length; r++) {
                const row = allValues[r];
                const seatNo = String(row[0]).trim(); 
                
                if (seatNo) {
                    let studentName = (studentMap[seatNo]) ? studentMap[seatNo].name : (row[1] || "");
                    const rawScore = row[c];
                    const cleanScore = String(rawScore).trim();

                    if (cleanScore !== "") {
                        const parsed = parseScoreValue(cleanScore);
                        let dateStr = "";
                        if (dateRow && dateRow[c]) {
                            const rawDate = dateRow[c];
                            dateStr = (rawDate instanceof Date) ? Utilities.formatDate(rawDate, "GMT+8", "MM/dd") : String(rawDate).trim();
                        }

                        currentColumnData.push({
                            seatNo: seatNo,
                            name: studentName,
                            subject: config.name,
                            sheet: sheetName,
                            task: String(taskName),
                            date: dateStr,
                            score: parsed.display,
                            calcScore: parsed.calc,
                            uid: colUid
                        });
                    }
                }
            }

            if (currentColumnData.length === 0) continue;

            currentColumnData.sort((a, b) => {
                const valA = (a.calcScore === null) ? -99999 : Number(a.calcScore);
                const valB = (b.calcScore === null) ? -99999 : Number(b.calcScore);
                return valB - valA;
            });

            const validScores = currentColumnData
                .map(i => i.calcScore)
                .filter(s => s !== null && !isNaN(Number(s)));
            validScores.sort((a,b) => b - a);
            const stats = calculateStats(validScores);

            let currentRank = 1;
            for (let i = 0; i < currentColumnData.length; i++) {
                const item = currentColumnData[i];
                const score = (item.calcScore === null) ? -99999 : Number(item.calcScore);

                if (score === -99999) {
                    item.rank = "-";
                } else {
                    if (i > 0) {
                        const prevScore = (currentColumnData[i-1].calcScore === null) ? -99999 : Number(currentColumnData[i-1].calcScore);
                        if (score < prevScore) currentRank = i + 1;
                    } else {
                        currentRank = 1; 
                    }
                    item.rank = currentRank;
                }
                item.stats = stats;
            }
            masterList = masterList.concat(currentColumnData);
        }
      });
    } catch (e) { log.push(`讀取失敗 [${config.name}]: ${e.message}`); }
  });

  masterList.sort((a, b) => { 
      const seatA = parseInt(a.seatNo); const seatB = parseInt(b.seatNo); 
      if (!isNaN(seatA) && !isNaN(seatB)) return (seatA - seatB) || a.subject.localeCompare(b.subject); 
      return a.seatNo.localeCompare(b.seatNo) || a.subject.localeCompare(b.subject); 
  });
  
  return { success: true, data: masterList, log: log };
}

function calculateStats(scores) {
  const n = scores.length; 
  if (n === 0) return { 
      count: 0, avg: "-", max: "-", min: "-", 
      five: { top: "-", front: "-", avg: "-", back: "-", bottom: "-" }, 
      dist: { '100':0, '90-99':0, '80-89':0, '70-79':0, '60-69':0, 'below60':0 } 
  };

  const sum = scores.reduce((a, b) => a + b, 0); 
  const avg = (sum / n).toFixed(1);
  const max = scores[0]; 
  const min = scores[n - 1];
  
  const p88 = scores[Math.floor(n * 0.12)] || max; 
  const p75 = scores[Math.floor(n * 0.25)] || max;
  const p50 = scores[Math.floor(n * 0.50)] || max; 
  const p25 = scores[Math.floor(n * 0.75)] || min;
  const p12 = scores[Math.floor(n * 0.88)] || min;
  
  let dist = { '100':0, '90-99':0, '80-89':0, '70-79':0, '60-69':0, 'below60':0 };
  scores.forEach(s => {
    if (s === 100) dist['100']++; 
    else if (s >= 90) dist['90-99']++; 
    else if (s >= 80) dist['80-89']++; 
    else if (s >= 70) dist['70-79']++; 
    else if (s >= 60) dist['60-69']++; 
    else dist['below60']++;
  });
  
  return { count: n, avg: avg, max: max, min: min, five: { top: p88, front: p75, avg: p50, back: p25, bottom: p12 }, dist: dist };
}

function writeLog(dbUrl, message) {
  try {
    const ss = SpreadsheetApp.openByUrl(dbUrl);
    let logSheet = ss.getSheetByName("DB_Log");
    if (!logSheet) {
      logSheet = ss.insertSheet("DB_Log");
      logSheet.getRange(1, 1, 1, 3).setValues([["時間", "執行項目", "詳細資訊"]]);
      logSheet.setFrozenRows(1);
    }
    logSheet.appendRow([new Date(), "系統同步", message]);
  } catch (e) {
    console.error("無法寫入日誌: " + e.toString());
  }
}

function apiArchiveDatabase() {
  try {
    const dbUrl = getProperty_("DB_URL");
    if (!dbUrl) return { success: false, msg: "未設定資料庫連結" };

    const ss = SpreadsheetApp.openByUrl(dbUrl);
    const currentSheet = ss.getSheetByName("DB_Source");
    
    if (!currentSheet || currentSheet.getLastRow() <= 1) {
        return { success: false, msg: "目前資料庫是空的，無需封存。" };
    }

    const dateStr = Utilities.formatDate(new Date(), "GMT+8", "yyyyMMdd");
    let archiveName = `History_${dateStr}`;
    
    let counter = 1;
    while (ss.getSheetByName(archiveName)) {
        archiveName = `History_${dateStr}_${counter}`;
        counter++;
    }

    currentSheet.setName(archiveName);

    const newSheet = ss.insertSheet("DB_Source");
    newSheet.getRange(1, 1, 1, 6).setValues([["座號", "姓名", "科目", "作業名稱", "加密數據 (Score/Rank/Stats)", "更新時間"]]);
    newSheet.getRange("A1:F1").setBackground("#e2e8f0").setFontWeight("bold");
    newSheet.setFrozenRows(1);
    
    return { success: true, archiveName: archiveName };

  } catch (e) {
    return { success: false, msg: e.toString() };
  }
}

function apiResetAuthDatabase() {
  try {
    const dbUrl = getProperty_("DB_URL");
    if (!dbUrl) return { success: false, msg: "未設定資料庫" };

    const ss = SpreadsheetApp.openByUrl(dbUrl);
    const authSheet = ss.getSheetByName("DB_Auth");
    if (!authSheet) return { success: false, msg: "找不到權限表" };

    if (authSheet.getLastRow() > 1) {
        authSheet.getRange(2, 1, authSheet.getLastRow() - 1, authSheet.getLastColumn()).clearContent();
    }
    
    return { success: true };
  } catch (e) { return { success: false, msg: e.toString() }; }
}