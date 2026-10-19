import React, { useState, useCallback } from 'react';
import { useBranding } from '../../../../contexts/BrandingContext';
import { Promotion, PromotionType } from '../../../../types';
import { useDashboard } from '../../DashboardContext';
import PromotionEditModal from '../../ui/PromotionEditModal';
import { UploadCloudIcon, SaveIcon, ImageIcon, MegaphoneIcon, PlusIcon, PencilIcon, TrashIcon, TicketIcon, PaletteIcon } from '../../Icons';
import { Truck as TruckIcon } from 'lucide-react';
import DeleteConfirmationModal from '../../ui/DeleteConfirmationModal';
import ImageCropperModal from '../../ui/ImageCropperModal';

// ============================================================================
// --- Branding Page Component ---
// ============================================================================
const BrandingPage: React.FC = () => {
    return (
        <div className="flex flex-col h-full">
            <header className="text-center pt-12 pb-6 max-w-3xl mx-auto">
                <h1 className="text-4xl font-black font-cairo text-neo-secondary">الهوية البصرية</h1>
                <p className="mt-3 text-lg text-neo-secondary/60 leading-relaxed">
                    تحكم في شعار المطعم والعروض الترويجية التي تظهر للعملاء في الموقع الرئيسي.
                </p>
            </header>
            
            <main className="flex-grow flex items-start justify-center pb-12">
                <div className="w-full max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 animate-fade-in">
                    <LogoManagementCard />
                    <HeroImageManagementCard />
                    <div className="lg:col-span-2">
                        <ThemeManagementCard />
                    </div>
                    <div className="lg:col-span-2">
                        <PromotionsManagementCard />
                    </div>
                </div>
            </main>
        </div>
    );
};

// ============================================================================
// --- Logo Management Card ---
// ============================================================================
const LogoManagementCard: React.FC = () => {
    const { logoUrl, setLogo } = useBranding();
    const { showToast } = useDashboard();
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!['image/png', 'image/svg+xml', 'image/jpeg'].includes(file.type)) {
            showToast({ message: 'الرجاء اختيار ملف بصيغة PNG, SVG, أو JPG.', type: 'error' });
            return;
        }

        if (file.size > 2 * 1024 * 1024) { // 2MB limit
            showToast({ message: 'حجم الصورة كبير جداً (الحد الأقصى 2MB).', type: 'error' });
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            setPreviewUrl(event.target?.result as string);
        };
        reader.readAsDataURL(file);
    };

    const handleSaveLogo = () => {
        if (!previewUrl) {
            showToast({ message: 'الرجاء اختيار شعار جديد أولاً.', type: 'error' });
            return;
        }
        setLogo(previewUrl);
        showToast({ message: 'تم تحديث الشعار بنجاح!', type: 'success' });
        setPreviewUrl(null); // Reset preview after saving
    };

    return (
        <div className="bg-white premium-card shadow-lg p-10 flex flex-col gap-6 border-transparent">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center bg-neo-primary/10 text-neo-primary rounded-xl">
                    <ImageIcon className="w-6 h-6" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-neo-secondary">شعار المطعم</h2>
                    <p className="text-sm text-neo-secondary/60">يظهر في رأس الموقع والفواتير.</p>
                </div>
            </div>

            <div className="flex items-center justify-around gap-6 p-4 bg-neo-bg rounded-xl border border-neo-soft-gray">
                <div className="text-center">
                    <p className="text-xs font-bold text-neo-secondary/60 mb-2">الشعار الحالي</p>
                    <img src={logoUrl} alt="Current Logo" className="w-24 h-24 object-contain rounded-full bg-white shadow-md p-1" />
                </div>
                {previewUrl && (
                    <div className="text-center animate-fade-in">
                        <p className="text-xs font-bold text-neo-primary mb-2">الشعار الجديد (معاينة)</p>
                        <img src={previewUrl} alt="New Logo Preview" className="w-24 h-24 object-contain rounded-full bg-white shadow-lg border-2 border-neo-primary p-1" />
                    </div>
                )}
            </div>
            
            <div>
                 <label htmlFor="logo-upload" className="w-full text-center cursor-pointer bg-white border-2 border-dashed border-neo-soft-gray rounded-lg px-4 py-6 text-neo-secondary hover:border-neo-primary hover:text-neo-primary transition-colors flex flex-col items-center justify-center gap-2">
                    <UploadCloudIcon className="w-8 h-8"/>
                    <span className="font-semibold text-sm">اسحب وأفلت أو انقر لرفع شعار</span>
                    <span className="text-xs text-neo-secondary/50">PNG, JPG, SVG (بحد أقصى 2MB)</span>
                </label>
                <input id="logo-upload" type="file" className="hidden rounded-xl" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={handleFileChange} />
            </div>

            <button onClick={handleSaveLogo} disabled={!previewUrl} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                <SaveIcon className="w-5 h-5"/>
                <span>حفظ الشعار الجديد</span>
            </button>
        </div>
    );
};


