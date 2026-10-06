const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'src', 'App.js');
let s = fs.readFileSync(appPath, 'utf8');

const helpers = `
  const removeCartLine = (lineKey) =>
    setCurrentOrder((prev) => ({
      ...prev,
      items: prev.items.filter((i) => (i.cartItemId || i.id) !== lineKey),
    }));

  const openQuickCustomer = (prefill = '') => {
    const p = String(prefill).trim();
    const isPhone = /^[\\d+\\s-]+$/.test(p);
    setQuickCustomerForm({
      name: p && !isPhone ? p : '',
      phone: p && isPhone ? p : '',
      address: '',
      notes: '',
    });
    setShowQuickCustomerModal(true);
  };

  const startPayment = () => {
    if (currentOrder.items.length === 0 || uploadProgress) return;
    setPaymentCustomPrice('');
    setMixedCashAmount('');
    if (!currentOrder.customerId) {
      setCashGiven('');
      setFinalTotalForPayment(cartTotal);
      setShowCashModal(true);
    } else {
      setShowPaymentModal(true);
    }
  };

`;

if (!s.includes('const removeCartLine')) {
  const marker = '  const handleSaveCustomer = async (formData, editingId) => {';
  const idx = s.indexOf(marker);
  if (idx < 0) throw new Error('handleSaveCustomer marker not found');
  s = s.slice(0, idx) + helpers + s.slice(idx);
}

const filteredOld = /const filteredProducts = posProducts\.filter\(p =>[\s\S]*?\.sort\(\(a, b\) => a\.name\.localeCompare\(b\.name\)\);/;
if (!s.includes('const stableAdd')) {
  if (!filteredOld.test(s)) throw new Error('filteredProducts block not found');
  s = s.replace(
    filteredOld,
    `const filteredProducts = useMemo(
    () =>
      posProducts
        .filter(
          (p) =>
            (selectedCategory === 'all' || p.category === selectedCategory) &&
            p.name.toLowerCase().includes(searchTerm.toLowerCase())
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [posProducts, selectedCategory, searchTerm]
  );

  const stableAdd = useCallback((p) => addToOrderRef.current?.(p), []);

  const cartQtyByProduct = useMemo(() => {
    const m = {};
    currentOrder.items.forEach((i) => {
      m[i.id] = (m[i.id] || 0) + (i.quantity || 0);
    });
    return m;
  }, [currentOrder.items]);`
  );
}

if (!s.includes('تم الدفع')) {
  s = s.replace(
    `setShowPaymentModal(false);
      setShowMixedPaymentModal(false);
      setShowCashModal(false);

      if (billIdToClose) {`,
    `setShowPaymentModal(false);
      setShowMixedPaymentModal(false);
      setShowCashModal(false);

      if (!editingOrderId) {
        setSuspendFeedback(\`✓ تم الدفع\${createdOrderNumber ? \` · #\${createdOrderNumber}\` : ''}\`);
      }

      if (billIdToClose) {`
  );
}

if (!s.includes('تعذّر إتمام الدفع')) {
  s = s.replace(
    `if (editingOrderId) {
        setCurrentView('orders');
        alert('تم تحديث الطلب بنجاح');
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setUploadProgress(false);
    }
  };

  const handleEditOrder`,
    `if (editingOrderId) {
        setCurrentView('orders');
        alert('تم تحديث الطلب بنجاح');
      }
    } catch (error) {
      alert(friendlyError(error, 'تعذّر إتمام الدفع. لم يُحفظ الطلب ولم يُخصم شيء من المخزون. حاول مرة أخرى.'));
    } finally {
      setUploadProgress(false);
    }
  };

  const handleEditOrder`
  );
}

if (!s.includes('if (!suspendFeedback) return undefined')) {
  const catFx = `  useEffect(() => {
    if (selectedCategory !== 'all' && !posCategoryList.includes(selectedCategory)) {`;
  if (!s.includes(catFx)) throw new Error('selectedCategory effect not found');
  s = s.replace(
    catFx,
    `  useEffect(() => {
    if (!suspendFeedback) return undefined;
    const t = setTimeout(() => setSuspendFeedback(''), 2600);
    return () => clearTimeout(t);
  }, [suspendFeedback]);

` + catFx
  );
}

s = s.replace(
  '<main className="flex-1 overflow-auto p-4 md:p-8 bg-gray-100">',
  "<main className={`flex-1 bg-gray-100 ${activeView === 'pos' ? 'overflow-hidden p-3' : 'overflow-auto p-4 md:p-8'}`}>"
);

fs.writeFileSync(appPath, s);
console.log('OK helpers=', s.includes('removeCartLine'), 'stableAdd=', s.includes('stableAdd'), 'payFeedback=', s.includes('تم الدفع'));
