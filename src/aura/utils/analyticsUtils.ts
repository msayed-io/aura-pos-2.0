import { Order as AnalyticsOrder, OrderSource, OrderType, OrderStatus as AnalyticsStatus } from '../types';
import { Order as DashboardOrder } from '../components/dashboard/dashboardTypes';

/**
 * Derives a category from an item's name for analytics purposes.
 * @param itemName The name of the menu item
 * @returns A string representing the category
 */
export const getItemCategory = (itemName: string): string => {
    const lowerItemName = (itemName || '').toLowerCase();
    if (lowerItemName.includes('برجر')) return 'برجر';
    if (lowerItemName.includes('بروست')) return 'بروست';
    if (lowerItemName.includes('راب') || lowerItemName.includes('ساندويتش')) return 'سندويتشات';
    if (lowerItemName.includes('بطاطس') || lowerItemName.includes('سلاد')) return 'جانبي';
    if (lowerItemName.includes('كولا')) return 'مشروبات';
    return 'متنوع';
};

/**
 * Transforms a Dashboard Order object into an Analytics Order object.
 * @param dOrder The source Dashboard Order
 * @returns The transformed Analytics Order
 */
export const transformDashboardOrderToAnalyticsOrder = (dOrder: DashboardOrder): AnalyticsOrder => {
    const source = dOrder._source === 'POS' ? OrderSource.POS : OrderSource.ONLINE;
    const type = dOrder.deliveryMethod === 'delivery' 
        ? OrderType.DELIVERY 
        : (dOrder.customer?.address === 'استلام من الفرع' ? OrderType.TAKEAWAY : OrderType.DINE_IN);
    
    let status: AnalyticsStatus;
    switch(dOrder.status) {
        case 'Delivered': status = AnalyticsStatus.COMPLETED; break;
        case 'Out for Delivery':
        case 'Preparing':
        case 'Order Received':
        default: status = AnalyticsStatus.PENDING;
    }

    return {
        id: dOrder.displayId,
        timestamp: dOrder.createdAt,
        totalPrice: dOrder.summary?.total || 0,
        items: dOrder.items.map(item => ({
            id: item.id,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            cost: item.price * 0.45,
            category: getItemCategory(item.name),
            notes: item.notes
        })),
        source: source,
        type: type,
        status: status,
        customerId: dOrder.customer?.phone,
        customerName: dOrder.customer?.name,
        cashierId: undefined,
        discount: dOrder.summary?.discount || 0,
        preparationTimeSeconds: 240 + Math.floor(Math.random() * 400),
        branchId: 'BR-01',
        isArchived: dOrder.isArchived,
        isEdited: dOrder.isEdited,
    };
};