// ============================================================================
// --- Hero Image Management Card ---
// ============================================================================
const HeroImageManagementCard: React.FC = () => {
    const { heroImageUrl, setHeroImage } = useBranding();
    const { showToast } = useDashboard();
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [imageToCrop, setImageToCrop] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
            showToast({ message: 'الرجاء اختيار ملف بصيغة PNG, JPG, أو WEBP.', type: 'error' });
            return;
        }

        if (file.size > 2 * 1024 * 1024) { // 2MB limit
            showToast({ message: 'حجم الصورة كبير جداً (الحد الأقصى 2MB).', type: 'error' });
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            setImageToCrop(event.target?.result as string);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleCropComplete = (croppedImage: string) => {
        setPreviewUrl(croppedImage);
        setImageToCrop(null);
    };

    const handleSaveImage = () => {
        if (!previewUrl) {
            showToast({ message: 'الرجاء اختيار صورة جديدة أولاً.', type: 'error' });
            return;
        }
        setHeroImage(previewUrl);
        showToast({ message: 'تم تحديث صورة الخلفية بنجاح!', type: 'success' });
        setPreviewUrl(null);
    };

    return (
        <>
            <div className="bg-white premium-card shadow-lg p-10 flex flex-col gap-6 border-transparent">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 flex items-center justify-center bg-neo-primary/10 text-neo-primary rounded-xl">
                        <ImageIcon className="w-6 h-6" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-neo-secondary">صورة خلفية الموقع</h2>
                        <p className="text-sm text-neo-secondary/60">الصورة التي ستظهر كخلفية رئيسية لجميع صفحات الموقع.</p>
                    </div>
                </div>

                <div className="flex items-center justify-around gap-6 p-4 bg-neo-bg rounded-xl border border-neo-soft-gray">
                    <div className="text-center">
                        <p className="text-xs font-bold text-neo-secondary/60 mb-2">الصورة الحالية</p>
                        <img src={heroImageUrl} alt="Current Hero" className="w-24 h-24 object-cover rounded-full bg-white shadow-md p-1" />
                    </div>
                    {previewUrl && (
                        <div className="text-center animate-fade-in">
                            <p className="text-xs font-bold text-neo-primary mb-2">الصورة الجديدة (معاينة)</p>
                            <img src={previewUrl} alt="New Hero Preview" className="w-24 h-24 object-cover rounded-full bg-white shadow-lg border-2 border-neo-primary p-1" />
                        </div>
                    )}
                </div>
                
                <div>
                     <label htmlFor="hero-upload" className="w-full text-center cursor-pointer bg-white border-2 border-dashed border-neo-soft-gray rounded-lg px-4 py-6 text-neo-secondary hover:border-neo-primary hover:text-neo-primary transition-colors flex flex-col items-center justify-center gap-2">
                        <UploadCloudIcon className="w-8 h-8"/>
                        <span className="font-semibold text-sm">اسحب وأفلت أو انقر لرفع صورة الخلفية</span>
                        <span className="text-xs text-neo-secondary/50">PNG, JPG, WEBP (مقاس 9:16 مطلوب, بحد أقصى 2MB)</span>
                    </label>
                    <input id="hero-upload" type="file" className="hidden rounded-xl" accept="image/png,image/jpeg,image/webp" onChange={handleFileChange} />
                </div>

                <button onClick={handleSaveImage} disabled={!previewUrl} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                    <SaveIcon className="w-5 h-5"/>
                    <span>حفظ الصورة الجديدة</span>
                </button>
            </div>
             {imageToCrop && (
                <ImageCropperModal
                    imageSrc={imageToCrop}
                    onClose={() => setImageToCrop(null)}
                    onCropComplete={handleCropComplete}
                    aspectRatios={[
                        { label: 'طولي (9:16)', value: 9 / 16 },
                    ]}
                    defaultAspectRatio={9 / 16}
                />
            )}
        </>
    );
};

