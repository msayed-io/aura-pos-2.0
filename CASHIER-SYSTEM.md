# وثائق نظام الكاشير — تكامل WAKZ مع Aura POS 2.0

> **آخر تحديث:** مارس 2026
> **الإصدار:** 2.0
> **الحالة:** مُنتَج — يعمل في بيئة الإنتاج

---

## جدول المحتويات

1. [نظرة عامة](#1-نظرة-عامة)
2. [البنية المعمارية](#2-البنية-المعمارية)
3. [نقاط نهاية WAKZ API](#3-نقاط-نهاية-wakz-api)
4. [تدفقات الاتصال](#4-تدفقات-الاتصال)
5. [الإعدادات المحلية (localStorage)](#5-الإعدادات-المحلية-localstorage)
6. [تعيين حالات الاتصال](#6-تعيين-حالات-الاتصال)
7. [تطبيع استجابات البيانات (Data Envelope Normalization)](#7-تطبيع-استجابات-البيانات-data-envelope-normalization)
8. [الأمان والحماية](#8-الأمان-والحماية)
9. [مشاكل معروفة وملاحظات مهمة](#9-مشاكل-معروفة-وملاحظات-مهمة)
10. [مرجع الأنواع (TypeScript Types)](#10-مرجع-الأنواع-typescript-types)
11. [دليل استكشاف الأخطاء وإصلاحها](#11-دليل-استكشاف-الأخطاء-وإصلاحها)

---

## 1. نظرة عامة

نظام **Aura POS 2.0** يتكامل مع **WAKZ** (WhatsApp as a Service) لإدارة بوت واتساب ذكي. يتيح هذا التكامل:

- **ربط واتساب** عبر رمز QR أو كود الاقتران (Pairing Code)
- **تهيئة شخصية البوت** (W-DNA) — الاسم، التعليمات الأساسية، نبرة المحادثة
- **إدارة قاعدة المعرفة** — رفع ملفات أو إضافة إدخالات يدوية
- **الرد التلقائي** — تشغيل/إيقاف البوت عن الرد على الرسائل
- **إدارة الـ Webhooks** — استقبال أحداث مثل طلبات جديدة، رسائل واردة، تغيير حالة الاتصال
- **إرسال واستقبال الرسائل** عبر واتساب

### المكونات الرئيسية

| المكون | الوصف |
|--------|-------|
| **BotAIPage** | واجهة المستخدم الرئيسية لإعدادات البوت |
| **wakzService** | خدمة Singleton للتعامل مع جميع استدعاءات WAKZ API |
| **API Proxy** | وسيط (Proxy) يُضيف مفتاح API من جانب الخادم |
| **Webhook Handler** | معالج أحداث Webhook مع تحقق HMAC-SHA256 |
| **wakzTypes** | جميع أنواع TypeScript المستخدمة في النظام |

---

## 2. البنية المعمارية

```
┌─────────────────────────────────────────────────────────────┐
│                      المتصفح (Client)                       │
│                                                             │
│  ┌─────────────────┐    ┌──────────────────────────────┐   │
│  │   BotAIPage.tsx │◄──►│      wakzService.ts          │   │
│  │   (React UI)    │    │   (Singleton Service)        │   │
│  └─────────────────┘    │                              │   │
│                          │  - apiCall() → /api/wakz/*   │   │
│                          │  - Local Config (localStorage)│   │
│                          │  - Status Polling             │   │
│                          │  - Pub/Sub Changes            │   │
│                          └──────────┬───────────────────┘   │
│                                     │                       │
└─────────────────────────────────────┼───────────────────────┘
                                      │ HTTP (fetch)
                                      ▼
┌─────────────────────────────────────────────────────────────┐
│                  خادم Next.js (Server)                       │
│                                                             │
│  ┌──────────────────────────┐  ┌─────────────────────────┐ │
│  │  /api/wakz/[...path]     │  │  /api/wakz-webhook      │ │
│  │  (API Proxy)             │  │  (Webhook Handler)      │ │
│  │                          │  │                         │ │
│  │  - يضيف x-cashier-key   │  │  - تحقق HMAC-SHA256     │ │
│  │  - يُطبع data envelope  │  │  - معالجة 5 أنواع أحداث │ │
│  │  - مهلة 15 ثانية        │  │  - طابور أحداث في الذاكرة│ │
│  └──────────┬───────────────┘  └─────────────────────────┘ │
│             │                                               │
└─────────────┼───────────────────────────────────────────────┘
              │ HTTPS
              ▼
┌─────────────────────────────────────────────────────────────┐
│                   خادم WAKZ (Remote)                        │
│                                                             │
│  Base URL: https://preview-chat-2bbf5beb-3cf9-4865-        │
│            96cb-2207e417f5dc.space-z.ai                     │
│                                                             │
│  /api/v1/cashier/connect/*                                  │
│  /api/v1/cashier/bot/*                                      │
│  /api/v1/cashier/knowledge/*                                │
│  /api/v1/cashier/auto-reply/*                               │
│  /api/v1/cashier/webhooks/*                                 │
│  /api/v1/cashier/messages/*                                 │
└─────────────────────────────────────────────────────────────┘
```

### ملفات المشروع

| الملف | المسار | الوظيفة |
|-------|--------|---------|
| واجهة المستخدم | `src/aura/components/dashboard/pages/settings/BotAIPage.tsx` | الصفحة الرئيسية لإعدادات البوت |
| طبقة الخدمة | `src/aura/services/wakzService.ts` | خدمة Singleton لجميع تفاعلات WAKZ API |
| الأنواع | `src/aura/types/wakzTypes.ts` | جميع أنواع TypeScript |
| وسيط API | `src/app/api/wakz/[...path]/route.ts` | Catch-all proxy يُمرر الطلبات لخادم WAKZ |
| معالج Webhook | `src/app/api/wakz-webhook/route.ts` | يستقبل أحداث Webhook مع تحقق HMAC-SHA256 |

---

## 3. نقاط نهاية WAKZ API

الوسيط يعمل على `/api/wakz/*` ويُمرر الطلبات لخادم WAKZ.

**عنوان الخادم الأساسي (Base URL):**
```
https://preview-chat-2bbf5beb-3cf9-4865-96cb-2207e417f5dc.space-z.ai/api/v1/cashier
```

**المصادقة:** رأس `x-cashier-key` مع مفتاح API (يُضاف من جانب الخادم فقط)

---

### 3.1 نقاط نهاية الاتصال (Connection Endpoints)

#### `POST /connect/initialize` — بدء اتصال واتساب

يُهيئ جلسة اتصال واتساب جديدة.

**نوع الطلب حسب طريقة الاتصال:**

**وضع رمز QR:**
```json
{
  "method": "qr"
}
```

**وضع كود الاقتران (Pairing Code):**
```json
{
  "method": "pairing",
  "phoneNumber": "201012345678"
}
```

> **ملاحظة مهمة:** عند استخدام `"method": "pairing"`، الاستجابة تحتوي على `pairingCode` مباشرة، ولا حاجة لاستدعاء `/connect/pairing-code` لاحقاً.

**الاستجابة:**
```json
{
  "success": true,
  "message": "Connection initialized",
  "pairingCode": "2DPBYPPV"  // فقط عندما method = "pairing"
}
```

---

#### `GET /connect/qr` — الحصول على رمز QR

يُرجع صورة QR بصيغة base64 PNG.

**الاستجابة:**
```json
{
  "success": true,
  "qr": "data:image/png;base64,iVBORw0KGgo..."
}
```

> **تحذير:** اسم الحقل هو `qr` وليس `qrCode`. خدمة `wakzService` تقوم بتطبيع ذلك تلقائياً (تنسخ `qr` إلى `qrCode`).

---

#### `POST /connect/pairing-code` — طلب كود اقتران (طريقة بديلة)

يُطلب كود اقتران كطريقة بديلة عند عدم عمل وضع QR.

**الطلب:**
```json
{
  "phoneNumber": "201012345678",
  "userId": "cashier_cmoy402u90000nrwtb3xyy0c1_1778316958307"
}
```

> **مهم:** يجب استخدام `phoneNumber` وليس `phone`. يجب تضمين `userId`.

**الاستجابة:**
```json
{
  "success": true,
  "pairingCode": "2DPBYPPV"
}
```

---

#### `GET /connect/status` — حالة الاتصال الحالية

**الاستجابة:**
```json
{
  "success": true,
  "status": "qr",
  "ready": false,
  "qrCode": "2@abc123...",
  "pairingCode": null,
  "phoneNumber": null,
  "lastConnected": null,
  "reconnectAttempts": 0,
  "stats": {
    "activeConnections": 1,
    "totalSessions": 3
  },
  "whatsappServiceAvailable": true
}
```

---

#### `POST /connect/logout` — فصل واتساب

**الاستجابة:**
```json
{
  "success": true,
  "message": "Logged out successfully"
}
```

---

### 3.2 نقاط نهاية تهيئة البوت (Bot Config Endpoints)

#### `GET /bot/config` — الحصول على تهيئة البوت

**الاستجابة:**
```json
{
  "success": true,
  "configured": true,
  "config": {
    "botName": "مساعد أورا",
    "businessName": "مطعم أورا",
    "corePrompt": "أنت مساعد ذكي...",
    "language": "ar",
    "greetingMessage": "أهلاً بك!",
    "awayMessage": "نحن خارج أوقات العمل",
    "tone": "friendly",
    "isActive": true,
    "emojiEnabled": true,
    "responseLength": "medium"
  }
}
```

---

#### `POST /bot/config` — حفظ تهيئة البوت

**الطلب:**
```json
{
  "botName": "مساعد أورا",
  "businessName": "مطعم أورا",
  "corePrompt": "أنت مساعد ذكي لمطعم أورا...",
  "language": "ar",
  "greetingMessage": "أهلاً بك! كيف يمكنني مساعدتك؟",
  "awayMessage": "نحن خارج أوقات العمل حالياً.",
  "tone": "friendly",
  "isActive": true,
  "emojiEnabled": true,
  "responseLength": "medium"
}
```

**خيارات `tone`:** `"formal"` | `"friendly"` | `"casual"`
**خيارات `responseLength`:** `"short"` | `"medium"` | `"long"`

---

#### `POST /bot/magic-wand` — توليد تعليمات البوت بالذكاء الاصطناعي

يُولّد تلقائياً تعليمات التشغيل الأساسية (core prompt) ورسالة الترحيب ورسالة خارج أوقات العمل.

**الطلب:**
```json
{
  "businessName": "مطعم أورا",
  "businessType": "restaurant",
  "menuSummary": "مأكولات مصرية وشرقية",
  "tone": "friendly",
  "language": "ar"
}
```

**الاستجابة:**
```json
{
  "success": true,
  "corePrompt": "أنت مساعد ذكي لمطعم أورا...",
  "greetingMessage": "أهلاً بك في مطعم أورا!",
  "awayMessage": "نحن خارج أوقات العمل...",
  "suggestions": ["إضافة قائمة طعام", "تحديد أوقات العمل"]
}
```

---

### 3.3 نقاط نهاية قاعدة المعرفة (Knowledge Base Endpoints)

#### `GET /knowledge` — عرض جميع إدخالات المعرفة

**الاستجابة:**
```json
{
  "success": true,
  "entries": [
    {
      "id": "entry_abc123",
      "title": "قائمة الطعام",
      "content": "المنيو يتضمن: كشري، فول، طعمية...",
      "type": "menu",
      "sourceFile": "menu.pdf",
      "fileType": "pdf",
      "chunkIndex": 0,
      "metadata": null,
      "wdnaConfigId": "cfg_xyz",
      "createdAt": "2026-03-01T10:00:00Z",
      "updatedAt": null
    }
  ],
  "total": 1
}
```

**أنواع الإدخالات (`type`):** `"menu"` | `"faq"` | `"policy"` | `"custom"`

---

#### `POST /knowledge/add` — إضافة إدخال معرفة جديد

**الطلب:**
```json
{
  "title": "ساعات العمل",
  "content": "نحن نعمل من 9 صباحاً حتى 10 مساءً طوال الأسبوع",
  "type": "policy",
  "sourceFile": "manual-entry"
}
```

> **ملاحظة:** خدمة `wakzService` تُضيف `sourceFile: "manual-entry"` تلقائياً إذا لم يتم تحديده.

---

#### `POST /knowledge/search` — البحث في قاعدة المعرفة

**الطلب:**
```json
{
  "query": "ما هي ساعات العمل؟",
  "limit": 5
}
```

**الاستجابة:**
```json
{
  "success": true,
  "results": [
    {
      "id": "entry_def456",
      "title": "ساعات العمل",
      "content": "نحن نعمل من 9 صباحاً...",
      "type": "policy",
      "createdAt": "2026-03-01T10:00:00Z"
    }
  ]
}
```

---

### 3.4 الرد التلقائي (Auto-Reply)

#### `GET /auto-reply/toggle` — حالة الرد التلقائي

**الاستجابة:**
```json
{
  "success": true,
  "enabled": true,
  "whatsappAutoReply": true
}
```

---

#### `POST /auto-reply/toggle` — تبديل الرد التلقائي

**الطلب:**
```json
{
  "isEnabled": true
}
```

> **ملاحظة:** اسم الحقل في الطلب هو `isEnabled`، لكن في الاستجابة اسم الحقل هو `enabled`.

---

### 3.5 إعدادات الـ Webhooks

#### `GET /webhooks/config` — الحصول على تهيئة الـ Webhook

**الاستجابة:**
```json
{
  "success": true,
  "webhookUrl": "https://your-domain.com/api/wakz-webhook",
  "webhookEvents": ["order.detected", "message.received"],
  "webhookSecret": "whsec_abc123...",
  "config": {
    "webhookUrl": "https://your-domain.com/api/wakz-webhook",
    "webhookEvents": ["order.detected", "message.received"],
    "isActive": true,
    "createdAt": "2026-03-01T10:00:00Z"
  }
}
```

> **تحذير:** `webhookSecret` يظهر فقط في استجابة GET، ولا يظهر أبداً في استجابة POST.

---

#### `POST /webhooks/config` — تحديث تهيئة الـ Webhook

**الطلب:**
```json
{
  "webhookUrl": "https://your-domain.com/api/wakz-webhook",
  "webhookEvents": ["order.detected", "message.received", "message.processed"]
}
```

**أنواع الأحداث المتاحة:**

| الحدث | الوصف |
|-------|-------|
| `order.detected` | تم اكتشاف طلب جديد في رسالة واتساب |
| `message.received` | تم استلام رسالة واتساب جديدة |
| `message.processed` | تمت معالجة رسالة والرد عليها |
| `connection.status` | تغيرت حالة اتصال واتساب |
| `contact.new` | تواصل عميل جديد عبر واتساب |

---

### 3.6 الرسائل (Messages)

#### `GET /messages` — الرسائل الأخيرة

**معاملات الاستعلام:** `?limit=50&channel=whatsapp`

**الاستجابة:**
```json
{
  "success": true,
  "conversations": [
    {
      "id": "conv_abc",
      "phoneNumber": "201012345678",
      "contactName": "أحمد",
      "lastMessage": "أريد طلب كشري",
      "lastMessageAt": "2026-03-01T10:30:00Z",
      "unreadCount": 2,
      "messages": [...]
    }
  ],
  "count": 1,
  "hasMore": false
}
```

---

#### `POST /messages/send` — إرسال رسالة

**الطلب:**
```json
{
  "to": "201012345678",
  "body": "مرحباً! طلبك قيد التحضير.",
  "channel": "whatsapp"
}
```

**الاستجابة:**
```json
{
  "success": true,
  "messageId": "msg_xyz789"
}
```

---

## 4. تدفقات الاتصال

### 4.1 تدفق رمز QR

```
┌──────────┐     ┌───────────────┐     ┌──────────┐     ┌──────────┐
│  المستخدم │     │  wakzService  │     │  Proxy   │     │  WAKZ    │
└────┬─────┘     └───────┬───────┘     └────┬─────┘     └────┬─────┘
     │                   │                   │                 │
     │ اضغط "عرض رمز QR" │                   │                 │
     │──────────────────►│                   │                 │
     │                   │ POST /connect/    │                 │
     │                   │ initialize        │                 │
     │                   │ {method: "qr"}    │                 │
     │                   │──────────────────►│────────────────►│
     │                   │                   │                 │
     │                   │◄──────────────────│◄────────────────│
     │                   │ success: true     │                 │
     │                   │                   │                 │
     │                   │ GET /connect/qr   │                 │
     │                   │──────────────────►│────────────────►│
     │                   │                   │                 │
     │                   │◄──────────────────│◄────────────────│
     │                   │ {qr: "data:image  │                 │
     │                   │  /png;base64,..."} │                 │
     │                   │                   │                 │
     │ عرض صورة QR      │                   │                 │
     │◄──────────────────│                   │                 │
     │                   │                   │                 │
     │ ──── مسح QR في واتساب ────          │                 │
     │                   │                   │                 │
     │                   │ (استطلاع حالة     │                 │
     │                   │  كل 15 ثانية)     │                 │
     │                   │ GET /connect/     │                 │
     │                   │ status            │                 │
     │                   │──────────────────►│────────────────►│
     │                   │◄──────────────────│◄────────────────│
     │                   │ status:           │                 │
     │                   │ "connected"       │                 │
     │                   │                   │                 │
     │ عرض "متصل" ✅     │                   │                 │
     │◄──────────────────│                   │                 │
     │                   │                   │                 │
```

**الخطوات بالتفصيل:**

1. المستخدم يضغط على زر "عرض رمز QR"
2. Frontend يستدعي `wakzService.initializeConnection()` ← `POST /connect/initialize`
3. Frontend يستدعي `wakzService.getQRCode()` ← `GET /connect/qr`
4. صورة QR (base64 PNG) تُعرض للمستخدم
5. المستخدم يمسح رمز QR في تطبيق واتساب
6. استطلاع الحالة (Status Polling) يكتشف `status: "connected"`
7. رمز QR يُخفى وتظهر حالة "متصل"

---

### 4.2 تدفق كود الاقتران (Pairing Code) — الطريقة المُوصى بها

```
┌──────────┐     ┌───────────────┐     ┌──────────┐     ┌──────────┐
│  المستخدم │     │  wakzService  │     │  Proxy   │     │  WAKZ    │
└────┬─────┘     └───────┬───────┘     └────┬─────┘     └────┬─────┘
     │                   │                   │                 │
     │ إدخال رقم الهاتف  │                   │                 │
     │──────────────────►│                   │                 │
     │                   │ POST /connect/    │                 │
     │                   │ initialize        │                 │
     │                   │ {method: "pairing"│                 │
     │                   │  phoneNumber:     │                 │
     │                   │  "201012345678"}  │                 │
     │                   │──────────────────►│────────────────►│
     │                   │                   │                 │
     │                   │◄──────────────────│◄────────────────│
     │                   │ success: true     │                 │
     │                   │ pairingCode:      │                 │
     │                   │ "2DPBYPPV"        │                 │
     │                   │                   │                 │
     │ عرض كود الاقتران  │                   │                 │
     │◄──────────────────│                   │                 │
     │                   │                   │                 │
     │ ──── فتح واتساب → الإعدادات → ──────│                 │
     │ ──── الأجهزة المرتبطة → الربط ──────│                 │
     │ ──── برقم الهاتف → إدخال الكود ─────│                 │
     │                   │                   │                 │
     │                   │ (استطلاع حالة)    │                 │
     │                   │ status:           │                 │
     │                   │ "connected"       │                 │
     │                   │                   │                 │
     │ عرض "متصل" ✅     │                   │                 │
     │◄──────────────────│                   │                 │
     │                   │                   │                 │
```

**الخطوات بالتفصيل:**

1. المستخدم يُدخل رقم الهاتف (مع رمز الدولة، مثلاً `201012345678`)
2. Frontend يستدعي `wakzService.requestPairingCode(phone)`
3. هذا يستدعي `initializeConnection({ method: 'pairing', phoneNumber: phone })`
4. `pairingCode` يأتي مباشرة من استجابة التهيئة
5. المستخدم يفتح واتساب ← الإعدادات ← الأجهزة المرتبطة ← الربط برقم الهاتف ← يُدخل الكود
6. استطلاع الحالة يكتشف `status: "connected"`
7. كود الاقتران يُخفى وتظهر حالة "متصل"

> ⚠️ **تحذير حرج:** كود الاقتران يُدخل **في واتساب**، وليس العكس. المستخدم لا يُدخل الكود في تطبيقنا.

> ⚠️ **تحذير حرج:** كود الاقتران صالح لمدة **3 دقائق فقط**. إذا انتهت صلاحيته، يجب طلب كود جديد.

> ⚠️ **تحذير حرج:** عند استخدام وضع الاقتران، **يجب إيقاف التحديث التلقائي لرمز QR** لأنه سيُبطل كود الاقتران.

---

### 4.3 مقارنة بين طريقتي الاتصال

| المعيار | رمز QR | كود الاقتران |
|---------|--------|-------------|
| السرعة | أسرع (مسح فوري) | أسرع (لا حاجة لمسح) |
| المتطلبات | كاميرا على الجهاز | رقم هاتف فقط |
| الصلاحية | يتجدد تلقائياً | 3 دقائق فقط |
| المُوصى بها | للأجهزة ذات الكاميرا | للأجهزة بدون كاميرا |
| حالة WAKZ بعد التهيئة | `status: "qr"` | `status: "qr"` ⚠️ |

---

## 5. الإعدادات المحلية (localStorage)

تُخزن `wakzService` الإعدادات المحلية في `localStorage` تحت المفتاح `aura_wakz_config`:

```typescript
interface WakzLocalConfig {
  /** حالة اتصال واتساب (مخزنة مؤقتاً) */
  connectionStatus: WhatsAppConnectionStatus;

  /** آخر رقم هاتف متصل */
  connectedPhone?: string;

  /** معرف مستخدم واتساب (مطلوب لكود الاقتران) */
  whatsappUserId: string;

  /** تهيئة البوت (مخزنة مؤقتاً) */
  botConfig?: BotConfig;

  /** حالة الرد التلقائي (مخزنة مؤقتاً) */
  autoReplyEnabled: boolean;

  /** ساعات العمل (إعداد محلي فقط) */
  businessHours: BusinessHours;

  /** الردود السريعة (إعداد محلي فقط) */
  quickReplies: QuickReply[];

  /** سرعة الإرسال بالمللي ثانية بين الرسائل */
  sendSpeedMs: number;

  /** عدد إدخالات المعرفة (مخزن مؤقتاً) */
  knowledgeEntriesCount: number;

  /** تاريخ آخر مزامنة */
  lastSyncAt?: string;
}
```

### القيم الافتراضية

```typescript
const DEFAULT_LOCAL_CONFIG: WakzLocalConfig = {
  connectionStatus: 'disconnected',
  whatsappUserId: 'cashier_cmoy402u90000nrwtb3xyy0c1_1778316958307',
  autoReplyEnabled: false,
  businessHours: {
    enabled: false,
    startTime: '09:00',
    endTime: '22:00',
    days: [0, 1, 2, 3, 4, 5, 6],  // كل الأيام
    timezone: 'Africa/Cairo',
  },
  quickReplies: [],
  sendSpeedMs: 1500,
  knowledgeEntriesCount: 0,
};
```

### الإعدادات المحلية فقط (لا تُرسل لخادم WAKZ)

| الإعداد | الوصف |
|---------|-------|
| `businessHours` | ساعات العمل — يُستخدم محلياً لعرض رسالة "خارج أوقات العمل" |
| `quickReplies` | الردود السريعة — قوالب محلية للرد السريع |
| `sendSpeedMs` | سرعة الإرسال — تأخير بين الرسائل (500-5000 مللي ثانية) |

---

## 6. تعيين حالات الاتصال

خادم WAKZ يُرجع حالات بسيطة (نصوص) يتم تعيينها لحالات أكثر تفصيلاً في النظام:

```
┌─────────────────────────┐     ┌──────────────────────────────┐
│   خادم WAKZ (القيمة)    │     │   النظام (القيمة المُعينة)    │
├─────────────────────────┤     ├──────────────────────────────┤
│  "connected"            │ ──► │  "connected"                 │
│  "connecting"           │ ──► │  "connecting"                │
│  "qr"                   │ ──► │  "qr_ready"                  │
│  "pairing"              │ ──► │  "pairing_ready"             │
│  "disconnected"         │ ──► │  "disconnected"              │
│                         │     │                              │
│  (أي حالة أخرى + qrCode)│ ──► │  "qr_ready"                  │
│  (أي حالة أخرى +       │ ──► │  "pairing_ready"             │
│   pairingCode)          │     │                              │
└─────────────────────────┘     └──────────────────────────────┘
```

### دالة التعيين (`mapWakzStatus`)

```typescript
function mapWakzStatus(
  status: string,
  ready?: boolean | null,
  qrCode?: string | null,
  pairingCode?: string | null
): WhatsAppConnectionStatus {
  if (status === 'connected') return 'connected';
  if (status === 'connecting') return 'connecting';
  if (status === 'qr') return 'qr_ready';
  if (status === 'pairing') return 'pairing_ready';

  // لحالة "disconnected"، تحقق من وجود QR أو كود اقتران
  if (status === 'disconnected') {
    if (qrCode) return 'qr_ready';
    if (pairingCode) return 'pairing_ready';
    if (ready === false) return 'disconnected';
  }

  // احتياطي: إذا وُجد qrCode أو pairingCode في أي حالة
  if (qrCode) return 'qr_ready';
  if (pairingCode) return 'pairing_ready';

  return 'disconnected';
}
```

### نوع الحالة

```typescript
type WhatsAppConnectionStatus =
  | 'connected'     // واتساب متصل ويعمل
  | 'disconnected'  // غير متصل
  | 'connecting'    // جاري الاتصال
  | 'qr_ready'      // في انتظار مسح رمز QR
  | 'pairing_ready'; // في انتظار إدخال كود الاقتران في واتساب
```

---

## 7. تطبيع استجابات البيانات (Data Envelope Normalization)

خادم WAKZ يُغلف بعض الاستجابات (خاصة `connect/*`) في غلاف `data`:

**استجابة WAKZ الأصلية:**
```json
{
  "success": true,
  "data": {
    "status": "qr",
    "qrCode": "2@abc123...",
    "phoneNumber": null
  }
}
```

**بعد التطبيع (ما يستلمه Frontend):**
```json
{
  "success": true,
  "status": "qr",
  "qrCode": "2@abc123...",
  "phoneNumber": null
}
```

### دالة التطبيع

```typescript
function normalizeWakzResponse(body: unknown): unknown {
  if (typeof body !== 'object' || body === null) return body;

  const obj = body as Record<string, unknown>;

  if ('data' in obj && typeof obj.data === 'object' && obj.data !== null) {
    const dataObj = obj.data as Record<string, unknown>;
    const { data: _, ...rest } = obj;
    return { ...rest, ...dataObj };
  }

  return body;
}
```

> **ملاحظة:** التطبيع يحدث في الوسيط (Proxy) على الخادم، لذلك Frontend دائماً يستلم استجابات مسطحة (flat).

---

## 8. الأمان والحماية

### 8.1 حماية مفتاح API (Ghost Mode)

```
┌──────────┐     ┌──────────────────┐     ┌──────────┐
│ المتصفح  │     │  Next.js Server  │     │  WAKZ    │
│          │     │                  │     │  Server  │
│  fetch() │────►│  Proxy Route     │────►│          │
│          │     │  + x-cashier-key │     │          │
│          │◄────│                  │◄────│          │
│          │     │  (مفتاح API      │     │          │
│          │     │   لا يُرسل       │     │          │
│          │     │   للمتصفح أبداً) │     │          │
└──────────┘     └──────────────────┘     └──────────┘
```

- مفتاح API يُخزن **على الخادم فقط** (`process.env.WAKZ_API_KEY` أو قيمة افتراضية)
- مفتاح API **لا يُكشف أبداً** للمتصفح
- الوسيط يُضيف رأس `x-cashier-key` على كل طلب
- جميع أخطاء الوسيط تُرجع HTTP 200 مع `success: false` لمنع throw في `wakzService.apiCall()`

### 8.2 تحقق Webhook عبر HMAC-SHA256

```typescript
function verifySignature(
  payload: string,     // جسم الطلب الخام (raw body)
  signature: string,   // رأس X-WAKZ-Signature
  secret: string       // مفتاح Webhook السري
): boolean {
  if (!secret) return true;  // تخطي التحقق إذا لم يتوفر المفتاح

  const expectedSignature = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
```

**رؤوس Webhook المُستلمة:**

| الرأس | الوصف |
|-------|-------|
| `X-WAKZ-Signature` | توقيع HMAC-SHA256 للتحقق من صحة الطلب |
| `X-WAKZ-Event` | نوع الحدث (مثل `order.detected`) |
| `X-WAKZ-Delivery-ID` | معرف التسليم الفريد |

**آلية جلب مفتاح Webhook:**
1. عند استلام أول webhook، يُجلب `webhookSecret` من `GET /webhooks/config`
2. يُخزن مؤقتاً في الذاكرة (`cachedWebhookSecret`)
3. إذا فشل جلب المفتاح، يتم التحقق بدون توقيع (وضع عدم التحقق)

### 8.3 أخطاء الوسيط

الوسيط يُرجع دائماً HTTP 200 حتى عند فشل الطلب، لمنع `wakzService.apiCall()` من عمل throw:

```json
{
  "success": false,
  "error": "TIMEOUT",
  "message": "انتهت مهلة الاتصال بالخادم."
}
```

**أنواع الأخطاء:**

| الخطأ | الوصف | الرسالة |
|-------|-------|---------|
| `TIMEOUT` | انتهت مهلة الاتصال (15 ثانية) | "انتهت مهلة الاتصال بالخادم." |
| `NETWORK_ERROR` | فشل الشبكة (DNS، رفض الاتصال) | "لا يمكن الاتصال بخادم WAKZ." |
| `HTTP_400` | طلب غير صالح | "طلب غير صالح. تأكد من البيانات المُدخلة." |
| `HTTP_401` | مفتاح API غير صالح | "مفتاح API غير صالح. تواصل مع دعم WAKZ." |
| `HTTP_404` | الإندبوينت غير موجود | "الإندبوينت غير موجود على خادم WAKZ." |
| `HTTP_429` | طلبات كثيرة | "طلبات كثيرة جداً. انتظر قليلاً ثم حاول مرة أخرى." |
| `HTTP_500` | خطأ داخلي في WAKZ | "خطأ داخلي في خادم WAKZ. قد يكون البوت لم يتم إعداده بعد." |
| `HTTP_502/503` | WAKZ غير متاح | "خادم WAKZ غير متاح حالياً. حاول لاحقاً." |
| `INTERNAL_ERROR` | خطأ داخلي عام | "حدث خطأ داخلي في الخادم." |

---

## 9. مشاكل معروفة وملاحظات مهمة

### ⚠️ حرج: حالة WAKZ أثناء وضع الاقتران

عند طلب كود اقتران، خادم WAKZ يُرجع الحالة `"qr"` (وليس `"pairing"`). هذا يعني:

- الـ Frontend **يجب** استخدام `connectionMode` المحلي للتمييز بين وضع QR ووضع الاقتران
- لا يمكن الاعتبار على `status` وحده لمعرفة طريقة الاتصال المُستخدمة

### ⚠️ حرج: إيقاف تحديث QR أثناء وضع الاقتران

التحديث التلقائي لرمز QR **يجب ألا** يعمل عندما يكون كود اقتران نشطاً. السبب:

- استدعاء `/connect/qr` يُنشئ جلسة QR جديدة
- هذا يُبطل كود الاقتران الحالي
- المستخدم سيفقد الكود ولن يتمكن من الاتصال

**الحل:** تحقق من `connectionMode` قبل تشغيل تحديث QR التلقائي:

```typescript
// ✅ صحيح
if (config.connectionStatus === 'qr_ready' && connectionMode !== 'pairing') {
  // شغّل تحديث QR التلقائي
}

// ❌ خطأ — سيُبطل كود الاقتران
if (config.connectionStatus === 'qr_ready') {
  // شغّل تحديث QR التلقائي دائماً
}
```

### ⚠️ انتهاء صلاحية كود الاقتران

أكواد الاقتران تنتهي صلاحيتها بعد **3 دقائق**. إذا انتهت الصلاحية:

1. أبلغ المستخدم أن الكود انتهت صلاحيته
2. اطلب كود اقتران جديد
3. **لا تستدعِ** `initializeConnection()` مرة أخرى إذا كانت الحالة `"qr_ready"` أو `"pairing_ready"`

### ⚠️ اسم حقل QR

نقطة النهاية `/connect/qr` تُرجع الصورة في حقل `qr` (ليس `qrCode`). خدمة `wakzService` تقوم بالتطبيع:

```typescript
// في wakzService.getQRCode()
if (result.qr && !result.qrCode) {
  result.qrCode = result.qr;
}
```

### ⚠️ أسماء حقول كود الاقتران

نقطة النهاية `/connect/pairing-code` تتطلب:

- `phoneNumber` (ليس `phone`)
- `userId` (معرف مستخدم واتساب، مثل `cashier_cmoy402u90000nrwtb3xyy0c1_1778316958307`)

```typescript
// ✅ صحيح
{ phoneNumber: "201012345678", userId: "cashier_..." }

// ❌ خطأ — سيرجع 400 Bad Request
{ phone: "201012345678" }
```

### ⚠️ إعادة تهيئة الاتصال أثناء الاقتران

عند طلب كود اقتران، **لا تستدعِ** `initializeConnection()` إذا كانت الحالة الحالية `"qr_ready"` أو `"pairing_ready"`. إعادة التهيئة ستُنشئ جلسة جديدة وتُبطل الكود الحالي.

```typescript
// ✅ صحيح — تهيئة فقط إذا كانت الحالة "disconnected"
const currentStatus = wakzService.getConfig().connectionStatus;
if (currentStatus === 'disconnected') {
  await wakzService.initializeConnection();
}

// ❌ خطأ — سيُبطل أي كود اقتران موجود
await wakzService.initializeConnection();  // دائماً!
```

### ملاحظة: طابور أحداث Webhook

أحداث Webhook تُخزن في طابور في الذاكرة (`pendingEvents`) بحد أقصى 100 حدث. الـ POS يجلب الأحداث عبر `GET /api/wakz-webhook` ويُخلي الطابور:

```typescript
// GET handler — يجلب ويُخلي الأحداث
export async function GET(): Promise<NextResponse> {
  const events = [...pendingEvents];
  pendingEvents = [];  // إخلاء الطابور
  return NextResponse.json({ success: true, events, count: events.length });
}
```

> **تحذير:** الأحداث تُفقد عند إعادة تشغيل الخادم لأنها في الذاكرة فقط.

---

## 10. مرجع الأنواع (TypeScript Types)

### أنواع حالة الاتصال

```typescript
type WhatsAppConnectionStatus =
  | 'connected'      // واتساب متصل
  | 'disconnected'   // غير متصل
  | 'connecting'     // جاري الاتصال
  | 'qr_ready'       // في انتظار مسح QR
  | 'pairing_ready'; // في انتظان إدخال كود الاقتران
```

### أنواع تهيئة البوت (W-DNA)

```typescript
interface BotConfig {
  botName: string;           // اسم البوت (مثلاً: "مساعد أورا")
  businessName: string;      // اسم النشاط التجاري (مثلاً: "مطعم أورا")
  corePrompt: string;        // التعليمات الأساسية لشخصية البوت
  language?: string;         // اللغة الافتراضية (مثلاً: "ar")
  greetingMessage?: string;  // رسالة الترحيب عند أول تواصل
  awayMessage?: string;      // رسالة خارج أوقات العمل
  tone?: 'formal' | 'friendly' | 'casual';  // نبرة المحادثة
  isActive?: boolean;        // هل البوت نشط
  emojiEnabled?: boolean;    // استخدام الرموز التعبيرية
  responseLength?: 'short' | 'medium' | 'long';  // طول الرد
}
```

### أنواع قاعدة المعرفة

```typescript
interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  type: 'menu' | 'faq' | 'policy' | 'custom';
  sourceFile?: string;
  fileType?: string;
  chunkIndex?: number;
  metadata?: string;
  wdnaConfigId?: string;
  createdAt: string;
  updatedAt?: string;
}
```

### أنواع أحداث Webhook

```typescript
type WebhookEvent =
  | 'order.detected'      // اكتشاف طلب جديد
  | 'message.received'    // رسالة واردة
  | 'message.processed'   // رسالة تمت معالجتها
  | 'connection.status'   // تغير حالة الاتصال
  | 'contact.new';        // عميل جديد

interface WebhookPayload {
  event: WebhookEvent;
  timestamp: string;
  cashierKeyId: string;
  data: WebhookEventData;
}
```

### أنواع الطلبات الخاصة بالاقتران

```typescript
interface WhatsAppPairingCodeRequest {
  phoneNumber: string;  // مثلاً: "201012345678"
  userId: string;       // مثلاً: "cashier_cmoy402u90000nrwtb3xyy0c1_..."
}

interface WhatsAppPairingCodeResponse {
  success: boolean;
  pairingCode?: string;  // مثلاً: "2DPBYPPV"
  message?: string;
}
```

### أنواع ساعات العمل (محلي فقط)

```typescript
interface BusinessHours {
  enabled: boolean;
  startTime: string;    // "09:00"
  endTime: string;      // "22:00"
  days: number[];       // 0=الأحد, 1=الإثنين, ..., 6=السبت
  timezone?: string;    // "Africa/Cairo"
}

interface QuickReply {
  id: string;
  trigger: string;   // الكلمة أو العبارة المُحفزة
  reply: string;     // نص الرد التلقائي
  isActive: boolean;
}
```

---

## 11. دليل استكشاف الأخطاء وإصلاحها

### المشكلة: رمز QR لا يظهر

**الأسباب المحتملة:**

1. **حالة الاتصال خاطئة:** تحقق من `connectionStatus` — يجب أن تكون `"qr_ready"`
2. **اسم حقل QR خاطئ:** تحقق من أن الكود يقرأ `result.qr` (من `/connect/qr`) أو `result.qrCode` (من `/connect/status`)
3. **خادم WAKZ لا يستجيب:** تحقق من اتصال الشبكة وحالة الخادم

**الحل:**

```typescript
// استخدم استراتيجية المصدر المزدوج
const fetchQrCode = async () => {
  // المصدر 1: /connect/qr (صورة base64)
  const qrResult = await wakzService.getQRCode();
  if (qrResult.success && qrResult.qrCode) {
    return qrResult.qrCode;  // data:image/png;base64,...
  }

  // المصدر 2: /connect/status (سلسلة QR خام)
  const statusResult = await wakzService.getConnectionStatus();
  if (statusResult.success && statusResult.qrCode) {
    return await QRCode.toDataURL(statusResult.qrCode);
  }
};
```

---

### المشكلة: كود الاقتران لا يعمل

**الأسباب المحتملة:**

1. **انتهت صلاحية الكود:** أكواد الاقتران صالحة لمدة 3 دقائق فقط
2. **إعادة تهيئة الاتصال:** استدعاء `initializeConnection()` مرة أخرى يُبطل الكود
3. **حقول مفقودة:** يجب إرسال `phoneNumber` و `userId` (ليس `phone`)
4. **الاتجاه الخاطئ:** الكود يُدخل في واتساب، ليس في تطبيقنا

---

### المشكلة: أخطاء 401 أو 500 من WAKZ

**الأسباب المحتملة:**

1. **مفتاح API منتهي الصلاحية:** تواصل مع دعم WAKZ للحصول على مفتاح جديد
2. **البوت لم يُعد بعد:** أخطاء 500 شائعة إذا لم يتم إعداد البوت على خادم WAKZ
3. **انقطاع الخادم:** تحقق من حالة خادم WAKZ

---

### المشكلة: Webhooks لا تصل

**الأسباب المحتملة:**

1. **عنوان URL غير صحيح:** تأكد من أن `webhookUrl` يمكن الوصول إليه من خادم WAKZ
2. **توقيع غير صالح:** تحقق من أن `webhookSecret` محدث
3. **جدار حماية:** تأكد من أن المنفذ مفتوح ويسمح بطلبات POST من WAKZ

---

### المشكلة: الرد التلقائي لا يعمل

**الأسباب المحتملة:**

1. **الرد التلقائي مُعطل:** تحقق من `autoReplyEnabled` في الإعدادات المحلية
2. **البوت غير نشط:** تحقق من `isActive` في `BotConfig`
3. **واتساب غير متصل:** تحقق من `connectionStatus === 'connected'`
4. **قاعدة المعرفة فارغة:** البوت يحتاج معرفة للرد بشكل صحيح

---

## ملخص سريع للمطورين

```bash
# هيكل الملفات
src/aura/types/wakzTypes.ts                    # جميع الأنواع
src/aura/services/wakzService.ts               # خدمة Singleton
src/aura/components/dashboard/pages/settings/  # واجهة المستخدم
  └── BotAIPage.tsx
src/app/api/wakz/[...path]/route.ts            # وسيط API
src/app/api/wakz-webhook/route.ts              # معالج Webhook

# استخدام الخدمة
import { wakzService } from './services/wakzService';

// مزامنة كاملة
await wakzService.fullSync();

// اتصال واتساب
await wakzService.initializeConnection();
const qr = await wakzService.getQRCode();
const pairing = await wakzService.requestPairingCode('201012345678');
const status = await wakzService.getConnectionStatus();
await wakzService.logout();

// تهيئة البوت
const config = await wakzService.getBotConfig();
await wakzService.saveBotConfig(newConfig);
const magic = await wakzService.magicWand({ businessName: '...' });

// قاعدة المعرفة
const entries = await wakzService.getKnowledgeEntries();
await wakzService.addKnowledgeEntry({ title, content, type });
const results = await wakzService.searchKnowledge({ query });

// الرد التلقائي
const status = await wakzService.getAutoReplyStatus();
await wakzService.toggleAutoReply({ isEnabled: true });

// Webhooks
const webhook = await wakzService.getWebhookConfig();
await wakzService.updateWebhookConfig({ webhookUrl, webhookEvents });

// إدارة الحالة المحلية
const config = wakzService.getConfig();
wakzService.updateConfig({ autoReplyEnabled: true });
const unsubscribe = wakzService.subscribe(() => { /* ... */ });

// الاستطلاع
wakzService.startStatusPolling(15000);  // كل 15 ثانية
wakzService.stopStatusPolling();

// التنظيف (عند إلغاء التحميل)
wakzService.destroy();
```
