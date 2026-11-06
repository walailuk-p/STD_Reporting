import React, { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  updateDoc, 
  deleteDoc, 
  writeBatch,
  query,
  where,
  deleteField
} from 'firebase/firestore';
import { 
  db, 
  auth, 
  googleProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  signOut, 
  getAuthErrorMessage,
  resolvedFirebaseConfig,
  isAllowedInstructorEmail
} from '../lib/firebase';
import { Course, StudentScoreItem, StudentRecord, DEFAULT_SCORE_COLUMNS } from '../types';
import { parseCSV, parseCSVWithDetails, exportToCSV, generateSampleCSV, CSVParseResult } from '../lib/csvHelper';
import { bulkSaveStudentsToFirestore, BulkSaveResult, withTimeout } from '../lib/scoreService';
import { GOOGLE_APPS_SCRIPT_CODE } from '../lib/gasTemplate';
import {
  BookOpen,
  Plus,
  FileSpreadsheet,
  Download,
  Upload,
  Trash2,
  Edit2,
  CheckCircle,
  XCircle,
  RotateCcw,
  Search,
  ExternalLink,
  Code,
  Copy,
  Check,
  Sparkles,
  Info,
  ShieldAlert,
  Users,
  Eye,
  LogOut,
  Save,
  UserPlus,
  AlertTriangle,
  X,
  ShieldCheck,
  KeyRound,
  Lock,
  Layers,
  Database,
  Sliders,
  HelpCircle,
  ToggleLeft,
  ToggleRight,
  Clock,
  Globe,
  RefreshCw,
  Smartphone,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface InstructorPortalProps {
  user: any;
}

export const InstructorPortal: React.FC<InstructorPortalProps> = ({ user }) => {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeCourse, setActiveCourse] = useState<Course | null>(null);
  const [students, setStudents] = useState<StudentScoreItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [secFilter, setSecFilter] = useState('ALL');
  const [authStatusFilter, setAuthStatusFilter] = useState<'ALL' | 'HAS_PIN' | 'PENDING' | 'LOCKED'>('ALL');

  // Sub-Navigation within Course Workspace: 'course_mgmt' or 'student_db'
  const [activeSectionView, setActiveSectionView] = useState<'course_mgmt' | 'student_db'>('course_mgmt');

  // Modals
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);
  const [showEditCourseModal, setShowEditCourseModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showAddStudentModal, setShowAddStudentModal] = useState(false);
  const [showGasModal, setShowGasModal] = useState(false);
  const [showHowToUseModal, setShowHowToUseModal] = useState(false);

  // In-App Confirmation Dialogs
  const [courseToDelete, setCourseToDelete] = useState<Course | null>(null);
  const [studentToDelete, setStudentToDelete] = useState<StudentScoreItem | null>(null);
  const [studentToResetPin, setStudentToResetPin] = useState<{ id: string; name: string } | null>(null);

  // Form states for new course
  const [newCourseCode, setNewCourseCode] = useState('');
  const [newCourseName, setNewCourseName] = useState('');
  const [newSemester, setNewSemester] = useState('1/2569');
  const [newSections, setNewSections] = useState('Sec 101, Sec 102');
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);

  // Form states for edit course
  const [editCourseCode, setEditCourseCode] = useState('');
  const [editCourseName, setEditCourseName] = useState('');
  const [editSemester, setEditSemester] = useState('');
  const [editSections, setEditSections] = useState('');

  // CSV Import preview state
  const [csvPreviewData, setCsvPreviewData] = useState<StudentScoreItem[]>([]);
  const [csvFileName, setCsvFileName] = useState('');
  const [csvParsedDetails, setCsvParsedDetails] = useState<CSVParseResult | null>(null);
  const [showJsonPreview, setShowJsonPreview] = useState(false);
  const [importSummaryModal, setImportSummaryModal] = useState<{
    total: number;
    sections: string[];
    averageTotal: number;
  } | null>(null);
  const [isSavingCsv, setIsSavingCsv] = useState(false);
  const [saveCsvError, setSaveCsvError] = useState<string | null>(null);
  const [saveCsvProgress, setSaveCsvProgress] = useState<{ current: number; total: number } | null>(null);

  // Batch delete student data states (Delete All or Delete by Section)
  const [showDeleteBatchModal, setShowDeleteBatchModal] = useState(false);
  const [deleteBatchMode, setDeleteBatchMode] = useState<'all' | 'section'>('section');
  const [selectedSectionToDelete, setSelectedSectionToDelete] = useState('');

  // Form state for new student manual entry
  const [newStudentNo, setNewStudentNo] = useState('');
  const [newStudentId, setNewStudentId] = useState('');
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentSec, setNewStudentSec] = useState('Sec 101');
  const [newScores, setNewScores] = useState({
    ATTEN: 10,
    CA: 10,
    AS: 20,
    MID: 25,
    TOTAL: 65,
  });

  // Editing student score inline
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editScoreValues, setEditScoreValues] = useState<any>({});

  // Feedback notifications
  const [notifyMsg, setNotifyMsg] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Authentication states & Netlify diagnostics
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [copiedHostname, setCopiedHostname] = useState(false);
  const [showNetlifyGuide, setShowNetlifyGuide] = useState(false);

  const showNotification = (type: 'success' | 'error' | 'info', text: string) => {
    setNotifyMsg({ type, text });
    setTimeout(() => setNotifyMsg(null), 5000);
  };

  const isBuEmail = isAllowedInstructorEmail(user?.email);

  // Copy current domain for Firebase Authorized Domains setup
  const copyCurrentDomain = () => {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      navigator.clipboard.writeText(hostname);
      setCopiedHostname(true);
      setTimeout(() => setCopiedHostname(false), 2500);
      showNotification('success', `คัดลอกโดเมน "${hostname}" เรียบร้อยแล้ว!`);
    }
  };

  // Check for rejected error or redirect result on page load (Mobile / Safari fallback)
  useEffect(() => {
    let isMounted = true;

    // Check if App level auth observer caught a non-bu email
    if (typeof window !== 'undefined') {
      const rejectedError = sessionStorage.getItem('bu_auth_rejected_error');
      if (rejectedError) {
        setLoginError(rejectedError);
        showNotification('error', rejectedError);
        sessionStorage.removeItem('bu_auth_rejected_error');
      }
    }

    getRedirectResult(auth)
      .then(async result => {
        if (!isMounted) return;
        if (result && result.user) {
          const email = result.user.email?.toLowerCase().trim() || '';
          if (!isAllowedInstructorEmail(email)) {
            await signOut(auth);
            const errText = `อีเมล "${result.user.email || ''}" ไม่ใช่บัญชีของมหาวิทยาลัยกรุงเทพ (@bu.ac.th) ระบบอนุญาตเฉพาะอาจารย์ผู้สอนที่ใช้อีเมลลงท้ายด้วย @bu.ac.th เท่านั้น`;
            setLoginError(errText);
            showNotification('error', 'ปฏิเสธการเข้าสู่ระบบ: อนุญาตเฉพาะบัญชีอาจารย์ @bu.ac.th เท่านั้น');
          } else {
            setLoginError(null);
            showNotification('success', `ยินดีต้อนรับอาจารย์ ${result.user.displayName || result.user.email}`);
          }
        }
      })
      .catch(err => {
        if (!isMounted) return;
        console.error('Redirect sign-in error:', err);
        const msg = getAuthErrorMessage(err);
        setLoginError(msg);
        showNotification('error', msg);
      })
      .finally(() => {
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('auth_redirect_pending');
        }
        if (isMounted) {
          setIsLoggingIn(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch courses owned by this instructor
  const fetchCourses = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'courses'), where('instructorUid', '==', user.uid));
      const querySnap = await getDocs(q);
      const list: Course[] = [];
      querySnap.forEach(d => {
        list.push({ ...(d.data() as Course), id: d.id });
      });
      
      list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
      setCourses(list);

      if (list.length > 0) {
        if (!activeCourse || !list.some(c => c.id === activeCourse.id)) {
          selectCourse(list[0]);
        }
      } else {
        setActiveCourse(null);
        setStudents([]);
      }
    } catch (err: any) {
      console.warn('Fetch courses query error, trying fallback:', err);
      try {
        const querySnap = await getDocs(collection(db, 'courses'));
        const list: Course[] = [];
        querySnap.forEach(d => {
          const data = d.data() as Course;
          if (data.instructorUid === user.uid) {
            list.push({ ...data, id: d.id });
          }
        });
        setCourses(list);
        if (list.length > 0 && !activeCourse) {
          selectCourse(list[0]);
        }
      } catch (innerErr) {
        console.error('Failed to load courses:', innerErr);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchCourses();
    }
  }, [user]);

  // Select a course and load its students along with authentication status
  const selectCourse = async (course: Course) => {
    setActiveCourse(course);
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'courses', course.id, 'students'));
      const studentList: StudentScoreItem[] = [];
      const studentIds: string[] = [];

      snap.forEach(d => {
        studentList.push(d.data() as StudentScoreItem);
        studentIds.push(d.id);
      });
      studentList.sort((a, b) => Number(a.no || 0) - Number(b.no || 0));

      // Fetch student_records in parallel to get actual PIN and lockout status
      const authStatuses: Record<string, { hasPin: boolean; failedAttempts: number; isLocked: boolean }> = {};
      await Promise.all(
        studentIds.map(async id => {
          try {
            const sSnap = await getDoc(doc(db, 'student_records', id));
            if (sSnap.exists()) {
              const data = sSnap.data() as StudentRecord;
              const hasPin = Boolean(data.pinHash && data.pinHash.trim() !== '');
              const failedAttempts = data.failedAttempts || 0;
              const isLocked = Boolean(data.lockedUntil && data.lockedUntil > Date.now());
              authStatuses[id] = { hasPin, failedAttempts, isLocked };
            }
          } catch (e) {
            // Ignore single read error
          }
        })
      );

      const enrichedStudents = studentList.map(st => {
        const authInfo = authStatuses[st.studentId];
        return {
          ...st,
          hasPin: authInfo ? authInfo.hasPin : false,
          failedAttempts: authInfo ? authInfo.failedAttempts : 0,
          isLocked: authInfo ? authInfo.isLocked : false,
        };
      });

      setStudents(enrichedStudents);
    } catch (err: any) {
      console.error('Error fetching students:', err);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  // Google Login with Popup and Graceful Fallback
  const handleGoogleLogin = async (useRedirect: boolean = false) => {
    setLoginError(null);
    setIsLoggingIn(true);

    if (useRedirect) {
      try {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('auth_redirect_pending', 'instructor');
        }
        await signInWithRedirect(auth, googleProvider);
        return;
      } catch (err: any) {
        console.warn('Redirect sign-in notice:', err);
        const msg = getAuthErrorMessage(err);
        setLoginError(msg);
        showNotification('error', msg);
        setIsLoggingIn(false);
        return;
      }
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email?.toLowerCase().trim() || '';

      if (!isAllowedInstructorEmail(email)) {
        await signOut(auth);
        const errText = `อีเมล "${result.user.email || ''}" ไม่ใช่บัญชีของมหาวิทยาลัยกรุงเทพ (@bu.ac.th) กรุณาเข้าสู่ระบบด้วยบัญชี @bu.ac.th ของอาจารย์ผู้สอนเท่านั้น`;
        setLoginError(errText);
        showNotification('error', 'ปฏิเสธการเข้าสู่ระบบ: อนุญาตเฉพาะบัญชีอาจารย์ @bu.ac.th เท่านั้น');
        return;
      }

      setLoginError(null);
      showNotification('success', `เข้าสู่ระบบสำเร็จ: ${result.user.displayName || result.user.email}`);
    } catch (err: any) {
      const code = err?.code || '';
      const isPopupSuppressed = code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request' || code === 'auth/popup-closed-by-user';

      if (isPopupSuppressed) {
        // Log as non-fatal warning so the build environment doesn't treat expected browser popup suppression as an unhandled crash
        console.warn('Google Sign-in popup notice:', code || err?.message);
        const msg = code === 'auth/popup-blocked'
          ? 'เบราว์เซอร์หรือ iFrame ป้องกันการเปิดหน้าต่างป็อปอัป (Popup Blocked) กรุณากดอนุญาตป็อปอัป (Allow Popups) ที่ Address Bar หรือใช้ปุ่ม "เข้าสู่ระบบด้วย Redirect Mode" ด้านล่าง'
          : code === 'auth/popup-closed-by-user'
          ? 'หน้าต่างเข้าสู่ระบบถูกปิดก่อนทำรายการสำเร็จ กรุณากดเข้าสู่ระบบใหม่อีกครั้ง'
          : 'มีการเปิดหน้าต่างเข้าสู่ระบบซ้ำ กรุณารอสักครู่แล้วลองใหม่อีกครั้ง';
        setLoginError(msg);
        showNotification('info', msg);
      } else {
        console.error('Google Sign-in authentication error:', err);
        const msg = getAuthErrorMessage(err);
        setLoginError(msg);
        showNotification('error', msg);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Create New Course
  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      showNotification('error', 'กรุณาเข้าสู่ระบบก่อนเพิ่มรายวิชา');
      return;
    }

    const code = newCourseCode.trim().toUpperCase();
    const name = newCourseName.trim();
    if (!code || !name) {
      showNotification('error', 'กรุณาระบุรหัสวิชาและชื่อวิชา');
      return;
    }

    const secList = newSections
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const initialSections = secList.length > 0 ? secList : ['Sec 101'];
    const courseId = `course_${Date.now()}`;
    const newCourse: Course = {
      id: courseId,
      courseCode: code,
      courseName: name,
      semester: newSemester.trim() || '1/2569',
      sections: initialSections,
      scoreColumns: DEFAULT_SCORE_COLUMNS,
      isPublished: true,
      publishedSections: initialSections,
      instructorUid: user.uid,
      instructorEmail: user.email || '',
      studentCount: 0,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    setIsCreatingCourse(true);

    // Optimistically update courses list and active course immediately for instant UI feedback
    setCourses(prev => [newCourse, ...prev.filter(c => c.id !== courseId)]);
    setActiveCourse(newCourse);
    setStudents([]);

    setShowAddCourseModal(false);
    setNewCourseCode('');
    setNewCourseName('');
    setNewSections('Sec 101, Sec 102');
    showNotification('success', `สร้างรายวิชา ${newCourse.courseCode} สำเร็จแล้ว!`);

    try {
      // Use 60-second timeout so network fluctuations or initial webchannel establishment can complete safely
      await withTimeout(
        setDoc(doc(db, 'courses', courseId), newCourse),
        60000,
        'การเชื่อมต่อกับเซิร์ฟเวอร์ล่าช้า แต่ระบบได้บันทึกข้อมูลไว้ในเครื่องแล้ว'
      );
    } catch (err: any) {
      console.warn('Create course Firestore write notice:', err);
      if (err?.code === 'permission-denied') {
        showNotification('error', 'ไม่มีสิทธิ์ในการสร้างรายวิชา กรุณาตรวจสอบการเข้าสู่ระบบ');
        setCourses(prev => prev.filter(c => c.id !== courseId));
        setActiveCourse(prev => (prev?.id === courseId ? (courses.find(c => c.id !== courseId) || null) : prev));
      } else if (err?.message?.includes('ล่าช้า') || err?.message?.includes('อินเทอร์เน็ต')) {
        showNotification('info', 'ระบบบันทึกรายวิชาในเครื่องเรียบร้อยแล้ว และกำลังซิงค์กับเซิร์ฟเวอร์');
      } else {
        console.error('Course persistence notice:', err);
      }
    } finally {
      setIsCreatingCourse(false);
    }
  };

  // Open Edit Course Modal
  const handleOpenEditCourse = () => {
    if (!activeCourse) return;
    setEditCourseCode(activeCourse.courseCode);
    setEditCourseName(activeCourse.courseName);
    setEditSemester(activeCourse.semester || '1/2569');
    setEditSections((activeCourse.sections || []).join(', '));
    setShowEditCourseModal(true);
  };

  // Save Edit Course
  const handleSaveEditCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCourse) return;

    const code = editCourseCode.trim().toUpperCase();
    const name = editCourseName.trim();
    if (!code || !name) {
      showNotification('error', 'กรุณาระบุรหัสวิชาและชื่อวิชา');
      return;
    }

    const secList = editSections
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    const updatedSections = secList.length > 0 ? secList : activeCourse.sections;

    const updatedData = {
      courseCode: code,
      courseName: name,
      semester: editSemester.trim() || activeCourse.semester,
      sections: updatedSections,
      updatedAt: new Date().toISOString(),
    };

    setLoading(true);
    try {
      await updateDoc(doc(db, 'courses', activeCourse.id), updatedData);

      if (students.length > 0) {
        const batch = writeBatch(db);
        for (const st of students) {
          const sRef = doc(db, 'student_records', st.studentId);
          batch.update(sRef, {
            [`enrolledCourses.${activeCourse.id}.courseCode`]: code,
            [`enrolledCourses.${activeCourse.id}.courseName`]: name,
            [`enrolledCourses.${activeCourse.id}.semester`]: updatedData.semester,
            updatedAt: new Date().toISOString(),
          });
        }
        await batch.commit();
      }

      const updatedCourse: Course = {
        ...activeCourse,
        ...updatedData,
      };

      setActiveCourse(updatedCourse);
      setCourses(courses.map(c => c.id === activeCourse.id ? updatedCourse : c));
      setShowEditCourseModal(false);
      showNotification('success', `แก้ไขข้อมูลรายวิชา ${code} เรียบร้อยแล้ว!`);
    } catch (err: any) {
      console.error('Save edit course error:', err);
      showNotification('error', `ไม่สามารถแก้ไขรายวิชาได้: ${err?.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  // Execute Course Deletion (from in-app confirmation modal)
  const executeDeleteCourse = async (courseId: string) => {
    setLoading(true);
    try {
      const subSnap = await getDocs(collection(db, 'courses', courseId, 'students'));
      const batch = writeBatch(db);
      subSnap.forEach(d => {
        batch.delete(d.ref);
      });
      batch.delete(doc(db, 'courses', courseId));
      await batch.commit();

      const remaining = courses.filter(c => c.id !== courseId);
      setCourses(remaining);
      if (remaining.length > 0) {
        selectCourse(remaining[0]);
      } else {
        setActiveCourse(null);
        setStudents([]);
      }
      setCourseToDelete(null);
      showNotification('success', 'ลบรายวิชาสำเร็จเรียบร้อยแล้ว');
    } catch (err: any) {
      console.error('Delete error:', err);
      showNotification('error', `ไม่สามารถลบรายวิชาได้: ${err?.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  // Sync visibility to individual student_records
  const syncVisibilityToStudentRecords = async (courseId: string, isCoursePublished: boolean, publishedSectionsList: string[]) => {
    if (students.length === 0) return;
    try {
      const CHUNK_SIZE = 200;
      for (let i = 0; i < students.length; i += CHUNK_SIZE) {
        const chunk = students.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        for (const st of chunk) {
          const sRef = doc(db, 'student_records', st.studentId);
          const shouldBeVisible = isCoursePublished && publishedSectionsList.includes(st.sec);
          batch.update(sRef, {
            [`enrolledCourses.${courseId}.isPublished`]: shouldBeVisible,
            updatedAt: new Date().toISOString(),
          });
        }
        await batch.commit();
      }
    } catch (e) {
      console.error('Error syncing visibility to student records:', e);
    }
  };

  // Toggle Course-Level Visibility
  const handleToggleCoursePublish = async (courseId: string, currentStatus: boolean) => {
    if (!activeCourse) return;
    const newStatus = !currentStatus;
    try {
      await updateDoc(doc(db, 'courses', courseId), {
        isPublished: newStatus,
        updatedAt: new Date().toISOString(),
      });

      await syncVisibilityToStudentRecords(courseId, newStatus, activeCourse.publishedSections || []);

      const updated = { ...activeCourse, isPublished: newStatus };
      setActiveCourse(updated);
      setCourses(courses.map(c => c.id === courseId ? updated : c));
      showNotification('success', `${newStatus ? 'เปิดการประกาศคะแนนระดับรายวิชาแล้ว' : 'ปิดการประกาศคะแนนระดับรายวิชาแล้ว (ซ่อนคะแนนทั้งหมด)'}`);
    } catch (err: any) {
      console.error(err);
      showNotification('error', `ไม่สามารถเปลี่ยนสถานะประกาศวิชาได้: ${err?.message || ''}`);
    }
  };

  // Toggle Section-Level Visibility
  const handleToggleSectionPublish = async (sec: string) => {
    if (!activeCourse) return;
    const currentList = activeCourse.publishedSections || [];
    const isCurrentlyPublished = currentList.includes(sec);
    const updatedList = isCurrentlyPublished
      ? currentList.filter(s => s !== sec)
      : [...currentList, sec];

    try {
      await updateDoc(doc(db, 'courses', activeCourse.id), {
        publishedSections: updatedList,
        updatedAt: new Date().toISOString(),
      });

      await syncVisibilityToStudentRecords(activeCourse.id, activeCourse.isPublished, updatedList);

      const updated = { ...activeCourse, publishedSections: updatedList };
      setActiveCourse(updated);
      setCourses(courses.map(c => c.id === activeCourse.id ? updated : c));
      showNotification('success', `อัปเดตสถานะประกาศ ${sec}: ${!isCurrentlyPublished ? 'เปิดประกาศ' : 'ปิดประกาศ'} เรียบร้อยแล้ว`);
    } catch (err: any) {
      console.error(err);
      showNotification('error', `ไม่สามารถอัปเดตกลุ่มเรียนได้: ${err?.message || ''}`);
    }
  };

  // Bulk Publish / Unpublish all sections
  const handleBulkSetSectionsPublish = async (publishAll: boolean) => {
    if (!activeCourse) return;
    const allSections = activeCourse.sections || [];
    const updatedSections = publishAll ? [...allSections] : [];

    try {
      await updateDoc(doc(db, 'courses', activeCourse.id), {
        publishedSections: updatedSections,
        updatedAt: new Date().toISOString(),
      });

      await syncVisibilityToStudentRecords(activeCourse.id, activeCourse.isPublished, updatedSections);

      const updated = { ...activeCourse, publishedSections: updatedSections };
      setActiveCourse(updated);
      setCourses(courses.map(c => c.id === activeCourse.id ? updated : c));
      showNotification('success', `${publishAll ? 'เปิดประกาศทุก Section เรียบร้อยแล้ว' : 'ปิดประกาศทุก Section เรียบร้อยแล้ว'}`);
    } catch (err: any) {
      console.error(err);
      showNotification('error', 'ไม่สามารถบันทึกสถานะได้');
    }
  };

  // Seed Realistic Demo Data
  const handleSeedDemoData = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const demoCourseId = `course_demo_${Date.now()}`;
      const demoCourse: Course = {
        id: demoCourseId,
        courseCode: 'CS211',
        courseName: 'การเขียนโปรแกรมบนเว็บและคลาวด์',
        semester: '1/2569',
        sections: ['Sec 101', 'Sec 102'],
        scoreColumns: DEFAULT_SCORE_COLUMNS,
        isPublished: true,
        publishedSections: ['Sec 101', 'Sec 102'],
        instructorUid: user.uid,
        instructorEmail: user.email || '',
        studentCount: 5,
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      const demoStudents: StudentScoreItem[] = [
        {
          no: 1,
          studentId: '1650700011',
          name: 'นายสมชาย ใจดี',
          sec: 'Sec 101',
          scores: { ATTEN: 10, CA: 9.5, AS: 18, MID: 22.5, TOTAL: 60 },
          hasPin: true,
          failedAttempts: 0,
          isLocked: false,
          updatedAt: new Date().toISOString(),
        },
        {
          no: 2,
          studentId: '1650700022',
          name: 'นางสาวสมหญิง รักเรียน',
          sec: 'Sec 101',
          scores: { ATTEN: 10, CA: 10, AS: 19, MID: 24, TOTAL: 63 },
          hasPin: true,
          failedAttempts: 1,
          isLocked: false,
          updatedAt: new Date().toISOString(),
        },
        {
          no: 3,
          studentId: '1650700033',
          name: 'นายกิตติคุณ มั่นคง',
          sec: 'Sec 101',
          scores: { ATTEN: 8, CA: 8.5, AS: 16, MID: 19, TOTAL: 51.5 },
          hasPin: false,
          failedAttempts: 0,
          isLocked: false,
          updatedAt: new Date().toISOString(),
        },
        {
          no: 4,
          studentId: '1650700044',
          name: 'นางสาวณิชาภา บุญส่ง',
          sec: 'Sec 102',
          scores: { ATTEN: 10, CA: 9, AS: 20, MID: 23, TOTAL: 62 },
          hasPin: true,
          failedAttempts: 0,
          isLocked: false,
          updatedAt: new Date().toISOString(),
        },
        {
          no: 5,
          studentId: '1650700055',
          name: 'นายปิยะวัฒน์ วิริยะ',
          sec: 'Sec 102',
          scores: { ATTEN: 9, CA: 7.5, AS: 15, MID: 20, TOTAL: 51.5 },
          hasPin: false,
          failedAttempts: 0,
          isLocked: false,
          updatedAt: new Date().toISOString(),
        },
      ];

      await setDoc(doc(db, 'courses', demoCourseId), demoCourse);

      const batch = writeBatch(db);
      for (const st of demoStudents) {
        const courseStudentRef = doc(db, 'courses', demoCourseId, 'students', st.studentId);
        batch.set(courseStudentRef, st);

        const studentRecordRef = doc(db, 'student_records', st.studentId);
        batch.set(studentRecordRef, {
          studentId: st.studentId,
          name: st.name,
          pinHash: st.hasPin ? 'demo_hash_active' : '',
          salt: 'demo_salt',
          failedAttempts: st.failedAttempts || 0,
          lockedUntil: 0,
          enrolledCourses: {
            [demoCourseId]: {
              courseId: demoCourseId,
              courseCode: demoCourse.courseCode,
              courseName: demoCourse.courseName,
              semester: demoCourse.semester,
              sec: st.sec,
              no: st.no,
              name: st.name,
              scores: st.scores,
              isPublished: true,
              updatedAt: new Date().toISOString(),
            },
          },
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      }

      await batch.commit();

      setCourses(prev => [demoCourse, ...prev.filter(c => c.id !== demoCourseId)]);
      setActiveCourse(demoCourse);
      setStudents(demoStudents);
      showNotification('success', 'สร้างข้อมูลตัวอย่างวิชา CS211 พร้อม 5 นักศึกษาเรียบร้อยแล้ว!');
    } catch (err: any) {
      console.error(err);
      showNotification('error', `ไม่สามารถสร้างข้อมูลตัวอย่างได้: ${err?.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  // Add individual student manually
  const handleAddStudentManually = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCourse) return;

    const studentId = newStudentId.trim().replace(/[^0-9a-zA-Z]/g, '');
    if (!studentId) {
      showNotification('error', 'กรุณาระบุรหัสนักศึกษา');
      return;
    }

    const no = Number(newStudentNo) || students.length + 1;
    const name = newStudentName.trim() || `นักศึกษา ${studentId}`;
    const sec = newStudentSec.trim() || 'Sec 101';

    const scoresObj = {
      ATTEN: Number(newScores.ATTEN ?? 0),
      CA: Number(newScores.CA ?? 0),
      AS: Number(newScores.AS ?? 0),
      MID: Number(newScores.MID ?? 0),
      TOTAL: Number(newScores.TOTAL ?? 0),
    };

    const newStudentItem: StudentScoreItem = {
      no,
      studentId,
      name,
      sec,
      scores: scoresObj,
      hasPin: false,
      failedAttempts: 0,
      isLocked: false,
      updatedAt: new Date().toISOString(),
    };

    setLoading(true);
    try {
      const batch = writeBatch(db);

      const courseStudentRef = doc(db, 'courses', activeCourse.id, 'students', studentId);
      batch.set(courseStudentRef, newStudentItem);

      const studentRecordRef = doc(db, 'student_records', studentId);
      const isVisible = activeCourse.isPublished && (activeCourse.publishedSections || []).includes(sec);

      batch.set(studentRecordRef, {
        studentId,
        name,
        enrolledCourses: {
          [activeCourse.id]: {
            courseId: activeCourse.id,
            courseCode: activeCourse.courseCode,
            courseName: activeCourse.courseName,
            semester: activeCourse.semester,
            sec,
            no,
            name,
            scores: scoresObj,
            isPublished: isVisible,
            updatedAt: new Date().toISOString(),
          },
        },
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      const newCount = students.length + 1;
      batch.update(doc(db, 'courses', activeCourse.id), {
        studentCount: newCount,
        updatedAt: new Date().toISOString(),
      });

      await batch.commit();

      const updated = [...students.filter(s => s.studentId !== studentId), newStudentItem];
      updated.sort((a, b) => Number(a.no || 0) - Number(b.no || 0));
      setStudents(updated);
      setActiveCourse({ ...activeCourse, studentCount: newCount });

      setShowAddStudentModal(false);
      setNewStudentNo('');
      setNewStudentId('');
      setNewStudentName('');
      showNotification('success', `เพิ่มนักศึกษารหัส ${studentId} เรียบร้อยแล้ว!`);
    } catch (err: any) {
      console.error(err);
      showNotification('error', `ไม่สามารถเพิ่มนักศึกษาได้: ${err?.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  // CSV File Handler
  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const text = evt.target?.result as string;
        const details = parseCSVWithDetails(text);
        setCsvPreviewData(details.items);
        setCsvParsedDetails(details);
        setShowJsonPreview(false);
        showNotification('info', `อ่านไฟล์ CSV สำเร็จ: ตรวจพบและแปลงข้อมูลเป็น JSON ${details.items.length} รายการ`);
      } catch (err: any) {
        showNotification('error', `เกิดข้อผิดพลาดในการอ่านไฟล์ CSV: ${err.message}`);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  // Save CSV / JSON Imported Students directly into database
  const handleSaveToDatabase = async () => {
    if (!activeCourse) {
      showNotification('error', 'กรุณาเลือกรหัสวิชาก่อนทำรายการ');
      return;
    }

    if (!csvPreviewData || csvPreviewData.length === 0) {
      showNotification('error', 'ไม่มีข้อมูลนักศึกษาในรายการสำหรับบันทึก กรุณาเลือกไฟล์ CSV ก่อน');
      return;
    }

    // Set saving state: Disables button and prevents double click
    setIsSavingCsv(true);
    setSaveCsvError(null);
    setSaveCsvProgress({ current: 0, total: csvPreviewData.length });

    try {
      // Call server-side / database bulk save service with column mapping, sanitization & timeout protection
      const result = await bulkSaveStudentsToFirestore(
        activeCourse,
        csvPreviewData,
        (saved, total) => {
          setSaveCsvProgress({ current: saved, total });
        }
      );

      // 1. Update active course in memory
      const updatedSections = Array.from(new Set([...(activeCourse.sections || []), ...result.sections]));
      const updatedPublishedSections = Array.from(new Set([...(activeCourse.publishedSections || []), ...result.sections]));
      const updatedCourse: Course = {
        ...activeCourse,
        studentCount: result.totalSaved,
        sections: updatedSections,
        publishedSections: updatedPublishedSections,
        updatedAt: new Date().toISOString(),
      };

      setActiveCourse(updatedCourse);
      setCourses(prev => prev.map(c => c.id === activeCourse.id ? updatedCourse : c));

      // 2. Refresh student list directly with the saved records (sorted by 'no')
      const sorted = [...result.savedStudents].sort((a, b) => Number(a.no || 0) - Number(b.no || 0));
      setStudents(sorted);

      // 3. Close the modal & clear temporary CSV data
      setShowImportModal(false);
      setCsvPreviewData([]);
      setCsvParsedDetails(null);
      setCsvFileName('');
      setShowJsonPreview(false);
      setSaveCsvError(null);

      // 4. Open success summary modal and show notification
      setImportSummaryModal({
        total: result.totalSaved,
        sections: result.sections,
        averageTotal: result.averageTotal,
      });

      showNotification(
        'success',
        `🎉 บันทึกข้อมูลสำเร็จ ${result.totalSaved} รายการ (บันทึกฐานข้อมูล Firestore และคำนวณคะแนนเรียบร้อย)`
      );

      // Background sync for student PIN status without blocking UI
      selectCourse(updatedCourse).catch(err => console.warn('Background sync warning:', err));
    } catch (err: any) {
      console.error('[handleSaveToDatabase] Error:', err);
      const errorMessage = err?.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูลลงฐานข้อมูล';
      setSaveCsvError(errorMessage);
      showNotification('error', `ไม่สามารถบันทึกข้อมูลได้: ${errorMessage}`);
    } finally {
      // CRITICAL: Always reset button loading state so user is NEVER stuck!
      setIsSavingCsv(false);
      setSaveCsvProgress(null);
      setLoading(false);
    }
  };

  // Backwards compatibility alias
  const handleSaveImportedStudents = handleSaveToDatabase;

  // Start Inline Score Edit
  const handleStartEdit = (student: StudentScoreItem) => {
    setEditingStudentId(student.studentId);
    setEditScoreValues({ ...student.scores });
  };

  // Save Inline Score Edit (Manual Override in real-time)
  const handleSaveScoreEdit = async (studentId: string) => {
    if (!activeCourse) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);

      const updatedScores = {
        ATTEN: Number(editScoreValues.ATTEN ?? 0),
        CA: Number(editScoreValues.CA ?? 0),
        AS: Number(editScoreValues.AS ?? 0),
        MID: Number(editScoreValues.MID ?? 0),
        TOTAL: Number(editScoreValues.TOTAL ?? (
          Number(editScoreValues.ATTEN ?? 0) +
          Number(editScoreValues.CA ?? 0) +
          Number(editScoreValues.AS ?? 0) +
          Number(editScoreValues.MID ?? 0)
        )),
      };

      const courseStudentRef = doc(db, 'courses', activeCourse.id, 'students', studentId);
      batch.update(courseStudentRef, {
        scores: updatedScores,
        updatedAt: new Date().toISOString(),
      });

      const studentRecordRef = doc(db, 'student_records', studentId);
      batch.update(studentRecordRef, {
        [`enrolledCourses.${activeCourse.id}.scores`]: updatedScores,
        [`enrolledCourses.${activeCourse.id}.updatedAt`]: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await batch.commit();

      setStudents(students.map(s => s.studentId === studentId ? { ...s, scores: updatedScores } : s));
      setEditingStudentId(null);
      showNotification('success', `อัปเดตคะแนนของรหัส ${studentId} เรียบร้อยแล้ว (แสดงผลให้นักศึกษาทันที)`);
    } catch (err: any) {
      console.error(err);
      showNotification('error', `ไม่สามารถอัปเดตคะแนนได้: ${err?.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  // Execute Reset Student PIN (from in-app dialog)
  const executeResetStudentPin = async (studentId: string) => {
    setLoading(true);
    try {
      const sRef = doc(db, 'student_records', studentId);
      await updateDoc(sRef, {
        pinHash: '',
        salt: '',
        failedAttempts: 0,
        lockedUntil: 0,
        updatedAt: new Date().toISOString(),
      });

      setStudents(students.map(s => s.studentId === studentId ? {
        ...s,
        hasPin: false,
        failedAttempts: 0,
        isLocked: false,
      } : s));

      setStudentToResetPin(null);
      showNotification('success', `รีเซ็ตรหัสผ่านของ ${studentId} เรียบร้อยแล้ว นักศึกษาสามารถตั้งรหัสใหม่ได้ทันที`);
    } catch (err: any) {
      console.error(err);
      showNotification('error', `ไม่สามารถรีเซ็ตรหัสผ่านได้: ${err?.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  // Execute Student Deletion (from in-app dialog)
  const executeDeleteStudent = async (studentId: string) => {
    if (!activeCourse) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'courses', activeCourse.id, 'students', studentId));
      batch.update(doc(db, 'courses', activeCourse.id), {
        studentCount: Math.max(0, students.length - 1),
      });
      batch.set(doc(db, 'student_records', studentId), {
        enrolledCourses: {
          [activeCourse.id]: deleteField(),
        },
        updatedAt: new Date().toISOString(),
      }, { merge: true });

      await batch.commit();

      setStudents(students.filter(s => s.studentId !== studentId));
      setStudentToDelete(null);
      showNotification('info', `ลบนักศึกษารหัส ${studentId} เรียบร้อยแล้ว`);
    } catch (err: any) {
      console.error(err);
      showNotification('error', `ไม่สามารถลบนักศึกษาได้: ${err?.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  // Execute Batch Student Deletion (Option 1: All Students, Option 2: By Section)
  const executeBatchDeleteStudents = async () => {
    if (!activeCourse) return;

    const targets = deleteBatchMode === 'all'
      ? students
      : students.filter(s => s.sec === selectedSectionToDelete);

    if (targets.length === 0) {
      showNotification('error', 'ไม่พบข้อมูลนักศึกษาที่ต้องการลบ');
      return;
    }

    setLoading(true);
    try {
      const CHUNK_SIZE = 100;
      for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
        const chunk = targets.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);

        for (const st of chunk) {
          // 1. Delete from courses/{courseId}/students/{studentId}
          batch.delete(doc(db, 'courses', activeCourse.id, 'students', st.studentId));

          // 2. Remove enrolledCourse from student_records/{studentId}
          const sRef = doc(db, 'student_records', st.studentId);
          batch.set(sRef, {
            enrolledCourses: {
              [activeCourse.id]: deleteField(),
            },
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }

        // On final chunk, update course studentCount
        if (i + CHUNK_SIZE >= targets.length) {
          const newStudentCount = deleteBatchMode === 'all'
            ? 0
            : Math.max(0, students.length - targets.length);
          batch.update(doc(db, 'courses', activeCourse.id), {
            studentCount: newStudentCount,
            updatedAt: new Date().toISOString(),
          });
        }

        await batch.commit();
      }

      // Update local state
      const targetIds = new Set(targets.map(s => s.studentId));
      const remainingStudents = students.filter(s => !targetIds.has(s.studentId));
      const newCount = remainingStudents.length;

      setStudents(remainingStudents);
      const updatedCourse: Course = { ...activeCourse, studentCount: newCount };
      setActiveCourse(updatedCourse);
      setCourses(courses.map(c => c.id === activeCourse.id ? updatedCourse : c));

      setShowDeleteBatchModal(false);

      if (deleteBatchMode === 'all') {
        showNotification('success', `ลบข้อมูลนักศึกษาทั้งหมด (${targets.length} คน) ในรายวิชา ${activeCourse.courseCode} เรียบร้อยแล้ว`);
      } else {
        showNotification('success', `ลบข้อมูลนักศึกษากลุ่มเรียน ${selectedSectionToDelete} (${targets.length} คน) เรียบร้อยแล้ว`);
      }
    } catch (err: any) {
      console.error('Batch delete error:', err);
      showNotification('error', `ไม่สามารถลบข้อมูลนักศึกษาได้: ${err?.message || ''}`);
    } finally {
      setLoading(false);
    }
  };

  // Filter students based on search, section and authentication status
  const filteredStudents = students.filter(st => {
    const matchSearch = 
      st.studentId.includes(searchTerm) || 
      (st.name || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchSec = secFilter === 'ALL' || st.sec === secFilter;
    
    let matchAuth = true;
    if (authStatusFilter === 'HAS_PIN') {
      matchAuth = Boolean(st.hasPin);
    } else if (authStatusFilter === 'PENDING') {
      matchAuth = !st.hasPin;
    } else if (authStatusFilter === 'LOCKED') {
      matchAuth = Boolean(st.isLocked);
    }

    return matchSearch && matchSec && matchAuth;
  });

  const availableSections = Array.from(new Set(students.map(s => s.sec).filter(Boolean)));

  // Counts for student auth statuses
  const totalStudentsCount = students.length;
  const pinActiveCount = students.filter(s => s.hasPin).length;
  const pinPendingCount = students.filter(s => !s.hasPin).length;
  const lockedCount = students.filter(s => s.isLocked).length;

  // Login view if not logged in
  if (!user) {
    const currentHost = typeof window !== 'undefined' ? (window.location.hostname || 'score-ma102.netlify.app') : 'score-ma102.netlify.app';
    const activeProjectId = resolvedFirebaseConfig.projectId || 'studious-axe-6ct7q';
    const activeAuthDomain = resolvedFirebaseConfig.authDomain || `${activeProjectId}.firebaseapp.com`;

    return (
      <div className="max-w-xl mx-auto py-10 px-4">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-6 sm:p-8 text-center space-y-6">
          <div>
            <div className="w-14 h-14 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-600 shadow-xs">
              <BookOpen className="w-7 h-7" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">สำหรับอาจารย์ผู้สอน</h2>
            <p className="text-sm text-slate-500 mt-2">
              เข้าสู่ระบบเพื่อจัดการรายวิชา นำเข้าไฟล์คะแนน CSV และควบคุมการประกาศผลคะแนน
            </p>
          </div>

          {/* Security requirement notice */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 text-left flex items-start space-x-3 shadow-xs">
            <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong className="font-bold text-amber-950">ข้อกำหนดความปลอดภัยของระบบ:</strong>
              <p className="mt-1 text-amber-800 leading-relaxed">
                ระบบเปิดสิทธิ์ให้อาจารย์ล็อกอินด้วย Google Account ของมหาวิทยาลัยกรุงเทพ (โดเมน <code className="bg-amber-100/80 px-1.5 py-0.5 rounded font-mono font-semibold text-amber-900">@bu.ac.th</code>) เท่านั้น หากใช้อีเมลส่วนตัว (@gmail.com) หรืออีเมลอื่น ระบบจะปฏิเสธการเข้าถึงทันที
              </p>
            </div>
          </div>

          {/* Prominent Login Error Alert Box if any */}
          {loginError && (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 sm:p-5 text-left text-xs text-rose-950 shadow-sm animate-in fade-in duration-200 space-y-3">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <div className="font-bold text-sm text-rose-950 flex items-center justify-between">
                    <span>การเข้าสู่ระบบไม่สำเร็จ</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 bg-rose-200/70 rounded text-rose-900 font-normal">
                      Security Alert
                    </span>
                  </div>
                  <p className="text-rose-900 leading-relaxed font-semibold">
                    {loginError}
                  </p>

                  {/* If unauthorized-domain or netlify domain error */}
                  {(loginError.includes('Authorized domains') || loginError.includes('unauthorized-domain')) && (
                    <div className="mt-3 p-3 bg-white rounded-xl border border-rose-300 space-y-2">
                      <div className="text-[11px] font-bold text-rose-900">
                        โดเมนของ Netlify ที่ต้องนำไปใส่ใน Firebase Console:
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 bg-slate-100 border border-slate-300 px-3 py-2 rounded-lg text-slate-900 font-mono text-xs select-all font-bold">
                          {currentHost}
                        </code>
                        <button
                          type="button"
                          onClick={copyCurrentDomain}
                          className="px-3 py-2 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-medium text-xs rounded-lg transition shrink-0 flex items-center space-x-1 cursor-pointer"
                        >
                          {copiedHostname ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedHostname ? 'คัดลอกแล้ว' : 'คัดลอก Domain'}</span>
                        </button>
                      </div>
                      <div className="text-[11px] text-slate-700 leading-relaxed bg-amber-50/80 p-2.5 rounded-lg border border-amber-200">
                        <p className="font-semibold text-amber-900">📌 วิธีแก้ทันทีใน 1 นาที:</p>
                        <ol className="list-decimal list-inside space-y-1 mt-1 text-slate-700">
                          <li>เปิด <strong>Firebase Console</strong> &rarr; เลือกโปรเจกต์ <code>{activeProjectId}</code></li>
                          <li>เมนูซ้าย <strong>Authentication</strong> &rarr; แท็บ <strong>Settings</strong></li>
                          <li>เลื่อนลงไปที่ <strong>Authorized domains</strong> &rarr; กด <strong>Add domain</strong></li>
                          <li>วาง <code>{currentHost}</code> แล้วกด <strong>Save</strong></li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3 pt-2">
            {/* Primary Google Login Button (Popup mode) */}
            <button
              type="button"
              disabled={isLoggingIn}
              onClick={() => handleGoogleLogin(false)}
              className="w-full py-3.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold text-sm shadow-md transition flex items-center justify-center space-x-3 cursor-pointer"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
                  <span>กำลังเชื่อมต่อกับ Google Authentication...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>เข้าสู่ระบบด้วย Google Account (@bu.ac.th)</span>
                </>
              )}
            </button>

            {/* Secondary Button: Redirect Mode for Mobile / Safari */}
            <button
              type="button"
              disabled={isLoggingIn}
              onClick={() => handleGoogleLogin(true)}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-50 active:scale-[0.99] disabled:opacity-60 text-slate-700 font-medium text-xs transition flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Smartphone className="w-4 h-4 text-slate-500" />
              <span>เข้าสู่ระบบด้วย Redirect Mode (กรณีมือถือ / Safari / หน้าต่างป็อปอัปไม่ขึ้น)</span>
            </button>
          </div>

          {/* Interactive Collapsible Checklist for Netlify & Firebase Setup */}
          <div className="pt-2 border-t border-slate-100 text-left">
            <button
              type="button"
              onClick={() => setShowNetlifyGuide(!showNetlifyGuide)}
              className="w-full flex items-center justify-between py-2 text-xs font-semibold text-slate-700 hover:text-indigo-600 transition cursor-pointer"
            >
              <span className="flex items-center space-x-1.5">
                <Globe className="w-4 h-4 text-indigo-500" />
                <span>ขั้นตอนตั้งค่าบน Firebase Console & Netlify สำหรับ {currentHost}</span>
              </span>
              {showNetlifyGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showNetlifyGuide && (
              <div className="mt-3 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-700 space-y-3 animate-in fade-in duration-150">
                <div className="font-bold text-slate-900 flex items-center space-x-1.5">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <span>3 ขั้นตอนสำคัญเพื่อให้ Login บน Netlify สำเร็จ 100%:</span>
                </div>

                <div className="space-y-3">
                  {/* Step 1: Authorized domains */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-2">
                    <strong className="text-indigo-900 block font-semibold text-xs">
                      1. เพิ่ม Domain ใน Firebase Authorized Domains:
                    </strong>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      ไปที่ <strong>Firebase Console</strong> &rarr; เลือกโปรเจกต์ <code>{activeProjectId}</code> &rarr; <strong>Authentication</strong> &rarr; เมนู <strong>Settings</strong> &rarr; เลื่อนลงไปที่ <strong>Authorized domains</strong> &rarr; กด <strong>Add domain</strong> &rarr; เพิ่มโดเมนต่อไปนี้:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="bg-slate-100 border border-slate-200 px-2 py-1 rounded text-indigo-700 font-mono text-[11px] font-bold">
                        {currentHost}
                      </code>
                      <button
                        type="button"
                        onClick={copyCurrentDomain}
                        className="px-2 py-1 bg-slate-800 text-white rounded text-[10px] font-medium hover:bg-slate-700"
                      >
                        {copiedHostname ? 'คัดลอกแล้ว' : 'คัดลอก'}
                      </button>
                    </div>
                  </div>

                  {/* Step 2: Google Cloud Console Credentials */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5">
                    <strong className="text-indigo-900 block font-semibold text-xs">
                      2. ตรวจสอบ Authorized JavaScript origins (Google Cloud Console):
                    </strong>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      เมื่อเปิดใช้งาน Google Sign-In ใน Firebase ระบบจะสร้าง OAuth Client ID ใน Google Cloud Console อัตโนมัติ:
                    </p>
                    <div className="bg-slate-50 p-2 rounded border border-slate-200 text-[11px] font-mono space-y-1">
                      <div><strong>Authorized JavaScript origins:</strong> <code>https://{currentHost}</code></div>
                      <div><strong>Authorized redirect URIs:</strong> <code>https://{activeAuthDomain}/__/auth/handler</code></div>
                    </div>
                  </div>

                  {/* Step 3: Netlify Environment Variables */}
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1.5">
                    <strong className="text-indigo-900 block font-semibold text-xs">
                      3. ตั้งค่า Environment Variables บน Netlify:
                    </strong>
                    <p className="text-slate-600 leading-relaxed text-[11px]">
                      ไปที่ <strong>Netlify Dashboard</strong> &rarr; <strong>Site configuration</strong> &rarr; <strong>Environment variables</strong> &rarr; ใส่คีย์ต่อไปนี้ให้ตรงกับโปรเจกต์:
                    </p>
                    <ul className="space-y-1 bg-slate-50 p-2 rounded border border-slate-200 text-[11px] font-mono text-slate-700">
                      <li><code>VITE_FIREBASE_API_KEY</code> = {resolvedFirebaseConfig.apiKey ? `${resolvedFirebaseConfig.apiKey.slice(0, 8)}...` : '(ของคุณ)'}</li>
                      <li><code>VITE_FIREBASE_AUTH_DOMAIN</code> = {activeAuthDomain}</li>
                      <li><code>VITE_FIREBASE_PROJECT_ID</code> = {activeProjectId}</li>
                      <li><code>VITE_FIREBASE_FIRESTORE_DATABASE_ID</code> = {resolvedFirebaseConfig.firestoreDatabaseId || 'ai-studio-studentscoreport-ce9f300f-6936-4725-995d-393fe9cdc335'}</li>
                    </ul>
                    <p className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded">
                      ⚠️ หลังจากบันทึกค่าใน Netlify แล้ว อย่าลืมกด <strong>Deploys &rarr; Trigger deploy &rarr; Clear cache and deploy site</strong> เพื่อให้เว็บ Build ด้วยค่าใหม่
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-6 px-4 sm:px-6 space-y-6">
      {/* Toast Notification */}
      {notifyMsg && (
        <div className={`p-4 rounded-xl text-sm flex items-center justify-between shadow-xs transition-all ${
          notifyMsg.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
          notifyMsg.type === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-200' :
          'bg-indigo-50 text-indigo-800 border border-indigo-200'
        }`}>
          <div className="flex items-center space-x-2">
            {notifyMsg.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-600" />}
            {notifyMsg.type === 'error' && <XCircle className="w-5 h-5 text-rose-600" />}
            {notifyMsg.type === 'info' && <Info className="w-5 h-5 text-indigo-600" />}
            <span className="font-medium">{notifyMsg.text}</span>
          </div>
          <button onClick={() => setNotifyMsg(null)} className="text-xs font-semibold hover:underline cursor-pointer">
            ปิด
          </button>
        </div>
      )}

      {/* BU Email Notice & Header Banner */}
      <div className="p-4 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
        <div>
          <div className="flex items-center space-x-2">
            <span className="font-bold text-base">{user.displayName || 'อาจารย์ผู้สอน'}</span>
            {isBuEmail ? (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                Verified @bu.ac.th
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                โหมดผู้สอน ({user.email})
              </span>
            )}
          </div>
          <p className="text-xs text-slate-300 mt-0.5">
            สิทธิ์จัดการรายวิชาและควบคุมการประกาศคะแนนผ่าน Firebase Spark Plan (ฟรี 100%)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
          <button
            onClick={() => setShowHowToUseModal(true)}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-200 transition border border-indigo-400/30 cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5 text-indigo-300" />
            <span>ขั้นตอนการใช้งานจริง & Deploy</span>
          </button>
          <button
            onClick={() => setShowGasModal(true)}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 hover:bg-white/20 text-white transition border border-white/20 cursor-pointer"
          >
            <Code className="w-3.5 h-3.5 text-amber-300" />
            <span>สคริปต์ Google Sheets (GAS)</span>
          </button>
          <button
            onClick={() => signOut(auth)}
            className="flex items-center space-x-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 transition border border-rose-500/30 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </div>

      {/* Main Course Bar & Course Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            ระบบบริหารจัดการรายวิชาและคะแนน
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            แบ่งสัดส่วนชัดเจน: (1) จัดการรายวิชาและการประกาศ &nbsp;|&nbsp; (2) ฐานข้อมูลและการรับรองตัวตนนักศึกษา
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {courses.length === 0 && (
            <button
              onClick={handleSeedDemoData}
              disabled={loading}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 shadow-xs transition cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>สร้างข้อมูลตัวอย่าง (Demo Data)</span>
            </button>
          )}

          <button
            onClick={() => setShowAddCourseModal(true)}
            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>เพิ่มรายวิชาใหม่</span>
          </button>
        </div>
      </div>

      {/* Course Selector Tabs */}
      {courses.length > 0 && (
        <div className="flex items-center space-x-2 overflow-x-auto pb-1 scrollbar-thin">
          {courses.map(course => {
            const isSelected = activeCourse?.id === course.id;
            return (
              <button
                key={course.id}
                onClick={() => selectCourse(course)}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition flex items-center space-x-2.5 border cursor-pointer ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-indigo-500/20'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <span>{course.courseCode}</span>
                <span className={`w-2 h-2 rounded-full ${course.isPublished ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                <span className="text-[11px] text-slate-400">({course.courseName})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* WORKSPACE FOR SELECTED COURSE */}
      {activeCourse ? (
        <div className="space-y-6">
          {/* Sub-Section View Selector (Segmented Tabs) */}
          <div className="flex bg-slate-200/80 p-1.5 rounded-2xl w-full sm:w-fit space-x-1 text-xs sm:text-sm font-bold">
            <button
              onClick={() => setActiveSectionView('course_mgmt')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer ${
                activeSectionView === 'course_mgmt'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sliders className="w-4 h-4 text-indigo-600" />
              <span>การจัดการรายวิชาและคะแนน</span>
            </button>

            <button
              onClick={() => setActiveSectionView('student_db')}
              className={`flex-1 sm:flex-none px-4 py-2 rounded-xl transition flex items-center justify-center space-x-2 cursor-pointer ${
                activeSectionView === 'student_db'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Database className="w-4 h-4 text-emerald-600" />
              <span>ฐานข้อมูลนักศึกษา</span>
            </button>
          </div>

          {/* ============================================================ */}
          {/* การจัดการรายวิชาและคะแนน (Course & Grade Management) */}
          {/* ============================================================ */}
          {activeSectionView === 'course_mgmt' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
              {/* Module 1 Header */}
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 flex items-center">
                      <span>การจัดการรายวิชาและคะแนน</span>
                    </h3>
                    <p className="text-xs text-slate-500">
                      ควบคุมการเปิด/ปิดประกาศคะแนนแยกตามกลุ่มเรียน (Section) และจัดการข้อมูลรายวิชา
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={handleOpenEditCourse}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 transition cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>แก้ไขข้อมูลวิชา</span>
                  </button>

                  <button
                    onClick={() => setCourseToDelete(activeCourse)}
                    className="flex items-center space-x-1 px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>ลบวิชา</span>
                  </button>
                </div>
              </div>

              {/* Course Profile Summary Banner */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 block uppercase">รหัสวิชา</span>
                  <span className="text-lg font-black font-mono text-indigo-900 block mt-0.5">{activeCourse.courseCode}</span>
                </div>
                <div className="md:col-span-2">
                  <span className="text-[11px] font-semibold text-slate-400 block uppercase">ชื่อรายวิชา</span>
                  <span className="text-base font-bold text-slate-800 block mt-0.5">{activeCourse.courseName}</span>
                </div>
                <div>
                  <span className="text-[11px] font-semibold text-slate-400 block uppercase">ภาคการศึกษา / นักศึกษา</span>
                  <span className="text-sm font-semibold text-slate-700 block mt-0.5">
                    {activeCourse.semester} &nbsp;|&nbsp; {students.length} คน
                  </span>
                </div>
              </div>

              {/* Section-Level Visibility Controls (แยกตามกลุ่มเรียน) */}
              <div className="bg-slate-50/70 p-5 sm:p-6 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center">
                      <Sliders className="w-4 h-4 text-indigo-600 mr-1.5" />
                      แยกตามกลุ่มเรียน (SECTION-LEVEL VISIBILITY)
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">
                      เปิดหรือปิดประกาศคะแนนแยกแต่ละกลุ่มเรียนได้อิสระ
                    </p>
                  </div>

                  <div className="flex items-center space-x-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => handleBulkSetSectionsPublish(true)}
                      className="text-xs font-bold text-emerald-700 hover:text-emerald-800 transition cursor-pointer"
                    >
                      เปิดทุก Sec
                    </button>
                    <span className="text-slate-300 font-light">|</span>
                    <button
                      type="button"
                      onClick={() => handleBulkSetSectionsPublish(false)}
                      className="text-xs font-bold text-rose-600 hover:text-rose-700 transition cursor-pointer"
                    >
                      ปิดทุก Sec
                    </button>
                  </div>
                </div>

                {/* Section Toggles Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {(activeCourse.sections || ['Sec 101']).map(sec => {
                    const isSecPublished = (activeCourse.publishedSections || []).includes(sec);
                    const countInSec = students.filter(s => s.sec === sec).length;

                    return (
                      <div 
                        key={sec}
                        className={`p-4 rounded-xl border transition flex items-center justify-between ${
                          isSecPublished
                            ? 'bg-white border-emerald-300 shadow-2xs ring-1 ring-emerald-400/20'
                            : 'bg-white/70 border-slate-200 opacity-80'
                        }`}
                      >
                        <div>
                          <div className="font-bold text-sm text-slate-900 flex items-center">
                            <span>{sec}</span>
                            <span className={`ml-2 w-2 h-2 rounded-full ${isSecPublished ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                          </div>
                          <span className="text-[11px] text-slate-500 mt-0.5 block">
                            นักศึกษา {countInSec} คน &nbsp;•&nbsp; {isSecPublished ? 'ประกาศอยู่' : 'ปิดประกาศ'}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleToggleSectionPublish(sec)}
                          className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1 ${
                            isSecPublished
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 shadow-2xs'
                              : 'bg-slate-100 text-slate-600 border border-slate-300 hover:bg-slate-200'
                          }`}
                        >
                          <span>{isSecPublished ? 'เปิดอยู่' : 'ปิดอยู่'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* ฐานข้อมูลนักศึกษา (Student Database & Authentication) */}
          {/* ============================================================ */}
          {activeSectionView === 'student_db' && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
              {/* Module 2 Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      ฐานข้อมูลนักศึกษา
                    </h3>
                    <p className="text-xs text-slate-500">
                      จัดเก็บคะแนนสอบ/คะแนนเก็บตาม Sec, ตรวจสอบสถานะการตั้งรหัสผ่าน 6 หลัก, และแก้ไขคะแนนแบบทันที
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200 transition cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>นำเข้า CSV</span>
                  </button>

                  <button
                    onClick={() => exportToCSV(students, activeCourse.courseCode, activeCourse.courseName)}
                    disabled={students.length === 0}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 disabled:opacity-40 transition cursor-pointer shadow-2xs"
                  >
                    <Download className="w-4 h-4" />
                    <span>ส่งออก CSV</span>
                  </button>

                  <button
                    onClick={() => setShowAddStudentModal(true)}
                    className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>+ เพิ่มนักศึกษา</span>
                  </button>

                  <button
                    onClick={() => {
                      setDeleteBatchMode(secFilter !== 'ALL' ? 'section' : 'all');
                      setSelectedSectionToDelete(secFilter !== 'ALL' ? secFilter : (availableSections[0] || ''));
                      setShowDeleteBatchModal(true);
                    }}
                    disabled={students.length === 0}
                    className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 disabled:opacity-40 transition cursor-pointer shadow-2xs"
                    title="ลบข้อมูลนักศึกษาทั้งหมด หรือลบแยกตามกลุ่มเรียน (Section)"
                  >
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span>ลบข้อมูลนักศึกษา</span>
                  </button>
                </div>
              </div>

              {/* Student Authentication & Roster Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500 block uppercase">นักศึกษาทั้งหมด</span>
                  <div className="flex items-baseline space-x-1 mt-1">
                    <span className="text-2xl font-black text-slate-900">{totalStudentsCount}</span>
                    <span className="text-xs text-slate-400">คน</span>
                  </div>
                </div>

                <div className="bg-emerald-50/60 rounded-2xl p-3.5 border border-emerald-200">
                  <span className="text-[11px] font-bold text-emerald-800 block uppercase flex items-center">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1 text-emerald-600" /> ตั้งรหัส PIN แล้ว
                  </span>
                  <div className="flex items-baseline space-x-1 mt-1">
                    <span className="text-2xl font-black text-emerald-700">{pinActiveCount}</span>
                    <span className="text-xs text-emerald-600">คน (พร้อมดูคะแนน)</span>
                  </div>
                </div>

                <div className="bg-amber-50/60 rounded-2xl p-3.5 border border-amber-200">
                  <span className="text-[11px] font-bold text-amber-800 block uppercase flex items-center">
                    <Clock className="w-3.5 h-3.5 mr-1 text-amber-600" /> รอยืนยันตัวตนครั้งแรก
                  </span>
                  <div className="flex items-baseline space-x-1 mt-1">
                    <span className="text-2xl font-black text-amber-700">{pinPendingCount}</span>
                    <span className="text-xs text-amber-600">คน (ยังไม่ตั้ง PIN)</span>
                  </div>
                </div>

                <div className="bg-rose-50/60 rounded-2xl p-3.5 border border-rose-200">
                  <span className="text-[11px] font-bold text-rose-800 block uppercase flex items-center">
                    <Lock className="w-3.5 h-3.5 mr-1 text-rose-600" /> บัญชีที่ติดล็อก
                  </span>
                  <div className="flex items-baseline space-x-1 mt-1">
                    <span className="text-2xl font-black text-rose-700">{lockedCount}</span>
                    <span className="text-xs text-rose-600">คน (ผิดเกิน 5 ครั้ง)</span>
                  </div>
                </div>
              </div>

              {/* Search & Filters */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <div className="relative w-full sm:w-64">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      placeholder="ค้นหารหัส หรือชื่อนักศึกษา..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-600"
                    />
                  </div>

                  {availableSections.length > 1 && (
                    <select
                      value={secFilter}
                      onChange={e => setSecFilter(e.target.value)}
                      className="py-2 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none cursor-pointer"
                    >
                      <option value="ALL">ทุก Sec</option>
                      {availableSections.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  )}

                  {secFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteBatchMode('section');
                        setSelectedSectionToDelete(secFilter);
                        setShowDeleteBatchModal(true);
                      }}
                      className="text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-2 rounded-xl border border-rose-200 flex items-center space-x-1.5 transition cursor-pointer shadow-2xs"
                      title={`ลบข้อมูลนักศึกษาเฉพาะกลุ่ม ${secFilter}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>ลบเฉพาะ {secFilter}</span>
                    </button>
                  )}

                  <select
                    value={authStatusFilter}
                    onChange={e => setAuthStatusFilter(e.target.value as any)}
                    className="py-2 px-3 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-none cursor-pointer"
                  >
                    <option value="ALL">สถานะ Auth: ทั้งหมด</option>
                    <option value="HAS_PIN">ตั้งรหัสผ่าน 6 หลักแล้ว</option>
                    <option value="PENDING">รอยืนยันตัวตนครั้งแรก</option>
                    <option value="LOCKED">บัญชีที่ติดล็อก</option>
                  </select>
                </div>

                <div className="text-xs text-slate-500 self-end sm:self-center">
                  แสดง {filteredStudents.length} จาก {students.length} รายการ
                </div>
              </div>

              {/* Comprehensive Student Table */}
              {filteredStudents.length === 0 ? (
                <div className="p-8 text-center text-slate-500 border border-dashed border-slate-200 rounded-2xl space-y-3">
                  <Users className="w-10 h-10 mx-auto text-slate-300" />
                  <div>
                    <p className="text-sm font-bold text-slate-800">ยังไม่มีข้อมูลนักศึกษาในวิชานี้ หรือไม่พบตามตัวกรอง</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      สามารถนำเข้าไฟล์ CSV ข้อมูลนักศึกษาพร้อมคะแนน (UTF-8) หรือเพิ่มทีละคนด้วยตนเอง
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    <button
                      onClick={() => setShowImportModal(true)}
                      className="flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm shadow-indigo-200 transition cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>นำเข้าไฟล์ CSV (แนะนำ)</span>
                    </button>
                    <button
                      onClick={() => setShowAddStudentModal(true)}
                      className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>+ เพิ่มนักศึกษา</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                  <table className="w-full text-left border-collapse text-xs sm:text-sm">
                    <thead>
                      <tr className="bg-slate-100/80 border-b border-slate-200 text-slate-700 uppercase text-[11px] font-bold tracking-wider">
                        <th className="py-3 px-3 text-center w-12">ลำดับ</th>
                        <th className="py-3 px-3">รหัสนักศึกษา</th>
                        <th className="py-3 px-3">ชื่อ - นามสกุล</th>
                        <th className="py-3 px-3 text-center">Sec</th>
                        <th className="py-3 px-2 text-center" title="เข้าเรียน (ATTEND)">ATTEND (10)</th>
                        <th className="py-3 px-2 text-center" title="งานในชั้นเรียน (CLASS ACTIVITY)">ACTIVITY (10)</th>
                        <th className="py-3 px-2 text-center" title="การบ้าน (ASSIGNMENT)">ASSIGN (20)</th>
                        <th className="py-3 px-2 text-center" title="สอบกลางภาค (MIDTERM)">MIDTERM (25)</th>
                        <th className="py-3 px-2 text-center font-black text-indigo-950 bg-indigo-50/70" title="รวม (TOTAL)">
                          TOTAL (65)
                        </th>
                        <th className="py-3 px-3 text-center min-w-[140px]">สถานะ Auth (PIN)</th>
                        <th className="py-3 px-3 text-center w-28">การจัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredStudents.map(student => {
                        const isEditing = editingStudentId === student.studentId;
                        const s = student.scores;

                        return (
                          <tr key={student.studentId} className="hover:bg-slate-50/70 transition">
                            <td className="py-3 px-3 text-center font-mono text-slate-400">
                              {student.no}
                            </td>
                            <td className="py-3 px-3 font-mono font-bold text-slate-900">
                              {student.studentId}
                            </td>
                            <td className="py-3 px-3 font-medium text-slate-800">
                              <div>{student.name}</div>
                              {student.email && (
                                <div className="text-[11px] text-slate-400 font-normal">{student.email}</div>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-slate-100 text-slate-700">
                                {student.sec}
                              </span>
                            </td>

                            {/* Scores Fields with Inline Edit */}
                            {isEditing ? (
                              <>
                                <td className="py-2 px-1 text-center">
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="10"
                                    value={editScoreValues.ATTEN ?? ''}
                                    onChange={e => setEditScoreValues({ ...editScoreValues, ATTEN: e.target.value })}
                                    className="w-14 py-1 px-1 text-center border border-indigo-400 rounded-md text-xs font-bold focus:ring-1 focus:ring-indigo-600"
                                  />
                                </td>
                                <td className="py-2 px-1 text-center">
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="10"
                                    value={editScoreValues.CA ?? ''}
                                    onChange={e => setEditScoreValues({ ...editScoreValues, CA: e.target.value })}
                                    className="w-14 py-1 px-1 text-center border border-indigo-400 rounded-md text-xs font-bold focus:ring-1 focus:ring-indigo-600"
                                  />
                                </td>
                                <td className="py-2 px-1 text-center">
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="20"
                                    value={editScoreValues.AS ?? ''}
                                    onChange={e => setEditScoreValues({ ...editScoreValues, AS: e.target.value })}
                                    className="w-14 py-1 px-1 text-center border border-indigo-400 rounded-md text-xs font-bold focus:ring-1 focus:ring-indigo-600"
                                  />
                                </td>
                                <td className="py-2 px-1 text-center">
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="25"
                                    value={editScoreValues.MID ?? ''}
                                    onChange={e => setEditScoreValues({ ...editScoreValues, MID: e.target.value })}
                                    className="w-14 py-1 px-1 text-center border border-indigo-400 rounded-md text-xs font-bold focus:ring-1 focus:ring-indigo-600"
                                  />
                                </td>
                                <td className="py-2 px-1 text-center bg-indigo-50/70">
                                  <input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max="65"
                                    value={editScoreValues.TOTAL ?? ''}
                                    onChange={e => setEditScoreValues({ ...editScoreValues, TOTAL: e.target.value })}
                                    className="w-16 py-1 px-1 text-center border border-amber-400 rounded-md text-xs font-black text-indigo-900 bg-amber-50 focus:ring-1 focus:ring-indigo-600"
                                  />
                                </td>
                              </>
                            ) : (
                              <>
                                <td className="py-3 px-2 text-center font-semibold text-slate-700">
                                  {s.ATTEN ?? '-'}
                                </td>
                                <td className="py-3 px-2 text-center font-semibold text-slate-700">
                                  {s.CA ?? '-'}
                                </td>
                                <td className="py-3 px-2 text-center font-semibold text-slate-700">
                                  {s.AS ?? '-'}
                                </td>
                                <td className="py-3 px-2 text-center font-semibold text-indigo-700">
                                  {s.MID ?? '-'}
                                </td>
                                <td className="py-3 px-2 text-center font-black text-indigo-950 bg-indigo-50/70">
                                  {s.TOTAL ?? '-'}
                                </td>
                              </>
                            )}

                            {/* Authentication / PIN Status Column */}
                            <td className="py-3 px-3 text-center">
                              {student.isLocked ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800">
                                  <Lock className="w-3 h-3 mr-1 text-rose-600" /> ระงับชั่วคราว
                                </span>
                              ) : student.hasPin ? (
                                <div className="inline-flex flex-col items-center">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800">
                                    <ShieldCheck className="w-3 h-3 mr-1 text-emerald-600" /> ตั้งรหัสแล้ว (SHA-256)
                                  </span>
                                  {(student.failedAttempts || 0) > 0 && (
                                    <span className="text-[10px] text-amber-600 mt-0.5">
                                      ผิด {student.failedAttempts}/5 ครั้ง
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-800">
                                  <KeyRound className="w-3 h-3 mr-1 text-amber-600" /> รอตั้งรหัสครั้งแรก
                                </span>
                              )}
                            </td>

                            {/* Action Buttons: Edit, Save, Reset PIN, Delete */}
                            <td className="py-3 px-3 text-center">
                              <div className="flex items-center justify-center space-x-1.5">
                                {isEditing ? (
                                  <button
                                    onClick={() => handleSaveScoreEdit(student.studentId)}
                                    title="บันทึกคะแนน"
                                    className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition cursor-pointer"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleStartEdit(student)}
                                    title="แก้ไขคะแนน (Manual Override)"
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition cursor-pointer"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                )}

                                <button
                                  onClick={() => setStudentToResetPin({ id: student.studentId, name: student.name })}
                                  title="รีเซ็ตรหัสผ่าน 6 หลัก (กรณีนักศึกษาลืมรหัส PIN)"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-amber-50 transition cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                </button>

                                <button
                                  onClick={() => setStudentToDelete(student)}
                                  title="ลบนักศึกษา"
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white rounded-3xl border border-slate-200 p-12 text-center shadow-xs">
          <BookOpen className="w-12 h-12 text-indigo-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-slate-800">ยังไม่มีรายวิชาที่สร้าง</h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1 mb-5">
            เริ่มต้นด้วยการสร้างรายวิชาใหม่ หรือคลิกสร้างข้อมูลตัวอย่างเพื่อทดสอบระบบได้ทันที
          </p>
          <div className="flex items-center justify-center space-x-3">
            <button
              onClick={() => setShowAddCourseModal(true)}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition cursor-pointer flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>เพิ่มรายวิชา</span>
            </button>
            <button
              onClick={handleSeedDemoData}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition cursor-pointer flex items-center space-x-1.5"
            >
              <Sparkles className="w-4 h-4 text-amber-600" />
              <span>สร้างข้อมูลตัวอย่าง</span>
            </button>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: HOW TO USE & DEPLOY GUIDE */}
      {/* ============================================================ */}
      {showHowToUseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <HelpCircle className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-900">
                  คู่มือขั้นตอนการนำระบบไปใช้งานจริง (How to Use & Deploy)
                </h3>
              </div>
              <button
                onClick={() => setShowHowToUseModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-4 overflow-y-auto text-xs sm:text-sm text-slate-700 leading-relaxed">
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-indigo-950">
                <h4 className="font-bold flex items-center mb-1">
                  <Sparkles className="w-4 h-4 mr-1 text-indigo-600" />
                  สถาปัตยกรรมไร้เซิร์ฟเวอร์ ฟรี 100% (Firebase Spark + Netlify)
                </h4>
                <p>
                  ระบบนี้ทำงานโดยตรงบน Firebase Spark Plan อ่านข้อมูลเพียง 1 Doc ต่อการตรวจคะแนน 1 ครั้ง 
                  และ Deploy เป็นเว็บ Static SPA บน Netlify ได้โดยไม่ต้องมีเซิร์ฟเวอร์ Google Cloud Run ใดๆ ทั้งสิ้น
                </p>
              </div>

              {/* Step 1 */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-1.5">
                <h5 className="font-bold text-slate-900 flex items-center">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs mr-2">1</span>
                  ขั้นตอนที่ 1: อาจารย์จัดการวิชาและนำเข้าคะแนน
                </h5>
                <ul className="list-disc list-inside space-y-1 text-slate-600 pl-6 text-xs">
                  <li>กด <strong>"+ เพิ่มรายวิชาใหม่"</strong> เพื่อระบุรหัสวิชา, ชื่อวิชา, ภาคการศึกษา และกลุ่มเรียน (Sec 101, Sec 102)</li>
                  <li>กด <strong>"นำเข้า CSV"</strong> เพื่ออัปโหลดไฟล์ Excel/CSV ที่มีคะแนน ATTEN, CA, AS, MID, TOTAL (มีปุ่มโหลด Template ให้)</li>
                  <li>ใช้สวิตช์ใน <strong>ส่วนที่ 1</strong> เพื่อเปิด/ปิดประกาศระดับวิชา หรือแยกเปิด/ปิดตาม Sec ตามต้องการ</li>
                </ul>
              </div>

              {/* Step 2 */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-1.5">
                <h5 className="font-bold text-slate-900 flex items-center">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs mr-2">2</span>
                  ขั้นตอนที่ 2: นักศึกษาเข้าตรวจสอบคะแนน
                </h5>
                <ul className="list-disc list-inside space-y-1 text-slate-600 pl-6 text-xs">
                  <li>ส่งลิงก์เว็บไซต์ให้นักศึกษาเข้าใช้งานผ่านมือถือ (Chrome บน Android, Safari บน iOS หรือคอมพิวเตอร์)</li>
                  <li>นักศึกษาสลับไปที่แท็บ <strong>"สำหรับนักศึกษา"</strong> แล้วกรอกรหัสนักศึกษา</li>
                  <li><strong>เข้าใช้งานครั้งแรก</strong>: ระบบจะให้นักศึกษาตั้งรหัส PIN 6 หลักด้วยตนเอง (ระบบเข้ารหัส SHA-256 with Salt ปลอดภัย)</li>
                  <li><strong>ครั้งถัดไป</strong>: กรอกรหัส PIN 6 หลักเพื่อเข้าดูคะแนนทันที (แสดงเฉพาะวิชาและ Sec ที่อาจารย์เปิดประกาศ)</li>
                </ul>
              </div>

              {/* Step 3 */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-1.5">
                <h5 className="font-bold text-slate-900 flex items-center">
                  <span className="w-6 h-6 rounded-full bg-amber-600 text-white flex items-center justify-center text-xs mr-2">3</span>
                  ขั้นตอนที่ 3: อาจารย์แก้ไขคะแนนหรือรีเซ็ตรหัสผ่านให้นักศึกษา
                </h5>
                <ul className="list-disc list-inside space-y-1 text-slate-600 pl-6 text-xs">
                  <li>หากคะแนนมีการเปลี่ยนแปลง อาจารย์กดไอคอน <strong>ดินสอ</strong> ในตารางเพื่อแก้ไขคะแนน (คะแนนจะอัปเดตไปแสดงผลให้นักศึกษาทันที)</li>
                  <li>หากนักศึกษาลืมรหัส PIN 6 หลัก อาจารย์กดไอคอน <strong>รีเซ็ต</strong> ในตาราง เพื่อให้นักศึกษาตั้งรหัสใหม่ได้ทันที</li>
                </ul>
              </div>

              {/* Step 4 */}
              <div className="border border-slate-200 rounded-2xl p-4 space-y-1.5">
                <h5 className="font-bold text-slate-900 flex items-center">
                  <span className="w-6 h-6 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs mr-2">4</span>
                  ขั้นตอนที่ 4: การนำขึ้น Netlify และเชื่อมต่อ GitHub
                </h5>
                <p className="text-slate-600 pl-6 text-xs">
                  โปรเจกต์นี้มีไฟล์ <code>netlify.toml</code> อยู่แล้ว เพียง Push ขึ้น GitHub แล้วเชื่อมต่อไปยัง Netlify จากนั้นคลิก Deploy ไซต์จะพร้อมใช้งานออนไลน์ทันที
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 text-right mt-auto">
              <button
                type="button"
                onClick={() => setShowHowToUseModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-semibold hover:bg-slate-800 transition cursor-pointer"
              >
                เข้าใจแล้ว
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD NEW COURSE */}
      {showAddCourseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center">
                <Plus className="w-5 h-5 text-indigo-600 mr-2" />
                เพิ่มรายวิชาใหม่
              </h3>
              <button
                type="button"
                disabled={isCreatingCourse}
                onClick={() => {
                  if (isCreatingCourse) return;
                  setShowAddCourseModal(false);
                  setNewCourseCode('');
                  setNewCourseName('');
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition cursor-pointer disabled:opacity-40"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  รหัสวิชา (Course Code) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  placeholder="เช่น CS211 หรือ IT202"
                  value={newCourseCode}
                  onChange={e => setNewCourseCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-600 focus:outline-none font-mono uppercase font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ชื่อวิชา (Course Name) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="เช่น การเขียนโปรแกรมบนเว็บและคลาวด์"
                  value={newCourseName}
                  onChange={e => setNewCourseName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ภาคการศึกษา (Semester)
                </label>
                <input
                  type="text"
                  placeholder="เช่น 1/2569"
                  value={newSemester}
                  onChange={e => setNewSemester(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  กลุ่มเรียน (Sections) คั่นด้วยจุลภาค
                </label>
                <input
                  type="text"
                  placeholder="เช่น Sec 101, Sec 102"
                  value={newSections}
                  onChange={e => setNewSections(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-indigo-600 focus:outline-none"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  * กำหนดกลุ่มเรียนที่ต้องการเปิดประกาศ
                </p>
              </div>

              <div className="flex space-x-3 pt-3">
                <button
                  type="button"
                  disabled={isCreatingCourse}
                  onClick={() => {
                    if (isCreatingCourse) return;
                    setShowAddCourseModal(false);
                    setNewCourseCode('');
                    setNewCourseName('');
                  }}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-40"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isCreatingCourse || !newCourseCode.trim() || !newCourseName.trim()}
                  className="w-1/2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white text-sm font-semibold transition shadow-sm shadow-indigo-200 disabled:opacity-50 cursor-pointer flex items-center justify-center space-x-1.5"
                >
                  {isCreatingCourse ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-200" />
                      <span>กำลังสร้าง...</span>
                    </>
                  ) : (
                    <span>สร้างรายวิชา</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT EXISTING COURSE */}
      {showEditCourseModal && activeCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center">
                <Edit2 className="w-5 h-5 text-amber-600 mr-2" />
                แก้ไขข้อมูลรายวิชา
              </h3>
              <button
                onClick={() => setShowEditCourseModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditCourse} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  รหัสวิชา (Course Code) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="เช่น CS211 หรือ IT202"
                  value={editCourseCode}
                  onChange={e => setEditCourseCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none font-mono uppercase font-bold"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ชื่อวิชา (Course Name) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="เช่น การเขียนโปรแกรมบนเว็บและคลาวด์"
                  value={editCourseName}
                  onChange={e => setEditCourseName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  ภาคการศึกษา (Semester)
                </label>
                <input
                  type="text"
                  placeholder="เช่น 1/2569"
                  value={editSemester}
                  onChange={e => setEditSemester(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  กลุ่มเรียน (Sections) คั่นด้วยจุลภาค
                </label>
                <input
                  type="text"
                  placeholder="เช่น Sec 101, Sec 102"
                  value={editSections}
                  onChange={e => setEditSections(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  * กำหนดกลุ่มเรียนที่ต้องการเปิดประกาศ
                </p>
              </div>

              <div className="flex space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowEditCourseModal(false)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={loading || !editCourseCode.trim() || !editCourseName.trim()}
                  className="w-1/2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition shadow-sm shadow-amber-200 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IN-APP CONFIRMATION MODAL: DELETE COURSE */}
      {courseToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-1">
              ยืนยันการลบรายวิชา
            </h3>

            <p className="text-sm text-slate-600 mb-4">
              คุณต้องการลบรายวิชา <strong className="text-slate-900">{courseToDelete.courseCode} ({courseToDelete.courseName})</strong> ออกจากระบบใช่หรือไม่?
              <br />
              <span className="text-xs text-rose-600 mt-1 block">
                * ข้อมูลนักศึกษาและคะแนนทั้งหมดในวิชานี้จะถูกลบออก และนักศึกษาจะไม่สามารถดูคะแนนวิชานี้ได้อีก
              </span>
            </p>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setCourseToDelete(null)}
                className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => executeDeleteCourse(courseToDelete.id)}
                className="w-1/2 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition shadow-sm shadow-rose-200 disabled:opacity-50 cursor-pointer flex items-center justify-center space-x-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>{loading ? 'กำลังลบ...' : 'ยืนยันลบวิชานี้'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP CONFIRMATION MODAL: DELETE STUDENT */}
      {studentToDelete && activeCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 mb-4">
              <Trash2 className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-1">
              ลบนักศึกษาออกจากรายวิชา
            </h3>

            <p className="text-sm text-slate-600 mb-4">
              ต้องการลบ <strong className="text-slate-900">{studentToDelete.name} (รหัส {studentToDelete.studentId})</strong> ออกจากวิชา {activeCourse.courseCode} หรือไม่?
            </p>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => executeDeleteStudent(studentToDelete.studentId)}
                className="w-1/2 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition cursor-pointer"
              >
                {loading ? 'กำลังลบ...' : 'ยืนยันลบ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP CONFIRMATION MODAL: BATCH DELETE STUDENTS (All or by Section) */}
      {showDeleteBatchModal && activeCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600">
                  <Trash2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    ลบข้อมูลนักศึกษา
                  </h3>
                  <p className="text-xs text-slate-500">
                    วิชา {activeCourse.courseCode}: {activeCourse.courseName}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDeleteBatchModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-3.5">
              เลือกรูปแบบการลบข้อมูลคะแนนและรายชื่อนักศึกษาออกจากระบบ:
            </p>

            {/* 2 Options */}
            <div className="space-y-3 mb-5">
              {/* Option 1: ลบข้อมูลนักศึกษาตามกลุ่มเรียน (Delete Students by Section) */}
              <div
                onClick={() => setDeleteBatchMode('section')}
                className={`p-4 rounded-2xl border-2 transition cursor-pointer ${
                  deleteBatchMode === 'section'
                    ? 'border-indigo-600 bg-indigo-50/40 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-start">
                  <input
                    type="radio"
                    name="deleteBatchOption"
                    checked={deleteBatchMode === 'section'}
                    onChange={() => setDeleteBatchMode('section')}
                    className="mt-1 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <div className="ml-3 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900">
                        ลบข้อมูลนักศึกษาตามกลุ่มเรียน (Delete by Section)
                      </span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800">
                        เลือก Sec
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      ลบเฉพาะข้อมูลนักศึกษาในกลุ่มเรียนที่เลือก โดยไม่กระทบกับกลุ่มเรียนอื่น
                    </p>

                    {deleteBatchMode === 'section' && (
                      <div className="mt-3 pt-3 border-t border-indigo-100/80">
                        <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                          เลือกกลุ่มเรียนที่ต้องการลบ:
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {availableSections.length > 0 ? (
                            availableSections.map(sec => {
                              const countInSec = students.filter(s => s.sec === sec).length;
                              const isSelected = selectedSectionToDelete === sec;
                              return (
                                <button
                                  type="button"
                                  key={sec}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedSectionToDelete(sec);
                                  }}
                                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between ${
                                    isSelected
                                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                                      : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                                  }`}
                                >
                                  <span className="font-bold text-xs">{sec}</span>
                                  <span className={`text-[11px] ${isSelected ? 'text-indigo-100 font-semibold' : 'text-slate-400'}`}>
                                    {countInSec} คน
                                  </span>
                                </button>
                              );
                            })
                          ) : (
                            <div className="col-span-2 text-xs text-slate-400 py-1">
                              ไม่พบกลุ่มเรียนที่มีนักศึกษาในวิชานี้
                            </div>
                          )}
                        </div>

                        {selectedSectionToDelete && (
                          <div className="mt-2.5 text-xs text-amber-800 bg-amber-50 p-2.5 rounded-xl border border-amber-200 flex items-center space-x-1.5">
                            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>
                              จะลบนักศึกษาใน <strong>{selectedSectionToDelete}</strong> ทั้งหมดจำนวน{' '}
                              <strong>{students.filter(s => s.sec === selectedSectionToDelete).length} คน</strong>
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Option 2: ลบข้อมูลนักศึกษาทั้งหมด (Delete All Students) */}
              <div
                onClick={() => setDeleteBatchMode('all')}
                className={`p-4 rounded-2xl border-2 transition cursor-pointer ${
                  deleteBatchMode === 'all'
                    ? 'border-rose-600 bg-rose-50/50 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-start">
                  <input
                    type="radio"
                    name="deleteBatchOption"
                    checked={deleteBatchMode === 'all'}
                    onChange={() => setDeleteBatchMode('all')}
                    className="mt-1 text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <div className="ml-3 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-900">
                        ลบข้อมูลนักศึกษาทั้งหมด (Delete All Students)
                      </span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800">
                        ลบทุก Sec ({students.length} คน)
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      ล้างข้อมูลคะแนนและรายชื่อนักศึกษาทั้งหมดในวิชา {activeCourse.courseCode} เพื่อเริ่มต้นใหม่
                    </p>

                    {deleteBatchMode === 'all' && (
                      <div className="mt-2.5 text-xs text-rose-800 bg-rose-50 p-2.5 rounded-xl border border-rose-200 flex items-center space-x-1.5">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>
                          คำเตือน: ข้อมูลนักศึกษาทั้งหมด <strong>{students.length} คน</strong> ในทุกกลุ่มเรียนจะถูกลบออกจากระบบทันที
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteBatchModal(false)}
                className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={
                  loading ||
                  students.length === 0 ||
                  (deleteBatchMode === 'section' && (!selectedSectionToDelete || students.filter(s => s.sec === selectedSectionToDelete).length === 0))
                }
                onClick={executeBatchDeleteStudents}
                className="w-1/2 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold transition cursor-pointer shadow-md shadow-rose-200 disabled:opacity-40 flex items-center justify-center space-x-1.5"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>กำลังลบข้อมูล...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>
                      {deleteBatchMode === 'all'
                        ? `ยืนยันลบทั้งหมด (${students.length} คน)`
                        : `ยืนยันลบ ${selectedSectionToDelete || 'กลุ่มเรียน'}`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IN-APP CONFIRMATION MODAL: RESET PIN */}
      {studentToResetPin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mb-4">
              <RotateCcw className="w-6 h-6" />
            </div>

            <h3 className="text-lg font-bold text-slate-900 mb-1">
              รีเซ็ตรหัสผ่าน PIN 6 หลัก
            </h3>

            <p className="text-sm text-slate-600 mb-4">
              ต้องการรีเซ็ตรหัสผ่านของ <strong className="text-slate-900">{studentToResetPin.name} (รหัส {studentToResetPin.id})</strong> หรือไม่?
              <br />
              <span className="text-xs text-amber-700 mt-1 block">
                * เมื่อรีเซ็ตแล้ว นักศึกษาจะสามารถตั้งรหัสผ่านใหม่ได้ทันทีในการเข้าสู่ระบบครั้งถัดไป
              </span>
            </p>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setStudentToResetPin(null)}
                className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => executeResetStudentPin(studentToResetPin.id)}
                className="w-1/2 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold transition cursor-pointer"
              >
                {loading ? 'กำลังรีเซ็ต...' : 'ยืนยันรีเซ็ต PIN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD STUDENT MANUALLY */}
      {showAddStudentModal && activeCourse && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center">
              <UserPlus className="w-5 h-5 text-emerald-600 mr-2" />
              เพิ่มนักศึกษาในวิชา {activeCourse.courseCode}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              กรอกข้อมูลเพื่อบันทึกคะแนนรายบุคคลโดยตรง
            </p>

            <form onSubmit={handleAddStudentManually} className="space-y-3.5">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ลำดับ (No.)</label>
                  <input
                    type="number"
                    placeholder="1"
                    value={newStudentNo}
                    onChange={e => setNewStudentNo(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600 text-center font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">รหัสนักศึกษา *</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น 1650700088"
                    value={newStudentId}
                    onChange={e => setNewStudentId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600 font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ชื่อ - นามสกุล *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น นายธนากร สุขใจ"
                  value={newStudentName}
                  onChange={e => setNewStudentName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">กลุ่มเรียน (Sec) *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น Sec 101"
                  value={newStudentSec}
                  onChange={e => setNewStudentSec(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              {/* Scores inputs */}
              <div className="pt-2 border-t border-slate-100">
                <span className="text-xs font-semibold text-slate-700 block mb-2">คะแนนแต่ละหัวข้อ:</span>
                <div className="grid grid-cols-5 gap-1.5 text-center">
                  <div>
                    <label className="text-[10px] text-slate-500 block">ATTEN(10)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="10"
                      value={newScores.ATTEN}
                      onChange={e => setNewScores({ ...newScores, ATTEN: Number(e.target.value) })}
                      className="w-full p-1.5 border border-slate-300 rounded-lg text-xs font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">CA(10)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="10"
                      value={newScores.CA}
                      onChange={e => setNewScores({ ...newScores, CA: Number(e.target.value) })}
                      className="w-full p-1.5 border border-slate-300 rounded-lg text-xs font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">AS(20)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="20"
                      value={newScores.AS}
                      onChange={e => setNewScores({ ...newScores, AS: Number(e.target.value) })}
                      className="w-full p-1.5 border border-slate-300 rounded-lg text-xs font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-slate-500 block">MID(25)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="25"
                      value={newScores.MID}
                      onChange={e => setNewScores({ ...newScores, MID: Number(e.target.value) })}
                      className="w-full p-1.5 border border-slate-300 rounded-lg text-xs font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-indigo-900 block">TOTAL(65)</label>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="65"
                      value={newScores.TOTAL}
                      onChange={e => setNewScores({ ...newScores, TOTAL: Number(e.target.value) })}
                      className="w-full p-1.5 border border-amber-400 bg-amber-50 rounded-lg text-xs font-black text-center text-indigo-950"
                    />
                  </div>
                </div>
              </div>

              <div className="flex space-x-3 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddStudentModal(false)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={loading || !newStudentId.trim()}
                  className="w-1/2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition cursor-pointer"
                >
                  บันทึกนักศึกษา
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: IMPORT CSV */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3 flex-shrink-0">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    นำเข้าคะแนนนักศึกษาจากไฟล์ CSV (Import CSV)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    รองรับภาษาไทย UTF-8 • แปลงข้อมูลเป็น JSON • แมปคอลัมน์อัตโนมัติ • คำนวณ TOTAL อัตโนมัติ
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => {
                    const sampleCsv = generateSampleCSV();
                    const blob = new Blob([sampleCsv], { type: 'text/csv;charset=utf-8;' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'Template_คะแนนนักศึกษา_UTF8.csv';
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>ดาวน์โหลด Template CSV</span>
                </button>

                <button
                  type="button"
                  disabled={isSavingCsv}
                  onClick={() => {
                    if (isSavingCsv) return;
                    setShowImportModal(false);
                    setCsvPreviewData([]);
                    setCsvParsedDetails(null);
                    setCsvFileName('');
                    setShowJsonPreview(false);
                    setSaveCsvError(null);
                  }}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition cursor-pointer disabled:opacity-40"
                  title="ปิดหน้าต่าง"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Single vertical scrollbar container */}
            <div className="py-4 space-y-4 overflow-y-auto flex-1 pr-1">
              {/* File Drop Area */}
              <div className="border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/20 hover:bg-indigo-50/40 rounded-2xl p-6 text-center cursor-pointer transition">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCSVUpload}
                  className="hidden"
                  id="csv-file-input"
                />
                <label htmlFor="csv-file-input" className="cursor-pointer block">
                  <FileSpreadsheet className="w-10 h-10 text-indigo-600 mx-auto mb-2" />
                  <span className="text-sm font-bold text-slate-800 block">
                    {csvFileName ? `ไฟล์ที่เลือก: ${csvFileName}` : 'คลิกเลือกไฟล์ CSV หรือลากไฟล์มาวางที่นี่'}
                  </span>
                  <span className="text-xs text-slate-500 block mt-1">
                    รองรับไฟล์ .csv (UTF-8) คอลัมน์: เลขที่, รหัสนักศึกษา, ชื่อ-นามสกุล, กลุ่มเรียน (Sec), อีเมล, ATTEN, ClassActivity, Assignment, Midterm
                  </span>
                </label>
              </div>

              {/* Data Mapping Status & Summary */}
              {csvParsedDetails && (
                <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800 flex items-center">
                      <Sparkles className="w-4 h-4 text-emerald-600 mr-1.5" />
                      ผลการแมปคอลัมน์ (Data Mapping) & คำนวณคะแนน:
                    </span>
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                      ✓ ตรวจพบข้อมูล {csvPreviewData.length} รายการ
                    </span>
                  </div>

                  {/* Column chips */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                      ✓ เลขที่ (No.)
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                      ✓ รหัสนักศึกษา (Student ID)
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                      ✓ ชื่อ-นามสกุล (Full Name)
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 whitespace-nowrap">
                      ✓ กลุ่มเรียน (Section / Sec)
                    </span>
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap ${
                      csvParsedDetails.detectedColumns.email 
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                        : 'bg-slate-100 text-slate-500 border-slate-200'
                    }`}>
                      {csvParsedDetails.detectedColumns.email ? '✓' : '○'} อีเมล (Email)
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                      ✓ คะแนนเข้าเรียน (ATTEND) (10)
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                      ✓ คะแนนงานในชั้นเรียน (CLASS ACTIVITY) (10)
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                      ✓ คะแนนการบ้าน (ASSIGNMENT) (20)
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                      ✓ คะแนนสอบกลางภาค (MIDTERM) (25)
                    </span>
                    <span className="px-2 py-0.5 rounded-md text-[11px] font-black bg-amber-100 text-amber-900 border border-amber-300 whitespace-nowrap">
                      ⚡ คะแนนรวม (TOTAL) (65 - คำนวณอัตโนมัติ)
                    </span>
                  </div>

                  {/* Summary Bar */}
                  <div className="grid grid-cols-3 gap-2 pt-2 text-center text-xs">
                    <div className="bg-white p-2 rounded-xl border border-slate-200">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">จำนวนนักศึกษา</span>
                      <span className="font-bold text-slate-800 text-sm">{csvPreviewData.length} คน</span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-slate-200">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">กลุ่มเรียนที่พบ</span>
                      <span className="font-bold text-indigo-700 text-sm truncate block px-1">
                        {csvParsedDetails.sectionsFound.join(', ') || 'Sec 101'}
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-slate-200">
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">คะแนนรวมเฉลี่ย</span>
                      <span className="font-bold text-amber-800 text-sm">{csvParsedDetails.averageTotal} / 65</span>
                    </div>
                  </div>
                </div>
              )}

              {/* View Switcher: Table vs JSON */}
              {csvPreviewData.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex bg-slate-100 p-1 rounded-xl space-x-1 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => setShowJsonPreview(false)}
                        className={`px-3 py-1 rounded-lg transition cursor-pointer ${
                          !showJsonPreview ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        ตารางตัวอย่างข้อมูล ({csvPreviewData.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowJsonPreview(true)}
                        className={`px-3 py-1 rounded-lg transition cursor-pointer flex items-center space-x-1 ${
                          showJsonPreview ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Code className="w-3.5 h-3.5" />
                        <span>ข้อมูล JSON ที่แปลงแล้ว</span>
                      </button>
                    </div>

                    <span className="text-xs text-emerald-600 font-semibold flex items-center">
                      <CheckCircle className="w-3.5 h-3.5 mr-1" /> พร้อมนำเข้าสู่ฐานข้อมูล
                    </span>
                  </div>

                  {/* Render Table or JSON with zero text-overlapping and explicit column widths */}
                  {!showJsonPreview ? (
                    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-2xs">
                      <table className="w-full min-w-[920px] text-left border-collapse text-xs">
                        <thead className="bg-slate-100/90 sticky top-0 border-b border-slate-200 font-bold text-slate-700 z-10">
                          <tr>
                            <th className="py-3 px-3 text-center w-12 whitespace-nowrap">#</th>
                            <th className="py-3 px-3.5 min-w-[130px] whitespace-nowrap">รหัสนักศึกษา</th>
                            <th className="py-3 px-3.5 min-w-[170px] whitespace-nowrap">ชื่อ - นามสกุล</th>
                            <th className="py-3 px-3 min-w-[80px] text-center whitespace-nowrap">Sec</th>
                            <th className="py-3 px-3 min-w-[150px] whitespace-nowrap">อีเมล</th>
                            <th className="py-3 px-3 min-w-[95px] text-center whitespace-nowrap">ATTEND (10)</th>
                            <th className="py-3 px-3 min-w-[100px] text-center whitespace-nowrap">ACTIVITY (10)</th>
                            <th className="py-3 px-3 min-w-[95px] text-center whitespace-nowrap">ASSIGN (20)</th>
                            <th className="py-3 px-3 min-w-[95px] text-center whitespace-nowrap">MIDTERM (25)</th>
                            <th className="py-3 px-3.5 min-w-[100px] text-center font-bold text-indigo-900 bg-amber-50 whitespace-nowrap">TOTAL (65)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {csvPreviewData.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 transition-colors">
                              <td className="py-2.5 px-3 text-center font-mono text-slate-400 whitespace-nowrap">{row.no}</td>
                              <td className="py-2.5 px-3.5 font-mono font-bold text-slate-900 whitespace-nowrap">{row.studentId}</td>
                              <td className="py-2.5 px-3.5 font-medium text-slate-800 whitespace-nowrap">{row.name}</td>
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded-md bg-slate-100 font-semibold text-slate-700">
                                  {row.sec}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">{row.email || '-'}</td>
                              <td className="py-2.5 px-3 text-center font-medium whitespace-nowrap">{row.scores.ATTEN}</td>
                              <td className="py-2.5 px-3 text-center font-medium whitespace-nowrap">{row.scores.CA}</td>
                              <td className="py-2.5 px-3 text-center font-medium whitespace-nowrap">{row.scores.AS}</td>
                              <td className="py-2.5 px-3 text-center font-medium whitespace-nowrap">{row.scores.MID}</td>
                              <td className="py-2.5 px-3.5 text-center font-bold text-indigo-900 bg-amber-50/60 whitespace-nowrap">{row.scores.TOTAL}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="relative">
                      <pre className="bg-slate-900 text-emerald-400 p-4 rounded-2xl text-xs font-mono overflow-x-auto max-h-60 leading-relaxed">
                        {JSON.stringify(csvPreviewData, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Error Alert Box if save fails */}
              {saveCsvError && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-start space-x-2.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <strong className="font-bold text-rose-950 block">บันทึกข้อมูลไม่สำเร็จ:</strong>
                      <p className="mt-0.5 text-rose-800 leading-relaxed font-medium">{saveCsvError}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end space-x-2 pt-1 border-t border-rose-200/60">
                    <button
                      type="button"
                      onClick={() => setSaveCsvError(null)}
                      className="px-2.5 py-1 text-[11px] font-semibold text-rose-700 hover:text-rose-900 cursor-pointer"
                    >
                      ปิดการแจ้งเตือน
                    </button>
                    <button
                      type="button"
                      disabled={isSavingCsv}
                      onClick={handleSaveToDatabase}
                      className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-xs"
                    >
                      ลองบันทึกอีกครั้ง
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex space-x-3 pt-3 border-t border-slate-100 mt-auto flex-shrink-0 bg-white">
              <button
                type="button"
                disabled={isSavingCsv}
                onClick={() => {
                  if (isSavingCsv) return;
                  setShowImportModal(false);
                  setCsvPreviewData([]);
                  setCsvParsedDetails(null);
                  setCsvFileName('');
                  setShowJsonPreview(false);
                  setSaveCsvError(null);
                }}
                className="w-1/2 py-2.5 rounded-xl border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50 transition cursor-pointer disabled:opacity-40"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={isSavingCsv || csvPreviewData.length === 0}
                onClick={handleSaveToDatabase}
                className="w-1/2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white text-sm font-semibold disabled:opacity-50 transition flex items-center justify-center space-x-2 cursor-pointer shadow-sm shadow-indigo-200"
              >
                {isSavingCsv ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-indigo-200" />
                    <span>
                      กำลังบันทึกลงฐานข้อมูล...
                      {saveCsvProgress && saveCsvProgress.total > 0
                        ? ` (${saveCsvProgress.current}/${saveCsvProgress.total})`
                        : ''}
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    <span>บันทึกนำเข้า {csvPreviewData.length} รายการ</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: IMPORT SUCCESS SUMMARY ALERT */}
      {importSummaryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="w-14 h-14 rounded-3xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 mx-auto">
              <CheckCircle className="w-8 h-8" />
            </div>

            <div>
              <h3 className="text-xl font-bold text-slate-900">
                นำเข้าข้อมูลสำเร็จเรียบร้อย!
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                ระบบได้บันทึกข้อมูลนักศึกษาลงใน Cloud Firestore และคำนวณคะแนนรวม (TOTAL) อัตโนมัติเรียบร้อยแล้ว
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 text-left space-y-2.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500">จำนวนนักศึกษาที่นำเข้า:</span>
                <span className="font-bold text-slate-900 text-sm">{importSummaryModal.total} คน</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500">กลุ่มเรียน (Sections):</span>
                <span className="font-bold text-indigo-700">{importSummaryModal.sections.join(', ')}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-200">
                <span className="text-slate-500">คะแนนรวมเฉลี่ย:</span>
                <span className="font-bold text-amber-700">{importSummaryModal.averageTotal} / 65 คะแนน</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-500">การคำนวณคะแนน:</span>
                <span className="font-bold text-emerald-700">คำนวณ TOTAL อัตโนมัติ 100%</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setImportSummaryModal(null)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition cursor-pointer"
            >
              เสร็จสิ้น / ตรวจสอบรายชื่อ
            </button>
          </div>
        </div>
      )}

      {/* MODAL: GOOGLE APPS SCRIPT & NETLIFY DEPLOYMENT GUIDE */}
      {showGasModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <Code className="w-5 h-5 text-indigo-600" />
                <h3 className="text-lg font-bold text-slate-900">
                  การเชื่อมต่อ Google Sheets (GAS) & Netlify Deployment
                </h3>
              </div>
              <button
                onClick={() => setShowGasModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-5 overflow-y-auto text-xs sm:text-sm text-slate-700 leading-relaxed">
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 text-indigo-900">
                <div className="font-bold mb-1 flex items-center">
                  <Sparkles className="w-4 h-4 mr-1 text-indigo-600" />
                  ไม่ต้องใช้ Google Cloud Run (ประหยัดค่าใช้จ่าย 100%)
                </div>
                <p>
                  ตามข้อกำหนดของระบบ ระบบนี้ทำงานบน <strong>Firebase Spark Plan (Free)</strong> ร่วมกับ <strong>Netlify</strong>{' '}
                  และหากอาจารย์ต้องการเชื่อมต่อรายชื่อกับ Google Sheets หรือ Google Calendar / Gmail โดยตรง สามารถใช้สคริปต์{' '}
                  <strong>Google Apps Script (GAS)</strong> ด้านล่างนี้ได้ฟรี โดยไม่ต้องรันเซิร์ฟเวอร์ Cloud Run
                </p>
              </div>

              {/* Netlify Deploy Guide */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-900 flex items-center">
                  <ExternalLink className="w-4 h-4 mr-1 text-emerald-600" />
                  ขั้นตอนการ Deploy ขึ้น Netlify และเชื่อม GitHub
                </h4>
                <ol className="list-decimal list-inside space-y-1 text-slate-600 pl-2">
                  <li>Push โค้ดโปรเจกต์นี้ขึ้นไปที่ <strong>GitHub Repository</strong> ของท่าน</li>
                  <li>เข้าสู่ระบบที่ <a href="https://www.netlify.com" target="_blank" rel="noreferrer" className="text-indigo-600 underline">Netlify.com</a> แล้วเลือก <strong>Add new site &gt; Import an existing project</strong></li>
                  <li>เลือก GitHub Repository ที่เก็บโปรเจกต์นี้</li>
                  <li>ระบบจะมีไฟล์ <code>netlify.toml</code> กำหนดคำสั่ง <code>npm run build</code> และ publish <code>dist</code> ไว้อัตโนมัติ พร้อมใช้งานทันที!</li>
                </ol>
              </div>

              {/* GAS Code Snippet */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-900">
                    โค้ด Google Apps Script (GAS) สำหรับวางใน Google Sheets
                  </h4>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(GOOGLE_APPS_SCRIPT_CODE);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 3000);
                    }}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 transition cursor-pointer"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedCode ? 'คัดลอกแล้ว!' : 'คัดลอกโค้ด'}</span>
                  </button>
                </div>

                <pre className="bg-slate-900 text-slate-200 p-4 rounded-xl text-xs font-mono overflow-x-auto max-h-64 leading-normal">
                  {GOOGLE_APPS_SCRIPT_CODE}
                </pre>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 text-right mt-auto">
              <button
                type="button"
                onClick={() => setShowGasModal(false)}
                className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-semibold hover:bg-slate-800 transition cursor-pointer"
              >
                รับทราบ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
