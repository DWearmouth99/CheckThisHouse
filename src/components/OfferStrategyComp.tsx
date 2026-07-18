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
          
          {/* Cheeky Bid */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
            <div>
              <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-bold">
                Cheeky Bid (Low)
              </span>
              <p className="font-sans font-bold text-xl text-slate-900 mt-3">{lowOffer}</p>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                Use if listing is stale (over 6 weeks), chain-free, or needs upfront repairs.
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200 text-[10px] text-slate-500 font-mono">
              Est: -6% to -10% down
            </div>
          </div>

          {/* Fair Bid */}
          <div className="p-4 rounded-xl bg-slate-50 border border-blue-200 flex flex-col justify-between shadow-md">
            <div>
              <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 font-bold">
                Fair Bid (Market)
              </span>
              <p className="font-sans font-bold text-xl text-emerald-600 mt-3">{fairOffer}</p>
              <p className="text-[11px] text-slate-600 mt-1.5 leading-snug">
                Aligned to similar road transactions. Recommended for steady, reasonable buyers.
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-blue-200 text-[10px] text-blue-600 font-mono">
              Healthy Market Standard
            </div>
          </div>

          {/* Premium Maximum */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between">
            <div>
              <span className="text-[9px] uppercase font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-bold">
                Absolute Limit (Max)
              </span>
              <p className="font-sans font-bold text-xl text-slate-900 mt-3">{premiumOffer}</p>
              <p className="text-[11px] text-slate-500 mt-1.5 leading-snug">
                Do NOT bid higher than this. Walk away if other parties push it beyond.
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-slate-200 text-[10px] text-slate-500 font-mono">
              Maximum Fair Return Cap
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
