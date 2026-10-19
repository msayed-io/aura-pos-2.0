import { Order } from '../types';

/**
 * MOCKED REAL-TIME LISTENER FOR ORDERS
 * This service has been gutted as per system reset instructions.
 * It now immediately returns an empty array and does not connect to any database.
 */
export const subscribeToOrders = (
  callback: (orders: Order[]) => void
) => {
  console.log("Analytics service is in offline mode. Returning empty data.");
  
  // Immediately call back with an empty array.
  callback([]);

  // Return a no-op unsubscribe function.
  return () => {};
};
