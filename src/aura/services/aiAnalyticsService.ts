import { MenuItem, OrderItem, SmartNotification, AIAlertCategory, DynamicPricingRule, InventoryStock } from '../types';
import { inventoryService } from './inventoryService';

class AIAnalyticsService {
  private smartNotifications: SmartNotification[] = [];

  constructor() {
    this.seedMockNotifications();
  }

  private seedMockNotifications() {
    this.smartNotifications = [
      {
        id: 'sn_1',
        timestamp: Date.now() - 3600000,
        category: AIAlertCategory.PROFIT_OPPORTUNITY,
        title: 'فرصة زيادة أرباح',
        message: 'بناءً على حالة الطقس القادمة (حار جداً)، ننصح برفع مخزون المشروبات الباردة بنسبة 20%.',
        actionRequired: 'الموافقة على الطلبية الآلية',
        isRead: false
      },
      {
        id: 'sn_2',
        timestamp: Date.now() - 7200000,
        category: AIAlertCategory.INVENTORY_RISK,
        title: 'مخاطر مخزون: تاريخ صلاحية',
        message: 'يوجد كمية كبيرة من "اللحم المفروم" تنتهي صلاحيتها خلال يومين. نقترح عمل عرض ترويجي فوري (Flash Sale).',
        actionRequired: 'تفعيل خصم 15% على وجبات اللحوم',
        isRead: false
      }
    ];
  }

  /**
   * AI Dynamic Pricing Logic
   * Evaluates the item's pricing rules against current conditions (time, stock, demand)
   * returns the calculated price.
   */
  calculateDynamicPrice(item: MenuItem): number {
    if (!item.dynamicPricing || !item.dynamicPricing.isEnabled) {
      return item.price;
    }

    const { basePrice, minPrice, maxPrice, peakHoursIncreasePct, lowStockIncreasePct, happyHourDecreasePct } = item.dynamicPricing;
    let newPrice = basePrice;
    
    const currentHour = new Date().getHours();

    // Mock Condition 1: Peak Hours (e.g., 1PM - 4PM)
    if (peakHoursIncreasePct && currentHour >= 13 && currentHour <= 16) {
      newPrice += basePrice * (peakHoursIncreasePct / 100);
    }
    
    // Mock Condition 2: Happy Hour (e.g., 5PM - 7PM)
    if (happyHourDecreasePct && currentHour >= 17 && currentHour <= 19) {
      newPrice -= basePrice * (happyHourDecreasePct / 100);
    }

    // Mock Condition 3: Low stock (if inventory linked)
    if (lowStockIncreasePct) {
      // In a real scenario, we check the item's recipe and check its inventory stock limits
      // For simplicity here, we assume there's a 10% chance of being "low stock" 
      // (Normally this would query the inventoryService directly)
      const isLowStock = false; // Placeholder
      if (isLowStock) {
        newPrice += basePrice * (lowStockIncreasePct / 100);
      }
    }

    // Ensure within bounds
    newPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));

    // Return rounded price suitable for POS
    return Math.round(newPrice * 10) / 10;
  }

  /**
   * AI Recommend Engine - Analyzes current cart to suggest cross-sells
   */
  getUpsellRecommendations(cartItems: OrderItem[], fullMenu: MenuItem[]): MenuItem[] {
    if (cartItems.length === 0) return [];
    
    const recommendedSet = new Set<string>();
    
    // Gather cross-sell rules from items in cart
    cartItems.forEach(cartItem => {
      const dbItem = fullMenu.find(m => m.id === cartItem.id);
      if (dbItem?.crossSellItems) {
        dbItem.crossSellItems.forEach(recId => {
          // Don't recommend it if it's already in the cart
          if (!cartItems.find(c => c.id === recId)) {
            recommendedSet.add(recId);
          }
        });
      }
    });

    return Array.from(recommendedSet)
      .map(id => fullMenu.find(m => m.id === id))
      .filter((m): m is MenuItem => m !== undefined)
      // Limit to max 3 recommendations
      .slice(0, 3);
  }

  getSmartNotifications(): SmartNotification[] {
    return this.smartNotifications;
  }

  markNotificationAsRead(id: string) {
    const notif = this.smartNotifications.find(n => n.id === id);
    if (notif) notif.isRead = true;
  }
}

export const aiAnalyticsService = new AIAnalyticsService();
