/**
 * 工具模組
 * 包含 Sheet 讀取、Email 發送與排程工具
 */

function getSheetList(url) {
  try {
    const ss = SpreadsheetApp.openByUrl(url);
    return ss.getSheets().map(s => s.getName());
  } catch (e) { throw new Error("無法讀取試算表: " + e.message); }
}

function getStudentMap(ss) {
  let configSheet = ss.getSheetByName("設定");
  if (!configSheet) configSheet = ss.getSheets()[0];

  let map = {};
  if (configSheet) {
    const data = configSheet.getDataRange().getValues();
    let headerRow = 0;
    for (let i = 0; i < Math.min(5, data.length); i++) {
      if (data[i].join("").includes("座號")) { headerRow = i; break; }
    }
    for (let i = headerRow + 1; i < data.length; i++) {
      const seat = String(data[i][0]);
      if (seat) map[seat] = { name: data[i][1], email: data[i][2] };
    }
  }
  return map;
}

function scanMissingAssignments(url, sheetName, validDays) {
  try {
    const ss = SpreadsheetApp.openByUrl(url);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return { success: false, msg: `找不到分頁 [${sheetName}]` };

    const lastCol = sheet.getLastColumn();
    const lastRow = sheet.getLastRow();
    if (lastRow < 3) return { success: false, msg: "資料不足" };

    const dateRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    const taskRow = sheet.getRange(2, 1, 1, lastCol).getValues()[0];
    const dataRange = sheet.getRange(3, 1, lastRow - 2, lastCol);
    const data = dataRange.getValues();

    const studentMap = getStudentMap(ss);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let resultList = [];

    data.forEach((row, rIndex) => {
      const seatNo = String(row[0]);
      const student = studentMap[seatNo];
      if (!student || !student.email) return;

      let warningItems = [];
      let expiredItems = [];
      let currentRow = rIndex + 3;

      for (let j = 2; j < row.length; j++) {
        const score = row[j];
        const taskName = taskRow[j];
        const taskDateObj = dateRow[j];
        const currentCol = j + 1;

        if (score === "" && taskName !== "") {
          if (taskDateObj instanceof Date) {
            let startDate = new Date(taskDateObj);
            startDate.setHours(0, 0, 0, 0);
            if (today < startDate) continue;

            let deadline = new Date(taskDateObj);
            deadline.setDate(deadline.getDate() + parseInt(validDays));
            deadline.setHours(0, 0, 0, 0);
            let dateStr = Utilities.formatDate(taskDateObj, "GMT+8", "MM/dd");
            let cleanTask = taskName.toString();

            if (today <= deadline) {
              let leftDays = Math.ceil((deadline - today) / (86400000));
              warningItems.push({ date: dateStr, task: cleanTask, status: `剩 ${leftDays} 天` });
            } else {
              let overDays = Math.ceil((today - deadline) / (86400000));
              expiredItems.push({ date: dateStr, task: cleanTask, status: `過期 ${overDays} 天`, row: currentRow, col: currentCol });
            }
          } else {
            warningItems.push({ date: "-", task: taskName.toString(), status: "請確認" });
          }
        }
      }
      if (warningItems.length > 0 || expiredItems.length > 0) {
        resultList.push({ seatNo: seatNo, name: student.name, email: student.email, warnings: warningItems, expired: expiredItems, sheetName: sheetName });
      }
    });
    return { success: true, data: resultList };
  } catch (e) { return { success: false, msg: e.toString() }; }
}

function apiScanAllClassTargets(url, targets, validDays) {
  let aggregatedMap = {};
  targets.forEach(sheetName => {
    const res = scanMissingAssignments(url, sheetName, validDays);
    if (res.success && res.data.length > 0) {
      res.data.forEach(s => {
        if (!aggregatedMap[s.seatNo]) aggregatedMap[s.seatNo] = { seatNo: s.seatNo, name: s.name, email: s.email, warnings: [], expired: [] };
        aggregatedMap[s.seatNo].warnings.push(...s.warnings);
        aggregatedMap[s.seatNo].expired.push(...s.expired);
      });
    }
  });
  return { success: true, data: Object.values(aggregatedMap) };
}

