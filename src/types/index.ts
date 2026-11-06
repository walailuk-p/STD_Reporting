export interface ScoreBreakdown {
  ATTEN?: number | string; // เข้าเรียน (เต็ม 10)
  CA?: number | string;    // งานในชั้นเรียน / ClassActivity (เต็ม 10)
  AS?: number | string;    // การบ้าน / Assignment (เต็ม 20)
  MID?: number | string;   // สอบกลางภาค / Midterm (เต็ม 25)
  TOTAL?: number | string; // คะแนนรวม (เต็ม 65)
  [key: string]: number | string | undefined;
}

export interface StudentScoreItem {
  no: number | string;
  studentId: string;
  name: string;
  sec: string;
  email?: string;
  scores: ScoreBreakdown;
  updatedAt?: string;
  hasPin?: boolean;
  failedAttempts?: number;
  isLocked?: boolean;
}

export interface Course {
  id: string;
  courseCode: string;
  courseName: string;
  semester: string;
  sections: string[];
  scoreColumns: {
    key: string;
    label: string;
    maxScore: number;
  }[];
  isPublished: boolean;
  publishedSections: string[];
  instructorUid: string;
  instructorEmail: string;
  studentCount: number;
  updatedAt: string;
  createdAt: string;
}

export interface EnrolledCourseScore {
  courseId: string;
  courseCode: string;
  courseName: string;
  semester: string;
  sec: string;
  email?: string;
  no: number | string;
  name: string;
  scores: ScoreBreakdown;
  isPublished: boolean;
  updatedAt: string;
}

export interface StudentRecord {
  studentId: string;
  name: string;
  email?: string;
  pinHash?: string;
  salt?: string;
  failedAttempts?: number;
  lockedUntil?: number;
  enrolledCourses?: {
    [courseId: string]: EnrolledCourseScore;
  };
  updatedAt: string;
}

export const DEFAULT_SCORE_COLUMNS = [
  { key: 'ATTEN', label: 'เข้าเรียน (ATTEND)', maxScore: 10 },
  { key: 'CA', label: 'งานในชั้นเรียน (CLASS ACTIVITY)', maxScore: 10 },
  { key: 'AS', label: 'การบ้าน (ASSIGNMENT)', maxScore: 20 },
  { key: 'MID', label: 'สอบกลางภาค (MIDTERM)', maxScore: 25 },
  { key: 'TOTAL', label: 'รวม (TOTAL)', maxScore: 65 },
];
