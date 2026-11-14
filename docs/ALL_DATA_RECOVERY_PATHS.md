# كل سبل استرداد بيانات ليالي كافيه — دليل شامل

**معرّف البيانات:** `RqZNBvxPqTVNS2j2dLyDZ1DActK2`  
**المشروع:** `layaly-cafe-13c2b`

---

## تصنيف السبل

| النوع | المعنى |
|-------|--------|
| **أ** | البيانات **ما زالت في Firebase** — المطلوب إظهارها في التطبيق (الأرجح عندك) |
| **ب** | **نسخة احتياطية رسمية** Google (تتطلب إعداداً سابقاً أو Blaze) |
| **ج** | **مصادر جزئية** (تقارير، أجهزة، ملخصات يومية) |
| **د** | **غير متوفرة** في هذا المشروع حالياً |

---

## أ — استعادة الوصول (البيانات موجودة في Console)

أنت أكدت وجود: `orders`, `customers`, `products`, `suppliers`, `expenses`, `cashShifts`.

### أ1) قواعد Firestore القديمة ✅ (نفّذتها)

- الملف: `docs/FIRESTORE_RULES_LEGACY_PASTE.txt`
- **Publish** في Console
- يسمح لـ `admin@layali.cafe` بقراءة كل `users/{UID}/**`

### أ2) تثبيت الواجهة

| الخيار | الخطوات |
|--------|---------|
| Rollback Vercel | Dashboard → **layaly-pos** → Deployments → آخر **Ready** قبل تحديث tenant → Promote |
| أحدث إصلاح | انتظر push مع «وضع استعادة» + **Ctrl+Shift+R** |

### أ3) دخول صحيح

- **مدير:** `admin@layali.cafe` فقط — UID = معرّف البيانات
- لا تستخدم حساباً آخر
- **تسجيل خروج** ثم دخول؛ أو نافذة خاصة

### أ4) مسح كاش التطبيق (لا يمس السحابة)

- F12 → **Application** → **IndexedDB** → احذف databases لـ `firestore` / `firebase`
- أو: إعدادات المتصفح → مسح بيانات الموقع لـ `layaly-pos.vercel.app` فقط
- ثم دخول من جديد

### أ5) Vercel env

تأكد Production:

- `REACT_APP_FIREBASE_PROJECT_ID=layaly-cafe-13c2b`
- `REACT_APP_DEMO_MODE=false`
- احذف أو اترك فارغاً `REACT_APP_CASHIER_EMAIL` للطريقة القديمة (موظف = كلمة مرور فقط)

### أ6) إصلاح tenant (إن بقيت قواعد جديدة لاحقاً)

في Firestore يدوياً تحت المدير:

- `tenants/RqZNBvxPqTVNS2j2dLyDZ1DActK2/members/RqZNBvxPqTVNS2j2dLyDZ1DActK2` → `role: admin`, `active: true`
- `userTenants/RqZNBvxPqTVNS2j2dLyDZ1DActK2` → `tenantId` نفس UID, `role: admin`

(مع القواعد **القديمة** هذا اختياري.)

---

## ب — استعادة «حتى أمس» من Google (تتطلب نسخة سابقة)

### ب1) Firestore Scheduled Export → GCS

