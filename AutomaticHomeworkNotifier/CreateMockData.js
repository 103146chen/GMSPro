/**
 * 測試資料生成模組
 * 負責產生假資料以供測試
 */

function CreateMockData() {
    try {
        // 1. Create a new Spreadsheet
        const dateStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "MMdd_HHmm");
        const ss = SpreadsheetApp.create("MockData_" + dateStr);
        const url = ss.getUrl();
        const sheet = ss.getSheets()[0];
        sheet.setName("成績範例");

        // 2. Setup Headers
        // Row 1: Meta (Date, etc.)
        // Row 2: Headers
        sheet.getRange("A1").setValue("模擬考試日期: " + new Date().toISOString().split('T')[0]);

        // Headers: 座號, 姓名, ... 5 tasks ...
        const headers = ["座號", "姓名", "國文", "數學", "英文", "理化", "歷史"];
        sheet.getRange(2, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(2, 1, 1, headers.length).setBackground("#e2e8f0").setFontWeight("bold");
        sheet.setFrozenRows(2);

        // 3. Generate Data
        const data = [];
        for (let i = 1; i <= 30; i++) {
            const seat = i;
            const name = "學生" + String(i).padStart(2, '0');
            const row = [seat, name];

            // 5 Scores
            for (let j = 0; j < 5; j++) {
                // 10% chance empty
                if (Math.random() < 0.1) {
                    row.push("");
                } else {
                    // Score 0-100
                    row.push(Math.floor(Math.random() * 101));
                }
            }
            data.push(row);
        }

        // 4. Write Data
        if (data.length > 0) {
            sheet.getRange(3, 1, data.length, headers.length).setValues(data);
        }

        // 5. Add to Pending List (So user can see it in Config)
        // Check if addToPendingList exists (Config.js)
        if (typeof addToPendingList === 'function') {
            addToPendingList(ss.getName(), url);
        }

        return sanitizeForFrontend({ success: true, url: url, name: ss.getName() });

    } catch (e) {
        return sanitizeForFrontend({ success: false, msg: e.toString() });
    }
}
