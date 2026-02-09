/**
 * 資料庫模組
 * 負責成績彙整、同步與封存
 */

function apiGetDbUrl() {
  return getProperty_("DB_URL");
}

function apiSyncToDatabase(dbUrl) {
  try {
    if (dbUrl) setSystemProperty("DB_URL", dbUrl, "家長資料庫連結");
    else dbUrl = getProperty_("DB_URL");

    if (!dbUrl) return { success: false, msg: "尚未設定資料庫連結" };

    const result = apiFetchHomeroomMasterData_();
    if (!result.success) throw new Error("無法讀取成績資料");

    // [去重邏輯] 確保同一位學生、同一門課、同一個作業只有一筆資料
    // Key: 科目_分頁_作業_座號
    const uniqueMap = new Map();
    result.data.forEach(item => {
      const key = `${item.subject}_${item.sheet}_${item.task}_${item.seatNo}`;
      uniqueMap.set(key, item);
    });
    const masterData = Array.from(uniqueMap.values());

    const ss = SpreadsheetApp.openByUrl(dbUrl);
    const SYSTEM_SALT = getProperty_("SYSTEM_SALT");
    const FILE_ID = ss.getId();

    updateAuthDatabase_(ss, masterData);

    let sourceSheet = ss.getSheetByName("DB_Source");
    if (!sourceSheet) sourceSheet = ss.insertSheet("DB_Source");

    // ★★★ 關鍵：清空舊資料 ★★★
    sourceSheet.clear();
    SpreadsheetApp.flush();

    let sourceRows = [];
    sourceRows.push(["座號", "加密數據 (Payload)", "更新時間"]);

    const nowStr = Utilities.formatDate(new Date(), "GMT+8", "yyyy/MM/dd HH:mm");

    masterData.forEach(item => {
      let sensitivePayload = {
        sb: item.subject,
        tk: item.task,
        nm: item.name,
        sc: item.score,
        rk: item.rank,
        st: item.stats,
        dt: item.date,
        sh: item.sheet,
        uid: item.uid
      };

      const jsonStr = JSON.stringify(sensitivePayload);
      const encryptedPayload = cipherData_(jsonStr, true);

      sourceRows.push([
        String(item.seatNo),
        encryptedPayload,
        nowStr
      ]);
    });

    if (sourceRows.length > 0) {
      sourceSheet.getRange(1, 1, sourceRows.length, 3).setValues(sourceRows);
    }

    // 格式美化
    sourceSheet.getRange("A1:C1").setBackground("#e2e8f0").setFontWeight("bold");
    sourceSheet.setFrozenRows(1);

    writeLog(dbUrl, `同步成功：覆蓋更新 ${masterData.length} 筆資料`);

    return { success: true, count: masterData.length };

  } catch (e) { return { success: false, msg: e.toString() }; }
}

function updateAuthDatabase_(ss, masterData) {
  let authSheet = ss.getSheetByName("DB_Auth");

  // 自動備份機制 (保持不變)
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
    // ★★★ 修改：標題列移除「姓名」 ★★★
    authSheet.getRange(1, 1, 1, 3).setValues([["座號 (Key)", "學生密碼(Hash)", "家長密碼(Hash)"]]);
    authSheet.setFrozenRows(1);
  }

  // 取得既有的密碼對應表 (現在改用 座號 當 Key)
  const oldCredentials = getExistingAuthMap_(ss);

  // 整理目前的學生名單 (masterData 已經去重過)
  // 我們只需要座號，因為這裡不存姓名了
  const currentSeats = new Set();
  masterData.forEach(d => {
    const seat = String(d.seatNo).trim();
    if (seat) currentSeats.add(seat);
  });

  let newRows = [];
  // 轉成陣列並排序
  const sortedSeats = Array.from(currentSeats).sort((a, b) => Number(a) - Number(b));

  sortedSeats.forEach(seat => {
    let sHash, pHash;

    // 如果舊表有這個座號，就沿用舊密碼
    if (oldCredentials.has(seat)) {
      const creds = oldCredentials.get(seat);
      sHash = creds.s;
      pHash = creds.p;
    } else {
      // 新座號，產生預設密碼
      const padSeat = seat.length < 2 ? "0" + seat : seat;
      sHash = hashPassword_("student" + padSeat);
      pHash = hashPassword_("parent" + padSeat);
    }

    newRows.push([seat, sHash, pHash]);
  });

  const lastRow = authSheet.getLastRow();
  // 清空舊資料 (避免欄位殘留)
  if (lastRow > 1) authSheet.getRange(2, 1, lastRow - 1, authSheet.getLastColumn()).clearContent();

  // 寫入新資料 (只有 3 欄)
  if (newRows.length > 0) authSheet.getRange(2, 1, newRows.length, 3).setValues(newRows);
}

