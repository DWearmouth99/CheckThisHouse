import React, { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, Loader2, MapPinned, X } from 'lucide-react';
import { AddressAutocomplete } from './AddressAutocomplete';
import { isInvalidAddress, validateUkAddress } from '../lib/ukAddress';

type Props = {
  open: boolean;
  listingAddress: string | null;
  portal?: string;
  confirming?: boolean;
  onClose: () => void;
  onConfirm: (confirmedAddress: string) => void;
};

export function ConfirmListingAddressModal({
  open,
  listingAddress,
  portal = 'Rightmove',
  confirming = false,
  onClose,
  onConfirm,
}: Props) {
  const [value, setValue] = useState('');
  const [pickedFromList, setPickedFromList] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValue('');
    setPickedFromList(false);
    setLocalError(null);
  }, [open, listingAddress]);

  if (!open) return null;

  const visibleLabel =
    (listingAddress || '').replace(/\s+/g, ' ').trim() ||
    'Street / area only (door number hidden)';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (confirming) return;
    const check = validateUkAddress(value);
    if (isInvalidAddress(check)) {
      setLocalError(check.error);
      return;
    }
    if (!pickedFromList) {
      setLocalError(
        'Select your exact property from the dropdown so we research the right door number.'
      );
      return;
    }
    setLocalError(null);
    onConfirm(check.address);
  };

  return (
    <div
      className="fixed inset-0 z-[56] flex items-end sm:items-center justify-center px-0 sm:px-4 py-0 sm:py-4 bg-brand-navy/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-address-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !confirming) onClose();
      }}
    >
      <div className="relative w-full sm:max-w-lg max-h-[94dvh] overflow-hidden rounded-t-2xl sm:rounded-xl bg-white border border-brand-line shadow-2xl flex flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-b border-brand-line shrink-0">
          <div className="min-w-0">
            <p id="confirm-address-title" className="font-display font-bold text-sm text-brand-navy">
              We need the full address
            </p>
            <p className="text-[11px] text-brand-muted">So we research the right property before you pay</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={confirming}
            className="p-2.5 -mr-1 rounded-lg text-brand-muted hover:text-brand-navy hover:bg-brand-paper transition disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 min-h-0 px-4 sm:px-5 py-4 space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
              <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div className="min-w-0 text-sm text-amber-950 leading-relaxed">
                <p className="font-semibold mb-1">
                  {portal} doesn’t show the full address on this listing.
                </p>
                <p>
                  We’d hate to charge you for a report on the wrong house. Please find the exact
                  address (or at least the full postcode), type it below, and pick your property from
                  the list.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-brand-line bg-brand-paper/60 px-3.5 py-3">
              <p className="text-[10px] uppercase tracking-wide text-brand-muted font-semibold mb-1.5">
                What’s shown on the listing
              </p>
              <div className="flex items-start gap-2">
                <MapPinned className="w-4 h-4 text-brand-green shrink-0 mt-0.5" />
                <p className="text-sm text-brand-navy font-medium leading-snug">{visibleLabel}</p>
              </div>
            </div>

            <label className="block">
              <span className="brand-label mb-1.5 block">Enter the address or postcode</span>
              <AddressAutocomplete
                value={value}
                onChange={(next) => {
                  setValue(next);
                  setPickedFromList(false);
                  setLocalError(null);
                }}
                onResolved={(formatted) => {
                  setValue(formatted);
                  setPickedFromList(true);
                  setLocalError(null);
                }}
              disabled={confirming}
              placeholder="Start with the full postcode, e.g. TS7 0GY"
              invalid={Boolean(localError)}
            />
              <p className="text-[11px] text-brand-muted mt-2 leading-relaxed">
                A full postcode works best — you’ll see every property there and can choose the
                right door number from the dropdown.
              </p>
            </label>

            {localError && (
              <div className="flex items-start gap-2 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{localError}</span>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-brand-line bg-white px-4 sm:px-5 py-3.5 space-y-2">
            <button
              type="submit"
              disabled={confirming}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-lg bg-brand-green text-white font-semibold text-sm py-3 hover:brightness-105 transition disabled:opacity-70"
            >
              {confirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Continuing…
                </>
              ) : (
                <>
                  This is my property <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={confirming}
              className="w-full text-center text-xs text-brand-muted hover:text-brand-navy py-1 transition disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
