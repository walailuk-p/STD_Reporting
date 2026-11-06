import { StudentScoreItem } from '../types';

export interface CSVParseResult {
  items: StudentScoreItem[];
  detectedColumns: {
    no: boolean;
    studentId: boolean;
    name: boolean;
    sec: boolean;
    email: boolean;
    atten: boolean;
    ca: boolean;
    as: boolean;
    mid: boolean;
    totalCalculated: boolean;
  };
  totalCount: number;
  sectionsFound: string[];
  averageTotal: number;
}

/**
 * Enhanced CSV parser supporting UTF-8 Thai text, escaped quotes, and alias mappings:
 * - เลขที่ (No.)
 * - รหัสนักศึกษา (Student ID)
 * - ชื่อ-นามสกุล (Full Name)
 * - กลุ่มเรียน (Section / Sec)
 * - อีเมล (Email)
 * - ATTEN (คะแนนเข้าเรียน)
 * - ClassActivity (คะแนนกิจกรรมในชั้นเรียน) -> CA
 * - Assignment (คะแนนการบ้าน/งานที่ได้รับมอบหมาย) -> AS
 * - Midterm (คะแนนสอบกลางภาค) -> MID
 * - TOTAL: คำนวณอัตโนมัติจากคะแนนย่อย (ATTEN + CA + AS + MID)
 */
