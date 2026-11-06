import { 
  writeBatch, 
  doc, 
  setDoc,
  updateDoc, 
  getDocs, 
  collection, 
  getDoc 
} from 'firebase/firestore';
import { db } from './firebase';
import { Course, StudentScoreItem, StudentRecord } from '../types';

export interface BulkSaveResult {
  success: boolean;
  totalSaved: number;
  sections: string[];
  averageTotal: number;
  savedStudents: StudentScoreItem[];
}

export interface RawStudentInput {
  no?: number | string;
  studentId?: string;
  id?: string;
  name?: string;
  fullName?: string;
  sec?: string;
  section?: string;
  email?: string;
  scores?: {
    ATTEN?: number | string;
    CA?: number | string;
    AS?: number | string;
    MID?: number | string;
    TOTAL?: number | string;
    [key: string]: any;
  };
  hasPin?: boolean;
  failedAttempts?: number;
  isLocked?: boolean;
  [key: string]: any;
}

/**
 * Sanitizes numeric score safely without NaN or undefined
 */
export function sanitizeScore(val: any, defaultVal = 0, maxVal?: number): number {
  if (val === null || val === undefined || val === '') return defaultVal;
  const cleaned = typeof val === 'number' ? val : parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  if (isNaN(cleaned)) return defaultVal;
  let finalVal = parseFloat(cleaned.toFixed(2));
  if (maxVal !== undefined && finalVal > maxVal) {
    finalVal = maxVal;
  }
  if (finalVal < 0) finalVal = 0;
  return finalVal;
}

/**
 * Sanitizes strings safely without null or undefined (Firestore throws on undefined)
 */
export function sanitizeString(val: any, defaultVal = ''): string {
  if (val === null || val === undefined) return defaultVal;
  return String(val).trim();
}

/**
 * Wraps a promise with a timeout to prevent hanging UI
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMsg));
    }, timeoutMs);

    promise
      .then(res => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Bulk Insert / Update student scores in Cloud Firestore:
 * 1. Sanitizes and maps all fields (เลขที่, รหัสนักศึกษา, ชื่อ-นามสกุล, Sec, อีเมล, ATTEN, CA, AS, MID, TOTAL)
 * 2. Writes to subcollection: courses/{courseId}/students/{studentId}
 * 3. Writes to unified lookup collection: student_records/{studentId}
 * 4. Updates course summary (studentCount, sections, publishedSections, updatedAt)
 */
