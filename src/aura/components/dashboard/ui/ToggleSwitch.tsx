import React, { useMemo } from 'react';

// Props Interface
interface ToggleSwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

// Toggle Switch Component
export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ 
  checked, 
  onChange, 
  label, 
  disabled = false,
  className = ''
}) => {
  // Generate a unique ID to link the input and label
  const uniqueId = useMemo(() => `toggle-${Math.random().toString(36).substr(2, 9)}`, []);

  // Handle the change event
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled && onChange) { 
      onChange(e.target.checked);
    }
  };

  return (
    <div className={`toggle-container ${className}`} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <style>{`
        .toggle-wrapper {
          position: relative;
          display: inline-block;
          --toggle-width: 60px;
          --toggle-height: 32px;
          --toggle-bg: #d1d1d1;
          --toggle-active-bg: #F97316; /* Using neo-primary orange for consistency */
        }

        .toggle-checkbox {
          opacity: 0;
          width: 0;
          height: 0;
          position: absolute;
        }

        .toggle-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          cursor: pointer;
          width: var(--toggle-width);
          height: var(--toggle-height);
          background: var(--toggle-bg);
          border-radius: 100px;
          position: relative;
          transition: background-color 0.4s ease-in-out;
          /* Neumorphism effect */
          box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.2), inset -2px -2px 5px rgba(255, 255, 255, 0.7);
        }

        .toggle-button {
          position: absolute;
          top: 3px;
          left: 3px;
          width: calc(var(--toggle-height) - 6px);
          height: calc(var(--toggle-height) - 6px);
          border-radius: 50%;
          background: #f0f0f0;
          /* Bouncy transition */
          transition: all 0.4s cubic-bezier(0.68, -0.55, 0.27, 1.55);
          box-shadow: 2px 2px 5px rgba(0, 0, 0, 0.2), -1px -1px 3px rgba(255, 255, 255, 0.8);
          display: flex;
          justify-content: center;
          align-items: center;
          z-index: 2;
        }

        .toggle-icon {
          color: #aaa;
          transition: color 0.3s;
        }

        /* Checked State */
        .toggle-checkbox:checked + .toggle-label {
          background: var(--toggle-active-bg);
          box-shadow: inset 2px 2px 5px rgba(0, 0, 0, 0.1), inset -2px -2px 5px rgba(255, 255, 255, 0.2);
        }

        .toggle-checkbox:checked + .toggle-label .toggle-button {
          left: calc(100% - (var(--toggle-height) - 3px));
          transform: rotate(360deg);
          background: #ffffff;
        }

        .toggle-checkbox:checked + .toggle-label .toggle-icon {
          color: var(--toggle-active-bg);
        }
        
        .toggle-wrapper.disabled {
          opacity: 0.6;
          pointer-events: none;
        }
      `}</style>

      <div className={`toggle-wrapper ${disabled ? 'disabled' : ''}`}>
        <input
          type="checkbox"
          id={uniqueId}
          className="toggle-checkbox rounded-xl"
          checked={checked}
          onChange={handleChange}
          disabled={disabled}
        />
        <label htmlFor={uniqueId} className="toggle-label">
          <span className="toggle-button">
            {/* Simple Checkmark Icon */}
            <svg 
              className="toggle-icon" 
              width="14" 
              height="14" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="3" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </span>
        </label>
      </div>
      
      {/* Label Text */}
      {label && (
        <label 
          htmlFor={uniqueId} 
          style={{ cursor: 'pointer', fontSize: '16px', userSelect: 'none', fontWeight: 'bold' }}
        >
          {label}
        </label>
      )}
    </div>
  );
};