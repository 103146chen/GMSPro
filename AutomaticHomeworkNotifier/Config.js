/**
 * 設定存取模組
 * 負責處理屬性儲存與應用程式設定
 */

// 輔助函式：供後端取得目前的屬性值 (私有)
function getProperty_(key) {
  return PropertiesService.getScriptProperties().getProperty(key) || "";
}

function getPropertyKey(mode) {
  return mode === 'homeroom' ? "HOMEROOM_CONFIG_LIST" : "CLASS_CONFIG_LIST";
}

function getListByMode(mode) {
  const key = getPropertyKey(mode);
  const json = getProperty_(key);
  return json ? JSON.parse(json) : [];
}

function initAppData() {
  return {
    subject: getListByMode('subject'),
    homeroom: getListByMode('homeroom')
  };
}

/**
 * [修改] 儲存所有資料 (包含待處理清單)
 * 增加第三個參數 pendingList
 */
function apiSaveAllData(subjectList, homeroomList, pendingList) {
  try {
    const props = PropertiesService.getScriptProperties();
    props.setProperty("CLASS_CONFIG_LIST", JSON.stringify(subjectList));
    props.setProperty("HOMEROOM_CONFIG_LIST", JSON.stringify(homeroomList));
    
    // 如果有傳入 pendingList 才更新，避免舊程式碼呼叫時出錯
    if (pendingList) {
      props.setProperty("PENDING_CONFIG_LIST", JSON.stringify(pendingList));
    }
    return { success: true };
  } catch (e) {
    return { success: false, msg: e.toString() };
  }
}

/**
 * [新增] 將新檔案加入待處理清單 (由 Creator 呼叫)
 */
function addToPendingList(name, url) {
  const props = PropertiesService.getScriptProperties();
  const json = props.getProperty("PENDING_CONFIG_LIST") || "[]";
  let list = JSON.parse(json);
  
  // 避免重複加入
  if (!list.some(f => f.url === url)) {
    list.push({
      name: name,
      url: url,
      created: new Date().toISOString(), // 紀錄建立時間
      role: 'pending'
    });
    props.setProperty("PENDING_CONFIG_LIST", JSON.stringify(list));
  }
}

/**
 * [新增] 讀取待處理清單 (取代原本的資料夾掃描)
 */
function apiGetPendingFiles() {
  const json = getProperty_("PENDING_CONFIG_LIST");
  return json ? JSON.parse(json) : [];
}

function saveUserTemplates(tplJson) {
  PropertiesService.getScriptProperties().setProperty("USER_TEMPLATES", tplJson);
  return { success: true };
}

function loadUserTemplates() {
  const json = getProperty_("USER_TEMPLATES");
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
  return tpl;
}