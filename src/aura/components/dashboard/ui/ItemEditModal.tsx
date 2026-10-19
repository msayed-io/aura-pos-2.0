import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { MenuItem, Category, Offer } from '../../../types';
import { XIcon, SpinnerIcon, UploadCloudIcon, FileTextIcon } from '../Icons';
import ImageCropperModal from './ImageCropperModal';
import { useDashboard } from '../DashboardContext';
import { ToggleSwitch } from './ToggleSwitch';

interface AspectRatioOption {
  label: string;
  value: number;
}

interface ItemEditModalProps {
  item: MenuItem | Offer | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (item: Partial<MenuItem | Offer>) => Promise<void>;
  itemType: 'menu' | 'offer';
  categories: Category[];
  cropperConfig?: {
    aspectRatios?: AspectRatioOption[];
    defaultAspectRatio?: number;
  }
}

const NEW_RELEASES_CATEGORY_ID = 'cat_new_releases';
const NEW_RELEASES_CATEGORY = { id: NEW_RELEASES_CATEGORY_ID, name: 'أحدث الإصدارات', order: -2 };

const ItemEditModal: React.FC<ItemEditModalProps> = ({ item, isOpen, onClose, onSave, itemType, categories, cropperConfig }) => {
  const [formData, setFormData] = useState<Partial<MenuItem | Offer>>({});
  const [duration, setDuration] = useState({ hours: '', minutes: '', seconds: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const { showToast } = useDashboard();
  const [selectedLibraryCategories, setSelectedLibraryCategories] = useState<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);

  const isNewItem = !item;

  useEffect(() => {
    if (isOpen) {
      if (isNewItem) {
        setFormData({ 
            name: '', 
            description: '', 
            price: undefined, 
            image: 'https://i.ibb.co/p3rC9Y0/placeholder-image.png', 
            primaryCategory: itemType === 'offer' ? 'cat_offers' : (categories.find(c => c.id !== 'all')?.id || ''),
            isActive: true,
        });
        setSelectedLibraryCategories(new Set());
        setDuration({ hours: '', minutes: '', seconds: '' });
      } else {
        const menuItem = item as MenuItem;
        setFormData({ ...item, isActive: item.isActive ?? true });
        setSelectedLibraryCategories(new Set(menuItem.libraryCategories || []));

        if (itemType === 'offer' && (item as Offer).durationInSeconds) {
          const totalSeconds = (item as Offer).durationInSeconds ?? 0;
          const hours = Math.floor(totalSeconds / 3600);
          const minutes = Math.floor((totalSeconds % 3600) / 60);
          const seconds = totalSeconds % 60;
          setDuration({ 
              hours: hours > 0 ? String(hours) : '', 
              minutes: minutes > 0 ? String(minutes) : '', 
              seconds: seconds > 0 ? String(seconds) : '' 
            });
        } else {
          setDuration({ hours: '', minutes: '', seconds: '' });
        }
      }
      setImageToCrop(null);
    }
  }, [item, isOpen, isNewItem, itemType, categories]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === 'price' ? (value === '' ? undefined : Number(value)) : value }));
  }, []);

  const handleLibraryCategoryToggle = (catId: string) => {
    setSelectedLibraryCategories(prev => {
        const newSet = new Set(prev);
        if (newSet.has(catId)) {
            newSet.delete(catId);
        } else {
            newSet.add(catId);
        }
        return newSet;
    });
  };
  
  const handleDurationChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    const numericValue = value.replace(/[^0-9]/g, ''); // Allow only numbers
    setDuration(prev => ({ ...prev, [name]: numericValue }));
  }, []);
  
  const processFile = (file: File | null) => {
      if (file) {
        if (file.size > 5 * 1024 * 1024) { // 5MB limit
            showToast({ message: "حجم الصورة كبير جداً. يرجى اختيار صورة أصغر من 5 ميجابايت.", type: 'error' });
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            setImageToCrop(reader.result as string);
        };
        reader.readAsDataURL(file);
      }
  }

  const handleImageFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    processFile(e.target.files?.[0] || null);
    e.target.value = ''; // Reset file input
  }, [showToast]);
  
  const handleDragOver = (e: React.DragEvent<HTMLElement>) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
      e.preventDefault();
      setIsDragging(false);
      processFile(e.dataTransfer.files?.[0] || null);
  };


  const handleCropComplete = (croppedImage: string) => {
    setFormData(prev => ({ ...prev, image: croppedImage }));
    setImageToCrop(null);
  }

  const handleSaveClick = async () => {
    if (!formData.name || (itemType === 'menu' && !(formData as MenuItem).primaryCategory)) {
        showToast({ message: "يرجى ملء اسم الكتاب واختيار القسم.", type: 'error' });
        return;
    }
    if (typeof formData.price !== 'number' || formData.price < 0) {
        showToast({ message: "يرجى إدخال سعر صحيح.", type: 'error' });
        return;
    }

    setIsSaving(true);
    try {
      const finalData: Partial<MenuItem | Offer> = { ...formData };
      
      if (itemType === 'menu') {
        const menuData = finalData as Partial<MenuItem>;
        if (menuData.primaryCategory === NEW_RELEASES_CATEGORY_ID) {
            menuData.isNewRelease = true;
            menuData.libraryCategories = Array.from(selectedLibraryCategories);
        } else {
            menuData.isNewRelease = false;
            menuData.libraryCategories = menuData.primaryCategory ? [menuData.primaryCategory] : [];
        }
      }

      if (itemType === 'offer') {
        const hours = parseInt(duration.hours, 10) || 0;
        const minutes = parseInt(duration.minutes, 10) || 0;
        const seconds = parseInt(duration.seconds, 10) || 0;
        const totalSeconds = (hours * 3600) + (minutes * 60) + seconds;
        
        const offerData = finalData as Partial<Offer>;
        offerData.durationInSeconds = totalSeconds > 0 ? totalSeconds : null;
      }
      await onSave(finalData);
      onClose();
    } catch (error) {
      console.error("Failed to save item:", error);
      showToast({ message: "فشل الحفظ. يرجى المحاولة مرة أخرى.", type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };
  
  if (!isOpen) return null;

  const portalRoot = document.getElementById('modal-root');
  if (!portalRoot) {
    console.error("Modal root element #modal-root not found in the DOM.");
    return null;
  }

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 modal-backdrop-blur" onClick={onClose}>
        <div className="relative premium-modal w-full max-w-lg animate-scale-in" onClick={(e) => e.stopPropagation()}>
          <header className="p-6 border-b border-neo-soft-gray flex justify-between items-center bg-gray-50/50 rounded-t-[3rem]">
            <h2 className="text-xl font-bold font-cairo text-neo-secondary">
              {isNewItem ? `إضافة ${itemType === 'menu' ? 'صنف' : 'عرض'} جديد` : `تعديل: ${item?.name}`}
            </h2>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-neo-soft-gray text-neo-secondary/70"><XIcon className="w-5 h-5"/></button>
          </header>
          <main className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div>
                <label className="font-bold text-sm text-neo-secondary/80 mr-2">اسم الصنف/العرض</label>
                <input type="text" name="name" value={formData.name || ''} onChange={handleChange} className="w-full mt-1 premium-input" />
              </div>
              {itemType === 'menu' && (
               <div>
                <label className="font-bold text-sm text-neo-secondary/80 mr-2">وصف الصنف</label>
                <textarea name="description" value={formData.description || ''} onChange={handleChange} rows={3} className="w-full mt-1 premium-input"></textarea>
              </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                   <div>
                      <label className="font-bold text-sm text-neo-secondary/80 mr-2">السعر (ج.م)</label>
                      <input type="number" name="price" value={formData.price ?? ''} onChange={handleChange} className="w-full mt-1 premium-input font-montserrat" placeholder="--.--" />
                  </div>
                   {itemType === 'menu' && (
                    <div>
                        <label className="font-bold text-sm text-neo-secondary/80 mr-2">القسم الأساسي</label>
                        <select name="primaryCategory" value={(formData as MenuItem).primaryCategory} onChange={handleChange} className="w-full mt-1 premium-input bg-white appearance-none">
                            <option value={NEW_RELEASES_CATEGORY.id}>{NEW_RELEASES_CATEGORY.name}</option>
                            <option disabled>──────────</option>
                            {categories.filter(c=>c.id !== 'all').map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                        </select>
                    </div>
                   )}
              </div>

              {itemType === 'menu' && (formData as MenuItem).primaryCategory === NEW_RELEASES_CATEGORY_ID && (
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg animate-fade-in">
                    <label className="font-bold text-sm text-orange-800">اختر الأقسام التي سيظهر فيها هذا الصنف</label>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-y-2 gap-x-4 max-h-32 overflow-y-auto custom-scrollbar p-2 mt-2 bg-white rounded-md">
                        {categories.filter(c => c.id !== 'all').map(cat => (
                            <label key={cat.id} className="flex items-center text-sm text-neo-secondary cursor-pointer">
                                <input
                                    type="checkbox"
                                    className="form-checkbox h-4 w-4 text-neo-primary bg-gray-100 border-gray-300 rounded focus:ring-neo-primary"
                                    checked={selectedLibraryCategories.has(cat.id)}
                                    onChange={() => handleLibraryCategoryToggle(cat.id)}
                                />
                                <span className="mr-2">{cat.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
              )}

              {itemType === 'offer' && (
                 <div>
                     <label className="font-bold text-sm text-neo-secondary/80">مدة العرض (اختياري)</label>
                     <p className="text-sm text-neo-secondary/60 mb-2">أدخل مدة العرض بالساعات/الدقائق/الثواني — اتركها فارغة إذا كان العرض دائماً.</p>
                     <div className="grid grid-cols-3 gap-2">
                         <input type="number" name="hours" value={duration.hours} onChange={handleDurationChange} placeholder="ساعات" className="w-full p-2 border border-neo-soft-gray rounded-md text-center bg-white text-black" />
                         <input type="number" name="minutes" value={duration.minutes} onChange={handleDurationChange} placeholder="دقائق" className="w-full p-2 border border-neo-soft-gray rounded-md text-center bg-white text-black" />
                         <input type="number" name="seconds" value={duration.seconds} onChange={handleDurationChange} placeholder="ثواني" className="w-full p-2 border border-neo-soft-gray rounded-md text-center bg-white text-black" />
                     </div>
                 </div>
              )}
             
             <div>
                <label className="font-bold text-sm text-neo-secondary/80 mb-1">الصورة</label>
                 <div className="flex items-center gap-4">
                    <img src={formData.image} alt="Preview" className="w-24 h-24 object-cover rounded-xl bg-neo-soft-gray border border-neo-soft-gray" />
                    <label 
                        htmlFor="imageUpload" 
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        className={`flex-grow w-full h-24 text-center cursor-pointer bg-white border-2 border-dashed border-neo-soft-gray rounded-lg px-4 py-2 text-neo-secondary hover:border-neo-primary hover:text-neo-primary transition-colors flex flex-col items-center justify-center gap-1 ${isDragging ? 'border-neo-primary bg-blue-50' : ''}`}
                    >
                        <UploadCloudIcon className="w-6 h-6"/>
                        <span className="font-semibold text-xs">اسحب وأفلت أو انقر للرفع</span>
                    </label>
                    <input type="file" id="imageUpload" accept="image/*" onChange={handleImageFileChange} className="hidden rounded-xl" />
                </div>
             </div>
             {(itemType === 'menu' || itemType === 'offer') && (
                <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-neo-soft-gray">
                    <div>
                        <p className="font-bold text-sm text-neo-secondary/80">حالة الصنف</p>
                        <p className="text-sm font-normal text-neo-secondary/60">الأصناف غير النشطة لا تظهر للعملاء.</p>
                    </div>
                    <ToggleSwitch
                        checked={formData.isActive ?? true}
                        onChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                        label={(formData.isActive ?? true) ? "نشط" : "غير نشط"}
                    />
                </div>
             )}
          </main>
          <footer className="p-6 bg-gray-50 border-t border-neo-soft-gray flex justify-end gap-3 rounded-b-[3rem]">
            <button onClick={onClose} className="px-6 py-2.5 bg-white border border-gray-200 text-neo-secondary font-bold rounded-xl hover:bg-gray-50 transition-colors">إلغاء</button>
            <button onClick={handleSaveClick} disabled={isSaving} className="px-6 py-2.5 bg-neo-primary text-white font-bold rounded-xl hover:bg-neo-accent disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-neo-primary/20 transition-all active:scale-95">
              {isSaving && <SpinnerIcon className="w-4 h-4 animate-spin" />}
              {isSaving ? 'جاري الحفظ...' : 'حفظ التغييرات'}
            </button>
          </footer>
        </div>
    </div>
  );

  return (
    <>
      {createPortal(content, portalRoot)}
      {imageToCrop && (
        <ImageCropperModal
            imageSrc={imageToCrop}
            onClose={() => setImageToCrop(null)}
            onCropComplete={handleCropComplete}
            aspectRatios={cropperConfig?.aspectRatios}
            defaultAspectRatio={cropperConfig?.defaultAspectRatio}
        />
      )}
    </>
  );
};

export default ItemEditModal;
