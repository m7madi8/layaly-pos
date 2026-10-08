import React, { memo } from 'react';
import { Package, Scale, Plus } from 'lucide-react';
import { fmtMoney } from '../i18n';
import { FONT_UI } from '../branding';
import { getProductType, productPriceLabel } from '../utils/productPricing';
import { isBoostedProductImage } from '../productAssets';

const chip =
  'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-white/95 border border-[var(--color-border-strong)] text-[var(--color-text-secondary)] shadow-sm';

/**
 * بطاقة منتج — ضغطة = إضافة.
 * qty: الكمية الموجودة بالسلة (تظهر كشارة) — onAdd يجب أن يكون ثابتاً (stableAdd) كي يعمل memo.
 */
function PosProductCard({ product, qty = 0, onAdd }) {
  const type = getProductType(product);
  const isWeight = type === 'weight';
  const hasAddons = type === 'standard' && Array.isArray(product.addOns) && product.addOns.length > 0;
  const stock = Number(product.stock);
  const out =
    type !== 'time' &&
    product.stock !== null &&
    product.stock !== undefined &&
    product.stock !== '' &&
    Number.isFinite(stock) &&
    stock <= 0;
  const hasDiscount =
    product.compareAtPrice != null && Number(product.compareAtPrice) > Number(product.price);
  const priceLabel = productPriceLabel(product, fmtMoney);
  const boostedImage = isBoostedProductImage(product.name);

  return (
    <button
      type="button"
      disabled={out}
      onClick={() => onAdd(product)}
      aria-label={`${product.name} ${priceLabel}${out ? ' — نفد' : ''}`}
      className={`layali-product-card relative flex flex-col w-full min-h-[14.5rem] text-start overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
        qty > 0 ? 'ring-2 ring-accent' : ''
      } ${out ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
      style={{ fontFamily: FONT_UI }}
    >
      <div
        className={`layali-product-card__media relative w-full overflow-hidden bg-white ${
          boostedImage ? 'layali-product-card__media--boost aspect-[4/3]' : 'aspect-[5/4]'
        }`}
      >
        {product.image ? (
          <img
            src={product.image}
            alt=""
            loading="lazy"
            decoding="async"
            className={`absolute inset-0 w-full h-full object-center ${out ? 'grayscale' : ''} ${
              boostedImage ? 'object-contain scale-[1.18] p-0.5' : 'object-cover'
            }`}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[var(--color-bg-warm)]">
            <Package size={44} strokeWidth={1.25} className="text-primary/25" />
          </div>
        )}

        <div className="absolute top-1.5 start-1.5 flex flex-col items-start gap-1 pointer-events-none">
          {out && <span className={`${chip} !bg-[var(--color-danger)] !text-white !border-transparent`}>نفد</span>}
          {isWeight && (
            <span className={chip}>
              <Scale size={10} /> بالوزن
            </span>
          )}
          {hasAddons && (
            <span className={chip}>
              <Plus size={10} /> إضافات
            </span>
          )}
        </div>

        {qty > 0 && (
          <span className="absolute top-1.5 end-1.5 min-w-[1.85rem] h-8 px-1.5 rounded-full bg-accent text-white text-sm font-bold flex items-center justify-center tabular-nums pointer-events-none shadow-md">
            {qty}
          </span>
        )}
      </div>

      <div className="flex flex-col flex-1 p-2.5 pt-2">
        <h3 className="text-[15px] font-bold text-primary leading-snug line-clamp-2 min-h-[2.5rem]">
          {product.name}
        </h3>
        <div className="mt-auto pt-1 flex flex-wrap items-baseline justify-between gap-x-2">
          <span className="text-lg font-extrabold text-accent tabular-nums leading-tight">{priceLabel}</span>
          {hasDiscount && (
            <span className="text-[11px] text-[var(--color-text-muted)] line-through tabular-nums">
              {fmtMoney(product.compareAtPrice)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export default memo(PosProductCard);