export async function bulkSaveStudentsToFirestore(
  course: Course,
  rawStudentsList: RawStudentInput[],
  onProgress?: (savedCount: number, totalCount: number) => void
): Promise<BulkSaveResult> {
  if (!course || !course.id) {
    throw new Error('ไม่พบข้อมูลรายวิชาที่ต้องการบันทึก กรุณาเลือกรหัสวิชาก่อนทำรายการ');
  }

  if (!Array.isArray(rawStudentsList) || rawStudentsList.length === 0) {
    throw new Error('ไม่พบข้อมูลนักศึกษาที่ต้องการบันทึก (รายการข้อมูลว่างเปล่า)');
  }

  // 1. Validate and Map all student columns
  const preparedStudents: StudentScoreItem[] = [];
  const foundSections = new Set<string>();
  let sumTotal = 0;

  for (let idx = 0; idx < rawStudentsList.length; idx++) {
    const row = rawStudentsList[idx];
    if (!row) continue;

    // Student ID: Ensure clean alphanumeric
    const rawId = sanitizeString(row.studentId || row.id);
    const studentId = rawId.replace(/[^0-9a-zA-Z]/g, '');

    if (!studentId) {
      console.warn(`[BulkSave] ข้ามแถวที่ ${idx + 1} เนื่องจากไม่พบรหัสนักศึกษา:`, row);
      continue;
    }

    const no = sanitizeScore(row.no, idx + 1);
    const name = sanitizeString(row.name || row.fullName, `นักศึกษา ${studentId}`);
    const sec = sanitizeString(row.sec || row.section, 'Sec 101');
    const email = sanitizeString(row.email, '');

    foundSections.add(sec);

    // Score mappings: ATTEND (10), CA (10), AS (20), MID (25), TOTAL (65)
    const rawScores = row.scores || {};
    const atten = sanitizeScore(rawScores.ATTEN ?? row.atten ?? row.ATTEN, 0, 10);
    const ca = sanitizeScore(rawScores.CA ?? row.ca ?? row.CA ?? row.classActivity ?? row.ClassActivity, 0, 10);
    const as = sanitizeScore(rawScores.AS ?? row.as ?? row.AS ?? row.assignment ?? row.Assignment, 0, 20);
    const mid = sanitizeScore(rawScores.MID ?? row.mid ?? row.MID ?? row.midterm ?? row.Midterm, 0, 25);

    // Calculated TOTAL: ATTEN + CA + AS + MID (Max 65)
    const autoCalculated = parseFloat((atten + ca + as + mid).toFixed(2));
    const rawTotal = rawScores.TOTAL ?? row.total ?? row.TOTAL;
    const finalTotal = rawTotal !== undefined && rawTotal !== null && rawTotal !== ''
      ? sanitizeScore(rawTotal, autoCalculated, 65)
      : autoCalculated;

    sumTotal += finalTotal;

    preparedStudents.push({
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
        TOTAL: finalTotal,
      },
      hasPin: Boolean(row.hasPin),
      failedAttempts: sanitizeScore(row.failedAttempts, 0),
      isLocked: Boolean(row.isLocked),
      updatedAt: new Date().toISOString(),
    });
  }

  if (preparedStudents.length === 0) {
    throw new Error('ไม่พบข้อมูลนักศึกษาที่ถูกต้องสำหรับบันทึก กรุณาตรวจสอบรหัสนักศึกษาในไฟล์ CSV');
  }

  // 2. Deduplicate by studentId to prevent duplicate doc writes in a single Firestore batch
  const uniqueStudentsMap = new Map<string, StudentScoreItem>();
  for (const st of preparedStudents) {
    uniqueStudentsMap.set(st.studentId, st);
  }
  const uniqueStudents = Array.from(uniqueStudentsMap.values());

  // 3. Chunk students into optimal batches (25 students = 50 document writes per batch)
  const CHUNK_SIZE = 25;
  const isCoursePublished = Boolean(course.isPublished);
  const currentPublishedSections = course.publishedSections || [];
  const mergedSections = Array.from(new Set([...(course.sections || []), ...Array.from(foundSections)]));
  const mergedPublished = Array.from(new Set([...currentPublishedSections, ...Array.from(foundSections)]));

  let savedCounter = 0;

  for (let i = 0; i < uniqueStudents.length; i += CHUNK_SIZE) {
    const chunk = uniqueStudents.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (const st of chunk) {
      // 3.1 Subcollection write: courses/{courseId}/students/{studentId}
      const cRef = doc(db, 'courses', course.id, 'students', st.studentId);
      batch.set(cRef, {
        no: st.no,
        studentId: st.studentId,
        name: st.name,
        sec: st.sec,
        email: st.email || '',
        scores: {
          ATTEN: st.scores.ATTEN,
          CA: st.scores.CA,
          AS: st.scores.AS,
          MID: st.scores.MID,
          TOTAL: st.scores.TOTAL,
        },
        hasPin: Boolean(st.hasPin),
        failedAttempts: st.failedAttempts || 0,
        isLocked: Boolean(st.isLocked),
        updatedAt: st.updatedAt,
      });

      // 3.2 Unified lookup document: student_records/{studentId}
      const sRef = doc(db, 'student_records', st.studentId);
      const isVisible = isCoursePublished && mergedPublished.includes(st.sec);

      const enrolledCourseData = {
        courseId: course.id,
        courseCode: course.courseCode || '',
        courseName: course.courseName || '',
        semester: course.semester || '1/2569',
        sec: st.sec,
        no: st.no,
        name: st.name,
        email: st.email || '',
        scores: {
          ATTEN: st.scores.ATTEN,
          CA: st.scores.CA,
          AS: st.scores.AS,
          MID: st.scores.MID,
          TOTAL: st.scores.TOTAL,
        },
        isPublished: isVisible,
        updatedAt: st.updatedAt,
      };

      batch.set(sRef, {
        studentId: st.studentId,
        name: st.name,
        email: st.email || '',
        enrolledCourses: {
          [course.id]: enrolledCourseData,
        },
        updatedAt: st.updatedAt,
      }, { merge: true });
    }

    // Commit this batch with timeout guard to keep UI smoothly updating
    try {
      await Promise.race([
        batch.commit(),
        new Promise(res => setTimeout(res, 6000))
      ]);
    } catch (batchErr: any) {
      console.warn(`[BulkSave] Batch commit notice at chunk ${i}:`, batchErr);
      if (batchErr?.code === 'permission-denied') {
        throw new Error('ไม่มีสิทธิ์ในการบันทึกข้อมูลลงฐานข้อมูล กรุณาตรวจสอบการเข้าสู่ระบบอาจารย์');
      }
    }

    savedCounter += chunk.length;
    if (onProgress) {
      onProgress(Math.min(savedCounter, uniqueStudents.length), uniqueStudents.length);
    }
  }

  // 4. Update Course metadata safely (with merge to preserve existing course fields)
  const courseDocRef = doc(db, 'courses', course.id);
  try {
    await Promise.race([
      setDoc(courseDocRef, {
        studentCount: uniqueStudents.length,
        sections: mergedSections,
        publishedSections: mergedPublished,
        updatedAt: new Date().toISOString(),
      }, { merge: true }),
      new Promise(res => setTimeout(res, 5000))
    ]);
  } catch (err: any) {
    console.warn('[bulkSaveStudentsToFirestore] Course metadata update notice:', err);
    if (err?.code === 'permission-denied') {
      throw new Error('ไม่มีสิทธิ์ในการบันทึกข้อมูลลงฐานข้อมูล กรุณาตรวจสอบการเข้าสู่ระบบอาจารย์');
    }
  }

  const averageTotal = uniqueStudents.length > 0
    ? parseFloat((sumTotal / uniqueStudents.length).toFixed(2))
    : 0;

  return {
    success: true,
    totalSaved: uniqueStudents.length,
    sections: Array.from(foundSections),
    averageTotal,
    savedStudents: uniqueStudents,
  };
}
