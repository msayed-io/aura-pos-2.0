import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { User } from '../../../../types';
import { fetchUsers, addUser, updateUser, deleteUser } from '../../services/userService';
import { useDashboard } from '../../DashboardContext';
import { SECRET_CODES } from '../../../../constants';
import { SpinnerIcon, PlusIcon, PencilIcon, TrashIcon, UsersIcon, KeyRoundIcon, ShieldCheckIcon, UserPlusIcon } from '../../Icons';
import UserEditModal from '../../ui/UserEditModal';
import DeleteConfirmationModal from '../../ui/DeleteConfirmationModal';
import { ToggleSwitch } from '../../ui/ToggleSwitch';


const SecurityPage: React.FC<{ onNavigateToManagerCreation: () => void; }> = ({ onNavigateToManagerCreation }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useDashboard();
    
    // State for modals
    const [isUserModalOpen, setIsUserModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [userToDelete, setUserToDelete] = useState<User | null>(null);

    const loadUsers = useCallback(async () => {
        setLoading(true);
        const fetchedUsers = await fetchUsers();
        setUsers(fetchedUsers);
        setLoading(false);
    }, []);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    const adminUsers = useMemo(() => users.filter(u => u.accessLevel === 'Admin'), [users]);


    const handleOpenAddModal = () => {
        setEditingUser(null);
        setIsUserModalOpen(true);
    };

    const handleOpenEditModal = (user: User) => {
        setEditingUser(user);
        setIsUserModalOpen(true);
    };

    const handleSaveUser = async (userData: Partial<User>) => {
        try {
            if (editingUser) {
                await updateUser(editingUser.id, userData);
                showToast({ message: `تم تحديث المستخدم ${userData.username} بنجاح.`, type: 'success' });
            } else {
                // Assert userData as Omit<User, 'id'> as new users won't have an ID
                await addUser(userData as Omit<User, 'id'>);
                showToast({ message: `تمت إضافة المستخدم ${userData.username} بنجاح.`, type: 'success' });
            }
            setIsUserModalOpen(false);
            loadUsers(); // Refresh the list
        } catch (error: any) {
            showToast({ message: error.message || 'فشل حفظ المستخدم.', type: 'error' });
        }
    };
    
    const handleDeleteUser = async () => {
        if (!userToDelete) return;
        try {
            await deleteUser(userToDelete.id);
            showToast({ message: `تم حذف المستخدم ${userToDelete.username} بنجاح.`, type: 'success'});
            setUserToDelete(null);
            loadUsers();
        } catch (error) {
            showToast({ message: 'فشل حذف المستخدم.', type: 'error' });
        }
    };

    if (loading) {
        return <div className="flex h-full items-center justify-center"><SpinnerIcon className="w-12 h-12 animate-spin text-neo-primary" /></div>;
    }

    return (
        <>
            <div className="flex flex-col h-full">
                <header className="text-center pt-12 pb-6 max-w-3xl mx-auto">
                    <h1 className="text-4xl font-black font-cairo text-neo-secondary">إدارة الأمان</h1>
                    <p className="mt-3 text-lg text-neo-secondary/60 leading-relaxed">
                        تحكم في حسابات المستخدمين وكلمات مرور الوصول للأقسام الحساسة.
                    </p>
                </header>

                <main className="flex-grow flex items-center justify-center pb-12">
                    <div className="max-w-5xl mx-auto space-y-8 animate-fade-in w-full">
                        {/* Manager Account Card */}
                        <div className="bg-white rounded-2xl border border-neo-soft-gray shadow-sm">
                            <header className="px-8 pt-6 pb-4 border-b border-neo-soft-gray flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 flex items-center justify-center bg-neo-primary/10 text-neo-primary rounded-xl">
                                        <ShieldCheckIcon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-neo-secondary">حسابات المدراء (VIP)</h2>
                                        <p className="text-sm text-neo-secondary/60">النظام يسمح بوجود مديرين اثنين كحد أقصى.</p>
                                    </div>
                                </div>
                            </header>
                            <div className="p-8">
                                <div className="space-y-4">
                                    {adminUsers.length > 0 ? (
                                        adminUsers.map(adminUser => (
                                            <div key={adminUser.id} className="flex items-center justify-between p-4 bg-neo-bg rounded-lg border border-neo-soft-gray">
                                                <div className="flex items-center gap-4">
                                                    <img 
                                                        src={adminUser.profilePicture || `https://ui-avatars.com/api/?name=${adminUser.username.charAt(0)}&background=3B82F6&color=fff&bold=true`} 
                                                        alt={adminUser.username} 
                                                        className="w-12 h-12 rounded-full object-cover bg-gray-200 border-2 border-neo-primary"
                                                    />
                                                    <div>
                                                        <p className="font-bold text-neo-secondary">{adminUser.username}</p>
                                                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-neo-success/10 text-neo-success">
                                                            مدير النظام
                                                        </span>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => handleOpenEditModal(adminUser)} 
                                                    className="flex items-center gap-2 px-4 py-2 bg-neo-secondary text-white font-bold rounded-lg hover:bg-gray-700 transition shadow-sm text-sm"
                                                >
                                                    <PencilIcon className="w-4 h-4" />
                                                    <span>تعديل البيانات</span>
                                                </button>
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-center font-semibold text-amber-800 p-4 bg-neo-warning/10 rounded-lg">
                                            تنبيه: لا يوجد حساب مدير في النظام حالياً.
                                        </p>
                                    )}
                                </div>
                                
                                {adminUsers.length < 2 && (
                                    <div className={`flex items-center justify-center ${adminUsers.length > 0 ? 'pt-6 mt-6 border-t border-neo-soft-gray' : ''}`}>
                                        <button onClick={onNavigateToManagerCreation} className="flex items-center gap-2 px-6 py-3 bg-neo-primary/10 text-neo-primary font-bold rounded-lg hover:bg-neo-primary/20 transition shadow-sm text-sm">
                                            <UserPlusIcon className="w-5 h-5"/>
                                            <span>{adminUsers.length === 0 ? 'إنشاء حساب المدير الأول' : 'إنشاء حساب مدير إضافي'}</span>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>


                        {/* Users Management Card */}
                        <div className="bg-white rounded-2xl border border-neo-soft-gray shadow-sm">
                            <header className="px-8 pt-6 pb-4 border-b border-neo-soft-gray flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 flex items-center justify-center bg-neo-primary/10 text-neo-primary rounded-xl">
                                        <UsersIcon className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <h2 className="text-lg font-bold text-neo-secondary">إدارة حسابات الكاشير</h2>
                                        <p className="text-sm text-neo-secondary/60">إضافة، تعديل، وحذف حسابات الكاشير.</p>
                                    </div>
                                </div>
                                <button onClick={handleOpenAddModal} className="flex items-center gap-2 px-4 py-2 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent transition shadow-sm text-sm">
                                    <PlusIcon className="w-5 h-5"/>
                                    <span className="hidden sm:inline">إضافة مستخدم جديد</span>
                                </button>
                            </header>
                            <div className="p-8 space-y-4">
                                {users.filter(u => u.accessLevel === 'Cashier').map(user => (
                                    <div key={user.id} className="flex items-center justify-between p-4 bg-neo-bg hover:bg-gray-100 rounded-lg transition-colors">
                                        <div className="flex items-center gap-4">
                                            <img src={user.profilePicture} alt={user.username} className="w-12 h-12 rounded-full object-cover bg-gray-200"/>
                                            <div>
                                                <p className="font-bold text-neo-secondary flex items-center gap-2">
                                                    {user.username}
                                                </p>
                                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold bg-neo-primary/10 text-neo-primary`}>
                                                    كاشير
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                             <button onClick={() => handleOpenEditModal(user)} className="p-2 text-neo-secondary/60 hover:text-neo-primary hover:bg-white rounded-md transition" title="تعديل"><PencilIcon className="w-4 h-4" /></button>
                                             <button onClick={() => setUserToDelete(user)} className="p-2 text-neo-secondary/60 hover:text-neo-error hover:bg-white rounded-md transition" title="حذف"><TrashIcon className="w-4 h-4"/></button>
                                        </div>
                                    </div>
                                ))}
                                {users.filter(u => u.accessLevel === 'Cashier').length === 0 && (
                                     <div className="text-center p-4 text-gray-500">لا توجد حسابات كاشير حالياً.</div>
                                )}
                            </div>
                        </div>

                        {/* Section Passwords Card */}
                        <PasswordManagementCard />
                    </div>
                </main>
            </div>

            <UserEditModal 
                isOpen={isUserModalOpen}
                onClose={() => setIsUserModalOpen(false)}
                onSave={handleSaveUser}
                user={editingUser}
                allUsers={users}
            />

            <DeleteConfirmationModal 
                isOpen={!!userToDelete}
                onClose={() => setUserToDelete(null)}
                onConfirm={handleDeleteUser}
                title={`حذف المستخدم "${userToDelete?.username}"`}
                message="هل أنت متأكد من رغبتك في حذف هذا المستخدم؟ لا يمكن التراجع عن هذا الإجراء."
                isDeleting={false} // This can be wired to a state if deletion takes time
            />
        </>
    );
};

// Sub-component for password management to keep logic separate
const PasswordManagementCard = () => {
    const { showToast } = useDashboard();
    const [isSettingsProtectionEnabled, setIsSettingsProtectionEnabled] = useState(true);
    const [isAnalyticsProtectionEnabled, setIsAnalyticsProtectionEnabled] = useState(true);
    
    // NOTE: This is a high-fidelity simulation. In a real application,
    // you would make an API call here to a secure endpoint to update passwords.
    // The SECRET_CODES constant cannot be modified at runtime.
    const [pins, setPins] = useState({
        settings: SECRET_CODES.SETTINGS_ACCESS,
        analytics: SECRET_CODES.ANALYTICS_ACCESS,
    });

    const handleToggleChange = (section: 'settings' | 'analytics', isEnabled: boolean) => {
        if (section === 'settings') {
            setIsSettingsProtectionEnabled(isEnabled);
        } else {
            setIsAnalyticsProtectionEnabled(isEnabled);
        }
        showToast({
            message: `تم ${isEnabled ? 'تفعيل' : 'إيقاف'} الحماية لقسم ${section === 'settings' ? 'الإعدادات' : 'الإحصائيات'}.`,
            type: 'info'
        });
    };
    
    const handlePasswordChange = (section: 'settings' | 'analytics', e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const oldPin = formData.get('oldPin') as string;
        const newPin = formData.get('newPin') as string;
        const confirmPin = formData.get('confirmPin') as string;
        
        if (oldPin !== pins[section]) {
            showToast({ message: 'كلمة المرور الحالية غير صحيحة.', type: 'error' });
            return;
        }
        if (!newPin || newPin !== confirmPin) {
            showToast({ message: 'كلمات المرور الجديدة غير متطابقة.', type: 'error' });
            return;
        }
        if (newPin.length !== 4) {
             showToast({ message: 'يجب أن يتكون الرمز من 4 أرقام.', type: 'error' });
            return;
        }
        
        setPins(prev => ({ ...prev, [section]: newPin }));
        showToast({ message: `تم تحديث كلمة مرور ${section === 'settings' ? 'الإعدادات' : 'الإحصائيات'} بنجاح.`, type: 'success'});
        e.currentTarget.reset();
    };

    return (
        <div className="bg-white rounded-2xl border border-neo-soft-gray shadow-sm">
            <header className="px-8 pt-6 pb-4 border-b border-neo-soft-gray flex items-center gap-3">
                 <div className="w-10 h-10 flex items-center justify-center bg-neo-primary/10 text-neo-primary rounded-xl">
                    <KeyRoundIcon className="w-6 h-6" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-neo-secondary">تغيير كلمات مرور الأقسام</h2>
                    <p className="text-sm text-neo-secondary/60">تحديث رموز الدخول الخاصة بالإعدادات والتحليلات.</p>
                </div>
            </header>
            <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-8">
                {/* Settings Password Section */}
                <div>
                    {isSettingsProtectionEnabled ? (
                        <form onSubmit={(e) => handlePasswordChange('settings', e)} className="space-y-4 animate-fade-in">
                             <div className="flex justify-between items-center">
                                <h3 className="font-bold text-neo-secondary flex items-center gap-2">
                                    <ShieldCheckIcon className="w-5 h-5 text-neo-secondary/50"/> كلمة مرور الإعدادات
                                </h3>
                                <ToggleSwitch 
                                    checked={isSettingsProtectionEnabled}
                                    onChange={(checked) => handleToggleChange('settings', checked)}
                                />
                            </div>
                            <input type="password" name="oldPin" required placeholder="كلمة المرور الحالية" className="w-full p-2.5 border border-neo-soft-gray rounded-md bg-white text-base text-black" />
                            <input type="password" name="newPin" required placeholder="كلمة المرور الجديدة (4 أرقام)" className="w-full p-2.5 border border-neo-soft-gray rounded-md bg-white text-base text-black" />
                            <input type="password" name="confirmPin" required placeholder="تأكيد كلمة المرور الجديدة" className="w-full p-2.5 border border-neo-soft-gray rounded-md bg-white text-base text-black" />
                            <button type="submit" className="w-full py-3 bg-neo-primary/10 text-neo-primary font-bold rounded-lg hover:bg-neo-primary/20 transition">حفظ التغييرات</button>
                        </form>
                    ) : (
                        <div className="flex justify-between items-center p-4 bg-neo-bg rounded-lg animate-fade-in h-full border border-neo-soft-gray">
                            <p className="font-semibold text-neo-secondary/80">هذه البطاقة خاصة بالإعدادات.</p>
                            <ToggleSwitch
                                checked={isSettingsProtectionEnabled}
                                onChange={(checked) => handleToggleChange('settings', checked)}
                            />
                        </div>
                    )}
                </div>

                {/* Analytics Password Section */}
                <div>
                    {isAnalyticsProtectionEnabled ? (
                        <form onSubmit={(e) => handlePasswordChange('analytics', e)} className="space-y-4 animate-fade-in">
                            <div className="flex justify-between items-center">
                                <h3 className="font-bold text-neo-secondary flex items-center gap-2">
                                    <ShieldCheckIcon className="w-5 h-5 text-neo-secondary/50"/> كلمة مرور الإحصائيات
                                </h3>
                                <ToggleSwitch 
                                    checked={isAnalyticsProtectionEnabled}
                                    onChange={(checked) => handleToggleChange('analytics', checked)}
                                />
                            </div>
                            <input type="password" name="oldPin" required placeholder="كلمة المرور الحالية" className="w-full p-2.5 border border-neo-soft-gray rounded-md bg-white text-base text-black" />
                            <input type="password" name="newPin" required placeholder="كلمة المرور الجديدة (4 أرقام)" className="w-full p-2.5 border border-neo-soft-gray rounded-md bg-white text-base text-black" />
                            <input type="password" name="confirmPin" required placeholder="تأكيد كلمة المرور الجديدة" className="w-full p-2.5 border border-neo-soft-gray rounded-md bg-white text-base text-black" />
                            <button type="submit" className="w-full py-3 bg-neo-primary/10 text-neo-primary font-bold rounded-lg hover:bg-neo-primary/20 transition">حفظ التغييرات</button>
                        </form>
                     ) : (
                        <div className="flex justify-between items-center p-4 bg-neo-bg rounded-lg animate-fade-in h-full border border-neo-soft-gray">
                            <p className="font-semibold text-neo-secondary/80">هذه البطاقة خاصة بالإحصائيات.</p>
                            <ToggleSwitch
                                checked={isAnalyticsProtectionEnabled}
                                onChange={(checked) => handleToggleChange('analytics', checked)}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


export default SecurityPage;