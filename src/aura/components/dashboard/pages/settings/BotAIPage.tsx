'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import QRCode from 'qrcode';
import type {
  BotConfig,
  WhatsAppConnectionStatus,
  KnowledgeEntry,
  QuickReply,
  BusinessHours,
  WakzLocalConfig,
} from '../../../../types/wakzTypes';
import { wakzService } from '../../../../services/wakzService';
import {
  SparklesIcon,
  PhoneIcon,
  ClockIcon,
  PowerIcon,
  PlusIcon,
  TrashIcon,
  CheckCircleIcon,
  SpinnerIcon,
  Cog6ToothIcon,
  SaveIcon,
  SearchIcon,
  CheckIcon,
  ArrowRightIcon,
} from '../../Icons';
import {
  Bot,
  QrCode,
  Copy,
  Zap,
  Wifi,
  WifiOff,
  MessageSquare,
  RefreshCw,
  AlertCircle,
  AlertTriangle,
  Upload,
  FileText,
  ChevronDown,
  X,
} from 'lucide-react';
import { useDashboard } from '../../DashboardContext';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

const DEFAULT_BOT_CONFIG: BotConfig = {
  botName: '',
  businessName: '',
  corePrompt: '',
  emojiEnabled: true,
  responseLength: 'auto',
  isActive: false,
};

// ---------------------------------------------------------------------------
// Connection Status Indicator
// ---------------------------------------------------------------------------

const ConnectionStatusDot: React.FC<{ status: WhatsAppConnectionStatus }> = ({ status }) => {
  if (status === 'connected') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
        <span className="text-sm font-semibold text-green-600">متصل</span>
      </div>
    );
  }
  if (status === 'connecting') {
    return (
      <div className="flex items-center gap-2">
        <SpinnerIcon className="w-4 h-4 animate-spin text-yellow-500" />
        <span className="text-sm font-semibold text-yellow-600">جاري الاتصال</span>
      </div>
    );
  }
  if (status === 'qr_ready' || status === 'pairing_ready') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
        <span className="text-sm font-semibold text-blue-600">
          {status === 'qr_ready' ? 'في انتظار المسح' : 'في انتظار الإقران'}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
      <span className="text-sm font-semibold text-red-500">غير متصل</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Toggle Switch
// ---------------------------------------------------------------------------