function getSheetHeaders(url, sheetName) {
  try {
    const ss = SpreadsheetApp.openByUrl(url);
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) throw new Error("找不到分頁");
    const checkRange = sheet.getRange(1, 1, 5, sheet.getLastColumn()).getValues();
    let headers = []; let headerRowIndex = 0;
    for (let i = 0; i < checkRange.length; i++) { if (checkRange[i].includes("座號")) { headers = checkRange[i]; headerRowIndex = i + 1; break; } }
    if (headerRowIndex === 0) throw new Error("找不到含有「座號」的標題列");
    return { success: true, headers: headers, headerRowIndex: headerRowIndex };
  } catch (e) { return { success: false, msg: e.message }; }
}

function fetchSheetDataForEmail(url, sheetName, headerRowIndex) {
  try {
    const ss = SpreadsheetApp.openByUrl(url);
    const sheet = ss.getSheetByName(sheetName);
    const lastRow = sheet.getLastRow();
    if (lastRow <= headerRowIndex) return { success: true, data: [] };
    const headers = sheet.getRange(headerRowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
    const dataRange = sheet.getRange(headerRowIndex + 1, 1, lastRow - headerRowIndex, sheet.getLastColumn()).getValues();
    const emailMap = getStudentMap(ss);
    const result = dataRange.map(row => {
      let obj = {}; let seatNo = "";
      headers.forEach((h, i) => { if (h) { obj[h] = row[i]; if (h === "座號") seatNo = String(row[i]); } });
      if (!seatNo) return null;
      let email = "";
      if (emailMap[seatNo] && emailMap[seatNo].email) { email = emailMap[seatNo].email; obj['姓名'] = emailMap[seatNo].name; }
      else { email = obj['Email'] || obj['電子郵件'] || ""; }
      obj['_email'] = email; obj['_seatNo'] = seatNo; obj['_name'] = obj['姓名'] || "";
      return obj;
    }).filter(item => item !== null);
    return { success: true, data: result };
  } catch (e) { return { success: false, msg: e.toString() }; }
}

function sendEmailDirect(to, subject, htmlBody, cc) {
  try {
    if (!to || !to.includes("@")) return { success: false, msg: "Email 無效" };
    let options = { htmlBody: htmlBody };
    if (cc && cc.includes("@")) { options.cc = cc; }
    MailApp.sendEmail(to, subject, "", options);
    return { success: true };
  } catch (e) { return { success: false, msg: e.toString() }; }
}

function parseScoreValue(rawVal) {
  if (!isNaN(parseFloat(rawVal)) && isFinite(rawVal)) {
    return { display: Number(rawVal), calc: Number(rawVal), isValid: true };
  }
  const strVal = String(rawVal).trim();
  const allowList = { '病': null, '公': null, '喪': null, '事': 0, '缺': 0 };
  if (allowList.hasOwnProperty(strVal)) {
    return { display: strVal, calc: allowList[strVal], isValid: true };
  }
  return { display: '缺', calc: 0, isValid: false };
}

function triggerDailyAutomation() {
  const log = [];
  const today = Utilities.formatDate(new Date(), "GMT+8", "yyyy/MM/dd HH:mm");
  log.push(`【自動化報告】執行時間：${today}\n`);

  try {
    log.push("--- [Task 1] 缺交通知掃描 ---");
    const scanResult = runAutoMissingScan();
    log.push(scanResult);
  } catch (e) {
    log.push(`❌ 缺交掃描發生錯誤: ${e.toString()}`);
  }

  try {
    log.push("\n--- [Task 2] 成績資料庫同步 ---");
    const syncResult = apiSyncToDatabase();
    if (syncResult.success) {
      log.push(`✅ 資料庫同步成功！共更新 ${syncResult.count} 筆資料。`);
    } else {
      log.push(`⚠️ 資料庫同步失敗: ${syncResult.msg}`);
    }
  } catch (e) {
    log.push(`❌ 同步發生嚴重錯誤: ${e.toString()}`);
  }

  try {
    const teacherEmail = Session.getActiveUser().getEmail();
    if (teacherEmail) {
      MailApp.sendEmail(teacherEmail, "【GradeFlow】每日自動化執行報告", log.join("\n"));
    }
  } catch (e) {
    console.error("無法寄送報告", e);
  }
}

function runAutoMissingScan() {
  const list = getListByMode('subject');
  const tpl = loadUserTemplates();
  let count = 0;
  let logs = [];

  list.forEach(cls => {
    if (!cls.targets || cls.targets.length === 0) return;
    let aggregatedMap = {};
    let hasData = false;

    cls.targets.forEach(sheetName => {
      const result = scanMissingAssignments(cls.url, sheetName, cls.days);
      if (result.success && result.data.length > 0) {
        hasData = true;
        try {
          const ss = SpreadsheetApp.openByUrl(cls.url);
          const sheet = ss.getSheetByName(sheetName);
          result.data.forEach(s => {
            if (s.expired && s.expired.length > 0) {
              s.expired.forEach(item => {
                try {
                  let cell = sheet.getRange(item.row, item.col);
                  cell.setValue(0);
                  if (!cell.getNote().includes("逾期")) cell.setNote("系統標記：逾期缺交 (0分)");
                  cell.setBackground("#fff9c4");
                } catch (e) { }
              });
            }
          });
        } catch (e) { }

        result.data.forEach(s => {
          if (!aggregatedMap[s.seatNo]) aggregatedMap[s.seatNo] = { name: s.name, email: s.email, warnings: [], expired: [] };
          aggregatedMap[s.seatNo].warnings.push(...s.warnings);
          aggregatedMap[s.seatNo].expired.push(...s.expired);
        });
      }
    });

    if (hasData) {
      Object.values(aggregatedMap).forEach(s => {
        try {
          const emailContent = generateConsolidatedEmailHtml(s, tpl);
          const subject = tpl.missingSubject.replace('{{姓名}}', s.name);
          sendEmailDirect(s.email, subject, emailContent, cls.cc);
          count++;
        } catch (err) { logs.push(`寄送失敗: ${s.name} (${err})`); }
      });
      logs.push(`班級 [${cls.name}]: 已通知 ${Object.keys(aggregatedMap).length} 位學生`);
    }
  });

  if (count === 0) return "今日無缺交需通知。";
  return `已發送 ${count} 封通知信。\n` + logs.join("\n");
}

function generateConsolidatedEmailHtml(s, tpl) {
  let allWarnHtml = "", allExpHtml = "";
  const headerRow = '<tr style="background:#fff7ed; text-align:left;"><th style="padding:8px;color:#c2410c">日期</th><th style="padding:8px;color:#c2410c">作業名稱</th><th style="padding:8px;color:#c2410c">狀態</th></tr>';

  let wRows = s.warnings.map(item => `<tr><td style="padding:6px;border-bottom:1px solid #eee;">${item.date}</td><td style="padding:6px;border-bottom:1px solid #eee;font-weight:bold;">${item.task}</td><td style="padding:6px;border-bottom:1px solid #eee;color:#d97706;font-weight:bold;">${item.status}</td></tr>`).join('');
  let eRows = s.expired.map(item => `<tr><td style="padding:6px;border-bottom:1px solid #eee;color:#999;">${item.date}</td><td style="padding:6px;border-bottom:1px solid #eee;color:#999;">${item.task}</td><td style="padding:6px;border-bottom:1px solid #eee;color:#dc2626;">${item.status}</td></tr>`).join('');

  if (wRows) allWarnHtml = `<div style="margin-bottom:20px;"><div style="background:#fff7ed;color:#9a3412;padding:8px;font-weight:bold;font-size:14px;border-left:4px solid #f97316;">⚠️ 尚未繳交 (請盡速補交)</div><table style="width:100%;font-size:14px;border-collapse:collapse;margin-top:5px;">${headerRow}${wRows}</table></div>`;
  if (eRows) allExpHtml = `<div style="margin-bottom:10px;"><div style="background:#f3f4f6;color:#666;padding:8px;font-weight:bold;font-size:14px;border-left:4px solid #999;">❌ 已逾期 (無法補交)</div><table style="width:100%;font-size:14px;border-collapse:collapse;margin-top:5px;">${headerRow}${eRows}</table></div>`;

  let body = tpl.missingBody.replace('{{姓名}}', s.name).replace('{{分頁名稱}}', "").replace('{{缺交列表}}', allWarnHtml || "(無待補交項目)").replace('{{逾期列表}}', allExpHtml || "").replace(/\n/g, '<br>');
  return `<div style="padding:20px; background:#fff7ed; font-family:sans-serif;"><div style="background:#fff; border:1px solid #fed7aa; border-radius:8px; overflow:hidden;"><div style="background:#f97316; color:white; padding:12px; text-align:center; font-weight:bold;">${tpl.missingSubject.replace('{{姓名}}', s.name)}</div><div style="padding:20px; color:#333; line-height:1.6;">${body}</div></div></div>`;
}

function setupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'triggerDailyAutomation') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('triggerDailyAutomation')
    .timeBased()
    .everyDays(1)
    .atHour(8)
    .create();
  return "排程設定完成！每天早上 8 點自動執行。";
}

