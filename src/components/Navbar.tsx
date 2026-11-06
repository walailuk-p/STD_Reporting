import React from 'react';
import { GraduationCap, LogOut } from 'lucide-react';

interface NavbarProps {
  currentTab: 'student' | 'instructor';
  onTabChange: (tab: 'student' | 'instructor') => void;
  instructorUser: any;
  onInstructorSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onTabChange,
  instructorUser,
  onInstructorSignOut,
}) => {
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand Wordmark & Logo */}
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

          {/* Logged-in User Profile Status (if applicable) */}
          {instructorUser && (
            <div className="flex items-center space-x-3 shrink-0">
              <div className="flex items-center space-x-2 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-medium text-slate-700 truncate max-w-[150px] sm:max-w-[200px]">
                  {instructorUser.displayName || instructorUser.email}
                </span>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={onInstructorSignOut}
                  title="ออกจากระบบอาจารย์"
                  className="text-xs font-semibold text-slate-500 hover:text-rose-600 transition-colors flex items-center space-x-1 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">ออกจากระบบ</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