export function parseCSVWithDetails(content: string): CSVParseResult {
  // Strip UTF-8 BOM if present
  let cleanText = content;
  if (cleanText.charCodeAt(0) === 0xFEFF) {
    cleanText = cleanText.slice(1);
  }

  const lines = cleanText
    .split(/\r\n|\n|\r/)
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (lines.length < 2) {
    throw new Error('ไฟล์ CSV ต้องมีแถวหัวตาราง (Header) และข้อมูลนักศึกษาอย่างน้อย 1 แถว');
  }

  // Helper to split a CSV line into cells respecting quotes
  const splitLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headerRow = splitLine(lines[0]).map(h => h.trim());

  // Find column index helper matching case-insensitive and partial keywords
  const findColIndex = (aliases: string[]): number => {
    return headerRow.findIndex(h => {
      // Normalize by lowercasing and removing spaces, underscores, dots, hyphens, brackets, parentheses, slashes
      const norm = h.toLowerCase().replace(/[\s_.\-()/[\]]/g, '');
      return aliases.some(alias => {
        const normAlias = alias.toLowerCase().replace(/[\s_.\-()/[\]]/g, '');
        return norm === normAlias || norm.includes(normAlias) || normAlias.includes(norm);
      });
    });
  };

  const idxNo = findColIndex(['เลขที่(no.)', 'เลขที่(no)', 'เลขที่', 'ลำดับ', 'no.', 'no', '#', 'number']);
  const idxId = findColIndex(['รหัสนักศึกษา(studentid)', 'รหัสนักศึกษา', 'รหัสประจำตัว', 'studentid', 'student id', 'student_id', 'id']);
  const idxName = findColIndex(['ชื่อ-นามสกุล(fullname)', 'ชื่อ-นามสกุล', 'ชื่อ นามสกุล', 'ชื่อ', 'name', 'full name', 'fullname', 'student_name']);
  const idxSec = findColIndex(['กลุ่มเรียน(section/sec)', 'กลุ่มเรียน(section)', 'กลุ่มเรียน(sec)', 'กลุ่มเรียน', 'กลุ่ม', 'section/sec', 'section / sec', 'sec', 'section']);
  const idxEmail = findColIndex(['อีเมล(email)', 'อีเมล', 'email', 'e-mail', 'mail']);

  const idxAtten = findColIndex(['คะแนนเข้าเรียน(attend)', 'คะแนนเข้าเรียน', 'เข้าเรียน', 'atten(คะแนนเข้าเรียน)', 'attend', 'atten', 'attendance']);
  const idxCa = findColIndex(['คะแนนงานในชั้นเรียน(classactivity)', 'คะแนนงานในชั้นเรียน', 'งานในชั้นเรียน', 'classactivity(คะแนนกิจกรรมในชั้นเรียน)', 'คะแนนกิจกรรมในชั้นเรียน', 'กิจกรรมในชั้นเรียน', 'classactivity', 'class activity', 'ca', 'classwork']);
  const idxAs = findColIndex(['คะแนนการบ้าน(assignment)', 'คะแนนการบ้าน', 'การบ้าน', 'assignment(คะแนนการบ้าน/งานที่ได้รับมอบหมาย)', 'คะแนนการบ้าน/งานที่ได้รับมอบหมาย', 'งานที่ได้รับมอบหมาย', 'assignment', 'assignments', 'as', 'homework']);
  const idxMid = findColIndex(['คะแนนสอบกลางภาค(midterm)', 'คะแนนสอบกลางภาค', 'สอบกลางภาค', 'midterm(คะแนนสอบกลางภาค)', 'midterm', 'mid']);

  if (idxId === -1) {
    throw new Error('ไม่พบคอลัมน์ "รหัสนักศึกษา (Student ID)" ในหัวตารางไฟล์ CSV กรุณาตรวจสอบหัวตาราง');
  }

  const items: StudentScoreItem[] = [];
  const secSet = new Set<string>();
  let totalSum = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    if (cols.length === 0 || cols.every(c => c === '')) continue;

    const studentIdRaw = idxId !== -1 ? cols[idxId] : '';
    const studentId = studentIdRaw.replace(/[^0-9a-zA-Z]/g, '').trim();
    if (!studentId) continue;

    const no = idxNo !== -1 && cols[idxNo] ? Number(cols[idxNo]) || i : i;
    const name = idxName !== -1 && cols[idxName] ? cols[idxName].trim() : `นักศึกษา ${studentId}`;
    const sec = idxSec !== -1 && cols[idxSec] ? cols[idxSec].trim() : 'Sec 101';
    const email = idxEmail !== -1 && cols[idxEmail] ? cols[idxEmail].trim() : '';

    secSet.add(sec);

    const parseNum = (idx: number, defVal: number = 0): number => {
      if (idx === -1 || idx >= cols.length) return defVal;
      const raw = cols[idx].trim();
      if (!raw) return defVal;
      const clean = raw.replace(/[^0-9.-]/g, '');
      const num = parseFloat(clean);
      return isNaN(num) ? defVal : num;
    };

    const atten = parseNum(idxAtten, 0);
    const ca = parseNum(idxCa, 0);
    const as = parseNum(idxAs, 0);
    const mid = parseNum(idxMid, 0);

    // คำนวณคะแนนรวม (TOTAL) อัตโนมัติจากคะแนนย่อย
    // TOTAL = ATTEN + CA + AS + MID
    const calculatedTotal = parseFloat((atten + ca + as + mid).toFixed(2));
    totalSum += calculatedTotal;

    items.push({
      no,
      studentId,
      name,
      sec,
      email,
      scores: {
        ATTEN: atten,
        CA: ca,
        AS: as,
        MID: mid,
        TOTAL: calculatedTotal,
      },
      hasPin: false,
      failedAttempts: 0,
      isLocked: false,
      updatedAt: new Date().toISOString(),
    });
  }

  const averageTotal = items.length > 0 ? parseFloat((totalSum / items.length).toFixed(2)) : 0;

  return {
    items,
    detectedColumns: {
      no: idxNo !== -1,
      studentId: idxId !== -1,
      name: idxName !== -1,
      sec: idxSec !== -1,
      email: idxEmail !== -1,
      atten: idxAtten !== -1,
      ca: idxCa !== -1,
      as: idxAs !== -1,
      mid: idxMid !== -1,
      totalCalculated: true,
    },
    totalCount: items.length,
    sectionsFound: Array.from(secSet),
    averageTotal,
  };
}

/**
 * Standard parseCSV returning StudentScoreItem[] array for compatibility
 */