function triggerPreviewSummary() {
  const teacherEmail = Session.getActiveUser().getEmail();
  if (!teacherEmail) return;

  const list = getListByMode('subject');
  let allMissingData = [];
  let log = [];

  log.push(`【預覽報告】執行時間：${Utilities.formatDate(new Date(), "GMT+8", "yyyy/MM/dd HH:mm")}`);

  list.forEach(cls => {
    if (!cls.targets || cls.targets.length === 0) return;
    const scanRes = apiScanAllClassTargets(cls.url, cls.targets, cls.days);

    if (scanRes.success && scanRes.data.length > 0) {
      scanRes.data.forEach(student => {
        const items = [...student.warnings, ...student.expired];
        items.forEach(item => {
          allMissingData.push({
            className: cls.name,
            seatNo: student.seatNo,
            name: student.name,
            task: item.task,
            date: item.date,
            status: item.status,
            isExpired: item.status.includes("過期")
          });
        });
      });
      log.push(`✅ [${cls.name}] 掃描完成，發現 ${scanRes.data.length} 位學生有缺交。`);
    } else {
      log.push(`⚪ [${cls.name}] 目前無缺交資料。`);
    }
  });

  if (allMissingData.length === 0) {
    try {
      MailApp.sendEmail(teacherEmail, "【GradeFlow】缺交預覽：今日無任何缺交", log.join("\n"));
    } catch (e) { console.error("寄信失敗: " + e); }
    return;
  }

  const htmlTable = generateSummaryTableHtml(allMissingData);
  const emailSubject = `【GradeFlow】缺交預覽統整 (${allMissingData.length} 筆待處理)`;
  const emailBody = `
    <div style="font-family: sans-serif; color: #333;">
      <h2 style="color: #2563eb;">📋 今日缺交預覽報表</h2>
      <p>這是系統掃描後的統整資料，正式通知將於稍後排程執行。</p>
      <div style="background: #f1f5f9; padding: 10px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; color: #64748b;">
        ${log.join('<br>')}
      </div>
      ${htmlTable}
      <p style="font-size: 12px; color: #999; margin-top: 20px;">此信件僅供老師預覽，學生不會收到此信。</p>
    </div>
  `;

  try {
    MailApp.sendEmail({
      to: teacherEmail,
      subject: emailSubject,
      htmlBody: emailBody
    });
  } catch (e) { console.error("寄信失敗: " + e); }
}

