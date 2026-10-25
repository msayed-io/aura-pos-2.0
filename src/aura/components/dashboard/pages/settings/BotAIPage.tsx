'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  Bot, QrCode, Wifi, WifiOff, MessageSquare, Zap, Upload, ChevronDown,
  AlertCircle, Phone, Clock, Settings, Search, Sparkles, ArrowRight, Save, Plus, Eye, EyeOff,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { localStoreClient } from '@/aura/services/localStoreClient';
import { useDashboard } from '@/aura/components/dashboard/DashboardContext';

type ConnectionState = 'idle' | 'connecting' | 'qr' | 'pairing' | 'connected' | 'reconnecting' | 'needs-attention' | 'paused' | 'stopping' | 'stopped';

const inputClass = 'w-full px-4 py-3 border border-gray-200 rounded-lg bg-white text-neo-secondary text-base disabled:cursor-not-allowed disabled:bg-gray-50';
const buttonClass = 'flex items-center justify-center gap-2 px-4 py-3 bg-neo-primary text-white font-semibold rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]';
const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const unavailable = 'غير متاح حتى إضافة المحرك المحلي';
const AGENT_CONSENT_TEXT = 'الربط مع WhatsApp غير رسمي وليس منتجاً من Meta، وقد يؤدي الاستخدام إلى تقييد الرقم المرتبط. عند استخدام مفتاح Gemini المحلي، تُرسل Google نصوص الرسائل وسياق المسودة ولقطة من المنيو والأسعار لمعالجة الطلب؛ وقد تستخدم Google بيانات الطبقة المجانية لتحسين منتجاتها. لا تختبر ببيانات عملاء حقيقية. يحجب التطبيق أرقام الهاتف ومعرّفات WhatsApp والبريد المعروفة، لكن قد يبقى الاسم أو العنوان الذي يكتبه العميل داخل نص الرسالة. لا ينشئ التطبيق طلباً أو يطبعه قبل تأكيد العميل الصريح.';
const connectionLabels: Record<ConnectionState, string> = {
  idle: 'غير متصل — الخدمة جاهزة لبدء الربط',
  connecting: 'جارٍ الاتصال بخوادم WhatsApp',
  qr: 'بانتظار مسح رمز QR',
  pairing: 'بانتظار إدخال كود الاقتران',
  connected: 'متصل بـWhatsApp',
  reconnecting: 'انقطع الاتصال — جارٍ إعادة المحاولة',
  'needs-attention': 'يحتاج الربط إلى تدخل',
  paused: 'الاتصال متوقف مؤقتاً',
  stopping: 'جارٍ إيقاف الاتصال',
  stopped: 'الخدمة متوقفة',
};

const AgentInfoNotice = () => (
    <div role="status" className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
    <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
    <div>
      <p className="text-sm font-semibold text-amber-800">الوكيل متوقف افتراضياً — فعّله فقط بعد إعداد Gemini وموافقتك</p>
      <p className="text-xs text-amber-700 mt-1">
        بيانات الاختبار المجانية قد تُستخدم لتحسين منتجات Google؛ استخدم رسائل ومنيو تجريبيين. لا يُنشأ طلب أو يطبع قبل تأكيد صريح من العميل.
      </p>
    </div>
    </div>
  );

function geminiSaveErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('INVALID_GEMINI_API_KEY')) return 'صيغة المفتاح غير مقبولة. انسخه من Google AI Studio دون علامات اقتباس أو مسافات داخلية.';
  if (message.includes('LOCAL_ENCRYPTION_UNAVAILABLE')) return 'ميزة التشفير الآمن غير متاحة في جلسة Windows الحالية؛ لم نحفظ المفتاح.';
  if (message.includes('GEMINI_KEY_STORAGE_FAILED') || message.includes('GEMINI_KEY_ENCRYPTION_FAILED')) return 'تعذرت كتابة المفتاح المشفر في مجلد بيانات Aura. تحقق من صلاحية مجلد المستخدم والمساحة المتاحة.';
  if (message.includes('STOP_AGENT_BEFORE_GEMINI_KEY_CHANGE')) return 'أوقف الوكيل أولاً، ثم احفظ المفتاح أو استبدله.';
  if (message.includes('LOCAL_SERVER_TIMEOUT') || message.includes('INTERNAL_WHATSAPP_TIMEOUT')) return 'تعذر التحقق من حالة الوكيل المحلي؛ لم نبدأ حفظ المفتاح. أعد المحاولة بعد لحظات.';
  return 'تعذر حفظ المفتاح. أُبقيت القيمة في الحقل؛ راجع حالة الوكيل المحلي ثم أعد المحاولة.';
}

function geminiTestFailureMessage(errorCode?: string): string {
  switch (errorCode) {
    case 'INVALID_GEMINI_API_KEY': return 'رفض التطبيق صيغة المفتاح محلياً قبل الوصول إلى Google؛ لذلك لا تعني هذه الرسالة وجود مشكلة في الإنترنت.';
    case 'LOCAL_GEMINI_KEY_REJECTED': return 'رفضت Google المفتاح. راجع أنه من Google AI Studio وأنه صالح وغير محذوف.';
    case 'LOCAL_GEMINI_ACCESS_DENIED': return 'المفتاح وصل إلى Google، لكن لا يملك صلاحية استخدام Gemini API أو أن الخدمة غير مفعّلة للمشروع.';
    case 'LOCAL_GEMINI_RATE_LIMITED': return 'المفتاح مقبول، لكن Google أوقفت الطلب مؤقتاً بسبب حد الاستخدام أو الحصة.';
    case 'LOCAL_GEMINI_MODEL_UNAVAILABLE': return 'النموذج المحدد غير متاح لهذا المفتاح أو المشروع.';
    case 'LOCAL_GEMINI_REQUEST_REJECTED': return 'رفضت Google صيغة طلب الاختبار؛ لم نتمكن من تقييم صلاحية المفتاح من هذه النتيجة.';
    case 'LOCAL_GEMINI_INVALID_RESPONSE': return 'وصل رد من Google لكن صيغته لم تطابق المتوقع؛ تحقق من تحديث التطبيق.';
    case 'LOCAL_GEMINI_SERVICE_UNAVAILABLE':
    case 'LOCAL_GEMINI_UNAVAILABLE': return 'فشل الاتصال قبل وصول رد من Google؛ لا يمكن من هذه النتيجة الحكم على صلاحية المفتاح. افحص الشبكة أو أعد المحاولة.';
    case 'LOCAL_GEMINI_TIMEOUT': return 'انتهت مهلة الاتصال قبل وصول رد من Google؛ لم يتم التحقق من المفتاح. افحص مهلة الشبكة أو VPN/Proxy أو جدار الحماية.';
    case 'LOCAL_GEMINI_DNS_FAILED': return 'تعذر العثور على عنوان خدمة Google عبر DNS؛ هذا فشل في الوصول للشبكة وليس رفضاً للمفتاح.';
    case 'LOCAL_GEMINI_TLS_FAILED': return 'تعذر إنشاء اتصال HTTPS آمن مع Google؛ افحص تاريخ Windows أو فحص HTTPS في برنامج الحماية/Proxy.';
    case 'LOCAL_GEMINI_NETWORK_BLOCKED': return 'تم رفض الاتصال أو قطعه قبل رد Google؛ افحص جدار الحماية أو Proxy/VPN أو الشبكة.';
    case 'LOCAL_GEMINI_NOT_CONFIGURED': return 'اكتب مفتاحاً في الحقل أو احفظ مفتاحاً أولاً لإجراء الاختبار.';
    default: return 'فشل الاختبار دون كشف المفتاح. تحقق من الإنترنت وصلاحية Gemini API أو الحصة ثم أعد المحاولة.';
  }
}

