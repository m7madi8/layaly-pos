/**
 * Arabic UI strings — only inside quotes or JSX text (won't touch identifiers).
 */
const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'src', 'App.js');
let s = fs.readFileSync(appPath, 'utf8');

if (!s.includes('./branding')) {
  s = s.replace(
    /import logo from '\.\/logo\.png';[^\n]*\n/,
    "import { APP_NAME, APP_TAGLINE, APP_LOGO, FONT_UI, FONT_HEADING } from './branding';\nimport { fmtMoney, orderFilterLabel, orderStatusLabel, categoryLabel } from './i18n';\n"
  );
  s = s.replace(/const APP_LOGO = logo;\n\n?/, '');
}

const quoted = [
  ['Krema POS', 'ليالي كافيه'],
  ['Powered by Krema POS', 'ليالي كافيه'],
  ['KREMA', 'ليالي كافيه'],
  ['Point of Sale System', 'نظام نقاط البيع'],
  ['Point of Sale', 'نقاط البيع'],
  ['Loading...', 'جاري التحميل...'],
  ['Log In', 'تسجيل الدخول'],
  ['Sign Up', 'إنشاء حساب'],
  ['Sign In', 'دخول'],
  ['Sign Out', 'تسجيل الخروج'],
  ['Forgot Password?', 'نسيت كلمة المرور؟'],
  ['Back', 'رجوع'],
  ['Create Account', 'إنشاء الحساب'],
  ['Creating Account...', 'جاري إنشاء الحساب...'],
  ['Guest', 'ضيف'],
  ['your@email.com', 'name@example.com'],
  ['e.g. Cafe Krema', 'مثال: ليالي كافيه'],
  ['e.g. Coffee Shop', 'مثال: مقهى'],
  ['Your name', 'اسمك'],
  ['Dashboard', 'لوحة التحكم'],
  ['POS', 'نقطة البيع'],
  ['Orders', 'الطلبات'],
  ['Inventory', 'المخزون'],
  ['Expenses', 'المصروفات'],
  ['Reports', 'التقارير'],
  ['Settings', 'الإعدادات'],
  ['Email', 'البريد الإلكتروني'],
  ['Password', 'كلمة المرور'],
  ['Business Name', 'اسم المنشأة'],
  ['Business Type', 'نوع النشاط'],
  ['Owner Name', 'اسم المالك'],
  ['Phone', 'الجوال'],
  ['Address', 'العنوان'],
  ['Menu', 'القائمة'],
  ['Save', 'حفظ'],
  ['Cancel', 'إلغاء'],
  ['Edit', 'تعديل'],
  ['Print', 'طباعة'],
  ['Paid', 'مدفوع'],
  ['Unpaid', 'غير مدفوع'],
  ['Cancelled', 'ملغى'],
  ['Total', 'الإجمالي'],
  ['Search products...', 'بحث في المنتجات...'],
  ['Customer name', 'اسم العميل'],
  ['Order notes (optional)', 'ملاحظات (اختياري)'],
  ['Current Order', 'الطلب الحالي'],
  ['Pay Now', 'ادفع الآن'],
  ['Add Discount', 'إضافة خصم'],
  ['Add Product', 'إضافة منتج'],
  ['My Products', 'منتجاتي'],
  ['Owner', 'المالك'],
  ['Thank You!\\n', 'شكراً لزيارتكم!\\n'],
  ['Subtotal', 'المجموع الفرعي'],
  ['Discount', 'الخصم'],
  ['Compliment', 'مجاني'],
  ['Cash', 'نقداً'],
  ['Other', 'أخرى'],
];

const jsxText = [
  ['Dashboard Overview', 'نظرة عامة'],
  ['Setup Your Business Profile', 'إعداد ملف المنشأة'],
  ['Business Logo (Optional)', 'شعار المنشأة (اختياري)'],
  ['Upload Logo', 'رفع الشعار'],
  ['Low Stock Alert', 'تنبيه مخزون منخفض'],
  ['Unpaid Orders', 'طلبات غير مدفوعة'],
  ['Total Paid Sales', 'إجمالي المبيعات المدفوعة'],
  ['Total Transactions', 'عدد العمليات'],
  ['Products Sold', 'المنتجات المباعة'],
  ['Select Payment Method', 'اختر طريقة الدفع'],
  ['Complete Payment', 'إتمام الدفع'],
  ['Cash Payment', 'دفع نقدي'],
  ['Stock:', 'المخزون:'],
  ['No orders found for this period', 'لا طلبات في هذه الفترة'],
  ['View Order &rarr;', 'عرض الطلب ←'],
  [' Items', ' قطعة'],
  ['Start Date', 'من تاريخ'],
  ['End Date', 'إلى تاريخ'],
  ['Payment:', 'الدفع:'],
  ['Note:', 'ملاحظة:'],
];

for (const [from, to] of quoted) {
  for (const q of ["'", '"', '`']) {
    s = s.split(`${q}${from}${q}`).join(`${q}${to}${q}`);
  }
}

for (const [from, to] of jsxText) {
  s = s.split(`>${from}<`).join(`>${to}<`);
}

s = s.replace(/Rp \{([^}]+)\}/g, '{fmtMoney($1)}');

s = s.replace(
  /\{filter === 'lastWeek' \? 'Last 7 Days' : filter\.charAt\(0\)\.toUpperCase\(\) \+ filter\.slice\(1\)\}/g,
  '{orderFilterLabel(filter)}'
);
s = s.replace(
  /\{status\.charAt\(0\)\.toUpperCase\(\) \+ status\.slice\(1\)\}/g,
  '{orderStatusLabel(status)}'
);
s = s.replace(
  /\{cat\.charAt\(0\)\.toUpperCase\(\) \+ cat\.slice\(1\)\}/g,
  '{categoryLabel(cat)}'
);

s = s.replace(
  /fixed top-0 left-0 h-full text-white flex flex-col border-r border-gray-800/g,
  'fixed top-0 right-0 h-full text-white flex flex-col border-l border-gray-800'
);
s = s.replace(
  /w-0 -translate-x-full lg:w-20 lg:translate-x-0/g,
  'w-0 translate-x-full lg:w-20 lg:translate-x-0'
);

fs.writeFileSync(appPath, s);
console.log('Safe arabize done.');
