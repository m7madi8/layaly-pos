            <div className="h-full flex flex-col lg:flex-row gap-3">
              <PosCart
                mobileOpen={isMobileCartOpen}
                onCloseMobile={() => setIsMobileCartOpen(false)}
                activeOpenBillId={activeOpenBillId}
                editingOrderId={editingOrderId}
                currentOrder={currentOrder}
                customers={customers}
                canCreateCustomers={employeeCanCreateCustomers}
                onSelectCustomer={selectOrderCustomer}
                onAddCustomer={openQuickCustomer}
                onNotesChange={(notes) => setCurrentOrder((p) => ({ ...p, notes }))}
                onGuestNameChange={(customer) => setCurrentOrder((p) => ({ ...p, customer }))}
                onQty={updateQuantity}
                onRemove={removeCartLine}
                lastAddedId={lastAddedCartId}
                subtotal={cartSubtotal}
                discount={discount}
                discountAmount={cartDiscountAmount}
                total={cartTotal}
                onDiscount={() => setShowDiscountModal(true)}
                onPay={startPayment}
                onSuspend={requestSuspendBill}
                onPrint={printDraftReceipt}
                onCancelBill={() => setShowCancelOpenBillConfirm(true)}
                onExitBill={exitOpenBillToList}
                busy={uploadProgress || openBillBusy}
              />

              <div className="flex-1 min-w-0 h-full flex flex-col">
                <OpenBillsPanel
                  variant="strip"
                  openBills={openBills}
                  fmtMoney={fmtMoney}
                  theme={theme}
                  FONT_UI={FONT_UI}
                  FONT_HEADING={FONT_HEADING}
                  busy={openBillBusy || uploadProgress}
                  onOpenBill={loadOpenBillIntoCart}
                  activeBillId={activeOpenBillId}
                />

                <div className="shrink-0 mb-3 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex gap-1.5 p-1 rounded-2xl bg-white border border-[var(--color-border)] shadow-sm">
                      {[
                        { id: 'menu', label: 'القائمة' },
                        { id: 'playstation', label: 'بلايستيشن' },
                        { id: 'hookah', label: 'أراجيل' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setPosSection(tab.id)}
                          className={`flex-1 h-11 rounded-xl text-sm font-bold transition-colors ${
                            posSection === tab.id
                              ? 'bg-primary text-white shadow-sm'
                              : 'text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)]'
                          }`}
                          style={{ fontFamily: FONT_UI }}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOpenBillsPanel(true)}
                      className="lg:hidden h-[3.25rem] px-3.5 inline-flex items-center gap-2 rounded-2xl text-sm font-semibold border bg-white"
                      style={{ borderColor: 'var(--color-border)', color: theme.text, fontFamily: FONT_UI }}
                    >
                      <PauseCircle size={18} />
                      معلّقة
                      {openBillsCount > 0 && (
                        <span className="text-white text-[11px] min-w-[1.25rem] h-5 px-1 rounded-full inline-flex items-center justify-center" style={{ backgroundColor: theme.accent }}>
                          {openBillsCount}
                        </span>
                      )}
                    </button>
                  </div>

                  {posSection === 'menu' && (
                    <>
                      <div className="relative">
                        <Search className="absolute end-3.5 top-1/2 -translate-y-1/2 pointer-events-none" size={18} style={{ color: 'var(--color-text-muted)' }} />
                        <input
                          type="search"
                          enterKeyHint="search"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') setSearchTerm('');
                          }}
                          placeholder="بحث سريع بالاسم…"
                          className="layali-input w-full h-12 pe-11 ps-11 text-base shadow-sm"
                          style={{ fontFamily: FONT_UI }}
                        />
                        {searchTerm && (
                          <button
                            type="button"
                            onClick={() => setSearchTerm('')}
                            className="absolute start-1 top-1/2 -translate-y-1/2 w-10 h-10 grid place-items-center rounded-lg text-[var(--color-text-muted)] active:bg-[var(--color-surface-muted)]"
                            aria-label="مسح البحث"
                          >
                            <X size={16} />
                          </button>
                        )}
                      </div>
                      <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-thin">
                        {posMenuTabs.map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setSelectedCategory(tab.id)}
                            className={`h-11 px-4 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                              selectedCategory === tab.id
                                ? 'text-white shadow-sm'
                                : 'bg-white border border-[var(--color-border-strong)] text-[var(--color-text-secondary)]'
                            }`}
                            style={selectedCategory === tab.id ? { backgroundColor: 'var(--color-accent)', fontFamily: FONT_UI } : { fontFamily: FONT_UI }}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-24 lg:pb-2">
                  {posSection === 'playstation' && (
                    <div ref={playstationPanelRef}>
                      <PlayStationPanel
                        stations={playstationSettings.stations}
                        sessions={playstationSessions}
                        timeProducts={timeProducts}
                        fmtMoney={fmtMoney}
                        busy={playstationBusy}
                        onStart={handleStartPlaystation}
                        onEnd={handleEndPlaystation}
                        onCancel={handleCancelPlaystation}
                        onAddEndedToCart={addSessionToCart}
                        cartSessionIds={cartSessionIds}
                      />
                    </div>
                  )}

                  {posSection === 'hookah' && (
                    <ExternalAssetsPanel
                      assets={externalAssets}
                      movements={assetMovements}
                      busy={assetsBusy}
                      canManage={!isEmployee}
                      defaultPerson={currentOrder.customerId ? currentOrder.customer : ''}
                      linkedMovementIds={cartMovementIds}
                      saleProducts={hookahSaleProducts}
                      fmtMoney={fmtMoney}
                      onCheckout={handleCheckoutAsset}
                      onReturn={handleReturnAsset}
                      onAddAsset={handleAddAsset}
                    />
                  )}

                  {posSection === 'menu' && (
                    <>
                      <div className="grid grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] gap-2.5">
                        {filteredProducts.map((product) => (
                          <PosProductCard
                            key={product.id}
                            product={product}
                            qty={cartQtyByProduct[product.id] || 0}
                            onAdd={stableAdd}
                          />
                        ))}
                      </div>
                      {filteredProducts.length === 0 && (
                        <div className="text-center py-14 space-y-3 rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-white/60 mt-2">
                          <p className="text-[var(--color-text-muted)] text-sm" style={{ fontFamily: FONT_UI }}>
                            {searchTerm.trim()
                              ? `لا نتائج لـ «${searchTerm.trim()}»`
                              : posProducts.length === 0
                                ? 'لا توجد منتجات في القائمة بعد.'
                                : 'لا أصناف في هذا التصنيف.'}
                          </p>
                          {searchTerm.trim() ? (
                            <button
                              type="button"
                              onClick={() => setSearchTerm('')}
                              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border bg-white"
                              style={{ fontFamily: FONT_UI }}
                            >
                              مسح البحث
                            </button>
                          ) : posProducts.length === 0 && !isEmployee ? (
                            <button
                              type="button"
                              onClick={openAddProductModal}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-medium"
                              style={{ backgroundColor: theme.primary, fontFamily: FONT_UI }}
                            >
                              <Plus size={16} />
                              إضافة صنف
                            </button>
                          ) : null}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
