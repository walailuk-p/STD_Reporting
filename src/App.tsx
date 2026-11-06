import React, { useState, useEffect } from 'react';
import { onAuthStateChanged, User as FirebaseUser, signOut } from 'firebase/auth';
import { auth, isAllowedInstructorEmail } from './lib/firebase';
import { Navbar } from './components/Navbar';
import { StudentPortal } from './components/StudentPortal';
import { InstructorPortal } from './components/InstructorPortal';
import { GraduationCap, ShieldCheck, Heart, Sparkles, BookOpen } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'student' | 'instructor'>(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('auth_redirect_pending') === 'instructor') {
      return 'instructor';
    }
    return 'student';
  });
  const [instructorUser, setInstructorUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

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
          setAuthLoading(false);
          return;
        }
      }
      setInstructorUser(user);
      setAuthLoading(false);
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
      {/* Header Navigation */}
      <Navbar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        instructorUser={instructorUser}
        onInstructorSignOut={handleInstructorSignOut}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {/* Subtle decorative top bar */}
        <div className="h-1 bg-gradient-to-r from-amber-500 via-indigo-600 to-emerald-500" />

        {currentTab === 'student' ? (
          <div>
            {/* Quick Hero Banner on Student Tab */}
            <div className="max-w-2xl mx-auto pt-6 px-4 text-center">
              <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60 mb-2">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>ระบบรักษาความเป็นส่วนตัวของข้อมูล (Data Privacy)</span>
              </div>
            </div>

            <StudentPortal />
          </div>
        ) : (
          <InstructorPortal user={instructorUser} />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-8 px-4 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
              <GraduationCap className="w-3.5 h-3.5" />
            </div>
            <span className="font-semibold text-slate-700">
              ระบบประกาศคะแนนนักศึกษา
            </span>
            <span className="text-slate-400">|</span>
            <span className="text-slate-500">Firebase Spark Plan (No Cost)</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-400">
            <span>• ดึงข้อมูลเพียง 1 Doc / ครั้งเพื่อประหยัด Quota</span>
            <span>• รหัสผ่านเข้ารหัสแบบ SHA-256 with Salt</span>
            <span>• Deploy บน Netlify ได้ทันที</span>
          </div>

          <div className="text-[11px] text-slate-400">
            {currentTab === 'student' ? (
              <button
                onClick={() => setCurrentTab('instructor')}
                className="text-indigo-600 hover:underline font-medium cursor-pointer"
              >
                เข้าสู่ระบบสำหรับอาจารย์ผู้สอน &rarr;
              </button>
            ) : (
              <button
                onClick={() => setCurrentTab('student')}
                className="text-indigo-600 hover:underline font-medium cursor-pointer"
              >
                &larr; กลับสู่หน้าจอสำหรับนักศึกษา
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
