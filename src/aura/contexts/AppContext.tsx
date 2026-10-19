import React, { createContext, useContext, ReactNode, useState } from 'react';
import { BusinessMode } from '../types';

// This is a simplified mock for the i18n functionality required by the dashboard components.
interface AppContextType {
  t: (key: string) => string;
  dir: 'rtl' | 'ltr';
  businessMode: BusinessMode;
  setBusinessMode: (mode: BusinessMode) => void;
}

const translations: Record<string, string> = {
    'dir': 'rtl',
    'checkout_title': 'إتمام طلب توصيل',
    'dine_in_checkout_title': 'إتمام طلب صالة',
    'checkout_back_to_cart': 'العودة للسلة',
    'checkout_personal_info': 'البيانات الشخصية',
    'checkout_name_placeholder': 'الاسم بالكامل',
    'checkout_phone_placeholder': 'رقم الهاتف',
    'checkout_delivery_method': 'طريقة الاستلام',
    'checkout_delivery_option': 'توصيل للمنزل',
    'checkout_pickup_option': 'استلام من الفرع',
    'checkout_address_placeholder': 'العنوان بالتفصيل (المنطقة، الشارع، رقم المبنى)',
    'checkout_pickup_info_title': 'معلومات الاستلام من الفرع:',
    'checkout_payment_method': 'طريقة الدفع',
    'checkout_payment_cash': 'كاش عند الاستلام',
    'checkout_payment_vodafone': 'فودافون كاش',
    'checkout_payment_instapay': 'انستا باي',
    'checkout_payment_screenshot': 'ثم إرسال لقطة الشاشة على واتساب.',
    'checkout_summary_title': 'ملخص الطلب',
    'checkout_coupon_code': 'كود الخصم',
    'checkout_coupon_placeholder': 'ادخل الكود هنا',
    'checkout_apply_coupon': 'تطبيق',
    'checkout_subtotal': 'المجموع الفرعي',
    'checkout_delivery_fee': 'رسوم التوصيل',
    'checkout_discount': 'الخصم',
    'checkout_total': 'الإجمالي',
    'egp': 'ج.م',
    'free': 'مجاني',
    'checkout_confirm_order': 'تأكيد الطلب',
    'checkout_placing_order': 'جاري إرسال الطلب',
    'toast_coupon_applied': 'تم تطبيق كوبون الخصم بنجاح!',
    'toast_coupon_invalid': 'كود الخصم غير صالح.',
    'enter_name_phone': 'يرجى إدخال الاسم ورقم الهاتف.',
    'enter_address': 'يرجى إدخال عنوان التوصيل.',
    'toast_order_placed': 'تم إرسال طلبك بنجاح!',
    'checkout_delivery_fee_dynamic': '25.00',
    'checkout_manual_delivery_fee': 'رسوم التوصيل (يدوي)',
    'checkout_manual_delivery_fee_placeholder': 'أدخل السعر هنا أو اتركه للتلقائي',
    'checkout_discount_type': 'نوع الخصم',
    'checkout_discount_coupon': 'كوبون',
    'checkout_discount_manual': 'يدوي',
    'checkout_manual_discount_value': 'قيمة الخصم',
    'checkout_manual_discount_placeholder': 'أدخل القيمة',
    'checkout_discount_type_percentage': '%',
    'checkout_discount_type_fixed': 'ج.م',
    'checkout_apply_discount': 'تطبيق الخصم',
    'toast_manual_discount_applied': 'تم تطبيق الخصم اليدوي.',
    'retail_mode': 'نظام التجزئة السريع',
    'restaurant_mode': 'نظام المطاعم'
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [businessMode, setBusinessMode] = useState<BusinessMode>(BusinessMode.RESTAURANT);

  const t = (key: string): string => {
    return translations[key] || key;
  };

  const dir = (translations['dir'] || 'rtl') as 'rtl' | 'ltr';

  return <AppContext.Provider value={{ t, dir, businessMode, setBusinessMode }}>{children}</AppContext.Provider>;
};

export const useTranslation = (): AppContextType => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useTranslation must be used within an AppProvider');
  }
  return context;
};