function getExistingAuthMap_(ss) {
  const map = new Map();
  const authSheet = ss.getSheetByName("DB_Auth");
  if (!authSheet || authSheet.getLastRow() <= 1) return map;

  const authData = authSheet.getDataRange().getValues();

  // 從第 2 行開始讀 (跳過標題)
  for (let i = 1; i < authData.length; i++) {
    const row = authData[i];
    const seat = String(row[0]).trim(); // 第 1 欄是座號
    const sHash = row[1];               // 第 2 欄是學生密碼
    const pHash = row[2];               // 第 3 欄是家長密碼

    // 直接用座號記住密碼
    if (seat) map.set(seat, { s: sHash, p: pHash });
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
    } catch (e) { sheets = ["無法讀取: " + e.message]; }
    return { name: config.name, url: config.url, allSheets: sheets, selected: config.syncTargets || sheets };
  });
  return result;
}

function apiSaveHomeroomSyncSettings(selectionMap) {
  let list = getListByMode('homeroom');
  list = list.map(config => {
    if (selectionMap[config.name]) {
      config.syncTargets = selectionMap[config.name];
    }
    return config;
  });

  // v12 Refactor: Use Config API to save back to Sheet
  // (Requires Config.js to have apiUpdateHomeroomList)
  if (typeof apiUpdateHomeroomList === 'function') {
    return apiUpdateHomeroomList(list);
  } else {
    // Fallback if config isn't updated? Should not happen in this view.
    return { success: false, msg: "Config update function missing" };
  }
}

/**
 * 公開 API：取得全班成績總表 (給導師儀表板使用)
 */
function apiFetchHomeroomMasterData() {
  return apiFetchHomeroomMasterData_();
}

function apiGetHomeroomList() {
  return getListByMode('homeroom');
}

function apiFetchSingleHomeroomData(config) {
  return fetchLocalHomeroomData_(config);
}

function apiFetchHomeroomMasterData_() {
  const homeroomList = getListByMode('homeroom');
  let masterList = [];
  let log = [];

  homeroomList.forEach(config => {
    const res = fetchLocalHomeroomData_(config);
    if (res.data) masterList = masterList.concat(res.data);
    if (res.log) log = log.concat(res.log);
  });

  // 最後依照座號排序整份名單
  masterList.sort((a, b) => {
    const seatA = parseInt(a.seatNo); const seatB = parseInt(b.seatNo);
    if (!isNaN(seatA) && !isNaN(seatB)) return (seatA - seatB) || a.subject.localeCompare(b.subject);
    return a.seatNo.localeCompare(b.seatNo) || a.subject.localeCompare(b.subject);
  });

  return { success: true, data: masterList, log: log };
}

