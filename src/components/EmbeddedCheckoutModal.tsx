import React, { useEffect, useRef, useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Lock, Loader2, X } from 'lucide-react';
import { PriceDisplay } from './PriceDisplay';

type EmbeddedCheckoutHandle = {
  mount: (el: HTMLElement) => void;
  destroy: () => void;
};

type Props = {
  open: boolean;
  clientSecret: string | null;
  publishableKey: string | null;
  priceLabel: string;
  compareAtLabel?: string | null;
  promoCaption?: string | null;
  onClose: () => void;
};

export function EmbeddedCheckoutModal({
  open,
  clientSecret,
  publishableKey,
  priceLabel,
  compareAtLabel = null,
  promoCaption = null,
  onClose,
}: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const checkoutRef = useRef<EmbeddedCheckoutHandle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    if (!clientSecret || !publishableKey) {
      setLoading(false);
      setError(
        'Stripe publishable key is missing. Add STRIPE_PUBLISHABLE_KEY=pk_test_… to .env.local (from the Stripe Dashboard), then restart the server.'
      );
      return;
    }

    let cancelled = false;

    const mount = async () => {
      setLoading(true);
      setError(null);

      // Wait one frame so the mount node exists after open=true
      await new Promise((r) => requestAnimationFrame(() => r(undefined)));
      if (cancelled || !mountRef.current) return;

      try {
        const stripe = await loadStripe(publishableKey);
        if (!stripe) throw new Error('Could not load Stripe.js');
        if (cancelled) return;

        checkoutRef.current?.destroy();
        checkoutRef.current = null;

        const createFn =
          (stripe as any).createEmbeddedCheckoutPage || (stripe as any).initEmbeddedCheckout;
        if (typeof createFn !== 'function') {
          throw new Error('This Stripe.js build does not support Embedded Checkout.');
        }

        const checkout = await createFn.call(stripe, { clientSecret });
        if (cancelled) {
          checkout.destroy();
          return;
        }
        checkoutRef.current = checkout;
        checkout.mount(mountRef.current);
        setLoading(false);
      } catch (err: unknown) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Could not open checkout.';
        setError(message);
        setLoading(false);
      }
    };

    void mount();

    return () => {
      cancelled = true;
      checkoutRef.current?.destroy();
      checkoutRef.current = null;
    };
  }, [open, clientSecret, publishableKey]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-0 sm:px-4 py-0 sm:py-5 bg-brand-navy/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkout-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full sm:max-w-md max-h-[92dvh] sm:max-h-[90vh] h-[92dvh] sm:h-auto overflow-hidden rounded-t-2xl sm:rounded-xl bg-white border border-brand-line shadow-2xl flex flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-3 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.14em] uppercase text-brand-green">
              CheckThisHouse
            </p>
            <p id="checkout-title" className="font-display font-bold text-lg text-brand-navy mt-0.5">
              Pay for your report
            </p>
            <div className="mt-2 rounded-lg border border-brand-green/20 bg-emerald-50/70 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-green">
                {compareAtLabel ? 'July sale · one-off payment' : 'One-off paid PDF'}
              </p>
              <PriceDisplay
                priceLabel={priceLabel}
                compareAtLabel={compareAtLabel}
                variant="hero"
                className="mt-0.5"
              />
              {promoCaption ? (
                <p className="text-[11px] text-brand-muted mt-1 leading-snug">{promoCaption}</p>
              ) : (
                <p className="text-[11px] text-brand-muted mt-1">Card payment via Stripe</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 -mr-1 -mt-1 rounded-lg text-brand-muted hover:text-brand-navy hover:bg-brand-paper transition min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close checkout"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mx-4 sm:mx-5 h-px bg-brand-line shrink-0" />

        <div className="overflow-y-auto flex-1 min-h-0 px-1 pb-1 overscroll-contain">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-14 text-sm text-brand-muted">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading payment form…
            </div>
          )}
          {error && (
            <div className="m-4 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
              {error}
            </div>
          )}
          <div ref={mountRef} className={loading || error ? 'hidden' : ''} />
        </div>

        <div className="flex items-center justify-center gap-1.5 px-5 py-3 border-t border-brand-line text-[11px] text-brand-muted shrink-0">
          <Lock className="w-3 h-3" />
          Encrypted payment · powered by Stripe
        </div>
      </div>
    </div>
  );
}
