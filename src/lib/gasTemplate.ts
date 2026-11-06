/**
 * Google Apps Script (GAS) Blueprint & Integration Helper
 * 
 * Complies with requirement:
 * "ถ้าระบบหรือฟังก์ชันไหนที่ต้องใช้ Google Cloud Run ให้แนะนำ user ไปใช้ Google Sheets, Google Apps Script แทนทันที"
 * 
 * This provides zero-cost Google Sheets / GAS script for instructors.
 */

export const GOOGLE_APPS_SCRIPT_CODE = `/**
 * ============================================================================
 * สคริปต์ Google Apps Script (GAS) สำหรับระบบประกาศคะแนนนักศึกษา
 * ใช้เชื่อมต่อ Google Sheets กับระบบประกาศคะแนน (ฟรี 100% ภายใต้โควตา Google Workspace)
 * ไม่ต้องใช้ Google Cloud Run ใดๆ ทั้งสิ้น
 * ============================================================================
 */

// 1. ฟังก์ชัน Web App รับ Request (GET/POST)
function doGet(e) {
  var action = e.parameter.action;
  
  if (action === "checkScore") {
    return handleCheckScore(e.parameter.studentId, e.parameter.pin);
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    status: "ok",
    message: "ระบบ GAS พร้อมทำงาน",
    timestamp: new Date().toISOString()
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === "syncScores") {
      return handleSyncScores(data);
    }
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Unknown action"
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. ฟังก์ชันตรวจสอบคะแนนนักศึกษา พร้อมป้องกัน Brute-Force
function handleCheckScore(studentId, pin) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Scores");
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      message: "ไม่พบ Sheet ชื่อ 'Scores'"
    })).setMimeType(ContentService.MimeType.JSON);
  }

  var data = sheet.getDataRange().getValues();
  // ค้นหาตามรหัสนักศึกษา (คอลัมน์ B หรือ index 1)
  for (var i = 1; i < data.length; i++) {
    var rowId = String(data[i][1]).trim();
    if (rowId === String(studentId).trim()) {
      var storedPin = String(data[i][9] || ""); // คอลัมน์ J: PIN หรือ Hash
      var failedAttempts = Number(data[i][10] || 0); // คอลัมน์ K: จำนวนครั้งที่ผิด
      
      if (failedAttempts >= 5) {
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          locked: true,
          message: "ระงับการเข้าสู่ระบบชั่วคราวเนื่องจากกรอกรหัสผิดเกิน 5 ครั้ง กรุณาติดต่ออาจารย์ผู้สอน"
        })).setMimeType(ContentService.MimeType.JSON);
      }

      // ตรวจสอบ PIN (ถ้ายังไม่เคยตั้ง หรือ PIN ตรงกัน)
      if (!storedPin || storedPin === pin) {
        // รีเซ็ต failed attempts
        sheet.getRange(i + 1, 11).setValue(0);
        return ContentService.createTextOutput(JSON.stringify({
          success: true,
          no: data[i][0],
          studentId: data[i][1],
          name: data[i][2],
          sec: data[i][3],
          scores: {
            ATTEN: data[i][4],
            CA: data[i][5],
            AS: data[i][6],
            MID: data[i][7],
            TOTAL: data[i][8]
          }
        })).setMimeType(ContentService.MimeType.JSON);
      } else {
        // เพิ่มจำนวนครั้งที่ผิด
        sheet.getRange(i + 1, 11).setValue(failedAttempts + 1);
        return ContentService.createTextOutput(JSON.stringify({
          success: false,
          remainingAttempts: Math.max(0, 5 - (failedAttempts + 1)),
          message: "รหัสผ่านไม่ถูกต้อง (เหลือโอกาส " + Math.max(0, 5 - (failedAttempts + 1)) + " ครั้ง)"
        })).setMimeType(ContentService.MimeType.JSON);
      }
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: false,
    message: "ไม่พบรหัสนักศึกษานี้ในระบบประกาศคะแนน"
  })).setMimeType(ContentService.MimeType.JSON);
}
`;