function geminiStorageStatusMessage(errorCode?: string): string {
  if (errorCode === 'LOCAL_ENCRYPTION_UNAVAILABLE') return 'التشفير الآمن غير متاح؛ لن يمكن قراءة المفتاح أو حفظه في هذه الجلسة.';
  if (errorCode === 'GEMINI_KEY_DECRYPT_FAILED' || errorCode === 'GEMINI_KEY_STORAGE_INVALID') return 'يوجد ملف مفتاح محفوظ لكنه تالف أو غير قابل للفك. احذفه وأدخل المفتاح من جديد.';
  if (errorCode === 'GEMINI_KEY_STORAGE_FAILED') return 'تعذر الوصول إلى ملف المفتاح المحلي. تحقق من صلاحية مجلد بيانات Aura.';
  return 'تعذر قراءة حالة المفتاح المحلي؛ لم نعرض أي قيمة سرية.';
}

type AgentSettings = { enabled: boolean; consentVersion: string | null; consentAcceptedAt: number | null; gatewayConfigured: boolean };
type AgentPersonality = { botName: string; businessName: string; tone: 'friendly' | 'professional' | 'concise'; replyLength: 'short' | 'medium' | 'long'; instructions: string; useEmoji: boolean };
const DEFAULT_PERSONALITY: AgentPersonality = { botName: 'مساعد Aura POS', businessName: '', tone: 'friendly', replyLength: 'short', instructions: '', useEmoji: false };
type AgentConversation = {
  conversationId: string; state: 'active' | 'needs_staff'; timestamp: number;
  draft: { status: string; version: number; itemCount: number; total: number; deliveryFeePending?: boolean } | null;
};

const SectionCard = ({ title, icon, children }: {
  title: string; icon: React.ReactNode; children: React.ReactNode;
}) => (
  <section className="bg-white rounded-xl border border-gray-200 p-6">
    <div className="flex items-center gap-2 mb-4">
      {icon}<h2 className="text-base font-bold text-neo-secondary">{title}</h2>
    </div>
    {children}
  </section>
);

const InactiveControls = ({ children }: { children: React.ReactNode }) => (
  <fieldset disabled title={unavailable} className="min-w-0 m-0 p-0 border-0 space-y-4">
    {children}
  </fieldset>
);

const InactiveToggle = ({ label }: { label: string }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-sm font-semibold text-neo-secondary">{label}</span>
    <button type="button" role="switch" aria-checked={false} aria-label={label} disabled title={unavailable}
      className="relative w-11 h-6 rounded-full bg-gray-300 opacity-50 cursor-not-allowed">
      <span className="absolute top-0.5 right-5 w-5 h-5 bg-white rounded-full shadow-sm" />
    </button>
  </div>
);

