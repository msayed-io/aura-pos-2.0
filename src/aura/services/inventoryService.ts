import type { Order, InventoryStock, MenuItem, InventoryAlert, SerialNumberRecord } from '../types';
import { localStoreClient } from './localStoreClient';
type InventoryState = { stockList: InventoryStock[]; serialRecords: SerialNumberRecord[]; insights: InventoryAlert[] };
class InventoryService {
  private state: InventoryState = { stockList: [], serialRecords: [], insights: [] };
  private menuCache = new Map<string, MenuItem>();
  private async refresh(): Promise<InventoryState> {
    this.state = await localStoreClient.call<InventoryState>('inventory.get');
    this.state.stockList ||= []; this.state.serialRecords ||= []; this.state.insights ||= [];
    return this.state;
  }
  async registerMenuItems(items: MenuItem[]): Promise<void> {
    items.forEach(item => this.menuCache.set(item.id, item));
    await localStoreClient.call('inventory.registerMenu', { items });
    await this.refresh();
  }
  async deductStockForOrder(order: Order): Promise<void> {
    await localStoreClient.call('inventory.fulfillOrder', { orderId: order.id });
    await this.refresh();
  }
  async saveStock(stock: InventoryStock): Promise<void> { await localStoreClient.call('inventory.saveStock', { stock }); await this.refresh(); }
  async saveSerial(serial: SerialNumberRecord): Promise<void> { await localStoreClient.call('inventory.saveSerial', { serial }); await this.refresh(); }
  async getInventory(): Promise<InventoryState> { return this.refresh(); }
  getInsights(): InventoryAlert[] { return [...this.state.insights]; }
  getStockList(): InventoryStock[] { return [...this.state.stockList]; }
}
export const inventoryService = new InventoryService();