interface ToggleSwitchProps {
  enabled: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ enabled, onChange, label, disabled }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-sm font-semibold text-neo-secondary">{label}</span>
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        enabled ? 'bg-neo-primary' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      aria-label={label}
    >
      <div
        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-sm transition-transform ${
          enabled ? 'right-0.5' : 'right-5'
        }`}
      />
    </button>
  </div>
);

// ---------------------------------------------------------------------------
// Copy Button with animation
// ---------------------------------------------------------------------------

const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className="p-2 rounded-lg hover:bg-gray-100 transition text-neo-secondary/60"
      title="نسخ"
    >
      {copied ? (
        <CheckIcon className="w-4 h-4 text-green-500" />
      ) : (
        <Copy className="w-4 h-4" />
      )}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Section Card — Reusable wrapper for organized sections
// ---------------------------------------------------------------------------

const SectionCard: React.FC<{
  title: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}> = ({ title, icon, badge, children, className = '' }) => (
  <div className={`bg-white rounded-xl border border-gray-200 p-6 ${className}`}>
    <div className="flex items-center gap-2 mb-4">
      {icon}
      <h2 className="text-base font-bold text-neo-secondary">{title}</h2>
      {badge}
    </div>
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Input Field — Consistent styling
// ---------------------------------------------------------------------------

const inputClass =
  'w-full px-4 py-3 border border-gray-200 rounded-lg bg-white text-neo-secondary text-base focus:outline-none focus:ring-2 focus:ring-neo-primary/20 focus:border-neo-primary transition';

const textareaClass =
  'w-full px-4 py-3 border border-gray-200 rounded-lg bg-white text-neo-secondary text-base focus:outline-none focus:ring-2 focus:ring-neo-primary/20 focus:border-neo-primary transition resize-y';

// ---------------------------------------------------------------------------
// Pairing Code Countdown — Shows remaining time for pairing code expiry
// ---------------------------------------------------------------------------

const PairingCodeCountdown: React.FC<{
  expiry: number;
  onExpired: () => void;
}> = ({ expiry, onExpired }) => {
  const [remaining, setRemaining] = useState(Math.max(0, Math.floor((expiry - Date.now()) / 1000)));

  useEffect(() => {
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((expiry - Date.now()) / 1000));
      setRemaining(left);
      if (left <= 0) {
        clearInterval(interval);
        onExpired();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiry, onExpired]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div className="flex items-center justify-center gap-1.5 mt-3">
      <ClockIcon className="w-3.5 h-3.5 text-amber-600" />
      <span className={`text-xs font-semibold ${remaining <= 30 ? 'text-red-600' : 'text-amber-600'}`}>
        {remaining > 0
          ? `ينتهي بعد ${minutes}:${seconds.toString().padStart(2, '0')}`
          : 'انتهت الصلاحية'}
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// BotAIPage — Main Component
// ---------------------------------------------------------------------------

type ViewMode = 'overview' | 'wdna-detail';

const BotAIPage: React.FC = () => {
  const { showToast } = useDashboard();

  // View mode
  const [view, setView] = useState<ViewMode>('overview');

  // ---- Data State ----
  const [config, setConfig] = useState<WakzLocalConfig>(wakzService.getConfig());
  const [botConfig, setBotConfig] = useState<BotConfig>(config.botConfig || DEFAULT_BOT_CONFIG);
  const [knowledgeEntries, setKnowledgeEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // ---- Server Error State ----
  const [serverError, setServerError] = useState<string | null>(null);

  // ---- WhatsApp State ----
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [rawQrString, setRawQrString] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [connectionTab, setConnectionTab] = useState<'qr' | 'pairing'>('qr');
  const [connectionMode, setConnectionMode] = useState<'qr' | 'pairing' | 'idle'>('idle');
  const [pairingCodeExpiry, setPairingCodeExpiry] = useState<number | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [pairingLoading, setPairingLoading] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [whatsappUserId, setWhatsappUserId] = useState(config.whatsappUserId || '');

  // ---- W-DNA State ----
  const [magicWandLoading, setMagicWandLoading] = useState(false);
  const [saveBotLoading, setSaveBotLoading] = useState(false);

  // ---- Knowledge State ----
  const [newKnowledgeTitle, setNewKnowledgeTitle] = useState('');
  const [newKnowledgeContent, setNewKnowledgeContent] = useState('');
  const [addKnowledgeLoading, setAddKnowledgeLoading] = useState(false);

  // ---- Quick Reply State ----
  const [newQuickReplyTrigger, setNewQuickReplyTrigger] = useState('');
  const [newQuickReplyReply, setNewQuickReplyReply] = useState('');

  // ---- Advanced State ----
  const [autoReplyLoading, setAutoReplyLoading] = useState(false);
  const [businessHoursExpanded, setBusinessHoursExpanded] = useState(false);
  const [quickRepliesExpanded, setQuickRepliesExpanded] = useState(false);

  // ---- File Upload State ----
  const [uploadLoading, setUploadLoading] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [manualEntryExpanded, setManualEntryExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---- Subscribe to wakzService changes ----
  useEffect(() => {
    const unsubscribe = wakzService.subscribe(() => {
      const updated = wakzService.getConfig();
      setConfig(updated);
      // NOTE: We intentionally do NOT overwrite botConfig or whatsappUserId here.
      // These are managed by local React state and only synced to the service
      // when the user saves. Overwriting them from the subscription would
      // destroy user edits when status polling triggers (every 15s).
    });
    return unsubscribe;
  }, []);

  // ---- Full sync on mount ----
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        await wakzService.fullSync();
        if (cancelled) return;

        const synced = wakzService.getConfig();
        setConfig(synced);
        if (synced.botConfig) {
          setBotConfig(synced.botConfig);
        }

        // If already in qr_ready or connecting state, auto-fetch QR
        if (synced.connectionStatus === 'qr_ready' || synced.connectionStatus === 'connecting') {
          try {
            const qrResult = await wakzService.getQRCode();
            if (!cancelled && qrResult.success && qrResult.qrCode) {
              if (qrResult.qrCode.startsWith('data:image')) {
                setQrCode(qrResult.qrCode);
              } else {
                // Raw QR string — generate image from it
                setRawQrString(qrResult.qrCode);
                try {
                  const dataUrl = await QRCode.toDataURL(qrResult.qrCode, {
                    width: 256,
                    margin: 2,
                    color: { dark: '#1a1a2e', light: '#ffffff' },
                  });
                  setQrCode(dataUrl);
                } catch {
                  setQrCode(qrResult.qrCode);
                }
              }
            }
          } catch {
            // silently ignore
          }
        }

        // Load knowledge entries
        try {
          const knowledgeResult = await wakzService.getKnowledgeEntries();
          if (!cancelled && knowledgeResult.success && knowledgeResult.entries) {
            setKnowledgeEntries(knowledgeResult.entries);
          }
        } catch {
          // Knowledge might fail silently
        }

        // Server is working — clear error
        if (!cancelled) {
          setServerError(null);
        }
      } catch (error) {
        if (!cancelled) {
          const msg = error instanceof Error ? error.message : 'فشل الاتصال بخادم WAKZ';
          setServerError(msg);
          console.error('[BotAIPage] fullSync error:', msg);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    init();

    // Start status polling
    try {
      wakzService.startStatusPolling(15000);
    } catch {
      // polling might fail, that's ok
    }

    return () => {
      cancelled = true;
      wakzService.stopStatusPolling();
    };
  }, []);

  // ---- QR Code auto-refresh when in qr_ready state ----
  // IMPORTANT: Only refresh when connectionMode is 'qr'. When in 'pairing' mode,
  // calling /connect/qr would invalidate the pairing code (Bug #1 fix).
  useEffect(() => {
    if (config.connectionStatus !== 'qr_ready') return;
    if (connectionMode === 'pairing') return; // Don't refresh QR when in pairing mode

    const refreshQr = async () => {
      if (connectionMode === 'pairing') return; // Double guard
      try {
        const result = await wakzService.getQRCode();
        if (result.success && result.qrCode) {
          if (result.qrCode.startsWith('data:image')) {
            setQrCode(result.qrCode);
          } else {
            setRawQrString(result.qrCode);
            try {
              const dataUrl = await QRCode.toDataURL(result.qrCode, {
                width: 256,
                margin: 2,
                color: { dark: '#1a1a2e', light: '#ffffff' },
              });
              setQrCode(dataUrl);
            } catch {
              setQrCode(result.qrCode);
            }
          }
          setServerError(null);
        }
      } catch {
        // silently ignore
      }
    };

    refreshQr();
    const interval = setInterval(refreshQr, 60000); // Changed from 30000 to 60000 (Bug #3 fix)
    return () => clearInterval(interval);
  }, [config.connectionStatus, connectionMode]);

  // ---- Watch for connection status changes ----
  useEffect(() => {
    if (config.connectionStatus === 'connected') {
      setQrCode(null);
      setRawQrString(null);
      setPairingCode(null);
      setConnectionMode('idle');
      setPairingCodeExpiry(null);
      setServerError(null);
    }
  }, [config.connectionStatus]);

  // ---- Pairing code expiry countdown ----
  useEffect(() => {
    if (!pairingCodeExpiry) return;
    const interval = setInterval(() => {
      if (Date.now() >= pairingCodeExpiry) {
        setPairingCodeExpiry(null);
        setPairingCode(null);
        setConnectionMode('idle');
        showToast({ message: 'انتهت صلاحية كود الاقتران. يرجى طلب كود جديد.', type: 'error' });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pairingCodeExpiry, showToast]);

  // ---- Computed values ----
  const connectionStatus = useMemo(() => config.connectionStatus, [config.connectionStatus]);
  const connectedPhone = useMemo(() => config.connectedPhone, [config.connectedPhone]);
  const autoReplyEnabled = useMemo(() => config.autoReplyEnabled, [config.autoReplyEnabled]);
  const businessHours = useMemo(() => config.businessHours, [config.businessHours]);
  const quickReplies = useMemo(() => config.quickReplies, [config.quickReplies]);
  const sendSpeedMs = useMemo(() => config.sendSpeedMs, [config.sendSpeedMs]);
  const knowledgeCount = useMemo(() => knowledgeEntries.length, [knowledgeEntries]);

  // =========================================================================
  // QR Code Fetching Strategy
  // =========================================================================

  /** Fetch QR code using the dual-source strategy:
   *  1. Try /connect/qr endpoint — if it returns a base64 image, use it directly
   *  2. If /connect/qr fails or returns no image, use raw qrCode from /connect/status
   *     and generate a QR image using the qrcode library
   */
  const fetchQrCode = useCallback(async (): Promise<string | null> => {
    // Strategy 1: Try /connect/qr endpoint first
    try {
      const qrResult = await wakzService.getQRCode();
      if (qrResult.success && qrResult.qrCode) {
        if (qrResult.qrCode.startsWith('data:image')) {
          // Ready-to-display base64 PNG image
          return qrResult.qrCode;
        }
        // Raw QR string — generate image from it
        setRawQrString(qrResult.qrCode);
        try {
          const dataUrl = await QRCode.toDataURL(qrResult.qrCode, {
            width: 256,
            margin: 2,
            color: { dark: '#1a1a2e', light: '#ffffff' },
          });
          return dataUrl;
        } catch {
          return qrResult.qrCode;
        }
      }
    } catch {
      // /connect/qr failed, try fallback
    }

    // Strategy 2: Use raw qrCode from /connect/status endpoint
    try {
      const statusResult = await wakzService.getConnectionStatus();
      if (statusResult.success && statusResult.qrCode) {
        setRawQrString(statusResult.qrCode);
        try {
          const dataUrl = await QRCode.toDataURL(statusResult.qrCode, {
            width: 256,
            margin: 2,
            color: { dark: '#1a1a2e', light: '#ffffff' },
          });
          return dataUrl;
        } catch {
          return statusResult.qrCode;
        }
      }
    } catch {
      // Both sources failed
    }

    return null;
  }, []);

  // =========================================================================
  // W-DNA Handlers
  // =========================================================================

  const handleMagicWand = useCallback(async () => {
    if (!botConfig.botName.trim() || !botConfig.businessName.trim()) {
      showToast({ message: 'يرجى إدخال اسم البوت واسم النشاط التجاري أولاً', type: 'error' });
      return;
    }
    setMagicWandLoading(true);
    try {
      const result = await wakzService.magicWand({
        botName: botConfig.botName,
        businessName: botConfig.businessName,
      });
      if (result.success) {
        if (result.corePrompt) {
          setBotConfig((prev) => ({ ...prev, corePrompt: result.corePrompt! }));
        }
        setServerError(null);
        showToast({ message: 'تم توليد التعليمات بالذكاء الاصطناعي بنجاح', type: 'success' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'فشل توليد التعليمات';
      showToast({ message: msg, type: 'error' });
    } finally {
      setMagicWandLoading(false);
    }
  }, [botConfig.botName, botConfig.businessName, showToast]);

  const handleSaveBotConfig = useCallback(async () => {
    if (!botConfig.botName.trim() || !botConfig.businessName.trim()) {
      showToast({ message: 'يرجى إدخال اسم البوت واسم النشاط التجاري', type: 'error' });
      return;
    }
    setSaveBotLoading(true);
    try {
      const result = await wakzService.saveBotConfig(botConfig);
      if (result.success) {
        setServerError(null);
        showToast({ message: 'تم حفظ إعدادات W-DNA بنجاح', type: 'success' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'فشل حفظ إعدادات W-DNA';
      showToast({ message: msg, type: 'error' });
    } finally {
      setSaveBotLoading(false);
    }
  }, [botConfig, showToast]);

  // =========================================================================
  // Knowledge Handlers
  // =========================================================================

  const handleAddKnowledge = useCallback(async () => {
    if (!newKnowledgeTitle.trim() || !newKnowledgeContent.trim()) {
      showToast({ message: 'يرجى إدخال عنوان ومحتوى المعرفة', type: 'error' });
      return;
    }
    setAddKnowledgeLoading(true);
    try {
      const result = await wakzService.addKnowledgeEntry({
        title: newKnowledgeTitle,
        content: newKnowledgeContent,
        sourceFile: 'manual-entry',
        fileType: 'txt',
      });
      if (result.success) {
        setNewKnowledgeTitle('');
        setNewKnowledgeContent('');
        try {
          const knowledgeResult = await wakzService.getKnowledgeEntries();
          if (knowledgeResult.success && knowledgeResult.entries) {
            setKnowledgeEntries(knowledgeResult.entries);
          }
        } catch {
          // ignore
        }
        showToast({ message: 'تم إضافة المعرفة بنجاح', type: 'success' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'فشل إضافة المعرفة';
      showToast({ message: msg, type: 'error' });
    } finally {
      setAddKnowledgeLoading(false);
    }
  }, [newKnowledgeTitle, newKnowledgeContent, showToast]);

  // =========================================================================
  // File Upload Handlers
  // =========================================================================

  const handleFileUpload = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    setUploadLoading(true);
    try {
      for (const file of fileArray) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', file.name.replace(/\.[^/.]+$/, ''));

        const response = await fetch('/api/wakz/knowledge/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();
        if (result.success === false) {
          throw new Error(result.message || 'فشل رفع الملف');
        }
      }

      // Refresh knowledge entries
      try {
        const knowledgeResult = await wakzService.getKnowledgeEntries();
        if (knowledgeResult.success && knowledgeResult.entries) {
          setKnowledgeEntries(knowledgeResult.entries);
        }
      } catch { /* ignore */ }

      showToast({ message: 'تم رفع الملفات بنجاح', type: 'success' });
      setUploadFiles([]);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'فشل رفع الملفات';
      showToast({ message: msg, type: 'error' });
    } finally {
      setUploadLoading(false);
    }
  }, [showToast]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files);
    }
  }, [handleFileUpload]);

  // =========================================================================
  // WhatsApp Handlers
  // =========================================================================

  const handleConnectWhatsApp = useCallback(async () => {
    setConnectLoading(true);
    setQrCode(null);
    setRawQrString(null);
    setConnectionMode('qr'); // Set QR mode
    setServerError(null);
    try {
      // Step 1: Initialize connection with QR method
      const initResult = await wakzService.initializeConnection({ method: 'qr' });
      if (!initResult.success) {
        showToast({ message: 'فشل بدء الاتصال. تأكد من أن خادم WAKZ يعمل.', type: 'error' });
        return;
      }

      // Step 2: Auto-fetch QR code using the dual-source strategy
      try {
        const qrImage = await fetchQrCode();
        if (qrImage) {
          setQrCode(qrImage);
          setConnectionTab('qr');
        } else if (connectionStatus === 'connected') {
          showToast({ message: 'واتساب متصل بالفعل', type: 'success' });
        }
      } catch {
        // QR fetch might fail — user can click refresh
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'فشل بدء الاتصال';
      setServerError(msg);
      showToast({ message: msg, type: 'error' });
    } finally {
      setConnectLoading(false);
    }
  }, [connectionStatus, fetchQrCode, showToast]);

  const handleRefreshQrCode = useCallback(async () => {
    setQrLoading(true);
    try {
      const qrImage = await fetchQrCode();
      if (qrImage) {
        setQrCode(qrImage);
        setServerError(null);
      } else if (connectionStatus === 'connected') {
        showToast({ message: 'واتساب متصل بالفعل', type: 'info' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'فشل الحصول على رمز QR';
      showToast({ message: msg, type: 'error' });
    } finally {
      setQrLoading(false);
    }
  }, [connectionStatus, fetchQrCode, showToast]);

  const handleRequestPairingCode = useCallback(async () => {
    const cleanPhone = phoneNumber.replace(/[\s\-()]/g, '');
    if (!cleanPhone || cleanPhone.length < 10) {
      showToast({ message: 'يرجى إدخال رقم هاتف صحيح (مع رمز الدولة)', type: 'error' });
      return;
    }
    setPairingLoading(true);
    setPairingCode(null);
    setConnectionMode('pairing'); // STOP QR auto-refresh
    try {
      // Disconnect first if needed
      const currentStatus = wakzService.getConfig().connectionStatus;
      if (currentStatus !== 'disconnected') {
        try { await wakzService.logout(); } catch { /* ignore */ }
        // Wait a moment for server to process
        await new Promise(r => setTimeout(r, 1000));
      }

      // Use the new initialize flow with method='pairing'
      const result = await wakzService.requestPairingCode(cleanPhone);
      if (result.success && result.pairingCode) {
        setPairingCode(result.pairingCode);
        setPairingCodeExpiry(Date.now() + 180000); // 3 minutes from now
        setServerError(null);
        showToast({ message: 'تم توليد كود الاقتران بنجاح', type: 'success' });
      } else {
        setConnectionMode('idle');
        showToast({ message: result.message || 'فشل توليد كود الاقتران', type: 'error' });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'فشل توليد كود الاقتران';
      setServerError(msg);
      setConnectionMode('idle');
      showToast({ message: msg, type: 'error' });
    } finally {
      setPairingLoading(false);
    }
  }, [phoneNumber, showToast]);

  const handleLogout = useCallback(async () => {
    setLogoutLoading(true);
    try {
      const result = await wakzService.logout();
      if (result.success) {
        setQrCode(null);
        setRawQrString(null);
        setPairingCode(null);
        setConnectionMode('idle'); // Reset mode
        setPairingCodeExpiry(null);
        setServerError(null);
        showToast({ message: 'تم فصل واتساب بنجاح', type: 'success' });
      }
    } catch (error) {
      showToast({ message: 'فشل فصل واتساب', type: 'error' });
    } finally {
      setLogoutLoading(false);
    }
  }, [showToast]);

  // =========================================================================
  // Advanced Handlers
  // =========================================================================

  const handleToggleAutoReply = useCallback(async (enabled: boolean) => {
    setAutoReplyLoading(true);
    try {
      await wakzService.toggleAutoReply({ enabled: enabled });
      showToast({ message: enabled ? 'تم تفعيل الرد التلقائي' : 'تم تعطيل الرد التلقائي', type: 'success' });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'فشل تبديل الرد التلقائي';
      showToast({ message: msg, type: 'error' });
    } finally {
      setAutoReplyLoading(false);
    }
  }, [showToast]);

  const handleUpdateBusinessHours = useCallback((updates: Partial<BusinessHours>) => {
    const newHours: BusinessHours = { ...businessHours, ...updates };
    wakzService.updateBusinessHours(newHours);
  }, [businessHours]);

  const handleToggleDay = useCallback((day: number) => {
    const currentDays = businessHours.days;
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day].sort();
    handleUpdateBusinessHours({ days: newDays });
  }, [businessHours.days, handleUpdateBusinessHours]);

  const handleAddQuickReply = useCallback(() => {
    if (!newQuickReplyTrigger.trim() || !newQuickReplyReply.trim()) {
      showToast({ message: 'يرجى إدخال الكلمة المفتاحية والرد', type: 'error' });
      return;
    }
    wakzService.addQuickReply(newQuickReplyTrigger.trim(), newQuickReplyReply.trim());
    setNewQuickReplyTrigger('');
    setNewQuickReplyReply('');
    showToast({ message: 'تم إضافة الرد السريع', type: 'success' });
  }, [newQuickReplyTrigger, newQuickReplyReply, showToast]);

  const handleRemoveQuickReply = useCallback((id: string) => {
    wakzService.removeQuickReply(id);
    showToast({ message: 'تم حذف الرد السريع', type: 'info' });
  }, [showToast]);

  const handleToggleQuickReply = useCallback((id: string) => {
    wakzService.toggleQuickReply(id);
  }, []);

  const handleSendSpeedChange = useCallback((speed: number) => {
    wakzService.updateSendSpeed(speed);
  }, []);

  // =========================================================================
  // Helper: format file size
  // =========================================================================

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // =========================================================================
  // Loading
  // =========================================================================

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center min-h-[400px]">
        <SpinnerIcon className="w-10 h-10 animate-spin text-neo-primary" />
      </div>
    );
  }

  // =========================================================================
  // W-DNA Detail View
  // =========================================================================

  if (view === 'wdna-detail') {
    return (
      <div className="flex flex-col gap-5" dir="rtl">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setView('overview')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-neo-secondary/60 transition"
          >
            <ArrowRightIcon className="w-5 h-5" />
            <span className="text-sm font-semibold">رجوع</span>
          </button>
          <div className="flex-grow">
            <h1 className="text-xl font-bold text-neo-secondary flex items-center gap-2">
              <SparklesIcon className="w-6 h-6 text-neo-primary" />
              شخصية البوت (W-DNA)
            </h1>
          </div>
        </div>

        {/* Server Error Warning */}
        {serverError && (
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">تنبيه: خطأ في خادم WAKZ</p>
              <p className="text-xs text-amber-700 mt-1">{serverError}</p>
              <p className="text-xs text-amber-600 mt-1">قد لا يتم حفظ الإعدادات حتى يتم حل المشكلة.</p>
            </div>
          </div>
        )}

        {/* Basic Info */}
        <SectionCard
          title="المعلومات الأساسية"
          icon={<Bot className="w-5 h-5 text-neo-primary" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-neo-secondary/80 mb-1.5">
                اسم البوت
              </label>
              <input
                type="text"
                value={botConfig.botName}
                onChange={(e) => setBotConfig((prev) => ({ ...prev, botName: e.target.value }))}
                placeholder="مساعد أورا"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-neo-secondary/80 mb-1.5">
                اسم النشاط التجاري
              </label>
              <input
                type="text"
                value={botConfig.businessName}
                onChange={(e) => setBotConfig((prev) => ({ ...prev, businessName: e.target.value }))}
                placeholder="مطعم أورا"
                className={inputClass}
              />
            </div>
          </div>
        </SectionCard>

        {/* Core Instructions */}
        <SectionCard
          title="تعليمات التشغيل"
          icon={<Zap className="w-5 h-5 text-neo-primary" />}
        >
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs text-neo-secondary/50">
              التعليمات الأساسية التي تحدد سلوك البوت وشخصيته
            </p>
            <button
              onClick={handleMagicWand}
              disabled={magicWandLoading}
              className="flex items-center gap-2 px-4 py-2 bg-neo-primary/10 text-neo-primary font-semibold rounded-lg hover:bg-neo-primary/20 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {magicWandLoading ? (
                <SpinnerIcon className="w-4 h-4 animate-spin" />
              ) : (
                <SparklesIcon className="w-4 h-4" />
              )}
              <span className="text-sm">توليد تلقائي</span>
            </button>
          </div>
          <textarea
            value={botConfig.corePrompt}
            onChange={(e) => setBotConfig((prev) => ({ ...prev, corePrompt: e.target.value }))}
            placeholder="اكتب تعليمات تشغيل البوت هنا... مثلاً: أنت مساعد ذكي لمطعم أورا، تساعد العملاء في الطلب والاستفسار عن المنيو..."
            rows={8}
            className={textareaClass}
          />
          {magicWandLoading && (
            <div className="flex items-center gap-2 mt-2 text-sm text-neo-secondary/60">
              <SpinnerIcon className="w-4 h-4 animate-spin text-neo-primary" />
              <span>الذكاء الاصطناعي يولّد التعليمات</span>
            </div>
          )}
        </SectionCard>

        {/* Response Settings */}
        <SectionCard
          title="إعدادات الرد"
          icon={<MessageSquare className="w-5 h-5 text-neo-primary" />}
        >
          <div className="space-y-4">
            <ToggleSwitch
              enabled={botConfig.emojiEnabled ?? true}
              onChange={(enabled) => setBotConfig((prev) => ({ ...prev, emojiEnabled: enabled }))}
              label="استخدام الإيموجي في الردود"
            />
            <div>
              <label className="block text-sm font-semibold text-neo-secondary/80 mb-2">
                طول الرد
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { value: 'short', label: 'قصير' },
                  { value: 'medium', label: 'متوسط' },
                  { value: 'long', label: 'طويل' },
                  { value: 'auto', label: 'تلقائي' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setBotConfig((prev) => ({ ...prev, responseLength: option.value as BotConfig['responseLength'] }))}
                    className={`px-4 py-2.5 rounded-lg text-sm font-semibold transition border-2 ${
                      (botConfig.responseLength ?? 'auto') === option.value
                        ? 'border-neo-primary bg-neo-primary/5 text-neo-primary'
                        : 'border-gray-200 bg-white text-neo-secondary/60 hover:border-gray-300'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-neo-secondary/40 mt-1.5">يحدد مدى تفصيل ردود البوت</p>
            </div>
          </div>
        </SectionCard>

        {/* Knowledge Base */}
        <SectionCard
          title="قاعدة المعرفة"
          icon={<SearchIcon className="w-5 h-5 text-neo-primary" />}
          badge={
            <span className="text-xs font-semibold bg-neo-primary/10 text-neo-primary px-2.5 py-0.5 rounded-full">
              {knowledgeCount}
            </span>
          }
        >
          {/* File Upload — PRIMARY */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragActive
                ? 'border-neo-primary bg-neo-primary/5'
                : 'border-gray-300 bg-gray-50/50 hover:border-gray-400'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.docx,.csv,.doc,.rtf,.md,.json,.xlsx,.xls"
              multiple
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  setUploadFiles(Array.from(e.target.files));
                  handleFileUpload(e.target.files);
                }
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />

            <div className="flex flex-col items-center gap-3">
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  dragActive ? 'bg-neo-primary/10' : 'bg-gray-100'
                }`}
              >
                <Upload className={`w-6 h-6 ${dragActive ? 'text-neo-primary' : 'text-gray-400'}`} />
              </div>
              <div>
                <p className="text-sm font-semibold text-neo-secondary">
                  {dragActive ? 'أفلت الملفات هنا' : 'اسحب الملفات وأفلتها هنا'}
                </p>
                <p className="text-xs text-neo-secondary/50 mt-1">
                  أو اضغط لاختيار ملفات من جهازك
                </p>
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap justify-center">
                {['PDF', 'TXT', 'DOCX', 'CSV'].map((fmt) => (
                  <span
                    key={fmt}
                    className="px-2 py-0.5 text-xs font-semibold bg-gray-100 text-gray-500 rounded"
                  >
                    {fmt}
                  </span>
                ))}
              </div>
            </div>

            {/* Upload progress overlay */}
            {uploadLoading && (
              <div className="absolute inset-0 bg-white/80 rounded-xl flex items-center justify-center">
                <div className="flex items-center gap-3">
                  <SpinnerIcon className="w-5 h-5 animate-spin text-neo-primary" />
                  <span className="text-sm font-semibold text-neo-secondary">جاري رفع الملفات</span>
                </div>
              </div>
            )}
          </div>

          {/* Uploaded files preview */}
          {uploadFiles.length > 0 && !uploadLoading && (
            <div className="mt-3 space-y-2">
              {uploadFiles.map((file, idx) => (
                <div
                  key={`${file.name}-${idx}`}
                  className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  <div className="flex-grow min-w-0">
                    <p className="text-sm text-neo-secondary truncate">{file.name}</p>
                    <p className="text-xs text-neo-secondary/40">{formatFileSize(file.size)}</p>
                  </div>
                  <CheckCircleIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                </div>
              ))}
            </div>
          )}

          {/* Manual Entry — SECONDARY (collapsed/expandable) */}
          <div className="mt-4 border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setManualEntryExpanded(!manualEntryExpanded)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition"
            >
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-neo-secondary/40" />
                <span className="text-sm font-semibold text-neo-secondary/70">إضافة يدوية</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-neo-secondary/40 transition-transform ${
                  manualEntryExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>

            {manualEntryExpanded && (
              <div className="p-4 space-y-3 border-t border-gray-200">
                <div>
                  <label className="block text-sm font-semibold text-neo-secondary/80 mb-1.5">
                    عنوان المعرفة
                  </label>
                  <input
                    type="text"
                    value={newKnowledgeTitle}
                    onChange={(e) => setNewKnowledgeTitle(e.target.value)}
                    placeholder="عنوان المعرفة"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-neo-secondary/80 mb-1.5">
                    المحتوى
                  </label>
                  <textarea
                    value={newKnowledgeContent}
                    onChange={(e) => setNewKnowledgeContent(e.target.value)}
                    placeholder="محتوى المعرفة..."
                    rows={3}
                    className={textareaClass}
                  />
                </div>
                <button
                  onClick={handleAddKnowledge}
                  disabled={addKnowledgeLoading}
                  className="flex items-center gap-2 px-4 py-2.5 bg-neo-primary text-white font-semibold rounded-lg hover:bg-neo-accent transition disabled:opacity-50 text-sm"
                >
                  {addKnowledgeLoading ? (
                    <SpinnerIcon className="w-4 h-4 animate-spin" />
                  ) : (
                    <PlusIcon className="w-4 h-4" />
                  )}
                  <span>إضافة</span>
                </button>
              </div>
            )}
          </div>

          {/* Existing Entries List */}
          {knowledgeEntries.length > 0 && (
            <div className="mt-4 max-h-96 overflow-y-auto custom-scrollbar space-y-2">
              {knowledgeEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100"
                >
                  <div className="flex-grow min-w-0">
                    <h4 className="text-sm font-semibold text-neo-secondary">{entry.title}</h4>
                    <p className="text-xs text-neo-secondary/50 mt-1 line-clamp-2">{entry.content}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {knowledgeEntries.length === 0 && (
            <p className="text-sm text-neo-secondary/40 text-center py-6 mt-2">
              لا توجد معلومات في قاعدة المعرفة بعد. ارفع ملفاً أو أضف معرفة يدوياً.
            </p>
          )}
        </SectionCard>

        {/* Save / Cancel Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={handleSaveBotConfig}
            disabled={saveBotLoading}
            className="flex items-center gap-2 px-6 py-3 bg-neo-primary text-white font-semibold rounded-lg hover:bg-neo-accent transition disabled:opacity-50 min-h-[44px] text-sm"
          >
            {saveBotLoading ? (
              <SpinnerIcon className="w-4 h-4 animate-spin" />
            ) : (
              <SaveIcon className="w-4 h-4" />
            )}
            <span>حفظ الإعدادات</span>
          </button>
          <button
            onClick={() => setView('overview')}
            className="px-6 py-3 bg-gray-100 text-neo-secondary font-semibold rounded-lg hover:bg-gray-200 transition min-h-[44px] text-sm"
          >
            إلغاء
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Overview (Main View)
  // =========================================================================

  return (
    <div className="flex flex-col gap-5" dir="rtl">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-neo-secondary flex items-center gap-2">
          <Bot className="w-7 h-7 text-neo-primary" />
          البوت والذكاء الاصطناعي
        </h1>
        <p className="text-sm text-neo-secondary/50 mt-1">
          إعدادات واتساب بوت، الرد التلقائي، وقاعدة المعرفة
        </p>
      </div>

      {/* Server Error Banner */}
      {serverError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-grow">
            <p className="text-sm font-semibold text-red-800">خادم WAKZ غير متاح</p>
            <p className="text-xs text-red-700 mt-1">{serverError}</p>
          </div>
          <button
            onClick={() => {
              setServerError(null);
              wakzService.fullSync().catch((e: unknown) => {
                const msg = e instanceof Error ? e.message : 'فشل الاتصال';
                setServerError(msg);
              });
            }}
            className="px-3 py-1.5 text-xs font-semibold bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* W-DNA Section Card */}
      <div
        onClick={() => setView('wdna-detail')}
        className="bg-white rounded-xl border border-gray-200 p-5 hover:border-neo-primary/30 transition-all cursor-pointer group"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-neo-primary/10 flex items-center justify-center flex-shrink-0">
            <SparklesIcon className="w-5 h-5 text-neo-primary" />
          </div>
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-bold text-neo-secondary group-hover:text-neo-primary transition">
              شخصية البوت (W-DNA)
            </h2>
            <p className="text-xs text-neo-secondary/50 mt-0.5">
              تخصيص شخصية البوت، تعليمات التشغيل، وقاعدة المعرفة
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setView('wdna-detail');
            }}
            className="text-xs font-semibold text-neo-primary hover:text-neo-accent transition px-3 py-1.5 rounded-lg hover:bg-neo-primary/5"
          >
            تعديل
          </button>
        </div>

        <div className="flex items-center gap-5 mt-4 pt-3 border-t border-gray-100">
          <div className="flex items-center gap-1.5">
            <Bot className="w-3.5 h-3.5 text-neo-secondary/40" />
            <span className="text-xs text-neo-secondary/40">
              {botConfig.botName || 'لم يحدد'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-neo-secondary/40" />
            <span className="text-xs text-neo-secondary/40">
              {botConfig.businessName || 'لم يحدد'}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <SearchIcon className="w-3.5 h-3.5 text-neo-secondary/40" />
            <span className="text-xs text-neo-secondary/40">
              {knowledgeCount} معرفة
            </span>
          </div>
        </div>
      </div>

      {/* WhatsApp Connection Section */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {/* Connection Status Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {connectionStatus === 'connected' ? (
              <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                <Wifi className="w-5 h-5 text-green-500" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                <WifiOff className="w-5 h-5 text-red-400" />
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-neo-secondary">اتصال واتساب</h2>
              <ConnectionStatusDot status={connectionStatus} />
            </div>
          </div>
          {connectedPhone && (
            <div className="flex items-center gap-2 bg-green-50 px-3 py-1.5 rounded-lg border border-green-100">
              <PhoneIcon className="w-4 h-4 text-green-600" />
              <span className="text-sm font-semibold text-green-700 font-mono" dir="ltr">
                {connectedPhone}
              </span>
            </div>
          )}
        </div>

        {/* Connected State */}
        {connectionStatus === 'connected' ? (
          <div className="p-6 text-center">
            <div className="w-14 h-14 mx-auto rounded-full bg-green-50 flex items-center justify-center mb-3">
              <CheckCircleIcon className="w-8 h-8 text-green-500" />
            </div>
            <p className="text-neo-secondary font-semibold mb-1">واتساب متصل</p>
            {connectedPhone && (
              <p className="text-sm text-neo-secondary/50 font-mono" dir="ltr">{connectedPhone}</p>
            )}
            <button
              onClick={handleLogout}
              disabled={logoutLoading}
              className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 bg-red-50 text-red-600 font-semibold rounded-lg hover:bg-red-100 transition disabled:opacity-50 min-h-[44px] text-sm border border-red-100"
            >
              {logoutLoading ? (
                <SpinnerIcon className="w-4 h-4 animate-spin" />
              ) : (
                <PowerIcon className="w-4 h-4" />
              )}
              <span>فصل واتساب</span>
            </button>
          </div>
        ) : (
          <div className="p-5">
            {/* QR Code / Pairing Code Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-5">
              <button
                onClick={() => {
                  setConnectionTab('qr');
                  setConnectionMode('qr');
                  // Auto-fetch QR when switching to QR tab
                  if (!qrCode && connectionStatus !== 'connected') {
                    handleConnectWhatsApp();
                  }
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold rounded-md transition min-h-[44px] ${
                  connectionTab === 'qr'
                    ? 'bg-white text-neo-primary shadow-sm'
                    : 'text-neo-secondary/50 hover:text-neo-secondary'
                }`}
              >
                <QrCode className="w-4 h-4" />
                رمز QR
              </button>
              <button
                onClick={() => {
                  setConnectionTab('pairing');
                  setConnectionMode('pairing'); // Prevent QR refresh
                }}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold rounded-md transition min-h-[44px] ${
                  connectionTab === 'pairing'
                    ? 'bg-white text-neo-primary shadow-sm'
                    : 'text-neo-secondary/50 hover:text-neo-secondary'
                }`}
              >
                <PhoneIcon className="w-4 h-4" />
                رقم الهاتف
              </button>
            </div>

            {/* QR Code Tab Content */}
            {connectionTab === 'qr' && (
              <div className="text-center">
                {qrCode ? (
                  <div className="py-4">
                    <div className="inline-block p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
                      {(qrCode.startsWith('data:image') || qrCode.startsWith('http')) ? (
                        <img
                          src={qrCode}
                          alt="رمز QR واتساب"
                          className="w-52 h-52 object-contain"
                        />
                      ) : (
                        <div className="w-52 h-52 flex items-center justify-center bg-gray-50 rounded-lg">
                          <p
                            className="font-mono text-sm text-neo-secondary text-center px-4 break-all"
                            dir="ltr"
                          >
                            {qrCode}
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-neo-secondary/50 mt-3">
                      امسح الرمز من تطبيق واتساب على هاتفك
                    </p>
                    <div className="flex items-center justify-center gap-3 mt-3">
                      <button
                        onClick={handleRefreshQrCode}
                        disabled={qrLoading}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 text-neo-secondary font-semibold rounded-lg hover:bg-gray-200 transition disabled:opacity-50 min-h-[44px]"
                      >
                        {qrLoading ? (
                          <SpinnerIcon className="w-4 h-4 animate-spin" />
                        ) : (
                          <RefreshCw className="w-4 h-4" />
                        )}
                        <span>تحديث الرمز</span>
                      </button>
                      <CopyButton text={rawQrString || qrCode} />
                    </div>
                  </div>
                ) : (
                  <div className="py-8">
                    <QrCode className="w-14 h-14 mx-auto text-gray-300 mb-4" />
                    <p className="text-neo-secondary/70 mb-1 text-base font-semibold">
                      ربط واتساب عبر رمز QR
                    </p>
                    <p className="text-sm text-neo-secondary/40 mb-5 max-w-xs mx-auto">
                      اضغط الزر التالي لبدء الاتصال وعرض رمز QR للمسح من هاتفك
                    </p>
                    <button
                      onClick={handleConnectWhatsApp}
                      disabled={connectLoading}
                      className="flex items-center gap-2 mx-auto px-6 py-3 bg-neo-primary text-white font-semibold rounded-lg hover:bg-neo-accent transition disabled:opacity-50 min-h-[44px] text-sm"
                    >
                      {connectLoading ? (
                        <SpinnerIcon className="w-5 h-5 animate-spin" />
                      ) : (
                        <Wifi className="w-5 h-5" />
                      )}
                      <span>عرض رمز QR</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Pairing Code Tab Content */}
            {connectionTab === 'pairing' && (
              <div className="space-y-4">
                {/* WhatsApp User ID */}
                <div>
                  <label className="block text-sm font-semibold text-neo-secondary/80 mb-1.5">
                    معرف المستخدم (WhatsApp User ID)
                  </label>
                  <input
                    type="text"
                    value={whatsappUserId}
                    onChange={(e) => {
                      setWhatsappUserId(e.target.value);
                      wakzService.updateConfig({ whatsappUserId: e.target.value });
                    }}
                    placeholder="cashier_cmoy402u90000nrwtb3xyy0c1_..."
                    dir="ltr"
                    className={`${inputClass} font-mono text-base`}
                  />
                  <p className="text-xs text-neo-secondary/40 mt-1">
                    معرف جلسة واتساب الخاص بك من WAKZ (مطلوب لكود الاقتران)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neo-secondary/80 mb-1.5">
                    رقم الهاتف (مع رمز الدولة)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="201012345678"
                      dir="ltr"
                      className={`flex-grow ${inputClass} font-mono`}
                    />
                    <button
                      onClick={handleRequestPairingCode}
                      disabled={pairingLoading || !phoneNumber.trim()}
                      className="px-4 py-3 bg-neo-primary text-white font-semibold rounded-lg hover:bg-neo-accent transition disabled:opacity-50 min-h-[44px] text-sm"
                    >
                      {pairingLoading ? (
                        <SpinnerIcon className="w-4 h-4 animate-spin" />
                      ) : (
                        <span>توليد</span>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-neo-secondary/40 mt-1.5">
                    أدخل رقمك بدون + أو مسافات. مثال: 201012345678
                  </p>
                </div>

                {pairingCode ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
                    <p className="text-sm text-blue-700 font-semibold mb-3">كود الاقتران</p>
                    <div className="flex items-center justify-center gap-3">
                      <p
                        className="text-3xl font-bold font-mono text-blue-800 tracking-widest"
                        dir="ltr"
                      >
                        {pairingCode}
                      </p>
                      <CopyButton text={pairingCode} />
                    </div>
                    {pairingCodeExpiry && (
                      <PairingCodeCountdown
                        expiry={pairingCodeExpiry}
                        onExpired={() => {
                          setPairingCode(null);
                          setPairingCodeExpiry(null);
                          setConnectionMode('idle');
                        }}
                      />
                    )}
                    <div className="mt-4 pt-3 border-t border-blue-100">
                      <p className="text-xs text-blue-600/70 font-semibold mb-2">كيفية الإقران:</p>
                      <ol className="text-xs text-blue-600/60 text-right space-y-1 list-decimal list-inside">
                        <li>افتح واتساب على هاتفك</li>
                        <li>اذهب إلى الإعدادات</li>
                        <li>اختر الأجهزة المرتبطة</li>
                        <li>اضغط ربط جهاز</li>
                        <li>اختر &quot;ربط برقم الهاتف&quot;</li>
                        <li>أدخل الكود أعلاه</li>
                      </ol>
                      <p className="text-xs text-amber-600 mt-3 font-semibold">
                        ملاحظة: هذا الكود يُدخل في واتساب، وليس العكس. الكود صالح لمدة 3 دقائق.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-xl p-5 text-center border border-gray-100">
                    <PhoneIcon className="w-8 h-8 mx-auto text-gray-300 mb-3" />
                    <p className="text-sm text-neo-secondary/40">
                      أدخل رقم هاتفك واضغط &quot;توليد&quot; للحصول على كود الاقتران
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Cancel button when in connecting state */}
            {(connectionStatus === 'qr_ready' ||
              connectionStatus === 'pairing_ready' ||
              connectionStatus === 'connecting' ||
              qrCode ||
              pairingCode) && (
              <div className="mt-5 pt-4 border-t border-gray-100 text-center">
                <button
                  onClick={handleLogout}
                  disabled={logoutLoading}
                  className="text-sm text-red-500 hover:text-red-700 font-semibold transition disabled:opacity-50"
                >
                  إلغاء الاتصال
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Control Panel */}
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center gap-3">
          <Cog6ToothIcon className="w-5 h-5 text-neo-primary" />
          <h2 className="text-base font-bold text-neo-secondary">لوحة التحكم</h2>
        </div>

        <div className="p-5 space-y-4">
          {/* Auto-Reply Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center gap-3">
              <MessageSquare className="w-5 h-5 text-neo-primary" />
              <div>
                <p className="text-sm font-semibold text-neo-secondary">الرد التلقائي</p>
                <p className="text-xs text-neo-secondary/40">يرد البوت تلقائياً على رسائل واتساب</p>
              </div>
            </div>
            <ToggleSwitch
              enabled={autoReplyEnabled}
              onChange={handleToggleAutoReply}
              label="الرد التلقائي"
              disabled={autoReplyLoading}
            />
          </div>

          {/* Business Hours */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setBusinessHoursExpanded(!businessHoursExpanded)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition"
            >
              <div className="flex items-center gap-3">
                <ClockIcon className="w-5 h-5 text-neo-primary" />
                <div className="text-right">
                  <p className="text-sm font-semibold text-neo-secondary">ساعات العمل</p>
                  <p className="text-xs text-neo-secondary/40">
                    {businessHours.enabled
                      ? `${businessHours.startTime} - ${businessHours.endTime}`
                      : 'غير مفعّل'}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-neo-secondary/30 transition-transform ${
                  businessHoursExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
            {businessHoursExpanded && (
              <div className="p-4 space-y-3 border-t border-gray-200">
                <ToggleSwitch
                  enabled={businessHours.enabled}
                  onChange={(enabled) => handleUpdateBusinessHours({ enabled })}
                  label="تفعيل ساعات العمل"
                />
                {businessHours.enabled && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-neo-secondary/70 mb-1.5">
                          من
                        </label>
                        <input
                          type="time"
                          value={businessHours.startTime}
                          onChange={(e) =>
                            handleUpdateBusinessHours({ startTime: e.target.value })
                          }
                          className={`w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white text-neo-secondary text-base focus:outline-none focus:ring-2 focus:ring-neo-primary/20 focus:border-neo-primary transition`}
                          dir="ltr"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-neo-secondary/70 mb-1.5">
                          إلى
                        </label>
                        <input
                          type="time"
                          value={businessHours.endTime}
                          onChange={(e) =>
                            handleUpdateBusinessHours({ endTime: e.target.value })
                          }
                          className={`w-full px-4 py-2.5 border border-gray-200 rounded-lg bg-white text-neo-secondary text-base focus:outline-none focus:ring-2 focus:ring-neo-primary/20 focus:border-neo-primary transition`}
                          dir="ltr"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-neo-secondary/70 mb-2">
                        أيام العمل
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {ARABIC_DAYS.map((day, index) => (
                          <button
                            key={index}
                            onClick={() => handleToggleDay(index)}
                            className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition ${
                              businessHours.days.includes(index)
                                ? 'bg-neo-primary text-white'
                                : 'bg-gray-100 text-neo-secondary/40 hover:bg-gray-200'
                            }`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Quick Replies */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setQuickRepliesExpanded(!quickRepliesExpanded)}
              className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition"
            >
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-neo-primary" />
                <div className="text-right">
                  <p className="text-sm font-semibold text-neo-secondary">الردود السريعة</p>
                  <p className="text-xs text-neo-secondary/40">
                    {quickReplies.length} رد سريع
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-neo-secondary/30 transition-transform ${
                  quickRepliesExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
            {quickRepliesExpanded && (
              <div className="p-4 space-y-3 border-t border-gray-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newQuickReplyTrigger}
                    onChange={(e) => setNewQuickReplyTrigger(e.target.value)}
                    placeholder="الكلمة المفتاحية"
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={newQuickReplyReply}
                    onChange={(e) => setNewQuickReplyReply(e.target.value)}
                    placeholder="الرد التلقائي"
                    className={inputClass}
                  />
                </div>
                <button
                  onClick={handleAddQuickReply}
                  className="flex items-center gap-2 px-4 py-2.5 bg-neo-primary text-white font-semibold rounded-lg hover:bg-neo-accent transition text-sm"
                >
                  <PlusIcon className="w-4 h-4" />
                  <span>إضافة</span>
                </button>

                {quickReplies.length > 0 && (
                  <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-2">
                    {quickReplies.map((qr) => (
                      <div key={qr.id} className="flex items-center gap-2 p-2.5 bg-gray-50 rounded-lg">
                        <div className="flex-grow min-w-0">
                          <span className="text-xs font-semibold text-neo-primary">
                            /{qr.trigger}
                          </span>
                          <span className="text-xs text-neo-secondary/30 mx-1">&larr;</span>
                          <span className="text-xs text-neo-secondary/60">{qr.reply}</span>
                        </div>
                        <button
                          onClick={() => handleToggleQuickReply(qr.id)}
                          className={`text-xs px-2 py-1 rounded font-medium ${
                            qr.isActive
                              ? 'bg-green-50 text-green-600 border border-green-100'
                              : 'bg-gray-100 text-gray-400 border border-gray-200'
                          }`}
                        >
                          {qr.isActive ? 'مفعّل' : 'معطّل'}
                        </button>
                        <button
                          onClick={() => handleRemoveQuickReply(qr.id)}
                          className="p-1 hover:bg-red-50 rounded transition"
                        >
                          <X className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Send Speed Control */}
          <div className="p-4 bg-gray-50 rounded-xl">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-neo-secondary">سرعة الإرسال</span>
              <span
                className="text-xs font-semibold text-neo-primary font-mono bg-neo-primary/10 px-2 py-0.5 rounded"
                dir="ltr"
              >
                {sendSpeedMs}ms
              </span>
            </div>
            <input
              type="range"
              min={500}
              max={5000}
              step={100}
              value={sendSpeedMs}
              onChange={(e) => handleSendSpeedChange(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-neo-primary"
            />
            <div className="flex justify-between text-xs text-neo-secondary/30 mt-1">
              <span>سريع (500ms)</span>
              <span>بطيء (5000ms)</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default BotAIPage;
