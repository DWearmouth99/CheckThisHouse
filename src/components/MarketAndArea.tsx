import React from 'react';
import { PropertyAnalysis } from '../types';
import { Map, Users, TrendingDown, Clock, Home, Building } from 'lucide-react';

interface MarketAndAreaProps {
  analysis: PropertyAnalysis;
}

export function MarketAndArea({ analysis }: MarketAndAreaProps) {
  const { marketAndRental, comparableSales, locationIntelligence } = analysis;

  if (!marketAndRental || !locationIntelligence) {
    return <div className="text-slate-500 text-sm p-4">Market data not available.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-slate-500" />
            <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600">Time on Market</h5>
          </div>
          <p className="text-lg font-semibold text-slate-900">{marketAndRental.timeOnMarket}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-4 h-4 text-slate-500" />
            <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600">Price Trends</h5>
          </div>
          <p className="text-lg font-semibold text-slate-900">{marketAndRental.priceTrend}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Home className="w-4 h-4 text-slate-500" />
            <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600">Supply vs Demand</h5>
          </div>
          <p className="text-lg font-semibold text-slate-900">{marketAndRental.supplyDemand}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h4 className="font-display font-semibold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Users className="w-5 h-5 text-indigo-600" />
            Rental Demand & Demographics
          </h4>
          <div className="space-y-4 pt-2">
            <div>
              <span className="block text-xs text-slate-500 mb-1">Target Tenant Profile</span>
              <p className="text-sm font-medium text-slate-900">{marketAndRental.tenantProfile}</p>
            </div>
            <div>
              <span className="block text-xs text-slate-500 mb-1">Area Vacancy Rates</span>
              <p className="text-sm font-medium text-slate-900">{marketAndRental.vacancyRates}</p>
            </div>
            <div>
              <span className="block text-xs text-slate-500 mb-1">Short-term Let / Airbnb Potential</span>
              <p className="text-sm font-medium text-slate-900">{marketAndRental.airbnbPotential}</p>
            </div>
            <div>
              <span className="block text-xs text-slate-500 mb-1">Demographics</span>
              <p className="text-sm font-medium text-slate-900">{analysis.areaAnalysis.demographics}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h4 className="font-display font-semibold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Map className="w-5 h-5 text-emerald-600" />
            Location Intelligence
          </h4>
          <div className="space-y-4 pt-2">
            <div>
              <span className="block text-xs text-slate-500 mb-1">Planned Infrastructure</span>
              <p className="text-sm text-slate-800 leading-relaxed">{locationIntelligence.plannedInfrastructure}</p>
            </div>
            <div>
              <span className="block text-xs text-slate-500 mb-1">Regeneration Projects</span>
              <p className="text-sm text-slate-800 leading-relaxed">{locationIntelligence.regenerationProjects}</p>
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <span className="block text-xs text-slate-500 mb-1">Population Growth</span>
                <p className="text-sm font-medium text-slate-900">{locationIntelligence.populationGrowth}</p>
              </div>
              <div className="flex-1">
                <span className="block text-xs text-slate-500 mb-1">Walkability</span>
                <p className="text-sm font-medium text-slate-900">{locationIntelligence.walkability}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Comparable Sales List */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h4 className="font-display font-semibold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
          <Building className="w-5 h-5 text-blue-600" />
          Recent Comparable Sales
        </h4>
        <div className="space-y-3">
          {comparableSales && comparableSales.length > 0 ? (
            comparableSales.map((sale, idx) => (
              <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200 gap-4">
                <div className="flex-1">
                  <span className="font-semibold text-slate-800 text-sm block mb-1">{sale.address}</span>
                  <p className="text-xs text-slate-600">{sale.similarity}</p>
                </div>
                <div className="md:text-right flex-shrink-0">
                  <span className="block font-display font-bold text-lg text-slate-900">{sale.price}</span>
                  <span className="text-[10px] uppercase font-mono text-slate-500 tracking-wider">Sold: {sale.soldDate}</span>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No comparable sales found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
