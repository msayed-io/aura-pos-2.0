
import React from 'react';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: 'increase' | 'decrease';
  icon: React.ReactNode;
  children?: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  change,
  changeType,
  icon,
  children,
}) => {
  return (
    <div className="relative overflow-hidden bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.3)] hover:bg-white/10 transition-all duration-400 group border-t-white/20">
      {/* Inner Glow Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-30 pointer-events-none" />
      <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />

      <div className="relative z-10">
        <div className="flex flex-row items-center justify-between space-y-0 pb-3">
          <h3 className="text-sm font-bold text-gray-300 group-hover:text-white transition-colors">{title}</h3>
          <div className="text-gray-400 group-hover:text-white transition-colors bg-white/5 p-2 rounded-xl border border-white/5 shadow-inner">
              {icon}
          </div>
        </div>
        <div className="mt-1">
          <div className="text-3xl font-black text-white tracking-tight drop-shadow-md">{value}</div>
          {change && (
             <p className={`text-sm mt-2 font-bold inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                changeType === 'increase' 
                ? 'text-teal-300 bg-teal-500/10 border-teal-500/20' 
                : 'text-rose-300 bg-rose-500/10 border-rose-500/20'
              }`}>
              {changeType === 'increase' ? '↑' : '↓'} {change}
            </p>
          )}
        </div>
         {children && <div className="mt-4 pt-4 border-t border-white/5">{children}</div>}
      </div>
    </div>
  );
};

export default StatCard;