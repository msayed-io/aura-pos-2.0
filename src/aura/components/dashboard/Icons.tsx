import React from 'react';
import {
  LogOut,
  List,
  Tag,
  Ticket,
  ShieldAlert,
  ArrowRight,
  ArrowLeft,
  Receipt,
  Archive,
  ClipboardList,
  MessageSquare,
  Printer,
  X,
  ShieldCheck,
  Pencil,
  CreditCard,
  Banknote,
  Calendar,
  Clock,
  Store,
  User,
  Phone,
  MapPin,
  Loader2,
  Flame,
  // FIX: Import `Check` icon from lucide-react
  Check,
  CheckCircle2,
  Truck,
  ShoppingBag,
  Search,
  RotateCcw,
  Trash2,
  Download,
  UploadCloud,
  DollarSign,
  Lock,
  UtensilsCrossed,
  LayoutDashboard,
  Cog,
  Plus,
  SlidersHorizontal,
  Info,
  Users,
  KeyRound,
  Calculator, // New Icon for POS
  TrendingUp, // New Icon for Analytics
  LayoutGrid, // Icon for 'All' category
  Beef, // FIX: Icon for 'Burger' was 'Hamburger', which does not exist.
  Utensils, // Icon for 'Sandwich'
  CookingPot, // Icon for 'Sides'
  GlassWater, // Icon for 'Drinks'
  ListChecks, // New icon for Coupon Usage Logs
  Infinity as InfinityLucide, // New Icon for unlimited coupons
  Bell, // New Icon for Notifications
  // FIX: Add missing icons for NotificationsPanel
  Star,
  Wallet,
  MinusCircle,
  ChevronDown,
  Power,
  CalendarDays,
// FIX: Add missing FileX icon for VoidMonitoringCenter
  FileX,
  Volume2,
  Music,
  Play,
  Fingerprint,
  UserPlus,
  Save,
  Eye, // Add Eye icon for preview
  Palette, // New Icon for Branding
  Megaphone, // Add Megaphone icon
  Image, // Add Image icon
  Contact, // For CRM, replaced AddressBook
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Inbox,
  CalendarClock, // New icon for Reservations
  BookOpen, // New Icon for Paper Orders
  FileText, // New Icon for E-Book Orders
  VolumeX,
  Sparkles,
} from 'lucide-react';

// Wrapper to ensure consistent "Apple-like" stroke width (1.5px) and correct type forwarding
// FIX: Add `size` and `title` to the props type to fix TypeScript errors.
const withStyle = (Icon: React.ElementType) => (props: React.SVGProps<SVGSVGElement> & { size?: string | number, title?: string }) => {
  // We explicitly cast to any to allow Lucide specific props like 'size' if passed via spread, 
  // though the interface defines SVGProps.
  return <Icon strokeWidth={1.5} {...(props as any)} />;
};

export const SparklesIcon = withStyle(Sparkles);

// --- Mapped Icons (New Library -> Old Component Names) ---