function fetchLocalHomeroomData_(config) {
  let masterList = [];
  let log = [];
  try {
    const ss = SpreadsheetApp.openByUrl(config.url);
    const allSheets = ss.getSheets();
    const targetSet = (config.syncTargets && config.syncTargets.length > 0) ? new Set(config.syncTargets) : null;

    allSheets.forEach(sheet => {
      const sheetName = sheet.getName();
      // 排除非成績分頁
      if (sheetName === "設定" || sheetName === "Setting" || sheetName.includes("名單")) return;
      if (targetSet && !targetSet.has(sheetName)) return;

      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      if (lastRow < 3 || lastCol < 3) return;

      // 一次讀取整張表以提升效能
      const allValues = sheet.getRange(1, 1, lastRow, lastCol).getValues();

      // --- 1. 動態定位錨點 ---
      // 尋找含有「座號」的標題列
      let headerRowIdx = -1;
      let colIdxSeat = -1;
      let colIdxName = -1;

      for (let r = 0; r < Math.min(10, allValues.length); r++) {
        const rowStr = allValues[r].join("");
        if (rowStr.includes("座號")) {
          headerRowIdx = r;
          // 掃描該列，找出座號與姓名在哪一欄
          for (let c = 0; c < allValues[r].length; c++) {
            const cell = String(allValues[r][c]).trim();
            if (cell === "座號") colIdxSeat = c;
            else if (cell === "姓名") colIdxName = c;
          }
          break;
        }
      }

      // 如果找不到座號欄，視為無效分頁
      if (headerRowIdx === -1 || colIdxSeat === -1) {
        // log.push(`[${config.name}-${sheetName}] 格式不符 (找不到座號欄)，略過`);
        return;
      }

      const taskNameRow = allValues[headerRowIdx];
      const dateRow = headerRowIdx > 0 ? allValues[headerRowIdx - 1] : null;

      // --- 2. 遍歷作業欄位 ---
      for (let c = 0; c < lastCol; c++) {
        // 跳過座號、姓名與空白欄
        if (c === colIdxSeat || c === colIdxName) continue;

        const taskName = String(taskNameRow[c]).trim();
        if (!taskName) continue;

        // 排除非作業欄位
        if (["Email", "備註", "總分", "平均", "排名", "等第"].includes(taskName)) continue;

        const colUid = Utilities.base64Encode(`${sheetName}_${taskName}`).replace(/=/g, '');
        let currentColumnData = [];

        // --- 3. 讀取該欄成績 ---
        for (let r = headerRowIdx + 1; r < allValues.length; r++) {
          const row = allValues[r];
          let rawSeat = String(row[colIdxSeat]).trim();
          if (!rawSeat) continue;
          const seatNo = rawSeat.length < 2 ? "0" + rawSeat : rawSeat;

          if (seatNo) {
            let studentName = (colIdxName !== -1) ? row[colIdxName] : "";
            const rawScore = row[c];
            const cleanScore = String(rawScore).trim();

            if (cleanScore !== "") {
              const parsed = parseScoreValue(cleanScore);

              // 日期防呆
              let dateStr = "";
              if (dateRow && dateRow[c]) {
                try {
                  const rawDate = dateRow[c];
                  dateStr = (rawDate instanceof Date) ? Utilities.formatDate(rawDate, "GMT+8", "MM/dd") : String(rawDate).trim();
                } catch (e) { dateStr = ""; }
              }

              currentColumnData.push({
                seatNo: seatNo,
                name: studentName,
                subject: config.name,
                sheet: sheetName,
                task: taskName,
                date: dateStr,
                score: parsed.display,
                calcScore: parsed.calc,
                uid: colUid
              });
            }
          }
        }

        if (currentColumnData.length === 0) continue;

        // --- 4. 計算排名與統計 ---
        // 排序分數高到低 (用於排名)
        currentColumnData.sort((a, b) => {
          const valA = (a.calcScore === null) ? -99999 : Number(a.calcScore);
          const valB = (b.calcScore === null) ? -99999 : Number(b.calcScore);
          return valB - valA;
        });

        const validScores = currentColumnData.map(i => i.calcScore).filter(s => s !== null && !isNaN(Number(s)));
        validScores.sort((a, b) => b - a);
        const stats = calculateStats(validScores);

        // 賦予排名
        let currentRank = 1;
        for (let i = 0; i < currentColumnData.length; i++) {
          const item = currentColumnData[i];
          const score = (item.calcScore === null) ? -99999 : Number(item.calcScore);

          if (score === -99999) item.rank = "-";
          else {
            if (i > 0) {
              const prevScore = (currentColumnData[i - 1].calcScore === null) ? -99999 : Number(currentColumnData[i - 1].calcScore);
              if (score < prevScore) currentRank = i + 1;
            } else currentRank = 1;
            item.rank = currentRank;
          }
          item.stats = stats;
        }
        masterList = masterList.concat(currentColumnData);
      }
    });
  } catch (e) { log.push(`讀取失敗 [${config.name}]: ${e.message}`); }

  return { success: true, data: masterList, log: log };
}

