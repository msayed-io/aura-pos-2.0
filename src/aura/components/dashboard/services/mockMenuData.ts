import type { MenuItem, Category, Offer } from '../../../types';

// All mock data is disabled to prepare for production data.
export const defaultCategories: Category[] = [];

export const menuItems: MenuItem[] = [];

export const initialOffers: Offer[] = [];

export interface Material {
    id: string;
    name: string;
    unit: 'g' | 'ml' | 'piece' | 'kg' | 'l';
    current_quantity: number;
    minimum_alert_quantity: number;
    cost_per_unit: number; // Cost in EGP for one unit (g, ml, piece)
}

export const materials: Material[] = [];

export const productIngredients: Record<string | number, { materialId: string, quantity: number }[]> = {};
