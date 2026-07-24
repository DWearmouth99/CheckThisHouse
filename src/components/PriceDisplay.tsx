import React from 'react';

type Props = {
  priceLabel: string;
  compareAtLabel?: string | null;
  /** inline = sentence; cta = on green button; hero = large sale strip */
  variant?: 'inline' | 'cta' | 'hero';
  className?: string;
};

/** Shows £4.99, or ~~£9.99~~ £4.99 when a compare-at promo is active. */
export function PriceDisplay({
  priceLabel,
  compareAtLabel,
  variant = 'inline',
  className = '',
}: Props) {
  if (variant === 'hero') {
    return (
      <span className={`inline-flex items-baseline gap-2 sm:gap-2.5 ${className}`}>
        {compareAtLabel ? (
          <span className="text-lg sm:text-xl font-semibold text-brand-muted/80 line-through decoration-2">
            {compareAtLabel}
          </span>
        ) : null}
        <span className="text-2xl sm:text-3xl font-extrabold tracking-tight text-brand-navy tabular-nums">
          {priceLabel}
        </span>
      </span>
    );
  }

  if (!compareAtLabel) {
    return <span className={className}>{priceLabel}</span>;
  }

  if (variant === 'cta') {
    return (
      <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
        <span className="text-[0.85em] font-medium text-white/70 line-through decoration-white/50">
          {compareAtLabel}
        </span>
        <span className="font-bold">{priceLabel}</span>
      </span>
    );
  }

  return (
    <span className={`inline-flex items-baseline gap-1.5 ${className}`}>
      <span className="line-through text-brand-muted decoration-brand-muted/80">{compareAtLabel}</span>
      <span className="font-semibold text-brand-navy">{priceLabel}</span>
    </span>
  );
}
