import React from 'react';
import { PropertyAnalysis } from '../types';
import { Calculator, TrendingUp, Landmark, Calendar, Info, Building2, Coins, ArrowRightLeft } from 'lucide-react';

interface InvestmentAndFinancialsProps {
  analysis: PropertyAnalysis;
}

export function InvestmentAndFinancials({ analysis }: InvestmentAndFinancialsProps) {
  const { investmentMetrics, valuation, advanced } = analysis;

  if (!investmentMetrics || !valuation) {
    return <div className="text-slate-500 text-sm p-4">Investment metrics not available.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2 text-slate-500">
            <Coins className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-sans uppercase tracking-wider font-semibold">Gross Yield</span>
          </div>
          <p className="font-display font-bold text-2xl text-slate-900">
            {investmentMetrics.grossYield || '—'}
          </p>
          {!investmentMetrics.grossYield ? (
            <p className="text-xs text-slate-400 mt-1">Yield omitted — no rent basis with source</p>
          ) : null}
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2 text-slate-500">
            <Landmark className="w-4 h-4 text-blue-600" />
            <span className="text-xs font-sans uppercase tracking-wider font-semibold">Net Yield</span>
          </div>
          <p className="font-display font-bold text-2xl text-slate-900">{investmentMetrics.netYield}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2 text-slate-500">
            <TrendingUp className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-sans uppercase tracking-wider font-semibold">Expected ROI</span>
          </div>
          <p className="font-display font-bold text-2xl text-slate-900">{investmentMetrics.roi}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center gap-2 mb-2 text-slate-500">
            <Calendar className="w-4 h-4 text-violet-600" />
            <span className="text-xs font-sans uppercase tracking-wider font-semibold">Break Even</span>
          </div>
          <p className="font-display font-bold text-xl text-slate-900">{investmentMetrics.breakEven}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h4 className="font-display font-semibold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Calculator className="w-5 h-5 text-emerald-600" />
            Financial Breakdown & Cashflow
          </h4>
          <div className="space-y-3 pt-2">
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Expected Rent</span>
              <span className="font-semibold text-slate-900">{investmentMetrics.estimatedRent}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Est. Cashflow</span>
              <span className="font-semibold text-slate-900">{investmentMetrics.cashflow}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Internal Rate of Return (IRR)</span>
              <span className="font-semibold text-slate-900">{investmentMetrics.irr}</span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-slate-100">
              <span className="text-sm text-slate-600">Est. Stamp Duty</span>
              <span className="font-semibold text-slate-900">{investmentMetrics.stampDuty}</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-slate-600">Renovation ROI</span>
              <span className="font-semibold text-slate-900">{advanced.renovationROI}</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h4 className="font-display font-semibold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <ArrowRightLeft className="w-5 h-5 text-blue-600" />
            Capital Appreciation Forecast
          </h4>
          <div className="space-y-4 pt-2">
            <p className="text-sm text-slate-600 leading-relaxed mb-4">{investmentMetrics.growthReasoning}</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="block text-xs text-slate-500 uppercase tracking-wider mb-1">1 Year</span>
                <span className="font-semibold text-lg text-slate-900">{valuation.forecast1y}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="block text-xs text-slate-500 uppercase tracking-wider mb-1">3 Years</span>
                <span className="font-semibold text-lg text-slate-900">{valuation.forecast3y}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="block text-xs text-slate-500 uppercase tracking-wider mb-1">5 Years</span>
                <span className="font-semibold text-lg text-slate-900">{valuation.forecast5y}</span>
              </div>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="block text-xs text-slate-500 uppercase tracking-wider mb-1">10 Years</span>
                <span className="font-semibold text-lg text-slate-900">{valuation.forecast10y}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Detailed Valuation */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <h4 className="font-display font-semibold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
          <Building2 className="w-5 h-5 text-indigo-600" />
          Value Assessment
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
            <span className="block text-[10px] uppercase font-mono text-rose-700 tracking-wider font-bold mb-2">Conservative</span>
            <span className="font-display font-bold text-xl text-rose-900">{valuation.conservative}</span>
            <p className="text-xs text-rose-700 mt-2">Assuming market contraction or hidden defects.</p>
          </div>
          <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 shadow-md">
            <span className="block text-[10px] uppercase font-mono text-blue-700 tracking-wider font-bold mb-2">Fair Market</span>
            <span className="font-display font-bold text-2xl text-blue-900">{valuation.fair}</span>
            <p className="text-xs text-blue-700 mt-2">Baseline valuation based on recent street comparables.</p>
          </div>
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <span className="block text-[10px] uppercase font-mono text-emerald-700 tracking-wider font-bold mb-2">Optimistic</span>
            <span className="font-display font-bold text-xl text-emerald-900">{valuation.optimistic}</span>
            <p className="text-xs text-emerald-700 mt-2">Maximum potential value post-renovation or in a hot market.</p>
          </div>
        </div>
        <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-200 flex gap-3">
          <Info className="w-5 h-5 text-slate-500 flex-shrink-0" />
          <div>
            <h5 className="text-sm font-semibold text-slate-800 mb-1">Why is this property valued this way?</h5>
            <p className="text-sm text-slate-600 leading-relaxed">{advanced.undervaluedExplanation}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
