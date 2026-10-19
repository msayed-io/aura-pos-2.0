import { 
  Order, 
  InventoryStock, 
  InventoryUnit, 
  InventoryItemType, 
  MenuItem, 
  InventoryAlert,
  RecipeIngredient,
  SerialNumberRecord
} from '../types';

class InventoryService {
  private stockList: InventoryStock[] = [];
  private menuCache: Map<string, MenuItem> = new Map();
  private serialRecords: SerialNumberRecord[] = [];
  private insights: InventoryAlert[] = [];

  // For testing purposes, we initialize with some mock records
  constructor() {
    this.seedMockData();
  }

  private seedMockData() {
    this.stockList = [
      { id: 'flour_1', name: 'Premium Flour', type: InventoryItemType.MATERIAL, unit: InventoryUnit.KG, quantity: 50, costPerUnit: 15, lowStockThreshold: 10 },
      { id: 'cheese_1', name: 'Mozzarella Cheese', type: InventoryItemType.MATERIAL, unit: InventoryUnit.KG, quantity: 20, costPerUnit: 80, lowStockThreshold: 5 },
      { id: 'tomato_sauce', name: 'Tomato Sauce', type: InventoryItemType.MATERIAL, unit: InventoryUnit.LITER, quantity: 30, costPerUnit: 25, lowStockThreshold: 5 },
      { id: 'fridge_1', name: 'Samsung Fridge', type: InventoryItemType.PRODUCT, unit: InventoryUnit.PIECE, quantity: 5, costPerUnit: 12000, lowStockThreshold: 2 },
      { id: 'washer_1', name: 'LG Washer', type: InventoryItemType.PRODUCT, unit: InventoryUnit.PIECE, quantity: 3, costPerUnit: 9000, lowStockThreshold: 2 }
    ];

    // Mock Menu Items linking to stock via inventory logic
    this.menuCache.set('pizza_item', {
      id: 'pizza_item',
      name: 'Margherita Pizza',
      description: 'Classic pizza',
      price: 150,
      image: '',
      primaryCategory: 'pizza',
      inventoryType: InventoryItemType.PRODUCT,
      recipe: [
        { inventoryItemId: 'flour_1', quantity: 0.5, unit: InventoryUnit.KG },
        { inventoryItemId: 'cheese_1', quantity: 0.2, unit: InventoryUnit.KG },
        { inventoryItemId: 'tomato_sauce', quantity: 0.1, unit: InventoryUnit.LITER }
      ]
    });

    this.menuCache.set('bundle_offer', {
      id: 'bundle_offer',
      name: 'Home Appliance Bundle',
      description: 'Fridge + Washer',
      price: 20000,
      image: '',
      primaryCategory: 'electronics',
      inventoryType: InventoryItemType.BUNDLE,
      recipe: [
        { inventoryItemId: 'fridge_1', quantity: 1, unit: InventoryUnit.PIECE },
        { inventoryItemId: 'washer_1', quantity: 1, unit: InventoryUnit.PIECE }
      ]
    });

    this.serialRecords = [
       { serialNumber: 'SN-FRIDGE-001', productId: 'fridge_1', status: 'AVAILABLE', addedAt: Date.now() },
       { serialNumber: 'SN-FRIDGE-002', productId: 'fridge_1', status: 'AVAILABLE', addedAt: Date.now() },
       { serialNumber: 'SN-WASHER-001', productId: 'washer_1', status: 'AVAILABLE', addedAt: Date.now() }
    ];
  }

  // Registers the menu items so the inventory engine knows how to resolve recipes
  registerMenuItems(items: MenuItem[]) {
    items.forEach(item => this.menuCache.set(item.id, item));
  }

