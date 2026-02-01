/**
 * 資安模組
 * 負責加密、金鑰管理與權限驗證
 */

// 密碼雜湊 (SHA-256)
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

// 動態取得金鑰
function getDynamicKey_(ss) {
  try {
    const fileId = ss.getId();
    const userSalt = getProperty_("SYSTEM_SALT") || "";
    return hashPassword_(fileId + userSalt);
  } catch (e) {
    // 開源版建議修改此處的 Fallback 字串，提示使用者設定
    return hashPassword_("Please_Set_Your_System_Salt");
  }
}

// 資料加密核心 (IV + RowKey)
function cipherData_(text, isEncrypt, systemSalt, fileId) {
  if (!text) return "";
  
  // 1. 雙方都知道的「母秘密」
  const baseSecret = fileId + (systemSalt || "");

  if (isEncrypt) {
    // --- 加密端 (管理員) ---
    
    // 產生隨機 IV (這個不用保密，但每行都要不一樣)
    const rowIv = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
    
    // 產生「子金鑰」：母秘密 + IV
    const rowKey = hashPassword_(baseSecret + rowIv);
    
    // 加密 (傳入 true)
    const encryptedBody = xorProcess_(text, rowKey, true);
    
    // ★ 重點：把 IV 跟密文接在一起回傳，中間用 | 隔開
    return rowIv + "|" + encryptedBody;

  } else {
    // --- 解密端 (學生) ---
    try {
      // 1. 先把 IV 跟 密文 切開
      const parts = text.split("|");
      if (parts.length !== 2) return ""; 
      
      const rowIv = parts[0];       // 拿到這行專屬的 IV
      const encryptedBody = parts[1]; // 拿到真正的密文
      
      // 2. 因為我有母秘密，又有 IV，所以我可以算出同一把「子金鑰」
      const rowKey = hashPassword_(baseSecret + rowIv);
      
      // 3. 解密 (傳入 false)
      return xorProcess_(encryptedBody, rowKey, false);
      
    } catch (e) { return ""; }
  }
}

// ★★★ 補上漏掉的運算函式 ★★★
function xorProcess_(text, key, isEncrypt) {
    const keyLen = key.length;
    
    if (isEncrypt) {
        // 加密路徑：String -> Bytes -> XOR -> Base64
        const textBytes = Utilities.newBlob(text).getBytes();
        const resultBytes = [];
        for (let i = 0; i < textBytes.length; i++) {
            resultBytes.push(textBytes[i] ^ key.charCodeAt(i % keyLen));
        }
        return Utilities.base64Encode(resultBytes);
    } else {
        // 解密路徑：Base64 -> Bytes -> XOR -> String
        try {
            const textBytes = Utilities.base64Decode(text);
            const resultBytes = [];
            for (let i = 0; i < textBytes.length; i++) {
                resultBytes.push(textBytes[i] ^ key.charCodeAt(i % keyLen));
            }
            return Utilities.newBlob(resultBytes).getDataAsString();
        } catch(e) {
            return "";
        }
    }
}

function apiSaveSystemSalt(salt) {
  try {
    const cleanSalt = String(salt || "").trim();
    if (!cleanSalt) return { success: false, msg: "金鑰不能為空" };
    PropertiesService.getScriptProperties().setProperty("SYSTEM_SALT", cleanSalt);
    return { success: true };
  } catch (e) {
    return { success: false, msg: e.toString() };
  }
}

function apiCheckSaltStatus() {
  const salt = getProperty_("SYSTEM_SALT");
  return { isSet: !!salt };
}

function apiGetConfigForCopy() {
    const dbUrl = getProperty_("DB_URL");
    const salt = getProperty_("SYSTEM_SALT");
    if(!dbUrl || !salt) return { success: false, msg: "尚未設定資料庫或金鑰，無法複製。" };
    
    const configText = `【查詢端設定資訊】\n資料庫網址：${dbUrl}\n加密金鑰(Salt)：${salt}`;
    return { success: true, text: configText };
}