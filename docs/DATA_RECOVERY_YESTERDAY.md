# استعادة البيانات «حتى أمس» — ليالي كافيه

**تاريخ:** 2026-11-14  
**معرّف البيانات (المدير):** `RqZNBvxPqTVNS2j2dLyDZ1DActK2`

---

## الحقيقة المهمة (اقرأ أولاً)

| السؤال | الجواب |
|--------|--------|
| هل التعديلات **حذفت** الطلبات والعملاء من السحابة؟ | **لا** — أنت أكدت أن `orders`, `customers`, `products`, … **موجودة** في Firestore تحت `users/RqZNBvxPqTVNS2j2dLyDZ1DActK2` |
| هل يمكن «إرجاع الزمن» لأمس تلقائياً على **Spark**؟ | **لا** — بدون **نسخة احتياطية Firestore** (تصدير GCS) أو **Point-in-Time Recovery (Blaze)** لا يوجد زر «استعادة أمس» |
| ماذا نفعل عملياً؟ | **استعادة الوصول** لنفس البيانات الموجودة + (اختياري) استيراد نسخة قديمة إن وُجدت عندك |

البيانات التي في Console **هي** سجلّك التاريخي (آخر ما كُتب قبل أي حذف فعلي إن حصل). الهدف الآن: أن يراها التطبيق مرة أخرى.

---

## الخطة أ — فوري (30 دقيقة) — مستحسن

### 1) قواعد Firestore القديمة (إلزامي للوصول السريع)

Firebase Console → **Firestore** → **Rules** → الصق من الملف:

`firestore.rules.legacy.backup-20261103`

أو:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /{subCollection}/{docId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

→ **Publish**

### 2) الواجهة

- Vercel → **Deployments** → Rollback لآخر نشر **Ready** قبل مشاكل الـ tenant (أو انتظر آخر push مع «وضع استعادة»).
- الموقع → **Ctrl+Shift+R**.

### 3) الدخول

- **مدير:** `admin@layali.cafe` + كلمة المرور.
- **موظف:** كلمة الموظف من `REACT_APP_EMPLOYEE_PASSWORD` (مع حذف `REACT_APP_CASHIER_EMAIL` من Vercel إن أردت الطريقة القديمة).

### 4) تحقق العملاء

- من التطبيق: شاشة العملاء / الديون.
- من Console: `users/RqZNBvxPqTVNS2j2dLyDZ1DActK2/customers` — العدد يجب أن يطابق.

---

## الخطة ب — إن وُجدت نسخة احتياطية **قبل أمس**

1. Firebase Console أو GCS → موقع التصدير `…/YYYY-MM-DD/`.
2. **استيراد** إلى نفس المشروع (أو مشروع تجريبي أولاً) — يتطلب غالباً **Blaze** + bucket.
3. **لا تستورد فوق الإنتاج** دون فهم أن المستندات تُستبدل حسب معرّفها.

لا نسخة في هذا المستودع = لا يمكننا تنفيذ الاستيراد من هنا.

---

## الخطة ج — إن كانت المجموعات **فارغة فعلاً** في Console

هذا يعني حذفاً حقيقياً وليس «شاشة فارغة»:

- راجع **Google Cloud** / Firebase هل يوجد **scheduled export**.
- راجع أجهزة أخرى / تقارير PDF / Excel محفوظة محلياً.
- Blaze **PITR**: استعادة لنقطة زمنية (مدفوع).

بدون أحد هذه المصادر، **لا يمكن** استعادة أمس من Firebase تلقائياً.

---

## مستندات tenant (`tenants`, `userTenants`)

لا تحذف بيانات `users/.../customers`. إن أردت العودة 100% للسلوك القديم مع القواعد القديمة فقط، يمكنك لاحقاً حذف `tenants` و`userTenants` يدوياً — **بعد** تأكد أن التطبيق يعمل (اختياري).

---

## دعم

بعد الخطة أ، إن العملاء **لا** يظهرون في التطبيق رغم وجودهم في Console: أرسل لقطة **F12 Console** (بدون كلمات مرور).