const BotAIPage: React.FC = () => {
  const { showToast } = useDashboard();
  const [view, setView] = useState<'overview' | 'personality'>('overview');
  const [connectionTab, setConnectionTab] = useState<'qr' | 'pairing'>('qr');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>('idle');
  const connectionStatusRef = useRef<ConnectionState>('idle');
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingRequestPending, setPairingRequestPending] = useState(false);
  const [pairingPhone, setPairingPhone] = useState('');
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [businessHoursExpanded, setBusinessHoursExpanded] = useState(false);
  const [quickRepliesExpanded, setQuickRepliesExpanded] = useState(false);
  const [manualEntryExpanded, setManualEntryExpanded] = useState(false);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>({ enabled: false, consentVersion: null, consentAcceptedAt: null, gatewayConfigured: false });
  const [consentAcknowledged, setConsentAcknowledged] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState('');
  const [personality, setPersonality] = useState<AgentPersonality>(DEFAULT_PERSONALITY);
  const [personalityBusy, setPersonalityBusy] = useState(false);
  const [personalitySaved, setPersonalitySaved] = useState(false);
  const [personalityError, setPersonalityError] = useState('');
  const [geminiKeyInput, setGeminiKeyInput] = useState('');
  const [geminiKeyVisible, setGeminiKeyVisible] = useState(false);
  const [geminiKeyConfigured, setGeminiKeyConfigured] = useState(false);
  const [geminiEncryptionAvailable, setGeminiEncryptionAvailable] = useState(false);
  const [geminiBusy, setGeminiBusy] = useState(false);
  const [geminiTestStatus, setGeminiTestStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [geminiTestErrorCode, setGeminiTestErrorCode] = useState('');
  const [geminiError, setGeminiError] = useState('');
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [conversationBusy, setConversationBusy] = useState('');

  useEffect(() => {
    const api = window.electronAPI;
    let active = true;
    const unsubscribeStatus = api?.onWhatsAppStatus(payload => {
      if (!active) return;
      connectionStatusRef.current = payload.state;
      setConnectionStatus(payload.state);
      if (payload.state !== 'qr') setQrPayload(null);
      if (payload.state !== 'pairing') {
        setPairingCode(null);
        if (payload.state !== 'connecting') setPairingRequestPending(false);
      }
    });
    const unsubscribeQr = api?.onWhatsAppQr(payload => { if (active) setQrPayload(payload); });
    const unsubscribePairingCode = api?.onWhatsAppPairingCode(payload => {
      if (!active) return;
      setPairingCode(payload);
      if (payload !== null || connectionStatusRef.current === 'pairing') setPairingRequestPending(false);
    });
    if (api) {
      void api.getWhatsAppStatus().then(snapshot => {
        if (!active) return;
        connectionStatusRef.current = snapshot.state;
        setConnectionStatus(snapshot.state);
        setQrPayload(snapshot.state === 'qr' ? snapshot.qr : null);
        setPairingCode(snapshot.state === 'pairing' ? snapshot.pairingCode : null);
      }).catch(() => { if (active) setConnectionError('تعذر قراءة حالة الاتصال من التطبيق.'); });
      void api.getGeminiKeyStatus().then(status => {
        if (!active) return;
        setGeminiKeyConfigured(status.configured);
        setGeminiEncryptionAvailable(status.encryptionAvailable);
        if (status.errorCode) setGeminiError(geminiStorageStatusMessage(status.errorCode));
        else if (!status.encryptionAvailable) setGeminiError(geminiStorageStatusMessage('LOCAL_ENCRYPTION_UNAVAILABLE'));
      }).catch(() => { if (active) setGeminiError('تعذر قراءة حالة إعداد Gemini من التطبيق.'); });
    }
    void Promise.all([
      localStoreClient.call<AgentSettings>('whatsapp.agent.settings.get'),
      localStoreClient.call<AgentConversation[]>('whatsapp.conversation.list'),
      localStoreClient.call<AgentPersonality>('whatsapp.agent.personality.get'),
    ]).then(([settings, rows, savedPersonality]) => {
      if (!active) return;
      setAgentSettings(settings);
      setConsentAcknowledged(settings.consentVersion === '2' && Boolean(settings.consentAcceptedAt));
      setConversations(rows);
      setPersonality(savedPersonality);
    }).catch(() => { if (active) setAgentError('تعذر قراءة إعدادات الوكيل من قاعدة البيانات المحلية.'); });
    return () => {
      active = false;
      unsubscribeStatus?.();
      unsubscribeQr?.();
      unsubscribePairingCode?.();
    };
  }, []);

  const startWhatsApp = async () => {
    const api = window.electronAPI;
    if (!api) { setConnectionError('يتطلب ربط WhatsApp تشغيل تطبيق Aura POS لسطح المكتب.'); return; }
    setConnectionBusy(true);
    setConnectionError('');
    try {
      const accepted = await api.connectWhatsApp();
      if (!accepted) setConnectionError('الخدمة المحلية غير جاهزة الآن. أعد المحاولة بعد لحظات.');
    } catch {
      setConnectionError('تعذر بدء اتصال WhatsApp المحلي.');
    } finally {
      setConnectionBusy(false);
    }
  };

  const disconnectWhatsApp = async () => {
    if (!window.confirm('سيتم فصل جهاز WhatsApp ومسح جلسة الربط المحفوظة من هذا الجهاز. هل تريد المتابعة؟')) return;
    const api = window.electronAPI;
    if (!api) return;
    setConnectionBusy(true);
    setPairingRequestPending(false);
    setConnectionError('');
    try {
      const accepted = await api.disconnectWhatsApp();
      if (!accepted) setConnectionError('تعذر إرسال طلب الفصل إلى الخدمة المحلية.');
    } catch {
      setConnectionError('تعذر فصل WhatsApp.');
    } finally {
      setConnectionBusy(false);
    }
  };

  const startPairing = async () => {
    const api = window.electronAPI;
    if (!api) { setConnectionError('يتطلب ربط WhatsApp تشغيل تطبيق Aura POS لسطح المكتب.'); return; }
    if (!/^[1-9][0-9]{7,14}$/.test(pairingPhone)) {
      setConnectionError('اكتب رقمًا دوليًا مع رمز الدولة، أرقامًا فقط ومن دون + أو مسافات.');
      return;
    }
    setConnectionBusy(true);
    setConnectionError('');
    setPairingCode(null);
    setPairingRequestPending(true);
    try {
      const accepted = await api.pairWhatsApp(pairingPhone);
      if (!accepted) {
        setPairingRequestPending(false);
        setConnectionError('تعذر بدء الاقتران الآن. افصل الجلسة الحالية أو انتظر انتهاء إعادة الاتصال ثم حاول مجددًا.');
      }
    } catch {
      setPairingRequestPending(false);
      setConnectionError('تعذر بدء الاقتران المحلي. راجع الرقم وحالة اتصال الإنترنت ثم أعد المحاولة.');
    } finally {
      setConnectionBusy(false);
    }
  };

  const updatePersonality = (value: Partial<AgentPersonality>) => {
    setPersonality(current => ({ ...current, ...value }));
    setPersonalitySaved(false);
    setPersonalityError('');
  };

  const savePersonality = async () => {
    setPersonalityBusy(true);
    setPersonalitySaved(false);
    setPersonalityError('');
    try {
      const saved = await localStoreClient.call<AgentPersonality>('whatsapp.agent.personality.set', personality as unknown as Record<string, unknown>);
      setPersonality(saved);
      setPersonalitySaved(true);
      setView('overview');
      showToast({ message: 'تم حفظ شخصية البوت بنجاح على هذا الجهاز.', type: 'success' });
    } catch {
      setPersonalityError('تعذر حفظ الشخصية محلياً. أوقف الوكيل أولاً وتحقق من أطوال الحقول.');
      showToast({ message: 'تعذر حفظ شخصية البوت؛ بقيت في صفحة التعديل لتصحيح المشكلة.', type: 'error' });
    } finally {
      setPersonalityBusy(false);
    }
  };

  const refreshAgentSettings = async () => {
    const settings = await localStoreClient.call<AgentSettings>('whatsapp.agent.settings.get');
    setAgentSettings(settings);
  };

  const saveGeminiKey = async () => {
    const api = window.electronAPI;
    if (!api) { setGeminiError('حفظ المفتاح متاح في تطبيق سطح المكتب فقط.'); return; }
    if (!geminiKeyInput.trim()) { setGeminiError('اكتب مفتاح Gemini أولاً.'); return; }
    setGeminiBusy(true);
    setGeminiError('');
    setGeminiTestStatus('idle');
    setGeminiTestErrorCode('');
    try {
      const saved = await api.saveGeminiApiKey(geminiKeyInput.trim());
      setGeminiKeyInput('');
      setGeminiKeyConfigured(saved.configured);
      if (saved.synced) setAgentSettings(current => ({ ...current, gatewayConfigured: true }));
      try { await refreshAgentSettings(); } catch { /* A completed encrypted write is still a successful save. */ }
      showToast({
        message: saved.synced === false
          ? 'حُفظ مفتاح Gemini مشفراً محلياً؛ ستتم مزامنته مع الخدمة المحلية عند المحاولة التالية.'
          : 'تم حفظ مفتاح Gemini مشفراً على هذا الجهاز بنجاح.',
        type: saved.synced === false ? 'info' : 'success',
      });
    } catch (error) {
      setGeminiError(geminiSaveErrorMessage(error));
    } finally {
      setGeminiBusy(false);
    }
  };

  const clearGeminiKey = async () => {
    const api = window.electronAPI;
    if (!api || !window.confirm('سيُحذف مفتاح Gemini المشفّر من هذا الجهاز. هل تريد المتابعة؟')) return;
    setGeminiBusy(true);
    setGeminiError('');
    setGeminiTestStatus('idle');
    setGeminiTestErrorCode('');
    try {
      const cleared = await api.clearGeminiApiKey();
      setGeminiKeyConfigured(false);
      setGeminiKeyInput('');
      try { await refreshAgentSettings(); } catch { /* Keep the local deletion result authoritative. */ }
      showToast({
        message: cleared.synced === false ? 'حُذف المفتاح محلياً؛ ستتم مزامنة الإزالة عند المحاولة التالية.' : 'تم حذف مفتاح Gemini من هذا الجهاز.',
        type: cleared.synced === false ? 'info' : 'success',
      });
    } catch {
      setGeminiError('تعذر حذف المفتاح. أوقف الوكيل أولاً ثم حاول مرة أخرى.');
    } finally {
      setGeminiBusy(false);
    }
  };

  const testGeminiKey = async () => {
    const api = window.electronAPI;
    if (!api) { setGeminiError('اختبار Gemini متاح في تطبيق سطح المكتب فقط.'); return; }
    setGeminiBusy(true);
    setGeminiError('');
    setGeminiTestStatus('idle');
    setGeminiTestErrorCode('');
    try {
      const result = await api.testGeminiApiKey(geminiKeyInput.trim() || undefined);
      setGeminiTestStatus(result.ok ? 'success' : 'failed');
      setGeminiTestErrorCode(result.errorCode || '');
      if (result.ok) setAgentSettings(current => ({ ...current, gatewayConfigured: true }));
    } catch (error) {
      setGeminiTestStatus('failed');
      const errorMessage = typeof error === 'object' && error !== null && 'message' in error
        && typeof error.message === 'string' ? error.message : '';
      setGeminiTestErrorCode(errorMessage.includes('INVALID_GEMINI_API_KEY')
        ? 'INVALID_GEMINI_API_KEY' : 'LOCAL_GEMINI_UNAVAILABLE');
    } finally {
      try { await refreshAgentSettings(); } catch { /* The provider result remains visible if the local status refresh fails. */ }
      setGeminiBusy(false);
    }
  };

  const setAgentEnabled = async (enabled: boolean) => {
    if (enabled && !consentAcknowledged) {
      setAgentError('اقرأ إشعار الخصوصية ووافق عليه أولاً.');
      return;
    }
    if (enabled && !agentSettings.gatewayConfigured) {
      setAgentError('لم يتم حفظ مفتاح Gemini أو تهيئة Gateway؛ لم يتم تفعيل الوكيل.');
      return;
    }
    if (enabled && !agentSettings.consentAcceptedAt && !window.confirm(AGENT_CONSENT_TEXT)) {
      setAgentError('لم يتم تفعيل الوكيل لأن الموافقة لم تُقبل.');
      return;
    }
    setAgentBusy(true);
    setAgentError('');
    try {
      const updated = await localStoreClient.call<AgentSettings>('whatsapp.agent.settings.set', {
        enabled,
        ...(enabled ? { consentVersion: '2' } : {}),
      });
      setAgentSettings(current => ({ ...current, ...updated }));
      if (enabled) setConsentAcknowledged(true);
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      setAgentError(enabled && code === 'GATEWAY_NOT_CONFIGURED'
        ? 'الخدمة المحلية لا ترى مفتاح Gemini بعد. احفظ المفتاح مجدداً وتأكد من اكتمال المزامنة.'
        : enabled && code === 'AGENT_ENABLED'
          ? 'الوكيل مفعّل بالفعل؛ حدّث حالة الصفحة قبل تغيير الإعدادات.'
          : enabled ? 'تعذر تفعيل الوكيل. راجع حالة الإعداد والموافقة؛ لم يتم إرسال رد أو إنشاء طلب.' : 'تعذر إيقاف الوكيل المحلي.');
    } finally {
      setAgentBusy(false);
    }
  };

  const refreshConversations = async () => {
    const rows = await localStoreClient.call<AgentConversation[]>('whatsapp.conversation.list');
    setConversations(rows);
  };

  const setConversationState = async (conversationId: string, action: 'whatsapp.conversation.handoff' | 'whatsapp.conversation.resume') => {
    setConversationBusy(conversationId);
    setAgentError('');
    try {
      await localStoreClient.call(action, { conversationId });
      await refreshConversations();
    } catch {
      setAgentError('تعذر تحديث حالة المحادثة.');
    } finally {
      setConversationBusy('');
    }
  };

  if (view === 'personality') {
    return (
      <div className="flex flex-col gap-5" dir="rtl">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setView('overview')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 text-neo-secondary/60">
            <ArrowRight className="w-5 h-5" /><span className="text-sm font-semibold">رجوع</span>
          </button>
          <h1 className="text-xl font-bold text-neo-secondary flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-neo-primary" />شخصية البوت
          </h1>
        </div>
        <AgentInfoNotice />
        <SectionCard title="المعلومات الأساسية" icon={<Bot className="w-5 h-5 text-neo-primary" />}>
          <fieldset disabled={agentSettings.enabled || personalityBusy} className="min-w-0 m-0 p-0 border-0 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block text-sm font-semibold text-neo-secondary/80">اسم البوت
                <input type="text" maxLength={80} value={personality.botName} onChange={event => updatePersonality({ botName: event.target.value })} className={`${inputClass} mt-1.5`} />
              </label>
              <label className="block text-sm font-semibold text-neo-secondary/80">اسم النشاط التجاري
                <input type="text" maxLength={100} value={personality.businessName} onChange={event => updatePersonality({ businessName: event.target.value })} className={`${inputClass} mt-1.5`} />
              </label>
            </div>
          </fieldset>
        </SectionCard>
        <SectionCard title="تعليمات التشغيل" icon={<Zap className="w-5 h-5 text-neo-primary" />}>
          <p className="text-xs text-neo-secondary/60 mb-3">تفضيلات أسلوبية فقط؛ لا يمكنها إلغاء تأكيد العميل أو قواعد الأسعار والطلبات. بحد أقصى 2000 حرف.</p>
          <textarea aria-label="تعليمات التشغيل" value={personality.instructions} maxLength={2000} onChange={event => updatePersonality({ instructions: event.target.value })} placeholder="مثال: استخدم لهجة ودودة، وأجب باختصار..." rows={6} disabled={agentSettings.enabled || personalityBusy} className={inputClass} />
        </SectionCard>
        <SectionCard title="إعدادات الرد" icon={<MessageSquare className="w-5 h-5 text-neo-primary" />}>
          <fieldset disabled={agentSettings.enabled || personalityBusy} className="min-w-0 m-0 p-0 border-0 space-y-4">
            <label className="flex items-center justify-between gap-3 text-sm font-semibold text-neo-secondary">
              <span>استخدام الإيموجي باعتدال</span>
              <input type="checkbox" checked={personality.useEmoji} onChange={event => updatePersonality({ useEmoji: event.target.checked })} className="h-5 w-5 accent-neo-primary" />
            </label>
            <label className="block text-sm font-semibold text-neo-secondary/80">نبرة الرد
              <select value={personality.tone} onChange={event => updatePersonality({ tone: event.target.value as AgentPersonality['tone'] })} className={`${inputClass} mt-1.5`}>
                <option value="friendly">ودودة</option><option value="professional">مهنية</option><option value="concise">مباشرة ومختصرة</option>
              </select>
            </label>
            <div>
              <p className="text-sm font-semibold text-neo-secondary/80 mb-2">طول الرد</p>
              <div className="grid grid-cols-3 gap-2">
                {([{ value: 'short', label: 'قصير' }, { value: 'medium', label: 'متوسط' }, { value: 'long', label: 'طويل' }] as const).map(option => (
                  <button type="button" key={option.value} onClick={() => updatePersonality({ replyLength: option.value })} aria-pressed={personality.replyLength === option.value}
                    className={`px-4 py-2.5 rounded-lg text-sm font-semibold border-2 ${personality.replyLength === option.value ? 'border-neo-primary bg-neo-primary/5 text-neo-primary' : 'border-gray-200 text-neo-secondary/70'}`}>{option.label}</button>
                ))}
              </div>
            </div>
          </fieldset>
        </SectionCard>
        <SectionCard title="قاعدة المعرفة" icon={<Search className="w-5 h-5 text-neo-primary" />}>
          <InactiveControls>
            <div className="relative border-2 border-dashed rounded-xl p-8 text-center border-gray-300 bg-gray-50/50">
              <Upload className="w-6 h-6 text-gray-400 mx-auto mb-3" />
              <label className="block text-sm font-semibold text-neo-secondary">رفع ملفات قاعدة المعرفة
                <input type="file" disabled multiple accept=".pdf,.txt,.docx,.csv,.doc,.rtf,.md,.json,.xlsx,.xls" className="block max-w-full mx-auto mt-3 text-xs" />
              </label>
              <p className="text-xs text-neo-secondary/50 mt-2">رفع الملفات والسحب والإفلات غير متاحين حالياً</p>
            </div>
          </InactiveControls>
          <button type="button" onClick={() => setManualEntryExpanded(!manualEntryExpanded)} aria-expanded={manualEntryExpanded} aria-controls="bot-manual-knowledge"
            className="flex items-center gap-2 text-sm font-semibold text-neo-primary mt-4">
            <Plus className="w-4 h-4" />إضافة معرفة يدوياً<ChevronDown className="w-4 h-4" />
          </button>
          {manualEntryExpanded && (
            <div id="bot-manual-knowledge" className="mt-3">
              <InactiveControls>
                <input aria-label="عنوان المعرفة" type="text" placeholder="عنوان المعرفة" className={inputClass} />
                <textarea aria-label="محتوى المعرفة" placeholder="محتوى المعرفة" rows={4} className={inputClass} />
                <button type="button" disabled className={buttonClass}><Plus className="w-4 h-4" />إضافة المعرفة</button>
              </InactiveControls>
            </div>
          )}
          <p className="text-sm text-neo-secondary/40 text-center py-6 mt-2">لا توجد قاعدة معرفة موصولة حالياً.</p>
        </SectionCard>
        <div className="flex items-center gap-3 pt-2">
          <button type="button" onClick={() => { void savePersonality(); }} disabled={personalityBusy || agentSettings.enabled} className={buttonClass}><Save className="w-4 h-4" />{personalityBusy ? 'جارٍ الحفظ…' : 'حفظ الشخصية'}</button>
          <button type="button" onClick={() => setView('overview')} className="px-6 py-3 bg-gray-100 text-neo-secondary font-semibold rounded-lg text-sm">إلغاء</button>
        </div>
        {personalitySaved && <p role="status" className="text-sm text-green-700">تم حفظ الشخصية على هذا الجهاز.</p>}
        {agentSettings.enabled && <p className="text-sm text-amber-700">أوقف الوكيل قبل تعديل الشخصية.</p>}
        {personalityError && <p role="alert" className="text-sm text-red-600">{personalityError}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold text-neo-secondary flex items-center gap-2"><Bot className="w-7 h-7 text-neo-primary" />البوت والذكاء الاصطناعي</h1>
        <p className="text-sm text-neo-secondary/50 mt-1">إعدادات واتساب بوت، الرد التلقائي، وقاعدة المعرفة</p>
      </div>
      <AgentInfoNotice />
      <section className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-neo-primary/10 flex items-center justify-center flex-shrink-0"><Sparkles className="w-5 h-5 text-neo-primary" /></div>
          <div className="flex-grow min-w-0">
            <h2 className="text-base font-bold text-neo-secondary">شخصية البوت</h2>
            <p className="text-xs text-neo-secondary/50 mt-0.5">تخصيص شخصية البوت، تعليمات التشغيل، وقاعدة المعرفة</p>
          </div>
          <button type="button" onClick={() => setView('personality')} className="text-xs font-semibold text-neo-primary px-3 py-1.5 rounded-lg hover:bg-neo-primary/5">تعديل</button>
        </div>
        <div className="flex flex-wrap items-center gap-5 mt-4 pt-3 border-t border-gray-100 text-xs text-neo-secondary/40">
          <span>اسم البوت: {personality.botName || 'لم يحدد'}</span><span>النشاط التجاري: {personality.businessName || 'لم يحدد'}</span><span>قاعدة المعرفة: غير موصولة</span>
        </div>
      </section>
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${connectionStatus === 'connected' ? 'bg-green-50' : 'bg-red-50'}`}>
            {connectionStatus === 'connected' ? <Wifi className="w-5 h-5 text-green-600" /> : <WifiOff className="w-5 h-5 text-red-400" />}
          </div>
          <div><h2 className="text-base font-bold text-neo-secondary">اتصال WhatsApp</h2><p className={`text-sm font-semibold ${connectionStatus === 'connected' ? 'text-green-600' : 'text-red-500'}`} role="status" aria-live="polite">{window.electronAPI ? connectionLabels[connectionStatus] : 'غير متاح في المتصفح — استخدم تطبيق Aura POS لسطح المكتب'}</p></div>
        </div>
        <div className="p-5">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg mb-5" role="group" aria-label="طريقة ربط واتساب">
            {(['qr', 'pairing'] as const).map(tab => (
              <button type="button" key={tab} onClick={() => setConnectionTab(tab)} aria-pressed={connectionTab === tab}
                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold rounded-md min-h-[44px] ${connectionTab === tab ? 'bg-white text-neo-primary shadow-sm' : 'text-neo-secondary/50'}`}>
                {tab === 'qr' ? <QrCode className="w-4 h-4" /> : <Phone className="w-4 h-4" />}{tab === 'qr' ? 'رمز QR' : 'رقم الهاتف'}
              </button>
            ))}
          </div>
          {connectionTab === 'qr' ? (
            <div className="py-8 text-center">
              {connectionStatus === 'qr' && qrPayload ? (
                <div className="inline-flex flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <QRCodeSVG value={qrPayload} size={240} level="M" marginSize={4} title="رمز ربط WhatsApp" />
                  <p className="max-w-xs text-sm font-semibold text-neo-secondary">افتح WhatsApp على هاتفك وامسح الرمز الآن. يتجدد الرمز تلقائياً عند الحاجة.</p>
                </div>
              ) : (
                <>
                  <QrCode className="w-14 h-14 mx-auto text-gray-300 mb-4" />
                  <p className="text-neo-secondary/70 mb-1 text-base font-semibold">ربط WhatsApp عبر رمز QR</p>
                  <p className="text-sm text-neo-secondary/50 mb-5">{connectionStatus === 'connected' ? 'تم ربط الجهاز؛ لا حاجة لمسح الرمز مرة أخرى.' : connectionStatus === 'connecting' ? 'جارٍ تجهيز اتصال آمن للحصول على رمز QR…' : 'ابدأ الربط لطلب رمز QR من WhatsApp.'}</p>
                </>
              )}
              {connectionError && <p role="alert" className="text-sm text-red-600 mb-4">{connectionError}</p>}
              <div className="flex flex-wrap justify-center gap-3">
                <button type="button" onClick={startWhatsApp}
                  disabled={!window.electronAPI || connectionBusy || ['connecting', 'qr', 'pairing', 'connected', 'reconnecting'].includes(connectionStatus)}
                  title={!window.electronAPI ? 'يتطلب تطبيق Aura POS لسطح المكتب' : undefined} className={buttonClass}>
                  <QrCode className="w-5 h-5" />{connectionBusy ? 'جارٍ تنفيذ الطلب…' : connectionStatus === 'needs-attention' || connectionStatus === 'stopped' ? 'إعادة المحاولة' : 'بدء الربط'}
                </button>
                {['connected', 'qr', 'pairing', 'connecting', 'reconnecting', 'needs-attention'].includes(connectionStatus) && (
                  <button type="button" onClick={() => { void disconnectWhatsApp(); }} disabled={connectionBusy}
                    className="flex items-center justify-center gap-2 px-4 py-3 border border-red-200 text-red-600 font-semibold rounded-lg text-sm disabled:opacity-50 min-h-[44px]">
                    فصل الربط
                  </button>
                )}
              </div>
              <p className="mt-4 text-xs text-neo-secondary/50">جلسة الربط محفوظة محلياً. فصل الربط يمسحها ويتطلب مسح QR جديداً.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-neo-secondary/80">رقم الهاتف مع رمز الدولة
                <input type="tel" inputMode="numeric" autoComplete="tel" placeholder="201012345678" dir="ltr" maxLength={15} value={pairingPhone} onChange={event => setPairingPhone(event.target.value)} className={`${inputClass} mt-1.5`} />
              </label>
              <p className="text-xs text-neo-secondary/60">اكتب الرقم الدولي بأرقام فقط، دون علامة + أو مسافات. مثال مصر: 201012345678.</p>
              {connectionError && <p role="alert" className="text-sm text-red-600">{connectionError}</p>}
              <div className="text-center rounded-xl border border-gray-200 bg-gray-50 p-5">
                {connectionStatus === 'pairing' && pairingCode ? (
                  <>
                    <p className="text-sm text-neo-secondary/70 mb-2">أدخل هذا الرمز في WhatsApp على الهاتف المرتبط بهذا الرقم:</p>
                    <p dir="ltr" className="text-3xl tracking-[0.35em] font-bold text-neo-primary" aria-label="كود اقتران WhatsApp" role="status">{pairingCode}</p>
                    <p className="text-xs text-neo-secondary/60 mt-3">افتح الأجهزة المرتبطة واختر الربط برقم الهاتف. يخفي التطبيق الرمز بعد 30 ثانية لتجنب عرض رمز قديم؛ أدخله فوراً لأن WhatsApp قد يرفضه قبل ذلك.</p>
                  </>
                ) : (
                  <>
                    <Phone className="w-8 h-8 mx-auto text-gray-400 mb-3" />
                    <p className="text-sm font-semibold text-neo-secondary">{connectionStatus === 'pairing' ? pairingRequestPending ? 'جارٍ طلب كود الاقتران من WhatsApp…' : 'اختفى الرمز أو لم يظهر؛ يمكنك طلب رمز جديد.' : connectionStatus === 'connected' ? 'هذا الجهاز مرتبط بالفعل.' : 'أدخل رقم الهاتف ثم اطلب كود الاقتران.'}</p>
                  </>
                )}
              </div>
              <button type="button" onClick={() => { void startPairing(); }} disabled={!window.electronAPI || connectionBusy || pairingRequestPending || !(['idle', 'needs-attention', 'stopped'].includes(connectionStatus) || (connectionStatus === 'pairing' && !pairingCode))} className={buttonClass}>
                <Phone className="w-4 h-4" />{connectionBusy || pairingRequestPending ? 'جارٍ طلب الكود…' : connectionStatus === 'pairing' ? 'طلب رمز جديد' : 'توليد كود الاقتران'}
              </button>
            </div>
          )}
        </div>
      </section>
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center gap-3"><Sparkles className="w-5 h-5 text-neo-primary" /><h2 className="text-base font-bold text-neo-secondary">مفتاح Gemini المحلي — اختبار</h2></div>
        <div className="p-5 space-y-4">
          <p className="text-xs leading-6 text-neo-secondary/70">أدخل مفتاح Google AI Studio الخاص بك. يُحفظ محلياً مشفراً بنظام Windows، ولا يُعرض بعد الحفظ ولا يُكتب في السجلات أو إعدادات التطبيق. النموذج المختار: <span dir="ltr" className="font-semibold">Gemini 3.8 Flash</span>.</p>
          <label className="block text-sm font-semibold text-neo-secondary/80">مفتاح Gemini API
            <div className="relative mt-1.5">
              <input type={geminiKeyVisible ? 'text' : 'password'} autoComplete="off" spellCheck={false} value={geminiKeyInput} onChange={event => { setGeminiKeyInput(event.target.value); setGeminiTestStatus('idle'); setGeminiTestErrorCode(''); setGeminiError(''); }} disabled={!window.electronAPI || !geminiEncryptionAvailable || geminiBusy || agentSettings.enabled} placeholder={geminiKeyConfigured ? 'مفتاح محفوظ — اكتب قيمة جديدة للاستبدال' : 'ألصق مفتاح API هنا'} dir="ltr" aria-label="مفتاح Gemini API" className={`${inputClass} pl-12 font-mono`} />
              <button type="button" onClick={() => setGeminiKeyVisible(visible => !visible)} aria-label={geminiKeyVisible ? 'إخفاء المفتاح' : 'إظهار المفتاح'} title={geminiKeyVisible ? 'إخفاء المفتاح' : 'إظهار المفتاح'} className="absolute left-3 top-1/2 -translate-y-1/2 p-2 text-neo-secondary/60 hover:text-neo-primary" aria-pressed={geminiKeyVisible}>
                {geminiKeyVisible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => { void saveGeminiKey(); }} disabled={!window.electronAPI || !geminiEncryptionAvailable || geminiBusy || agentSettings.enabled || !geminiKeyInput.trim()} className={buttonClass}>{geminiBusy ? 'جارٍ التنفيذ…' : 'حفظ المفتاح محلياً'}</button>
            <button type="button" onClick={() => { void testGeminiKey(); }} disabled={!window.electronAPI || (!geminiKeyConfigured && !geminiKeyInput.trim()) || geminiBusy || agentSettings.enabled} className="px-4 py-3 border border-gray-200 text-neo-secondary font-semibold rounded-lg text-sm disabled:opacity-50">{geminiBusy ? 'جارٍ التنفيذ…' : 'اختبار الاتصال (طلب تجريبي)'}</button>
            <button type="button" onClick={() => { void clearGeminiKey(); }} disabled={!window.electronAPI || !geminiKeyConfigured || geminiBusy || agentSettings.enabled} className="px-4 py-3 border border-red-200 text-red-600 font-semibold rounded-lg text-sm disabled:opacity-50">حذف المفتاح</button>
          </div>
          <p className="text-xs text-neo-secondary/60">{geminiKeyConfigured ? 'يوجد مفتاح محفوظ مشفراً على هذا الجهاز؛ لن نعيد عرضه.' : 'لا يوجد مفتاح Gemini محفوظ على هذا الجهاز.'} {geminiEncryptionAvailable ? 'التخزين المشفر متاح.' : 'التخزين المشفر غير متاح؛ لن يمكن حفظ المفتاح بأمان.'}</p>
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">زر الاختبار يرسل مفتاح API في طلب HTTPS وطلباً اصطناعياً فقط إلى Google؛ لا يحتوي على رسالة عميل أو منيو. عند تشغيل الوكيل تُرسل نصوص رسائل WhatsApp وسياق الطلب والمنيو والأسعار إلى Google؛ يحجب التطبيق أرقام الهاتف ومعرّفات WhatsApp والبريد المعروفة، لكن قد تبقى أسماء أو عناوين يذكرها العميل داخل النص. قد تستخدم Google بيانات الطبقة المجانية لتحسين منتجاتها؛ استخدم بيانات وهمية للاختبار.</p>
          {geminiTestStatus === 'success' && <p role="status" className="text-sm text-green-700">نجح الاتصال بالنموذج المحدد.</p>}
          {geminiTestStatus === 'failed' && <p role="status" className="text-sm text-red-600">{geminiTestFailureMessage(geminiTestErrorCode)}</p>}
          {geminiError && <p role="alert" className="text-sm text-red-600">{geminiError}</p>}
        </div>
      </section>
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center gap-3"><Settings className="w-5 h-5 text-neo-primary" /><h2 className="text-base font-bold text-neo-secondary">لوحة التحكم</h2></div>
        <div className="p-5 space-y-4">
          <div className="p-4 bg-gray-50 rounded-xl space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-neo-secondary">وكيل الطلبات بالذكاء الاصطناعي</p>
                <p className="text-xs text-neo-secondary/60 mt-1">{agentSettings.enabled ? 'مفعّل بعد موافقتك' : 'متوقف'}</p>
              </div>
              {agentSettings.enabled ? (
                <button type="button" onClick={() => { void setAgentEnabled(false); }} disabled={agentBusy}
                  className="px-4 py-2 border border-red-200 text-red-600 rounded-lg text-sm font-semibold disabled:opacity-50">إيقاف الوكيل</button>
              ) : (
                <button type="button" onClick={() => { void setAgentEnabled(true); }} disabled={agentBusy || !consentAcknowledged || !agentSettings.gatewayConfigured}
                  className={`${buttonClass} py-2.5`}>تفعيل الوكيل</button>
              )}
            </div>
            <p className="text-xs text-neo-secondary/70 leading-6">
              عند التفعيل تُرسل Google نص الرسائل وسياق المسودة ولقطة من المنيو تشمل الأسعار والتوفر عبر مفتاح Gemini المحلي؛ وإذا لم يوجد مفتاح محلي فقد تُرسل إلى Gateway المهيأة. تُحجب أرقام الهواتف ومعرّفات WhatsApp، لكن قد تتضمن الرسائل عناوين أو معلومات شخصية أخرى. قد تستخدم Google بيانات الطبقة المجانية لتحسين منتجاتها، لذا اختبر ببيانات وهمية. الأسعار والإجمالي تُحسب محلياً، ولا يُنشأ أو يُطبع طلب قبل تأكيد العميل الصريح.
            </p>
            <label className="flex items-start gap-3 text-sm text-neo-secondary cursor-pointer">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-neo-primary" checked={consentAcknowledged}
                onChange={event => setConsentAcknowledged(event.target.checked)} disabled={agentSettings.enabled || agentBusy} />
              <span>أوافق على إرسال المحتوى الضروري إلى Google Gemini أو Gateway المهيأة لمعالجة الطلبات، بعد الاطلاع على التنبيه أعلاه.</span>
            </label>
            <p className="text-xs text-neo-secondary/60" role="status">
              حالة إعداد الذكاء الاصطناعي: {agentSettings.gatewayConfigured
                ? consentAcknowledged ? 'الإعداد موجود؛ يمكنك تفعيل الوكيل بعد موافقتك.' : 'الإعداد موجود؛ اقرأ التنبيه وحدد مربع الموافقة أولاً، ثم اضغط تفعيل الوكيل.'
                : 'غير مهيأ — لن يُفعّل الوكيل. احفظ المفتاح وتأكد من اكتمال مزامنته مع الخدمة المحلية.'}
            </p>
            {agentError && <p role="alert" className="text-sm text-red-600">{agentError}</p>}
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button type="button" onClick={() => setBusinessHoursExpanded(!businessHoursExpanded)} aria-expanded={businessHoursExpanded} aria-controls="bot-business-hours" className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100">
              <span className="flex items-center gap-3 text-sm font-semibold"><Clock className="w-5 h-5 text-neo-primary" />ساعات العمل</span><ChevronDown className={`w-4 h-4 ${businessHoursExpanded ? 'rotate-180' : ''}`} />
            </button>
            {businessHoursExpanded && (
              <div id="bot-business-hours" className="p-4 border-t border-gray-200">
                <InactiveControls>
                  <InactiveToggle label="تفعيل ساعات العمل" />
                  <div className="grid grid-cols-2 gap-3">
                    <label className="text-sm">من<input type="time" className={inputClass} dir="ltr" /></label>
                    <label className="text-sm">إلى<input type="time" className={inputClass} dir="ltr" /></label>
                  </div>
                  <p className="text-xs font-semibold text-neo-secondary/70">أيام العمل</p>
                  <div className="flex flex-wrap gap-1.5">{days.map(day => <button type="button" key={day} disabled className="px-2.5 py-1.5 text-xs font-semibold rounded-md bg-gray-100 text-neo-secondary/40">{day}</button>)}</div>
                </InactiveControls>
              </div>
            )}
          </div>
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button type="button" onClick={() => setQuickRepliesExpanded(!quickRepliesExpanded)} aria-expanded={quickRepliesExpanded} aria-controls="bot-quick-replies" className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100">
              <span className="flex items-center gap-3 text-sm font-semibold"><Zap className="w-5 h-5 text-neo-primary" />الردود السريعة</span><ChevronDown className={`w-4 h-4 ${quickRepliesExpanded ? 'rotate-180' : ''}`} />
            </button>
            {quickRepliesExpanded && (
              <div id="bot-quick-replies" className="p-4 border-t border-gray-200">
                <InactiveControls>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input aria-label="الكلمة المفتاحية" type="text" placeholder="الكلمة المفتاحية" className={inputClass} />
                    <input aria-label="الرد التلقائي" type="text" placeholder="الرد التلقائي" className={inputClass} />
                  </div>
                  <button type="button" disabled className={buttonClass}><Plus className="w-4 h-4" />إضافة</button>
                  <p className="text-xs text-neo-secondary/40">لا توجد ردود سريعة موصولة حالياً</p>
                </InactiveControls>
              </div>
            )}
          </div>
          <div className="p-4 bg-gray-50 rounded-xl">
            <InactiveControls>
              <label className="block text-sm font-semibold">سرعة الإرسال
                <input aria-label="سرعة الإرسال" type="range" min="1" max="10" disabled className="w-full mt-3" />
              </label>
              <p className="text-xs text-neo-secondary/40">التحكم في سرعة الإرسال غير متاح حالياً</p>
            </InactiveControls>
          </div>
        </div>
      </section>
      <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="p-5 border-b border-gray-100 flex items-center gap-3">
          <MessageSquare className="w-5 h-5 text-neo-primary" /><h2 className="text-base font-bold text-neo-secondary">محادثات واتساب</h2>
        </div>
        <div className="p-5 space-y-3">
          {conversations.length === 0 ? (
            <p className="text-sm text-neo-secondary/50">لا توجد محادثات محلية حتى الآن.</p>
          ) : conversations.map(conversation => (
            <div key={conversation.conversationId} className="flex flex-wrap items-center justify-between gap-3 border border-gray-100 rounded-lg p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-neo-secondary">محادثة محلية •••{conversation.conversationId.slice(-6)}</p>
                <p className="text-xs text-neo-secondary/60 mt-1">
                  {conversation.state === 'needs_staff' ? 'تنتظر موظفاً' : 'نشطة'}
                  {conversation.draft ? ` · مسودة ${conversation.draft.itemCount} أصناف · ${conversation.draft.deliveryFeePending ? 'رسوم التوصيل غير محسوبة' : `${Number(conversation.draft.total || 0).toLocaleString('ar-EG')} ج.م`}` : ''}
                </p>
              </div>
              <button type="button" disabled={conversationBusy === conversation.conversationId}
                onClick={() => { void setConversationState(conversation.conversationId, conversation.state === 'needs_staff' ? 'whatsapp.conversation.resume' : 'whatsapp.conversation.handoff'); }}
                className="px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-neo-primary disabled:opacity-50">
                {conversation.state === 'needs_staff' ? 'استئناف الوكيل' : 'تحويل لموظف'}
              </button>
            </div>
          ))}
          {agentError && <p role="alert" className="text-sm text-red-600">{agentError}</p>}
        </div>
      </section>
    </div>
  );
};

export default BotAIPage;
