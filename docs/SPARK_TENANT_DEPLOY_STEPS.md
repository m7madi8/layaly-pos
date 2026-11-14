# نشر قواعد المقهى (Tenant) — خطوة بخطوة

**المشروع:** `layaly-cafe-13c2b`  
**المجلد المحلي:** `D:\completed\layali-cafe` (نفس مجلد `ليالي كافي`)

---

## المرحلة 0 — قبل أي شيء

1. تأكد أنك على **جهاز المدير** أو جهاز فيه **Node + Firebase CLI**:
   ```powershell
   node -v
   firebase --version
   ```
2. افتح **PowerShell** (ليس داخل Cursor فقط إن أمكن — تسجيل الدخول يفتح المتصفح).

---

## المرحلة 1 — تسجيل الدخول إلى Firebase

```powershell
firebase login --reauth
```

| خطوة | ماذا تفعل |
|------|-----------|
| 1 | يفتح المتصفح — اختر حساب Google المربوط بمشروع Layali |
| 2 | وافق على الصلاحيات |
| 3 | ارجع للطرفية حتى ترى «Success» |

**تحقق:**

```powershell
firebase projects:list
```

يجب أن ترى **`layaly-cafe-13c2b`** في القائمة.

---

## المرحلة 2 — ربط المجلد بالمشروع

```powershell
cd D:\completed\layali-cafe
firebase use layaly-cafe-13c2b
```

**تحقق:**

```powershell
firebase use
```

المخرجات: `Active Project: layaly-cafe-13c2b`

---

## المرحلة 3 — نشر قواعد Firestore (إلزامي)

```powershell
firebase deploy --only firestore:rules --project layaly-cafe-13c2b
```

| نتيجة ناجحة | ماذا يعني |
|-------------|-----------|
| `Deploy complete!` | القواعد على الإنتاج محدّثة |

**مهم:** بدون هذه الخطوة، خطأ `Tenant auth: Missing or insufficient permissions` يبقى حتى لو Vercel محدّث.

---

## المرحلة 4 — الواجهة (Vercel)

### أ) تلقائي (مربوط بـ GitHub)

بعد `git push` على `main`، Vercel يبني تلقائياً.

1. افتح [Vercel Dashboard](https://vercel.com) → مشروع **layaly-pos**
2. **Deployments** → آخر نشر **Ready** (أخضر)
3. إن كان **Error** (أحمر): اضغط **Redeploy** على آخر نشر **Ready** ناجح، أو أصلح Build Log

### ب) من الطرفية (اختياري)

```powershell
$env:NODE_OPTIONS='--use-system-ca'
cd D:\completed\layali-cafe
vercel --prod
```

### متغيرات Vercel (Production)

تأكد من وجود (بدون نسخ القيم هنا):

| المتغير | الغرض |
|---------|--------|
| `REACT_APP_FIREBASE_*` (6) | مشروع `layaly-cafe-13c2b` |
| `REACT_APP_DEMO_MODE` | `false` |
| `REACT_APP_ADMIN_EMAIL` | بريد مدير Firebase |
| `REACT_APP_CASHIER_EMAIL` | بريد كاشير منفصل |
| `REACT_APP_EMPLOYEE_PASSWORD` / `REACT_APP_VAULT_PIN` | كما كانت |

بعد تغيير env: **Redeploy** إلزامي.

### تحديث المتصفح

بعد نشر جاهز: **Ctrl+Shift+R** على https://layaly-pos.vercel.app

---

## المرحلة 5 — تجربة المدير

1. افتح الموقع → **دخول مدير** (البريد + كلمة المرور Firebase للمدير).
2. يفترض أن يختفي `Tenant auth` وأن تفتح **لوحة التحكم** أو POS.
3. **إعدادات الحساب** → انسخ **معرّف البيانات** (للكاشير).
4. **أمان الفريق (Spark)** → رمز انضمام (مثال `LY2026`) → **حفظ**.

---

## المرحلة 6 — تجربة الكاشير

1. تسجيل خروج أو نافذة خاصة.
2. **دخول كاشير** (حساب `REACT_APP_CASHIER_EMAIL`).
3. أدخل **معرّف المقهى** + **رمز الانضمام**.
4. **طلب انضمام** → من جهاز المدير: إعدادات → **موافقة**.
5. جرّب فتح POS.

---

## المرحلة 7 — إن بقي خطأ الصلاحيات

### Firestore Console

[Firebase Console](https://console.firebase.google.com) → `layaly-cafe-13c2b` → **Firestore**

من **Authentication** انسخ **User UID** للمدير = `{UID_المدير}`

| المسار | المطلوب |
|--------|---------|
| `tenants/{UID_المدير}` | موجود |
| `tenants/{UID_المدير}/members/{UID_المدير}` | `role`: `admin`, `active`: `true` |
| `userTenants/{UID_المدير}` | `tenantId`: نفس `{UID_المدير}`, `role`: `admin` |

### إصلاح يدوي (حالة ناقصة)

إن وُجد `tenants` **بدون** `members` أو `userTenants`:

**`tenants/{UID}/members/{UID}`**

```json
{
  "role": "admin",
  "active": true
}
```

**`userTenants/{UID}`**

```json
{
  "tenantId": "{UID_نفسه}",
  "role": "admin"
}
```

ثم **تسجيل خروج ودخول** من التطبيق.

---

## المرحلة 8 — طوارئ (تراجع عن قواعد Tenant)

**فقط** إن تعطّل المقهى ولا يمكن إصلاح المستندات فوراً:

```powershell
cd D:\completed\layali-cafe
Copy-Item firestore.rules.legacy.backup-20261103 firestore.rules -Force
firebase deploy --only firestore:rules --project layaly-cafe-13c2b
```

هذا يعيد القواعد القديمة (`auth.uid == userId` فقط). أعد نشر قواعد Spark لاحقاً بعد إصلاح البيانات.

---

## ملخص الترتيب الصحيح

1. `firebase login --reauth`
2. `firebase deploy --only firestore:rules`
3. Vercel **Ready** + hard refresh
4. مدير → رمز الانضمام
5. كاشير → انضمام

**لا تنشر قواعد الطوارئ** إلا إذا فشلت الخطوات 1–4 ولم تستطع إصلاح مستندات `tenants` / `members` / `userTenants`.