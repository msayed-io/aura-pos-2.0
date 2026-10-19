import React from 'react';
import { CartItem } from './posTypes';
import { MenuItem } from '../../types';
// [PRICING ENGINE INTEGRATION] Import PricingResult for type-safe access
import type { PricingResult } from '../../types/pricingTypes';
import { 
    TrashIcon, 
    ChatIcon, 
    ShoppingCartIcon,
    CheckIcon,
    EyeIcon,
    SparklesIcon,
} from '../dashboard/Icons';

interface CartViewProps {
    cartItems: CartItem[];
    cartTotal: number;
    onUpdateQuantity: (id: string, change: number) => void;
    onRemoveItem: (id: string) => void;
    onSetNotesForItem: React.Dispatch<React.SetStateAction<string | null>>;
    notesForItem: string | null;
    currentNote: string;
    onSetCurrentNote: (note: string) => void;
    onUpdateNotes: (id: string, note: string) => void;
    onClearCart: () => void;
    onProceed: () => void;
    onPreview: () => void;
    upsellRecommendations?: MenuItem[];
    onAddUpsell?: (item: MenuItem) => void;
}
const CartView: React.FC<CartViewProps> = (props) => {
    return (
        <div className="flex flex-col h-full">
            <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-800">الطلب الحالي</h2>
            </div>

            {props.cartItems.length === 0 ? (
                <div className="flex-grow flex flex-col items-center justify-center text-center p-6">
                    <ShoppingCartIcon className="w-20 h-20 text-gray-300 mb-4"/>
                    <p className="font-bold text-gray-700">السلة فارغة</p>
                    <p className="text-sm text-gray-500 mt-1">أضف وجبات من القائمة لبدء الطلب.</p>
                </div>
            ) : (
                <div className="flex-grow overflow-y-auto p-4 space-y-4">
                    {props.cartItems.map(item => (
                         <div key={item.id} className="premium-card p-3 flex gap-4 relative border-transparent">
                            <img src={item.image} alt={item.name} className="w-24 h-24 rounded-2xl object-cover flex-shrink-0" />
                            <div className="flex-grow flex flex-col justify-between py-1">
                                <div>
                                    <p className="font-bold text-gray-900 text-base leading-tight group-hover:text-neo-primary transition-colors">{item.name}</p>
                                    {/* [PRICING ENGINE INTEGRATION] Show strikethrough original price if discounted */}
                                    <div className="mt-1">
                                        {item._originalPrice != null && item._originalPrice !== item.price ? (
                                            <div className="flex flex-col">
                                                <span className="text-xs text-gray-400 font-mono line-through">{((item._originalPrice) * item.quantity).toFixed(2)} ج.م</span>
                                                <span className="text-sm text-neo-accent font-mono font-bold">{(item.price * item.quantity).toFixed(2)} ج.م</span>
                                                {item._pricingResult && (item._pricingResult as PricingResult).appliedRules.length > 0 && (
                                                    <span className="text-[10px] text-neo-accent font-medium line-clamp-1">{(item._pricingResult as PricingResult).appliedRules[0].reason}</span>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-gray-600 font-mono font-bold">{(item.price * item.quantity).toFixed(2)} ج.م</p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <button onClick={() => props.onUpdateQuantity(item.id, -1)} className="w-8 h-8 bg-gray-100 text-gray-800 rounded-full font-bold text-xl flex items-center justify-center transition hover:bg-neo-primary hover:text-white shadow-sm">-</button>
                                    <span className="font-black text-lg w-6 text-center text-gray-900">{item.quantity}</span>
                                    <button onClick={() => props.onUpdateQuantity(item.id, 1)} className="w-8 h-8 bg-gray-100 text-gray-800 rounded-full font-bold text-xl flex items-center justify-center transition hover:bg-neo-primary hover:text-white shadow-sm">+</button>
                                </div>
                            </div>
                             <div className="absolute top-2 left-2 flex flex-col gap-1.5">
                                <button onClick={() => { props.onSetNotesForItem(prev => (prev === item.id ? null : item.id)); props.onSetCurrentNote(item.notes || ''); }} className={`p-2 rounded-full transition ${props.notesForItem === item.id ? 'bg-neo-primary text-white' : 'text-gray-400 hover:bg-neo-primary/10 hover:text-neo-primary'}`} title="إضافة ملاحظات"><ChatIcon className="w-5 h-5"/></button>
                                <button onClick={() => props.onRemoveItem(item.id)} className="p-2 rounded-full text-gray-400 hover:bg-red-100 hover:text-red-600 transition" title="حذف الصنف"><TrashIcon className="w-5 h-5"/></button>
                            </div>
                            {props.notesForItem === item.id && (
                                <div className="absolute bottom-0 left-0 right-0 p-2 bg-white shadow-lg rounded-b-xl animate-fade-in z-10 border-t border-gray-200">
                                    <div className="relative">
                                        <input 
                                            type="text"
                                            placeholder="أضف ملاحظات (مثال: بدون بصل)"
                                            value={props.currentNote}
                                            onChange={(e) => props.onSetCurrentNote(e.target.value)}
                                            onKeyDown={(e) => { if (e.key === 'Enter') props.onUpdateNotes(item.id, props.currentNote); }}
                                            autoFocus
                                            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:border-neo-primary text-black text-sm"
                                        />
                                        <button onClick={() => props.onUpdateNotes(item.id, props.currentNote)} className="absolute left-1 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center bg-neo-primary text-white rounded-full hover:bg-neo-accent transition shadow-md" title="تأكيد الملاحظة">
                                            <CheckIcon className="w-5 h-5"/>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {props.cartItems.length > 0 && props.upsellRecommendations && props.upsellRecommendations.length > 0 && (
                <div className="flex-shrink-0 px-6 py-4 bg-gradient-to-br from-neo-primary/5 to-transparent border-t border-neo-primary/10">
                    <div className="flex items-center gap-2 mb-3">
                        <SparklesIcon className="w-5 h-5 text-neo-primary animate-pulse" />
                        <h3 className="text-sm font-bold text-neo-primary">اقتراحات الذكاء الاصطناعي لك</h3>
                    </div>
                    <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                        {props.upsellRecommendations.map(rec => (
                            <div key={rec.id} className="flex-shrink-0 w-40 bg-white rounded-xl shadow-sm border border-neo-primary/20 overflow-hidden flex flex-col cursor-pointer hover:shadow-md transition-shadow" onClick={() => props.onAddUpsell && props.onAddUpsell(rec)}>
                                <div className="h-20 bg-gray-100 overflow-hidden relative">
                                    <img src={rec.image} className="w-full h-full object-cover" alt={rec.name} />
                                    <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                                        <span className="bg-neo-primary text-white text-xs font-bold px-2 py-1 rounded">إضافة</span>
                                    </div>
                                </div>
                                <div className="p-2 flex flex-col flex-grow">
                                    <p className="text-xs font-bold text-gray-800 line-clamp-1">{rec.name}</p>
                                    {/* [PRICING ENGINE INTEGRATION] Show discounted price in upsell recommendations */}
                                    {(rec as Record<string, unknown>)._originalPrice != null && (rec as Record<string, unknown>)._originalPrice !== rec.price ? (
                                        <div className="mt-auto pt-1 flex flex-col">
                                            <span className="text-[9px] text-gray-400 font-mono line-through">{(rec as Record<string, unknown>)._originalPrice as number} ج.م</span>
                                            <span className="text-xs text-neo-accent font-mono font-bold">{rec.price} ج.م</span>
                                        </div>
                                    ) : (
                                        <p className="text-xs text-neo-primary font-mono mt-auto pt-1">{rec.price} ج.م</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex-shrink-0 p-8 border-t border-gray-100 bg-gray-50/50 rounded-t-[3rem] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)]">
                <div className="flex justify-between text-lg font-bold text-gray-900 pb-4">
                    <span>الإجمالي الفرعي</span>
                    <span className="font-black text-neo-primary">{props.cartTotal.toFixed(2)} ج.م</span>
                </div>
                <div className="flex gap-3">
                     <button onClick={props.onClearCart} className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center hover:bg-red-200 transition-all disabled:opacity-50 active:scale-90" disabled={props.cartItems.length === 0} title="إفراغ السلة"><TrashIcon className="w-6 h-6"/></button>
                     <button onClick={props.onPreview} className="w-14 h-14 bg-white border border-gray-200 text-gray-700 rounded-2xl flex items-center justify-center hover:bg-gray-100 transition-all disabled:opacity-50 active:scale-90" disabled={props.cartItems.length === 0} title="معاينة الطباعة"><EyeIcon className="w-6 h-6"/></button>
                     <button onClick={props.onProceed} className="flex-grow bg-neo-primary text-white font-bold text-lg rounded-2xl hover:bg-neo-accent transition-all disabled:opacity-50 shadow-lg shadow-neo-primary/20 active:scale-95" disabled={props.cartItems.length === 0}>إتمام الطلب</button>
                </div>
            </div>
        </div>
    );
};

export default CartView;