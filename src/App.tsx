import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser, signOut } from 'firebase/auth';
import { auth, isAllowedInstructorEmail } from './lib/firebase';
import { Navbar } from './components/Navbar';
import { StudentPortal } from './components/StudentPortal';
import { InstructorPortal } from './components/InstructorPortal';
import { GraduationCap, Lock } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'student' | 'instructor'>(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('auth_redirect_pending') === 'instructor') {
      return 'instructor';
    }
    return 'student';
  });
  const [instructorUser, setInstructorUser] = useState<FirebaseUser | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (user) {
        const email = user.email?.toLowerCase().trim() || '';
        if (!isAllowedInstructorEmail(email)) {
          console.warn('Rejected unauthorized instructor email in App state:', email);
          if (typeof window !== 'undefined') {
            sessionStorage.setItem(
              'bu_auth_rejected_error',
              `อีเมล "${user.email || ''}" ไม่ใช่บัญชีของมหาวิทยาลัยกรุงเทพ (@bu.ac.th) ระบบอนุญาตเฉพาะอาจารย์ผู้สอนที่ใช้อีเมลลงท้ายด้วย @bu.ac.th เท่านั้น`
            );
          }
          await signOut(auth);
          setInstructorUser(null);
          return;
        }
      }
      setInstructorUser(user);
    });
    return () => unsubscribe();
  }, []);

  const handleInstructorSignOut = async () => {
    try {
      await signOut(auth);
      setInstructorUser(null);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800 antialiased selection:bg-indigo-500 selection:text-white">
      {/* Top Bar Navigation */}
      <Navbar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        instructorUser={instructorUser}
        onInstructorSignOut={handleInstructorSignOut}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {currentTab === 'student' ? (
          <StudentPortal />
        ) : (
          <InstructorPortal user={instructorUser} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 px-4 text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center justify-center sm:justify-start space-x-2">
            <div className="w-5 h-5 rounded-md bg-slate-900 flex items-center justify-center text-white">
              <GraduationCap className="w-3 h-3 text-indigo-400" />
            </div>
            <span className="font-semibold text-slate-700">
              ระบบประกาศคะแนนนักศึกษา
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-slate-500">มหาวิทยาลัยกรุงเทพ</span>
          </div>

          <div className="flex items-center justify-center sm:justify-end">
            {currentTab === 'student' ? (
              <button
                type="button"
                onClick={() => setCurrentTab('instructor')}
                className="group inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-600 hover:text-indigo-600 hover:bg-slate-50 transition-all cursor-pointer border border-slate-200/90 hover:border-indigo-300 shadow-2xs"
                title="เข้าสู่ระบบจัดการคะแนนสำหรับอาจารย์"
              >
                <Lock className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                <span>สำหรับอาจารย์ผู้สอน (เข้าสู่ระบบจัดการคะแนน)</span>
                <span className="transition-transform group-hover:translate-x-0.5 text-slate-400 group-hover:text-indigo-600" aria-hidden="true">&rarr;</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setCurrentTab('student')}
                className="group inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50/60 transition-all cursor-pointer border border-indigo-200/90 shadow-2xs"
                title="กลับสู่หน้าตรวจสอบคะแนนสำหรับนักศึกษา"
              >
                <span className="transition-transform group-hover:-translate-x-0.5 text-indigo-600" aria-hidden="true">&larr;</span>
                <span>กลับสู่หน้าจอสำหรับนักศึกษา</span>
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