export function parseCSV(content: string): StudentScoreItem[] {
  return parseCSVWithDetails(content).items;
}

/**
 * Generate CSV template with UTF-8 BOM conforming exactly to user specification:
 * เลขที่ (No.), รหัสนักศึกษา (Student ID), ชื่อ-นามสกุล (Full Name), กลุ่มเรียน (Section / Sec), อีเมล (Email), ATTEN (คะแนนเข้าเรียน), ClassActivity (คะแนนกิจกรรมในชั้นเรียน), Assignment (คะแนนการบ้าน/งานที่ได้รับมอบหมาย), Midterm (คะแนนสอบกลางภาค), TOTAL (คะแนนรวม)
 */
export function generateSampleCSV(): string {
  const headers = [
    'เลขที่ (No.)',
    'รหัสนักศึกษา (Student ID)',
    'ชื่อ-นามสกุล (Full Name)',
    'กลุ่มเรียน (Section / Sec)',
    'อีเมล (Email)',
    'ATTEN (คะแนนเข้าเรียน)',
    'ClassActivity (คะแนนกิจกรรมในชั้นเรียน)',
    'Assignment (คะแนนการบ้าน/งานที่ได้รับมอบหมาย)',
    'Midterm (คะแนนสอบกลางภาค)',
    'TOTAL (คำนวณอัตโนมัติ)'
  ];

  const sampleRows = [
    ['1', '1650700011', 'นายสมชาย ใจดี', 'Sec 101', 'somchai.j@bu.ac.th', '10', '9.5', '18', '22.5', '60'],
    ['2', '1650700022', 'นางสาวสมหญิง รักเรียน', 'Sec 101', 'somying.r@bu.ac.th', '10', '10', '19', '24', '63'],
    ['3', '1650700033', 'นายกิตติคุณ มั่นคง', 'Sec 101', 'kittikun.m@bu.ac.th', '8', '8.5', '16', '19', '51.5'],
    ['4', '1650700044', 'นางสาวณิชาภา บุญส่ง', 'Sec 102', 'nichapa.b@bu.ac.th', '10', '9', '20', '23', '62'],
    ['5', '1650700055', 'นายปิยะวัฒน์ วิริยะ', 'Sec 102', 'piyawat.w@bu.ac.th', '9', '7.5', '15', '20', '51.5'],
  ];

  const csvRows = [headers.join(','), ...sampleRows.map(r => r.join(','))];
  return '\uFEFF' + csvRows.join('\r\n');
}

/**
 * Export student score roster to CSV with UTF-8 BOM
 */
export function exportToCSV(students: StudentScoreItem[], courseCode: string, courseName: string): void {
  const headers = [
    'เลขที่ (No.)',
    'รหัสนักศึกษา (Student ID)',
    'ชื่อ-นามสกุล (Full Name)',
    'กลุ่มเรียน (Section / Sec)',
    'อีเมล (Email)',
    'คะแนนเข้าเรียน (ATTEND) (10)',
    'คะแนนงานในชั้นเรียน (CLASS ACTIVITY) (10)',
    'คะแนนการบ้าน (ASSIGNMENT) (20)',
    'คะแนนสอบกลางภาค (MIDTERM) (25)',
    'คะแนนรวม (TOTAL) (65)'
  ];

  const rows = students.map(s => [
    s.no,
    `="${s.studentId}"`, // Force Excel text format for student ID to keep leading zeros
    `"${(s.name || '').replace(/"/g, '""')}"`,
    `"${(s.sec || '').replace(/"/g, '""')}"`,
    `"${(s.email || '').replace(/"/g, '""')}"`,
    s.scores.ATTEN ?? 0,
    s.scores.CA ?? 0,
    s.scores.AS ?? 0,
    s.scores.MID ?? 0,
    s.scores.TOTAL ?? 0,
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  const safeFilename = `${courseCode}_${courseName}_คะแนน.csv`.replace(/[^\wก-๙.-]/g, '_');
  link.setAttribute('download', safeFilename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
