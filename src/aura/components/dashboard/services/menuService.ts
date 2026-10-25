import type { MenuItem, Category, Offer } from '../../../types';
import { localStoreClient } from '../../../services/localStoreClient';
type MenuState = { menuItems: MenuItem[]; categories: Category[]; offers: Offer[] };
class MenuService {
  private subscribers: ((data: MenuState) => void)[] = [];
  private store: MenuState = { menuItems: [], categories: [], offers: [] };
  private async refresh() {
    const data = await localStoreClient.call<MenuState>('menu.get');
    this.store = { menuItems: data.menuItems || [], categories: data.categories || [], offers: data.offers || [] };
    this.notifySubscribers();
  }
  private notifySubscribers() { this.subscribers.forEach(callback => callback({ ...this.store })); }
  public reset() { this.store = { menuItems: [], categories: [], offers: [] }; this.notifySubscribers(); }
  subscribe(callback: (data: MenuState) => void): () => void {
    this.subscribers.push(callback); callback({ ...this.store });
    const unsubscribe = localStoreClient.subscribe(() => { void this.refresh().catch(error => localStoreClient.report(error, 'menu.subscribe')); });
    void this.refresh().catch(error => localStoreClient.report(error, 'menu.subscribe'));
    return () => { this.subscribers = this.subscribers.filter(cb => cb !== callback); unsubscribe(); };
  }
  async saveMenuItem(itemData: Partial<MenuItem>) { await localStoreClient.call('menu.saveItem', { itemData }); await this.refresh(); }
  async deleteMenuItem(itemId: string) { await localStoreClient.call('menu.deleteItem', { itemId }); await this.refresh(); }
  async saveOffer(offerData: Partial<Offer>) { await localStoreClient.call('menu.saveOffer', { offerData }); await this.refresh(); }
  async deleteOffer(offerId: string) { await localStoreClient.call('menu.deleteOffer', { offerId }); await this.refresh(); }
  async saveCategories(categories: Category[]) { await localStoreClient.call('menu.saveCategories', { categories }); await this.refresh(); }
}
export const menuService = new MenuService();
