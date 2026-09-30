import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { APP_NAME, APP_TAGLINE, APP_LOGO, resolveAppLogo, FONT_UI, FONT_HEADING, theme } from './branding';
import { fmtMoney, fmtMoneyPlain, orderFilterLabel, orderStatusLabel, categoryLabel, paymentMethodLabel, paymentTypeLabel, expenseCategoryLabel, expenseFilterLabel, reportFilterLabel } from './i18n';
import {
  OPERATING_EXPENSE_CATEGORIES,
  PURCHASE_CATEGORY,
  resolveExpenseSection,
  defaultExpenseForm,
} from './expenseConfig';
import PosProductCard from './components/PosProductCard';
import CustomersView from './components/CustomersView';
import { MENU_CATEGORIES, mergeMenuCategories, buildPosMenuTabs } from './productAssets';
import { ShoppingCart, Package, BarChart3, FileText, User, Search, Plus, X, DollarSign, ShoppingBag, AlertCircle, Upload, Printer, LogOut, Settings, Calendar, Clock, Trash2, Percent, TrendingDown, Users, Calculator, Pencil, Download, Eye, EyeOff, Menu, Gift, ChevronDown, ChevronUp, Bell, Truck } from 'lucide-react';

import {
  auth,
  db,
  isDemoMode,
  isFirebaseConfigured,
  isCloudUnavailable,
  firebaseConnectionInfo,
  collection,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp,
  onSnapshot,
  setDoc,
  runTransaction,
  writeBatch,
  onAuthStateChanged,
  signInWithAdminPassword,
  signOut,
} from './firebaseClient';
import { fileToStoredDataUrl } from './utils/fileToDataUrl';
import {
  hasLocalDemoData,
  migrateLocalDemoToFirebase,
  wasDemoMigratedForUser,
} from './migrateDemoToFirebase';
import CloudConfigRequired from './components/CloudConfigRequired';
import { mapFirebaseAuthError } from './authErrors';
import {
  EMPLOYEE_LOGIN_PASSWORD,
  EMPLOYEE_VIEWS,
  normalizeLoginPassword,
  readSessionRole,
  saveSessionRole,
} from './adminAuth';
import { printReceiptViaBrowser } from './utils/printReceiptBrowser';
import { downloadBusinessReportPdf } from './utils/businessReportPdf';
import { downloadCustomersLedgerPdf } from './utils/customersLedgerPdf';

const LOW_STOCK_THRESHOLD = 10;

