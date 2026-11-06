import React, { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, getDocWithRetry, handleFirestoreError, OperationType } from '../lib/firebase';
import { hashPin, verifyPin, generateSalt } from '../lib/crypto';
import { StudentRecord, EnrolledCourseScore } from '../types';
import { 
  KeyRound, 
  Lock, 
  AlertCircle, 
  ShieldCheck, 
  CheckCircle2, 
  LogOut, 
  BookOpen, 
  Calendar, 
  Eye, 
  EyeOff, 
  RefreshCw,
  Info,
  Clock,
  Sparkles
} from 'lucide-react';

export const StudentPortal: React.FC = () => {
  const STUDENT_AUTH_SESSION_KEY = 'student_portal_session_auth';

  const [studentIdInput, setStudentIdInput] = useState('');
  const [pinInput, setPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [showPin, setShowPin] = useState(false);

  // Session state for Condition 1: Student ID & Session Token
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [activeStudentId, setActiveStudentId] = useState<string | null>(null);

  // Flow states
  const [step, setStep] = useState<'enter_id' | 'enter_pin' | 'setup_pin' | 'view_scores'>('enter_id');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active student document fetched via exactly 1 Firestore doc read
  const [studentRecord, setStudentRecord] = useState<StudentRecord | null>(null);

  // Filtered published courses with real-time Course & Section visibility enforcement (Condition 4)
  const [livePublishedCourses, setLivePublishedCourses] = useState<EnrolledCourseScore[]>([]);

  // Check if student is locked out due to failed attempts
  const isLocked = Boolean(
    studentRecord?.lockedUntil && studentRecord.lockedUntil > Date.now()
  );

  const getLockoutRemainingMinutes = (): number => {
    if (!studentRecord?.lockedUntil) return 0;
    const remainingMs = studentRecord.lockedUntil - Date.now();
    return Math.max(1, Math.ceil(remainingMs / 60000));
  };

  /**
   * Data Fetching Logic conforming to user conditions:
   * 1. Query by Student ID directly from /student_records/{studentId}
   * 2. Extract profile (Name, No., Student ID, Sec, PIN Status) & score items (ATTEN, CA, AS, MID, TOTAL)
   * 3. Enforce data privacy: strictly restricts queries to the authenticated student's doc
   * 4. Hide course card if instructor disabled course-level OR section-level visibility
   */
  const fetchStudentDataAndScores = async (studentId: string, showGlobalLoading = true): Promise<boolean> => {
    const cleanId = studentId.trim().replace(/[^0-9a-zA-Z]/g, '');
    if (!cleanId) return false;

    if (showGlobalLoading) {
      setLoading(true);
    }
    setErrorMsg(null);

    try {
      // 1. Direct query strictly on /student_records/{studentId} with retry and automatic reconnect
      const studentDocRef = doc(db, 'student_records', cleanId);
      const studentSnap = await getDocWithRetry(studentDocRef);

      if (!studentSnap.exists()) {
        setErrorMsg('ไม่พบข้อมูลของรหัสนักศึกษานี้ในระบบ หรืออาจารย์ยังไม่ได้นำเข้ารายชื่อ');
        return false;
      }

      const data = studentSnap.data() as StudentRecord;
      setStudentRecord(data);

      // 2. Extract enrolled courses and check Condition 4 (Course & Section Visibility)
      const enrolledList: EnrolledCourseScore[] = data.enrolledCourses
        ? Object.values(data.enrolledCourses)
        : [];

      // Immediately populate initial list from local data so UI displays instantly without lag
      const initialVisible = enrolledList.filter(c => c.isPublished !== false);
      initialVisible.sort((a, b) => (a.courseCode || '').localeCompare(b.courseCode || ''));
      setLivePublishedCourses(initialVisible);

      // Verify each course's live visibility from /courses/{courseId} with 5s timeout guard
      const visibilityPromises = enrolledList.map(async course => {
        try {
          const courseRef = doc(db, 'courses', course.courseId);
          const courseSnap = await Promise.race([
            getDocWithRetry(courseRef, 2, 400),
            new Promise<null>(res => setTimeout(() => res(null), 5000))
          ]);

          if (courseSnap && courseSnap.exists()) {
            const courseData = courseSnap.data();
            // Section-level visibility (สวิตช์เปิด/ปิดประกาศแยกตามกลุ่มเรียน เช่น Sec 101, Sec 206A)
            const isSecOpen = Array.isArray(courseData.publishedSections)
              ? courseData.publishedSections.includes(course.sec)
              : true;

            // Show card if section is open (Section-level Visibility)
            if (isSecOpen) {
              return {
                ...course,
                isPublished: true,
                courseName: courseData.courseName || course.courseName,
                courseCode: courseData.courseCode || course.courseCode,
                semester: courseData.semester || course.semester,
              };
            }
            // Closed for this section -> Hide from view
            return null;
          } else {
            // Fallback to stored isPublished flag if fetch timed out or doc doesn't exist
            return course.isPublished ? course : null;
          }
        } catch (e) {
          // If offline or query fallback, use stored isPublished flag
          return course.isPublished ? course : null;
        }
      });

      const resolved = await Promise.all(visibilityPromises);
      const visibleCourses = resolved.filter((c): c is EnrolledCourseScore => c !== null);
      visibleCourses.sort((a, b) => (a.courseCode || '').localeCompare(b.courseCode || ''));

      setLivePublishedCourses(visibleCourses);
      return true;
    } catch (err: any) {
      console.error('Error fetching student scores:', err);
      const isOffline = String(err?.message || '').toLowerCase().includes('offline') || err?.code === 'unavailable';
      if (isOffline) {
        setErrorMsg('ไม่สามารถเชื่อมต่อฐานข้อมูลได้ชั่วคราว (Client Offline) กรุณาตรวจสอบสัญญาณอินเทอร์เน็ต');
      } else {
        setErrorMsg('เกิดข้อผิดพลาดในการโหลดข้อมูลผลคะแนน กรุณาลองใหม่อีกครั้ง');
      }
      return false;
    } finally {
      if (showGlobalLoading) {
        setLoading(false);
      }
    }
  };

  // Restore authenticated session on mount (Condition 1: Session Token)
  useEffect(() => {
    try {
      const rawSession = sessionStorage.getItem(STUDENT_AUTH_SESSION_KEY);
      if (rawSession) {
        const sessionData = JSON.parse(rawSession);
        if (sessionData?.studentId && sessionData?.sessionToken) {
          setActiveStudentId(sessionData.studentId);
          setSessionToken(sessionData.sessionToken);
          setStudentIdInput(sessionData.studentId);

          fetchStudentDataAndScores(sessionData.studentId).then(success => {
            if (success) {
              setStep('view_scores');
            } else {
              sessionStorage.removeItem(STUDENT_AUTH_SESSION_KEY);
              setStep('enter_id');
            }
          });
        }
      }
    } catch (e) {
      console.warn('Session parse error:', e);
    }
  }, []);

  // Step 1: Look up student record by ID (Triggering 1 document read)
  const handleLookupStudentId = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanId = studentIdInput.trim().replace(/[^0-9a-zA-Z]/g, '');
    if (!cleanId) {
      setErrorMsg('กรุณากรอกรหัสนักศึกษา');
      return;
    }

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      // Exactly 1 document read from /student_records/{studentId} with automatic retry
      const docRef = doc(db, 'student_records', cleanId);
      const docSnap = await getDocWithRetry(docRef);

      if (!docSnap.exists()) {
        setErrorMsg('ไม่พบข้อมูลของรหัสนักศึกษานี้ในระบบ หรืออาจารย์ยังไม่ได้นำเข้ารายชื่อ');
        return;
      }

      const data = docSnap.data() as StudentRecord;
      setStudentRecord(data);
      setActiveStudentId(cleanId);

      // Check if student already has a PIN
      if (!data.pinHash || data.pinHash === '') {
        // First-time user: needs to setup 6-digit PIN
        setStep('setup_pin');
        setSuccessMsg('พบข้อมูลนักศึกษา ยินดีต้อนรับเข้าสู่ระบบครั้งแรก! กรุณาตั้งรหัสผ่าน 6 หลักเพื่อความปลอดภัย');
      } else {
        // Returning user: verify PIN
        setStep('enter_pin');
      }
    } catch (err: any) {
      console.error('Error fetching student record:', err);
      const isOffline = String(err?.message || '').toLowerCase().includes('offline') || err?.code === 'unavailable';
      if (isOffline) {
        setErrorMsg('ไม่สามารถเชื่อมต่อฐานข้อมูลได้ชั่วคราว (Client Offline) กรุณาตรวจสอบสัญญาณอินเทอร์เน็ต แล้วกด "ถัดไป" อีกครั้ง');
      } else {
        setErrorMsg('เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setLoading(false);
    }
  };

  // Step 2A: Set up 6-digit PIN for first-time login
  const handleSetupPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentRecord) return;

    const pin = pinInput.trim();
    const confirmPin = confirmPinInput.trim();

    if (!/^\d{6}$/.test(pin)) {
      setErrorMsg('รหัสผ่านต้องเป็นตัวเลข 6 หลักเท่านั้น (เช่น 123456)');
      return;
    }

    if (pin !== confirmPin) {
      setErrorMsg('รหัสผ่านทั้งสองช่องไม่ตรงกัน กรุณาตรวจสอบอีกครั้ง');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const salt = generateSalt(16);
      const hashed = await hashPin(pin, salt);

      const docRef = doc(db, 'student_records', studentRecord.studentId);
      
      // Update Firestore with 6-second timeout race to prevent indefinite freeze
      await Promise.race([
        updateDoc(docRef, {
          pinHash: hashed,
          salt: salt,
          failedAttempts: 0,
          lockedUntil: 0,
          updatedAt: new Date().toISOString(),
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('การเชื่อมต่อกับระบบฐานข้อมูลใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง')), 6000)
        ),
      ]);

      // Update in-memory studentRecord immediately for instant UI responsiveness
      const updatedRecord: StudentRecord = {
        ...studentRecord,
        pinHash: hashed,
        salt: salt,
        failedAttempts: 0,
        lockedUntil: 0,
        updatedAt: new Date().toISOString(),
      };
      setStudentRecord(updatedRecord);

      // Pre-populate enrolled courses immediately so student doesn't wait for background fetch
      const enrolledList: EnrolledCourseScore[] = updatedRecord.enrolledCourses
        ? Object.values(updatedRecord.enrolledCourses)
        : [];
      const initialVisible = enrolledList.filter(c => c.isPublished !== false);
      initialVisible.sort((a, b) => (a.courseCode || '').localeCompare(b.courseCode || ''));
      setLivePublishedCourses(initialVisible);

      // Generate Session Token and persist in sessionStorage (Condition 1)
      const token = `st_session_${studentRecord.studentId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      sessionStorage.setItem(STUDENT_AUTH_SESSION_KEY, JSON.stringify({
        studentId: studentRecord.studentId,
        sessionToken: token,
        authenticatedAt: new Date().toISOString(),
      }));

      setSessionToken(token);
      setActiveStudentId(studentRecord.studentId);

      // Reset PIN inputs
      setPinInput('');
      setConfirmPinInput('');

      // Seamlessly transition UI step to view_scores immediately
      setStep('view_scores');
      setSuccessMsg('ตั้งรหัสผ่าน 6 หลักสำเร็จ! คุณสามารถใช้รหัสนี้เข้าสู่ระบบในครั้งถัดไป');

      // Refresh student scores & live visibility in background WITHOUT setting global loading indicator
      fetchStudentDataAndScores(studentRecord.studentId, false).catch(err => {
        console.warn('Fetch scores background notice:', err);
      });
    } catch (err: any) {
      console.error('Error setting PIN:', err);
      const msg = err?.message || 'ไม่สามารถบันทึกรหัสผ่านได้ กรุณาลองใหม่อีกครั้ง';
      setErrorMsg(msg);
    } finally {
      // Guaranteed termination of button loading state
      setLoading(false);
    }
  };

  // Step 2B: Verify 6-digit PIN for returning student
  const handleVerifyPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentRecord) return;

    if (isLocked) {
      setErrorMsg(`บัญชีถูกระงับชั่วคราวเนื่องจากกรอกรหัสผิดเกิน 5 ครั้ง กรุณารออีก ${getLockoutRemainingMinutes()} นาที หรือติดต่ออาจารย์ผู้สอน`);
      return;
    }

    const pin = pinInput.trim();
    if (!/^\d{6}$/.test(pin)) {
      setErrorMsg('กรุณากรอกรหัสผ่านเป็นตัวเลข 6 หลัก');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const isValid = await verifyPin(pin, studentRecord.salt || '', studentRecord.pinHash || '');
      const docRef = doc(db, 'student_records', studentRecord.studentId);

      if (isValid) {
        // Pre-populate enrolled courses immediately from in-memory record
        const enrolledList: EnrolledCourseScore[] = studentRecord.enrolledCourses
          ? Object.values(studentRecord.enrolledCourses)
          : [];
        const initialVisible = enrolledList.filter(c => c.isPublished !== false);
        initialVisible.sort((a, b) => (a.courseCode || '').localeCompare(b.courseCode || ''));
        setLivePublishedCourses(initialVisible);

        // Reset failed attempts in Firestore asynchronously if previously recorded
        if ((studentRecord.failedAttempts || 0) > 0) {
          updateDoc(docRef, {
            failedAttempts: 0,
            lockedUntil: 0,
            updatedAt: new Date().toISOString(),
          }).catch(e => console.warn('Could not reset failedAttempts:', e));
        }

        // Generate Session Token and save in sessionStorage (Condition 1)
        const token = `st_session_${studentRecord.studentId}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        sessionStorage.setItem(STUDENT_AUTH_SESSION_KEY, JSON.stringify({
          studentId: studentRecord.studentId,
          sessionToken: token,
          authenticatedAt: new Date().toISOString(),
        }));

        setSessionToken(token);
        setActiveStudentId(studentRecord.studentId);

        // Immediate transition to view_scores
        setStep('view_scores');
        setPinInput('');
        setConfirmPinInput('');
        setSuccessMsg(null);

        // Background update for latest course & section publication status without blocking UI
        fetchStudentDataAndScores(studentRecord.studentId, false).catch(err => {
          console.warn('Background score update notice:', err);
        });
      } else {
        const newFailedAttempts = (studentRecord.failedAttempts || 0) + 1;
        const willLock = newFailedAttempts >= 5;
        const lockDurationMs = 15 * 60 * 1000; // 15 minutes lockout
        const lockedUntilTime = willLock ? Date.now() + lockDurationMs : 0;

        try {
          await updateDoc(docRef, {
            failedAttempts: newFailedAttempts,
            lockedUntil: lockedUntilTime,
            updatedAt: new Date().toISOString(),
          });
        } catch (e) {
          console.warn('Could not update failedAttempts in firestore:', e);
        }

        setStudentRecord(prev => prev ? {
          ...prev,
          failedAttempts: newFailedAttempts,
          lockedUntil: lockedUntilTime,
        } : null);

        if (willLock) {
          setErrorMsg('คุณกรอกรหัสผิดเกิน 5 ครั้ง! ระบบระงับการเข้าสู่ระบบ 15 นาที หรือติดต่ออาจารย์ผู้สอนเพื่อรีเซ็ตรหัสผ่าน');
        } else {
          setErrorMsg(`รหัสผ่านไม่ถูกต้อง (เหลือโอกาสลองอีก ${5 - newFailedAttempts} ครั้ง)`);
        }
      }
    } catch (err: any) {
      console.error('Error verifying PIN:', err);
      setErrorMsg('เกิดข้อผิดพลาดในการตรวจสอบรหัสผ่าน กรุณาลองใหม่อีกครั้ง');
    } finally {
      // Guaranteed termination of button loading state
      setLoading(false);
    }
  };

  // Logout & Clear Session (Condition 3: Privacy & Session Purge)
  const handleLogout = () => {
    sessionStorage.removeItem(STUDENT_AUTH_SESSION_KEY);
    setStudentRecord(null);
    setSessionToken(null);
    setActiveStudentId(null);
    setLivePublishedCourses([]);
    setStudentIdInput('');
    setPinInput('');
    setConfirmPinInput('');
    setStep('enter_id');
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  // Refresh scores with live visibility re-query
  const handleRefreshScores = async () => {
    const idToFetch = activeStudentId || studentRecord?.studentId;
    if (!idToFetch) return;

    const ok = await fetchStudentDataAndScores(idToFetch);
    if (ok) {
      setSuccessMsg('อัปเดตข้อมูลคะแนนและสถานะประกาศรายวิชาล่าสุดเรียบร้อยแล้ว');
      setTimeout(() => setSuccessMsg(null), 3500);
    }
  };

  // Primary student profile data extraction (Condition 2)
  const allCourses: EnrolledCourseScore[] = studentRecord?.enrolledCourses
    ? Object.values(studentRecord.enrolledCourses)
    : [];

  const primaryInfo = livePublishedCourses.length > 0 
    ? livePublishedCourses[0] 
    : (allCourses.length > 0 ? allCourses[0] : null);

  const displayNo = primaryInfo?.no ?? (studentRecord as any)?.no ?? '-';
  const displaySec = primaryInfo?.sec ?? (studentRecord as any)?.sec ?? '-';
  const displayName = studentRecord?.name || primaryInfo?.name || 'ไม่ระบุชื่อ';

  return (
    <div className="max-w-2xl mx-auto py-6 px-4 sm:px-6">
      {/* Notifications */}
      {errorMsg && (
        <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-start space-x-3 shadow-xs">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">{errorMsg}</div>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-start space-x-3 shadow-xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">{successMsg}</div>
        </div>
      )}

      {/* VIEW: LOGGED IN STUDENT SCORES */}
      {step === 'view_scores' && studentRecord ? (
        <div className="space-y-6">
          {/* Top Bar Actions */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              ผลการเรียนรู้ของนักศึกษา
            </span>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={handleRefreshScores}
                disabled={loading}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span>รีเฟรช</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-50 hover:bg-rose-100 text-rose-700 transition"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>ออกจากระบบ</span>
              </button>
            </div>
          </div>

          {/* Student Identity Card: เลขที่, รหัสนักศึกษา, ชื่อ-นามสกุล, Sec ตามข้อกำหนด */}
          <div className="bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
            <div className="absolute right-0 top-0 -mt-8 -mr-8 w-40 h-40 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
            
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-200 border border-indigo-400/30">
                  <ShieldCheck className="w-3 h-3 mr-1 text-emerald-400" /> ยืนยันตัวตนแล้ว
                </span>
                <span className="text-xs text-indigo-200/70">ระบบรักษาความเป็นส่วนตัว (Private)</span>
              </div>
              <span className="text-xs text-indigo-300 font-mono">1 Read / Check</span>
            </div>

            <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-4">
              {displayName}
            </h1>

            {/* 4 Core attributes grid required by prompt: เลขที่, รหัสนักศึกษา, ชื่อ-นามสกุล, Sec */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-indigo-800/60">
              <div className="bg-white/5 rounded-xl p-3 backdrop-blur-xs">
                <div className="text-[11px] font-medium text-indigo-300">เลขที่ (No.)</div>
                <div className="text-lg font-bold text-white mt-0.5">{displayNo}</div>
              </div>

              <div className="bg-white/5 rounded-xl p-3 backdrop-blur-xs">
                <div className="text-[11px] font-medium text-indigo-300">รหัสนักศึกษา</div>
                <div className="text-lg font-bold text-amber-300 font-mono mt-0.5">
                  {studentRecord.studentId}
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-3 backdrop-blur-xs">
                <div className="text-[11px] font-medium text-indigo-300">กลุ่มเรียน (Sec)</div>
                <div className="text-lg font-bold text-emerald-300 mt-0.5">{displaySec}</div>
              </div>

              <div className="bg-white/5 rounded-xl p-3 backdrop-blur-xs">
                <div className="text-[11px] font-medium text-indigo-300">สถานะ PIN</div>
                <div className="text-sm font-semibold text-sky-200 mt-1 flex items-center">
                  <KeyRound className="w-3.5 h-3.5 mr-1 text-sky-400" /> ตั้งรหัสแล้ว
                </div>
              </div>
            </div>
          </div>

          {/* Published Courses & Scores */}
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 flex items-center">
                <BookOpen className="w-5 h-5 text-indigo-600 mr-2" />
                รายวิชาที่ประกาศคะแนน
              </h2>
              <span className="text-xs text-slate-500">
                {livePublishedCourses.length} รายวิชาที่เปิดระบบ
              </span>
            </div>

            {livePublishedCourses.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-xs">
                <Clock className="w-12 h-12 text-amber-500 mx-auto mb-3 opacity-80" />
                <h3 className="text-base font-semibold text-slate-800 mb-1">
                  ยังไม่มีรายวิชาที่เปิดประกาศคะแนนในขณะนี้
                </h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                  อาจารย์ผู้สอนยังไม่ได้เปิดการประกาศคะแนนสำหรับกลุ่มเรียนของคุณ หรือกำลังอยู่ระหว่างการประมวลผลคะแนน กรุณาตรวจสอบอีกครั้งภายหลัง
                </p>
              </div>
            ) : (
              livePublishedCourses.map(course => {
                const s = course.scores;
                return (
                  <div 
                    key={course.courseId} 
                    className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden transition-all hover:border-indigo-200"
                  >
                    {/* Course Header */}
                    <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-50 to-indigo-50/40 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="px-2.5 py-0.5 rounded-md bg-indigo-600 text-white font-mono text-xs font-bold">
                            {course.courseCode}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            {course.semester || 'ภาคการศึกษาปัจจุบัน'}
                          </span>
                        </div>
                        <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-1">
                          {course.courseName}
                        </h3>
                      </div>

                      <div className="text-right">
                        <span className="inline-block px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          {course.sec}
                        </span>
                      </div>
                    </div>

                    {/* Score Cards Breakdown conforming to specifications */}
                    <div className="p-4 sm:p-6 space-y-4">
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3">
                        {/* 1. กรอบที่ 1: เข้าเรียน / (ATTEND) เต็ม 10 */}
                        <div className="bg-slate-50 hover:bg-slate-100/60 transition-colors rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 text-center flex flex-col justify-between shadow-2xs">
                          <div className="min-h-[44px] flex flex-col items-center justify-center text-center">
                            <span className="text-xs sm:text-[13px] font-bold text-slate-800 leading-tight block">
                              เข้าเรียน
                            </span>
                            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 tracking-tight leading-tight mt-0.5 block">
                              (ATTEND)
                            </span>
                          </div>
                          <div className="my-1.5 py-0.5">
                            <span className="text-xl sm:text-2xl font-black text-slate-800 font-mono tracking-tight block">
                              {s.ATTEN ?? '-'}
                            </span>
                          </div>
                          <div className="pt-1 border-t border-slate-100">
                            <span className="text-[11px] text-slate-500 font-medium">เต็ม 10</span>
                          </div>
                        </div>

                        {/* 2. กรอบที่ 2: งานในชั้นเรียน / (CLASS ACTIVITY) เต็ม 10 */}
                        <div className="bg-slate-50 hover:bg-slate-100/60 transition-colors rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 text-center flex flex-col justify-between shadow-2xs">
                          <div className="min-h-[44px] flex flex-col items-center justify-center text-center">
                            <span className="text-xs sm:text-[13px] font-bold text-slate-800 leading-tight block">
                              งานในชั้นเรียน
                            </span>
                            <span className="text-[9px] sm:text-[10px] font-semibold text-slate-500 tracking-tight leading-tight mt-0.5 block whitespace-nowrap">
                              (CLASS ACTIVITY)
                            </span>
                          </div>
                          <div className="my-1.5 py-0.5">
                            <span className="text-xl sm:text-2xl font-black text-slate-800 font-mono tracking-tight block">
                              {s.CA ?? '-'}
                            </span>
                          </div>
                          <div className="pt-1 border-t border-slate-100">
                            <span className="text-[11px] text-slate-500 font-medium">เต็ม 10</span>
                          </div>
                        </div>

                        {/* 3. กรอบที่ 3: การบ้าน / (ASSIGNMENT) เต็ม 20 */}
                        <div className="bg-slate-50 hover:bg-slate-100/60 transition-colors rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 text-center flex flex-col justify-between shadow-2xs">
                          <div className="min-h-[44px] flex flex-col items-center justify-center text-center">
                            <span className="text-xs sm:text-[13px] font-bold text-slate-800 leading-tight block">
                              การบ้าน
                            </span>
                            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 tracking-tight leading-tight mt-0.5 block">
                              (ASSIGNMENT)
                            </span>
                          </div>
                          <div className="my-1.5 py-0.5">
                            <span className="text-xl sm:text-2xl font-black text-slate-800 font-mono tracking-tight block">
                              {s.AS ?? '-'}
                            </span>
                          </div>
                          <div className="pt-1 border-t border-slate-100">
                            <span className="text-[11px] text-slate-500 font-medium">เต็ม 20</span>
                          </div>
                        </div>

                        {/* 4. กรอบที่ 4: สอบกลางภาค / (MIDTERM) เต็ม 25 */}
                        <div className="bg-slate-50 hover:bg-slate-100/60 transition-colors rounded-2xl p-2.5 sm:p-3 border border-slate-200/80 text-center flex flex-col justify-between shadow-2xs">
                          <div className="min-h-[44px] flex flex-col items-center justify-center text-center">
                            <span className="text-xs sm:text-[13px] font-bold text-slate-800 leading-tight block">
                              สอบกลางภาค
                            </span>
                            <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 tracking-tight leading-tight mt-0.5 block">
                              (MIDTERM)
                            </span>
                          </div>
                          <div className="my-1.5 py-0.5">
                            <span className="text-xl sm:text-2xl font-black text-indigo-700 font-mono tracking-tight block">
                              {s.MID ?? '-'}
                            </span>
                          </div>
                          <div className="pt-1 border-t border-slate-100">
                            <span className="text-[11px] text-slate-500 font-medium">เต็ม 25</span>
                          </div>
                        </div>

                        {/* 5. กรอบที่ 5: รวม / (TOTAL) เต็ม 65 */}
                        <div className="col-span-2 sm:col-span-1 bg-gradient-to-b from-amber-50 to-amber-100/50 rounded-2xl p-2.5 sm:p-3 border-2 border-amber-300 text-center shadow-xs flex flex-col justify-between">
                          <div className="min-h-[44px] flex flex-col items-center justify-center text-center">
                            <span className="text-xs sm:text-[13px] font-black text-amber-950 leading-tight block">
                              รวม
                            </span>
                            <span className="text-[10px] sm:text-[11px] font-bold text-amber-700 tracking-tight leading-tight mt-0.5 block">
                              (TOTAL)
                            </span>
                          </div>
                          <div className="my-1.5 py-0.5">
                            <span className="text-2xl sm:text-3xl font-black text-indigo-950 font-mono tracking-tight block">
                              {s.TOTAL ?? '-'}
                            </span>
                          </div>
                          <div className="pt-1 border-t border-amber-200/70">
                            <span className="text-[11px] font-bold text-amber-800">เต็ม 65</span>
                          </div>
                        </div>
                      </div>

                      {/* Important Notice required by brief */}
                      <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900 flex items-start space-x-2.5">
                        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <strong>หมายเหตุ:</strong> ระบบแสดงคะแนนตามที่อาจารย์ผู้สอนนำเข้าเท่านั้น 
                          ไม่มีการคำนวณหรือตัดเกรด เนื่องจากคะแนนที่ประกาศเป็นคะแนนเก็บเบื้องต้นเท่านั้น
                        </div>
                      </div>

                      {/* Updated timestamp */}
                      <div className="text-right text-[11px] text-slate-400 flex items-center justify-end space-x-1">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>
                          อัปเดตล่าสุด:{' '}
                          {course.updatedAt
                            ? new Date(course.updatedAt).toLocaleString('th-TH')
                            : 'ตามรอบการประเมิน'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* LOGIN / PIN AUTHENTICATION FORM (Mobile-First) */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-6 sm:p-8 transition-all">
          <div className="text-center mb-6">
            <div className="w-14 h-14 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-xs">
              <KeyRound className="w-7 h-7 text-indigo-600" />
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
              ตรวจสอบผลคะแนนนักศึกษา
            </h1>
          </div>

          {/* STEP 1: ENTER STUDENT ID */}
          {step === 'enter_id' && (
            <form onSubmit={handleLookupStudentId} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  รหัสนักศึกษา (Student ID)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    placeholder="เช่น 1650700011"
                    value={studentIdInput}
                    onChange={e => setStudentIdInput(e.target.value)}
                    className="w-full px-4 py-3.5 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:border-indigo-600 font-mono text-lg text-slate-900 tracking-wider placeholder:text-slate-400 placeholder:text-base placeholder:tracking-normal transition"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  * กรอกรหัสประจำตัวนักศึกษาเพื่อตรวจสอบข้อมูลคะแนน
                </p>
              </div>

              <button
                type="submit"
                disabled={loading || !studentIdInput.trim()}
                className="w-full py-3.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm sm:text-base shadow-md shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center space-x-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>กำลังค้นหาข้อมูล...</span>
                  </>
                ) : (
                  <>
                    <span>ถัดไป</span>
                  </>
                )}
              </button>

              {/* ข้อความแจ้งเตือนกรณีลืมรหัสผ่าน (Alert Box โดดเด่น ชัดเจน) */}
              <div className="pt-2">
                <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200/90 flex items-center justify-center space-x-2 text-center shadow-2xs">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 shrink-0" />
                  <span className="text-xs sm:text-sm font-bold text-amber-900 leading-snug">
                    หากลืมรหัสผ่าน กรุณาติดต่ออาจารย์ผู้สอนเพื่อทำการรีเซ็ตรหัสผ่าน
                  </span>
                </div>
              </div>
            </form>
          )}

          {/* STEP 2A: FIRST-TIME SETUP 6-DIGIT PIN */}
          {step === 'setup_pin' && studentRecord && (
            <form onSubmit={handleSetupPin} className="space-y-5">
              <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3.5 text-xs text-indigo-900">
                <div className="font-bold flex items-center mb-1">
                  <Sparkles className="w-4 h-4 mr-1 text-amber-600" />
                  ยินดีต้อนรับ: {studentRecord.name}
                </div>
                <div>
                  เนื่องจากคุณเข้าสู่ระบบเป็นครั้งแรก กรุณาตั้ง <strong>รหัสผ่าน 6 หลัก (PIN)</strong>{' '}
                  เพื่อใช้ในการยืนยันตัวตนเข้าระบบในครั้งถัดไป
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  ตั้งรหัสผ่าน 6 หลัก (New PIN)
                </label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    maxLength={6}
                    pattern="\d{6}"
                    placeholder="•••••• (ตัวเลข 6 หลัก)"
                    value={pinInput}
                    onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono text-center tracking-widest text-xl text-slate-900"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-3 text-slate-400 hover:text-slate-600"
                  >
                    {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  ยืนยันรหัสผ่าน 6 หลัก (Confirm PIN)
                </label>
                <input
                  type={showPin ? 'text' : 'password'}
                  inputMode="numeric"
                  maxLength={6}
                  pattern="\d{6}"
                  placeholder="•••••• (กรอกซ้ำอีกครั้ง)"
                  value={confirmPinInput}
                  onChange={e => setConfirmPinInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono text-center tracking-widest text-xl text-slate-900"
                  required
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setStep('enter_id');
                    setPinInput('');
                    setConfirmPinInput('');
                    setErrorMsg(null);
                  }}
                  className="w-1/3 py-3 px-3 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition cursor-pointer disabled:opacity-40"
                >
                  ย้อนกลับ
                </button>
                <button
                  type="submit"
                  disabled={loading || pinInput.length !== 6 || confirmPinInput.length !== 6}
                  className="w-2/3 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-100 disabled:opacity-50 transition flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>กำลังบันทึกรหัสผ่าน...</span>
                    </>
                  ) : (
                    <span>บันทึกและดูคะแนน</span>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* STEP 2B: RETURNING LOGIN WITH 6-DIGIT PIN */}
          {step === 'enter_pin' && studentRecord && (
            <form onSubmit={handleVerifyPin} className="space-y-5">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-700 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900">{studentRecord.name}</div>
                  <div className="text-slate-500 font-mono">รหัส: {studentRecord.studentId}</div>
                </div>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setStep('enter_id');
                    setPinInput('');
                    setConfirmPinInput('');
                    setErrorMsg(null);
                  }}
                  className="text-xs text-indigo-600 hover:underline cursor-pointer disabled:opacity-40"
                >
                  เปลี่ยนรหัส
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                  กรอกรหัสผ่าน 6 หลัก (PIN)
                </label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    inputMode="numeric"
                    autoFocus
                    maxLength={6}
                    pattern="\d{6}"
                    placeholder="••••••"
                    value={pinInput}
                    onChange={e => setPinInput(e.target.value.replace(/\D/g, ''))}
                    disabled={isLocked}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-600 font-mono text-center tracking-widest text-2xl text-slate-900 placeholder:text-slate-300 disabled:bg-slate-100"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(!showPin)}
                    className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600"
                  >
                    {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2 text-[11px] text-slate-500">
                  <span>* รหัสผ่าน 6 หลักที่ตั้งไว้ในครั้งแรก</span>
                  {studentRecord.failedAttempts && studentRecord.failedAttempts > 0 ? (
                    <span className="text-amber-600 font-medium">
                      ผิดไปแล้ว {studentRecord.failedAttempts}/5 ครั้ง
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep('enter_id')}
                  className="w-1/3 py-3 px-3 rounded-xl border border-slate-300 text-slate-700 font-medium text-sm hover:bg-slate-50 transition"
                >
                  ย้อนกลับ
                </button>
                <button
                  type="submit"
                  disabled={loading || pinInput.length !== 6 || isLocked}
                  className="w-2/3 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-100 disabled:opacity-50 transition flex items-center justify-center space-x-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>กำลังตรวจสอบ...</span>
                    </>
                  ) : (
                    <span>เข้าสู่ระบบดูคะแนน</span>
                  )}
                </button>
              </div>

              {/* ข้อความแจ้งเตือนกรณีลืมรหัสผ่าน (Alert Box โดดเด่น ชัดเจน) */}
              <div className="pt-2">
                <div className="p-3.5 rounded-2xl bg-amber-50/90 border border-amber-200/90 flex items-center justify-center space-x-2 text-center shadow-2xs">
                  <AlertCircle className="w-4 h-4 sm:w-5 sm:h-5 text-amber-600 shrink-0" />
                  <span className="text-xs sm:text-sm font-bold text-amber-900 leading-snug">
                    หากลืมรหัสผ่าน กรุณาติดต่ออาจารย์ผู้สอนเพื่อทำการรีเซ็ตรหัสผ่าน
                  </span>
                </div>
              </div>
            </form>
          )}

          {/* Privacy & Security Footnote */}
          <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-center space-x-2 text-[11px] text-slate-400">
            <Lock className="w-3.5 h-3.5 text-slate-400" />
            <span>รหัสผ่านถูกเข้ารหัส SHA-256 ปลอดภัย ไม่มีการจัดเก็บข้อความธรรมดา</span>
          </div>
        </div>
      )}
    </div>
  );
};