// Navigation & Actions
export const ArrowLeftOnRectangleIcon = withStyle(LogOut);
export const ListBulletIcon = withStyle(List);
export const TagIcon = withStyle(Tag);
export const TicketIcon = withStyle(Ticket);
export const ShieldExclamationIcon = withStyle(ShieldAlert);
export const ArrowRightIcon = withStyle(ArrowRight);
export const ArrowLeftIcon = withStyle(ArrowLeft);
export const ChartBarIcon = withStyle(TrendingUp); // Replaced with a more dynamic icon
export const TrendingUpIcon = withStyle(TrendingUp); // New explicit export
export const ReceiptIcon = withStyle(Receipt);
export const ArchiveBoxIcon = withStyle(Archive);
export const ClipboardDocumentListIcon = withStyle(ClipboardList);
export const ChatIcon = withStyle(MessageSquare);
export const PrinterIcon = withStyle(Printer);
export const XIcon = withStyle(X);
export const ShieldCheckIcon = withStyle(ShieldCheck);
export const PencilIcon = withStyle(Pencil);
export const SearchIcon = withStyle(Search);
export const RefreshIcon = withStyle(RotateCcw);
export const TrashIcon = withStyle(Trash2);
export const DownloadIcon = withStyle(Download);
export const UploadCloudIcon = withStyle(UploadCloud);
// FIX: Add missing SaveIcon export
export const SaveIcon = withStyle(Save);
export const LockIcon = withStyle(Lock);
export const DashboardIcon = withStyle(LayoutDashboard); // Extra if needed
export const SettingsIcon = withStyle(Cog); // Replaced with classic Cog icon
export const Cog6ToothIcon = withStyle(Cog); // Alias for settings sections
export const PlusIcon = withStyle(Plus);
export const InfoIcon = withStyle(Info);
export const UsersIcon = withStyle(Users);
export const KeyRoundIcon = withStyle(KeyRound);
export const CalculatorIcon = withStyle(Calculator); // New POS Icon
export const LayoutGridIcon = withStyle(LayoutGrid);
export const HamburgerIcon = withStyle(Beef);
export const SandwichIcon = withStyle(Utensils);
export const CookingPotIcon = withStyle(CookingPot);
export const GlassWaterIcon = withStyle(GlassWater);
export const ViewLogsIcon = withStyle(ListChecks); // New Icon for Coupon Logs
// FIX: Export ListChecksIcon for VoidMonitoringCenter
export const ListChecksIcon = withStyle(ListChecks);
// FIX: Export FileXIcon for VoidMonitoringCenter
export const FileXIcon = withStyle(FileX);
export const InfinityIcon = withStyle(InfinityLucide);
export const BellIcon = withStyle(Bell);
// FIX: Export missing icons for NotificationsPanel
export const StarIcon = withStyle(Star);
export const WalletIcon = withStyle(Wallet);
export const MinusCircleIcon = withStyle(MinusCircle);
export const ChevronDownIcon = withStyle(ChevronDown);
export const PowerIcon = withStyle(Power);
export const CalendarDaysIcon = withStyle(CalendarDays);
export const FingerprintIcon = withStyle(Fingerprint);
export const UserPlusIcon = withStyle(UserPlus);
// FIX: Add missing Volume2, Music, and Play icons
export const Volume2Icon = withStyle(Volume2);
export const VolumeXIcon = withStyle(VolumeX);
export const MusicIcon = withStyle(Music);
export const PlayIcon = withStyle(Play);
export const EyeIcon = withStyle(Eye);
export const PaletteIcon = withStyle(Palette);
export const MegaphoneIcon = withStyle(Megaphone);
export const ImageIcon = withStyle(Image);
export const AddressBookIcon = withStyle(Contact);
export const ChevronLeftIcon = withStyle(ChevronLeft);
export const ChevronRightIcon = withStyle(ChevronRight);
export const ChevronsLeftIcon = withStyle(ChevronsLeft);
export const ChevronsRightIcon = withStyle(ChevronsRight);
export const InboxIcon = withStyle(Inbox);
export const CalendarClockIcon = withStyle(CalendarClock);
export const BookOpenIcon = withStyle(BookOpen);
export const FileTextIcon = withStyle(FileText);


// Status & Indicators
export const SpinnerIcon = withStyle(Loader2); // Note: Parent usually adds 'animate-spin'
export const FireIcon = withStyle(Flame);
// FIX: Export `CheckIcon`
export const CheckIcon = withStyle(Check);
export const CheckCircleIcon = withStyle(CheckCircle2);

// Commerce & Data
export const CreditCardIcon = withStyle(CreditCard);
export const BanknotesIcon = withStyle(Banknote);
export const CalendarIcon = withStyle(Calendar);
export const ClockIcon = withStyle(Clock);
export const StoreIcon = withStyle(Store);
export const UserIcon = withStyle(User);
export const PhoneIcon = withStyle(Phone);
export const LocationMarkerIcon = withStyle(MapPin);
export const MapPinIcon = withStyle(MapPin); // Added for new checkout
export const TruckIcon = withStyle(Truck);
export const ShoppingCartIcon = withStyle(ShoppingBag); // Switched to Bag for more modern look
export const DollarSignIcon = withStyle(DollarSign);
export const MenuIcon = withStyle(UtensilsCrossed);