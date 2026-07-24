import React from 'react';
import {
  BedDouble,
  Bath,
  Home,
  Lock,
  Loader2,
  X,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Droplets,
  PoundSterling,
} from 'lucide-react';
import { assessListingPaymentGate } from '../lib/listingPaymentGate';
import { PriceDisplay } from './PriceDisplay';

export type TeaserPreviewFacts = {
  floodRivers?: string | null;
  floodZone?: string | null;
  lastSoldPrice?: string | null;
  lastSoldDate?: string | null;
  nearbySoldSample?: { address: string; price: string; date: string }[];
  unlockedHighlights?: string[];
};

export type TeaserData = {
  limited: boolean;
  mode?: 'listing' | 'address';
  listingUrl: string;
  portal: string;
  host: string;
  address: string | null;
  price: string | null;
  bedrooms: string | null;
  bathrooms: string | null;
  propertyType: string | null;
  images: string[];
  keyFeatures: string[];
  tenure: string | null;
  summary: string | null;
  pricePerBedroom: string | null;
  locationHint: string | null;
  researchPlan: string[];
  previewFacts?: TeaserPreviewFacts | null;
};

type Props = {
  open: boolean;
  teaser: TeaserData | null;
  priceLabel: string;
  compareAtLabel?: string | null;
  promoCaption?: string | null;
  unlocking?: boolean;
  onClose: () => void;
  onUnlock: () => void;
  onSwitchToAddress?: () => void;
  onConfirmAddress?: () => void;
};

const LOGO = '/checkthishouselogo.png';

const LOCKED_SECTIONS = [
  { title: 'Overall score & breakdown', tease: 'Value · Location · Condition · Market' },
  { title: 'Is it a good buy for your goal?', tease: 'Plain-English verdict for FTB / mover / BTL' },
  { title: 'Fair value bands', tease: 'Conservative · fair · optimistic' },
  { title: 'Schools, crime & transport', tease: 'Named locals with distances' },
  { title: 'Offer strategy & negotiation', tease: 'Opener · fair · walk-away' },
  { title: 'Viewing checklist & next steps', tease: 'Printable list + agent questions' },
];

