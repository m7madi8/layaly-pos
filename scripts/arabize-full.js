/**
 * Replace remaining English UI strings in src (quoted + JSX text only).
 */
const fs = require('fs');
const path = require('path');

const files = [
  path.join(__dirname, '..', 'src', 'App.js'),
  path.join(__dirname, '..', 'src', 'components', 'CustomersView.js'),
];

const pairs = [
  // Auth & loading
  ['Loading...', 'جاري التحميل...'],
  ['Email', 'البريد الإلكتروني'],
  ['Password', 'كلمة المرور'],
  ['Business Name *', 'اسم المنشأة *'],
  ['Business Type *', 'نوع النشاط *'],
  ['Owner Name *', 'اسم المالك *'],
  ['Phone *', 'الجوال *'],
  ['Address', 'العنوان'],
  ['Full address', 'العنوان الكامل'],
  ['+62 xxx xxxx xxxx', '05xxxxxxxx'],
  ['Upload Logo', 'رفع الشعار'],
  ['Setting up...', 'جاري الإعداد...'],
  ['Complete Setup', 'إكمال الإعداد'],
  ['Please enter your email address.', 'يرجى إدخال البريد الإلكتروني.'],
  ['Password reset email sent! Check your inbox.', 'تم إرسال رابط إعادة تعيين كلمة المرور — راجع بريدك.'],
  ['Store settings updated successfully!', 'تم حفظ إعدادات المتجر بنجاح!'],
  ['Failed to delete expense', 'تعذّر حذف المصروف'],
  ['Are you sure you want to delete this product?', 'هل تريد حذف هذا الصنف؟'],
  ['Failed to delete product', 'تعذّر حذف الصنف'],
  ['Delete this ingredient?', 'حذف هذا المكوّن؟'],
  ['Are you sure you want to delete this order history? This cannot be undone.', 'حذف هذا الطلب من السجل؟ لا يمكن التراجع.'],
  ['Order deleted. Stock was not automatically restored.', 'تم حذف الطلب. لم يُسترجَع المخزون تلقائياً.'],
  ['Failed to delete order', 'تعذّر حذف الطلب'],
  ['No orders to re-index.', 'لا توجد طلبات لإعادة ترقيمها.'],
  ['Successfully re-indexed ${newCount} orders.', 'تم إعادة ترقيم ${newCount} طلباً بنجاح.'],
  ['Failed to re-index orders: ', 'فشل إعادة الترقيم: '],
  ['Are you sure you want to cancel this order?', 'هل تريد إلغاء هذا الطلب؟'],
  ['Failed to cancel order', 'تعذّر إلغاء الطلب'],
  ['Bluetooth printing is not supported on this browser. On iOS (iPad/iPhone), please use a Web Bluetooth enabled browser like \'Bluefy\'.', 'الطباعة عبر Bluetooth غير مدعومة في هذا المتصفح. على iOS استخدم متصفحاً يدعم Web Bluetooth مثل Bluefy.'],
  ['✅ Receipt printed!', '✅ تمت طباعة الإيصال!'],
  ['❌ Print error: ${error.message}', '❌ خطأ في الطباعة: ${error.message}'],
  ['This will re-number all your orders sequentially based on their date. This cannot be undone. Continue?', 'سيتم إعادة ترقيم جميع الطلبات حسب التاريخ. لا يمكن التراجع. هل تتابع؟'],

  // Dashboard
  ['Notifications', 'الإشعارات'],
  ['No new notifications', 'لا إشعارات جديدة'],
  ['Welcome back, here is what\'s happening with your store today.', 'مرحباً، هذا ملخص نشاط متجرك اليوم.'],
  ['Pending', 'معلّق'],
  ['Avg. Transaction Value', 'متوسط قيمة العملية'],
  ['Avg. Items / Transaction', 'متوسط الأصناف / عملية'],
  ['Low Stock Items', 'أصناف منخفضة المخزون'],
  ['Sales Trend', 'اتجاه المبيعات'],
  ['Last 7 Days', 'آخر 7 أيام'],
  ['Payment Methods', 'طرق الدفع'],
  ['No payment data yet', 'لا بيانات دفع بعد'],
  ['Best Sellers', 'الأكثر مبيعاً'],
  ['Product', 'الصنف'],
  ['Sold', 'مباع'],
  ['No sales data', 'لا بيانات مبيعات'],
  ['Sales by Category', 'المبيعات حسب القسم'],
  ['Revenue', 'الإيراد'],
  ['No category data', 'لا بيانات أقسام'],
  ['Today\'s Sales Details', 'تفاصيل مبيعات اليوم'],
  ['Time', 'الوقت'],
  ['Order #', 'رقم الطلب'],
  ['Customer', 'العميل'],
  ['Items', 'الأصناف'],
  ['Total', 'الإجمالي'],
  ['Status', 'الحالة'],
  ['No sales today', 'لا مبيعات اليوم'],
  [' orders are pending payment.', ' طلبات بانتظار الدفع.'],
  ['Unpaid Orders Alert', 'تنبيه طلبات غير مدفوعة'],
  ['Low Stock Alert', 'تنبيه مخزون منخفض'],
  [' items are running low on stock.', ' أصناف بمخزون منخفض.'],

  // Settings
  ['Account Settings', 'إعدادات الحساب'],
  ['Store Settings', 'إعدادات المتجر'],
  ['Edit Profile', 'تعديل الملف'],
  ['Business Information', 'معلومات المنشأة'],
  ['Business Name', 'اسم المنشأة'],
  ['Business Type', 'نوع النشاط'],
  ['Phone', 'الجوال'],
  ['Account Details', 'تفاصيل الحساب'],
  ['Owner Name', 'اسم المالك'],
  ['Reset Password via Email', 'إعادة تعيين كلمة المرور بالبريد'],
  ['Statistics', 'إحصائيات'],
  ['Products', 'المنتجات'],
  ['Total Orders', 'إجمالي الطلبات'],
  ['Total Revenue', 'إجمالي الإيرادات'],
  ['Total Profit', 'إجمالي الربح'],
  ['Edit Business Profile', 'تعديل ملف المنشأة'],
  ['Receipt Header', 'رأس الإيصال'],
  ['Receipt Footer', 'ذيل الإيصال'],
  ['Message at top of receipt', 'رسالة أعلى الإيصال'],
  ['Message at bottom of receipt', 'رسالة أسفل الإيصال'],
  ['Round Total to Nearest Whole Number', 'تقريب الإجمالي لأقرب عدد صحيح'],
  ['Reset Password', 'إعادة تعيين كلمة المرور'],
  ['Email Address', 'البريد الإلكتروني'],
  ['Set Discount', 'تعيين الخصم'],
  ['Saving...', 'جاري الحفظ...'],
  ['Save Changes', 'حفظ التعديلات'],
  ['Cancel', 'إلغاء'],

  // Reports
  ['Reports', 'التقارير'],
  ['Last 30 Days', 'آخر 30 يوم'],
  ['Gross Profit', 'إجمالي الربح'],
  ['Margin: ', 'الهامش: '],
  ['Total Expenses', 'إجمالي المصروفات'],
  ['Net Profit', 'صافي الربح'],
  ['Total Items Sold', 'إجمالي الأصناف المباعة'],
  ['Total Discounts', 'إجمالي الخصومات'],
  ['Compliments Given', 'إهداءات مجانية'],
  ['Sales by Payment Method', 'المبيعات حسب طريقة الدفع'],
  ['Top Selling Products', 'الأكثر مبيعاً'],
  ['Expenses in Period', 'مصروفات الفترة'],
  ['No expenses in this period', 'لا مصروفات في هذه الفترة'],
  ['Products Sold Details', 'تفاصيل الأصناف المباعة'],
  ['Product Name', 'اسم الصنف'],
  ['Quantity', 'الكمية'],
  ['No sales data available for this period', 'لا بيانات مبيعات لهذه الفترة'],
  ['No sales in this period', 'لا مبيعات في هذه الفترة'],
  ['No products sold in this period', 'لم تُبَع أصناف في هذه الفترة'],
  ['Export CSV', 'تصدير CSV'],
  ['Generated', 'تاريخ التقرير'],
  ['Period', 'الفترة'],
  ['Summary', 'ملخص'],
  ['Metric', 'المؤشر'],
  ['Value', 'القيمة'],

  // Orders
  ['Cancel', 'إلغاء'],
  ['Edit', 'تعديل'],
  ['Print', 'طباعة'],
  ['No orders found for this period', 'لا طلبات في هذه الفترة'],

  // Inventory
  ['Search products in inventory...', 'بحث في المخزون...'],
  ['Showing ${filteredInventory.length} of ${products.length} products', 'عرض {filteredInventory.length} من {products.length} صنف'],
  ['Stock: ', 'المخزون: '],

  // Product modal
  ['Copy from existing product', 'نسخ من صنف موجود'],
  ['Select a product to copy...', 'اختر صنفاً للنسخ...'],
  [' (Copy)', ' (نسخة)'],
  ['Calculate from Ingredients', 'حساب من المكوّنات'],
  ['Estimated Profit', 'الربح التقديري'],
  ['Margin', 'الهامش'],
  ['Add-ons / Variants', 'إضافات / خيارات'],
  ['+ Add Group', '+ مجموعة'],
  ['Group Name (e.g. Sugar)', 'اسم المجموعة (مثال: سكر)'],
  ['Single Choice', 'اختيار واحد'],
  ['Multiple Choice', 'اختيار متعدد'],
  ['Option Name', 'اسم الخيار'],
  ['Selling Price', 'سعر البيع'],
  ['Cost (Auto-calc)', 'التكلفة (تلقائي)'],
  ['Ingredient Cost Calculator', 'حاسبة تكلفة المكوّن'],
  ['Batch Price', 'سعر الدفعة'],
  ['Batch Qty', 'كمية الدفعة'],
  ['Usage Qty', 'كمية الاستخدام'],
  ['Estimated Profit:', 'الربح التقديري:'],
  ['+ Add Option', '+ خيار'],
  ['Calculate Cost', 'حساب التكلفة'],
  ['Ingredient Name (e.g. Milk)', 'اسم المكوّن (مثال: حليب)'],
  ['Batch Price (Rp)', 'سعر الدفعة (₪)'],
  ['No ingredients added yet', 'لم تُضف مكوّنات بعد'],
  ['+ Add Ingredient', '+ مكوّن'],
  ['Total Calculated Cost:', 'إجمالي التكلفة المحسوبة:'],
  ['Save Cost & Return', 'حفظ التكلفة والعودة'],
  ['Cost: ', 'التكلفة: '],
  ['Add to Order - ', 'إضافة للطلب — '],

  // Misc UI
  ['Unknown', 'غير محدد'],
  ['View', 'عرض'],
  ['Delete', 'حذف'],
  ['Re-index Orders', 'إعادة ترقيم الطلبات'],
  ['Download Report', 'تنزيل التقرير'],
  ['Firebase & Data', 'Firebase والبيانات'],
  ['Migrate Demo Data', 'نقل بيانات التجربة'],
  ['Clear All Customers', 'مسح كل العملاء'],
  ['+ Paid', 'مدفوع'],
  [' products are running low on stock.', ' أصناف بمخزون منخفض.'],
  [' orders are pending payment.', ' طلبات بانتظار الدفع.'],
  ['Setup Your Business Profile', 'إعداد ملف المنشأة'],
  ['This information will be used on your receipts', 'تُستخدم هذه البيانات على الإيصالات'],
  ['Edit Business Profile', 'تعديل ملف المنشأة'],
  ['Update Logo', 'تحديث الشعار'],
  ['Choose new logo', 'اختر شعاراً جديداً'],
  ['Updating...', 'جاري التحديث...'],
  ['Back', 'رجوع'],
  ['Forgot Password?', 'نسيت كلمة المرور؟'],
  ['Enter your email address and we\'ll send you a link to reset your password.', 'أدخل بريدك وسنرسل رابطاً لإعادة تعيين كلمة المرور.'],
  ['Send Reset Link', 'إرسال رابط إعادة التعيين'],
  ['Percentage (%)', 'نسبة مئوية (%)'],
  ['Amount (Rp)', 'مبلغ (₪)'],
  ['Discount Percentage (%)', 'نسبة الخصم (%)'],
  ['Discount Amount (Rp)', 'مبلغ الخصم (₪)'],
  ['Apply Discount', 'تطبيق الخصم'],
  ['Save Settings', 'حفظ الإعدادات'],
  ['Re-index Order Numbers (Fix Gaps)', 'إعادة ترقيم الطلبات (إصلاح الفجوات)'],
  ['Export Report', 'تصدير التقرير'],
  [' sold', ' مباع'],
  [' items', ' أصناف'],
  ['Margin: ', 'الهامش: '],
  ['OpEx + COGS: ', 'مصروفات + تكلفة: '],
  ['name@example.com', 'example@email.com'],
  ['1000 (ml/g)', '1000 (مل/غ)'],
  ['250 (ml/g)', '250 (مل/غ)'],
  ['Sales Report', 'تقرير المبيعات'],
  ['Filter: ', 'الفترة: '],
  ['Summary Metrics', 'ملخص المؤشرات'],
  ['Total Revenue (Gross)', 'إجمالي الإيرادات'],
  ['Net Sales', 'صافي المبيعات'],
  ['Total Cost (COGS)', 'إجمالي التكلفة'],
  ['Key Performance Indicators', 'مؤشرات الأداء'],
  ['Total Transactions', 'عدد العمليات'],
  ['Gross Profit Margin', 'هامش إجمالي الربح'],
  ['Net Profit Margin', 'هامش صافي الربح'],
  ['Method', 'الطريقة'],
  ['Expenses List', 'قائمة المصروفات'],
  ['Date', 'التاريخ'],
  ['Category', 'الفئة'],
  ['Description', 'البيان'],
  ['Amount', 'المبلغ'],
];

function applyReplacements(content) {
  let s = content;
  // Sort by length descending to avoid partial replacements
  const sorted = [...pairs].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of sorted) {
    for (const q of ["'", '"', '`']) {
      s = s.split(`${q}${from}${q}`).join(`${q}${to}${q}`);
    }
    s = s.split(`>${from}<`).join(`>${to}<`);
    s = s.split(`title="${from}"`).join(`title="${to}"`);
    s = s.split(`placeholder="${from}"`).join(`placeholder="${to}"`);
  }
  return s;
}

for (const filePath of files) {
  if (!fs.existsSync(filePath)) continue;
  let s = fs.readFileSync(filePath, 'utf8');
  s = applyReplacements(s);
  fs.writeFileSync(filePath, s);
  console.log('Arabized:', path.relative(process.cwd(), filePath));
}

console.log('Done.');