// ============================================================================
// --- Theme Management Card ---
// ============================================================================
const ThemeManagementCard: React.FC = () => {
    const { primaryColor, setPrimaryColor, accentColor, setAccentColor } = useBranding();
    const { showToast } = useDashboard();
    const [localPrimary, setLocalPrimary] = useState(primaryColor);
    const [localAccent, setLocalAccent] = useState(accentColor);

    const handleSaveColors = () => {
        setPrimaryColor(localPrimary);
        setAccentColor(localAccent);
        showToast({ message: 'تم تحديث ألوان النظام بنجاح!', type: 'success' });
    };

    return (
        <div className="bg-white premium-card shadow-lg p-10 flex flex-col gap-8 border-transparent">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 flex items-center justify-center bg-neo-primary/10 text-neo-primary rounded-xl">
                    <PaletteIcon className="w-6 h-6" />
                </div>
                <div>
                    <h2 className="text-lg font-bold text-neo-secondary">ألوان النظام (الثيم)</h2>
                    <p className="text-sm text-neo-secondary/60">تحكم في اللون الأساسي ولون التمييز لجميع واجهات النظام.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Primary Color */}
                <div className="flex flex-col gap-4 p-6 bg-neo-bg rounded-2xl border border-neo-soft-gray">
                    <label className="text-sm font-bold text-neo-secondary">اللون الأساسي (Primary)</label>
                    <div className="flex items-center gap-4">
                        <input 
                            type="color" 
                            value={localPrimary}
                            onChange={(e) => setLocalPrimary(e.target.value)}
                            className="w-16 h-16 rounded-xl cursor-pointer border-none bg-transparent"
                        />
                        <div className="flex-grow">
                            <input 
                                type="text" 
                                value={localPrimary}
                                onChange={(e) => setLocalPrimary(e.target.value)}
                                className="w-full premium-input font-mono text-sm uppercase"
                            />
                        </div>
                    </div>
                    <p className="text-xs text-neo-secondary/40">هذا اللون يُستخدم في الأزرار الرئيسية، القوائم، والعناصر النشطة.</p>
                </div>

                {/* Accent Color */}
                <div className="flex flex-col gap-4 p-6 bg-neo-bg rounded-2xl border border-neo-soft-gray">
                    <label className="text-sm font-bold text-neo-secondary">لون التمييز (Accent)</label>
                    <div className="flex items-center gap-4">
                        <input 
                            type="color" 
                            value={localAccent}
                            onChange={(e) => setLocalAccent(e.target.value)}
                            className="w-16 h-16 rounded-xl cursor-pointer border-none bg-transparent"
                        />
                        <div className="flex-grow">
                            <input 
                                type="text" 
                                value={localAccent}
                                onChange={(e) => setLocalAccent(e.target.value)}
                                className="w-full premium-input font-mono text-sm uppercase"
                            />
                        </div>
                    </div>
                    <p className="text-xs text-neo-secondary/40">هذا اللون يُستخدم في العروض، أيقونات التنبيه، وبعض الزخارف.</p>
                </div>
            </div>

            <button 
                onClick={handleSaveColors}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent transition shadow-sm"
            >
                <SaveIcon className="w-5 h-5"/>
                <span>حفظ الألوان الجديدة</span>
            </button>
        </div>
    );
};