function calculateStats(scores) {
  const n = scores.length;
  if (n === 0) return {
    count: 0, avg: "-", max: "-", min: "-",
    five: { top: "-", front: "-", avg: "-", back: "-", bottom: "-" },
    dist: { '100': 0, '90-99': 0, '80-89': 0, '70-79': 0, '60-69': 0, 'below60': 0 }
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

  let dist = { '100': 0, '90-99': 0, '80-89': 0, '70-79': 0, '60-69': 0, 'below60': 0 };
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
    if (!dbUrl) return sanitizeForFrontend({ success: false, msg: "未設定資料庫連結" });

    const ss = SpreadsheetApp.openByUrl(dbUrl);
    const currentSheet = ss.getSheetByName("DB_Source");

    if (!currentSheet || currentSheet.getLastRow() <= 1) {
      return sanitizeForFrontend({ success: false, msg: "目前資料庫是空的，無需封存。" });
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

    return sanitizeForFrontend({ success: true, archiveName: archiveName });

  } catch (e) {
    return sanitizeForFrontend({ success: false, msg: e.toString() });
  }
}

function apiResetAuthDatabase() {
  try {
    const dbUrl = getProperty_("DB_URL");
    if (!dbUrl) return sanitizeForFrontend({ success: false, msg: "未設定資料庫" });

    const ss = SpreadsheetApp.openByUrl(dbUrl);
    const authSheet = ss.getSheetByName("DB_Auth");
    if (!authSheet) return sanitizeForFrontend({ success: false, msg: "找不到權限表" });

    if (authSheet.getLastRow() > 1) {
      authSheet.getRange(2, 1, authSheet.getLastRow() - 1, authSheet.getLastColumn()).clearContent();
    }

    return sanitizeForFrontend({ success: true });
  } catch (e) { return sanitizeForFrontend({ success: false, msg: e.toString() }); }
}

/**
 * [新增] 分數解析工具
 * 處理：文字轉數字、標記缺交、免修等邏輯
 */
function parseScoreValue(raw) {
  const str = String(raw).trim();
  if (str === "") return { display: "", calc: null };

  // 處理特殊文字
  if (str === "缺" || str === "缺交") return { display: "缺", calc: 0 }; // 病假不計入平均
  if (str === "事" || str === "事假") return { display: "事", calc: 0 }; // 事假未補交或補考視同缺交
  if (str === "免" || str === "免修") return { display: "免", calc: null }; // 不計入平均
  if (str === "假" || str === "病" || str === "公" || str === "喪" || str === "婚" || str === "產" || str === "陪產" || str === "婚假" || str === "喪假" || str === "產假" || str === "陪產假") return { display: "假", calc: null };

  // 嘗試轉數字
  const num = Number(str);
  if (!isNaN(num)) {
    return { display: num, calc: num };
  }

  // 無法識別的文字 (如等級制 A, B, C)
  return { display: str, calc: null };
}