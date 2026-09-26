import React from 'react';
import { Package } from 'lucide-react';
import { fmtMoney } from '../i18n';
import { FONT_UI } from '../branding';

/**
 * بطاقة منتج — ضغطة على البطاقة = إضافة للطلب
 */
export default function PosProductCard({ product, onAdd }) {
  const hasDiscount =
    product.compareAtPrice != null &&
    Number(product.compareAtPrice) > Number(product.price);
  const savings = hasDiscount
    ? Number(product.compareAtPrice) - Number(product.price)
    : 0;

  const subtitle = product.description || product.category || '';

  return (
    <button
      type="button"
      onClick={() => onAdd(product)}
      className="layali-product-card group flex flex-col h-full w-full text-start overflow-hidden p-2.5 sm:p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 cursor-pointer"
      style={{ fontFamily: FONT_UI }}
    >
      <div className="layali-product-card__media relative w-full min-h-[140px] sm:min-h-[160px] aspect-square max-h-[220px] flex items-center justify-center p-2 sm:p-3 mx-auto max-w-full">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            className="max-w-full max-h-full w-auto h-auto object-contain drop-shadow-sm"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-primary/20">
            <Package size={40} strokeWidth={1.25} />
          </div>
        )}
        {hasDiscount && savings > 0 && (
          <span className="absolute top-2 start-2 px-2.5 py-1 rounded-full text-[10px] font-bold text-white bg-[var(--color-success)] shadow-sm pointer-events-none">
            وفّر {fmtMoney(savings)}
          </span>
        )}
      </div>

      <div className="flex flex-col flex-1 px-1.5 pb-1 pt-2 sm:pt-2.5 w-full">
        <h3 className="text-sm font-bold text-primary leading-snug line-clamp-2 mb-0.5 group-hover:text-accent transition-colors duration-300">
          {product.name}
        </h3>
        {subtitle ? (
          <p className="text-xs text-layali-muted line-clamp-1 mb-2">{subtitle}</p>
        ) : (
          <div className="mb-2" />
        )}

        <div className="mt-auto pt-2.5 border-t border-[var(--color-border)]">
          <span className="text-lg font-bold text-accent leading-none">{fmtMoney(product.price)}</span>
          {hasDiscount && (
            <span className="text-xs text-layali-muted line-through ms-2">
              {fmtMoney(product.compareAtPrice)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