// ============================================================================
// --- Promotion Item Card (New Visual Component) ---
// ============================================================================
const PromotionItemCard: React.FC<{
  promo: Promotion;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ promo, onEdit, onDelete }) => {
  const typeMap: Record<PromotionType, { icon: React.ReactNode; label: string; color: string }> = {
    SIMPLE_ANNOUNCEMENT: { icon: <MegaphoneIcon className="w-4 h-4"/>, label: 'إعلان نصي', color: 'orange' },
    COUPON_DISCOUNT: { icon: <TicketIcon className="w-4 h-4"/>, label: 'خصم بكوبون', color: 'purple' },
    FREE_DELIVERY: { icon: <TruckIcon className="w-4 h-4"/>, label: 'توصيل مجاني', color: 'teal' },
  };

  const { icon, label, color } = typeMap[promo.type] || typeMap.SIMPLE_ANNOUNCEMENT;
  
  const colorClasses = {
      orange: { bg: 'bg-orange-100', text: 'text-orange-700' },
      purple: { bg: 'bg-purple-100', text: 'text-purple-700' },
      teal: { bg: 'bg-teal-100', text: 'text-teal-700' },
  };

  return (
    <div className="group premium-card p-6 flex flex-col gap-4 border-transparent">
      <div className="flex justify-between items-start">
        <div className={`flex items-center gap-2 text-xs font-bold ${colorClasses[color as keyof typeof colorClasses].bg} ${colorClasses[color as keyof typeof colorClasses].text} px-3 py-1 rounded-full`}>
          {icon}
          <span>{label}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="تعديل"><PencilIcon className="w-4 h-4"/></button>
          <button onClick={onDelete} className="p-2 rounded-lg hover:bg-red-100 text-red-500" title="حذف"><TrashIcon className="w-4 h-4"/></button>
        </div>
      </div>

      <div>
        <p className="font-bold text-lg text-neo-secondary leading-snug">{promo.textKey}</p>
        <p className="text-sm text-neo-secondary/50 mt-1">
          الوجهة عند الضغط: <span className="font-semibold">{promo.targetView}</span>
        </p>
      </div>

      <div className="mt-2 p-3 bg-gray-800 text-white rounded-lg text-center font-semibold text-sm shadow-inner">
        <p className="animate-pulse">{promo.textKey}</p>
      </div>
    </div>
  );
};


// ============================================================================
// --- Promotions Management Card (Refactored) ---
// ============================================================================
const PromotionsManagementCard: React.FC = () => {
    const { promotions, savePromotion, deletePromotion } = useBranding();
    const { showToast } = useDashboard();
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
    const [promoToDelete, setPromoToDelete] = useState<Promotion | null>(null);

    const handleOpenModal = (promo: Promotion | null) => {
        setEditingPromo(promo);
        setIsModalOpen(true);
    };

    const handleSave = async (promoData: Partial<Promotion>) => {
        await savePromotion(promoData);
        showToast({ message: 'تم حفظ العرض الترويجي بنجاح!', type: 'success' });
        setIsModalOpen(false);
    };

    const handleDelete = async () => {
        if (!promoToDelete) return;
        await deletePromotion(promoToDelete.id);
        showToast({ message: 'تم حذف العرض بنجاح.', type: 'success' });
        setPromoToDelete(null);
    };

    return (
        <>
            <div className="bg-white premium-card shadow-lg p-10 flex flex-col gap-6 border-transparent">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 flex items-center justify-center bg-neo-primary/10 text-neo-primary rounded-xl">
                            <MegaphoneIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-neo-secondary">إدارة العروض الترويجية</h2>
                            <p className="text-sm text-neo-secondary/60">إضافة وتعديل العروض التي تظهر بالموقع.</p>
                        </div>
                    </div>
                    <button onClick={() => handleOpenModal(null)} className="flex-shrink-0 flex items-center gap-2 h-10 px-4 bg-neo-primary text-white font-bold rounded-lg hover:bg-neo-accent transition shadow-sm text-sm">
                        <PlusIcon className="w-4 h-4"/>
                        <span>إضافة عرض</span>
                    </button>
                </div>

                 {promotions.length === 0 ? (
                    <div className="text-center p-6 bg-neo-bg rounded-lg border border-neo-soft-gray text-neo-secondary/60">
                        لا توجد عروض ترويجية حالياً.
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        {promotions.map(promo => (
                           <PromotionItemCard 
                                key={promo.id}
                                promo={promo}
                                onEdit={() => handleOpenModal(promo)}
                                onDelete={() => setPromoToDelete(promo)}
                           />
                        ))}
                    </div>
                )}
            </div>
            
            <PromotionEditModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSave}
                promotion={editingPromo}
            />

            <DeleteConfirmationModal
                isOpen={!!promoToDelete}
                onClose={() => setPromoToDelete(null)}
                onConfirm={handleDelete}
                title={`حذف العرض "${promoToDelete?.textKey}"`}
                message="هل أنت متأكد من حذف هذا العرض نهائياً؟"
                isDeleting={false}
            />
        </>
    );
};

export default BrandingPage;