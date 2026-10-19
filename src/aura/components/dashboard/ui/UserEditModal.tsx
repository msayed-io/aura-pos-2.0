import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { User } from '../../../types';
import { XIcon, SpinnerIcon, UploadCloudIcon, ShieldCheckIcon } from '../Icons';
import { useDashboard } from '../DashboardContext';

interface UserEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (user: Partial<User>) => Promise<void>;
  user: User | null;
  allUsers: User[]; // New prop
}

const UserEditModal: React.FC<UserEditModalProps> = ({ isOpen, onClose, onSave, user, allUsers }) => {
  const [formData, setFormData] = useState<Partial<User>>({});
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useDashboard();
  const isNewUser = !user;
  
  const canBecomeAdmin = useMemo(() => {
    const adminCount = allUsers.filter(u => u.accessLevel === 'Admin').length;
    if (user?.accessLevel === 'Admin') return true; // An existing admin can remain an admin
    return adminCount < 2; // A new user or cashier can be promoted if there's space
  }, [allUsers, user]);


  useEffect(() => {
    if (isOpen) {
      if (isNewUser) {
        setFormData({
          username: '',
          accessLevel: 'Cashier',
          profilePicture: '',
          fullName: '',
          nationalId: '',
          dateOfBirth: '',
          idExpiryDate: '',
        });
      } else {
        setFormData({ ...user });
      }
      setPassword('');
      setConfirmPassword('');
    }
  }, [user, isOpen, isNewUser]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) { // 2MB limit
        showToast({ message: "حجم الصورة كبير جداً (الحد الأقصى 2MB).", type: 'error' });
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setFormData(prev => ({ ...prev, profilePicture: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveClick = async () => {
    if (!formData.username) {
        showToast({ message: "اسم المستخدم مطلوب.", type: 'error' });
        return;
    }
    if (isNewUser && !password) {
        showToast({ message: "كلمة المرور مطلوبة للمستخدم الجديد.", type: 'error' });
        return;
    }
    if (password !== confirmPassword) {
        showToast({ message: "كلمات المرور غير متطابقة.", type: 'error' });
        return;
    }

    // --- New Validation for Admin ---
    if (formData.accessLevel === 'Admin') {
        if (!formData.fullName || formData.fullName.trim().split(/\s+/).filter(Boolean).length < 5) {
            showToast({ message: "يرجى إدخال الاسم الخماسي الكامل للمدير.", type: 'error' });
            return;
        }
        if (!formData.nationalId || !/^\d{14}$/.test(formData.nationalId)) {
            showToast({ message: "يرجى إدخال الرقم القومي الصحيح (14 رقم).", type: 'error' });
            return;
        }
        if (!formData.dateOfBirth || !formData.idExpiryDate) {
            showToast({ message: "يرجى إدخال تاريخ الميلاد وتاريخ انتهاء البطاقة.", type: 'error' });
            return;
        }
    }
    // --- End Validation ---

    setIsSaving(true);
    const finalData = { ...formData };
    if (password) {
        finalData.password = password;
    }
    
    await onSave(finalData);
    setIsSaving(false);
  };
  
  if (!isOpen) return null;

  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    console.error("Modal root element #modal-root not found in the DOM.");
    return null;
  }

  const profilePicSrc = formData.profilePicture || `https://ui-avatars.com/api/?name=${formData.username || 'U'}&background=random&color=fff&bold=true`;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 modal-backdrop-blur" onClick={onClose}>
      <div className="relative bg-neo-bg rounded-2xl shadow-xl w-full max-w-lg animate-scale-in" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-neo-soft-gray flex justify-between items-center">
          <h2 className="text-xl font-bold font-cairo text-neo-secondary">
            {isNewUser ? 'إضافة مستخدم جديد' : `تعديل المستخدم: ${user?.username}`}
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-neo-soft-gray text-neo-secondary/70"><XIcon className="w-5 h-5"/></button>
        </header>
        <main className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div className="flex flex-col items-center gap-4">
            <img src={profilePicSrc} alt="Profile" className="w-24 h-24 object-cover rounded-full bg-gray-300 border-4 border-white shadow-md"/>
            <label htmlFor="profilePicture" className="inline-flex items-center gap-2 text-sm bg-white border border-neo-soft-gray px-4 py-2 rounded-lg cursor-pointer hover:bg-gray-100 text-neo-secondary font-semibold transition-colors">
              <UploadCloudIcon className="w-4 h-4"/>
              <span>تغيير الصورة</span>
            </label>
            <input type="file" id="profilePicture" accept="image/*" onChange={handleImageChange} className="hidden rounded-xl" />
          </div>
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">اسم المستخدم</label>
            <input type="text" name="username" value={formData.username || ''} onChange={handleChange} className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"/>
          </div>
           <div>
            <label className="font-bold text-sm text-neo-secondary/80">الصلاحيات</label>
            <select name="accessLevel" value={formData.accessLevel} onChange={handleChange} className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black">
                <option value="Cashier">كاشير</option>
                <option value="Admin" disabled={!canBecomeAdmin} title={!canBecomeAdmin ? "لا يمكن إضافة مدير آخر (الحد الأقصى 2)" : ""}>مدير</option>
            </select>
             {!canBecomeAdmin && formData.accessLevel !== 'Admin' && <p className="text-xs text-amber-600 mt-1">لا يمكن تحديد هذه الصلاحية. النظام يسمح بوجود مديرين اثنين فقط.</p>}
          </div>
          
          {formData.accessLevel === 'Admin' && (
              <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-4 animate-fade-in">
                  <h3 className="font-bold text-base text-neo-primary flex items-center gap-2">
                    <ShieldCheckIcon className="w-5 h-5" />
                    بيانات التحقق الخاصة بالمدير
                  </h3>
                  <div>
                      <label className="font-bold text-sm text-neo-secondary/80">الاسم الخماسي</label>
                      <input type="text" name="fullName" value={formData.fullName || ''} onChange={handleChange} placeholder="الاسم كما هو في البطاقة" className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"/>
                  </div>
                  <div>
                      <label className="font-bold text-sm text-neo-secondary/80">الرقم القومي</label>
                      <input type="text" name="nationalId" value={formData.nationalId || ''} onChange={handleChange} maxLength={14} placeholder="14 رقم" className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black font-mono" dir="ltr"/>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="font-bold text-sm text-neo-secondary/80">تاريخ الميلاد</label>
                          <input type="date" name="dateOfBirth" value={formData.dateOfBirth || ''} onChange={handleChange} className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black" />
                      </div>
                       <div>
                          <label className="font-bold text-sm text-neo-secondary/80">تاريخ انتهاء البطاقة</label>
                          <input type="date" name="idExpiryDate" value={formData.idExpiryDate || ''} onChange={handleChange} className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black" />
                      </div>
                  </div>
              </div>
          )}

          <div>
            <label className="font-bold text-sm text-neo-secondary/80">{isNewUser ? 'كلمة المرور' : 'كلمة مرور جديدة (اختياري)'}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"/>
          </div>
          <div>
            <label className="font-bold text-sm text-neo-secondary/80">تأكيد كلمة المرور</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" className="w-full mt-1 p-2 border border-neo-soft-gray rounded-md bg-white text-black"/>
          </div>
        </main>
        <footer className="p-4 bg-white border-t border-neo-soft-gray flex justify-end gap-3 rounded-2xl">
          <button onClick={onClose} className="px-4 py-2 bg-neo-soft-gray text-neo-secondary/80 font-bold rounded-lg hover:bg-gray-200">إلغاء</button>
          <button onClick={handleSaveClick} disabled={isSaving} className="px-4 py-2 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent disabled:opacity-50 flex items-center gap-2 shadow-sm">
            {isSaving && <SpinnerIcon className="w-4 h-4 animate-spin"/>}
            {isSaving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </footer>
      </div>
    </div>,
    portalRoot
  );
};

export default UserEditModal;