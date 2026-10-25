import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MenuItem, Category, User, LogActionType } from './types';
import { useDashboard } from './components/dashboard/DashboardContext';
import { 
    SearchIcon, 
    StoreIcon,
    SpinnerIcon,
    FireIcon,
    TicketIcon,
    LayoutGridIcon,
    HamburgerIcon,
    SandwichIcon,
    CookingPotIcon,
    GlassWaterIcon,
    PowerIcon,
    ClockIcon,
    StarIcon,
    XIcon,
    InboxIcon,
    ArrowLeftOnRectangleIcon,
    SparklesIcon,
} from './components/dashboard/Icons';

// New Modular Imports
import { CartItem, CheckoutStep, DeliveryMethod, PaymentMethod } from './components/pos/posTypes';
import CartView from './components/pos/CartView';
import OrderTypeSelection from './components/pos/OrderTypeSelection';
import DeliveryCheckout from './components/pos/DeliveryCheckout';
import DineInCheckout from './components/pos/DineInCheckout';
import { dashboardOrderService } from './components/dashboard/services/dashboardOrderService';
import type { Order } from './components/dashboard/dashboardTypes';
import { menuService } from './components/dashboard/services/menuService';
import { printOrderInvoice } from './services/printingService';
import { useAuth } from './contexts/AuthContext';
import { loggingService } from './services/loggingService';
import { inventoryService } from './services/inventoryService';
import { aiAnalyticsService } from './services/aiAnalyticsService';
// [PRICING ENGINE INTEGRATION] Import pricing engine
import { pricingEngine } from './services/pricingEngine';
import InvoicePreviewModal from './components/dashboard/ui/InvoicePreviewModal';
import { useBranding } from './contexts/BrandingContext';
import { useSystemTime, formatDuration } from './hooks/useSystemTime';
// Add new hooks import
import { useTranslation } from './contexts/AppContext';
import { BusinessMode } from './types';
import { useDragToScroll } from './hooks/useDragToScroll';
import ConnectivityBadge from './components/ConnectivityBadge';
import { localStoreClient } from './services/localStoreClient';


