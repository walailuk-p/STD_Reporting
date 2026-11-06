import React from 'react';
import { User, GraduationCap, ShieldCheck, LogOut, BookOpen, Layers } from 'lucide-react';

interface NavbarProps {
  currentTab: 'student' | 'instructor';
  onTabChange: (tab: 'student' | 'instructor') => void;
  instructorUser: any;
  onInstructorSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onTabChange,
  instructorUser,
  onInstructorSignOut,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-xs">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Title */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onTabChange('student')}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-indigo-800 flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-slate-900 text-base sm:text-lg tracking-tight">
                  ระบบประกาศคะแนน
                </span>
                <span className="hidden sm:inline-block px-2 py-0.5 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200">
                  Spark Plan Free
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                ตรวจสอบคะแนนนักศึกษา รวดเร็ว ปลอดภัย ไม่ต้องล็อกอินด้วยอีเมล
              </p>
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="flex bg-slate-100 p-1 rounded-xl text-sm font-medium">
              <button
                type="button"
                onClick={() => onTabChange('student')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all text-xs sm:text-sm ${
                  currentTab === 'student'
                    ? 'bg-white text-indigo-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <User className="w-4 h-4 text-indigo-600" />
                <span>สำหรับนักศึกษา</span>
              </button>

              <button
                type="button"
                onClick={() => onTabChange('instructor')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg transition-all text-xs sm:text-sm ${
                  currentTab === 'instructor'
                    ? 'bg-white text-amber-900 shadow-xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <BookOpen className="w-4 h-4 text-amber-600" />
                <span>สำหรับอาจารย์</span>
              </button>
            </div>

            {/* Instructor logged-in profile pill */}
            {instructorUser && currentTab === 'instructor' && (
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
                <div className="hidden md:flex flex-col text-right">
                  <span className="text-xs font-medium text-slate-800 truncate max-w-[140px]">
                    {instructorUser.displayName || 'อาจารย์ผู้สอน'}
                  </span>
                  <span className="text-[10px] text-slate-500 truncate max-w-[140px]">
                    {instructorUser.email}
                  </span>
                </div>
                <button
                  onClick={onInstructorSignOut}
                  title="ออกจากระบบอาจารย์"
                  className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
