import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';
import { Promotion } from '../types';

// --- Types ---
interface BrandingContextType {
  logoUrl: string;
  setLogo: (newLogoUrl: string) => Promise<void>;
  heroImageUrl: string;
  setHeroImage: (newHeroImageUrl: string) => Promise<void>;
  primaryColor: string;
  setPrimaryColor: (color: string) => Promise<void>;
  accentColor: string;
  setAccentColor: (color: string) => Promise<void>;
  promotions: Promotion[];
  savePromotion: (promo: Partial<Promotion>) => Promise<void>;
  deletePromotion: (promoId: string) => Promise<void>;
}

// --- Defaults ---
const DEFAULT_LOGO_URL = "/logo_aura.webp";
const DEFAULT_HERO_IMAGE_URL = "https://i.ibb.co/p3rC9Y0/placeholder-image.png";
const DEFAULT_PRIMARY_COLOR = "#F97316"; // Vibrant Coral/Orange
const DEFAULT_ACCENT_COLOR = "#F59E0B";  // Warm Amber

// --- Context Definition ---
const BrandingContext = createContext<BrandingContextType | undefined>(undefined);

// --- Provider Component ---
export const BrandingProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [logoUrl] = useState<string>(DEFAULT_LOGO_URL);
    const [heroImageUrl] = useState<string>(DEFAULT_HERO_IMAGE_URL);
    const [primaryColor, setPrimaryColorState] = useState<string>(() => {
        if (typeof window === 'undefined') return DEFAULT_PRIMARY_COLOR;
        return localStorage.getItem('aura_primary_color') || DEFAULT_PRIMARY_COLOR;
    });
    const [accentColor, setAccentColorState] = useState<string>(() => {
        if (typeof window === 'undefined') return DEFAULT_ACCENT_COLOR;
        return localStorage.getItem('aura_accent_color') || DEFAULT_ACCENT_COLOR;
    });
    const [promotions, setPromotions] = useState<Promotion[]>([
        { id: 'p1', title: 'عرض الغداء العائلي', description: 'احصل على خصم 20% على أي وجبة عائلية كل يوم من 1 ظهراً حتى 5 مساءً.', imageUrl: 'https://images.unsplash.com/photo-1543353071-10c8ba85a904?w=500', type: 'offer' },
        { id: 'p2', title: 'اشتري 1 واحصل على 1 مجاناً', description: 'يسري العرض على جميع أنواع البرجر أورا يومي الأحد والخميس.', imageUrl: 'https://images.unsplash.com/photo-1594212699903-ec8a3eca50f5?w=500', type: 'promotion' }
    ]);

    const [logo, setLogoUrl] = useState(DEFAULT_LOGO_URL);
    const [hero, setHeroImageUrl] = useState(DEFAULT_HERO_IMAGE_URL);

    // FIX: Gutted setter functions but keeping local state for colors to demonstrate functionality
    const setLogo = useCallback(async (newLogoUrl: string) => {
        setLogoUrl(newLogoUrl);
    }, []);

    const setHeroImage = useCallback(async (newHeroImageUrl: string) => {
        setHeroImageUrl(newHeroImageUrl);
    }, []);

    const setPrimaryColor = useCallback(async (color: string) => {
        setPrimaryColorState(color);
        if (typeof window !== 'undefined') localStorage.setItem('aura_primary_color', color);
    }, []);

    const setAccentColor = useCallback(async (color: string) => {
        setAccentColorState(color);
        if (typeof window !== 'undefined') localStorage.setItem('aura_accent_color', color);
    }, []);

    const savePromotion = useCallback(async (promo: Partial<Promotion>) => {
        setPromotions(prev => {
            const idx = prev.findIndex(p => p.id === promo.id);
            if (idx > -1) {
                const newPromos = [...prev];
                newPromos[idx] = { ...newPromos[idx], ...promo } as Promotion;
                return newPromos;
            }
            return [...prev, { ...promo, id: promo.id || `p_${Date.now()}` } as Promotion];
        });
    }, []);

    const deletePromotion = useCallback(async (promoId: string) => {
        setPromotions(prev => prev.filter(p => p.id !== promoId));
    }, []);

    const value = {
        logoUrl: logo,
        setLogo,
        heroImageUrl: hero,
        setHeroImage,
        primaryColor,
        setPrimaryColor,
        accentColor,
        setAccentColor,
        promotions,
        savePromotion,
        deletePromotion,
    };

    return (
        <BrandingContext.Provider value={value}>
            <style>
                {`
                    :root {
                        --neo-primary: ${primaryColor};
                        --neo-accent: ${accentColor};
                    }
                `}
            </style>
            {children}
        </BrandingContext.Provider>
    );
};

// --- Custom Hook for easy consumption ---
export const useBranding = (): BrandingContextType => {
  const context = useContext(BrandingContext);
  if (context === undefined) {
    throw new Error('useBranding must be used within a BrandingProvider');
  }
  return context;
};