// ============================================================================
// --- Main POS Component ---
// ============================================================================
const POSSystem: React.FC<{ onExit: () => void; }> = ({ onExit }) => {
    const [menu, setMenu] = useState<MenuItem[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [allOrders, setAllOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const { showToast, playSound } = useDashboard();
    const { currentUser } = useAuth();
    const { logoUrl } = useBranding();
    const { businessMode, setBusinessMode } = useTranslation();
    
    // Cart State
    const [cartItems, setCartItems] = useState<CartItem[]>([]);
    const [notesForItem, setNotesForItem] = useState<string | null>(null);
    const [currentNote, setCurrentNote] = useState('');
    
    // Checkout State
    const [checkoutStep, setCheckoutStep] = useState<CheckoutStep>('cart');

    // New Order Alert State
    const [hasNewOnlineOrder, setHasNewOnlineOrder] = useState(false);
    const [showNotification, setShowNotification] = useState(false);
    const knownOrderIds = useRef(new Set<string>());
    const saleRequestRef = useRef<{ signature: string; id: string } | null>(null);

    // Shift & Header State
    const [shiftStartTime, setShiftStartTime] = useState<Date | null>(null);
    const now = useSystemTime();
    const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
    const userMenuRef = useRef<HTMLDivElement>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const [isSearchExpanded, setIsSearchExpanded] = useState(false);

    // Preview Modal State
    const [isPosPreviewOpen, setIsPosPreviewOpen] = useState(false);
    const [previewOrder, setPreviewOrder] = useState<Order | null>(null);
    
    // Drag to scroll ref
    const scrollContainerRef = useDragToScroll<HTMLDivElement>();

    // Memoized calculation for elapsed time, runs only when 'now' or 'shiftStartTime' changes
    const elapsedTime = useMemo(() => {
        if (!shiftStartTime) {
            return '00:00:00';
        }
        const diffMs = now.getTime() - shiftStartTime.getTime();
        return formatDuration(diffMs);
    }, [now, shiftStartTime]);


    useEffect(() => {
        const onStoreError = (event: Event) => {
            const detail = (event as CustomEvent<{ code?: string }>).detail;
            showToast({ message: `تعذر تحديث البيانات المحلية (${detail?.code || 'LOCAL_STORE_ERROR'}).`, type: 'error' });
        };
        const onStoreNotice = (event: Event) => {
            const detail = (event as CustomEvent<{ message?: string }>).detail;
            if (detail?.message) showToast({ message: detail.message, type: 'info' });
        };
        window.addEventListener('aura:local-store-error', onStoreError);
        window.addEventListener('aura:local-store-notice', onStoreNotice);
        return () => {
            window.removeEventListener('aura:local-store-error', onStoreError);
            window.removeEventListener('aura:local-store-notice', onStoreNotice);
        };
    }, [showToast]);

    // Effect for handling clicks outside of user menu
    // Effect for handling clicks outside of user menu
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setIsUserMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);


    useEffect(() => {
        const menuUnsubscribe = menuService.subscribe(data => {
            const activeItems = data.menuItems.filter(item => item.isActive);
            const posCategories = [
                { id: 'all', name: 'الكل', order: -1 },
                { id: 'popular', name: 'الأكثر طلباً', order: 0 },
                ...data.categories
            ];
            
            setMenu(activeItems);
            setCategories(posCategories);
            void inventoryService.registerMenuItems(activeItems).catch(error => localStoreClient.report(error, 'inventory.registerMenu'));
        });

        const ordersUnsubscribe = dashboardOrderService.subscribe(liveOrders => {
            setAllOrders(liveOrders); // For popularity calculation
             // Initialize known IDs on first load without triggering alert
            if (knownOrderIds.current.size === 0) {
                 liveOrders.forEach(order => knownOrderIds.current.add(order.id));
                 return;
            }

            const newlyReceivedOrders = liveOrders.filter(order => !knownOrderIds.current.has(order.id));
            if (newlyReceivedOrders.length > 0) {
                // Determine if any of the new orders are online
                const newOnline = newlyReceivedOrders.some(o => !!o.orderType);
                if (newOnline) {
                    setHasNewOnlineOrder(true);
                    playSound('info'); // Play system sound for new online orders
                }
                // Update known IDs with the new ones
                newlyReceivedOrders.forEach(order => knownOrderIds.current.add(order.id));
            }
        });

        setLoading(false);

        return () => {
            menuUnsubscribe();
            ordersUnsubscribe();
        };
    }, []);

    // Effect for Shift Management: Start if needed, and set the correct start time.
    useEffect(() => {
        if (currentUser) {
            // Check for an existing active shift first.
            let startTime = loggingService.getActiveShiftStartTime(currentUser.id);
            
            // If there's no active shift, start a new one.
            if (!startTime) {
                loggingService.log(currentUser.id, currentUser.username, LogActionType.SHIFT_START);
                // Get the start time of the newly created shift.
                startTime = loggingService.getActiveShiftStartTime(currentUser.id);
            }

            // Set the component's state with the start time (either existing or new).
            if (startTime) {
                setShiftStartTime(new Date(startTime));
            }
        }
    }, [currentUser]);

    const popularItems = useMemo(() => {
        if (allOrders.length === 0 || menu.length === 0) return [];

        const itemCounts = new Map<string, number>();
        allOrders.forEach(order => {
            order.items.forEach(item => {
                const menuItem = menu.find(m => m.name === item.name);
                if (menuItem) {
                    itemCounts.set(menuItem.id, (itemCounts.get(menuItem.id) || 0) + item.quantity);
                }
            });
        });

        const sortedItemIds = Array.from(itemCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 15)
            .map(entry => entry[0]);
        
        const popularMenuItemIds = new Set(sortedItemIds);

        return menu
            .filter(menuItem => popularMenuItemIds.has(menuItem.id))
            .sort((a, b) => (itemCounts.get(b.id) || 0) - (itemCounts.get(a.id) || 0));
    }, [allOrders, menu]);


    const filteredItems = useMemo(() => {
        let items = menu;
        if (selectedCategory === 'popular') {
            items = popularItems;
        } else if (selectedCategory !== 'all') {
            items = items.filter(item => item.categoryKey === selectedCategory);
        }
        if (searchTerm) {
            items = items.filter(item => (item.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || item.barcode === searchTerm || item.sku === searchTerm);
        }
        
        // [PRICING ENGINE INTEGRATION] Use pricing engine instead of old aiAnalyticsService for dynamic pricing
        // Old: AI Dynamic Pricing: Apply immediately before serving to the view mapped array
        return items.map(item => {
            const pricingResult = pricingEngine.calculatePrice(item.id, item.price, {
                quantity: 1,
                currentStock: item.stockQuantity,
            });
            return {
                ...item,
                price: pricingResult.finalPrice,
                _originalPrice: pricingResult.originalPrice,
                _pricingResult: pricingResult, // Keep full result for UI display
            };
        });
    }, [menu, selectedCategory, searchTerm, popularItems]);

    // [PRICING ENGINE INTEGRATION] Calculate price using pricing engine for new cart items
    const addToCart = useCallback((item: MenuItem) => {
        setCheckoutStep('cart'); 
        setCartItems(prev => {
            const existingItem = prev.find(cartItem => cartItem.id === item.id);
            if (existingItem) {
                return prev.map(cartItem => 
                    cartItem.id === item.id ? { ...cartItem, quantity: cartItem.quantity + 1 } : cartItem
                );
            }
            // Calculate price using pricing engine for new items
            const pricingResult = pricingEngine.calculatePrice(item.id, item.price, {
                quantity: 1,
            });
            return [...prev, { ...item, quantity: 1, price: pricingResult.finalPrice, _originalPrice: pricingResult.originalPrice, _pricingResult: pricingResult }];
        });
    }, []);

    // Barcode Auto-Add Logic
    useEffect(() => {
        if (businessMode === BusinessMode.RETAIL && searchTerm.length >= 4) {
             const exactMatch = menu.find(item => item.barcode === searchTerm || item.sku === searchTerm);
             if (exactMatch) {
                 addToCart(exactMatch);
                 setSearchTerm('');
                 playSound('info');
             }
        }
    }, [searchTerm, businessMode, menu, addToCart, playSound]);

    const updateQuantity = (itemId: string, change: number) => {
        setCartItems(prev => {
            const item = prev.find(i => i.id === itemId);
            if (item && item.quantity + change < 1) {
                return prev.filter(i => i.id !== itemId);
            }
            return prev.map(i => i.id === itemId ? { ...i, quantity: i.quantity + change } : i);
        });
    };

    const removeItem = (itemId: string) => {
        setCartItems(prev => prev.filter(i => i.id !== itemId));
    };

    const updateNotes = (itemId: string, newNotes: string) => {
        setCartItems(prev => prev.map(item => item.id === itemId ? { ...item, notes: newNotes.trim() } : item));
        setNotesForItem(null);
    };

    const clearCart = useCallback(() => {
        setCartItems([]);
        setNotesForItem(null);
        setCheckoutStep('cart');
    }, []);
    
    // AI Insights integration
    // [PRICING ENGINE INTEGRATION] Use pricing engine for upsell recommendation prices
    const upsellRecommendations = useMemo(() => {
        const recommendationItems = cartItems.map(item => ({ ...item, cost: item.cost ?? 0, category: item.category || item.categoryKey || item.primaryCategory }));
        const rawRecommendations = aiAnalyticsService.getUpsellRecommendations(recommendationItems, menu);
        return rawRecommendations.map(item => {
            const pricingResult = pricingEngine.calculatePrice(item.id, item.price, {
                quantity: 1,
                currentStock: item.stockQuantity,
            });
            return {
                ...item,
                price: pricingResult.finalPrice,
                _originalPrice: pricingResult.originalPrice,
                _pricingResult: pricingResult,
            };
        });
    }, [cartItems, menu]);

    const cartTotal = useMemo(() => cartItems.reduce((acc, item) => acc + (item.price * item.quantity), 0), [cartItems]);

    const handleFinalizeOrder = useCallback(async (details: {
        name: string;
        phone: string;
        address: string;
        paymentMethod: PaymentMethod;
        deliveryMethod: DeliveryMethod;
        subtotal: number;
        deliveryFee: number;
        discount: number;
        couponCode: string;
        total: number;
    }) => {
        
        if (!currentUser) {
            showToast({ message: 'خطأ: لم يتم تحديد المستخدم الحالي.', type: 'error'});
            return;
        }
        const cashierId = currentUser.id;
        const cashierName = currentUser.username;

        const orderBody = {
          customer: { name: details.name, phone: details.phone, address: details.address },
          items: cartItems.map(ci => ({ id: ci.id, name: ci.name, quantity: ci.quantity, price: ci.price, notes: ci.notes, cost: ci.cost, category: ci.category, isWeightBased: ci.isWeightBased })),
          summary: { subtotal: details.subtotal, deliveryFee: details.deliveryFee, discount: details.discount, total: details.total },
          status: 'Delivered',
          deliveryMethod: details.deliveryMethod,
          paymentMethod: details.paymentMethod,
          couponCode: details.couponCode
        };
        const signature = JSON.stringify({ orderBody, cashierId });
        if (!saleRequestRef.current || saleRequestRef.current.signature !== signature) {
            saleRequestRef.current = { signature, id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `sale-${Date.now()}-${Math.random().toString(36).slice(2)}` };
        }
        const newOrderData = { ...orderBody, _requestId: saleRequestRef.current.id } as Omit<Order, 'id' | 'createdAt' | 'isArchived' | 'displayId'>;
        let newDashboardOrder: Order;
        try {
            newDashboardOrder = await dashboardOrderService.addOrder(newOrderData, cashierId, cashierName);
        } catch (error) {
            const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'LOCAL_STORE_ERROR';
            localStoreClient.report(error, 'pos.addOrder');
            showToast({ message: `تعذر تأكيد حفظ الطلب (${code}). احتُفظ بالسلة؛ أعد المحاولة للتحقق بنفس رقم المحاولة دون إنشاء طلب ثانٍ.`, type: 'error' });
            return;
        }
        // The sale is durable now. Printing must not retain this cart or clear a later sale's retry key.
        clearCart();
        saleRequestRef.current = null;
        if (newDashboardOrder._isReplay) {
            showToast({ message: 'الطلب موجود مسبقاً؛ لم تُعَد الطباعة. راجع الفاتورة وحالة الطباعة.', type: 'info' });
        } else {
            if (window.electronAPI?.notifyNewOrder) {
                void window.electronAPI.notifyNewOrder(newDashboardOrder.displayId)
                    .catch(error => localStoreClient.report(error, 'pos.new-order-notification'));
            }
            showToast({ message: `تم حفظ الطلب ${newDashboardOrder.displayId}؛ جارٍ إرسال الفواتير للطباعة.`, type: 'info' });
            const customerInvoiceType = newDashboardOrder.deliveryMethod === 'delivery' ? 'delivery' : 'dine_in';
            const failures: Array<{ reason: unknown }> = [];
            try { await printOrderInvoice(newDashboardOrder, 'kitchen', logoUrl, cashierId, cashierName); }
            catch (reason) { failures.push({ reason }); }
            try { await printOrderInvoice(newDashboardOrder, customerInvoiceType, logoUrl, cashierId, cashierName); }
            catch (reason) { failures.push({ reason }); }
            if (failures.length > 0) {
                const firstError = failures[0].reason;
                const safeMessage = firstError instanceof Error ? firstError.message : 'تعذر إرسال مهمة الطباعة.';
                showToast({ message: `تم حفظ الطلب ${newDashboardOrder.displayId}، لكن تعذرت ${failures.length === 2 ? 'طباعتا المطبخ والفاتورة' : 'إحدى الطباعة'}. راجع الفاتورة وحالة الطباعة. ${safeMessage}`, type: 'error' });
            } else {
                showToast({ message: 'تم تسجيل الطلب بنجاح!', type: 'success', playSound: true });
            }
        }
    }, [cartItems, showToast, clearCart, logoUrl, currentUser]);

    const handleExit = () => {
        setHasNewOnlineOrder(false);
        onExit();
    };

    const handleEndShiftAndExit = () => {
        if (currentUser) {
            loggingService.log(currentUser.id, currentUser.username, LogActionType.SHIFT_END);
        }
        handleExit();
    };

    const showPreview = () => {
        if (cartItems.length === 0) {
            showToast({ message: 'السلة فارغة. أضف أصنافاً أولاً.', type: 'error' });
            return;
        }
        const previewDisplayId = dashboardOrderService.getPreviewDisplayId();
        const mockOrder: Order = {
            id: 'preview-id',
            displayId: previewDisplayId,
            createdAt: Date.now(),
            items: cartItems,
            customer: { name: 'عميل كاشير', phone: 'غير محدد', address: 'صالة' },
            status: 'Delivered',
            summary: {
                subtotal: cartTotal,
                deliveryFee: 0,
                discount: 0,
                total: cartTotal,
            },
            deliveryMethod: 'pickup',
            paymentMethod: 'cash',
        };
        setPreviewOrder(mockOrder);
        setIsPosPreviewOpen(true);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Category switching F1-F8
            if (e.key.startsWith('F') && e.key.length > 1) {
                const fKey = parseInt(e.key.substring(1));
                if (fKey >= 1 && fKey <= categories.length) {
                    e.preventDefault();
                    setSelectedCategory(categories.sort((a,b) => a.order - b.order)[fKey-1].id);
                    return;
                }
            }

            // Focus Search: Ctrl + F
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                if (!isSearchExpanded) {
                    setIsSearchExpanded(true);
                    setTimeout(() => searchInputRef.current?.focus(), 150);
                } else {
                    searchInputRef.current?.focus();
                }
                return;
            }

            // Clear Search / Back: Escape
            if (e.key === 'Escape') {
                if (isSearchExpanded) {
                    setIsSearchExpanded(false);
                    setSearchTerm('');
                    return;
                }
                if (searchTerm) {
                    setSearchTerm('');
                    return;
                }
                if (checkoutStep !== 'cart') {
                    if (checkoutStep === 'type_selection') setCheckoutStep('cart');
                    else setCheckoutStep('type_selection');
                    return;
                }
            }

            // Preview: Ctrl + P
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
                e.preventDefault();
                showPreview();
                return;
            }

            // Clear Cart: Alt + C
            if (e.altKey && e.key === 'c') {
                e.preventDefault();
                if (cartItems.length > 0) {
                    clearCart();
                }
                return;
            }

            // Proceed to checkout: Enter (only if not typing in search and in cart step)
            if (e.key === 'Enter' && document.activeElement !== searchInputRef.current && checkoutStep === 'cart' && cartItems.length > 0) {
                e.preventDefault();
                setCheckoutStep('type_selection');
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [categories, searchTerm, checkoutStep, cartItems, clearCart, isSearchExpanded]);


    const renderAsideContent = () => {
        switch (checkoutStep) {
            case 'type_selection':
                return <OrderTypeSelection 
                            onSelect={(type) => setCheckoutStep(type === 'delivery' ? 'delivery_details' : 'dine_in_payment')}
                            onBack={() => setCheckoutStep('cart')}
                        />;
            case 'delivery_details':
                return <DeliveryCheckout 
                            items={cartItems}
                            onBack={() => setCheckoutStep('type_selection')}
                            onPlaceOrder={handleFinalizeOrder}
                        />;
            case 'dine_in_payment':
                return <DineInCheckout 
                            items={cartItems}
                            onBack={() => setCheckoutStep('type_selection')}
                            onPlaceOrder={handleFinalizeOrder}
                        />;
            case 'cart':
            default:
                return <CartView 
                            cartItems={cartItems}
                            cartTotal={cartTotal}
                            onUpdateQuantity={updateQuantity}
                            onRemoveItem={removeItem}
                            notesForItem={notesForItem}
                            onSetNotesForItem={setNotesForItem}
                            currentNote={currentNote}
                            onSetCurrentNote={setCurrentNote}
                            onUpdateNotes={updateNotes}
                            onClearCart={clearCart}
                            onProceed={() => setCheckoutStep('type_selection')}
                            onPreview={showPreview}
                            upsellRecommendations={upsellRecommendations}
                            onAddUpsell={addToCart}
                        />;
        }
    };
    
    const categoryIcons: { [key: string]: React.ReactNode } = {
        all: <LayoutGridIcon className="w-5 h-5"/>,
        popular: <StarIcon className="w-5 h-5" />,
        cat_broast: <FireIcon className="w-5 h-5"/>,
        cat_burger: <HamburgerIcon className="w-5 h-5"/>,
        cat_sandwich: <SandwichIcon className="w-5 h-5"/>,
        cat_sides: <CookingPotIcon className="w-5 h-5"/>,
        cat_drinks: <GlassWaterIcon className="w-5 h-5"/>,
        cat_offers: <TicketIcon className="w-5 h-5"/>,
    };

    return (
        <>
            <div className="h-screen bg-neo-bg text-gray-800 font-sans flex overflow-hidden" dir="rtl">
                {/* Main content - Menu */}
                <main className="w-7/12 flex flex-col min-w-0 p-4 gap-4">
                    <header className="flex-shrink-0 bg-white shadow-sm px-4 py-2 flex items-center relative z-20 rounded-2xl border border-gray-100">
                        {/* Logo + Title - Right side (RTL) - always in DOM, gets covered by search overlay */}
                        <div className="flex items-center gap-2.5 shrink-0 relative z-0">
                            <img src="/logo_aura.webp" alt="Logo" className="w-9 h-9 object-contain drop-shadow-sm" />
                            <div>
                                <h1 className="text-base font-extrabold text-gray-800 tracking-tight leading-tight">Aura POS</h1>
                                <p className="text-[11px] text-gray-400 font-medium leading-tight">نظام الإدارة الذكي</p>
                            </div>
                        </div>

                        {/* Search overlay - expands from left side (where action buttons are) toward right (logo side) */}
                        <div 
                            className={`absolute inset-0 flex items-center bg-white z-10 transition-all duration-300 ease-in-out ${isSearchExpanded ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                            style={{ 
                                clipPath: isSearchExpanded 
                                    ? 'inset(0 0 0 0)' 
                                    : 'inset(0 0 0 100%)',
                                paddingLeft: '88px',
                                paddingRight: '12px',
                            }}
                        >
                            <div className="relative flex-1 min-w-0">
                                <input 
                                    ref={searchInputRef}
                                    type="text" 
                                    placeholder="بحث بالاسم أو الباركود... (Ctrl+F)" 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full px-4 py-1.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-neo-primary focus:border-transparent transition-all"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') {
                                            setIsSearchExpanded(false);
                                            setSearchTerm('');
                                        }
                                    }}
                                />
                                {searchTerm && (
                                    <button 
                                        onClick={() => setSearchTerm('')}
                                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        <XIcon className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Action Buttons - Left side (RTL) - always on top */}
                        <div className="flex items-center gap-2 mr-auto shrink-0 relative z-20">
                            {/* Connectivity Badge - fades out when search is open */}
                            <div className={`transition-all duration-300 ${isSearchExpanded ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100'}`}>
                                <ConnectivityBadge variant="light" />
                            </div>

                            {/* Search / Close Toggle - transforms from search icon to X */}
                            <button
                                onClick={() => {
                                    if (isSearchExpanded) {
                                        setIsSearchExpanded(false);
                                        setSearchTerm('');
                                    } else {
                                        setIsSearchExpanded(true);
                                        setTimeout(() => searchInputRef.current?.focus(), 250);
                                    }
                                }}
                                className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all duration-200 bg-white shadow-sm border border-gray-200 text-gray-700 hover:shadow-md ${isSearchExpanded ? 'text-neo-primary border-neo-primary/30 shadow-md shadow-neo-primary/10' : ''}`}
                                title={isSearchExpanded ? 'إغلاق البحث' : 'بحث'}
                            >
                                {isSearchExpanded ? <XIcon className="w-4 h-4" /> : <SearchIcon className="w-4 h-4" />}
                            </button>

                            {/* Exit Button */}
                            <div className="relative">
                                <button 
                                    onClick={handleExit} 
                                    onMouseEnter={() => hasNewOnlineOrder && setShowNotification(true)}
                                    onMouseLeave={() => setShowNotification(false)}
                                    className={`relative transition-all duration-200 w-9 h-9 flex items-center justify-center rounded-xl bg-white shadow-sm border border-gray-200 text-gray-700 hover:shadow-md ${hasNewOnlineOrder ? 'bg-red-50 border-red-200 text-red-500 animate-red-pulse' : ''}`}
                                    title="العودة للوحة التحكم"
                                >
                                    {hasNewOnlineOrder ? <InboxIcon className="w-4 h-4 text-red-500"/> : <ArrowLeftOnRectangleIcon className="w-4 h-4"/>}
                                </button>
                                {hasNewOnlineOrder && showNotification && (
                                    <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-max bg-neo-secondary text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-lg animate-fade-in z-30 pointer-events-none">
                                        يوجد طلب أونلاين جديد!
                                    </div>
                                )}
                            </div>
                        </div>
                    </header>

                    <nav className="flex-shrink-0 bg-white shadow-sm px-4 rounded-3xl border border-gray-100">
                        <div ref={scrollContainerRef} className="flex items-center gap-3 overflow-x-auto no-scrollbar py-2">
                            {categories.sort((a,b) => a.order - b.order).map(cat => (
                                <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-full transition-colors whitespace-nowrap ${selectedCategory === cat.id ? 'bg-neo-primary text-white shadow-md shadow-neo-primary/20' : 'text-gray-500 hover:bg-gray-100'}`}>
                                    {categoryIcons[cat.id] || <StoreIcon className="w-5 h-5" />}
                                    <span>{cat.name}</span>
                                </button>
                            ))}
                        </div>
                    </nav>

                    <div className="flex-grow overflow-y-auto p-6">
                        {loading ? (
                            <div className="flex h-full items-center justify-center">
                                <SpinnerIcon className="w-12 h-12 animate-spin text-neo-primary" />
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-5 auto-rows-max">
                                {filteredItems.map(item => (
                                    <div key={item.id} onClick={() => addToCart(item)} className="group premium-card p-3 flex flex-col cursor-pointer border-transparent">
                                        <div className="w-full h-32 bg-gray-50 rounded-2xl mb-3 overflow-hidden border border-gray-100">
                                            <img src={item.image} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                                        </div>
                                        <div className="flex-grow flex flex-col px-1">
                                            <h3 className="font-bold text-sm text-gray-800 flex-grow line-clamp-2 h-10 group-hover:text-neo-primary transition-colors">{item.name}</h3>
                                            {businessMode === BusinessMode.RETAIL && item.barcode && (
                                                <p className="text-[10px] text-gray-400 font-mono mt-1 w-full truncate border border-dotted border-gray-300 p-0.5 px-1 rounded inline-block bg-gray-50">{item.barcode}</p>
                                            )}
                                            <div className="flex justify-between items-center mt-2 pb-1">
                                                <p className="font-black font-mono text-xl text-neo-primary">
                                                    {/* [PRICING ENGINE INTEGRATION] Show discounted price with original strikethrough */}
                                                    {(item as Record<string, unknown>)._originalPrice != null && (item as Record<string, unknown>)._originalPrice !== item.price ? (
                                                        <span className="flex items-center gap-1 text-neo-accent">
                                                            <SparklesIcon className="w-4 h-4 animate-pulse" />
                                                            {item.price}
                                                        </span>
                                                    ) : (
                                                        item.price
                                                    )} <span className="text-xs text-gray-500">ج.م</span>
                                                </p>
                                                {/* [PRICING ENGINE INTEGRATION] Show discount reason if pricing rules applied */}
                                                {item._pricingResult && item._pricingResult.appliedRules.length > 0 && (
                                                    <p className="text-[10px] text-neo-accent font-medium mt-0.5 line-clamp-1">
                                                        {item._pricingResult.appliedRules[0].reason}
                                                    </p>
                                                )}
                                                {businessMode === BusinessMode.RETAIL && typeof item.stockQuantity === 'number' && (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${item.stockQuantity > 5 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                        {item.stockQuantity} {item.isWeightBased ? 'كجم' : 'حبة'}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>

                <aside className="w-5/12 bg-white shadow-2xl border-l border-gray-100 flex flex-col relative rounded-r-[3rem] m-4 ml-0 overflow-hidden">
                    {checkoutStep === 'cart' && (
                        <div className="absolute top-6 left-6 z-20" ref={userMenuRef}>
                            <button 
                                onClick={() => setIsUserMenuOpen(prev => !prev)}
                                className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden ring-2 ring-gray-200 hover:ring-neo-primary/50 focus:outline-none focus:ring-2 focus:ring-neo-primary/50 transition-all cursor-pointer"
                            >
                                {currentUser?.profilePicture ? (
                                    <img src={currentUser.profilePicture} alt="Profile" className="w-full h-full object-cover" />
                                ) : (
                                    <span className="font-bold text-lg text-gray-700 select-none">
                                        {currentUser?.username?.charAt(0).toUpperCase() || 'U'}
                                    </span>
                                )}
                            </button>

                            {isUserMenuOpen && (
                                <div className="absolute top-full mt-2 left-0 w-72 bg-white rounded-xl shadow-lg border border-gray-200 z-50 animate-zoom-in-95 origin-top-left">
                                    <div className="p-4 border-b border-gray-200 flex items-center gap-3">
                                        <div className="w-12 h-12 rounded-full bg-neo-primary/10 flex items-center justify-center overflow-hidden">
                                            {currentUser?.profilePicture ? (
                                                <img src={currentUser.profilePicture} alt="Profile" className="w-full h-full object-cover" />
                                            ) : (
                                            <span className="font-bold text-xl text-neo-primary">{currentUser?.username?.charAt(0).toUpperCase() || 'U'}</span>
                                            )}
                                        </div>
                                        <div>
                                            <p className="font-bold text-gray-800">{currentUser?.username || 'User'}</p>
                                            <p className="text-sm text-gray-500">
                                                {currentUser?.accessLevel === 'Admin' ? 'مدير النظام' : 'كاشير'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="p-4">
                                        <div className="flex items-center gap-3 text-sm text-gray-600">
                                            <ClockIcon className="w-5 h-5 text-gray-400"/>
                                            <span>مدة الوردية:</span>
                                            <span className="font-mono font-bold text-gray-800 tracking-wider">{elapsedTime}</span>
                                        </div>
                                    </div>
                                    <div className="h-px bg-gray-200 mx-2"></div>
                                    <div className="p-2">
                                        <button
                                            onClick={handleEndShiftAndExit}
                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-600 font-semibold rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
                                        >
                                            <PowerIcon className="w-5 h-5" />
                                            <span>إنهاء الوردية والخروج</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    {renderAsideContent()}
                </aside>
            </div>
            <InvoicePreviewModal
                isOpen={isPosPreviewOpen}
                onClose={() => setIsPosPreviewOpen(false)}
                order={previewOrder}
                currentUser={currentUser}
            />
        </>
    );
};

export default POSSystem;
