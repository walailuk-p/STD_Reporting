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

  // Helper to tokenize a header cell into normalized words
  const getTokens = (h: string): string[] => {
    return h
      .toLowerCase()
      .split(/[\s_.\-()/[\]\\,:#]+/)
      .filter(t => t.length > 0);
  };

  // Helper to normalize header cell without symbols/spaces
  const getNorm = (h: string): string => {
    return h.toLowerCase().replace(/[\s_.\-()/[\]\\,:#]/g, '');
  };

  const headerTokens = headerRow.map(getTokens);
  const headerNorms = headerRow.map(getNorm);

  // Column matching logic with strict precision to prevent false positive substring collisions (e.g. 'as' inside 'class')
  const idxNo = headerRow.findIndex((_, i) => {
    const tokens = headerTokens[i];
    const norm = headerNorms[i];
    return (
      tokens.includes('no') ||
      tokens.includes('number') ||
      norm === '#' ||
      norm.includes('เลขที่') ||
      norm.includes('ลำดับ')
    );
  });

  const idxId = headerRow.findIndex((_, i) => {
    const tokens = headerTokens[i];
    const norm = headerNorms[i];
    return (
      tokens.includes('studentid') ||
      tokens.includes('id') ||
      norm.includes('studentid') ||
      norm.includes('student_id') ||
      norm.includes('รหัสนักศึกษา') ||
      norm.includes('รหัสประจำตัว') ||
      norm === 'id' ||
      norm.includes('รหัส')
    );
  });

  const idxName = headerRow.findIndex((_, i) => {
    const tokens = headerTokens[i];
    const norm = headerNorms[i];
    return (
      tokens.includes('fullname') ||
      tokens.includes('name') ||
      norm.includes('ชื่อ-นามสกุล') ||
      norm.includes('ชื่อนามสกุล') ||
      norm.includes('ชื่อ') ||
      norm.includes('fullname')
    );
  });

  const idxSec = headerRow.findIndex((_, i) => {
    const tokens = headerTokens[i];
    const norm = headerNorms[i];
    return (
      tokens.includes('sec') ||
      tokens.includes('section') ||
      norm.includes('กลุ่มเรียน') ||
      norm.includes('กลุ่ม') ||
      norm.includes('section')
    );
  });

  const idxEmail = headerRow.findIndex((_, i) => {
    const tokens = headerTokens[i];
    const norm = headerNorms[i];
    return (
      tokens.includes('email') ||
      tokens.includes('mail') ||
      norm.includes('อีเมล') ||
      norm.includes('email')
    );
  });

  // ATTEN (คะแนนเข้าเรียน เต็ม 10)
  const idxAtten = headerRow.findIndex((_, i) => {
    const tokens = headerTokens[i];
    const norm = headerNorms[i];
    return (
      tokens.includes('atten') ||
      tokens.includes('attend') ||
      tokens.includes('attendance') ||
      norm.includes('atten') ||
      norm.includes('attend') ||
      norm.includes('attendance') ||
      norm.includes('เข้าเรียน')
    );
  });

  // CA: Class Activity (คะแนนงานในชั้นเรียน/กิจกรรมในชั้นเรียน เต็ม 10)
  // Strictly matches Class Activity / CA / คะแนนงานในชั้นเรียน / กิจกรรมในชั้นเรียน
  const idxCa = headerRow.findIndex((_, i) => {
    const tokens = headerTokens[i];
    const norm = headerNorms[i];

    // Must NOT be confused with Assignment
    if (norm.includes('assign') || norm.includes('การบ้าน') || norm.includes('ชิ้นงาน')) {
      return false;
    }

    return (
      tokens.includes('ca') ||
      tokens.includes('activity') ||
      tokens.includes('classactivity') ||
      tokens.includes('classwork') ||
      norm === 'ca' ||
      /^ca\d*$/.test(norm) ||
      norm.includes('classactivity') ||
      norm.includes('classwork') ||
      norm.includes('activity') ||
      norm.includes('งานในชั้นเรียน') ||
      norm.includes('กิจกรรมในชั้นเรียน') ||
      norm.includes('กิจกรรม')
    );
  });

  // AS: Assignment (คะแนนการบ้าน/ชิ้นงาน/งานที่ได้รับมอบหมาย เต็ม 20)
  // Strictly looks for 'assign', 'assignment', 'as', 'homework', 'การบ้าน', 'ชิ้นงาน'
  // And does NOT match 'class' or fallback to general 'คะแนนเก็บ'
  const idxAs = headerRow.findIndex((_, i) => {
    const tokens = headerTokens[i];
    const norm = headerNorms[i];

    // Must NOT match Class Activity or column containing 'class'/'activity' unless 'assign' is explicitly present
    if (norm.includes('class') && !norm.includes('assign')) {
      return false;
    }
    if (norm.includes('activity') && !norm.includes('assign')) {
      return false;
    }

    return (
      tokens.includes('as') ||
      tokens.includes('assign') ||
      tokens.includes('assignment') ||
      tokens.includes('assignments') ||
      tokens.includes('homework') ||
      tokens.includes('hw') ||
      norm === 'as' ||
      /^as\d*$/.test(norm) ||
      norm.includes('assign') ||
      norm.includes('assignment') ||
      norm.includes('homework') ||
      norm.includes('การบ้าน') ||
      norm.includes('ชิ้นงาน') ||
      norm.includes('งานที่ได้รับมอบหมาย')
    );
  });

  // MID: Midterm (คะแนนสอบกลางภาค เต็ม 25)
  const idxMid = headerRow.findIndex((_, i) => {
    const tokens = headerTokens[i];
    const norm = headerNorms[i];

    // Exclude student ID or other columns
    if (norm.includes('studentid') || norm.includes('student')) {
      return false;
    }

    return (
      tokens.includes('mid') ||
      tokens.includes('midterm') ||
      norm === 'mid' ||
      /^mid\d*$/.test(norm) ||
      norm.includes('midterm') ||
      norm.includes('สอบกลางภาค') ||
      norm.includes('กลางภาค')
    );
  });

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
