import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TrashIcon } from '../Icons';

interface VoidAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onFailure: () => void;
  passwordToCheck: string;
}

const VoidAuthModal: React.FC<VoidAuthModalProps> = ({ isOpen, onClose, onSuccess, onFailure, passwordToCheck }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    onClose();
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9]/g, '');
    if (error) setError(false);
    setPin(value);
  };
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin.length === passwordToCheck.length) {
        if (pin === passwordToCheck) {
            onSuccess();
        } else {
            setError(true);
            setPin('');
            onFailure();
        }
    }
  };
  
  useEffect(() => {
    if (isOpen) {
        setPin('');
        setError(false);
        setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  useEffect(() => {
    // CRITICAL FIX: Do not proceed if passwordToCheck is empty or null.
    // This prevents an automatic success call on initial render when the password
    // hasn't been fetched yet for a cashier user, which would cause `passwordToCheck`
    // to be an empty string and match the initial empty `pin` state.
    if (!passwordToCheck) {
        return;
    }

    if (pin.length === passwordToCheck.length) {
        setTimeout(() => {
            if (pin === passwordToCheck) {
                onSuccess();
            } else {
                setError(true);
                setPin('');
                onFailure();
            }
        }, 150);
    }
  }, [pin, passwordToCheck, onSuccess, onFailure]);


  if (!isOpen) return null;
  
  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    console.error("Modal root element #modal-root not found in the DOM.");
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 modal-backdrop-blur" onClick={handleClose}>
      <div 
        className={`relative w-full max-w-sm text-center p-8 bg-white border border-neo-soft-gray rounded-2xl shadow-xl animate-scale-in
                    ${error ? 'animate-shake' : ''}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="void-auth-title"
      >
        <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center bg-neo-error/10 rounded-full">
          <TrashIcon className="relative w-10 h-10 text-neo-error" />
        </div>
        
        <h2 id="void-auth-title" className="text-2xl font-bold text-neo-secondary font-display mt-4 mb-2">مصادقة الإلغاء</h2>
        <p className="text-neo-secondary/60 mb-8">أدخل رمز المدير للمتابعة في عملية الإلغاء.</p>
        
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex justify-center gap-3 cursor-text" onClick={() => inputRef.current?.focus()}>
              {Array.from({ length: passwordToCheck.length }).map((_, i) => (
                <div key={i} className={`w-14 h-16 flex items-center justify-center bg-neo-bg rounded-lg border-2 transition-all duration-300
                  ${error ? 'border-neo-error' : (pin.length === i ? 'border-neo-primary' : 'border-neo-soft-gray')}
                `}>
                  {pin.length > i && <div className="w-4 h-4 bg-neo-secondary rounded-full animate-scale-in"></div>}
                </div>
              ))}
            </div>

            <input 
                ref={inputRef}
                type="password"
                inputMode="numeric"
                pattern="[0-9]*"
                value={pin}
                onChange={handlePinChange}
                maxLength={passwordToCheck.length}
                className="absolute opacity-0 w-0 h-0 rounded-xl"
                autoFocus
                onBlur={(e) => e.target.focus()}
            />

            {error && <p className="text-neo-error text-sm animate-fade-in -mt-2">رمز المدير غير صحيح. تم تسجيل المحاولة.</p>}
            
            <button
                type="submit"
                className="w-full bg-neo-error hover:bg-opacity-90 text-white font-bold py-3.5 rounded-lg transition-all duration-300 shadow-lg shadow-neo-error/20 disabled:opacity-50"
                disabled={pin.length !== passwordToCheck.length}
            >
                تأكيد الإلغاء
            </button>
        </form>
      </div>
    </div>,
    portalRoot
  );
};

export default VoidAuthModal;