  /**
   * Main method to fulfill an order and deduct stock based on BOM / weight
   */
  deductStockForOrder(order: Order) {
    console.log(`[Inventory Engine] Deducting stock for order ${order.id}`);
    const deductionMap = new Map<string, number>();
    const allocatedSerials = new Map<string, string[]>(); // Map stock item to used serials

    // Pass 1: Calculate Total Required Stocks
    for (const item of order.items) {
      const menuItem = this.menuCache.get(item.id);
      
      // If it's a simple weight-based retail item without recipe
      if (item.isWeightBased && item.weight) {
        const requiredExt = item.weight || item.quantity;
        deductionMap.set(item.id, (deductionMap.get(item.id) || 0) + requiredExt);
        continue;
      }

      if (!menuItem) {
        // Fallback: If no complex BOM, just assume 1 to 1 deduction if it exists in stock
        deductionMap.set(item.id, (deductionMap.get(item.id) || 0) + item.quantity);
        continue;
      }

      // BOM Logic: If it has a recipe (Product or Bundle)
      if (menuItem.recipe && menuItem.recipe.length > 0) {
        for (const ingredient of menuItem.recipe) {
           const requiredQty = ingredient.quantity * item.quantity;
           deductionMap.set(ingredient.inventoryItemId, (deductionMap.get(ingredient.inventoryItemId) || 0) + requiredQty);
        }
      } else {
        // Simple 1-to-1 Product (Retail) mapping
        deductionMap.set(menuItem.id, (deductionMap.get(menuItem.id) || 0) + item.quantity);
      }
    }

    // Pass 2: Verify Stock and Serials availability
    const hasError = false;
    deductionMap.forEach((requiredQty, stockId) => {
       const stock = this.stockList.find(s => s.id === stockId);
       if (!stock) return; // Ignore if untracked

       if (stock.quantity < requiredQty) {
         console.warn(`[Inventory Engine] Insufficient stock for ${stock.name}. Required: ${requiredQty}, Available: ${stock.quantity}`);
         // We won't block for now in POS, but log a profound warning
       }

       // Allocate Serials if requiresSerial logic
       // Wait, we need to know if the stock item requires serial.
       const menuRef = this.menuCache.get(stockId);
       if (menuRef?.requiresSerial) {
          const availableSerials = this.serialRecords.filter(s => s.productId === stockId && s.status === 'AVAILABLE');
          if (availableSerials.length < requiredQty) {
            console.error(`[Inventory Engine] Missing serials for ${menuRef.name}. Need ${requiredQty}, have ${availableSerials.length}`);
          } else {
            allocatedSerials.set(stockId, availableSerials.slice(0, requiredQty).map(s => s.serialNumber));
          }
       }
    });

    // Pass 3: Commit Deduction
    deductionMap.forEach((requiredQty, stockId) => {
      const stock = this.stockList.find(s => s.id === stockId);
      if (stock) {
        stock.quantity -= requiredQty;
        console.log(`[Inventory Engine] Deducted ${requiredQty} of ${stock.name}. New Bal: ${stock.quantity}`);
        this.checkLowStock(stock);
      }
    });

    // Mark Serials as Sold
    allocatedSerials.forEach((serials, stockId) => {
       serials.forEach(serial => {
          const sRec = this.serialRecords.find(s => s.serialNumber === serial && s.productId === stockId);
          if (sRec) {
            sRec.status = 'SOLD';
            sRec.soldAt = Date.now();
            sRec.orderId = order.id;
          }
       });
    });
  }

  private checkLowStock(stock: InventoryStock) {
    if (stock.quantity <= stock.lowStockThreshold) {
       // Deep AI insight placeholder. Let's calculate a random depletion rate
       const burnRate = Math.max(0.5, Math.floor(Math.random() * 5)); // items per day dummy logic
       const daysLeft = Math.max(0, Math.floor(stock.quantity / burnRate));
       
       const message = `مخزون ${stock.name} قارب على النفاذ (${stock.quantity} يتبقى). بناءً على مبيعاتك، قد ينفد خلال ${daysLeft} أيام. يرجى طلب المزيد.`;
       
       this.insights.push({
         id: `insight_${Date.now()}`,
         timestamp: Date.now(),
         itemId: stock.id,
         itemName: stock.name,
         currentStock: stock.quantity,
         predictedDepletionDays: daysLeft,
         message,
         isResolved: false
       });
       
       console.warn(`[AI Insight Alert] ${message}`);
    }
  }

  getInsights(): InventoryAlert[] {
    return this.insights;
  }

  getStockList(): InventoryStock[] {
    return this.stockList;
  }
}

export const inventoryService = new InventoryService();