- **متى ينجح:** كان المشروع على **Blaze** وفّع تصديراً مجدولاً لـ bucket
- **أين تبحث:** [Google Cloud Console](https://console.cloud.google.com) → نفس مشروع Firebase → **Firestore** → **Import/Export** أو **Buckets**
- **الاستيراد:** `gcloud firestore import gs://BUCKET/path` — **يستبدل/يدمج** حسب المستندات؛ خطر — جرّب مشروع تجريبي أولاً
- **في المستودع:** لا يوجد bucket محفوظ — `LAYALI_BACKUP_BUCKET` في السكربتات فقط كمتغير

### ب2) Point-in-Time Recovery (PITR)

- **متى:** Blaze + PITR مفعّل (غالباً 7 أيام)
- **أين:** Firebase Console → Firestore → **Disaster Recovery** / PITR
- **النتيجة:** استعادة قاعدة لنقطة زمنية (مثلاً قبل أمس)
- **على Spark مجاني:** عادة **غير متاح**

### ب3) نسخة يدوية قديمة

ابحث عندك عن:

- مجلدات `gs://.../firestore-20...`
- ملفات من Firebase Console **Export** سابقة
- نسخة من مطوّر / جهاز قديم

**لا يوجد ملف backup داخل مجلد المشروع `ليالي كافي`.**

---

## ج — استعادة جزئية (مصدر ثانوي)

### ج1) ملخصات أيام العمل في Firestore

تحت نفس UID:

- `businessDaySummaries` — إجماليات يومية محفوظة
- `businessDays` — أرشيف إغلاق أيام
- قد لا تعيد كل الطلبات سطراً بسطر، لكن **أرقام** ومراجع

### ج2) IndexedDB على جهاز المقهى

إن بقي POS مفتوحاً **بدون مسح كاش** على جهاز لم يُحدَّث:

- قد يعرض بيانات محلية قديمة — **للاطلاع فقط**
- **لا تعتمد** كنسخة رسمية؛ يمكن نسخ يدوي من الشاشة

### ج3) ملفات صادرة من النظام

| المصدر | ماذا يسترجع |
|--------|-------------|
| PDF تقرير عملاء (`exportCustomersLedgerPdf`) | أسماء وديون وقت التصدير |
| `exportCustomerFile` (JSON من التطبيق) | عميل + طلباته إن صُدّر سابقاً |
| رسائل واتساب / كشوف (إن استخدمتمها) | أرصدة عملاء نصية |
| طباعة فواتير ورقية | مرجع يدوي |

ابحث على الكمبيوتر/الجوال: `ليالي`, `layaly`, `customers`, `.pdf`, `.json`

### ج4) جهاز / متصفح آخر

- تاب قديم لم يُغلق
- جوال كان عليه PWA — قبل hard refresh
- **لا تسجّل خروج** من هناك حتى تلتقط ما تراه (صور / تصدير)

### ج5) Firebase Authentication

- لا يحوي طلبات/عملاء — **فقط** حساب الدخول
- لا يساعد في استرداد مالية

---

## د — غير متوفرة من المشروع الحالي

| السبيل | السبب |
|--------|--------|
| Git / Vercel | يسترجع **كود الموقع** فقط، لا Firestore |
| `npm run test` | لا يلمس الإنتاج |
| Emulator | بيانات تجريبية |
| سكربت في `scripts/` | لا يوجد `import-firestore-backup.js` جاهز |
| Cloud Functions | غير منشورة على Spark |

---

## خريطة قرار سريعة

```
هل customers/orders في Console فيها مستندات؟
├─ نعم → ركّز على (أ1–أ5) — هذا «الاسترداد» الحقيقي عندك
└─ لا (فارغة فعلاً)
    ├─ هل يوجد GCS export أو PITR؟ → (ب1 أو ب2)
    ├─ هل يوجد PDF/JSON محلي؟ → (ج3)
    └─ لا شيء → لا استعادة كاملة تلقائية — إدخال يدوي من الأوراق
```

---

## خطأ Network `400` على `Listen/terminate`

**لا يُعتبر** سبباً رئيسياً لفقدان البيانات — ضوضاء شائعة عند إغلاق الاتصال.

ابحث في **Console** عن: `PERMISSION_DENIED`, `Tenant auth`, `FirebaseError`.

---

## أولوية تنفيذ اليوم (موصى بها)

1. ✅ قواعد قديمة منشورة  
2. Rollback Vercel أو انتظر آخر build  
3. Ctrl+Shift+R + دخول مدير  
4. التحقق من شاشة العملاء  
5. إن فشل: مسح IndexedDB للموقع (أ4) + تكرار  
6. بالتوازي: بحث في Google Cloud عن أي **bucket** backup (ب1)

---

## بعد الاستقرار

- فعّل **تصدير Firestore دوري** (يتطلب Blaze + bucket) قبل أي تحديث أمني لاحق
- لا تستخدم «تهيئة النظام» إلا عمداً

---

## مساعدة تقنية لاحقة

إن وُجد **مسار GCS** لنسخة قديمة، يمكن لاحقاً (وضع Agent) إعداد سكربت استيراد **لمشروع تجريبي** أولاً — لا على الإنتاج مباشرة.