function layoutNotificationPanel(anchor) {
  const margin = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (vw < 640) {
    return {
      sheet: true,
      style: {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        top: 'auto',
        width: 'auto',
        maxHeight: 'min(85dvh, 36rem)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      },
    };
  }

  const width = Math.min(380, Math.max(0, vw - margin * 2));
  const rect = anchor?.getBoundingClientRect();
  let left = margin;
  let top = 76;
  let maxHeight = Math.min(448, Math.max(160, vh - margin * 2));

  if (rect) {
    left = rect.left;
    if (left + width > vw - margin) left = vw - margin - width;
    if (left < margin) left = margin;

    const below = rect.bottom + 8;
    const spaceBelow = vh - below - margin;
    if (spaceBelow >= 220) {
      top = below;
      maxHeight = Math.min(448, spaceBelow);
    } else {
      const spaceAbove = Math.max(0, rect.top - margin - 8);
      maxHeight = Math.min(448, Math.max(spaceAbove, spaceBelow));
      top = spaceAbove >= spaceBelow
        ? Math.max(margin, rect.top - 8 - maxHeight)
        : below;
    }
  }

  if (top + maxHeight > vh - margin) {
    top = Math.max(margin, vh - margin - maxHeight);
  }
  if (top + maxHeight > vh - margin) {
    maxHeight = Math.max(120, vh - margin - top);
  }

  return {
    sheet: false,
    style: {
      position: 'fixed',
      left,
      top,
      right: 'auto',
      bottom: 'auto',
      width,
      maxHeight,
    },
  };
}

const AppCore = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('pos');
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [, setIngredients] = useState([]);
  const [currentOrder, setCurrentOrder] = useState({ items: [], customer: '', customerId: '', notes: '' });
  const [customers, setCustomers] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState('percentage'); // 'percentage' or 'amount'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showProductModal, setShowProductModal] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [userRole, setUserRole] = useState(readSessionRole);
  const [loginType, setLoginType] = useState('employee');
  const [productForm, setProductForm] = useState({ name: '', category: '', price: '', stock: '', cost: '', addOns: [] });
  const [editingProductId, setEditingProductId] = useState(null);
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [editingExpenseId, setEditingExpenseId] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const [reportPdfLoading, setReportPdfLoading] = useState(false);
  const [customersLedgerPdfLoading, setCustomersLedgerPdfLoading] = useState(false);
  const [businessProfile, setBusinessProfile] = useState(null);
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [profileForm, setProfileForm] = useState({
    businessName: '',
    businessType: '',
    address: '',
    phone: '',
    email: '',
    ownerName: ''
  });
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [orderFilter, setOrderFilter] = useState('all');
  const [customDateRange, setCustomDateRange] = useState({ start: '', end: '' });
  const [inventorySearchTerm, setInventorySearchTerm] = useState('');
  const [productIngredients, setProductIngredients] = useState([]);
  const [showIngredientModal, setShowIngredientModal] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [expenseForm, setExpenseForm] = useState(() => defaultExpenseForm('operating'));
  const [expenseReceiptFile, setExpenseReceiptFile] = useState(null);
  const [supplierForm, setSupplierForm] = useState({ name: '', contactPerson: '', phone: '', email: '', address: '' });
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [appSettings, setAppSettings] = useState({
    tax: 0,
    serviceCharge: 0,
    receiptHeader: '',
    receiptFooter: '',
    receiptQrCode: '',
    paymentMethods: { cash: true, qris: true, debit: true, credit: true },
    rounding: false
  });
  const [reportFilter, setReportFilter] = useState('today');
  const [reportCustomDates, setReportCustomDates] = useState({ start: '', end: '' });
  const [showAddonModal, setShowAddonModal] = useState(false);
  const [pendingAddonProduct, setPendingAddonProduct] = useState(null);
  const [addonSelections, setAddonSelections] = useState({});
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [, setPaymentCustomPrice] = useState('');
  const [finalTotalForPayment, setFinalTotalForPayment] = useState(0);

  const [selectedInventoryCategory, setSelectedInventoryCategory] = useState('all');
  const [orderStatusFilter, setOrderStatusFilter] = useState('all');

  const [showCashModal, setShowCashModal] = useState(false);
  const [cashGiven, setCashGiven] = useState('');
  const [showMixedPaymentModal, setShowMixedPaymentModal] = useState(false);
  const [mixedCashAmount, setMixedCashAmount] = useState('');
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [expandedOrderIds, setExpandedOrderIds] = useState([]);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [bluetoothDevice, setBluetoothDevice] = useState(null);
  const [printCharacteristic, setPrintCharacteristic] = useState(null);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notificationLayout, setNotificationLayout] = useState(null);
  const [lowStockExpanded, setLowStockExpanded] = useState(false);
  const notificationButtonRef = useRef(null);
  const [expenseFilter, setExpenseFilter] = useState('all');
  const [expenseCustomDateRange, setExpenseCustomDateRange] = useState({ start: '', end: '' });

  // Inject Fonts
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);

  useEffect(() => {
    if (!showNotifications) return undefined;

    const update = () => {
      setNotificationLayout(layoutNotificationPanel(notificationButtonRef.current));
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setShowNotifications(false);
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      document.removeEventListener('keydown', onKey);
    };
  }, [showNotifications]);

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (!currentUser) {
        setLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Profile listener
  useEffect(() => {
    if (user) {
      const profileRef = doc(db, 'users', user.uid);
      const unsubProfile = onSnapshot(profileRef, (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          setBusinessProfile(data);
          setAppSettings({
            tax: 0,
            serviceCharge: 0,
            receiptHeader: data.receiptHeader || '',
            receiptFooter: data.receiptFooter || '',
            receiptQrCode: data.receiptQrCode || '',
            paymentMethods: data.paymentMethods || { cash: true, qris: true, debit: true, credit: true },
            rounding: data.rounding || false
          });
          setProfileForm(prev => ({ ...prev, ...data }));
        } else {
          setShowProfileSetup(true);
        }
        setLoading(false);
      }, (error) => {
        console.error("Error loading profile:", error);
        // If profile fails to load (e.g. permission error), show setup to allow retry
        setShowProfileSetup(true);
        setLoading(false);
      });
      return () => unsubProfile();
    }
  }, [user]);

  // Load products
  useEffect(() => {
    if (!user) return;
    
    const unsubscribe = onSnapshot(
      collection(db, 'users', user.uid, 'products'),
      (snapshot) => {
        const productsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProducts(productsData);
      },
      (error) => {
        console.error("Error loading products:", error);
      }
    );
    
    return () => unsubscribe();
  }, [user]);

  // Load orders
  useEffect(() => {
    if (!user) return;
    
    const unsubscribe = onSnapshot(
      query(collection(db, 'users', user.uid, 'orders'), orderBy('timestamp', 'desc')),
      (snapshot) => {
        const ordersData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setOrders(ordersData);
      },
      (error) => {
        console.error("Error loading orders:", error);
      }
    );
    
    return () => unsubscribe();
  }, [user]);

  // Load ingredients
  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, 'users', user.uid, 'ingredients'),
      (snapshot) => {
        setIngredients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      }
    );
    return () => unsubscribe();
  }, [user]);

  // Load expenses
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'expenses'), orderBy('date', 'desc'));
    const unsubscribe = onSnapshot(q, snapshot => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Error loading expenses:", error);
    });
    return () => unsubscribe();
  }, [user]);

  // Load suppliers
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'suppliers'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, snapshot => {
      setSuppliers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Error loading suppliers:", error);
    });
    return () => unsubscribe();
  }, [user]);

  // Load customers
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'users', user.uid, 'customers'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setCustomers(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (error) => console.error('Error loading customers:', error)
    );
    return () => unsubscribe();
  }, [user]);

  const startRoleSession = (role) => {
    saveSessionRole(role);
    setUserRole(role);
    setCurrentView(role === 'employee' ? 'pos' : 'dashboard');
    setAdminPassword('');
    setShowPassword(false);
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    const password = normalizeLoginPassword(adminPassword);
    if (!password) return;
    setUploadProgress(true);
    try {
      await signInWithAdminPassword(auth, password);
      startRoleSession('admin');
    } catch (error) {
      alert(mapFirebaseAuthError(error));
    } finally {
      setUploadProgress(false);
    }
  };

  const handleEmployeeLogin = (e) => {
    e.preventDefault();
    const password = normalizeLoginPassword(adminPassword);
    if (!password) return;
    if (password !== EMPLOYEE_LOGIN_PASSWORD) {
      alert('كلمة مرور الموظف غير صحيحة');
      return;
    }
    if (!user) {
      alert('هذا الجهاز غير مربوط بعد. ادخل من تبويب «مدير» مرة واحدة، ثم اخرج، وبعدها يقدر الموظف يدخل.');
      return;
    }
    startRoleSession('employee');
  };

  const handleLogout = () => {
    saveSessionRole(null);
    setUserRole(null);
    setLoginType('employee');
  };

  const handleDisconnectDevice = async () => {
    if (!window.confirm('فصل هذا الجهاز عن حساب المقهى؟ بعدها لازم المدير يدخل من جديد قبل ما يقدر الموظف يدخل.')) return;
    try {
      saveSessionRole(null);
      setUserRole(null);
      await signOut(auth);
    } catch (error) {
      alert(error.message);
    }
  };

  // Profile setup
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setUploadProgress(true);
    
    try {
      const profileData = {
        ...profileForm,
        logoUrl: APP_LOGO,
        updatedAt: serverTimestamp(),
      };
      
      await setDoc(doc(db, 'users', user.uid), profileData, { merge: true });
      setBusinessProfile(prev => ({ ...prev, ...profileData }));
      setShowProfileSetup(false);
      setShowAccountModal(false);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadProgress(false);
    }
  };

  // Expense and Supplier Handlers
  const openExpenseModalForSection = (section) => {
    setExpenseForm(defaultExpenseForm(section));
    setEditingExpenseId(null);
    setExpenseReceiptFile(null);
    setShowExpenseModal(true);
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    const section = expenseForm.section || resolveExpenseSection(expenseForm);
    if (section === 'purchase' && !expenseForm.supplierId) {
      alert('يرجى اختيار التاجر للمشتريات');
      return;
    }
    setUploadProgress(true);
    try {
      let receiptUrl = expenseForm.receiptUrl || '';
      if (expenseReceiptFile) {
        receiptUrl = await fileToStoredDataUrl(expenseReceiptFile);
      }

      const category =
        section === 'purchase' ? PURCHASE_CATEGORY : expenseForm.category;

      const expenseData = {
        amount: parseFloat(expenseForm.amount),
        date: new Date(expenseForm.date),
        section,
        category,
        description: expenseForm.description,
        supplierId: section === 'purchase' ? expenseForm.supplierId : expenseForm.supplierId || '',
        linkedIngredientId: expenseForm.linkedIngredientId || null,
        quantityBought: parseFloat(expenseForm.quantityBought) || 0,
        receiptUrl,
        userId: user.uid,
        updatedAt: serverTimestamp()
      };

      if (editingExpenseId) {
        await updateDoc(doc(db, 'users', user.uid, 'expenses', editingExpenseId), expenseData);
      } else {
        expenseData.createdAt = serverTimestamp();
        await runTransaction(db, async (transaction) => {
          const expenseRef = doc(collection(db, 'users', user.uid, 'expenses'));
          
          let ingRef = null;
          let currentStock = 0;
          
          // If linked to an ingredient, update stock and cost
          if (expenseData.linkedIngredientId && expenseData.quantityBought > 0) {
            ingRef = doc(db, 'users', user.uid, 'ingredients', expenseData.linkedIngredientId);
            const ingDoc = await transaction.get(ingRef);
            if (ingDoc.exists()) {
              currentStock = ingDoc.data().stock || 0;
            }
          }
          
          transaction.set(expenseRef, expenseData);
          if (ingRef) {
            transaction.update(ingRef, { stock: currentStock + expenseData.quantityBought });
          }
        });
      }

      setShowExpenseModal(false);
      setExpenseForm(defaultExpenseForm(currentView === 'purchases' ? 'purchase' : 'operating'));
      setExpenseReceiptFile(null);
      setEditingExpenseId(null);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadProgress(false);
    }
  };

  const handleEditExpense = (expense) => {
    const dateStr = expense.date && expense.date.toDate 
      ? expense.date.toDate().toISOString().split('T')[0] 
      : new Date(expense.date).toISOString().split('T')[0];

    const section = resolveExpenseSection(expense);
    setExpenseForm({
      amount: expense.amount,
      date: dateStr,
      section,
      category: section === 'purchase' ? PURCHASE_CATEGORY : expense.category,
      description: expense.description,
      supplierId: expense.supplierId || '',
      receiptUrl: expense.receiptUrl,
      linkedIngredientId: expense.linkedIngredientId || '',
      quantityBought: expense.quantityBought || 0
    });
    setCurrentView(section === 'purchase' ? 'purchases' : 'expenses');
    setEditingExpenseId(expense.id);
    setShowExpenseModal(true);
  };

  const handleDeleteExpense = async (expenseId) => {
    if (window.confirm('هل تريد حذف هذه العملية؟')) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'expenses', expenseId));
      } catch (error) {
        console.error("Error deleting expense:", error);
        alert("تعذّر حذف المصروف");
      }
    }
  };

  const handleAddSupplier = async (e) => {
    e.preventDefault();
    setUploadProgress(true);
    try {
      await addDoc(collection(db, 'users', user.uid, 'suppliers'), {
        ...supplierForm,
        userId: user.uid,
        createdAt: serverTimestamp()
      });
      setShowSupplierModal(false);
      setSupplierForm({ name: '', contactPerson: '', phone: '', email: '', address: '' });
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadProgress(false);
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setUploadProgress(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        tax: 0,
        serviceCharge: 0,
        receiptHeader: appSettings.receiptHeader,
        receiptFooter: appSettings.receiptFooter,
        receiptQrCode: appSettings.receiptQrCode,
        rounding: appSettings.rounding,
        updatedAt: serverTimestamp()
      });
      setShowSettingsModal(false);
      alert('تم حفظ إعدادات المتجر بنجاح!');
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadProgress(false);
    }
  };

  // Product handlers
  const handleImageChange = (e) => {
    if (e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const productImagePreview = useMemo(() => {
    if (imageFile) return URL.createObjectURL(imageFile);
    return productForm.image || '';
  }, [imageFile, productForm.image]);

  useEffect(() => {
    if (!imageFile || !productImagePreview.startsWith('blob:')) return undefined;
    return () => URL.revokeObjectURL(productImagePreview);
  }, [imageFile, productImagePreview]);

  const openAddProductModal = () => {
    setProductForm({ name: '', category: MENU_CATEGORIES[0] || '', price: '', stock: '', cost: '', addOns: [], image: '' });
    setProductIngredients([]);
    setImageFile(null);
    setEditingProductId(null);
    setShowProductModal(true);
  };

  const isProductFormValid =
    Boolean(productForm.name?.trim()) &&
    Boolean(productForm.category?.trim()) &&
    productForm.price !== '' &&
    !Number.isNaN(parseFloat(productForm.price)) &&
    productForm.stock !== '' &&
    !Number.isNaN(parseFloat(productForm.stock));

  // Add-on Management Handlers
  const addAddonGroup = () => {
    setProductForm(prev => ({
      ...prev,
      addOns: [...(prev.addOns || []), { id: Date.now(), name: '', type: 'single', options: [] }]
    }));
  };

  const updateAddonGroup = (index, field, value) => {
    const newAddons = [...(productForm.addOns || [])];
    newAddons[index] = { ...newAddons[index], [field]: value };
    setProductForm(prev => ({ ...prev, addOns: newAddons }));
  };

  const removeAddonGroup = (index) => {
    const newAddons = [...(productForm.addOns || [])];
    newAddons.splice(index, 1);
    setProductForm(prev => ({ ...prev, addOns: newAddons }));
  };

  const addAddonOption = (groupIndex) => {
    const newAddons = [...(productForm.addOns || [])];
    newAddons[groupIndex].options.push({ name: '', price: '', cost: '', batchPrice: '', batchQty: '', usageQty: '' });
    setProductForm(prev => ({ ...prev, addOns: newAddons }));
  };

  const updateAddonOption = (groupIndex, optionIndex, field, value) => {
    const newAddons = [...(productForm.addOns || [])];
    const option = { ...newAddons[groupIndex].options[optionIndex] };
    
    if (['price', 'cost', 'batchPrice', 'batchQty', 'usageQty'].includes(field)) {
      option[field] = value === '' ? '' : parseFloat(value);
    } else {
      option[field] = value;
    }

    if (['batchPrice', 'batchQty', 'usageQty'].includes(field)) {
      const batchPrice = parseFloat(field === 'batchPrice' ? value : option.batchPrice) || 0;
      const batchQty = parseFloat(field === 'batchQty' ? value : option.batchQty) || 1;
      const usageQty = parseFloat(field === 'usageQty' ? value : option.usageQty) || 0;
      
      if (batchPrice > 0 && usageQty > 0) {
        option.cost = Math.round((batchPrice / batchQty) * usageQty);
      }
    }

    newAddons[groupIndex].options[optionIndex] = option;
    setProductForm(prev => ({ ...prev, addOns: newAddons }));
  };

  const removeAddonOption = (groupIndex, optionIndex) => {
    const newAddons = [...(productForm.addOns || [])];
    newAddons[groupIndex].options.splice(optionIndex, 1);
    setProductForm(prev => ({ ...prev, addOns: newAddons }));
  };

  // Ingredient handlers
  const handleAddIngredient = () => {
    setProductIngredients([...productIngredients, { id: Date.now(), name: '', batchPrice: '', batchQty: '', usageQty: '' }]);
  };

  const handleIngredientChange = (id, field, value) => {
    setProductIngredients(productIngredients.map(ing => 
      ing.id === id ? { ...ing, [field]: value } : ing
    ));
  };

  const handleRemoveIngredient = (id) => {
    setProductIngredients(productIngredients.filter(ing => ing.id !== id));
  };

  const handleSaveIngredientCost = () => {
    const totalCost = productIngredients.reduce((sum, ing) => {
      const batchPrice = parseFloat(ing.batchPrice) || 0;
      const batchQty = parseFloat(ing.batchQty) || 1;
      const usageQty = parseFloat(ing.usageQty) || 0;
      return sum + Math.round((batchPrice / batchQty) * usageQty);
    }, 0);
    setProductForm(prev => ({ ...prev, cost: totalCost }));
    setShowIngredientModal(false);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    setUploadProgress(true);
    
    try {
      let imageUrl = productForm.image || '';
      
      if (imageFile) {
        imageUrl = await fileToStoredDataUrl(imageFile);
      }
      
      const productData = {
        name: productForm.name.trim(),
        category: productForm.category.trim(),
        price: parseFloat(productForm.price),
        cost: parseFloat(productForm.cost || 0),
        stock: parseFloat(productForm.stock),
        image: imageUrl,
        addOns: productForm.addOns || [],
        ingredients: productIngredients || [], // Recipe ingredients
        userId: user.uid,
        updatedAt: serverTimestamp()
      };

      if (editingProductId) {
        await updateDoc(doc(db, 'users', user.uid, 'products', editingProductId), productData);
      } else {
        productData.createdAt = serverTimestamp();
        await addDoc(collection(db, 'users', user.uid, 'products'), productData);
      }
      
      setShowProductModal(false);
      setProductForm({ name: '', category: '', price: '', stock: '', cost: '', addOns: [] });
      setProductIngredients([]);
      setImageFile(null);
      setEditingProductId(null);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadProgress(false);
    }
  };

  const handleEditProduct = (product) => {
    setProductForm({
      name: product.name,
      category: product.category,
      price: product.price,
      stock: product.stock,
      cost: product.cost || 0,
      image: product.image,
      addOns: product.addOns || []
    });
    setProductIngredients(product.ingredients || []); // Load recipe
    setEditingProductId(product.id);
    setShowProductModal(true);
  };

  const handleDeleteProduct = async (productId) => {
    if (window.confirm('هل تريد حذف هذا الصنف؟')) {
      try {
        await deleteDoc(doc(db, 'users', user.uid, 'products', productId));
      } catch (error) {
        console.error("Error deleting product:", error);
        alert("تعذّر حذف الصنف");
      }
    }
  };

  const handleDeleteOrder = async (orderId) => {
    if (window.confirm('حذف هذا الطلب من السجل؟ لا يمكن التراجع.')) {
      setLoading(true);
      try {
        // Note: Re-indexing was removed from here. It's a heavy operation
        // and should be done manually from settings if needed.
        // The transaction to restore stock and delete the order is now handled
        // by a cloud function or should be added back if essential for your workflow.
        // For now, we just delete the document.
        await deleteDoc(doc(db, 'users', user.uid, 'orders', orderId));
        alert('تم حذف الطلب. لم يُسترجَع المخزون تلقائياً.');
      } catch (error) {
        console.error("Error deleting order:", error);
        alert("تعذّر حذف الطلب");
      } finally {
        setLoading(false);
      }
    }
  };

  const handleReindexOrders = async () => {
    if (!window.confirm("سيتم إعادة ترقيم جميع الطلبات حسب التاريخ. لا يمكن التراجع. هل تتابع؟")) return;
    
    setLoading(true);
    try {
      const q = query(collection(db, 'users', user.uid, 'orders'), orderBy('timestamp', 'asc'));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        await setDoc(doc(db, 'users', user.uid, 'counters', 'orders'), { count: 0 }, { merge: true });
        setLoading(false);
        alert("لا توجد طلبات لإعادة ترقيمها.");
        return;
      }

      // Process in batches of 500
      const chunks = [];
      const docs = snapshot.docs;
      for (let i = 0; i < docs.length; i += 500) {
        chunks.push(docs.slice(i, i + 500));
      }

      let newCount = 0;

      for (const chunk of chunks) {
        const batch = writeBatch(db);
        let hasUpdates = false;
        
        for (const docSnapshot of chunk) {
          newCount++;
          const expectedNumber = String(newCount).padStart(4, '0');
          if (docSnapshot.data().orderNumber !== expectedNumber) {
            batch.update(doc(db, 'users', user.uid, 'orders', docSnapshot.id), {
              orderNumber: expectedNumber
            });
            hasUpdates = true;
          }
        }
        
        if (hasUpdates) await batch.commit();
      }
      
      await setDoc(doc(db, 'users', user.uid, 'counters', 'orders'), { count: newCount }, { merge: true });
      alert(`تم إعادة ترقيم ${newCount} طلباً بنجاح.`);
    } catch (error) {
      console.error("Error re-indexing:", error);
      alert("فشل إعادة الترقيم: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelOrder = async (orderId) => {
    if (window.confirm('هل تريد إلغاء هذا الطلب؟')) {
      try {
        await runTransaction(db, async (transaction) => {
          const orderRef = doc(db, 'users', user.uid, 'orders', orderId);
          const orderDoc = await transaction.get(orderRef);
          if (!orderDoc.exists()) throw new Error("Order not found");
          
          const orderData = orderDoc.data();
          if (orderData.status === 'cancelled') return;

          // Read all products first
          const productUpdates = [];
          for (const item of orderData.items) {
            const productRef = doc(db, 'users', user.uid, 'products', item.id);
            const productDoc = await transaction.get(productRef);
            if (productDoc.exists()) {
              const currentStock = productDoc.data().stock || 0;
              productUpdates.push({ ref: productRef, newStock: currentStock + item.quantity });
            }
          }

          // Perform writes
          for (const update of productUpdates) {
            transaction.update(update.ref, { stock: update.newStock });
          }

          transaction.update(orderRef, { status: 'cancelled' });
        });
      } catch (error) {
        console.error("Error cancelling order:", error);
        alert("تعذّر إلغاء الطلب");
      }
    }
  };

  // Order handlers
  const addToOrder = (product) => {
    if (product.addOns && product.addOns.length > 0) {
      setPendingAddonProduct(product);
      // Initialize selections
      const initialSelections = {};
      product.addOns.forEach(group => {
        if (group.type === 'single' && group.options.length > 0) {
           initialSelections[group.name] = [group.options[0]];
        } else {
           initialSelections[group.name] = [];
        }
      });
      setAddonSelections(initialSelections);
      setShowAddonModal(true);
    } else {
      addItemToCart(product, []);
    }
  };

  const addItemToCart = (product, selectedAddons) => {
    const addonsPrice = selectedAddons.reduce((sum, addon) => sum + (parseFloat(addon.price) || 0), 0);
    const addonsCost = selectedAddons.reduce((sum, addon) => sum + (parseFloat(addon.cost) || 0), 0);
    const finalPrice = product.price + addonsPrice;
    const finalCost = (product.cost || 0) + addonsCost;
    
    // Create a unique ID for cart item based on product ID and selected add-ons
    const cartItemId = selectedAddons.length > 0 
      ? `${product.id}-${JSON.stringify(selectedAddons.map(a => a.name).sort())}`
      : product.id;

    const existing = currentOrder.items.find(i => i.cartItemId === cartItemId);
    
    if (existing) {
      setCurrentOrder(prev => ({
        ...prev,
        items: prev.items.map(i => 
          i.cartItemId === cartItemId ? { ...i, quantity: i.quantity + 1 } : i
        )
      }));
    } else {
      setCurrentOrder(prev => ({
        ...prev,
        items: [...prev.items, { 
          ...product, 
          cartItemId, 
          quantity: 1, 
          selectedAddons, 
          price: finalPrice,
          originalPrice: product.price,
          cost: finalCost
        }]
      }));
    }
    
    setShowAddonModal(false);
    setPendingAddonProduct(null);
  };

  const updateQuantity = (cartItemId, delta) => {
    setCurrentOrder(prev => ({
      ...prev,
      items: prev.items.map(i => 
        i.cartItemId === cartItemId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i
      ).filter(i => i.quantity > 0)
    }));
  };

  const handleSaveCustomer = async (formData, editingId) => {
    try {
      const payload = {
        name: formData.name,
        phone: formData.phone || '',
        address: formData.address || '',
        notes: formData.notes || '',
        updatedAt: serverTimestamp(),
      };
      if (editingId) {
        const existing = customers.find((c) => c.id === editingId);
        await updateDoc(doc(db, 'users', user.uid, 'customers', editingId), {
          ...payload,
          balance: existing?.balance ?? 0,
          transactions: existing?.transactions ?? [],
        });
      } else {
        const openingDebt = Math.max(0, Number(formData.openingDebt) || 0);
        const transactions = [];
        let balance = 0;
        if (openingDebt > 0) {
          const entry = {
            id: `legacy_${Date.now()}`,
            type: 'legacy_debt',
            amount: openingDebt,
            description: (formData.openingDebtNote || '').trim() || 'دين قديم',
            date: new Date().toISOString(),
          };
          transactions.push(entry);
          balance = openingDebt;
        }
        await addDoc(collection(db, 'users', user.uid, 'customers'), {
          ...payload,
          balance,
          transactions,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      alert(error.message);
    }
  };

  const handleAddLegacyDebt = async (customerId, amount, description) => {
    const parsed = Number(amount);
    if (!customerId || !Number.isFinite(parsed) || parsed <= 0) {
      alert('أدخل مبلغاً صحيحاً أكبر من صفر.');
      return;
    }
    const existing = customers.find((c) => c.id === customerId);
    if (!existing) return;
    const note = String(description || '').trim() || 'دين قديم';
    const entry = {
      id: `legacy_${Date.now()}`,
      type: 'legacy_debt',
      amount: parsed,
      description: note,
      date: new Date().toISOString(),
    };
    const transactions = [...(existing.transactions || []), entry].slice(-100);
    try {
      await updateDoc(doc(db, 'users', user.uid, 'customers', customerId), {
        balance: (existing.balance || 0) + parsed,
        transactions,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      alert(error.message);
    }
  };

  const handleDeleteCustomer = async (customerId) => {
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'customers', customerId));
    } catch (error) {
      alert(error.message);
    }
  };

  const handleMigrateDemoToFirebase = async () => {
    if (!user || isDemoMode) return;
    if (!hasLocalDemoData()) {
      alert('لا توجد بيانات تجربة محلية لنقلها.');
      return;
    }
    if (
      !window.confirm(
        'نقل بيانات التجربة المحلية (منتجات، طلبات، عملاء…) إلى حسابك على Firebase؟\nقد تُدمج مع البيانات الموجودة.'
      )
    ) {
      return;
    }
    setUploadProgress(true);
    try {
      const { count } = await migrateLocalDemoToFirebase(user.uid, { db, doc, setDoc, writeBatch });
      alert(`تم النقل بنجاح — ${count} سجل.`);
    } catch (error) {
      alert(error.message || 'فشل النقل. تأكد من قواعد Firestore ومن تسجيل الدخول.');
    } finally {
      setUploadProgress(false);
    }
  };

  const handleClearAllCustomers = async () => {
    if (
      !window.confirm(
        'حذف جميع العملاء وبياناتهم (الديون والسجل)؟\nالطلبات القديمة تبقى لكن بدون ربط بالملفات.'
      )
    ) {
      return;
    }
    try {
      const snap = await getDocs(collection(db, 'users', user.uid, 'customers'));
      await Promise.all(
        snap.docs.map((d) => deleteDoc(doc(db, 'users', user.uid, 'customers', d.id)))
      );
      alert('تم مسح بيانات العملاء — القائمة فارغة الآن.');
    } catch (error) {
      alert(error.message);
    }
  };

  const exportCustomersLedgerPdf = async () => {
    if (customersLedgerPdfLoading) return;
    setCustomersLedgerPdfLoading(true);
    try {
      await downloadCustomersLedgerPdf({
        customers,
        business: businessProfile,
        fmtMoney,
      });
    } catch (e) {
      alert(e.message || 'تعذّر إنشاء ملف PDF');
    } finally {
      setCustomersLedgerPdfLoading(false);
    }
  };

  const exportCustomerFile = (customer, customerOrders) => {
    const file = {
      title: `ملف العميل — ${customer.name}`,
      exportedAt: new Date().toISOString(),
      customer: {
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        notes: customer.notes,
        balance: customer.balance || 0,
      },
      transactions: customer.transactions || [],
      orders: customerOrders.map((o) => ({
        orderNumber: o.orderNumber,
        total: o.total,
        cashPaid: o.cashPaid,
        debtAmount: o.debtAmount,
        paymentType: o.paymentType,
        status: o.status,
        items: o.items,
      })),
    };
    const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${customer.name.replace(/\s+/g, '-')}-ملف-عميل.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const selectOrderCustomer = (customerId) => {
    if (!customerId) {
      setCurrentOrder((prev) => ({ ...prev, customerId: '', customer: '' }));
      return;
    }
    const c = customers.find((x) => x.id === customerId);
    setCurrentOrder((prev) => ({
      ...prev,
      customerId,
      customer: c?.name || prev.customer,
    }));
  };

  const completeOrder = async (status, paymentOrMethod = {}, customPriceLegacy = '') => {
    if (currentOrder.items.length === 0) return;
    if (!user) {
      alert('يجب تسجيل الدخول لحفظ الطلب');
      return;
    }
    if (uploadProgress) return;

    const payment =
      typeof paymentOrMethod === 'object' && paymentOrMethod !== null
        ? paymentOrMethod
        : { method: paymentOrMethod, customPrice: customPriceLegacy };

    setUploadProgress(true);

    try {
      let finalDiscount = discount;
      let currentDiscountType = discountType;

      const subtotal = currentOrder.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
      let discountAmount = 0;

      if (currentDiscountType === 'percentage') {
        discountAmount = (subtotal * finalDiscount) / 100;
      } else {
        discountAmount = parseFloat(finalDiscount) || 0;
      }

      const taxableAmount = subtotal - discountAmount;
      let total = taxableAmount;

      const methodEarly = payment.method || '';
      if (payment.paymentType === 'compliment' || methodEarly === 'Compliment') {
        finalDiscount = total;
        currentDiscountType = 'amount';
        discountAmount = total;
        total = 0;
      } else if (payment.customPrice !== undefined && payment.customPrice !== '' && parseFloat(payment.customPrice) >= 0) {
        const finalCustomPrice = parseFloat(payment.customPrice);
        const originalTotal = total;
        const adjustment = originalTotal - finalCustomPrice;
        discountAmount += adjustment;
        finalDiscount = discountAmount;
        currentDiscountType = 'amount';
        total = finalCustomPrice;
      }

      if (appSettings.rounding) {
        total = Math.round(total);
      }

      const paymentType = payment.paymentType || (status === 'unpaid' ? 'pending' : 'cash');
      let paymentMethod = payment.method || '';
      let finalStatus = status;
      let cashPaid = 0;
      let debtAmount = 0;
      const customerId = payment.customerId || currentOrder.customerId || '';

      if (paymentType === 'compliment' || methodEarly === 'Compliment') {
        finalStatus = 'paid';
        paymentMethod = 'Compliment';
        cashPaid = 0;
        debtAmount = 0;
      } else if (status === 'unpaid' && paymentType === 'pending') {
        finalStatus = 'unpaid';
      } else if (paymentType === 'cash') {
        cashPaid = total;
        debtAmount = 0;
        finalStatus = 'paid';
        paymentMethod = 'Cash';
      } else if (paymentType === 'debt') {
        if (!customerId) throw new Error('اختر عميلاً من القائمة لتسجيل الدين');
        cashPaid = 0;
        debtAmount = total;
        finalStatus = 'unpaid';
        paymentMethod = 'Debt';
      } else if (paymentType === 'mixed') {
        if (!customerId) throw new Error('اختر عميلاً للدفع الجزئي (كاش + دين)');
        cashPaid = Math.min(total, Math.max(0, parseFloat(payment.cashPaid) || 0));
        debtAmount = Math.max(0, total - cashPaid);
        if (debtAmount <= 0) {
          cashPaid = total;
          debtAmount = 0;
          finalStatus = 'paid';
          paymentMethod = 'Cash';
        } else if (cashPaid <= 0) {
          finalStatus = 'unpaid';
          paymentMethod = 'Debt';
        } else {
          finalStatus = 'partial';
          paymentMethod = 'Mixed';
        }
      }

      const cost = currentOrder.items.reduce((sum, i) => sum + ((i.cost || 0) * i.quantity), 0);

      await runTransaction(db, async (transaction) => {
        // 1. READS
        let orderNumber;
        let newOrderRef;
        let existingOrderData = null;
        let currentCount = 0;

        if (editingOrderId) {
            newOrderRef = doc(db, 'users', user.uid, 'orders', editingOrderId);
            const existingDoc = await transaction.get(newOrderRef);
            if (!existingDoc.exists()) throw new Error('الطلب غير موجود');
            existingOrderData = existingDoc.data();
            orderNumber = existingOrderData.orderNumber;
        } else {
            const counterRef = doc(db, 'users', user.uid, 'counters', 'orders');
            const counterDoc = await transaction.get(counterRef);
            if (counterDoc.exists()) {
              currentCount = counterDoc.data().count || 0;
            }
            newOrderRef = doc(collection(db, 'users', user.uid, 'orders'));
        }
        
        // Collect all product IDs to read (both new and old items)
        const productIds = new Set();
        currentOrder.items.forEach(i => productIds.add(i.id));
        if (existingOrderData && existingOrderData.status !== 'cancelled') {
            existingOrderData.items.forEach(i => productIds.add(i.id));
        }

        // Read all products
        const productDocs = {};
        for (const pid of productIds) {
            const pRef = doc(db, 'users', user.uid, 'products', pid);
            const pDoc = await transaction.get(pRef);
            if (pDoc.exists()) {
                productDocs[pid] = { ref: pRef, data: pDoc.data() };
            }
        }

        // Collect Ingredient IDs from the READ products (source of truth)
        const ingredientIds = new Set();
        currentOrder.items.forEach(item => {
            const pData = productDocs[item.id]?.data;
            if (pData && pData.ingredients) {
                pData.ingredients.forEach(ing => {
                    if (ing.ingredientId) ingredientIds.add(ing.ingredientId);
                });
            }
        });

        // Read Ingredients
        const ingredientDocs = {};
        for (const ingId of ingredientIds) {
            const ingRef = doc(db, 'users', user.uid, 'ingredients', ingId);
            const ingDoc = await transaction.get(ingRef);
            if (ingDoc.exists()) {
                ingredientDocs[ingId] = { ref: ingRef, data: ingDoc.data() };
            }
        }

        let customerDoc = null;
        if (customerId && debtAmount > 0) {
          const cRef = doc(db, 'users', user.uid, 'customers', customerId);
          const cSnap = await transaction.get(cRef);
          if (!cSnap.exists()) throw new Error('العميل غير موجود');
          customerDoc = { ref: cRef, data: cSnap.data() };
        }

        // 2. LOGIC & WRITES
        
        // Restore stock if editing
        if (existingOrderData && existingOrderData.status !== 'cancelled') {
            for (const item of existingOrderData.items) {
                if (productDocs[item.id]) {
                    const p = productDocs[item.id];
                    p.data.stock = (p.data.stock || 0) + item.quantity;
                }
            }
        }

        // Deduct stock for new items
        for (const item of currentOrder.items) {
          if (!productDocs[item.id]) {
             throw new Error(`الصنف "${item.name}" غير موجود`);
          }
          const p = productDocs[item.id];
          if (p.data.stock < item.quantity) {
             throw new Error(`مخزون "${item.name}" غير كافٍ. المتاح: ${p.data.stock}`);
          }
          p.data.stock -= item.quantity;
        }

        // Deduct Ingredients (Recipe)
        for (const item of currentOrder.items) {
          const pData = productDocs[item.id]?.data;
          if (pData && pData.ingredients) {
            for (const ing of pData.ingredients) {
              if (ing.ingredientId && ingredientDocs[ing.ingredientId]) {
                const ingData = ingredientDocs[ing.ingredientId];
                ingData.data.stock = (ingData.data.stock || 0) - (ing.usageQty * item.quantity);
              }
            }
          }
        }

        // Apply product updates
        for (const pid of productIds) {
            if (productDocs[pid]) {
                transaction.update(productDocs[pid].ref, { stock: productDocs[pid].data.stock });
            }
        }

        // Apply ingredient updates
        for (const ingId of ingredientIds) {
            if (ingredientDocs[ingId]) {
                transaction.update(ingredientDocs[ingId].ref, { stock: ingredientDocs[ingId].data.stock });
            }
        }

        // Handle Counter if new
        if (!editingOrderId) {
            const newCount = currentCount + 1;
            orderNumber = String(newCount).padStart(4, '0');
            const counterRef = doc(db, 'users', user.uid, 'counters', 'orders');
            transaction.set(counterRef, { count: newCount }, { merge: true });
        }

        transaction.set(newOrderRef, {
          orderNumber,
          customer: currentOrder.customer || 'ضيف',
          customerId: customerId || null,
          notes: currentOrder.notes || '',
          items: currentOrder.items.map(i => ({
            id: i.id,
            name: i.name,
            price: i.price,
            cost: i.cost || 0,
            quantity: i.quantity,
            selectedAddons: i.selectedAddons || []
          })),
          status: finalStatus,
          paymentMethod,
          paymentType,
          cashPaid,
          debtAmount,
          subtotal,
          discount: finalDiscount,
          discountAmount,
          discountType: currentDiscountType,
          tax: 0,
          serviceCharge: 0,
          taxAmount: 0,
          serviceChargeAmount: 0,
          total,
          cost,
          profit: total - cost,
          timestamp: serverTimestamp(),
          userId: user.uid
        }, { merge: true });

        if (customerDoc && debtAmount > 0) {
          const entry = {
            id: `tx_${Date.now()}`,
            type: 'order_debt',
            orderNumber,
            amount: debtAmount,
            cashPaid,
            total,
          };
          const transactions = [...(customerDoc.data.transactions || []), entry].slice(-100);
          transaction.update(customerDoc.ref, {
            balance: (customerDoc.data.balance || 0) + debtAmount,
            transactions,
            updatedAt: serverTimestamp(),
          });
        }
      });

      setCurrentOrder({ items: [], customer: '', customerId: '', notes: '' });
      setDiscount(0);
      setDiscountType('percentage');
      setEditingOrderId(null);
      setPaymentCustomPrice('');
      setMixedCashAmount('');
      setShowPaymentModal(false);
      setShowMixedPaymentModal(false);
      setShowCashModal(false);
      if (editingOrderId) {
        setCurrentView('orders');
        alert('تم تحديث الطلب بنجاح');
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadProgress(false);
    }
  };

  const handleEditOrder = (order) => {
    setCurrentOrder({
      items: order.items.map(item => ({
        ...item,
        cartItemId: item.selectedAddons && item.selectedAddons.length > 0
          ? `${item.id}-${JSON.stringify(item.selectedAddons.map(a => a.name).sort())}`
          : item.id
      })),
      customer: order.customer,
      customerId: order.customerId || '',
      notes: order.notes
    });
    setDiscount(order.discount || 0);
    setDiscountType(order.discountType || 'percentage');
    setEditingOrderId(order.id);
    setCurrentView('pos');
  };

  const toggleOrderStatus = async (orderId, currentStatus) => {
    try {
      const orderRef = doc(db, 'users', user.uid, 'orders', orderId);
      await updateDoc(orderRef, {
        status: currentStatus === 'paid' ? 'unpaid' : 'paid'
      });
    } catch (error) {
      alert(error.message);
    }
  };

  const toggleOrderExpansion = (orderId) => {
    setExpandedOrderIds(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const printReceipt = async (order) => {
    try {
      if (!navigator.bluetooth) {
        printReceiptViaBrowser(order, { businessProfile, appSettings });
        return;
      }

      let writeChar = printCharacteristic;

      if (!writeChar || !bluetoothDevice || !bluetoothDevice.gatt.connected) {
        const device = await navigator.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ['49535343-fe7d-4ae5-8fa9-9fafd205e455']
        });

        const server = await device.gatt.connect();
        
        device.addEventListener('gattserverdisconnected', () => {
          setBluetoothDevice(null);
          setPrintCharacteristic(null);
        });

        const service = await server.getPrimaryService('49535343-fe7d-4ae5-8fa9-9fafd205e455');
        writeChar = await service.getCharacteristic('49535343-8841-43f4-a8d4-ecbe34729bb3');
        
        setBluetoothDevice(device);
        setPrintCharacteristic(writeChar);
      }
      
      const encoder = new TextEncoder();
      
      const sendData = async (data) => {
        try {
          const bytes = typeof data === 'string' ? encoder.encode(data) : data;
          const chunkSize = 100;
          
          for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.length));
            await writeChar.writeValueWithoutResponse(chunk);
            await new Promise(resolve => setTimeout(resolve, 10));
          }
        } catch (error) {
          setBluetoothDevice(null);
          setPrintCharacteristic(null);
          throw error;
        }
      };
      
      const printLogo = async (url) => {
        try {
          const img = new Image();
          img.crossOrigin = "Anonymous";
          img.src = url + (url.startsWith('data:') ? '' : (url.includes('?') ? '&' : '?') + 't=' + new Date().getTime());
          
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });

          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          const maxWidth = 150;
          let width = img.width;
          let height = img.height;
          
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          
          width = Math.floor(width / 8) * 8;
          canvas.width = width;
          canvas.height = height;
          
          ctx.fillStyle = 'white';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          
          const imageData = ctx.getImageData(0, 0, width, height);
          const data = imageData.data;
          const bytes = [];
          
          bytes.push(0x1D, 0x76, 0x30, 0x00);
          bytes.push((width / 8) % 256, Math.floor((width / 8) / 256), height % 256, Math.floor(height / 256));
          
          for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x += 8) {
              let byte = 0;
              for (let b = 0; b < 8; b++) {
                if (x + b < width) {
                  const offset = ((y * width) + (x + b)) * 4;
                  if ((data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114) < 128) {
                    byte |= (1 << (7 - b));
                  }
                }
              }
              bytes.push(byte);
            }
          }
          
          await sendData(new Uint8Array(bytes));
        } catch (error) {
          console.error("Error printing logo:", error);
        }
      };

      const orderDate = order.timestamp ? (order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp)) : new Date();
      
      // Initialize
      await sendData(new Uint8Array([0x1B, 0x40]));
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Center align
      await sendData(new Uint8Array([0x1B, 0x61, 0x01]));

      const logoToPrint = resolveAppLogo();
      if (logoToPrint) {
        await printLogo(logoToPrint);
      }

      // Custom Header
      if (appSettings.receiptHeader) {
        try {
          await sendData(`${appSettings.receiptHeader}\n`);
        } catch (error) {
          console.error("Error printing header:", error);
        }
      }

      // Business Name
      if (businessProfile?.businessName) {
        await sendData(new Uint8Array([0x1D, 0x21, 0x11])); // Double size
        await sendData(`${businessProfile.businessName}\n`);
        await sendData(new Uint8Array([0x1D, 0x21, 0x00])); // Normal size
        if (businessProfile.businessType) {
          await sendData(`${businessProfile.businessType}\n`);
        }
        await sendData('\n');
      }
      
      // Left align
      await sendData(new Uint8Array([0x1B, 0x61, 0x00]));
      
      await sendData(`العميل: ${order.customer || 'ضيف'}\n`);
      await sendData(`${orderDate.toLocaleDateString('ar')} ${orderDate.toLocaleTimeString('ar')}\n`);
      await sendData(`طلب: #${order.orderNumber || order.id.slice(-8).toUpperCase()}\n`);
      await sendData('================================\n');
      
      // Items
      for (const item of order.items) {
        await sendData(`${item.name}\n`);
        const line = `${item.quantity}x ${fmtMoneyPlain(item.price)}`;
        const total = fmtMoneyPlain(item.price * item.quantity);
        const spaces = 32 - line.length - total.length;
        await sendData(line + ' '.repeat(Math.max(1, spaces)) + total + '\n');
        if (item.selectedAddons && item.selectedAddons.length > 0) {
          for (const addon of item.selectedAddons) {
             const addonPrice = parseFloat(addon.price) || 0;
             if (addonPrice > 0) {
               await sendData(`  + ${addon.name} (${fmtMoneyPlain(addonPrice)})\n`);
             } else {
               await sendData(`  + ${addon.name}\n`);
             }
          }
        }
      }
      
      await sendData('================================\n');

      const formatLine = (label, amount) => {
        const safeAmount = amount || 0;
        const amountStr = fmtMoneyPlain(safeAmount);
        const spaces = 32 - label.length - amountStr.length;
        return label + ' '.repeat(Math.max(1, spaces)) + amountStr + '\n';
      };

      await sendData(formatLine('المجموع الفرعي', order.subtotal));
      if (order.discount > 0) {
        if (order.discountType === 'amount') {
          await sendData(formatLine(`الخصم`, -order.discountAmount));
        } else {
          await sendData(formatLine(`خصم (${order.discount}%)`, -order.discountAmount));
        }
      }
      if (order.tax > 0) {
        await sendData(formatLine(`ضريبة (${order.tax}%)`, order.taxAmount));
      }
      if (order.serviceCharge > 0) {
        await sendData(formatLine(`خدمة (${order.serviceCharge}%)`, order.serviceChargeAmount));
      }
      await sendData('--------------------------------\n');

      // Center for total
      await sendData(new Uint8Array([0x1B, 0x61, 0x01]));
      await sendData(new Uint8Array([0x1B, 0x45, 0x01])); // Bold
      await sendData(new Uint8Array([0x1D, 0x21, 0x01])); // Double height
      await sendData(`الإجمالي: ${fmtMoneyPlain(order.total || 0)}\n\n`);
      await sendData(new Uint8Array([0x1B, 0x45, 0x00]));
      await sendData(new Uint8Array([0x1D, 0x21, 0x00])); // Reset size
      
      await sendData(`${order.status === 'paid' ? '[مدفوع]' : '[غير مدفوع]'}\n`);
      if (order.paymentMethod) {
        await sendData(`طريقة الدفع: ${order.paymentMethod}\n`);
      }
      await sendData('شكراً لزيارتكم!\n');
      
      if (businessProfile?.address) {
        await sendData(`${businessProfile.address}\n`);
      }
      if (businessProfile?.address && businessProfile?.phone) {
        await sendData('\n');
      }
      if (businessProfile?.phone) {
        await sendData(`${businessProfile.phone}\n`);
      }

      if (appSettings.receiptFooter) {
        await sendData(`${appSettings.receiptFooter}\n`);
      }

      await sendData(new Uint8Array([0x1B, 0x61, 0x01])); // Center align
      await sendData(`${APP_NAME}\n`);
      
      // Feed and cut
      await new Promise(resolve => setTimeout(resolve, 500));
      await sendData(new Uint8Array([0x1D, 0x56, 0x41, 0x00]));
      
      alert('✅ تمت طباعة الإيصال!');
      
    } catch (error) {
      if (error.name !== 'NotFoundError' && !error.message?.includes('cancelled')) {
        try {
          printReceiptViaBrowser(order, { businessProfile, appSettings });
        } catch (fallbackErr) {
          alert(`تعذّرت الطباعة: ${fallbackErr.message || error.message}`);
        }
      }
    }
  };

  // Computed values
  const menuCategoryList = useMemo(() => mergeMenuCategories(products), [products]);
  const posMenuTabs = useMemo(() => buildPosMenuTabs(menuCategoryList), [menuCategoryList]);

  const financeTab = useMemo(() => {
    if (currentView === 'purchases') return 'purchases';
    if (currentView === 'traders') return 'traders';
    return 'operating';
  }, [currentView]);

  useEffect(() => {
    if (selectedCategory !== 'all' && !menuCategoryList.includes(selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [menuCategoryList, selectedCategory]);

  const filteredProducts = products.filter(p => 
    (selectedCategory === 'all' || p.category === selectedCategory) &&
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a, b) => a.name.localeCompare(b.name));

  const categories = ['all', ...menuCategoryList];
  
  const cartSubtotal = currentOrder.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
  const cartDiscountAmount = discountType === 'percentage' 
    ? (cartSubtotal * discount) / 100 
    : discount;
  const taxableAmount = cartSubtotal - cartDiscountAmount;
  const cartTotal = taxableAmount;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dashboardOrders = orders.filter(o => {
    if (!o.timestamp) return false;
    const orderDate = o.timestamp.toDate ? o.timestamp.toDate() : new Date(o.timestamp);
    return orderDate >= today;
  });

  const totalProfit = orders
    .filter(o => o.status === 'paid')
    .reduce((sum, o) => sum + (o.profit || 0), 0);

  const lowStockProducts = products
    .filter((p) => Number(p.stock) < LOW_STOCK_THRESHOLD)
    .sort((a, b) => Number(a.stock) - Number(b.stock));
  const lowStock = lowStockProducts.length;

  // Top selling for dashboard
  const getTopSellingProducts = (orderList = orders) => {
    const productSales = {};
    orderList.filter(o => o.status === 'paid').forEach(order => {
      order.items.forEach(item => {
        if (!productSales[item.name]) productSales[item.name] = 0;
        productSales[item.name] += item.quantity;
      });
    });
    return Object.entries(productSales)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5);
  };

  // Weekly sales data for chart
  const getWeeklySales = () => {
    const salesByDay = new Map();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Initialize map for the last 7 days
    for (let i = 0; i < 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      salesByDay.set(date.toDateString(), { sales: 0, date: date });
    }

    // Populate sales data
    orders.forEach(order => {
      if (order.status !== 'paid' || !order.timestamp) return;

      const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
      const orderDateString = orderDate.toDateString();

      if (salesByDay.has(orderDateString)) {
        salesByDay.get(orderDateString).sales += (parseFloat(order.total) || 0);
      }
    });

    // Convert map to array and sort chronologically
    return Array.from(salesByDay.values())
      .sort((a, b) => a.date - b.date)
      .map(data => ({
        day: data.date.toLocaleDateString('ar', { weekday: 'short' }),
        sales: data.sales
      }));
  };

  const filteredInventory = products.filter(p => 
    (selectedInventoryCategory === 'all' || p.category === selectedInventoryCategory) &&
    (p.name.toLowerCase().includes(inventorySearchTerm.toLowerCase()) ||
    p.category.toLowerCase().includes(inventorySearchTerm.toLowerCase()))
  );

  const getFilteredOrders = () => {
    if (!orders.length) return [];
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const yesterdayEnd = new Date(todayStart);
    yesterdayEnd.setMilliseconds(-1);
    const lastWeekStart = new Date(todayStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);

    return orders.filter(order => {
      if (orderStatusFilter !== 'all' && order.status !== orderStatusFilter) {
        return false;
      }

      if (!order.timestamp) return false;
      const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
      
      switch (orderFilter) {
        case 'today':
          return orderDate >= todayStart;
        case 'yesterday':
          return orderDate >= yesterdayStart && orderDate <= yesterdayEnd;
        case 'lastWeek':
          return orderDate >= lastWeekStart;
        case 'custom':
          if (customDateRange.start && customDateRange.end) {
            const start = new Date(customDateRange.start);
            const end = new Date(customDateRange.end);
            end.setHours(23, 59, 59, 999);
            return orderDate >= start && orderDate <= end;
          }
          return true;
        default:
          return true;
      }
    });
  };

  const getFilteredExpenses = () => {
    if (!expenses.length) return [];
    
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    
    const lastWeekStart = new Date(todayStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    
    const lastMonthStart = new Date(todayStart);
    lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

    return expenses.filter(expense => {
      if (!expense.date) return false;
      const expenseDate = expense.date.toDate ? expense.date.toDate() : new Date(expense.date);
      
      switch (expenseFilter) {
        case 'today':
          return expenseDate >= todayStart;
        case 'yesterday':
          return expenseDate >= yesterdayStart && expenseDate < todayStart;
        case 'lastWeek':
          return expenseDate >= lastWeekStart;
        case 'lastMonth':
          return expenseDate >= lastMonthStart;
        case 'custom':
          if (expenseCustomDateRange.start && expenseCustomDateRange.end) {
            const start = new Date(expenseCustomDateRange.start);
            start.setHours(0,0,0,0);
            const end = new Date(expenseCustomDateRange.end);
            end.setHours(23, 59, 59, 999);
            return expenseDate >= start && expenseDate <= end;
          }
          return true;
        default: // 'all'
          return true;
      }
    }).filter((expense) => {
      if (financeTab === 'operating') return resolveExpenseSection(expense) === 'operating';
      if (financeTab === 'purchases') return resolveExpenseSection(expense) === 'purchase';
      return true;
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: theme.bgWarm }}>
        <div className="text-center animate-pulse">
          <div className="w-12 h-12 border-3 border-t-transparent rounded-full animate-spin mb-3 mx-auto" style={{ borderColor: theme.primary }}></div>
          <p className="text-sm" style={{ color: theme.text, fontFamily: FONT_UI }}>جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user || !userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 font-cairo" style={{ backgroundColor: theme.bgWarm }} dir="rtl">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-xl p-8 border border-primary border-opacity-5">
            <div className="text-center mb-8">
              <img src={resolveAppLogo()} alt="ليالي كافيه" className="w-24 h-24 mx-auto mb-4 rounded-2xl shadow-lg object-contain bg-white p-1" />
              <h1 className="text-2xl mb-1" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 600 }}>
                {APP_NAME}
              </h1>
              <p className="text-sm" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>{APP_TAGLINE}</p>
              <p className="text-xs mt-3 text-gray-500" style={{ fontFamily: FONT_UI }}>
                {isDemoMode
                  ? 'وضع تجربة محلي — للتطوير فقط'
                  : 'تسجيل الدخول إلى نظام نقاط البيع'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 mb-5 rounded-xl bg-gray-100" role="tablist">
              {[
                { id: 'employee', label: 'موظف' },
                { id: 'admin', label: 'مدير' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={loginType === tab.id}
                  onClick={() => {
                    setLoginType(tab.id);
                    setAdminPassword('');
                  }}
                  className={`py-2.5 rounded-lg text-sm transition-all ${
                    loginType === tab.id ? 'bg-white shadow-sm text-primary font-semibold' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  style={{ fontFamily: FONT_UI }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={loginType === 'admin' ? handleAdminLogin : handleEmployeeLogin} className="space-y-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>
                  {loginType === 'admin' ? 'كلمة مرور المدير' : 'كلمة مرور الموظف'}
                </label>
                <div className="relative">
                  <input
                    key={loginType}
                    type={showPassword ? 'text' : 'password'}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    className="w-full px-3 py-3 rounded-xl border border-gray-200 outline-none text-sm pe-10"
                    style={{ fontFamily: FONT_UI }}
                    placeholder="••••••••"
                    dir="ltr"
                    autoComplete="current-password"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={uploadProgress || !adminPassword.trim()}
                className="w-full py-3 rounded-xl text-white text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                style={{ backgroundColor: theme.accent, fontFamily: FONT_UI }}
              >
                {uploadProgress ? 'جاري الدخول...' : 'دخول'}
              </button>
              {loginType === 'employee' && !user && (
                <p className="text-xs leading-relaxed text-center" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>
                  أول مرة على هذا الجهاز: ادخل كمدير ثم اخرج. بعدها كلمة مرور الموظف تفتح نقطة البيع.
                </p>
              )}
            </form>
            {user && (
              <button
                type="button"
                onClick={handleDisconnectDevice}
                className="w-full mt-4 text-xs text-gray-400 hover:text-red-600 transition-colors"
                style={{ fontFamily: FONT_UI }}
              >
                فصل هذا الجهاز عن الحساب
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isEmployee = userRole === 'employee';
  const allNavItems = [
    { id: 'dashboard', icon: BarChart3, label: 'لوحة التحكم' },
    { id: 'pos', icon: ShoppingCart, label: 'نقطة البيع' },
    { id: 'orders', icon: FileText, label: 'الطلبات' },
    { id: 'customers', icon: Users, label: 'العملاء' },
    { id: 'inventory', icon: Package, label: 'المخزون' },
    { id: 'expenses', icon: TrendingDown, label: 'المصروفات' },
    { id: 'purchases', icon: ShoppingBag, label: 'المشتريات' },
    { id: 'traders', icon: Truck, label: 'التجار' },
    { id: 'reports', icon: FileText, label: 'التقارير' },
    { id: 'settings', icon: Settings, label: 'الإعدادات' },
  ];
  const navItems = isEmployee
    ? allNavItems.filter((item) => EMPLOYEE_VIEWS.includes(item.id))
    : allNavItems;
  const activeView = isEmployee && !EMPLOYEE_VIEWS.includes(currentView) ? 'pos' : currentView;

  if (showProfileSetup && !isEmployee) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 font-cairo" style={{ backgroundColor: theme.bgWarm }} dir="rtl">
        <div className="w-full max-w-2xl">
          <div className="bg-white rounded-3xl shadow-xl p-8 border border-primary border-opacity-5">
            <h2 className="text-2xl mb-1" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 600 }}>
              إعداد ملف المتجر
            </h2>
            <p className="text-sm mb-6" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>
              تُستخدم هذه البيانات على الإيصالات وفي النظام
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>اسم المنشأة *</label>
                <input
                  type="text"
                  value={profileForm.businessName}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, businessName: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                  style={{ fontFamily: FONT_UI }}
                  placeholder="مثال: ليالي كافيه"
                />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>نوع النشاط *</label>
                <input
                  type="text"
                  value={profileForm.businessType}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, businessType: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                  style={{ fontFamily: FONT_UI }}
                  placeholder="مثال: مقهى"
                />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>اسم المالك *</label>
                <input
                  type="text"
                  value={profileForm.ownerName}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, ownerName: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                  style={{ fontFamily: FONT_UI }}
                  placeholder="اسمك"
                />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>الجوال *</label>
                <input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                  style={{ fontFamily: FONT_UI }}
                  placeholder="05xxxxxxxx"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>العنوان</label>
                <input
                  type="text"
                  value={profileForm.address}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                  style={{ fontFamily: FONT_UI }}
                  placeholder="العنوان الكامل"
                />
              </div>
            </div>

            <button
              onClick={handleProfileUpdate}
              disabled={uploadProgress || !profileForm.businessName || !profileForm.businessType || !profileForm.ownerName || !profileForm.phone}
              className="w-full py-3 rounded-xl text-white text-sm font-medium shadow-md disabled:opacity-50"
              style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
            >
              {uploadProgress ? 'جاري الإعداد...' : 'إكمال الإعداد'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div dir="rtl" className={`flex flex-row-reverse h-[100dvh] font-cairo bg-parchment-app text-primary overflow-hidden ${isDemoMode ? 'pt-7' : ''}`}>
      {isDemoMode && (
        <div
          className="fixed top-0 left-0 right-0 z-50 py-1.5 px-4 text-center text-xs text-white bg-accent shadow-layali"
          style={{ fontFamily: FONT_UI }}
        >
          وضع تجربة — REACT_APP_DEMO_MODE=true (لا تستخدم في المقهى)
        </div>
      )}
      {/* Overlay for mobile/tablet */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <div className={`
        fixed top-0 right-0 h-full text-white flex flex-col border-l border-sidebar-border bg-sidebar transition-all duration-300 z-30 overflow-hidden shadow-layali-lg
        lg:relative
        ${isSidebarOpen ? 'w-64 translate-x-0' : 'w-0 translate-x-full lg:w-20 lg:translate-x-0'}
      `}>
        <div className="p-5 border-b border-white/10">
          <div className={`flex items-center gap-3 duration-300 ${!isSidebarOpen && 'lg:justify-center'}`}>
            <img src={resolveAppLogo()} alt={APP_NAME} className="w-10 h-10 rounded-lg object-contain flex-shrink-0 bg-white p-0.5" />
            <div className={`${isSidebarOpen ? 'block' : 'hidden'} transition-opacity duration-200 overflow-hidden`}>
              <h1 className="text-base tracking-wide" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>{APP_NAME}</h1>
              <p className="text-xs opacity-60" style={{ fontFamily: FONT_UI }}>{APP_TAGLINE}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setCurrentView(item.id);
                if (window.innerWidth < 1024) {
                  setIsSidebarOpen(false);
                }
              }}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 text-sm ${isSidebarOpen ? 'justify-start' : 'lg:justify-center'} ${
                activeView === item.id ? 'bg-accent text-white shadow-md' : 'hover:bg-white/10 text-white/60 hover:text-white'
              }`}
              title={item.label}
              style={{ fontFamily: FONT_UI, fontWeight: 400 }}
            >
              <item.icon size={20} strokeWidth={1.5} className="flex-shrink-0" />
              <span className={`${isSidebarOpen ? 'block' : 'hidden'} whitespace-nowrap`}>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="shrink-0 p-3 border-t border-white/10">
          <div className={`${isSidebarOpen ? 'block' : 'hidden'} px-3 mb-3`}>
            <p className="text-sm font-medium truncate">
              {isEmployee ? 'الموظف' : businessProfile?.ownerName || 'المدير'}
            </p>
            <p className="text-xs opacity-60 truncate">{isEmployee ? 'نقطة البيع فقط' : user.email}</p>
          </div>
          <button
            onClick={handleLogout}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white hover:bg-opacity-10 transition-all text-sm text-red-300 hover:text-red-200 ${isSidebarOpen ? 'justify-start' : 'lg:justify-center'}`}
            style={{ fontFamily: FONT_UI, fontWeight: 400 }}
          >
            <LogOut size={20} strokeWidth={1.5} className="flex-shrink-0" />
            <span className={`${isSidebarOpen ? 'block' : 'hidden'} whitespace-nowrap`}>تسجيل الخروج</span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="flex items-center justify-between gap-3 px-3 py-3 sm:px-6 sm:py-4 bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="shrink-0 p-1 rounded-md hover:bg-gray-200/50">
                <Menu size={24} />
            </button>
            <div className="flex min-w-0 items-center gap-2 sm:gap-4">
               {/* Notification Bell */}
               <div className="relative" ref={notificationButtonRef}>
                 <button
                   type="button"
                   aria-expanded={showNotifications}
                   aria-haspopup="dialog"
                   onClick={() => {
                     if (showNotifications) {
                       setShowNotifications(false);
                       return;
                     }
                     setNotificationLayout(layoutNotificationPanel(notificationButtonRef.current));
                     setShowNotifications(true);
                   }}
                   className="p-2 rounded-full hover:bg-gray-100 relative transition-colors"
                 >
                   <Bell size={20} className="text-gray-600" />
                   {(lowStock > 0) && (
                     <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
                   )}
                 </button>

                 {showNotifications && notificationLayout && createPortal(
                   <>
                     <button
                       type="button"
                       aria-label="إغلاق الإشعارات"
                       className="fixed inset-0 z-[80] bg-black/40"
                       onClick={() => setShowNotifications(false)}
                     />
                     <div
                       role="dialog"
                       aria-modal="true"
                       aria-labelledby="notifications-title"
                       dir="rtl"
                       style={{ ...notificationLayout.style, fontFamily: FONT_UI }}
                       className={`z-[90] flex min-w-0 flex-col overflow-hidden border border-gray-100 bg-white shadow-2xl ${
                         notificationLayout.sheet ? 'rounded-t-3xl' : 'rounded-2xl'
                       }`}
                     >
                       {notificationLayout.sheet && (
                         <div className="flex justify-center pt-2.5 pb-1" aria-hidden="true">
                           <span className="h-1 w-10 rounded-full bg-gray-200" />
                         </div>
                       )}
                       <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
                         <h3 id="notifications-title" className="min-w-0 text-base font-bold text-primary">الإشعارات</h3>
                         <button
                           type="button"
                           onClick={() => setShowNotifications(false)}
                           aria-label="إغلاق"
                           className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                         >
                           <X size={18} />
                         </button>
                       </div>
                       <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4">
                         {lowStock > 0 && (
                           <div className="overflow-hidden rounded-xl border border-red-100 bg-red-50">
                             <button
                               type="button"
                               aria-expanded={lowStockExpanded}
                               onClick={() => setLowStockExpanded((v) => !v)}
                               className="flex w-full items-start gap-3 p-3 text-start transition-colors hover:bg-red-100/60"
                             >
                               <AlertCircle size={18} className="mt-0.5 shrink-0 text-red-500" />
                               <div className="min-w-0 flex-1">
                                 <p className="text-sm font-medium text-red-700 break-words">تنبيه مخزون منخفض</p>
                                 <p className="mt-0.5 text-xs text-red-600 break-words">
                                   {lowStock} {lowStock === 1 ? 'صنف' : 'أصناف'} أقل من {LOW_STOCK_THRESHOLD} قطع
                                   {' · '}
                                   {lowStockExpanded ? 'إخفاء التفاصيل' : 'اضغط لعرض التفاصيل'}
                                 </p>
                               </div>
                               <ChevronDown
                                 size={18}
                                 className={`mt-0.5 shrink-0 text-red-400 transition-transform duration-200 ${lowStockExpanded ? 'rotate-180' : ''}`}
                               />
                             </button>

                             {lowStockExpanded && (
                               <div className="border-t border-red-100 bg-white">
                                 <ul className="divide-y divide-gray-100">
                                   {lowStockProducts.map((product) => {
                                     const stock = Number(product.stock) || 0;
                                     const isOut = stock <= 0;
                                     const content = (
                                       <>
                                         <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-white">
                                           {product.image ? (
                                             <img src={product.image} alt="" className="h-full w-full object-contain" />
                                           ) : (
                                             <Package size={18} className="text-gray-300" />
                                           )}
                                         </div>
                                         <div className="min-w-0 flex-1">
                                           <p className="truncate text-sm font-medium text-primary">{product.name}</p>
                                           {product.category ? (
                                             <p className="truncate text-[11px] text-gray-400">{product.category}</p>
                                           ) : null}
                                         </div>
                                         <span
                                           className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                                             isOut ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700'
                                           }`}
                                         >
                                           {isOut ? 'نفد' : `متبقي ${stock}`}
                                         </span>
                                       </>
                                     );
                                     return (
                                       <li key={product.id}>
                                         {isEmployee ? (
                                           <div className="flex items-center gap-3 px-3 py-2.5">{content}</div>
                                         ) : (
                                           <button
                                             type="button"
                                             onClick={() => {
                                               setShowNotifications(false);
                                               setCurrentView('inventory');
                                               handleEditProduct(product);
                                             }}
                                             className="flex w-full items-center gap-3 px-3 py-2.5 text-start transition-colors hover:bg-gray-50"
                                             title="تعديل الكمية"
                                           >
                                             {content}
                                           </button>
                                         )}
                                       </li>
                                     );
                                   })}
                                 </ul>
                                 {!isEmployee && (
                                   <button
                                     type="button"
                                     onClick={() => {
                                       setShowNotifications(false);
                                       setSelectedInventoryCategory('all');
                                       setInventorySearchTerm('');
                                       setCurrentView('inventory');
                                     }}
                                     className="w-full border-t border-gray-100 py-2.5 text-xs font-medium text-accent hover:bg-gray-50"
                                   >
                                     فتح صفحة المخزون
                                   </button>
                                 )}
                               </div>
                             )}
                           </div>
                         )}
                         {lowStock === 0 && (
                           <div className="py-8 text-center">
                             <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-gray-50">
                               <Bell size={20} className="text-gray-400" />
                             </div>
                             <p className="text-sm text-gray-500">لا إشعارات جديدة</p>
                           </div>
                         )}
                       </div>
                     </div>
                   </>,
                   document.body
                 )}
               </div>

               <div className="text-right hidden md:block min-w-0 max-w-[11rem] lg:max-w-[16rem] xl:max-w-xs">
                  <p className="text-xs text-gray-500 font-medium truncate">{new Date().toLocaleDateString('ar', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                  <p className="text-sm font-bold text-primary truncate">{businessProfile?.businessName || 'ليالي كافيه'}</p>
               </div>
               <img
                  src={resolveAppLogo()}
                  alt={APP_NAME}
                  className="w-10 h-10 rounded-full object-contain bg-white border border-gray-200 p-0.5 shrink-0"
                />
            </div>
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-8 bg-gray-100">
          {activeView === 'dashboard' && (
          <div className="max-w-7xl mx-auto space-y-8">
            <div>
              <h2 className="text-3xl font-bold text-primary mb-1" style={{ fontFamily: FONT_HEADING }}>نظرة عامة</h2>
              <p className="text-gray-500 text-sm">مرحباً، هذا ملخص نشاط متجرك اليوم.</p>
            </div>
            
            {/* Key Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {/* Total Paid Sales */}
              <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 rounded-xl bg-green-50 text-primary">
                    <DollarSign size={24} />
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-green-100 text-green-700">+ Paid</span>
                </div>
                <p className="text-gray-500 text-sm font-medium mb-1">إجمالي المبيعات المدفوعة</p>
                <h3 className="text-2xl font-bold text-primary">
                  {fmtMoney(dashboardOrders.filter(o => o.status === 'paid').reduce((sum, o) => sum + o.total, 0))}
                </h3>
              </div>

              {/* Unpaid Sales */}
              <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 rounded-xl bg-orange-50 text-accent">
                    <Clock size={24} />
                  </div>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-orange-100 text-orange-700">معلّق</span>
                </div>
                <p className="text-gray-500 text-sm font-medium mb-1">طلبات غير مدفوعة</p>
                <h3 className="text-2xl font-bold text-accent">
                  {fmtMoney(dashboardOrders.filter(o => o.status === 'unpaid').reduce((sum, o) => sum + o.total, 0))}
                </h3>
              </div>

              {/* Total Transactions */}
              <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
                    <FileText size={24} />
                  </div>
                </div>
                <p className="text-gray-500 text-sm font-medium mb-1">عدد العمليات</p>
                <h3 className="text-2xl font-bold text-primary">{dashboardOrders.length}</h3>
              </div>

              {/* Products Sold */}
              <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 hover:shadow-lg transition-all duration-300">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 rounded-xl bg-purple-50 text-purple-600">
                    <Package size={24} />
                  </div>
                </div>
                <p className="text-gray-500 text-sm font-medium mb-1">المنتجات المباعة</p>
                <h3 className="text-2xl font-bold text-primary">
                  {dashboardOrders.reduce((sum, o) => sum + o.items.reduce((isum, item) => isum + item.quantity, 0), 0)}
                </h3>
              </div>
            </div>

            {/* Secondary Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100">
                <p className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-2">متوسط قيمة العملية</p>
                <p className="text-xl font-bold text-primary">
                  {fmtMoney(dashboardOrders.length > 0 ? dashboardOrders.reduce((sum, o) => sum + o.total, 0) / dashboardOrders.length : 0)}
                </p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100">
                <p className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-2">متوسط الأصناف / عملية</p>
                <p className="text-xl font-bold text-primary">
                  {(dashboardOrders.length > 0 ? dashboardOrders.reduce((sum, o) => sum + o.items.reduce((isum, item) => isum + item.quantity, 0), 0) / dashboardOrders.length : 0).toFixed(1)}
                </p>
              </div>
              <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100">
                <p className="text-gray-400 text-xs uppercase tracking-wider font-bold mb-2">أصناف منخفضة المخزون</p>
                <p className="text-xl font-bold text-red-500">{lowStock}</p>
              </div>
            </div>

            {/* Charts & Lists */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Sales Trend */}
              <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 lg:col-span-2">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>اتجاه المبيعات</h3>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-lg">آخر 7 أيام</span>
                </div>
                <div className="h-64 flex items-end justify-between gap-3">
                  {(() => {
                    const weeklyData = getWeeklySales();
                    const maxSales = Math.max(...weeklyData.map(d => d.sales)) || 1;
                    
                    return weeklyData.map((day, i) => {
                      const height = (day.sales / maxSales) * 100;
                    return (
                      <div key={i} className="flex flex-col items-center flex-1 group h-full">
                        <div className="relative w-full flex-1 flex justify-center items-end">
                          <div 
                            className="w-full max-w-[40px] bg-primary rounded-t-lg opacity-80 group-hover:opacity-100 transition-all duration-300 relative"
                            style={{ height: `${height}%`, minHeight: '4px' }}
                          >
                            <div className="absolute -top-10 left-1/2 transform -translate-x-1/2 bg-gray-900 text-white text-[10px] py-1 px-2 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-lg pointer-events-none">
                              {fmtMoney(day.sales)}
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 mt-2 font-medium">{day.day}</p>
                      </div>
                    );
                  });
                  })()}
                </div>
              </div>

              {/* Payment Methods */}
              <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100">
                <h3 className="text-lg font-bold text-primary mb-6" style={{ fontFamily: FONT_HEADING }}>طرق الدفع</h3>
                <div className="space-y-5">
                  {(() => {
                    const paymentStats = dashboardOrders.filter(o => o.status === 'paid').reduce((acc, order) => {
                      const method = order.paymentMethod || 'غير محدد';
                      acc[method] = (acc[method] || 0) + order.total;
                      return acc;
                    }, {});
                    const total = Object.values(paymentStats).reduce((a, b) => a + b, 0);

                    return Object.entries(paymentStats)
                      .sort(([,a], [,b]) => b - a)
                      .map(([method, amount], idx) => {
                        const percentage = total > 0 ? (amount / total) * 100 : 0;
                        return (
                          <div key={idx}>
                            <div className="flex justify-between text-sm mb-1.5">
                              <span className="text-gray-700 font-medium">{paymentMethodLabel(method)}</span>
                              <span className="text-gray-900 font-bold">{percentage.toFixed(1)}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2">
                              <div className="bg-accent h-2 rounded-full" style={{ width: `${percentage}%` }}></div>
                            </div>
                            <p className="text-xs text-gray-400 mt-1 text-right">{fmtMoney(amount)}</p>
                          </div>
                        );
                      });
                  })()}
                  {dashboardOrders.filter(o => o.status === 'paid').length === 0 && (
                    <p className="text-gray-400 text-sm text-center py-4">لا بيانات دفع بعد</p>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Best Sellers */}
              <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100">
                <h3 className="text-lg font-bold text-primary mb-4" style={{ fontFamily: FONT_HEADING }}>الأكثر مبيعاً</h3>
                <div className="overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                        <th className="pb-3 font-medium">الصنف</th>
                        <th className="pb-3 font-medium text-right">مباع</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {getTopSellingProducts(dashboardOrders).map(([name, qty], idx) => (
                        <tr key={idx} className="group hover:bg-gray-50 transition-colors">
                          <td className="py-3">
                            <div className="flex items-center gap-3">
                              <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${idx < 3 ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500'}`}>
                                {idx + 1}
                              </span>
                              <span className="text-sm font-medium text-gray-700">{name}</span>
                            </div>
                          </td>
                          <td className="py-3 text-right text-sm font-bold text-primary">{qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {getTopSellingProducts(dashboardOrders).length === 0 && <p className="text-center text-gray-400 text-sm py-4">لا بيانات مبيعات</p>}
                </div>
              </div>

              {/* Sales by Category */}
              <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100">
                <h3 className="text-lg font-bold text-primary mb-4" style={{ fontFamily: FONT_HEADING }}>المبيعات حسب القسم</h3>
                <div className="space-y-3">
                  {(() => {
                    const categoryStats = dashboardOrders.filter(o => o.status === 'paid').reduce((acc, order) => {
                      order.items.forEach(item => {
                          const product = products.find(p => p.id === item.id);
                          const cat = product ? product.category : 'أخرى';
                          acc[cat] = (acc[cat] || 0) + (item.price * item.quantity);
                      });
                      return acc;
                    }, {});
                    
                    return Object.entries(categoryStats)
                      .sort(([,a], [,b]) => b - a)
                      .map(([cat, amount], idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100">
                        <div className="flex items-center gap-3">
                          <div className="w-1.5 h-8 bg-primary rounded-full"></div>
                          <div>
                            <p className="text-sm font-bold text-gray-700">{cat}</p>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wide">الإيراد</p>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-primary">{fmtMoney(amount)}</span>
                      </div>
                    ));
                  })()}
                  {dashboardOrders.filter(o => o.status === 'paid').length === 0 && <p className="text-center text-gray-400 text-sm py-4">لا بيانات أقسام</p>}
                </div>
              </div>
            </div>

            {/* Today's Sales Details */}
            <div className="bg-white shadow-md rounded-xl overflow-hidden border border-gray-200">
              <div className="p-5 border-b border-gray-200 bg-gray-50">
                <h3 className="text-lg font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>تفاصيل مبيعات اليوم</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-white border-b border-gray-200">
                      <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">الوقت</th>
                      <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">رقم الطلب</th>
                      <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">العميل</th>
                      <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider">الأصناف</th>
                      <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">الإجمالي</th>
                      <th className="p-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-center">الحالة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {orders.filter(o => {
                        if (!o.timestamp) return false;
                        const orderDate = o.timestamp.toDate ? o.timestamp.toDate() : new Date(o.timestamp);
                        return orderDate >= today;
                    }).sort((a, b) => {
                        const dateA = a.timestamp.toDate ? a.timestamp.toDate() : new Date(a.timestamp);
                        const dateB = b.timestamp.toDate ? b.timestamp.toDate() : new Date(b.timestamp);
                        return dateB - dateA;
                    }).map((order) => {
                      const orderDate = order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp);
                      return (
                        <tr key={order.id} className="hover:bg-gray-50 transition-colors">
                          <td className="p-4 text-sm text-gray-600">{orderDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                          <td className="p-4 text-sm font-medium text-primary">#{order.orderNumber || order.id.slice(-4).toUpperCase()}</td>
                          <td className="p-4 text-sm text-gray-900">{order.customer || 'ضيف'}</td>
                          <td className="p-4 text-sm text-gray-600">{order.items.length} items</td>
                          <td className="p-4 text-sm font-bold text-primary text-right">{fmtMoney(order.total)}</td>
                          <td className="p-4 text-center">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              order.status === 'paid' ? 'bg-green-100 text-green-700' : 
                              order.status === 'cancelled' ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-700'
                            }`}>
                              {orderStatusLabel(order.status)}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {orders.filter(o => {
                        if (!o.timestamp) return false;
                        const orderDate = o.timestamp.toDate ? o.timestamp.toDate() : new Date(o.timestamp);
                        return orderDate >= today;
                    }).length === 0 && (
                      <tr>
                        <td colSpan="6" className="p-8 text-center text-gray-400 text-sm">لا مبيعات اليوم</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeView === 'settings' && (
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl md:text-3xl text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>إعدادات الحساب</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowSettingsModal(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-primary text-sm font-medium border border-gray-200 hover:bg-gray-50"
                  style={{ fontFamily: FONT_UI }}
                >
                  <Settings size={16} />
                  Store Settings
                </button>
                <button
                  onClick={() => {
                    setProfileForm({
                      businessName: businessProfile?.businessName || '',
                      businessType: businessProfile?.businessType || '',
                      address: businessProfile?.address || '',
                      phone: businessProfile?.phone || '',
                      email: user.email,
                      ownerName: businessProfile?.ownerName || ''
                    });
                    setShowAccountModal(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm hover:opacity-90"
                  style={{ backgroundColor: theme.primary, fontFamily: FONT_UI, fontWeight: 500 }}
                >
                  <User size={16} />
                  تعديل الملف
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl p-5 shadow-md border border-gray-200">
                <h3 className="text-base md:text-lg mb-4 text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>معلومات المنشأة</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs mb-1" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>اسم المنشأة</p>
                    <p className="text-sm" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 500 }}>
                      {businessProfile?.businessName || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>نوع النشاط</p>
                    <p className="text-sm" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 500 }}>
                      {businessProfile?.businessType || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>الجوال</p>
                    <p className="text-sm" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 500 }}>
                      {businessProfile?.phone || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>العنوان</p>
                    <p className="text-sm" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 500 }}>
                      {businessProfile?.address || '-'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-5 shadow-md border border-gray-200">
                <h3 className="text-base md:text-lg mb-4 text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>تفاصيل الحساب</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs mb-1" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>اسم المالك</p>
                    <p className="text-sm" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 500 }}>
                      {businessProfile?.ownerName || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>البريد الإلكتروني</p>
                    <p className="text-sm" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 500 }}>
                      {user.email}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs mb-2" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>الشعار</p>
                    <img src={resolveAppLogo()} alt={APP_NAME} className="w-20 h-20 object-contain rounded-xl border border-gray-200 bg-white p-1" />
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 bg-white rounded-xl p-5 shadow-md border border-gray-200">
              <h3 className="text-base md:text-lg mb-4 text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>إحصائيات</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-xl" style={{ backgroundColor: '#f3f4f6' }}>
                  <p className="text-2xl mb-1" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 600 }}>
                    {products.length}
                  </p>
                  <p className="text-xs" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>المنتجات</p>
                </div>
                <div className="text-center p-3 rounded-xl" style={{ backgroundColor: '#f3f4f6' }}>
                  <p className="text-2xl mb-1" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 600 }}>
                    {orders.length}
                  </p>
                  <p className="text-xs" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>إجمالي الطلبات</p>
                </div>
                <div className="text-center p-3 rounded-xl" style={{ backgroundColor: '#f3f4f6' }}>
                  <p className="text-2xl mb-1" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 600 }}>
                    {fmtMoney(orders.filter(o => o.status === 'paid').reduce((sum, o) => sum + o.total, 0))}
                  </p>
                  <p className="text-xs" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>إجمالي الإيرادات</p>
                </div>
                <div className="text-center p-3 rounded-xl" style={{ backgroundColor: '#f3f4f6' }}>
                  <p className="text-2xl mb-1" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 600 }}>
                    {fmtMoney(totalProfit)}
                  </p>
                  <p className="text-xs" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>إجمالي الربح</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {(activeView === 'expenses' || activeView === 'purchases' || activeView === 'traders') && (() => {
          const summarySection = financeTab === 'purchases' ? 'purchase' : 'operating';
          const summaryExpenses = financeTab === 'traders'
            ? []
            : expenses.filter((e) => resolveExpenseSection(e) === summarySection);
          const pageTitle =
            currentView === 'purchases' ? 'المشتريات' : currentView === 'traders' ? 'التجار' : 'المصروفات';
          const monthTotal = summaryExpenses.filter((e) => {
            if (!e.date) return false;
            const d = e.date.toDate ? e.date.toDate() : new Date(e.date);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
          }).reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
          const allTotal = summaryExpenses.reduce((sum, exp) => sum + (parseFloat(exp.amount) || 0), 0);
          const isPurchaseView = financeTab === 'purchases';
          const isOperatingView = financeTab === 'operating';

          return (
          <div className="max-w-7xl mx-auto" dir="rtl">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <h2 className="text-3xl font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>{pageTitle}</h2>
              <div className="flex gap-2 flex-wrap">
                {financeTab === 'traders' && (
                  <button
                    type="button"
                    onClick={() => setShowSupplierModal(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium hover:opacity-90 shadow-sm transition-all"
                    style={{ backgroundColor: theme.accent, fontFamily: FONT_UI }}
                  >
                    <Plus size={16} />
                    إضافة تاجر
                  </button>
                )}
                {isOperatingView && (
                  <button
                    type="button"
                    onClick={() => openExpenseModalForSection('operating')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium hover:opacity-90 shadow-sm transition-all"
                    style={{ backgroundColor: theme.accent, fontFamily: FONT_UI }}
                  >
                    <Plus size={16} />
                    إضافة مصروف
                  </button>
                )}
                {isPurchaseView && (
                  <button
                    type="button"
                    onClick={() => openExpenseModalForSection('purchase')}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-medium hover:opacity-90 shadow-sm transition-all"
                    style={{ backgroundColor: theme.accent, fontFamily: FONT_UI }}
                  >
                    <Plus size={16} />
                    إضافة مشتريات
                  </button>
                )}
              </div>
            </div>

            {financeTab === 'traders' ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
                  <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-blue-50 rounded-xl text-blue-500"><Users size={20} /></div>
                      <p className="text-sm text-gray-500 font-medium">عدد التجار</p>
                    </div>
                    <p className="text-2xl text-primary" style={{ fontFamily: FONT_UI, fontWeight: 700 }}>{suppliers.length}</p>
                  </div>
                  <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-orange-50 rounded-xl text-orange-500"><ShoppingBag size={20} /></div>
                      <p className="text-sm text-gray-500 font-medium">إجمالي المشتريات</p>
                    </div>
                    <p className="text-2xl text-primary" style={{ fontFamily: FONT_UI, fontWeight: 700 }}>
                      {fmtMoney(expenses.filter((e) => resolveExpenseSection(e) === 'purchase').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0))}
                    </p>
                  </div>
                </div>
                <div className="bg-white shadow-md rounded-xl overflow-hidden border border-gray-200">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-100 border-b border-gray-300">
                          <th className="p-3 text-xs font-bold text-gray-700 border-r border-gray-300 text-right">اسم التاجر</th>
                          <th className="p-3 text-xs font-bold text-gray-700 border-r border-gray-300 text-right">جهة الاتصال</th>
                          <th className="p-3 text-xs font-bold text-gray-700 border-r border-gray-300 text-right">الجوال</th>
                          <th className="p-3 text-xs font-bold text-gray-700 border-r border-gray-300 text-right">البريد</th>
                          <th className="p-3 text-xs font-bold text-gray-700 text-right">العنوان</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {suppliers.map((s) => (
                          <tr key={s.id} className="hover:bg-blue-50 transition-colors">
                            <td className="p-3 text-sm font-medium text-gray-900 border-r border-gray-200">{s.name}</td>
                            <td className="p-3 text-sm text-gray-600 border-r border-gray-200">{s.contactPerson || '—'}</td>
                            <td className="p-3 text-sm text-gray-600 border-r border-gray-200">{s.phone || '—'}</td>
                            <td className="p-3 text-sm text-gray-600 border-r border-gray-200">{s.email || '—'}</td>
                            <td className="p-3 text-sm text-gray-600">{s.address || '—'}</td>
                          </tr>
                        ))}
                        {suppliers.length === 0 && (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-gray-500 text-sm bg-gray-50">لا يوجد تجار — أضف تاجراً لتسجيل المشتريات</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
                  <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-red-50 rounded-xl text-red-500"><TrendingDown size={20} /></div>
                      <p className="text-sm text-gray-500 font-medium">{isPurchaseView ? 'إجمالي المشتريات' : 'إجمالي المصروفات'}</p>
                    </div>
                    <p className="text-2xl text-primary" style={{ fontFamily: FONT_UI, fontWeight: 700 }}>{fmtMoney(allTotal)}</p>
                  </div>
                  <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-orange-50 rounded-xl text-orange-500"><Calendar size={20} /></div>
                      <p className="text-sm text-gray-500 font-medium">هذا الشهر</p>
                    </div>
                    <p className="text-2xl text-primary" style={{ fontFamily: FONT_UI, fontWeight: 700 }}>{fmtMoney(monthTotal)}</p>
                  </div>
                  <div className="bg-white rounded-2xl p-6 shadow-md border border-gray-100">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="p-2 bg-blue-50 rounded-xl text-blue-500"><FileText size={20} /></div>
                      <p className="text-sm text-gray-500 font-medium">عدد العمليات</p>
                    </div>
                    <p className="text-2xl text-primary" style={{ fontFamily: FONT_UI, fontWeight: 700 }}>{summaryExpenses.length}</p>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  {['all', 'today', 'yesterday', 'lastWeek', 'lastMonth', 'custom'].map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      onClick={() => setExpenseFilter(filter)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        expenseFilter === filter ? 'text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                      }`}
                      style={expenseFilter === filter ? { backgroundColor: theme.primary, fontFamily: FONT_UI } : { fontFamily: FONT_UI }}
                    >
                      {expenseFilterLabel(filter)}
                    </button>
                  ))}
                </div>

                {expenseFilter === 'custom' && (
                  <div className="bg-white p-4 rounded-xl border border-gray-200 mb-5 flex flex-wrap gap-4 items-end">
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>من تاريخ</label>
                      <input
                        type="date"
                        value={expenseCustomDateRange.start}
                        onChange={(e) => setExpenseCustomDateRange((prev) => ({ ...prev, start: e.target.value }))}
                        className="px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm"
                        style={{ fontFamily: FONT_UI }}
                      />
                    </div>
                    <div>
                      <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>إلى تاريخ</label>
                      <input
                        type="date"
                        value={expenseCustomDateRange.end}
                        onChange={(e) => setExpenseCustomDateRange((prev) => ({ ...prev, end: e.target.value }))}
                        className="px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm"
                        style={{ fontFamily: FONT_UI }}
                      />
                    </div>
                  </div>
                )}

                <div className="bg-white shadow-md rounded-xl overflow-hidden border border-gray-200">
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="bg-gray-100 border-b border-gray-300">
                          <th className="p-3 text-xs font-bold text-gray-700 border-r border-gray-300 text-right">التاريخ</th>
                          {isOperatingView && (
                            <th className="p-3 text-xs font-bold text-gray-700 border-r border-gray-300 text-right">النوع</th>
                          )}
                          <th className="p-3 text-xs font-bold text-gray-700 border-r border-gray-300 text-right">البيان</th>
                          {isPurchaseView && (
                            <th className="p-3 text-xs font-bold text-gray-700 border-r border-gray-300 text-right">التاجر</th>
                          )}
                          <th className="p-3 text-xs font-bold text-gray-700 border-r border-gray-300 text-left">المبلغ</th>
                          <th className="p-3 text-xs font-bold text-gray-700 border-r border-gray-300 text-center">إيصال</th>
                          <th className="p-3 text-xs font-bold text-gray-700 text-center">إجراءات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {getFilteredExpenses().map((expense) => (
                          <tr key={expense.id} className="hover:bg-blue-50 transition-colors">
                            <td className="p-3 text-sm text-gray-900 border-r border-gray-200 font-medium">
                              {expense.date && (expense.date.toDate ? expense.date.toDate().toLocaleDateString('ar') : new Date(expense.date).toLocaleDateString('ar'))}
                            </td>
                            {isOperatingView && (
                              <td className="p-3 text-sm text-gray-900 border-r border-gray-200">
                                <span className="px-2 py-1 rounded-md bg-gray-100 text-gray-700 text-xs font-medium border border-gray-300">
                                  {expenseCategoryLabel(expense.category)}
                                </span>
                              </td>
                            )}
                            <td className="p-3 text-sm text-gray-600 border-r border-gray-200">{expense.description || '—'}</td>
                            {isPurchaseView && (
                              <td className="p-3 text-sm text-gray-600 border-r border-gray-200">
                                {suppliers.find((s) => s.id === expense.supplierId)?.name || '—'}
                              </td>
                            )}
                            <td className="p-3 text-sm font-bold text-gray-900 text-left border-r border-gray-200">
                              {fmtMoney(parseFloat(expense.amount))}
                            </td>
                            <td className="p-3 text-center border-r border-gray-200">
                              {expense.receiptUrl ? (
                                <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 hover:underline text-xs font-medium inline-flex items-center gap-1">
                                  <FileText size={12} /> عرض
                                </a>
                              ) : (
                                <span className="text-gray-400 text-xs">—</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleEditExpense(expense)}
                                  className="p-1.5 rounded hover:bg-gray-200 text-gray-600 transition-colors"
                                  title="تعديل"
                                >
                                  <Pencil size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExpense(expense.id)}
                                  className="p-1.5 rounded hover:bg-red-100 text-red-500 transition-colors"
                                  title="حذف"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {getFilteredExpenses().length === 0 && (
                          <tr>
                            <td colSpan={isPurchaseView ? 6 : 6} className="p-8 text-center text-gray-500 text-sm bg-gray-50">
                              {isPurchaseView ? 'لا توجد مشتريات في هذه الفترة' : 'لا توجد مصروفات في هذه الفترة'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
          );
        })()}

        {activeView === 'reports' && (
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <h2 className="text-2xl md:text-3xl text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>التقارير</h2>
              
              <div className="flex flex-wrap gap-2">
                {['today', 'yesterday', 'lastWeek', 'lastMonth', 'all', 'custom'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setReportFilter(filter)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      reportFilter === filter 
                        ? 'text-white' 
                        : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                    }`}
                    style={reportFilter === filter ? { backgroundColor: theme.primary, fontFamily: FONT_UI } : { fontFamily: FONT_UI }}
                  >
                    {reportFilterLabel(filter)}
                  </button>
                ))}
              </div>
            </div>

            {reportFilter === 'custom' && (
              <div className="bg-white p-4 rounded-xl border border-gray-200 mb-5 flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>من تاريخ</label>
                  <input
                    type="date"
                    value={reportCustomDates.start}
                    onChange={(e) => setReportCustomDates(prev => ({ ...prev, start: e.target.value }))}
                    className="px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm"
                    style={{ fontFamily: FONT_UI }}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>إلى تاريخ</label>
                  <input
                    type="date"
                    value={reportCustomDates.end}
                    onChange={(e) => setReportCustomDates(prev => ({ ...prev, end: e.target.value }))}
                    className="px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm"
                    style={{ fontFamily: FONT_UI }}
                  />
                </div>
              </div>
            )}
            
            {(() => {
              const now = new Date();
              const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
              const yesterdayStart = new Date(todayStart);
              yesterdayStart.setDate(yesterdayStart.getDate() - 1);
              const yesterdayEnd = new Date(todayStart);
              yesterdayEnd.setMilliseconds(-1);
              const lastWeekStart = new Date(todayStart);
              lastWeekStart.setDate(lastWeekStart.getDate() - 6);
              const lastMonthStart = new Date(todayStart);
              lastMonthStart.setDate(lastMonthStart.getDate() - 29);

              const filterDate = (date) => {
                if (!date) return false;
                const itemDate = date.toDate ? date.toDate() : new Date(date);
                
                switch (reportFilter) {
                  case 'today':
                    return itemDate >= todayStart;
                  case 'yesterday':
                    return itemDate >= yesterdayStart && itemDate <= yesterdayEnd;
                  case 'lastWeek':
                    return itemDate >= lastWeekStart;
                  case 'lastMonth':
                    return itemDate >= lastMonthStart;
                  case 'custom':
                    if (reportCustomDates.start && reportCustomDates.end) {
                      const [sY, sM, sD] = reportCustomDates.start.split('-').map(Number);
                      const [eY, eM, eD] = reportCustomDates.end.split('-').map(Number);
                      const start = new Date(sY, sM - 1, sD);
                      const end = new Date(eY, eM - 1, eD);
                      end.setHours(23, 59, 59, 999);
                      return itemDate >= start && itemDate <= end;
                    }
                    return true;
                  case 'all':
                  default:
                    return true;
                }
              };

              const filteredOrders = orders.filter(o => o.status === 'paid' && filterDate(o.timestamp));
              const filteredExpenses = expenses.filter(e => filterDate(e.date));
              
              const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.total, 0);
              const totalDiscounts = filteredOrders.reduce((sum, o) => sum + (o.discountAmount || 0), 0);
              const totalComplimentsValue = filteredOrders.filter(o => o.paymentMethod === 'Compliment').reduce((sum, o) => sum + (o.subtotal || 0), 0);
              
              const netSales = totalRevenue;
              const totalCost = filteredOrders.reduce((sum, o) => sum + (o.cost || 0), 0);
              const grossProfit = netSales - totalCost;
              const totalExpenses = filteredExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
              const netProfit = grossProfit - totalExpenses;
              
              const totalTransactions = filteredOrders.length;
              const totalItemsSoldPeriod = filteredOrders.reduce((sum, o) => sum + o.items.reduce((isum, item) => isum + item.quantity, 0), 0);
              const avgTransactionValue = totalTransactions > 0 ? netSales / totalTransactions : 0;
              const grossProfitMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;
              const netProfitMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0;

              // Sales by Payment Method
              const salesByPaymentMethod = {};
              filteredOrders.forEach(order => {
                const method = order.paymentMethod || 'غير محدد';
                salesByPaymentMethod[method] = (salesByPaymentMethod[method] || 0) + order.total;
              });

              // Top Selling Products Calculation
              const productSales = {};
              filteredOrders.forEach(order => {
                order.items.forEach(item => {
                  if (!productSales[item.name]) productSales[item.name] = 0;
                  productSales[item.name] += item.quantity;
                });
              });
              const sortedProducts = Object.entries(productSales)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5);

              // Detailed Product Sales
              const productSalesDetails = {};
              filteredOrders.forEach(order => {
                order.items.forEach(item => {
                  if (!productSalesDetails[item.name]) {
                    productSalesDetails[item.name] = { quantity: 0, revenue: 0 };
                  }
                  productSalesDetails[item.name].quantity += item.quantity;
                  productSalesDetails[item.name].revenue += (item.price * item.quantity);
                });
              });
              const sortedProductDetails = Object.entries(productSalesDetails)
                .sort(([,a], [,b]) => b.quantity - a.quantity);

              // Sales by Category
              const getSalesByCategory = () => {
                const categorySales = {};
                let totalSales = 0;

                filteredOrders.forEach(order => {
                  order.items.forEach(item => {
                    const product = products.find(p => p.id === item.id);
                    const category = product ? product.category : 'أخرى';
                    
                    if (!categorySales[category]) categorySales[category] = 0;
                    categorySales[category] += (item.price * item.quantity);
                    totalSales += (item.price * item.quantity);
                  });
                });

                return Object.entries(categorySales)
                  .map(([category, amount]) => ({
                    category,
                    amount,
                    percentage: totalSales > 0 ? (amount / totalSales) * 100 : 0
                  }))
                  .sort((a, b) => b.amount - a.amount);
              };
              const salesByCategory = getSalesByCategory();

              const handleExportPdf = async () => {
                if (reportPdfLoading) return;
                setReportPdfLoading(true);
                try {
                  await downloadBusinessReportPdf({
                    business: businessProfile,
                    periodLabel: reportFilterLabel(reportFilter),
                    fmtMoney,
                    paymentMethodLabel,
                    expenseCategoryLabel,
                    totalRevenue,
                    netSales,
                    totalCost,
                    grossProfit,
                    grossProfitMargin,
                    totalExpenses,
                    netProfit,
                    netProfitMargin,
                    totalTransactions,
                    totalItemsSoldPeriod,
                    avgTransactionValue,
                    totalDiscounts,
                    totalComplimentsValue,
                    salesByPaymentMethod,
                    salesByCategory,
                    sortedProducts,
                    sortedProductDetails,
                    filteredExpenses,
                  });
                } catch (e) {
                  alert(e.message || 'تعذّر إنشاء ملف PDF');
                } finally {
                  setReportPdfLoading(false);
                }
              };

              const handleExport = () => {
                const csvContent = [
                  ['تقرير المبيعات', `الفترة: ${reportFilterLabel(reportFilter)}`],
                  ['تاريخ التقرير', new Date().toLocaleString()],
                  [],
                  ['ملخص المؤشرات'],
                  ['إجمالي الإيرادات', totalRevenue],
                  ['صافي المبيعات', netSales],
                  ['إجمالي التكلفة', totalCost],
                  ['إجمالي الربح', grossProfit],
                  ['إجمالي المصروفات', totalExpenses],
                  ['صافي الربح', netProfit],
                  [],
                  ['مؤشرات الأداء'],
                  ['عدد العمليات', totalTransactions],
                  ['إجمالي الأصناف المباعة', totalItemsSoldPeriod],
                  ['متوسط قيمة العملية', avgTransactionValue],
                  ['هامش إجمالي الربح', `${grossProfitMargin.toFixed(2)}%`],
                  ['هامش صافي الربح', `${netProfitMargin.toFixed(2)}%`],
                  [],
                  ['إجمالي الخصومات', totalDiscounts],
                  [],
                  ['المبيعات حسب طريقة الدفع'],
                  ['الطريقة', 'المبلغ'],
                  ...Object.entries(salesByPaymentMethod).map(([method, amount]) => [paymentMethodLabel(method), amount]),
                  [],
                  ['الأكثر مبيعاً'],
                  ['الصنف', 'الكمية'],
                  ...sortedProducts,
                  [],
                  ['قائمة المصروفات'],
                  ['التاريخ', 'الفئة', 'البيان', 'المبلغ'],
                  ...filteredExpenses.map(e => [
                    e.date && (e.date.toDate ? e.date.toDate().toLocaleDateString() : new Date(e.date).toLocaleDateString()),
                    expenseCategoryLabel(e.category),
                    e.description || '-',
                    e.amount
                  ])
                ].map((e) => e.join(',')).join('\n');

                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.download = `sales_report_${new Date().toISOString().split('T')[0]}.csv`;
                link.click();
              };

              return (
                <>
                  <div className="flex justify-end mb-6 gap-2 flex-wrap">
                    <button 
                      onClick={handleExportPdf}
                      disabled={reportPdfLoading}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50"
                      style={{ fontFamily: FONT_UI }}
                    >
                      <Download size={16} />
                      {reportPdfLoading ? 'جاري إنشاء PDF…' : 'تصدير PDF'}
                    </button>
                    <button 
                      onClick={handleExport}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent text-white text-sm font-medium hover:opacity-90 transition-all"
                      style={{ fontFamily: FONT_UI }}
                    >
                      <Download size={16} />
                      تصدير CSV
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
                      <p className="text-xs mb-1 text-gray-500">إجمالي المبيعات</p>
                      <p className="text-2xl font-bold text-primary">
                        {fmtMoney(netSales)}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">أسعار الأصناف فقط — بدون ضريبة</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
                      <p className="text-xs mb-1 text-gray-500">إجمالي الربح</p>
                      <p className="text-2xl font-bold text-primary">
                        {fmtMoney(grossProfit)}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">Margin: {grossProfitMargin.toFixed(1)}%</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
                      <p className="text-xs mb-1 text-gray-500">إجمالي المصروفات</p>
                      <p className="text-2xl font-bold text-orange-600">
                        {fmtMoney(totalExpenses)}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">OpEx + COGS: {fmtMoney((totalExpenses + totalCost))}</p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
                      <p className="text-xs mb-1 text-gray-500">صافي الربح</p>
                      <p className={`text-2xl font-bold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmtMoney(netProfit)}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">Margin: {netProfitMargin.toFixed(1)}%</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
                      <p className="text-xs mb-1 text-gray-500">عدد العمليات</p>
                      <p className="text-xl font-bold text-primary">
                        {totalTransactions}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
                      <p className="text-xs mb-1 text-gray-500">إجمالي الأصناف المباعة</p>
                      <p className="text-xl font-bold text-primary">
                        {totalItemsSoldPeriod}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
                      <p className="text-xs mb-1 text-gray-500">متوسط قيمة العملية</p>
                      <p className="text-xl font-bold text-primary">
                        {fmtMoney(avgTransactionValue)}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
                      <p className="text-xs mb-1 text-gray-500">إجمالي الخصومات</p>
                      <p className="text-xl font-bold text-red-500">
                        - {fmtMoney(totalDiscounts)}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl p-4 shadow-md border border-gray-200">
                      <p className="text-xs mb-1 text-gray-500">إهداءات مجانية</p>
                      <p className="text-xl font-bold text-accent">
                        {fmtMoney(totalComplimentsValue)}
                      </p>
                      <p className="text-[10px] text-gray-400 mt-1">{filteredOrders.filter(o => o.paymentMethod === 'Compliment').length} طلب</p>
                    </div>
                  </div>

                  {/* Sales by Category Chart */}
                  <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200 mb-6">
                    <h3 className="text-lg md:text-xl font-bold mb-4 text-primary" style={{ fontFamily: FONT_HEADING }}>المبيعات حسب القسم</h3>
                    <div className="space-y-4">
                      {salesByCategory.length > 0 ? salesByCategory.map((data, i) => (
                        <div key={i}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium text-gray-700">{data.category}</span>
                            <span className="font-bold text-primary">{fmtMoney(data.amount)} ({data.percentage.toFixed(1)}%)</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                            <div 
                              className="h-full rounded-full bg-accent" 
                              style={{ width: `${data.percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      )) : (
                        <div className="text-center text-gray-400 py-8">لا بيانات مبيعات لهذه الفترة</div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
                      <h3 className="text-lg md:text-xl font-bold mb-4 text-primary" style={{ fontFamily: FONT_HEADING }}>المبيعات حسب طريقة الدفع</h3>
                      <div className="space-y-4">
                        {Object.entries(salesByPaymentMethod).sort(([,a], [,b]) => b - a).map(([method, amount], idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-primary"></div>
                              <span className="text-sm font-medium text-gray-700">{paymentMethodLabel(method)}</span>
                            </div>
                            <span className="text-sm font-bold text-primary">{fmtMoney(amount)}</span>
                          </div>
                        ))}
                        {Object.keys(salesByPaymentMethod).length === 0 && <p className="text-sm text-gray-400 text-center">لا بيانات مبيعات</p>}
                      </div>
                    </div>

                    <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200">
                      <h3 className="text-lg md:text-xl font-bold mb-4 text-primary" style={{ fontFamily: FONT_HEADING }}>الأكثر مبيعاً</h3>
                      <div className="space-y-4">
                        {sortedProducts.map(([name, qty], idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">{idx + 1}. {name}</span>
                            <span className="text-sm text-gray-500">{qty} sold</span>
                          </div>
                        ))}
                        {sortedProducts.length === 0 && <p className="text-sm text-gray-400 text-center">لا مبيعات في هذه الفترة</p>}
                      </div>
                    </div>

                    <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200 lg:col-span-2">
                      <h3 className="text-lg md:text-xl font-bold mb-4 text-primary" style={{ fontFamily: FONT_HEADING }}>مصروفات الفترة</h3>
                      <div className="space-y-4">
                        {filteredExpenses.slice(0, 5).map(expense => (
                          <div key={expense.id} className="flex items-center justify-between border-b border-gray-50 pb-2 last:border-0">
                            <div>
                              <p className="text-sm font-medium text-gray-700">{expense.description || expenseCategoryLabel(expense.category)}</p>
                              <p className="text-xs text-gray-400">{expense.date && (expense.date.toDate ? expense.date.toDate().toLocaleDateString() : new Date(expense.date).toLocaleDateString())}</p>
                            </div>
                            <span className="text-sm font-bold text-red-500">- {fmtMoney(parseFloat(expense.amount))}</span>
                          </div>
                        ))}
                        {filteredExpenses.length === 0 && <p className="text-sm text-gray-400 text-center">لا مصروفات في هذه الفترة</p>}
                      </div>
                    </div>

                    <div className="bg-white rounded-xl p-6 shadow-md border border-gray-200 lg:col-span-2">
                      <h3 className="text-lg md:text-xl font-bold mb-4 text-primary" style={{ fontFamily: FONT_HEADING }}>تفاصيل الأصناف المباعة</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left">
                          <thead>
                            <tr className="border-b border-gray-100">
                              <th className="pb-3 text-xs font-medium text-gray-500">اسم الصنف</th>
                              <th className="pb-3 text-xs font-medium text-gray-500 text-right">الكمية</th>
                              <th className="pb-3 text-xs font-medium text-gray-500 text-right">الإيراد</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedProductDetails.map(([name, data], idx) => (
                              <tr key={idx} className="border-b border-gray-50 last:border-0">
                                <td className="py-3 text-sm font-medium text-gray-700">{name}</td>
                                <td className="py-3 text-sm text-gray-600 text-right">{data.quantity}</td>
                                <td className="py-3 text-sm text-primary font-medium text-right">{fmtMoney(data.revenue)}</td>
                              </tr>
                            ))}
                            {sortedProductDetails.length === 0 && (
                              <tr>
                                <td colSpan="3" className="py-4 text-center text-sm text-gray-400">لم تُبَع أصناف في هذه الفترة</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {activeView === 'pos' && (
          <div className="max-w-7xl mx-auto h-full">
            <div className="flex h-full flex-col lg:flex-row gap-6">
              <div className="flex-1 min-w-0 pb-20 lg:pb-0">
              <div className="mb-6">
                <h2 className="text-2xl md:text-3xl mb-4 text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>القائمة</h2>
                
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="flex-1 relative">
                    <Search className="absolute end-4 top-1/2 -translate-y-1/2 pointer-events-none" size={18} style={{ color: 'var(--color-text-muted)' }} />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="بحث في المنتجات..."
                      className="layali-input w-full pe-11 ps-4 py-3 text-sm shadow-sm border-none"
                      style={{ fontFamily: FONT_UI }}
                    />
                  </div>
                </div>

                <div className="flex gap-2 mb-5 overflow-x-auto pb-2 scrollbar-thin">
                  {posMenuTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setSelectedCategory(tab.id)}
                      className={`px-5 py-2.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                        selectedCategory === tab.id ? 'text-white shadow-sm bg-primary' : 'bg-white border border-[var(--color-border)] text-layali-muted hover:border-accent'
                      }`}
                      style={{ fontFamily: FONT_UI }}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 sm:gap-5">
                {filteredProducts.map((product) => (
                  <PosProductCard key={product.id} product={product} onAdd={addToOrder} />
                ))}
              </div>
              {filteredProducts.length === 0 && (
                <div className="text-center py-16 space-y-4">
                  <p className="text-layali-muted text-sm" style={{ fontFamily: FONT_UI }}>
                    لا توجد منتجات في القائمة بعد.
                  </p>
                  <button
                    type="button"
                    onClick={openAddProductModal}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium hover:opacity-90"
                    style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
                  >
                    <Plus size={16} />
                    إضافة صنف مع صورة
                  </button>
                </div>
              )}
            </div>

            {/* Cart Section - Desktop: Sidebar, Mobile: Full Screen Overlay */}
            <div className={`
              lg:w-96 bg-white shadow-xl border border-gray-200 p-4 md:p-5 flex flex-col rounded-2xl lg:h-[calc(100vh-100px)]
              ${isMobileCartOpen ? 'fixed inset-0 z-50 rounded-none h-[100dvh]' : 'hidden lg:flex'}
            `}>
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-lg md:text-xl" style={{ color: theme.text, fontFamily: FONT_HEADING, fontWeight: 600 }}>الطلب الحالي</h3>
                {/* Mobile Close Button */}
                <button 
                  onClick={() => setIsMobileCartOpen(false)}
                  className="lg:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-full"
                >
                  <X size={24} />
                </button>
              </div>
              
              <label className="block text-[10px] text-gray-500 mb-1" style={{ fontFamily: FONT_UI }}>العميل</label>
              <select
                value={currentOrder.customerId || ''}
                onChange={(e) => selectOrderCustomer(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 mb-2 outline-none text-sm bg-white"
                style={{ fontFamily: FONT_UI }}
              >
                <option value="">ضيف (بدون ملف)</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {!currentOrder.customerId && (
                <input
                  type="text"
                  value={currentOrder.customer}
                  onChange={(e) => setCurrentOrder((prev) => ({ ...prev, customer: e.target.value }))}
                  placeholder="اسم الضيف (اختياري)"
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 mb-2 outline-none text-sm"
                  style={{ fontFamily: FONT_UI }}
                />
              )}

              <input
                type="text"
                value={currentOrder.notes}
                onChange={(e) => setCurrentOrder(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="ملاحظات (اختياري)"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 mb-3 outline-none text-sm"
                style={{ fontFamily: FONT_UI }}
              />

              <div className="flex-1 overflow-auto mb-3 space-y-2">
                {currentOrder.items.map(item => (
                  <div key={item.cartItemId || item.id} className="rounded-xl p-3" style={{ backgroundColor: '#f3f4f6' }}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <p className="text-sm" style={{ fontFamily: FONT_UI, fontWeight: 600, color: theme.text }}>
                          {item.name}
                        </p>
                        {item.selectedAddons && item.selectedAddons.length > 0 && (
                          <p className="text-xs text-gray-500 mt-0.5">{item.selectedAddons.map(a => a.name).join(', ')}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setCurrentOrder(prev => ({ ...prev, items: prev.items.filter(i => (i.cartItemId || i.id) !== (item.cartItemId || item.id)) }))}
                        className="text-red-500 ml-2"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.cartItemId || item.id, -1)}
                          className="w-7 h-7 rounded-lg bg-white flex items-center justify-center text-sm font-medium"
                          style={{ color: theme.text }}
                        >
                          -
                        </button>
                        <button className="w-6 text-center text-sm" style={{ fontFamily: FONT_UI, fontWeight: 600, color: theme.text }}>
                          {item.quantity}
                        </button>
                        <button
                          onClick={() => updateQuantity(item.cartItemId || item.id, 1)}
                          className="w-7 h-7 rounded-lg text-white flex items-center justify-center text-sm font-medium"
                          style={{ backgroundColor: theme.primary }}
                        >
                          +
                        </button>
                      </div>
                      <p className="text-sm" style={{ fontFamily: FONT_UI, fontWeight: 600, color: theme.text }}>
                        {fmtMoney((item.price * item.quantity))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-3 mb-3">
                <div className="flex justify-between items-center mb-2">
                   <button 
                     onClick={() => setShowDiscountModal(true)}
                     className="text-xs text-accent font-medium hover:underline flex items-center gap-1"
                   >
                     <Percent size={12} />
                     {discount > 0 
                      ? `خصم (${discountType === 'percentage' ? `${discount}%` : fmtMoney(discount)})` 
                      : 'إضافة خصم'}
                   </button>
                   {discount > 0 && (
                     <span className="text-sm text-red-500">- {fmtMoney(cartDiscountAmount)}</span>
                   )}
                </div>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-base" style={{ fontFamily: FONT_UI, fontWeight: 500, color: theme.textMuted }}>الإجمالي</span>
                  <span className="text-2xl md:text-3xl" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 600 }}
                  >
                    {fmtMoney(cartTotal)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => completeOrder('unpaid', { paymentType: 'pending' })}
                    disabled={currentOrder.items.length === 0 || uploadProgress}
                    className="py-2.5 rounded-xl text-white text-sm font-medium shadow-sm disabled:opacity-50"
                    style={{ backgroundColor: theme.accent, fontFamily: FONT_UI }}
                  >
                    حفظ مؤجل
                  </button>
                  <button
                    onClick={() => {
                      setShowPaymentModal(true);
                      setPaymentCustomPrice('');
                      setMixedCashAmount('');
                    }}
                    disabled={currentOrder.items.length === 0 || uploadProgress}
                    className="py-2.5 rounded-xl text-white text-sm font-medium shadow-sm disabled:opacity-50"
                    style={{ backgroundColor: '#10b981', fontFamily: FONT_UI }}
                  >
                    إتمام الدفع
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Mobile Cart Toggle Bar */}
          {!isMobileCartOpen && !isSidebarOpen && (
            <div className="fixed bottom-4 left-4 right-4 lg:hidden z-40">
              <button
                onClick={() => setIsMobileCartOpen(true)}
                className="w-full bg-primary text-white p-4 rounded-xl shadow-xl flex justify-between items-center"
              >
                <div className="flex items-center gap-2">
                  <div className="bg-white/20 px-2 py-1 rounded text-xs font-bold">{currentOrder.items.reduce((acc, item) => acc + item.quantity, 0)} أصناف</div>
                </div>
                <div className="font-bold">{fmtMoney(cartTotal)}</div>
                <span className="text-xs font-medium">عرض الطلب ←</span>
              </button>
            </div>
          )}
          </div>
        )}

        {activeView === 'orders' && (
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <h2 className="text-2xl md:text-3xl text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>الطلبات</h2>
              
              <div className="flex flex-wrap gap-2">
                {['all', 'today', 'yesterday', 'lastWeek', 'custom'].map(filter => (
                  <button
                    key={filter}
                    onClick={() => setOrderFilter(filter)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      orderFilter === filter 
                        ? 'text-white' 
                        : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                    }`}
                    style={orderFilter === filter ? { backgroundColor: theme.primary, fontFamily: FONT_UI } : { fontFamily: FONT_UI }}
                  >
                    {orderFilterLabel(filter)}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {['all', 'paid', 'unpaid', 'cancelled'].map(status => (
                  <button
                    key={status}
                    onClick={() => setOrderStatusFilter(status)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      orderStatusFilter === status 
                        ? 'text-white' 
                        : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                    }`}
                    style={orderStatusFilter === status ? { backgroundColor: theme.primary, fontFamily: FONT_UI } : { fontFamily: FONT_UI }}
                  >
                    {orderStatusLabel(status)}
                  </button>
                ))}
              </div>
            </div>

            {orderFilter === 'custom' && (
              <div className="bg-white p-4 rounded-xl border border-gray-200 mb-5 flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>من تاريخ</label>
                  <input
                    type="date"
                    value={customDateRange.start}
                    onChange={(e) => setCustomDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm"
                    style={{ fontFamily: FONT_UI }}
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>إلى تاريخ</label>
                  <input
                    type="date"
                    value={customDateRange.end}
                    onChange={(e) => setCustomDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="px-3 py-2 rounded-xl border border-gray-200 outline-none text-sm"
                    style={{ fontFamily: FONT_UI }}
                  />
                </div>
              </div>
            )}
            
            <div className="space-y-3">
              {getFilteredOrders().map(order => {
                const orderDate = order.timestamp ? (order.timestamp.toDate ? order.timestamp.toDate() : new Date(order.timestamp)) : new Date();
                return (
                  <div key={order.id} className="bg-white rounded-xl p-4 md:p-5 shadow-md border border-gray-200">
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                            #{order.orderNumber || order.id.slice(-8).toUpperCase()}
                          </span>
                          <p className="text-base" style={{ fontFamily: FONT_UI, fontWeight: 600, color: theme.text }}>
                            {order.customer || 'ضيف'}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 text-xs" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>
                          <span className="flex items-center gap-1">
                            <Calendar size={12} />
                            {orderDate.toLocaleDateString()}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {orderDate.toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-xs mt-1" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>
                          الدفع:{' '}
                          <span className="font-medium">
                            {paymentTypeLabel(order.paymentType) || paymentMethodLabel(order.paymentMethod) || '—'}
                          </span>
                          {Number(order.cashPaid) > 0 && (
                            <span> — كاش {fmtMoney(order.cashPaid)}</span>
                          )}
                          {Number(order.debtAmount) > 0 && (
                            <span className="text-red-600"> — دين {fmtMoney(order.debtAmount)}</span>
                          )}
                        </p>
                        {order.notes && (
                          <p className="text-xs mt-1" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>
                            ملاحظات: {order.notes}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col md:items-end gap-2">
                        <p className="text-xl md:text-2xl" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 600 }}>
                          {fmtMoney(order.total)}
                        </p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => order.status !== 'cancelled' && toggleOrderStatus(order.id, order.status)}
                            disabled={order.status === 'cancelled'}
                            className={`px-3 py-1.5 rounded-lg text-white text-xs font-medium ${order.status === 'paid' ? 'bg-green-500' : order.status === 'cancelled' ? 'bg-gray-400' : 'bg-yellow-500'}`}
                            style={{ fontFamily: FONT_UI }}
                          >
                            {order.status === 'paid' ? 'مدفوع' : order.status === 'cancelled' ? 'ملغى' : 'غير مدفوع'}
                          </button>
                          {order.status !== 'cancelled' && (
                            <button
                              onClick={() => handleCancelOrder(order.id)}
                              className="px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 text-xs font-medium transition-colors border border-red-200"
                              style={{ fontFamily: FONT_UI }}
                            >
                              إلغاء
                            </button>
                          )}
                          <button
                            onClick={() => handleEditOrder(order)}
                            className="px-3 py-1.5 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 text-xs font-medium transition-colors"
                            style={{ fontFamily: FONT_UI }}
                          >
                            تعديل
                          </button>
                          <button
                            onClick={() => handleDeleteOrder(order.id)}
                            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-medium transition-colors"
                            style={{ fontFamily: FONT_UI }}
                          >
                            <Trash2 size={14} />
                          </button>
                          <button
                            onClick={() => printReceipt(order)}
                            className="px-3 py-1.5 rounded-lg text-white text-xs font-medium flex items-center gap-1"
                            style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
                          >
                            <Printer size={14} />
                            طباعة
                          </button>
                          <button
                            onClick={() => toggleOrderExpansion(order.id)}
                            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 text-xs font-medium transition-colors flex items-center gap-1"
                            style={{ fontFamily: FONT_UI }}
                          >
                            {expandedOrderIds.includes(order.id) ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {expandedOrderIds.includes(order.id) && (
                      <div className="space-y-1.5 border-t border-gray-100 pt-3 mt-3">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="p-3 rounded-xl text-sm" style={{ backgroundColor: '#f3f4f6' }}>
                            <div className="flex justify-between mb-1">
                              <span style={{ fontFamily: FONT_UI, color: theme.text, fontWeight: 500 }}>
                                {item.quantity}x {item.name}
                              </span>
                              <span style={{ fontFamily: FONT_UI, fontWeight: 600, color: theme.text }}>
                                {fmtMoney((item.price * item.quantity))}
                              </span>
                            </div>
                            {item.selectedAddons && item.selectedAddons.length > 0 && (
                              <div className="text-xs text-gray-500 mt-1 pl-2 border-l-2 border-gray-300 space-y-0.5">
                                {item.selectedAddons.map((addon, aIdx) => (
                                  <div key={aIdx} className="flex justify-between">
                                    <span>+ {addon.name}</span>
                                    {addon.price > 0 && <span>{fmtMoney(parseFloat(addon.price))}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {getFilteredOrders().length === 0 && (
                <div className="text-center py-10 text-gray-500 font-medium">
                  No orders found for this period
                </div>
              )}
            </div>
          </div>
        )}

        {activeView === 'customers' && (
          <CustomersView
            customers={customers}
            orders={orders}
            fmtMoney={fmtMoney}
            theme={theme}
            FONT_UI={FONT_UI}
            FONT_HEADING={FONT_HEADING}
            onSaveCustomer={handleSaveCustomer}
            onAddLegacyDebt={handleAddLegacyDebt}
            onDeleteCustomer={isEmployee ? undefined : handleDeleteCustomer}
            onExportCustomerFile={exportCustomerFile}
            onClearAllCustomers={isEmployee ? undefined : handleClearAllCustomers}
            businessProfile={businessProfile}
            onExportCustomersLedgerPdf={exportCustomersLedgerPdf}
            customersLedgerPdfLoading={customersLedgerPdfLoading}
          />
        )}

        {activeView === 'inventory' && (
          <div className="max-w-7xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl md:text-3xl text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>المخزون</h2>
              <button
                onClick={openAddProductModal}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-medium hover:opacity-90"
                style={{ backgroundColor: theme.accent, fontFamily: FONT_UI }}
              >
                <Plus size={16} />
                إضافة صنف
              </button>
            </div>

            <div className="flex gap-2 mb-5 overflow-x-auto pb-2">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedInventoryCategory(cat)}
                  className={`px-5 py-2.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    selectedInventoryCategory === cat ? 'text-white' : 'bg-white border border-gray-200'
                  }`}
                  style={selectedInventoryCategory === cat ? { backgroundColor: theme.primary, fontFamily: FONT_UI } : { color: theme.textMuted, fontFamily: FONT_UI }}
                >
                  {categoryLabel(cat)}
                </button>
              ))}
            </div>

            <div className="mb-6 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2" size={18} style={{ color: 'var(--color-text-muted)' }} />
              <input
                type="text"
                value={inventorySearchTerm}
                onChange={(e) => setInventorySearchTerm(e.target.value)}
                placeholder="بحث في المخزون..."
                className="w-full pl-11 pr-4 py-3 rounded-2xl border-none shadow-sm outline-none text-sm focus:ring-2 focus:ring-primary transition-all"
                style={{ fontFamily: FONT_UI }}
              />
            </div>

            <div className="mb-4 text-sm text-gray-500 font-medium px-1">
              عرض {filteredInventory.length} من {products.length} صنف
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {filteredInventory.map(product => (
                <div key={product.id} className="layali-product-card p-3 relative group">
                  <div className="layali-product-card__media w-full aspect-square mb-2 flex items-center justify-center overflow-hidden">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                    ) : (
                      <Package size={32} style={{ color: theme.text, opacity: 0.3 }} />
                    )}
                  </div>
                  <h3 className="text-sm mb-1 line-clamp-1" style={{ fontFamily: FONT_UI, fontWeight: 600, color: theme.text }}>
                    {product.name}
                  </h3>
                  <p className="text-xs mb-1" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>
                    {product.category}
                  </p>
                  <p className="text-base md:text-lg mb-1" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 600 }}>
                    {fmtMoney(product.price)}
                  </p>
                  <p className={`text-xs ${Number(product.stock) < LOW_STOCK_THRESHOLD ? 'text-red-500' : ''}`} style={{ fontFamily: FONT_UI, fontWeight: 500 }}>
                    المخزون: {product.stock}
                  </p>
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleEditProduct(product); }}
                      className="p-1.5 bg-white rounded-lg shadow-sm text-gray-600 hover:text-primary"
                    >
                      <Pencil size={14} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); handleDeleteProduct(product.id); }}
                      className="p-1.5 bg-white rounded-lg shadow-sm text-red-500 hover:bg-red-50"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        </main>
      </div>

      {/* Add Product Modal */}
      {showProductModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-2xl border border-gray-200 max-h-[90dvh] flex flex-col">
            <h3 className="text-xl mb-4 text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
              {editingProductId ? 'تعديل الصنف' : 'صنف جديد'}
            </h3>
            
            {!editingProductId && (
              <div className="mb-4 p-3 rounded-xl border border-accent/30 bg-orange-50">
                <label className="block text-xs mb-1.5" style={{ color: theme.text, fontFamily: FONT_UI, fontWeight: 600 }}>
                  Copy from existing product
                </label>
                <select
                  onChange={(e) => {
                    const product = products.find(p => p.id === e.target.value);
                    if (product) {
                      setProductForm({
                        name: product.name + ' (نسخة)',
                        category: product.category,
                        price: product.price,
                        stock: product.stock,
                        cost: product.cost || 0,
                        image: product.image,
                        addOns: product.addOns ? JSON.parse(JSON.stringify(product.addOns)) : []
                      });
                      setProductIngredients(product.ingredients ? JSON.parse(JSON.stringify(product.ingredients)) : []);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-accent/30 outline-none text-sm bg-white"
                  style={{ fontFamily: FONT_UI, color: theme.text }}
                >
                  <option value="">اختر صنفاً للنسخ...</option>
                  {products.slice().sort((a, b) => a.name.localeCompare(b.name)).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-3 mb-4 overflow-y-auto pr-2 flex-1">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>
                  اسم الصنف
                </label>
                <input
                  type="text"
                  value={productForm.name}
                  onChange={(e) => setProductForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                  style={{ fontFamily: FONT_UI }}
                  placeholder="مثال: كوكا كولا"
                />
              </div>
              
              <div>
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>
                  القسم (اختر أو اكتب قسماً جديداً)
                </label>
                <input
                  type="text"
                  list="layali-product-categories"
                  value={productForm.category}
                  onChange={(e) => setProductForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm bg-white"
                  style={{ fontFamily: FONT_UI }}
                  placeholder="المشروبات، الأرجيل، …"
                />
                <datalist id="layali-product-categories">
                  {menuCategoryList.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>
                    السعر (₪)
                  </label>
                  <input
                    type="number"
                    value={productForm.price}
                    onChange={(e) => setProductForm(prev => ({ ...prev, price: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                    style={{ fontFamily: FONT_UI }}
                    placeholder="25000"
                  />
                </div>
                <div>
                  <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>
                    التكلفة (₪)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={productForm.cost}
                      onChange={(e) => setProductForm(prev => ({ ...prev, cost: e.target.value }))}
                      className="flex-1 px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                      style={{ fontFamily: FONT_UI }}
                      placeholder="15000"
                    />
                    <button
                      type="button"
                      onClick={() => setShowIngredientModal(true)}
                      className="px-3 py-2.5 rounded-xl bg-layali-surface-muted text-primary hover:bg-gray-200 transition-colors"
                      title="حساب من المكوّنات"
                    >
                      <Calculator size={18} />
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                <div className="flex justify-between items-center">
                  <div>
                    <p className="text-xs text-gray-500">الربح التقديري</p>
                    <p className="text-sm font-semibold text-primary">
                      {fmtMoney(((parseFloat(productForm.price) || 0) - (parseFloat(productForm.cost) || 0)))}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">الهامش</p>
                    <p className="text-sm font-semibold text-primary">
                      {parseFloat(productForm.price) > 0 
                        ? (((parseFloat(productForm.price) || 0) - (parseFloat(productForm.cost) || 0)) / parseFloat(productForm.price) * 100).toFixed(1) 
                        : '0'}%
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>
                  الكمية في المخزون
                </label>
                <input
                  type="number"
                  value={productForm.stock}
                  onChange={(e) => setProductForm(prev => ({ ...prev, stock: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                  style={{ fontFamily: FONT_UI }}
                  placeholder="50"
                />
              </div>
              
              <div>
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>
                  صورة الصنف
                </label>
                {productImagePreview ? (
                  <div className="mb-2 w-full aspect-video max-h-40 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                    <img src={productImagePreview} alt="" className="w-full h-full object-contain" />
                  </div>
                ) : null}
                <label className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 cursor-pointer hover:border-gray-400 transition-all">
                  <Upload size={16} style={{ color: theme.textMuted }} />
                  <span className="text-sm" style={{ color: theme.textMuted, fontFamily: FONT_UI }}>
                    {imageFile ? imageFile.name : 'اختر صورة (JPG, PNG, WebP)'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
                <p className="text-[10px] mt-1.5 text-gray-400" style={{ fontFamily: FONT_UI }}>
                  في التجربة المحلية تُحفظ الصورة في المتصفح. مع Firebase تُرفع إلى التخزين السحابي.
                </p>
              </div>

              {/* Add-ons Section */}
              <div className="border-t pt-4 mt-4">
                <div className="flex justify-between items-center mb-3">
                  <label className="block text-xs font-medium text-gray-600">إضافات / خيارات</label>
                  <button type="button" onClick={addAddonGroup} className="text-xs text-primary font-medium hover:underline">+ مجموعة</button>
                </div>
                <div className="space-y-4">
                  {(productForm.addOns || []).map((group, gIdx) => (
                    <div key={gIdx} className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <div className="flex gap-2 mb-2">
                        <input 
                          placeholder="اسم المجموعة (مثال: سكر)" 
                          value={group.name} 
                          onChange={e => updateAddonGroup(gIdx, 'name', e.target.value)}
                          className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-gray-200"
                        />
                        <select 
                          value={group.type}
                          onChange={e => updateAddonGroup(gIdx, 'type', e.target.value)}
                          className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 bg-white"
                        >
                          <option value="single">اختيار واحد</option>
                          <option value="multiple">اختيار متعدد</option>
                        </select>
                        <button type="button" onClick={() => removeAddonGroup(gIdx)} className="text-red-500"><Trash2 size={14} /></button>
                      </div>
                      <div className="space-y-2 pl-2 border-l-2 border-gray-200">
                        {group.options.map((opt, oIdx) => (
                          <div key={oIdx} className="flex flex-col gap-2 p-3 bg-white rounded border border-gray-100 shadow-sm">
                            <div className="flex gap-2 items-center">
                              <input placeholder="اسم الخيار" value={opt.name} onChange={e => updateAddonOption(gIdx, oIdx, 'name', e.target.value)} className="flex-1 px-2 py-1.5 text-xs rounded border border-gray-200" />
                              <button type="button" onClick={() => removeAddonOption(gIdx, oIdx)} className="text-gray-400 hover:text-red-500"><X size={14} /></button>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-[10px] text-gray-500 mb-1">سعر البيع</label>
                                <input type="number" placeholder="0" value={opt.price} onChange={e => updateAddonOption(gIdx, oIdx, 'price', e.target.value)} className="w-full px-2 py-1.5 text-xs rounded border border-gray-200" />
                              </div>
                              <div>
                                <label className="block text-[10px] text-gray-500 mb-1">التكلفة (تلقائي)</label>
                                <input type="number" placeholder="0" value={opt.cost} onChange={e => updateAddonOption(gIdx, oIdx, 'cost', e.target.value)} className="w-full px-2 py-1.5 text-xs rounded border border-gray-200 bg-gray-50" />
                              </div>
                            </div>

                            <div className="bg-gray-50 p-2 rounded border border-gray-200 mt-1">
                              <p className="text-[10px] font-medium text-gray-500 mb-2">حاسبة تكلفة المكوّن</p>
                              <div className="grid grid-cols-3 gap-2">
                                <div>
                                  <input type="number" placeholder="سعر الدفعة" value={opt.batchPrice} onChange={e => updateAddonOption(gIdx, oIdx, 'batchPrice', e.target.value)} className="w-full px-2 py-1 text-xs rounded border border-gray-200" />
                                  <span className="text-[9px] text-gray-400 block mt-0.5">سعر الدفعة</span>
                                </div>
                                <div>
                                  <input type="number" placeholder="كمية الدفعة" value={opt.batchQty} onChange={e => updateAddonOption(gIdx, oIdx, 'batchQty', e.target.value)} className="w-full px-2 py-1 text-xs rounded border border-gray-200" />
                                  <span className="text-[9px] text-gray-400 block mt-0.5">كمية الدفعة</span>
                                </div>
                                <div>
                                  <input type="number" placeholder="كمية الاستخدام" value={opt.usageQty} onChange={e => updateAddonOption(gIdx, oIdx, 'usageQty', e.target.value)} className="w-full px-2 py-1 text-xs rounded border border-gray-200" />
                                  <span className="text-[9px] text-gray-400 block mt-0.5">كمية الاستخدام</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex justify-between items-center pt-1 border-t border-gray-100 mt-1">
                              <span className="text-xs text-gray-500">الربح التقديري:</span>
                              <span className={`text-xs font-bold ${((parseFloat(opt.price)||0) - (parseFloat(opt.cost)||0)) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {fmtMoney(((parseFloat(opt.price) || 0) - (parseFloat(opt.cost) || 0)))}
                              </span>
                            </div>
                          </div>
                        ))}
                        <button type="button" onClick={() => addAddonOption(gIdx)} className="text-[10px] text-gray-500 hover:text-primary">+ خيار</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowProductModal(false);
                  setProductForm({ name: '', category: '', price: '', stock: '', cost: '', addOns: [] });
                  setProductIngredients([]);
                  setImageFile(null);
                  setEditingProductId(null);
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ backgroundColor: '#f3f4f6', color: theme.textMuted, fontFamily: FONT_UI }}
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveProduct}
                disabled={uploadProgress || !isProductFormValid}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50 hover:opacity-90"
                style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
              >
                {uploadProgress ? 'جاري الحفظ...' : (editingProductId ? 'حفظ التعديلات' : 'إضافة منتج')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ingredient Modal */}
      {showIngredientModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[60]">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-2xl border border-gray-200 flex flex-col max-h-[90dvh]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
                Calculate Cost
              </h3>
              <button onClick={() => setShowIngredientModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto mb-4 pr-2">
              <div className="space-y-3">
                {productIngredients.map((ing) => (
                  <div key={ing.id} className="bg-gray-50 p-3 rounded-xl space-y-2 border border-gray-100">
                    <div className="flex gap-2">
                      <input placeholder="اسم المكوّن (مثال: حليب)" value={ing.name} onChange={e => handleIngredientChange(ing.id, 'name', e.target.value)} className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-gray-200 outline-none" />
                      <button type="button" onClick={() => handleRemoveIngredient(ing.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 size={14} /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1"><span className="text-[10px] text-gray-400">سعر الدفعة (₪)</span><input type="number" placeholder="350000" value={ing.batchPrice} onChange={e => handleIngredientChange(ing.id, 'batchPrice', e.target.value)} className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-200 outline-none" /></div>
                      <div className="space-y-1"><span className="text-[10px] text-gray-400">كمية الدفعة</span><input type="number" placeholder="1000 (ml/g)" value={ing.batchQty} onChange={e => handleIngredientChange(ing.id, 'batchQty', e.target.value)} className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-200 outline-none" /></div>
                      <div className="space-y-1"><span className="text-[10px] text-gray-400">كمية الاستخدام</span><input type="number" placeholder="250 (ml/g)" value={ing.usageQty} onChange={e => handleIngredientChange(ing.id, 'usageQty', e.target.value)} className="w-full px-2 py-1.5 text-xs rounded-lg border border-gray-200 outline-none" /></div>
                    </div>
                    <div className="text-[10px] text-gray-500 text-right font-medium">
                      Cost: {fmtMoney(Math.round(((parseFloat(ing.batchPrice)||0) / (parseFloat(ing.batchQty)||1)) * (parseFloat(ing.usageQty)||0)))}
                    </div>
                  </div>
                ))}
                {productIngredients.length === 0 && (
                  <div className="text-center py-8 text-gray-400 text-sm italic bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    No ingredients added yet
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-gray-100">
              <button type="button" onClick={handleAddIngredient} className="w-full py-2 rounded-xl border-2 border-dashed border-primary text-primary text-sm font-medium hover:bg-layali-surface-muted transition-colors">
                + Add Ingredient
              </button>
              <div className="flex justify-between items-center px-1">
                <span className="text-sm font-medium text-gray-600">إجمالي التكلفة المحسوبة:</span>
                <span className="text-lg font-bold text-primary">
                  {fmtMoney(productIngredients.reduce((sum, ing) => sum + Math.round(((parseFloat(ing.batchPrice)||0) / (parseFloat(ing.batchQty)||1)) * (parseFloat(ing.usageQty)||0)), 0))}
                </span>
              </div>
              <button
                onClick={handleSaveIngredientCost}
                className="w-full py-3 rounded-xl text-white text-sm font-medium hover:opacity-90 transition-all"
                style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
              >
                Save Cost & Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add-on Selection Modal (POS) */}
      {showAddonModal && pendingAddonProduct && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[60]">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md border border-gray-200 max-h-[90dvh] flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>{pendingAddonProduct.name}</h3>
              <button onClick={() => setShowAddonModal(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2">
              {pendingAddonProduct.addOns.map((group, idx) => (
                <div key={idx} className="mb-5">
                  <h4 className="text-sm font-semibold text-gray-700 mb-2">{group.name}</h4>
                  <div className="space-y-2">
                    {group.options.map((option, oIdx) => {
                      const isSelected = (addonSelections[group.name] || []).some(o => o.name === option.name);
                      return (
                        <div 
                          key={oIdx} 
                          onClick={() => {
                            setAddonSelections(prev => {
                              const current = prev[group.name] || [];
                              if (group.type === 'single') {
                                return { ...prev, [group.name]: [option] };
                              } else {
                                const exists = current.find(o => o.name === option.name);
                                return { 
                                  ...prev, 
                                  [group.name]: exists ? current.filter(o => o.name !== option.name) : [...current, option] 
                                };
                              }
                            });
                          }}
                          className={`flex justify-between items-center p-3 rounded-xl border cursor-pointer transition-all ${isSelected ? 'border-primary bg-accent-soft' : 'border-gray-100 hover:bg-gray-50'}`}
                        >
                          <span className={`text-sm ${isSelected ? 'text-primary font-medium' : 'text-gray-600'}`}>{option.name}</span>
                          {option.price > 0 && (
                            <span className="text-xs text-gray-500">+{fmtMoney(option.price)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-gray-100 mt-2">
              <button
                onClick={() => {
                  const allSelected = Object.values(addonSelections).flat();
                  addItemToCart(pendingAddonProduct, allSelected);
                }}
                className="w-full py-3 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90 transition-all"
              >
                Add to Order - {fmtMoney((pendingAddonProduct.price + Object.values(addonSelections).flat().reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0)))}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Method Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[60]">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>طريقة الدفع</h3>
              <button type="button" onClick={() => setShowPaymentModal(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>

            <div className="text-center mb-5 p-4 rounded-xl bg-gray-50">
              <p className="text-xs text-gray-500 mb-1">المبلغ المستحق</p>
              <p className="text-2xl font-bold text-primary">{fmtMoney(cartTotal)}</p>
              {currentOrder.customerId ? (
                <p className="text-xs text-gray-600 mt-2">العميل: {currentOrder.customer}</p>
              ) : (
                <p className="text-xs text-amber-700 mt-2">للدين أو الدفع الجزئي اختر عميلاً من القائمة</p>
              )}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  setCashGiven('');
                  setFinalTotalForPayment(cartTotal);
                  setShowPaymentModal(false);
                  setShowCashModal(true);
                }}
                className="w-full py-3 rounded-xl border border-gray-200 hover:border-primary hover:bg-accent-soft text-sm font-semibold text-primary transition-all"
                style={{ fontFamily: FONT_UI }}
              >
                كاش — دفع كامل
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!currentOrder.customerId) {
                    alert('اختر عميلاً من «الطلب الحالي» قبل تسجيل الدين');
                    return;
                  }
                  completeOrder('unpaid', {
                    paymentType: 'debt',
                    customerId: currentOrder.customerId,
                  });
                }}
                className="w-full py-3 rounded-xl border border-red-200 hover:bg-red-50 text-sm font-semibold text-red-700 transition-all"
                style={{ fontFamily: FONT_UI }}
              >
                دين — كامل على حساب العميل
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!currentOrder.customerId) {
                    alert('اختر عميلاً للدفع الجزئي');
                    return;
                  }
                  setMixedCashAmount('');
                  setShowPaymentModal(false);
                  setShowMixedPaymentModal(true);
                }}
                className="w-full py-3 rounded-xl border border-amber-200 hover:bg-amber-50 text-sm font-semibold text-amber-900 transition-all"
                style={{ fontFamily: FONT_UI }}
              >
                كاش + دين — جزء نقداً والباقي دين
              </button>
              <button
                type="button"
                onClick={() => completeOrder('paid', { paymentType: 'compliment', method: 'Compliment' })}
                disabled={uploadProgress}
                className="w-full py-3 rounded-xl border border-accent bg-orange-50 hover:bg-accent hover:text-white text-sm font-medium text-accent transition-all flex items-center justify-center gap-2"
                style={{ fontFamily: FONT_UI }}
              >
                <Gift size={16} />
                مجاني (إهداء)
              </button>
            </div>
          </div>
        </div>
      )}

      {showMixedPaymentModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[70]">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>دفع جزئي — كاش + دين</h3>
              <button type="button" onClick={() => setShowMixedPaymentModal(false)} className="text-gray-400"><X size={22} /></button>
            </div>
            <p className="text-sm text-gray-600 mb-3" style={{ fontFamily: FONT_UI }}>
              الإجمالي: <strong>{fmtMoney(cartTotal)}</strong> — العميل: {currentOrder.customer}
            </p>
            <label className="block text-xs mb-1 text-gray-600">المبلغ الكاش (₪)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={mixedCashAmount}
              onChange={(e) => setMixedCashAmount(e.target.value)}
              className="w-full px-3 py-3 rounded-xl border border-gray-200 text-lg font-bold text-center mb-3 outline-none"
              placeholder="0"
              autoFocus
            />
            <p className="text-sm mb-4 text-red-600 font-medium" style={{ fontFamily: FONT_UI }}>
              يُسجَّل دين: {fmtMoney(Math.max(0, cartTotal - (parseFloat(mixedCashAmount) || 0)))}
            </p>
            <button
              type="button"
              onClick={() =>
                completeOrder('paid', {
                  paymentType: 'mixed',
                  cashPaid: mixedCashAmount,
                  customerId: currentOrder.customerId,
                })
              }
              disabled={
                uploadProgress ||
                mixedCashAmount === '' ||
                parseFloat(mixedCashAmount) < 0 ||
                parseFloat(mixedCashAmount) >= cartTotal
              }
              className="w-full py-3 rounded-xl text-white text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
            >
              تأكيد الدفع الجزئي
            </button>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md border border-gray-200" dir="rtl">
            <h3 className="text-xl mb-4 text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
              {editingExpenseId
                ? (expenseForm.section === 'purchase' ? 'تعديل مشتريات' : 'تعديل مصروف')
                : (expenseForm.section === 'purchase' ? 'إضافة مشتريات' : 'إضافة مصروف')}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs mb-1.5 font-medium text-gray-600">المبلغ (₪)</label>
                <input
                  type="number"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs mb-1.5 font-medium text-gray-600">التاريخ</label>
                <input
                  type="date"
                  value={expenseForm.date}
                  onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                />
              </div>
              {expenseForm.section !== 'purchase' && (
                <div>
                  <label className="block text-xs mb-1.5 font-medium text-gray-600">نوع المصروف</label>
                  <select
                    value={expenseForm.category}
                    onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm bg-white"
                  >
                    {OPERATING_EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.label}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs mb-1.5 font-medium text-gray-600">البيان</label>
                <input
                  type="text"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                  placeholder={expenseForm.section === 'purchase' ? 'تفاصيل المشتريات' : 'تفاصيل المصروف'}
                />
              </div>
              {expenseForm.section === 'purchase' && (
                <div>
                  <label className="block text-xs mb-1.5 font-medium text-gray-600">التاجر *</label>
                  <select
                    value={expenseForm.supplierId}
                    onChange={(e) => setExpenseForm({ ...expenseForm, supplierId: e.target.value })}
                    className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm bg-white"
                  >
                    <option value="">اختر التاجر</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {suppliers.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">أضف تاجراً من «التجار» في القائمة أولاً</p>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs mb-1.5 font-medium text-gray-600">صورة الإيصال</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setExpenseReceiptFile(e.target.files[0])}
                  className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-primary file:text-white hover:file:bg-opacity-90"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowExpenseModal(false);
                    setExpenseForm(defaultExpenseForm(currentView === 'purchases' ? 'purchase' : 'operating'));
                    setExpenseReceiptFile(null);
                    setEditingExpenseId(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleAddExpense}
                  disabled={
                    uploadProgress ||
                    !expenseForm.amount ||
                    (expenseForm.section === 'purchase' && !expenseForm.supplierId)
                  }
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50 hover:opacity-90"
                  style={{ backgroundColor: theme.primary }}
                >
                  {uploadProgress ? 'جاري الحفظ...' : (editingExpenseId ? 'حفظ التعديلات' : 'حفظ')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supplier Modal */}
      {showSupplierModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md border border-gray-200" dir="rtl">
            <h3 className="text-xl mb-4 text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>إضافة تاجر</h3>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="اسم التاجر *"
                value={supplierForm.name}
                onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
              />
              <input
                type="text"
                placeholder="جهة الاتصال"
                value={supplierForm.contactPerson}
                onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
              />
              <input
                type="tel"
                placeholder="الجوال"
                value={supplierForm.phone}
                onChange={e => setSupplierForm({...supplierForm, phone: e.target.value})}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
              />
              <input
                type="email"
                placeholder="البريد الإلكتروني"
                value={supplierForm.email}
                onChange={e => setSupplierForm({...supplierForm, email: e.target.value})}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
              />
              <textarea
                placeholder="العنوان"
                value={supplierForm.address}
                onChange={e => setSupplierForm({...supplierForm, address: e.target.value})}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm resize-none h-20"
              />
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSupplierModal(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleAddSupplier}
                  disabled={uploadProgress || !supplierForm.name}
                  className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50 hover:opacity-90"
                  style={{ backgroundColor: theme.primary }}
                >
                  {uploadProgress ? 'جاري الحفظ...' : 'حفظ التاجر'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Account Modal */}
      {showAccountModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-2xl border border-gray-200 my-8">
            <h3 className="text-xl mb-4 text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
              تعديل ملف المنشأة
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>
                  اسم المنشأة
                </label>
                <input
                  type="text"
                  value={profileForm.businessName}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, businessName: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                  style={{ fontFamily: FONT_UI }}
                  placeholder={businessProfile?.businessName}
                />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>
                  نوع النشاط
                </label>
                <input
                  type="text"
                  value={profileForm.businessType}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, businessType: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                  style={{ fontFamily: FONT_UI }}
                  placeholder={businessProfile?.businessType}
                />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>
                  اسم المالك
                </label>
                <input
                  type="text"
                  value={profileForm.ownerName}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, ownerName: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                  style={{ fontFamily: FONT_UI }}
                  placeholder={businessProfile?.ownerName}
                />
              </div>
              <div>
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>
                  الجوال
                </label>
                <input
                  type="tel"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                  style={{ fontFamily: FONT_UI }}
                  placeholder={businessProfile?.phone}
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs mb-1.5" style={{ color: theme.textMuted, fontFamily: FONT_UI, fontWeight: 500 }}>
                  العنوان
                </label>
                <input
                  type="text"
                  value={profileForm.address}
                  onChange={(e) => setProfileForm(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm"
                  style={{ fontFamily: FONT_UI }}
                  placeholder={businessProfile?.address}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowAccountModal(false);
                  setProfileForm({ businessName: '', businessType: '', address: '', phone: '', email: '', ownerName: '' });
                }}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium"
                style={{ backgroundColor: '#f3f4f6', color: theme.textMuted, fontFamily: FONT_UI }}
              >
                إلغاء
              </button>
              <button
                onClick={handleProfileUpdate}
                disabled={uploadProgress}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50 hover:opacity-90"
                style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
              >
                {uploadProgress ? 'جاري التحديث...' : 'حفظ التعديلات'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Store Settings Modal */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-50">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md border border-gray-200">
            <h3 className="text-xl mb-4 text-primary" style={{ fontFamily: FONT_HEADING, fontWeight: 600 }}>
              إعدادات المتجر
            </h3>
            <div className="space-y-3">
              <div
                className={`text-xs rounded-xl p-3 border ${isFirebaseConfigured && !isDemoMode ? 'bg-green-50 border-green-200 text-green-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}
                style={{ fontFamily: FONT_UI }}
              >
                {isFirebaseConfigured && !isDemoMode
                  ? 'متصل بـ Firebase — البيانات تُزامَن بين الأجهزة.'
                  : isDemoMode
                    ? 'وضع التجربة المحلي مفعّل.'
                    : 'تحقق من إعدادات السحابة.'}
              </div>
              {!isDemoMode && hasLocalDemoData() && !wasDemoMigratedForUser(user?.uid) && (
                <button
                  type="button"
                  onClick={handleMigrateDemoToFirebase}
                  disabled={uploadProgress}
                  className="w-full py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50"
                  style={{ backgroundColor: theme.accent, fontFamily: FONT_UI }}
                >
                  {uploadProgress ? 'جاري النقل…' : 'استيراد بيانات التجربة المحلية إلى Firebase'}
                </button>
              )}
              <p className="text-xs text-gray-500 rounded-xl bg-gray-50 p-3 border border-gray-100" style={{ fontFamily: FONT_UI }}>
                المبيعات بالأسعار المعروضة فقط — بدون ضريبة أو رسوم إضافية.
              </p>
              <div>
                <label className="block text-xs mb-1.5 font-medium text-gray-600">رأس الإيصال</label>
                <textarea
                  value={appSettings.receiptHeader}
                  onChange={e => setAppSettings({...appSettings, receiptHeader: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm resize-none h-20"
                  placeholder="رسالة أعلى الإيصال"
                />
              </div>
              <div>
                <label className="block text-xs mb-1.5 font-medium text-gray-600">ذيل الإيصال</label>
                <textarea
                  value={appSettings.receiptFooter}
                  onChange={e => setAppSettings({...appSettings, receiptFooter: e.target.value})}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-sm resize-none h-20"
                  placeholder="رسالة أسفل الإيصال"
                />
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                <label className="text-sm font-medium text-gray-600">تقريب الإجمالي لأقرب عدد صحيح</label>
                <input
                  type="checkbox"
                  checked={appSettings.rounding}
                  onChange={e => setAppSettings({...appSettings, rounding: e.target.checked})}
                  className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary"
                />
              </div>
              <div className="pt-2 border-t border-gray-100">
                <button
                  onClick={handleReindexOrders}
                  className="w-full py-2.5 rounded-xl text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
                >
                  إعادة ترقيم الطلبات (إصلاح الفجوات)
                </button>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowSettingsModal(false)} className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 text-gray-600">إلغاء</button>
                <button onClick={handleSaveSettings} disabled={uploadProgress} className="flex-1 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-50 hover:opacity-90" style={{ backgroundColor: theme.primary }}>
                  {uploadProgress ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscountModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[80]">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-sm border border-gray-200">
            <h3 className="text-lg font-bold text-primary mb-4" style={{ fontFamily: FONT_HEADING }}>تعيين الخصم</h3>
            
            <div className="flex gap-2 mb-4 bg-gray-100 p-1 rounded-xl">
              <button 
                onClick={() => { setDiscountType('percentage'); setDiscount(0); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${discountType === 'percentage' ? 'bg-white shadow text-primary' : 'text-gray-500'}`}
              >
                Percentage (%)
              </button>
              <button 
                onClick={() => { setDiscountType('amount'); setDiscount(0); }}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${discountType === 'amount' ? 'bg-white shadow text-primary' : 'text-gray-500'}`}
              >
                Amount (Rp)
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-xs mb-1.5 font-medium text-gray-600">{discountType === 'percentage' ? 'Discount Percentage (%)' : 'Discount Amount (Rp)'}</label>
              <input
                type="number"
                value={discount}
                onChange={(e) => {
                  const val = parseFloat(e.target.value) || 0;
                  setDiscount(discountType === 'percentage' ? Math.min(100, Math.max(0, val)) : Math.max(0, val));
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 outline-none text-lg font-bold text-center"
                placeholder="0"
                autoFocus
              />
            </div>
            
            {discountType === 'percentage' && (
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[0, 5, 10, 15, 20, 25, 50, 100].map(pct => (
                  <button
                    key={pct}
                    onClick={() => setDiscount(pct)}
                    className={`py-2 rounded-lg text-xs font-medium border ${discount === pct ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            )}
            
            {discountType === 'amount' && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {[1000, 2000, 5000, 10000, 20000, 50000].map(amt => (
                  <button
                    key={amt}
                    onClick={() => setDiscount(amt)}
                    className={`py-2 rounded-lg text-xs font-medium border ${discount === amt ? 'bg-primary text-white border-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                  >
                    {amt / 1000}k
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowDiscountModal(false)}
              className="w-full py-3 rounded-xl bg-primary text-white text-sm font-medium hover:opacity-90"
            >
              Apply Discount
            </button>
          </div>
        </div>
      )}

      {/* Cash Payment Modal */}
      {showCashModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[80]">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-6 w-full max-w-md border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-primary" style={{ fontFamily: FONT_HEADING }}>دفع نقدي</h3>
              <button onClick={() => setShowCashModal(false)} className="text-gray-400 hover:text-gray-600"><X size={24} /></button>
            </div>
            
            <div className="text-center mb-6">
              <p className="text-sm text-gray-500 mb-1">المبلغ المطلوب</p>
              <p className="text-3xl font-bold text-primary">{fmtMoney(finalTotalForPayment)}</p>
            </div>

            <div className="mb-4">
              <label className="block text-xs mb-1.5 font-medium text-gray-600">المبلغ المُسلّم (₪)</label>
              <input
                type="number"
                value={cashGiven}
                onChange={(e) => setCashGiven(e.target.value)}
                className="w-full px-3 py-3 rounded-xl border border-gray-200 outline-none text-xl font-bold"
                placeholder="0"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {[10, 20, 50, 100, 200].map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setCashGiven(String(amount))}
                  className="py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-primary"
                >
                  {amount}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCashGiven(String(finalTotalForPayment))}
                className="py-2 rounded-lg border border-accent text-accent text-sm font-medium hover:bg-orange-50 col-span-3"
              >
                المبلغ بالضبط
              </button>
            </div>

            <div className="bg-gray-50 p-4 rounded-xl mb-6 flex justify-between items-center">
              <span className="text-sm font-medium text-gray-600">الباقي للزبون</span>
              <span className={`text-xl font-bold ${(parseFloat(cashGiven) || 0) >= finalTotalForPayment ? 'text-green-600' : 'text-red-500'}`}>
                {fmtMoney(Math.max(0, (parseFloat(cashGiven) || 0) - finalTotalForPayment))}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                completeOrder('paid', { paymentType: 'cash', method: 'Cash' });
                setShowCashModal(false);
              }}
              disabled={uploadProgress || (parseFloat(cashGiven) || 0) < finalTotalForPayment}
              className="w-full py-3 rounded-xl text-white text-sm font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
            >
              تأكيد الدفع كاش
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function App() {
  if (isCloudUnavailable) {
    return <CloudConfigRequired missingKeys={firebaseConnectionInfo.missingKeys} />;
  }
  return <AppCore />;
}

export default App;