export function ReportTeaserModal({
  open,
  teaser,
  priceLabel,
  compareAtLabel = null,
  promoCaption = null,
  unlocking = false,
  onClose,
  onUnlock,
  onSwitchToAddress,
  onConfirmAddress,
}: Props) {
  if (!open || !teaser) return null;

  const hero = teaser.images[0] || null;
  const isAddressMode = teaser.mode === 'address' || teaser.host === 'address';
  const paymentGate = assessListingPaymentGate(teaser);
  const canPay = paymentGate.ok;
  const address = teaser.address || (isAddressMode ? 'Your address' : 'Your selected listing');
  const facts = teaser.previewFacts || null;
  const highlights = [
    ...(facts?.unlockedHighlights || []),
    ...(teaser.pricePerBedroom ? [`About ${teaser.pricePerBedroom} per bedroom (asking ÷ beds)`] : []),
    ...(teaser.tenure ? [`Tenure noted: ${teaser.tenure}`] : []),
  ].slice(0, 5);
  const nearby = (facts?.nearbySoldSample || []).slice(0, 3);
  const features = (teaser.keyFeatures || []).slice(0, 4);

  return (
    <div
      className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center px-0 sm:px-4 py-0 sm:py-4 bg-brand-navy/55 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="teaser-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !unlocking) onClose();
      }}
    >
      <div className="relative w-full sm:max-w-xl max-h-[94dvh] sm:max-h-[94vh] h-[94dvh] sm:h-auto overflow-hidden rounded-t-2xl sm:rounded-xl bg-[#eef1f5] border border-brand-line shadow-2xl flex flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5 bg-white border-b border-brand-line shrink-0">
          <div className="min-w-0">
            <p id="teaser-title" className="font-display font-bold text-sm text-brand-navy">
              Free preview
            </p>
            <p className="text-[11px] text-brand-muted">
              Real facts unlocked · full report locked until you pay
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={unlocking}
            className="p-2.5 -mr-1 rounded-lg text-brand-muted hover:text-brand-navy hover:bg-brand-paper transition disabled:opacity-50 min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close preview"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 min-h-0 px-3 sm:px-4 py-3 sm:py-4 space-y-3 overscroll-contain">
          {/* —— Cover with real identity —— */}
          <section className="rounded-xl overflow-hidden bg-white border border-brand-line shadow-sm">
            <div className="px-4 sm:px-5 pt-4 pb-4">
              <div className="flex items-start justify-between gap-2 mb-3">
                <img src={LOGO} alt="" className="h-8 w-auto object-contain" />
                <span className="text-[10px] font-bold uppercase tracking-wide text-brand-green bg-emerald-50 border border-emerald-100 rounded-md px-2 py-1">
                  Free preview
                </span>
              </div>

              {hero && (
                <div className="rounded-md overflow-hidden aspect-[16/9] mb-3 bg-brand-paper border border-brand-line">
                  <img
                    src={hero}
                    alt=""
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}

              <p className="text-[10px] uppercase tracking-[0.18em] text-brand-green font-semibold mb-1">
                {isAddressMode ? 'Address report' : `${teaser.portal} listing`}
              </p>
              <p className="font-display font-bold text-lg sm:text-xl text-brand-navy leading-snug">
                {address}
              </p>
              {teaser.price && (
                <p className="font-display font-bold text-xl text-brand-navy mt-1">{teaser.price}</p>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs text-brand-muted">
                {teaser.bedrooms && (
                  <span className="inline-flex items-center gap-1">
                    <BedDouble className="w-3.5 h-3.5" /> {teaser.bedrooms} bed
                  </span>
                )}
                {teaser.bathrooms && (
                  <span className="inline-flex items-center gap-1">
                    <Bath className="w-3.5 h-3.5" /> {teaser.bathrooms} bath
                  </span>
                )}
                {teaser.propertyType && (
                  <span className="inline-flex items-center gap-1">
                    <Home className="w-3.5 h-3.5" /> {teaser.propertyType}
                  </span>
                )}
                {teaser.locationHint && !teaser.bedrooms && (
                  <span>{teaser.locationHint}</span>
                )}
              </div>

              {/* Unlocked real stats */}
              <div className="grid grid-cols-2 gap-2 mt-4">
                {facts?.lastSoldPrice ? (
                  <UnlockedStat
                    icon={<PoundSterling className="w-3.5 h-3.5" />}
                    label="Last sold"
                    value={facts.lastSoldPrice}
                    sub={facts.lastSoldDate || undefined}
                  />
                ) : teaser.price ? (
                  <UnlockedStat
                    icon={<PoundSterling className="w-3.5 h-3.5" />}
                    label="Asking"
                    value={teaser.price.replace(/^Offers over\s+/i, '')}
                  />
                ) : (
                  <LockedStat label="Fair value" />
                )}
                {facts?.floodRivers ? (
                  <UnlockedStat
                    icon={<Droplets className="w-3.5 h-3.5" />}
                    label="Flood (rivers & sea)"
                    value={facts.floodRivers}
                    sub={facts.floodZone ? `Zone ${facts.floodZone}` : undefined}
                  />
                ) : (
                  <LockedStat label="Overall score" />
                )}
              </div>
            </div>
          </section>

          {/* —— Unlocked good stuff —— */}
          <section className="rounded-xl bg-white border border-brand-line px-4 py-3.5 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-green mb-2">
              Unlocked in this free preview
            </p>
            {highlights.length > 0 ? (
              <ul className="space-y-1.5">
                {highlights.map((h) => (
                  <li key={h} className="flex gap-2 text-[13px] text-brand-navy leading-snug">
                    <CheckCircle2 className="w-4 h-4 text-brand-green shrink-0 mt-0.5" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-brand-muted leading-relaxed">
                We’ve confirmed this property for research. Unlock the full PDF for scores, valuation,
                area intelligence and offer figures.
              </p>
            )}

            {features.length > 0 && (
              <div className="mt-3 pt-3 border-t border-brand-line">
                <p className="text-[10px] font-bold uppercase tracking-wide text-brand-muted mb-1.5">
                  From the listing
                </p>
                <ul className="space-y-1">
                  {features.map((f) => (
                    <li key={f} className="text-[12px] text-brand-navy leading-snug">
                      · {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {nearby.length > 0 && (
              <div className="mt-3 pt-3 border-t border-brand-line">
                <p className="text-[10px] font-bold uppercase tracking-wide text-brand-muted mb-1.5">
                  Nearby solds (Land Registry)
                </p>
                <ul className="space-y-1">
                  {nearby.map((s) => (
                    <li
                      key={`${s.address}-${s.date}`}
                      className="flex justify-between gap-2 text-[12px] text-brand-navy"
                    >
                      <span className="truncate min-w-0">{s.address}</span>
                      <span className="shrink-0 font-semibold tabular-nums">
                        {s.price}
                        <span className="font-normal text-brand-muted"> · {s.date}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {teaser.summary && !isAddressMode && (
              <p className="mt-3 pt-3 border-t border-brand-line text-[12px] text-brand-muted leading-relaxed line-clamp-4">
                {teaser.summary}
              </p>
            )}
          </section>

          {/* —— Locked full report —— */}
          <section className="rounded-xl bg-white border border-brand-line overflow-hidden shadow-sm">
            <div className="px-4 py-2.5 border-b border-brand-line bg-brand-paper/50 flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-brand-navy">
                Locked until you unlock the PDF
              </p>
              <Lock className="w-3.5 h-3.5 text-brand-muted" />
            </div>
            <ul className="divide-y divide-brand-line">
              {LOCKED_SECTIONS.map((row) => (
                <li key={row.title} className="relative px-4 py-2.5">
                  <div className="pr-16">
                    <p className="text-[13px] font-semibold text-brand-navy">{row.title}</p>
                    <p className="text-[11px] text-brand-muted mt-0.5 blur-[3px] select-none">{row.tease}</p>
                  </div>
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 text-[10px] font-semibold text-brand-muted bg-brand-paper border border-brand-line rounded-md px-1.5 py-1">
                    <Lock className="w-3 h-3" /> Locked
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <p className="text-center text-[11px] text-brand-muted px-2 pb-1 leading-relaxed">
            Preview is free. The full branded 9–10 page PDF is a one-off paid download you can take to
            viewings.
          </p>
        </div>

        <div className="shrink-0 border-t border-brand-line bg-white px-4 sm:px-5 py-3.5 space-y-2.5">
          {!canPay && paymentGate.ok === false && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 leading-relaxed">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-700" />
              <p>{paymentGate.reason}</p>
            </div>
          )}
          {canPay && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-brand-muted text-[12px]">
                {compareAtLabel ? 'July sale · full PDF' : 'Full PDF'}
              </span>
              <PriceDisplay
                priceLabel={priceLabel}
                compareAtLabel={compareAtLabel}
                variant="inline"
              />
            </div>
          )}
          {canPay ? (
            <button
              type="button"
              onClick={onUnlock}
              disabled={unlocking}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-lg bg-brand-green text-white font-semibold text-sm py-3 hover:brightness-105 transition disabled:opacity-70"
            >
              {unlocking ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Opening checkout…
                </>
              ) : (
                <>
                  Unlock full PDF · {priceLabel}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (onConfirmAddress) onConfirmAddress();
                else if (onSwitchToAddress) onSwitchToAddress();
                else onClose();
              }}
              disabled={unlocking}
              className="w-full min-h-[48px] inline-flex items-center justify-center gap-2 rounded-lg bg-brand-navy text-white font-semibold text-sm py-3 hover:brightness-110 transition disabled:opacity-70"
            >
              {onConfirmAddress ? (
                <>
                  Confirm exact address <ArrowRight className="w-4 h-4" />
                </>
              ) : (
                <>
                  Use Address lookup instead <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          )}
          {canPay && promoCaption && (
            <p className="text-center text-[10px] text-brand-muted leading-snug">{promoCaption}</p>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={unlocking}
            className="w-full text-center text-xs text-brand-muted hover:text-brand-navy py-1 transition disabled:opacity-50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}

function UnlockedStat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-wide text-brand-muted inline-flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p className="text-[13px] font-bold text-brand-navy mt-0.5 leading-snug">{value}</p>
      {sub ? <p className="text-[10px] text-brand-muted mt-0.5">{sub}</p> : null}
    </div>
  );
}

function LockedStat({ label }: { label: string }) {
  return (
    <div className="rounded-lg border border-brand-line bg-brand-paper/70 px-2.5 py-2 relative overflow-hidden">
      <p className="text-[9px] uppercase tracking-wide text-brand-muted">{label}</p>
      <p className="text-[13px] font-bold text-brand-navy/30 mt-0.5 blur-[4px] select-none">•••</p>
      <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 text-[9px] font-semibold text-brand-muted">
        <Lock className="w-2.5 h-2.5" /> Locked
      </span>
    </div>
  );
}
