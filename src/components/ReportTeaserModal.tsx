import React from 'react';
import { BedDouble, Bath, Home, Lock, Loader2, X, ArrowRight, MapPinned } from 'lucide-react';

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
};

type Props = {
  open: boolean;
  teaser: TeaserData | null;
  priceLabel: string;
  unlocking?: boolean;
  onClose: () => void;
  onUnlock: () => void;
};

const LOGO = '/checkthishouselogo.png';

export function ReportTeaserModal({
  open,
  teaser,
  priceLabel,
  unlocking = false,
  onClose,
  onUnlock,
}: Props) {
  if (!open || !teaser) return null;

  const hero = teaser.images[0] || null;
  const isAddressMode = teaser.mode === 'address' || teaser.host === 'address';
  const hasBasics = Boolean(teaser.address || teaser.price);
  const address = teaser.address || (isAddressMode ? 'Your address' : 'Your selected listing');
  const price = teaser.price;
  const beds = teaser.bedrooms || '3';
  const type = teaser.propertyType || 'property';

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
              Full report preview
            </p>
            <p className="text-[11px] text-brand-muted">
              9–10 page PDF · sample layout with analysis blurred
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

        <div className="overflow-y-auto flex-1 min-h-0 px-3 sm:px-4 py-3 sm:py-4 space-y-3 sm:space-y-4 overscroll-contain">
          {/* Stacked pages hint */}
          <p className="text-[10px] text-center text-brand-muted -mt-1">
            Scroll through sample pages — the real download is a full branded PDF you can take to a viewing
          </p>

          {/* —— Cover (white) —— */}
          <MockPage tall>
            <div className="bg-white px-5 pt-5 pb-6">
              <div className="flex items-start justify-between gap-2 mb-5">
                <img src={LOGO} alt="" className="h-9 w-auto object-contain" />
                <div className="text-right">
                  <p className="text-[9px] font-mono text-brand-muted">Confidential buyer report</p>
                  <p className="text-[9px] text-brand-muted mt-0.5">Page 1 of 6</p>
                </div>
              </div>

              {hero && (
                <div className="rounded-md overflow-hidden aspect-[16/9] mb-4 bg-brand-paper border border-brand-line">
                  <img
                    src={hero}
                    alt=""
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                </div>
              )}

              {!hero && isAddressMode && (
                <div className="rounded-md mb-4 bg-brand-paper border border-brand-line px-4 py-6 flex items-start gap-3">
                  <MapPinned className="w-8 h-8 text-brand-green shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-brand-green font-semibold mb-1">
                      Address lookup
                    </p>
                    <p className="text-sm text-brand-navy leading-snug">
                      No listing photos — research uses public sold data, area and risk sources for this address.
                    </p>
                  </div>
                </div>
              )}

              <p className="text-[10px] uppercase tracking-[0.2em] text-brand-green font-semibold mb-1.5">
                {isAddressMode ? 'Full address report' : 'Full property report'}
              </p>
              <p className="font-display font-bold text-xl text-brand-navy leading-snug">{address}</p>
              {price && (
                <p className="font-display font-bold text-2xl text-brand-navy mt-1">{price}</p>
              )}

              {hasBasics && !isAddressMode && (
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-brand-muted">
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
                  {teaser.tenure && <span>Tenure: {teaser.tenure}</span>}
                </div>
              )}

              {isAddressMode && teaser.summary && (
                <p className="text-xs text-brand-muted mt-3 leading-relaxed">{teaser.summary}</p>
              )}

              {!hasBasics && !isAddressMode && (
                <p className="text-xs text-brand-muted mt-3 leading-relaxed">
                  Listing linked from {teaser.portal}. Unlock checkout to generate the complete multi-page PDF.
                </p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
                {(
                  [
                    price ? (['Asking', price.replace(/^Offers over\s+/i, '')] as const) : null,
                    [isAddressMode ? 'Est. value' : 'Score', '••/100'] as const,
                    ['Risk', '•••'] as const,
                    ['Confidence', '••%'] as const,
                  ].filter(Boolean) as [string, string][]
                ).map(([l, v]) => (
                  <div key={l} className="rounded-lg border border-brand-line bg-brand-paper/60 px-2 py-2">
                    <p className="text-[8px] uppercase tracking-wide text-brand-muted">{l}</p>
                    <p
                      className={`text-[12px] font-bold mt-0.5 text-brand-navy ${
                        l !== 'Asking' ? 'blur-[5px] select-none' : ''
                      }`}
                    >
                      {v}
                    </p>
                  </div>
                ))}
              </div>

              <div className="relative mt-6 flex justify-center py-2">
                <div className="blur-[7px] select-none pointer-events-none" aria-hidden>
                  <div className="w-[130px] h-[130px] rounded-full border-[11px] border-brand-green flex flex-col items-center justify-center bg-brand-paper">
                    <span className="font-display font-bold text-4xl text-brand-navy leading-none">68</span>
                    <span className="text-[8px] tracking-widest text-brand-muted mt-1">OVERALL</span>
                  </div>
                </div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-white text-brand-navy border border-brand-line rounded-full px-3 py-1.5 shadow-sm">
                    <Lock className="w-3 h-3" /> Score unlocked after payment
                  </span>
                </div>
              </div>
            </div>
          </MockPage>

          {/* —— Summary (dense) —— */}
          <MockPage tall>
            <PageHeader title="1. Overall score, pros & cons, and is it a good buy?" page="2 / 6" />
            <div className="px-5 pb-5 space-y-3.5">
              <BlurBlock>
                <p className="text-[12px] leading-[1.55] text-brand-navy">
                  This {beds}-bed {type} presents a mixed but workable purchase picture for a careful buyer.
                  Location fundamentals look solid — schools, transport and everyday amenities stack up — while
                  value for money is tighter against recent local solds. Condition flags point to a survey focus
                  on damp, roof lines and any leasehold costs before a firm offer. Overall this is the kind of
                  home where negotiation room and viewing discipline matter more than falling for the listing
                  photos alone.
                </p>
                <p className="text-[12px] leading-[1.55] text-brand-navy mt-2">
                  Confidence is moderate: listing data is clear, but flood, insurance and comparable sales need
                  the full research pass before you treat any figure as final.
                </p>
              </BlurBlock>

              <div className="grid grid-cols-[72px_1fr] sm:grid-cols-[100px_1fr] gap-3">
                <BlurBlock className="flex flex-col items-center justify-center py-3 sm:py-4 rounded-lg border border-brand-line bg-brand-paper/40">
                  <span className="font-display font-bold text-3xl sm:text-4xl text-brand-green">68</span>
                  <span className="text-[8px] uppercase text-brand-muted mt-1">Overall / 100</span>
                  <span className="text-[9px] font-semibold text-brand-navy mt-2">Risk: Med</span>
                </BlurBlock>
                <BlurBlock className="space-y-2 py-1">
                  {[
                    ['Value for money', 62],
                    ['Location', 78],
                    ['Condition', 55],
                    ['Market', 70],
                    ['Growth potential', 66],
                  ].map(([label, w]) => (
                    <div key={String(label)}>
                      <div className="flex justify-between text-[10px] mb-0.5">
                        <span className="text-brand-muted">{label}</span>
                        <span className="font-semibold text-brand-navy">{w}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-brand-paper overflow-hidden">
                        <div className="h-full rounded-full bg-brand-green" style={{ width: `${w}%` }} />
                      </div>
                    </div>
                  ))}
                </BlurBlock>
              </div>

              <BlurBlock className="rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5">
                <p className="text-[9px] font-bold text-brand-green uppercase mb-1">Is it a good buy for you?</p>
                <p className="text-[11px] text-brand-navy leading-relaxed">
                  Suitable if you prioritise location and can negotiate below asking after survey. Less ideal if
                  you need turnkey condition or zero lease complexity.
                </p>
              </BlurBlock>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <BlurBlock className="rounded-md border border-emerald-200 bg-emerald-50/80 px-2.5 py-2 space-y-1.5">
                  <p className="text-[9px] font-bold text-brand-green uppercase">Pros</p>
                  {[
                    'Strong school catchment nearby',
                    'Walkable station and bus links',
                    'Quiet residential street feel',
                    'Useful amenities within 0.6 miles',
                  ].map((t) => (
                    <p key={t} className="text-[10px] text-brand-navy leading-snug">
                      • {t}
                    </p>
                  ))}
                </BlurBlock>
                <BlurBlock className="rounded-md border border-rose-200 bg-rose-50/80 px-2.5 py-2 space-y-1.5">
                  <p className="text-[9px] font-bold text-rose-700 uppercase">Cons</p>
                  {[
                    'Asking looks stretched vs solds',
                    'Possible damp / fabric checks',
                    'Lease or insurance flags to confirm',
                    'Limited outdoor space for price',
                  ].map((t) => (
                    <p key={t} className="text-[10px] text-brand-navy leading-snug">
                      • {t}
                    </p>
                  ))}
                </BlurBlock>
              </div>
            </div>
          </MockPage>

          {/* —— Value —— */}
          <MockPage tall>
            <PageHeader title="2. Fair value, price outlook & renovation upside" page="3 / 6" />
            <div className="px-5 pb-5 space-y-3.5">
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {[
                  ['Conservative', '£312,000', 'bg-rose-50 border-rose-200'],
                  ['Fair market', '£338,000', 'bg-emerald-50 border-emerald-200'],
                  ['Optimistic', '£355,000', 'bg-sky-50 border-sky-200'],
                ].map(([label, value, cls]) => (
                  <div key={label}>
                    <BlurBlock className={`rounded-lg border px-2.5 py-3 text-center ${cls}`}>
                      <p className="text-[8px] font-bold uppercase text-brand-muted">{label}</p>
                      <p className="font-display font-bold text-base text-brand-navy mt-1">{value}</p>
                    </BlurBlock>
                  </div>
                ))}
              </div>
              <BlurBlock>
                <p className="text-[9px] font-bold uppercase text-brand-muted mb-2">How value could change</p>
                <div className="h-24 rounded-md bg-brand-paper border border-brand-line flex items-end px-3 pb-2 gap-1.5">
                  {[36, 44, 52, 60, 72].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col justify-end items-center gap-1">
                      <div className="w-full rounded-t bg-brand-green/45" style={{ height: `${h}%` }} />
                      <span className="text-[8px] text-brand-muted">{['Now', '1y', '3y', '5y', '10y'][i]}</span>
                    </div>
                  ))}
                </div>
              </BlurBlock>
              <div className="grid grid-cols-2 gap-2.5">
                <BlurBlock className="rounded-lg border border-brand-line bg-brand-paper/50 px-3 py-2.5">
                  <p className="text-[9px] font-bold uppercase text-brand-muted mb-1">Is the asking price fair?</p>
                  <p className="text-[11px] text-brand-navy leading-relaxed">
                    Asking sits above the fair band. Recent solds suggest room to negotiate if survey finds fabric
                    issues or the home sits longer on market.
                  </p>
                </BlurBlock>
                <BlurBlock className="rounded-lg border border-brand-line bg-brand-paper/50 px-3 py-2.5">
                  <p className="text-[9px] font-bold uppercase text-brand-muted mb-1">Renovation potential</p>
                  <p className="text-[11px] text-brand-navy leading-relaxed">
                    Kitchen/bath refresh could support resale. Extension upside depends on planning and plot —
                    treat as optional, not priced in.
                  </p>
                </BlurBlock>
              </div>
            </div>
          </MockPage>

          {/* —— Risks & local (tables) —— */}
          <MockPage tall>
            <PageHeader
              title="3. Flood, damp, leasehold, schools, crime & transport"
              page="4 / 6"
            />
            <div className="px-5 pb-5 space-y-3.5">
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['Flood', 'Low–moderate — check Environment Agency maps and insurance quotes.'],
                  ['Damp / structure', 'Watch loft stains, ground floor moisture and older window seals.'],
                  ['Leasehold', 'Confirm years left, ground rent and service charge in writing.'],
                  ['Insurance', 'Get quotes early if flat/terrace or near watercourses.'],
                  ['Subsidence', 'No strong signal — still ask about historic claims.'],
                  ['Planning', 'Check nearby applications that could affect light or parking.'],
                ].map(([label, body]) => (
                  <div key={label}>
                    <BlurBlock className="rounded-md border border-brand-line bg-brand-paper/40 px-2.5 py-2">
                      <p className="text-[9px] font-bold uppercase text-brand-muted mb-1">{label}</p>
                      <p className="text-[10px] text-brand-navy leading-snug">{body}</p>
                    </BlurBlock>
                  </div>
                ))}
              </div>

              <BlurBlock className="rounded-lg border border-brand-line overflow-hidden">
                <div className="bg-brand-navy text-white px-2.5 py-1.5 text-[9px] font-semibold uppercase tracking-wide">
                  Schools in the local area
                </div>
                <table className="w-full text-[10px]">
                  <tbody>
                    {[
                      ['Primary Academy', '0.4 mi', 'Good'],
                      ['High School', '0.9 mi', 'Outstanding'],
                      ['Infant School', '0.6 mi', 'Good'],
                    ].map(([name, dist, rating], i) => (
                      <tr key={name} className={i % 2 ? 'bg-brand-paper/60' : 'bg-white'}>
                        <td className="px-2.5 py-1.5 font-medium text-brand-navy">{name}</td>
                        <td className="px-2 py-1.5 text-brand-muted">{dist}</td>
                        <td className="px-2.5 py-1.5 font-semibold text-brand-green text-right">{rating}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </BlurBlock>

              <div className="grid grid-cols-2 gap-2.5">
                <BlurBlock className="rounded-lg border border-brand-line px-2.5 py-2">
                  <p className="text-[9px] font-bold uppercase text-brand-muted mb-1">Crime in the area</p>
                  <p className="text-[11px] text-brand-navy leading-snug">
                    Rating: Moderate — typical suburban mix; evening street lighting and parking worth noting on
                    a viewing.
                  </p>
                </BlurBlock>
                <BlurBlock className="rounded-lg border border-brand-line px-2.5 py-2">
                  <p className="text-[9px] font-bold uppercase text-brand-muted mb-1">Transport links</p>
                  <p className="text-[11px] text-brand-navy leading-snug">
                    Station ~12 min walk · Frequent buses · Main road access for driving commuting.
                  </p>
                </BlurBlock>
              </div>
            </div>
          </MockPage>

          {/* —— Sold prices —— */}
          <MockPage tall>
            <PageHeader title="4. Recent sold comps & street price history" page="5 / 6" />
            <div className="px-5 pb-5 space-y-3">
              <BlurBlock className="rounded-lg border border-brand-line overflow-hidden">
                <div className="bg-brand-navy text-white px-2.5 py-1.5 text-[9px] font-semibold uppercase">
                  Similar homes sold nearby
                </div>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="bg-brand-paper text-brand-muted text-left">
                      <th className="px-2.5 py-1.5 font-semibold">Address</th>
                      <th className="px-2 py-1.5 font-semibold">Sold</th>
                      <th className="px-2.5 py-1.5 font-semibold text-right">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['12 Example Road', 'Mar 2025', '£329,000'],
                      ['4 Nearby Close', 'Jan 2025', '£341,500'],
                      ['9 Station Lane', 'Nov 2024', '£318,000'],
                      ['21 Park View', 'Sep 2024', '£335,000'],
                    ].map(([a, d, p], i) => (
                      <tr key={a} className={i % 2 ? 'bg-brand-paper/50' : 'bg-white'}>
                        <td className="px-2.5 py-1.5 text-brand-navy font-medium">{a}</td>
                        <td className="px-2 py-1.5 text-brand-muted">{d}</td>
                        <td className="px-2.5 py-1.5 text-brand-navy font-semibold text-right">{p}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </BlurBlock>
              <BlurBlock className="rounded-lg border border-brand-line px-3 py-2.5">
                <p className="text-[9px] font-bold uppercase text-brand-muted mb-1">How to use these sold prices</p>
                <p className="text-[11px] text-brand-navy leading-relaxed">
                  Weight same-street and same-bed sales highest. Adjust for condition, garden, parking and lease
                  length. Listing prices are asking hopes — solds are the better guide for your opener.
                </p>
              </BlurBlock>
            </div>
          </MockPage>

          {/* —— Offer & checklist —— */}
          <MockPage tall>
            <PageHeader
              title="5. Offer figures, negotiation tips, viewing checklist & agent questions"
              page="6 / 6"
            />
            <div className="px-5 pb-5 space-y-3.5">
              <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                {[
                  ['Opener', '£315,000', 'border-rose-200 bg-rose-50'],
                  ['Fair target', '£328,000', 'border-brand-green bg-emerald-50'],
                  ['Walk-away', '£340,000', 'border-amber-200 bg-amber-50'],
                ].map(([label, value, cls]) => (
                  <div key={label}>
                    <BlurBlock className={`rounded-lg border px-1.5 sm:px-2 py-2.5 sm:py-3 text-center ${cls}`}>
                      <p className="text-[7px] sm:text-[8px] font-bold uppercase text-brand-muted">{label}</p>
                      <p className="font-display font-bold text-xs sm:text-sm text-brand-navy mt-1">{value}</p>
                    </BlurBlock>
                  </div>
                ))}
              </div>

              <BlurBlock className="space-y-1.5">
                <p className="text-[9px] font-bold uppercase text-brand-muted">How to negotiate</p>
                {[
                  'Lead with sold evidence, not feelings about the photos',
                  'Keep survey findings ready as leverage after offer accepted',
                  'Ask how long on market and whether other offers are live',
                  'Don’t bid walk-away on day one — leave a step up',
                ].map((t, i) => (
                  <p key={t} className="text-[11px] text-brand-navy flex gap-2">
                    <span className="font-bold text-brand-navy/50 shrink-0">{i + 1}.</span>
                    {t}
                  </p>
                ))}
              </BlurBlock>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <BlurBlock className="space-y-1">
                  <p className="text-[9px] font-bold uppercase text-brand-muted mb-1">Viewing checklist</p>
                  {[
                    'Loft for damp / staining',
                    'Boiler age & service history',
                    'Traffic noise at peak hour',
                    'Mobile signal in all rooms',
                    'Garden drainage after rain',
                    'Parking stress on street',
                  ].map((line) => (
                    <p key={line} className="text-[10px] text-brand-navy flex gap-1.5">
                      <span className="text-brand-green">☐</span> {line}
                    </p>
                  ))}
                </BlurBlock>
                <BlurBlock className="space-y-1">
                  <p className="text-[9px] font-bold uppercase text-brand-muted mb-1">Questions for the agent</p>
                  {[
                    'Why are the sellers moving?',
                    'Any survey issues from fallen sales?',
                    'What is included in the sale?',
                    'Lease years / ground rent?',
                    'Offers deadline or sealed bids?',
                    'Chain-free or onward purchase?',
                  ].map((line, i) => (
                    <p key={line} className="text-[10px] text-brand-navy flex gap-1.5">
                      <span className="font-bold text-brand-navy/40">{i + 1}.</span> {line}
                    </p>
                  ))}
                </BlurBlock>
              </div>
            </div>
          </MockPage>

          <p className="text-center text-[11px] text-brand-muted px-2 pb-1 leading-relaxed">
            Listing cover details are free. The full unlocked PDF is a complete 9–10 page report with real scores,
            local research, sold evidence and offer figures for this property.
          </p>
        </div>

        <div className="shrink-0 border-t border-brand-line bg-white px-4 sm:px-5 py-3.5 space-y-1.5">
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
                Unlock full PDF · {priceLabel} <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
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

function MockPage({ children, tall }: { children: React.ReactNode; tall?: boolean }) {
  return (
    <div
      className={`rounded-md overflow-hidden bg-white shadow-[0_10px_28px_rgba(11,31,58,0.12)] border border-brand-line/60 ${
        tall ? 'min-h-[280px]' : ''
      }`}
    >
      {children}
    </div>
  );
}

function PageHeader({ title, page }: { title: string; page: string }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2.5 border-b border-brand-line/80">
      <p className="text-[12px] font-bold text-brand-navy leading-snug">{title}</p>
      <span className="text-[9px] font-mono text-brand-muted shrink-0 pt-0.5">{page}</span>
    </div>
  );
}

function BlurBlock({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="blur-[4px] select-none pointer-events-none" aria-hidden>
        {children}
      </div>
      <div className="absolute inset-0 bg-white/15 pointer-events-none" />
    </div>
  );
}
