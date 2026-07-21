import { PropertyAnalysis } from '../types';
import { ArrowUpRight } from 'lucide-react';

interface OfferStrategyCompProps {
  analysis: PropertyAnalysis;
}

export default function OfferStrategyComp({ analysis }: OfferStrategyCompProps) {
  const { offerStrategy, price, soldHistory } = analysis;
  const { lowOffer, fairOffer, premiumOffer, negotiationTips } = offerStrategy;

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div>
          <span className="text-[10px] tracking-wider uppercase font-mono font-bold text-blue-600">Negotiation Framework</span>
          <h4 className="font-display font-semibold text-sm text-slate-900 mt-1">Recommended Offer Strategic Tiers</h4>
          <p className="text-xs text-slate-500 mt-1 leading-snug">
            Calculated dynamically against the current asking price of <strong className="text-slate-900">{price}</strong>.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Opening offer */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
            <div>
              <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                Opening offer
              </span>
              <p className="font-sans font-bold text-xl text-slate-900 mt-3">{lowOffer}</p>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                Sensible opener (typically a few percent under asking if fairly priced) — not an extreme lowball.
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200 text-[10px] text-slate-500 font-mono">
              Usually ~3–6% under asking when fairly priced
            </div>
          </div>

          {/* Fair Bid */}
          <div className="p-4 rounded-xl bg-slate-50 border border-blue-200 flex flex-col justify-between shadow-md">
            <div>
              <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                Fair market target
              </span>
              <p className="font-sans font-bold text-xl text-emerald-600 mt-3">{fairOffer}</p>
              <p className="text-[11px] text-slate-600 mt-1.5 leading-snug">
                What a patient buyer should expect to pay, anchored to sold evidence and fair value.
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-blue-200 text-[10px] text-blue-600 font-mono">
              Primary negotiation target
            </div>
          </div>

          {/* Premium Maximum */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
            <div>
              <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                Walk-away max
              </span>
              <p className="font-sans font-bold text-xl text-slate-900 mt-3">{premiumOffer}</p>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                Cap yourself here unless market conditions clearly change (e.g. genuine bidding war).
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200 text-[10px] text-slate-500 font-mono">
              Usually asking to ~+3% (max ~+5%)
            </div>
          </div>

        </div>

        <div className="pt-4 border-t border-slate-200 space-y-2">
          <h5 className="text-xs font-semibold text-slate-700">Persuasion Tactics to Win Negotiation:</h5>
          <ul className="space-y-2">
            {negotiationTips && negotiationTips.map((tip, index) => (
              <li key={index} className="text-xs text-slate-500 flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 mt-1.5 flex-shrink-0" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Property Specific Sold History */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
          <ArrowUpRight className="w-5 h-5 text-emerald-600" />
          <h4 className="font-display font-semibold text-sm text-slate-900">Postcode/Street Historical Sales</h4>
        </div>

        <div className="space-y-3">
          {soldHistory && soldHistory.length > 0 ? (
            soldHistory.map((hist, idx) => (
              <div key={idx} className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-xs font-sans font-semibold text-slate-800 truncate">{hist.description}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Information source: {hist.source}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-bold text-slate-900 font-sans">{hist.price}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5 font-mono">Year: {hist.year}</p>
                </div>
              </div>
            ))
          ) : (
            <div className="p-4 text-center rounded-xl bg-slate-50 border border-slate-200">
              <p className="text-xs text-slate-500">No previous registry transfers matched. Likely free-market holding since original build records, or private land indices.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
