
import React, { useRef, useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
}

interface SlidingTabsProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
}

const SlidingTabs: React.FC<SlidingTabsProps> = ({ tabs, activeTab, onChange }) => {
  const [indicatorStyle, setIndicatorStyle] = useState({ left: 0, width: 0 });
  const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    const activeTabIndex = tabs.findIndex(tab => tab.id === activeTab);
    const element = tabsRef.current[activeTabIndex];
    if (element) {
      setIndicatorStyle({
        left: element.offsetLeft,
        width: element.offsetWidth
      });
    }
  }, [activeTab, tabs]);

  return (
    <div className="relative flex p-1.5 bg-gray-100/50 rounded-2xl border border-gray-200/50 backdrop-blur-sm h-14 items-center">
      <motion.div 
        className="absolute h-[calc(100%-12px)] bg-white rounded-xl shadow-sm border border-gray-100"
        initial={false}
        animate={{
          left: indicatorStyle.left,
          width: indicatorStyle.width
        }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
      />
      {tabs.map((tab, idx) => (
        <button
          key={tab.id}
          ref={el => { tabsRef.current[idx] = el; }}
          onClick={() => onChange(tab.id)}
          className={`relative z-10 flex items-center gap-2.5 px-6 py-2 rounded-xl transition-colors duration-300 whitespace-nowrap
            ${activeTab === tab.id ? 'text-neo-primary font-bold' : 'text-gray-500 hover:text-neo-secondary'}
          `}
        >
          {tab.icon && (
            <div className={`w-5 h-5 flex items-center justify-center ${activeTab === tab.id ? 'text-neo-primary' : 'text-gray-400'}`}>
              {tab.icon}
            </div>
          )}
          <span className="text-sm font-display">{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

export default SlidingTabs;
