/**
 * 生成模組
 * 負責建立檔案與 Drive 操作
 */

function createTemplateSheet(customTitle, sheetNamesStr, permissionConfig, studentList) {
  try {
    var title = customTitle || "成績系統_專用範本";
    var ss = SpreadsheetApp.create(title);
    var url = ss.getUrl();
    var fileId = ss.getId();

    moveFileToStorage(fileId); 

    var file = DriveApp.getFileById(fileId);
    if (permissionConfig && permissionConfig.isPublic) file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    if (permissionConfig && permissionConfig.editorEmail && permissionConfig.editorEmail.includes("@")) file.addEditor(permissionConfig.editorEmail.trim());

    var sheetSet = ss.getSheets()[0];
    sheetSet.setName("設定");
    
    var headersSet = [["座號", "姓名", "Email"]];
    var finalStudentList = (studentList && studentList.length > 0) ? studentList : [["1", "王小明", "student1@example.com"], ["2", "李小華", "student2@example.com"]];
    
    sheetSet.getRange("1:1").setBackground("#cfe2f3").setFontWeight("bold");
    sheetSet.getRange(1, 1, 1, 3).setValues(headersSet);
    if(finalStudentList.length > 0) sheetSet.getRange(2, 1, finalStudentList.length, 3).setValues(finalStudentList);
    sheetSet.setFrozenRows(1);

    var targetSheets = sheetNamesStr ? sheetNamesStr.split(/\r?\n/).map(s=>s.trim()).filter(s=>s!=="") : ["段考成績", "平時成績"];
    var today = new Date();
    var row1Data = ["", "", today, new Date(today.getTime() + 86400000*7)];
    var row2Data = ["座號", "姓名", "範例作業", "範例作業2"];
    
    targetSheets.forEach(function(name) {
      if(!name) return;
      var sheet = ss.insertSheet(name);
      sheet.getRange("A:B").setBackground("#f3f3f3");
      sheet.getRange("1:1").setBackground("#fff2cc").setNumberFormat("yyyy/mm/dd"); 
      sheet.getRange("2:2").setBackground("#d9ead3").setFontWeight("bold").setBorder(true, true, true, true, true, true);
      sheet.getRange(1, 1, 1, 4).setValues([row1Data]);
      sheet.getRange(2, 1, 1, 4).setValues([row2Data]);
      sheet.getRange("B1").setValue("日期").setHorizontalAlignment("right").setFontWeight("bold");
      sheet.getRange("A3").setFormula("=ARRAYFORMULA('設定'!A2:B)");
      sheet.setFrozenRows(2);
      sheet.setFrozenColumns(2);

      var rangeRow1 = sheet.getRange(1, 3, 1, sheet.getMaxColumns() - 2); 
      var rangeRow2 = sheet.getRange(2, 3, 1, sheet.getMaxColumns() - 2); 

      var rules = [];
      var ruleDateInvalid = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND(NOT(ISBLANK(C1)), NOT(ISDATE(C1)))')
        .setBackground('#FCA5A5') 
        .setRanges([rangeRow1])
        .build();
      rules.push(ruleDateInvalid);

      var ruleDateMissing = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND(ISBLANK(C1), OR(NOT(ISBLANK(C2)), COUNTA(C3:C)>0))')
        .setBackground('#FCA5A5')
        .setRanges([rangeRow1])
        .build();
      rules.push(ruleDateMissing);

      var ruleTaskMissing = SpreadsheetApp.newConditionalFormatRule()
        .whenFormulaSatisfied('=AND(ISBLANK(C2), COUNTA(C3:C)>0)')
        .setBackground('#FCA5A5')
        .setRanges([rangeRow2])
        .build();
      rules.push(ruleTaskMissing);

      sheet.setConditionalFormatRules(rules);
    });

    return { success: true, url: url };
  } catch (e) { return { success: false, msg: e.toString() }; }
}

function apiBatchCreateTemplates(configs) {
  var results = []; var log = [];
  try {
    configs.forEach(function(cfg) {
      var res = createTemplateSheet(cfg.title, cfg.sheetsStr, cfg.permission, cfg.studentList);
      if (res.success) { results.push({ title: cfg.title, url: res.url, success: true }); log.push("成功: " + cfg.title); } 
      else { results.push({ title: cfg.title, error: res.msg, success: false }); log.push("失敗: " + cfg.title); }
    });
    return { success: true, results: results, log: log.join("\n") };
  } catch (e) { return { success: false, msg: e.toString() }; }
}

