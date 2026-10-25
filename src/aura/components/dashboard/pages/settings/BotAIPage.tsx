'use client';

import React, { useEffect, useState } from 'react';
import {
  Bot, QrCode, Wifi, WifiOff, MessageSquare, Zap, Upload, ChevronDown,
  AlertCircle, Phone, Clock, Settings, Search, Sparkles, ArrowRight, Save, Plus,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { localStoreClient } from '@/aura/services/localStoreClient';

type ConnectionState = 'idle' | 'connecting' | 'qr' | 'connected' | 'reconnecting' | 'needs-attention' | 'paused' | 'stopping' | 'stopped';

const inputClass = 'w-full px-4 py-3 border border-gray-200 rounded-lg bg-white text-neo-secondary text-base disabled:cursor-not-allowed disabled:bg-gray-50';
const buttonClass = 'flex items-center justify-center gap-2 px-4 py-3 bg-neo-primary text-white font-semibold rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]';
const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const unavailable = 'غير متاح حتى إضافة المحرك المحلي';
const AGENT_CONSENT_TEXT = 'هذه الخدمة تعتمد على ربط غير رسمي مع واتساب (WhatsApp Web) وليست منتجاً رسمياً من واتساب أو Meta، وقد يؤدي مخالفة شروط واتساب إلى تقييد الرقم المرتبط أو تعطيله، لذا يُنصح باستخدام رقم مخصص للمطعم. كما تُرسَل نصوص رسائل العملاء إلى خادم الذكاء الاصطناعي الخاص بنا ومزوّد النموذج لمعالجتها. باستمرارك فأنت تقرّ بفهم ذلك وتتحمل مسؤولية الاستخدام.';
const connectionLabels: Record<ConnectionState, string> = {
  idle: 'غير متصل — الخدمة جاهزة لبدء الربط',
  connecting: 'جارٍ الاتصال بخوادم WhatsApp',
  qr: 'بانتظار مسح رمز QR',
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
      <p className="text-sm font-semibold text-amber-800">الربط المحلي جاهز — الوكيل لا يعمل إلا بعد إعداد Gateway وموافقتك</p>
      <p className="text-xs text-amber-700 mt-1">
        تُحفظ جلسة WhatsApp والطلبات محلياً. لا يُرسل رد آلي ولا يُنشأ طلب قبل تفعيلك، ولا يُعتمد الطلب أو يطبع إلا بعد تأكيد صريح من العميل.
      </p>
    </div>
  </div>
);

type AgentSettings = { enabled: boolean; consentVersion: string | null; consentAcceptedAt: number | null; gatewayConfigured: boolean };
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
  const [view, setView] = useState<'overview' | 'personality'>('overview');
  const [connectionTab, setConnectionTab] = useState<'qr' | 'pairing'>('qr');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionState>('idle');
  const [qrPayload, setQrPayload] = useState<string | null>(null);
  const [connectionBusy, setConnectionBusy] = useState(false);
  const [connectionError, setConnectionError] = useState('');
  const [businessHoursExpanded, setBusinessHoursExpanded] = useState(false);
  const [quickRepliesExpanded, setQuickRepliesExpanded] = useState(false);
  const [manualEntryExpanded, setManualEntryExpanded] = useState(false);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>({ enabled: false, consentVersion: null, consentAcceptedAt: null, gatewayConfigured: false });
  const [consentAcknowledged, setConsentAcknowledged] = useState(false);
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentError, setAgentError] = useState('');
  const [conversations, setConversations] = useState<AgentConversation[]>([]);
  const [conversationBusy, setConversationBusy] = useState('');

  useEffect(() => {
    const api = window.electronAPI;
    let active = true;
    const unsubscribeStatus = api?.onWhatsAppStatus(payload => {
      if (!active) return;
      setConnectionStatus(payload.state);
      if (payload.state !== 'qr') setQrPayload(null);
    });
    const unsubscribeQr = api?.onWhatsAppQr(payload => { if (active) setQrPayload(payload); });
    if (api) {
      void api.getWhatsAppStatus().then(snapshot => {
        if (!active) return;
        setConnectionStatus(snapshot.state);
        setQrPayload(snapshot.state === 'qr' ? snapshot.qr : null);
      }).catch(() => { if (active) setConnectionError('تعذر قراءة حالة الاتصال من التطبيق.'); });
    }
    void Promise.all([
      localStoreClient.call<AgentSettings>('whatsapp.agent.settings.get'),
      localStoreClient.call<AgentConversation[]>('whatsapp.conversation.list'),
    ]).then(([settings, rows]) => {
      if (!active) return;
      setAgentSettings(settings);
      setConsentAcknowledged(settings.consentVersion === '1' && Boolean(settings.consentAcceptedAt));
      setConversations(rows);
    }).catch(() => { if (active) setAgentError('تعذر قراءة إعدادات الوكيل من قاعدة البيانات المحلية.'); });
    return () => {
      active = false;
      unsubscribeStatus?.();
      unsubscribeQr?.();
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

  const setAgentEnabled = async (enabled: boolean) => {
    if (enabled && !consentAcknowledged) {
      setAgentError('اقرأ إشعار الخصوصية ووافق عليه أولاً.');
      return;
    }
    if (enabled && !agentSettings.gatewayConfigured) {
      setAgentError('بوابة الذكاء الاصطناعي غير مهيأة؛ لم يتم تفعيل الوكيل.');
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
        ...(enabled ? { consentVersion: '1' } : {}),
      });
      setAgentSettings(current => ({ ...current, ...updated }));
      if (enabled) setConsentAcknowledged(true);
    } catch {
      setAgentError(enabled ? 'تعذر تفعيل الوكيل. لم يتم إرسال رد أو إنشاء طلب.' : 'تعذر إيقاف الوكيل المحلي.');
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
          <InactiveControls>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block text-sm font-semibold text-neo-secondary/80">اسم البوت
                <input type="text" placeholder="مساعد أورا" className={`${inputClass} mt-1.5`} />
              </label>
              <label className="block text-sm font-semibold text-neo-secondary/80">اسم النشاط التجاري
                <input type="text" placeholder="مطعم أورا" className={`${inputClass} mt-1.5`} />
              </label>
            </div>
          </InactiveControls>
        </SectionCard>
        <SectionCard title="تعليمات التشغيل" icon={<Zap className="w-5 h-5 text-neo-primary" />}>
          <InactiveControls>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-neo-secondary/50">التعليمات الأساسية التي تحدد سلوك البوت وشخصيته</p>
              <button type="button" disabled className={buttonClass}><Sparkles className="w-4 h-4" />توليد تلقائي</button>
            </div>
            <textarea aria-label="تعليمات التشغيل" placeholder="اكتب تعليمات تشغيل البوت هنا..." rows={8} className={inputClass} />
          </InactiveControls>
        </SectionCard>
        <SectionCard title="إعدادات الرد" icon={<MessageSquare className="w-5 h-5 text-neo-primary" />}>
          <InactiveControls>
            <InactiveToggle label="استخدام الإيموجي في الردود" />
            <div>
              <p className="text-sm font-semibold text-neo-secondary/80 mb-2">طول الرد</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {['قصير', 'متوسط', 'طويل', 'تلقائي'].map(label => (
                  <button type="button" key={label} disabled className="px-4 py-2.5 rounded-lg text-sm font-semibold border-2 border-gray-200 text-neo-secondary/60 disabled:cursor-not-allowed">{label}</button>
                ))}
              </div>
              <p className="text-xs text-neo-secondary/40 mt-1.5">يحدد مدى تفصيل ردود البوت — غير متاح حالياً</p>
            </div>
          </InactiveControls>
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
          <button type="button" disabled title={unavailable} className={buttonClass}><Save className="w-4 h-4" />حفظ الإعدادات</button>
          <button type="button" onClick={() => setView('overview')} className="px-6 py-3 bg-gray-100 text-neo-secondary font-semibold rounded-lg text-sm">إلغاء</button>
        </div>
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
          <span>اسم البوت: لم يحدد</span><span>النشاط التجاري: لم يحدد</span><span>قاعدة المعرفة: غير موصولة</span>
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
                  disabled={!window.electronAPI || connectionBusy || ['connecting', 'qr', 'connected', 'reconnecting'].includes(connectionStatus)}
                  title={!window.electronAPI ? 'يتطلب تطبيق Aura POS لسطح المكتب' : undefined} className={buttonClass}>
                  <QrCode className="w-5 h-5" />{connectionBusy ? 'جارٍ تنفيذ الطلب…' : connectionStatus === 'needs-attention' || connectionStatus === 'stopped' ? 'إعادة المحاولة' : 'بدء الربط'}
                </button>
                {['connected', 'qr', 'connecting', 'reconnecting', 'needs-attention'].includes(connectionStatus) && (
                  <button type="button" onClick={() => { void disconnectWhatsApp(); }} disabled={connectionBusy}
                    className="flex items-center justify-center gap-2 px-4 py-3 border border-red-200 text-red-600 font-semibold rounded-lg text-sm disabled:opacity-50 min-h-[44px]">
                    فصل الربط
                  </button>
                )}
              </div>
              <p className="mt-4 text-xs text-neo-secondary/50">جلسة الربط محفوظة محلياً. فصل الربط يمسحها ويتطلب مسح QR جديداً.</p>
            </div>
          ) : (
            <InactiveControls>
              <label className="block text-sm font-semibold text-neo-secondary/80">معرف المستخدم (WhatsApp User ID)
                <input type="text" placeholder="غير متاح حالياً" dir="ltr" className={`${inputClass} mt-1.5`} />
              </label>
              <label className="block text-sm font-semibold text-neo-secondary/80">رقم الهاتف (مع رمز الدولة)
                <input type="tel" placeholder="201012345678" dir="ltr" className={`${inputClass} mt-1.5`} />
              </label>
              <button type="button" disabled className={buttonClass}>توليد</button>
              <div className="bg-gray-50 rounded-xl p-5 text-center border border-gray-100">
                <Phone className="w-8 h-8 mx-auto text-gray-300 mb-3" /><p className="text-sm text-neo-secondary/40">توليد كود الاقتران غير متاح حالياً</p>
              </div>
            </InactiveControls>
          )}
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
              عند التفعيل قد تُرسل نصوص الرسائل وسياق المسودة ولقطة من المنيو تشمل الأسعار والتوفر إلى Gateway خارجية تستخدم Gemini. تُحجب أرقام الهواتف ومعرّفات WhatsApp، وقد تتضمن الرسائل عناوين أو معلومات شخصية أخرى. لا يُعتمد على أي سعر يخرجه النموذج؛ يُحسب الملخص من قاعدة البيانات المحلية ولا يُنشأ أو يُطبع طلب قبل تأكيد العميل الصريح.
            </p>
            <label className="flex items-start gap-3 text-sm text-neo-secondary cursor-pointer">
              <input type="checkbox" className="mt-1 h-4 w-4 accent-neo-primary" checked={consentAcknowledged}
                onChange={event => setConsentAcknowledged(event.target.checked)} disabled={agentSettings.enabled || agentBusy} />
              <span>أوافق على إرسال محتوى الرسائل اللازمة إلى بوابة الذكاء الاصطناعي لمعالجة الطلبات، بعد الاطلاع على التنبيه أعلاه.</span>
            </label>
            <p className="text-xs text-neo-secondary/60" role="status">
              حالة Gateway: {agentSettings.gatewayConfigured ? 'الإعداد موجود' : 'غير مهيأ — لن يُفعّل الوكيل'}
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
