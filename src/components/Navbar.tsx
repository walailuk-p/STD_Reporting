import React from 'react';
import { GraduationCap, LogOut, KeyRound, ArrowLeft } from 'lucide-react';

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
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand Wordmark */}
          <div 
            className="flex items-center space-x-2.5 cursor-pointer shrink-0" 
            onClick={() => onTabChange('student')}
            title="หน้าหลักสำหรับนักศึกษา"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center text-white shadow-xs">
              <GraduationCap className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-slate-900 text-base sm:text-lg tracking-tight whitespace-nowrap leading-tight">
                ระบบประกาศคะแนน
              </span>
              <span className="text-[10px] text-slate-400 font-medium hidden sm:inline-block leading-tight">
                มหาวิทยาลัยกรุงเทพ
              </span>
            </div>
          </div>

          {/* Navigation & Controls */}
          <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
            {currentTab === 'student' ? (
              /* Subtle Instructor Entry Link / Button */
              <button
                type="button"
                onClick={() => onTabChange('instructor')}
                className="group inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 transition-colors cursor-pointer border border-transparent hover:border-slate-200/60"
                title="เข้าสู่ระบบจัดการคะแนนสำหรับอาจารย์"
              >
                <KeyRound className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
                <span>ระบบอาจารย์</span>
              </button>
            ) : (
              /* Back to Student View Button */
              <button
                type="button"
                onClick={() => onTabChange('student')}
                className="inline-flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-slate-600 hover:text-indigo-700 hover:bg-indigo-50/70 transition-colors cursor-pointer border border-transparent hover:border-indigo-100"
                title="กลับสู่หน้าตรวจสอบคะแนนนักศึกษา"
              >
                <ArrowLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-500" />
                <span>หน้านักศึกษา</span>
              </button>
            )}

            {/* Instructor logged-in profile action */}
            {instructorUser && currentTab === 'instructor' && (
              <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
                <span className="hidden md:inline-block text-xs font-medium text-slate-700 truncate max-w-[160px]">
                  {instructorUser.displayName || instructorUser.email}
                </span>
                <button
                  type="button"
                  onClick={onInstructorSignOut}
                  title="ออกจากระบบอาจารย์"
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
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