function createDataHubSheet(filename) {
  try {
    const ss = SpreadsheetApp.create(filename);
    const url = ss.getUrl();
    const fileId = ss.getId();
    moveFileToStorage(fileId);
    
    var infoSheet = ss.getSheets()[0];
    infoSheet.setName("系統說明");
    infoSheet.getRange("A1").setValue("⚠️ 這是「家長查詢系統」的專用資料庫");
    infoSheet.getRange("A2").setValue("系統運作依賴隱藏的資料分頁 (DB_Source, DB_Auth)。");
    infoSheet.getRange("A3").setValue("請勿刪除或隨意修改隱藏分頁的結構。");
    infoSheet.getRange("A5").setValue("此頁面需保留以維持檔案正常開啟。");
    infoSheet.getRange("A1:A5").setFontWeight("bold");
    infoSheet.getRange("A1").setFontColor("red").setFontSize(14);
    infoSheet.getRange("A2:A5").setFontColor("#666");
    infoSheet.setColumnWidth(1, 400);

    let sourceSheet = ss.insertSheet("DB_Source");
    sourceSheet.getRange(1, 1, 1, 4).setValues([["座號 (Key)", "姓名", "資料包 (JSON)", "更新時間"]]);
    sourceSheet.getRange(1, 1, 1, 4).setFontWeight("bold").setBackground("#e2e8f0");
    sourceSheet.setFrozenRows(1);
    sourceSheet.hideSheet();

    let authSheet = ss.insertSheet("DB_Auth");
    authSheet.getRange(1, 1, 1, 3).setValues([["座號 (Key)", "學生密碼", "家長密碼"]]);
    authSheet.getRange(1, 1, 1, 3).setFontWeight("bold").setBackground("#fff7ed"); 
    authSheet.setFrozenRows(1);
    authSheet.hideSheet();
    
    return { success: true, url: url, name: filename };
  } catch (e) { return { success: false, msg: e.toString() }; }
}

function apiSaveStorageFolder(urlOrId) {
  let folderId = urlOrId.trim();
  const match = folderId.match(/folders\/([-\w]+)/);
  if (match) folderId = match[1];
  try {
    const folder = DriveApp.getFolderById(folderId);
    PropertiesService.getScriptProperties().setProperty("DEFAULT_FOLDER_ID", folderId);
    return { success: true, folderName: folder.getName() };
  } catch (e) { return { success: false, msg: "無效的資料夾 ID 或網址" }; }
}

function apiGetStorageFolder() {
  const id = PropertiesService.getScriptProperties().getProperty("DEFAULT_FOLDER_ID");
  if (!id) return { success: true, id: "", name: "尚未設定 (預設為根目錄)" };
  try {
    const folder = DriveApp.getFolderById(id);
    return { success: true, id: id, name: folder.getName() };
  } catch (e) { return { success: true, id: id, name: "無效的資料夾 (將存於根目錄)" }; }
}

function moveFileToStorage(fileId) {
  const folderId = PropertiesService.getScriptProperties().getProperty("DEFAULT_FOLDER_ID");
  if (!folderId) return;
  try {
    const file = DriveApp.getFileById(fileId);
    const folder = DriveApp.getFolderById(folderId);
    file.moveTo(folder); 
  } catch (e) { console.error("移動檔案失敗: " + e.toString()); }
}

function apiBrowseDrive(folderId) {
  try {
    let current;
    if (folderId) {
      try { current = DriveApp.getFolderById(folderId); } catch(e) { return { success: false, msg: "找不到資料夾" }; }
    } else {
      current = DriveApp.getRootFolder();
    }
    let children = [];
    const folders = current.getFolders();
    while (folders.hasNext()) { const f = folders.next(); children.push({ id: f.getId(), name: f.getName() }); }
    children.sort((a, b) => a.name.localeCompare(b.name, 'zh-TW'));
    
    let parentId = null;
    const parents = current.getParents();
    if (parents.hasNext()) parentId = parents.next().getId();
    
    return { success: true, current: { id: current.getId(), name: current.getName() }, parent: parentId, children: children };
  } catch (e) { return { success: false, msg: e.toString() }; }
}