function generateSummaryTableHtml(data) {
  let html = `
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; border: 1px solid #e2e8f0;">
      <thead style="background: #f8fafc;">
        <tr>
          <th style="padding: 10px; text-align: left; border-bottom: 2px solid #cbd5e1; color: #475569;">班級</th>
          <th style="padding: 10px; text-align: center; border-bottom: 2px solid #cbd5e1; color: #475569;">座號</th>
          <th style="padding: 10px; text-align: left; border-bottom: 2px solid #cbd5e1; color: #475569;">姓名</th>
          <th style="padding: 10px; text-align: left; border-bottom: 2px solid #cbd5e1; color: #475569;">缺交作業</th>
          <th style="padding: 10px; text-align: center; border-bottom: 2px solid #cbd5e1; color: #475569;">日期</th>
          <th style="padding: 10px; text-align: center; border-bottom: 2px solid #cbd5e1; color: #475569;">狀態</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.forEach((row, index) => {
    const bg = index % 2 === 0 ? '#ffffff' : '#f8fafc';
    const statusColor = row.isExpired ? '#dc2626' : '#d97706';
    const statusBg = row.isExpired ? '#fef2f2' : '#fffbeb';

    html += `
      <tr style="background: ${bg}; border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 10px; font-weight: bold; color: #334155;">${row.className}</td>
        <td style="padding: 10px; text-align: center; font-family: monospace;">${row.seatNo}</td>
        <td style="padding: 10px;">${row.name}</td>
        <td style="padding: 10px; font-weight: bold;">${row.task}</td>
        <td style="padding: 10px; text-align: center; color: #64748b;">${row.date}</td>
        <td style="padding: 10px; text-align: center;">
          <span style="color: ${statusColor}; background: ${statusBg}; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: bold;">
            ${row.status}
          </span>
        </td>
      </tr>
    `;
  });

  html += `</tbody></table>`;
  return html;
}

/**
 * 取得目前的自動排程設定
 */
function apiGetTriggerSettings() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    const settings = {
      triggerDailyAutomation: { enabled: false, hour: 8 },
      apiSyncToDatabase: { enabled: false, hour: 0 }
    };

    triggers.forEach(t => {
      const handler = t.getHandlerFunction();
      if (settings[handler]) {
        settings[handler].enabled = true;
      }
    });

    // 嘗試從 System Property 讀取上次設定的小時 (若有) 以優化顯示
    const savedConfig = getSystemProperty("TRIGGER_CONFIG");
    if (savedConfig) {
      const parsed = JSON.parse(savedConfig);
      if (parsed.triggerDailyAutomation) settings.triggerDailyAutomation.hour = parsed.triggerDailyAutomation.hour;
      if (parsed.apiSyncToDatabase) settings.apiSyncToDatabase.hour = parsed.apiSyncToDatabase.hour;
    }

    return sanitizeForFrontend({ success: true, settings: settings });
  } catch (e) {
    return sanitizeForFrontend({ success: false, msg: e.toString() });
  }
}

/**
 * 儲存自動排程設定
 * @param {Object} config e.g. { triggerDailyAutomation: { enabled: true, hour: 8 } }
 */
function apiSaveTriggerSettings(config) {
  try {
    const triggers = ScriptApp.getProjectTriggers();

    // 1. 先清除舊的相關觸發器
    Object.keys(config).forEach(handlerName => {
      triggers.forEach(t => {
        if (t.getHandlerFunction() === handlerName) {
          ScriptApp.deleteTrigger(t);
        }
      });
    });

    // 2. 建立新觸發器
    Object.keys(config).forEach(handlerName => {
      const item = config[handlerName];
      if (item.enabled) {
        ScriptApp.newTrigger(handlerName)
          .timeBased()
          .everyDays(1)
          .atHour(parseInt(item.hour))
          .create();
      }
    });

    // 3. 儲存設定值 (為了記住小時)
    setSystemProperty("TRIGGER_CONFIG", JSON.stringify(config), "自動排程設定快照");

    return sanitizeForFrontend({ success: true });
  } catch (e) {
    return sanitizeForFrontend({ success: false, msg: e.toString() });
  }
}

/**
 * 遞迴處理物件中的 Date 物件，轉為 ISO 字串，避免 google.script.run 失敗
 * @param {any} data 
 * @returns {any}
 */
function sanitizeForFrontend(data) {
  if (data === null || data === undefined) return data;

  if (data instanceof Date) {
    // 轉為 ISO 字串，讓前端好處理
    return Utilities.formatDate(data, Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeForFrontend(item));
  }

  if (typeof data === 'object') {
    const newObj = {};
    for (const key in data) {
      newObj[key] = sanitizeForFrontend(data[key]);
    }
    return newObj;
  }

  return data;
}