import React, { useState, useEffect } from 'react';
import { 
  Eye, EyeOff, ShieldAlert, LockKeyhole, XCircle, 
  CheckCircle2, ArrowRight, ArrowLeft, RotateCw, Clock, Cpu, User, Key, Calendar, 
  AlertTriangle, Briefcase
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { fetchUsers, updateUser } from '../components/dashboard/services/userService';
import { User as UserType } from '../types';
import { useBranding } from '../contexts/BrandingContext';

// --- Global Styles & Animations (Injected) ---
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;600;700;900;1000&display=swap');
    
    body {
      font-family: 'Cairo', sans-serif;
      overflow: hidden;
      background-color: #F4F7F6; /* neo-bg */
    }

    /* Animation: The Violent Shake (Used on the card for incorrect password) */
    @keyframes violent-shake {
      0%, 100% { transform: translateX(0); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-10px) rotate(-1deg); }
      20%, 40%, 60%, 80% { transform: translateX(10px) rotate(1deg); }
    }
    .animate-shake { animation: violent-shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }

    /* Animation: Global Lockout Card In (Powerful & Smooth) */
    @keyframes fadeInScaleUp {
      0% { opacity: 0; transform: scale(0.9); }
      100% { opacity: 1; transform: scale(1); }
    }
    .animate-lockout-in { animation: fadeInScaleUp 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94) both; }


    /* Timer specific styling */
    .timer-segment {
        font-family: 'SF Mono', 'Consolas', monospace; /* Technical, segmented font look */
    }

    /* Input Autofill Aesthetics (Light Mode) */
    input:-webkit-autofill,
    input:-webkit-autofill:hover, 
    input:-webkit-autofill:focus, 
    input:-webkit-autofill:active{
        -webkit-box-shadow: 0 0 0 30px white inset !important;
        -webkit-text-fill-color: #1F2937 !important; /* neo-secondary */
    }

    /* --- Suble Texture Pattern (Diagonal Grid) --- */
    .bg-subtle-pattern-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      background-image: linear-gradient(45deg, #E5E7EB 25%, transparent 25%, transparent 75%, #E5E7EB 75%, #E5E7EB), 
                        linear-gradient(-45deg, #E5E7EB 25%, transparent 25%, transparent 75%, #E5E7EB 75%, #E5E7EB);
      background-size: 30px 30px;
      opacity: 0.3; 
      transition: all 1s ease; 
    }
  `}</style>
);

// --- Shared UI Components ---

// @FIX: Made className and isLoading optional by providing default values.
const Button = ({ children, className = '', variant = 'default', size = 'default', isLoading = false, ...props }: any) => {
  const baseStyles = "inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-bold ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 shadow-md";
  
  const variants = {
    default: "bg-neo-primary hover:bg-neo-accent text-white shadow-neo-primary/30 active:scale-[0.98]",
    outline: "border border-neo-soft-gray bg-white hover:bg-gray-100 text-neo-secondary",
    ghost: "hover:bg-gray-100 text-neo-secondary/70",
    destructive: "bg-neo-error text-white hover:bg-red-600 shadow-red-500/30 active:scale-[0.98]",
  };

  const sizes = {
    default: "h-11 px-8 py-2",
    icon: "h-10 w-10",
    lg: "h-14 px-8 text-lg",
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <RotateCw className="ml-2 h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
};

// @FIX: Made className, toggleIcon, and onToggle optional by providing default values.
const Input = ({ icon: Icon, className = '', toggleIcon = null, onToggle = null, placeholder, ...props }: any) => (
  <div className="relative w-full group">
    <input
      placeholder={placeholder}
      className={`flex h-14 w-full rounded-xl border border-neo-soft-gray bg-white px-5 py-2 text-base ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-400 placeholder:font-light focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-neo-primary/20 focus-visible:border-neo-primary disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-300 text-neo-secondary font-medium ${className} ${Icon ? 'pr-12 pl-5' : 'px-5'}`} 
      {...props}
    />
    {/* Icon on the right side for Arabic UI */}
    {Icon && (
      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-neo-primary transition-colors pointer-events-none">
        <Icon size={20} />
      </div>
    )}
    {/* Toggle icon for password field on the left */}
    {toggleIcon && (
      <button 
        type="button"
        onClick={onToggle}
        className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-neo-primary transition-colors cursor-pointer outline-none"
      >
        {toggleIcon}
      </button>
    )}
  </div>
);

// --- New: Global Lockout Screen Component (Light Theme) ---
const GlobalLockoutScreen = ({ countdown }) => {
    const minutes = Math.floor(countdown / 60);
    const seconds = countdown % 60;
    const formattedTime = `${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;

    return (
        <div 
            className="w-full max-w-xl p-10 rounded-[2rem] border-4 border-neo-error bg-white shadow-red-500/20 shadow-2xl text-neo-secondary animate-lockout-in transition-all space-y-8"
            dir="rtl"
        >
            <div className="flex flex-col items-center justify-center text-center space-y-4">
                <LockKeyhole size={50} className="text-neo-error animate-pulse" />
                <h2 className="text-4xl font-black text-neo-error">الإغلاق الأمني التام</h2>
                <p className="text-sm text-neo-secondary/70 font-medium max-w-md">
                    تم تفعيل بروتوكول الإغلاق. النظام مغلق مؤقتاً بعد تجاوز الحد الأقصى لمحاولات المصادقة الفاشلة.
                </p>
            </div>

            <div className="text-center">
                <p className="text-sm font-bold text-neo-error mb-3 tracking-widest uppercase">
                    إعادة التنشيط خلال
                </p>
                <div className="inline-flex items-center gap-4 bg-red-50 border border-red-200 p-4 px-8 rounded-full shadow-inner">
                    <Clock size={32} className="text-neo-error" />
                    <span className="text-5xl font-extrabold text-neo-error timer-segment tracking-widest leading-none">
                        {formattedTime}
                    </span>
                    <span className="text-base font-semibold text-red-500">دقيقة:ثانية</span>
                </div>
            </div>

            <div className="flex items-center justify-center gap-3 text-xs text-neo-secondary/60 pt-6 border-t border-neo-soft-gray">
                <Cpu size={16} className="text-gray-400" />
                <span>النظام تحت المراقبة الآلية. لا يمكن تجاوز هذا القفل.</span>
            </div>
        </div>
    );
};


// --- UTILITY: Date Formatting/Masking ---
const handleDateMask = (value) => {
    const cleaned = value.replace(/\D/g, '');
    let masked = '';
    for (let i = 0; i < cleaned.length; i++) {
        if (i === 2 || i === 4) masked += '/';
        if (i < 8) masked += cleaned[i];
    }
    return masked;
};

// --- Identity Verification Screen (Light Theme) ---
const IdentityVerificationScreen = ({ onBack, onSuccess }) => {
    const [formData, setFormData] = useState({ fullName: '', nationalId: '', dob: '', expiry: '' });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleChange = (e) => {
        const { name, value } = e.target;
        const newValue = (name === 'dob' || name === 'expiry') ? handleDateMask(value) : (name === 'nationalId' ? value.replace(/\D/g, '').slice(0, 14) : value);
        setFormData(prev => ({ ...prev, [name]: newValue }));
        if (error) setError('');
    };

    const validateForm = () => {
        const { fullName, nationalId, dob, expiry } = formData;
        if (!fullName || !nationalId || !dob || !expiry) return "جميع الحقول إلزامية.";
        if (fullName.trim().split(/\s+/).filter(Boolean).length < 5) return "يجب إدخال الاسم الخماسي الكامل.";
        if (nationalId.length !== 14 || isNaN(Number(nationalId))) return "الرقم القومي غير صحيح (14 رقم).";
        const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
        if (!dateRegex.test(dob) || !dateRegex.test(expiry)) return "تنسيق التاريخ غير صحيح (DD/MM/YYYY).";
        return null;
    };

    const handleVerification = async (data: typeof formData) => {
      setLoading(true);
      const allUsers = await fetchUsers();
      const admin = allUsers.find(u => u.accessLevel === 'Admin');

      if (!admin) {
        throw new Error("لا يوجد حساب مدير في النظام للتحقق منه.");
      }
      
      const [dayB, monthB, yearB] = data.dob.split('/');
      const formattedDob = `${yearB}-${monthB}-${dayB}`;

      const [dayE, monthE, yearE] = data.expiry.split('/');
      const formattedExpiry = `${yearE}-${monthE}-${dayE}`;
      
      const isMatch = (
          admin.nationalId === data.nationalId &&
          admin.dateOfBirth === formattedDob &&
          admin.idExpiryDate === formattedExpiry &&
          admin.fullName?.trim() === data.fullName.trim()
      );

      return new Promise((resolve, reject) => setTimeout(() => {
        if (isMatch) {
            resolve({ success: true });
        } else {
            reject(new Error("بيانات غير مطابقة. تأكد من تطابق جميع الحقول مع بيانات المدير المسجلة."));
        }
      }, 1500));
    };
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const validationError = validateForm();
        if (validationError) { setError(validationError); return; }
        setLoading(true);
        try {
            await handleVerification(formData);
            onSuccess();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-neo-bg relative overflow-hidden">
            <div className="bg-subtle-pattern-layer"></div>
            <div className="w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl border border-neo-soft-gray overflow-hidden relative z-20" dir="rtl">
                <div className="p-8 border-b border-neo-soft-gray bg-gray-50/50 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-neo-primary/10 rounded-full flex items-center justify-center mb-4 text-neo-primary">
                      <ShieldAlert size={32} />
                    </div>
                    <h2 className="text-3xl font-black text-neo-secondary mb-2">التحقق الأمني للهوية (1/2)</h2>
                    <p className="text-neo-secondary/60 max-w-lg text-sm">يرجى إدخال بيانات بطاقة الهوية الوطنية الخاصة بك بدقة.</p>
                </div>
                <div className="absolute top-6 left-6">
                    <Button variant="outline" size="icon" onClick={onBack} title="العودة"><ArrowLeft size={20} /></Button>
                </div>
                <form onSubmit={handleSubmit} className="p-10 space-y-8">
                    {error && (
                        <div className="bg-red-50 border-r-4 border-neo-error text-neo-error p-4 rounded-lg flex items-start gap-3 text-right">
                            <AlertTriangle size={20} className="mt-0.5 flex-shrink-0" />
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                        <div className="space-y-2"><label htmlFor="fullName" className="text-sm font-bold text-neo-secondary/80">الاسم الخماسي الكامل</label><Input id="fullName" name="fullName" type="text" placeholder="أدخل الاسم الخماسي الكامل كما هو بالبطاقة" value={formData.fullName} onChange={handleChange} disabled={loading} icon={User} /></div>
                        <div className="space-y-2"><label htmlFor="nationalId" className="text-sm font-bold text-neo-secondary/80">الرقم القومي (14 رقماً)</label><Input id="nationalId" name="nationalId" type="tel" inputMode="numeric" placeholder="14 رقماً بالضبط" value={formData.nationalId} onChange={handleChange} disabled={loading} icon={Key} /></div>
                        <div className="space-y-2"><label htmlFor="dob" className="text-sm font-bold text-neo-secondary/80">تاريخ الميلاد (DD/MM/YYYY)</label><Input id="dob" name="dob" type="text" placeholder="أدخل تاريخ الميلاد بالصيغة DD/MM/YYYY" value={formData.dob} onChange={handleChange} disabled={loading} icon={Calendar} maxLength={10} /></div>
                        <div className="space-y-2"><label htmlFor="expiry" className="text-sm font-bold text-neo-secondary/80">تاريخ انتهاء البطاقة (DD/MM/YYYY)</label><Input id="expiry" name="expiry" type="text" placeholder="أدخل تاريخ انتهاء البطاقة بالصيغة DD/MM/YYYY" value={formData.expiry} onChange={handleChange} disabled={loading} icon={Calendar} maxLength={10} /></div>
                    </div>
                    <div className="pt-6 flex justify-end">
                        <Button type="submit" size="lg" className="w-full md:w-auto min-w-[250px]" isLoading={loading} disabled={loading}>
                            <span>التحقق والمتابعة</span><ArrowRight className="mr-2 h-5 w-5" />
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const ResetPasswordScreen = ({ onBackToLogin, onBackToVerify }) => {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!newPassword || !confirmPassword) {
            setError('يجب ملء كلا الحقلين.');
            return;
        }
        if (newPassword.length < 4) {
            setError('يجب أن تكون كلمة المرور 4 أحرف على الأقل.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('كلمات المرور غير متطابقة.');
            return;
        }

        setLoading(true);
        try {
            const allUsers = await fetchUsers();
            const admin = allUsers.find(u => u.accessLevel === 'Admin');
            if (!admin) {
                throw new Error('لم يتم العثور على حساب المدير لتحديثه.');
            }
            await updateUser(admin.id, { password: newPassword });
            setSuccess(true);
            setTimeout(() => {
                onBackToLogin();
            }, 3000); // Redirect to login after 3 seconds
        } catch (err: any) {
            setError(err.message || 'فشل تحديث كلمة المرور.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-neo-bg relative overflow-hidden">
                <div className="bg-subtle-pattern-layer"></div>
                <div className="text-center space-y-4 animate-in zoom-in duration-300 relative z-10 bg-white/70 p-12 rounded-2xl backdrop-blur-sm border border-white/40 shadow-xl">
                    <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto text-neo-success"><CheckCircle2 size={40} /></div>
                    <h2 className="text-3xl font-bold text-neo-secondary">تم تحديث كلمة المرور!</h2>
                    <p className="text-neo-secondary/70">سيتم الآن إعادتك إلى شاشة تسجيل الدخول.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen w-full flex items-center justify-center p-4 bg-neo-bg relative overflow-hidden">
            <div className="bg-subtle-pattern-layer"></div>
            <div className="w-full max-w-xl bg-white rounded-[2rem] shadow-2xl border border-neo-soft-gray overflow-hidden relative z-20" dir="rtl">
                <div className="p-8 border-b border-neo-soft-gray bg-gray-50/50 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 bg-neo-primary/10 rounded-full flex items-center justify-center mb-4 text-neo-primary">
                        <Key size={32} />
                    </div>
                    <h2 className="text-3xl font-black text-neo-secondary mb-2">تعيين كلمة المرور (2/2)</h2>
                    <p className="text-neo-secondary/60 max-w-lg text-sm">أدخل كلمة مرور جديدة وقوية لحساب المدير.</p>
                </div>
                 <div className="absolute top-6 left-6">
                    <Button variant="outline" size="icon" onClick={onBackToVerify} title="العودة"><ArrowLeft size={20} /></Button>
                </div>
                <form onSubmit={handleResetPassword} className="p-10 space-y-6">
                    {error && (
                        <div className="bg-red-50 border-r-4 border-neo-error text-neo-error p-4 rounded-lg flex items-start gap-3 text-right">
                            <AlertTriangle size={20} className="mt-0.5 flex-shrink-0" />
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}
                    <div className="space-y-2">
                        <label htmlFor="newPassword" className="text-sm font-bold text-neo-secondary/80">كلمة المرور الجديدة</label>
                        <Input id="newPassword" name="newPassword" type={showPassword ? 'text' : 'password'} placeholder="4 أحرف على الأقل" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} disabled={loading} icon={Key} toggleIcon={showPassword ? <EyeOff size={20} /> : <Eye size={20} />} onToggle={() => setShowPassword(!showPassword)} />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="confirmPassword" className="text-sm font-bold text-neo-secondary/80">تأكيد كلمة المرور</label>
                        <Input id="confirmPassword" name="confirmPassword" type={showPassword ? 'text' : 'password'} placeholder="أعد إدخال كلمة المرور" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={loading} icon={Key} />
                    </div>
                    <div className="pt-6 flex justify-end">
                        <Button type="submit" size="lg" className="w-full md:w-auto min-w-[250px]" isLoading={loading} disabled={loading}>
                            <span>حفظ كلمة المرور</span><ArrowRight className="mr-2 h-5 w-5" />
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// --- Main Application Orchestrator ---

export default function HoodPanel() {
  const { login } = useAuth();
  const { logoUrl } = useBranding();
  const [currentView, setCurrentView] = useState('login');
  const [username, setUsername] = useState(''); 
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [countdown, setCountdown] = useState(15);
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  const MAX_ATTEMPTS = 3;
  const LOCKOUT_TIME = 15;
  const TRANSITION_DURATION = 500;

  useEffect(() => {
    let timer;
    if (isLocked && countdown > 0) {
      timer = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    } else if (countdown === 0 && isLocked) {
      setIsLocked(false); setAttempts(0); setCountdown(LOCKOUT_TIME); setUsername(''); setPassword('');
    }
    return () => clearInterval(timer);
  }, [isLocked, countdown]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLocked || isTransitioning) return;
    setLoginError('');
    if (!username || !password) {
        setLoginError('الرجاء إدخال اسم المستخدم وكلمة المرور.');
        const formContainer = document.getElementById('login-card');
        if(formContainer) { formContainer.classList.add('animate-shake'); setTimeout(() => formContainer.classList.remove('animate-shake'), 500); }
        return; 
    }
    setLoading(true);
    
    // 1. Check for temporary hardcoded user
    if (username === 'Mohamed' && password === '111') {
        const tempAdminUser: UserType = {
            id: 'temp-admin',
            username: 'Mohamed',
            accessLevel: 'Admin',
            profilePicture: '',
        };
        setTimeout(() => {
            setLoading(false);
            setAttempts(0);
            login(tempAdminUser);
        }, 800);
        return;
    }
    
    // 2. If not temp user, check Firebase
    try {
        const users: UserType[] = await fetchUsers();
        const foundUser = users.find(
            (user) => user.username && user.username.toLowerCase() === username.toLowerCase() && user.password === password
        );

        setTimeout(() => {
            setLoading(false);
            if (foundUser) {
                setAttempts(0);
                login(foundUser);
            } else {
                const newAttempts = attempts + 1;
                setAttempts(newAttempts);
                setLoginError(`بيانات غير صحيحة. المحاولات المتبقية: ${MAX_ATTEMPTS - newAttempts}`);
                
                if (newAttempts >= MAX_ATTEMPTS) {
                    setIsTransitioning(true);
                    setTimeout(() => { setIsLocked(true); setIsTransitioning(false); setLoginError(''); }, TRANSITION_DURATION); 
                } else {
                    const formContainer = document.getElementById('login-card');
                    if(formContainer) { formContainer.classList.add('animate-shake'); setTimeout(() => formContainer.classList.remove('animate-shake'), 500); }
                }
            }
        }, 800);
    } catch (err) {
        setLoading(false);
        setLoginError('خطأ في استرجاع بيانات المستخدمين.');
    }
  };

  if (currentView === 'verify') return <><GlobalStyles /><IdentityVerificationScreen onBack={() => setCurrentView('login')} onSuccess={() => setCurrentView('reset')} /></>;
  if (currentView === 'reset') return <><GlobalStyles /><ResetPasswordScreen onBackToLogin={() => setCurrentView('login')} onBackToVerify={() => setCurrentView('verify')} /></>;

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-8 transition-colors duration-500 relative overflow-hidden bg-neo-bg">
      <GlobalStyles />
      <div className={`bg-subtle-pattern-layer ${isLocked ? 'opacity-0' : ''}`}></div>

      {isLocked ? (
        <GlobalLockoutScreen countdown={countdown} />
      ) : (
        <div className={`w-full max-w-4xl h-[600px] rounded-[2rem] relative z-10 transition-opacity transition-transform duration-500 ${isTransitioning ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100 scale-100'}`}>
            <div id="login-card" className="bg-white h-full shadow-2xl overflow-hidden flex flex-row border border-neo-soft-gray rounded-[2rem]">
              
                {/* RIGHT SIDE: Identity - Now on the Right */}
                <div className="w-1/2 h-full bg-neo-primary relative overflow-hidden flex flex-col items-center justify-center text-white text-center p-12">
                  <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
                  <div className="absolute bottom-0 left-0 w-[600px] h-[600px] bg-neo-accent opacity-20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500/30 to-to-orange-700/30 backdrop-blur-[1px]"></div>
                  <div className="relative z-10 space-y-8 transform hover:scale-105 transition-transform duration-700">
                    <div className="flex items-center justify-center pt-8">
                        <img src={logoUrl} alt="شعار هوت بروست" className="w-24 h-24 object-contain transform hover:scale-110 transition-transform duration-500" />
                    </div>
                    <div className="space-y-4">
                      <h1 className="text-5xl font-black tracking-tight drop-shadow-lg">لوحه هوت</h1>
                      <div className="h-1 w-24 bg-orange-300 mx-auto rounded-full"></div>
                      <p className="text-orange-100 text-lg max-w-sm mx-auto font-light leading-relaxed">
                        منصة الإدارة المركزية للعمليات الأمنية. الوصول مصرح فقط للمسؤولين.
                      </p>
                    </div>
                  </div>
                  <div className="absolute bottom-8 text-orange-200/60 text-xs tracking-[0.2em] font-mono">
                    SECURE CONNECTION :: ESTABLISHED
                  </div>
                </div>

                {/* LEFT SIDE: Inputs - Now on the Left */}
                <div className="w-1/2 h-full p-12 flex flex-col justify-center bg-white relative z-10">
                    <div className="mb-12 text-center dir-rtl" dir="rtl">
                      <h2 className="text-4xl font-black text-neo-secondary mb-2">أهلاً بعودتك</h2> 
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4" dir="rtl">
                        <div className="space-y-4 text-right pt-4"> 
                            <label className="text-sm font-bold text-neo-secondary/80 mr-1">اسم المستخدم</label>
                            <Input type="text" placeholder="ادخل اسم المستخدم" value={username} onChange={(e) => setUsername(e.target.value)} disabled={loading} icon={User} />
                        </div>
                        <div className="space-y-4 text-right pt-4"> 
                            <label className="text-sm font-bold text-neo-secondary/80 mr-1">كلمة المرور</label>
                            <Input type={showPassword ? "text" : "password"} placeholder="ادخل كلمة المرور" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} icon={Key} toggleIcon={showPassword ? <EyeOff size={20} /> : <Eye size={20} />} onToggle={() => setShowPassword(!showPassword)} />
                            <div className="flex justify-end pt-1">
                              <button type="button" onClick={() => setCurrentView('verify')} className="text-xs font-semibold text-neo-primary hover:text-neo-accent hover:underline transition-all outline-none">
                                نسيت كلمة المرور؟
                              </button>
                            </div>
                        </div>
                        {loginError && (
                          <div className="flex items-center gap-2 text-neo-error bg-red-50 p-3 rounded-md text-sm font-bold justify-end">
                             <span>{loginError}</span>
                             <XCircle size={16} />
                          </div>
                        )}
                        <div className="pt-8"> 
                          <Button type="submit" className="w-full text-lg h-14 rounded-xl" isLoading={loading}>
                            {loading ? 'جاري التحقق...' : 'تفعيل المصادقة'}
                          </Button>
                        </div>
                    </form>
                    <div className="mt-auto pt-6 text-right dir-rtl border-t border-neo-soft-gray">
                      <p className="text-xs text-neo-secondary/60 font-medium leading-relaxed flex justify-end items-center space-x-reverse space-x-1">
                        <span className="font-extrabold tracking-widest text-sm uppercase whitespace-nowrap">
                          <span className="text-neo-secondary">APEX</span>
                          <span className="text-neo-primary">SYNEX</span>
                        </span>
                        <span>تم التطوير والبرمجة بواسطة</span>
                      </p>
                    </div>
                </div>

            </div>
        </div>
      )}
    </div>
  );
}