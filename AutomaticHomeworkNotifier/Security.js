/**
 * 資安模組 (Refactored for v12)
 * 負責加密(AES)、金鑰管理與權限驗證
 */

// 取得或產生 AES 密鑰 (32 bytes hex)
function getOrGenerateSecretKey() {
  let secret = "";

  // 1. Try Developer Metadata (Preferred)
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      const metadata = ss.getDeveloperMetadata();
      const keyMeta = metadata.find(m => m.getKey() === 'GMSPRO_AES_KEY');
      if (keyMeta) return keyMeta.getValue();
    }
  } catch (e) {
    console.warn("Metadata access failed, falling back to ScriptProperties: " + e.toString());
  }

  // 2. Try Script Properties (Fallback -> Now System Sheet)
  try {
    // [Mod] Migrated to Sheet
    secret = getSystemProperty("GMSPRO_AES_KEY");
    if (secret) return secret;
  } catch (e) { console.error("Properties access failed: " + e); }

  // 3. Generate New Key
  secret = Utilities.getUuid().replace(/-/g, ''); // 32 chars

  // 4. Save to both locations
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      // Try with explicit visibility first
      try {
        ss.addDeveloperMetadata('GMSPRO_AES_KEY', secret, SpreadsheetApp.DeveloperMetadataVisibility.HIDDEN);
      } catch (e) {
        try {
          // Fallback: Default visibility
          ss.addDeveloperMetadata('GMSPRO_AES_KEY', secret);
        } catch (e2) {
          console.warn("Metadata save failed: " + e2.message);
        }
      }
    }
  } catch (e) { console.warn("Metadata access failed: " + e.message); }

  try {
    // [Mod] Migrated to Sheet
    setSystemProperty("GMSPRO_AES_KEY", secret, "系統 AES 加密金鑰");
  } catch (e) { console.error("Save Properties failed: " + e); }

  return secret;
}

// 密碼雜湊 (SHA-256) - 保留用於其他用途 (如密碼驗證)
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

// 資料加密核心 (AES)
// text: 明文或密文
// isEncrypt: true=加密, false=解密
function cipherData_(text, isEncrypt) {
  if (!text) return "";

  // 取得系統 AES Key
  const secretKey = getOrGenerateSecretKey();

  if (isEncrypt) {
    // 加密
    try {
      // 使用 Lib_Crypto.gs 載入的 CryptoJS
      if (typeof CryptoJS === 'undefined') return "Error: CryptoJS library not found.";

      const encrypted = CryptoJS.AES.encrypt(text, secretKey).toString();
      return encrypted;
    } catch (e) {
      console.error("Encryption failed: " + e);
      return "Error: Encryption failed";
    }
  } else {
    // 解密
    try {
      if (typeof CryptoJS === 'undefined') return "";

      const decryptedBytes = CryptoJS.AES.decrypt(text, secretKey);
      const decrypted = decryptedBytes.toString(CryptoJS.enc.Utf8);
      return decrypted;
    } catch (e) {
      // Decrypt failed (bad key or bad data)
      return "";
    }
  }
}

function apiSaveSystemSalt(salt, resetKey) {
  // v12: Salt is less relevant for AES if we manage key internally, 
  // but maybe still used for something else? 
  // User instruction didn't explicitly say remove apiSaveSystemSalt, only "Security.js (Upgrade to AES)".
  // But likely 'SYSTEM_SALT' was used for the old key generation.
  // We can keep it or deprecate it. Let's keep it but store it if user calls it, 
  // though getOrGenerateSecretKey replaces the logic.
  try {
    const cleanSalt = String(salt || "").trim();
    if (!cleanSalt) return { success: false, msg: "金鑰不能為空" };
    if (cleanSalt) {
      setSystemProperty("SYSTEM_SALT", cleanSalt, "系統加密鹽值 (System Salt)");

      // ★★★ Critical Fix: Derive AES Key from Salt ★★★
      // User expects the "Salt" to be the key. We hash it to 32-bytes for AES-256.
      const derivedKey = hashPassword_(cleanSalt); // SHA-256 returns 64 hex chars (32 bytes) - Perfect for AES word array or hex string

      // Save to Metadata (Source of Truth for Encryption)
      try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        if (ss) {
          // Update Metadata
          const metas = ss.getDeveloperMetadata();
          const keyMeta = metas.find(m => m.getKey() === 'GMSPRO_AES_KEY');
          if (keyMeta) keyMeta.remove();
          ss.addDeveloperMetadata('GMSPRO_AES_KEY', derivedKey, SpreadsheetApp.DeveloperMetadataVisibility.HIDDEN);
        }
      } catch (e) {
        console.warn("addDeveloperMetadata failed in apiSaveSystemSalt (ignoring): " + e.message);
      }

      // Save to Properties (Fallback -> Now Sheet)
      try {
        setSystemProperty("GMSPRO_AES_KEY", derivedKey, "系統衍生 AES 金鑰 (Derived from Salt)");
      } catch (e) { console.error("Properties save failed: " + e.message); }
    }

    return sanitizeForFrontend({ success: true });
  } catch (e) {
    return sanitizeForFrontend({ success: false, msg: e.toString() });
  }
}

// function getDynamicKey_() removed (Legacy/Unused)

function apiCheckSaltStatus() {
  const salt = getSystemProperty("SYSTEM_SALT");
  return sanitizeForFrontend({ isSet: !!salt });
}

function apiGetConfigForCopy() {
  const dbUrl = getSystemProperty("DB_URL");

  // Show Salt if valid, otherwise showing the internal Key might be confusing (as user reported "garbled")
  // But if Salt is missing, we must show Key.
  const salt = getSystemProperty("SYSTEM_SALT");
  const key = getOrGenerateSecretKey();

  const displayKey = salt ? `(Salt) ${salt}` : `(Raw Key) ${key}`;

  const configText = `【查詢端設定資訊】\n資料庫網址：${dbUrl}\n加密金鑰：${displayKey}`;
  return sanitizeForFrontend({ success: true, text: configText });
}
