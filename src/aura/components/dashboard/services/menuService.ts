import { MenuItem, Category, Offer } from '../../../types';

class MenuService {
    private subscribers: ((data: { menuItems: MenuItem[], categories: Category[], offers: Offer[] }) => void)[] = [];

    private store = {
        menuItems: [
            { 
                id: 'm1', name: 'برجر أورا سوبريم', price: 120, image: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=500', category: 'cat_burgers', isActive: true, isNewRelease: true, libraryCategories: ['cat_burgers'],
                crossSellItems: ['m4', 'm5'],
                dynamicPricing: { isEnabled: true, basePrice: 120, minPrice: 100, maxPrice: 150, peakHoursIncreasePct: 15 }
            },
            { 
                id: 'm2', name: 'وجبة بروست عائلي', price: 250, image: 'https://images.unsplash.com/photo-1626645738196-c2a7c8d08f58?w=500', category: 'cat_broast', isActive: true, isNewRelease: false, libraryCategories: ['cat_broast'],
                crossSellItems: ['m4', 'm5']
            },
            { 
                id: 'm3', name: 'ساندوتش دجاج راب', price: 85, image: 'https://images.unsplash.com/photo-1626700051175-6818013e1d4f?w=500', category: 'cat_sandwiches', isActive: true, libraryCategories: ['cat_sandwiches'],
                dynamicPricing: { isEnabled: true, basePrice: 85, minPrice: 70, maxPrice: 100, peakHoursIncreasePct: 10 }
            },
            { id: 'm4', name: 'بطاطس مقلية كبيرة', price: 45, image: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=500', category: 'cat_sides', isActive: true, libraryCategories: ['cat_sides'] },
            { id: 'm5', name: 'بيبسي كانز', price: 25, image: 'https://images.unsplash.com/photo-1581006852262-e4307cf6283a?w=500', category: 'cat_drinks', isActive: true, libraryCategories: ['cat_drinks'] },
        ] as MenuItem[],
        categories: [
            { id: 'cat_burgers', name: 'برجر أورا', order: 1 },
            { id: 'cat_broast', name: 'بروست', order: 2 },
            { id: 'cat_sandwiches', name: 'ساندوتشات', order: 3 },
            { id: 'cat_sides', name: 'جانبي', order: 4 },
            { id: 'cat_drinks', name: 'مشروبات', order: 5 },
        ] as Category[],
        offers: [] as Offer[]
    };

    constructor() {
        // Service is now stateful in-memory to preserve design.
    }

    private notifySubscribers() {
        this.subscribers.forEach(callback => callback({ ...this.store }));
    }

    public reset() {
        // No-op
    }

    subscribe(callback: (data: { menuItems: MenuItem[], categories: Category[], offers: Offer[] }) => void): () => void {
        this.subscribers.push(callback);
        callback({ ...this.store });
        return () => {
            this.subscribers = this.subscribers.filter(cb => cb !== callback);
        };
    }
    
    async saveMenuItem(itemData: Partial<MenuItem>) {
        const idx = this.store.menuItems.findIndex(i => i.id === itemData.id);
        if (idx > -1) {
            this.store.menuItems[idx] = { ...this.store.menuItems[idx], ...itemData } as MenuItem;
        } else {
            this.store.menuItems.push({ ...itemData, id: itemData.id || `m_${Date.now()}` } as MenuItem);
        }
        this.notifySubscribers();
    }

    async deleteMenuItem(itemId: string) {
        this.store.menuItems = this.store.menuItems.filter(i => i.id !== itemId);
        this.notifySubscribers();
    }

    async saveOffer(offerData: Partial<Offer>) {
        const idx = this.store.offers.findIndex(o => o.id === offerData.id);
        if (idx > -1) {
            this.store.offers[idx] = { ...this.store.offers[idx], ...offerData } as Offer;
        } else {
            this.store.offers.push({ ...offerData, id: offerData.id || `offer_${Date.now()}` } as Offer);
        }
        this.notifySubscribers();
    }

    async deleteOffer(offerId: string) {
        this.store.offers = this.store.offers.filter(o => o.id !== offerId);
        this.notifySubscribers();
    }
    
    async saveCategories(updatedCategories: Category[]) {
        this.store.categories = updatedCategories;
        this.notifySubscribers();
    }
}

export const menuService = new MenuService();
