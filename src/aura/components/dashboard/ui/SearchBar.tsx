
import React from 'react';
import { SearchIcon, XIcon } from '../Icons';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onClear?: () => void;
}

const SearchBar: React.FC<SearchBarProps> = ({ value, onChange, placeholder = "بحث...", onClear }) => {
  return (
    <div className="relative group w-full max-w-md">
      <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
        <SearchIcon className="w-5 h-5 text-gray-400 group-focus-within:text-neo-primary transition-colors" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-12 pr-12 pl-12 bg-gray-100/70 border border-gray-200/50 rounded-2xl outline-none focus:bg-white focus:ring-4 focus:ring-neo-primary/10 transition-all duration-300 font-display text-neo-secondary"
      />
      {value && (
        <button 
          onClick={() => {
            onChange('');
            if (onClear) onClear();
          }}
          className="absolute inset-y-0 left-4 flex items-center text-gray-400 hover:text-red-500 transition-colors"
        >
          <XIcon className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

export default SearchBar;
