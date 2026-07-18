import React from 'react';
import { PropertyAnalysis } from '../types';
import { ShieldAlert, AlertTriangle, FileWarning, Waves, Flame, Building, Droplets } from 'lucide-react';

interface RisksAndIntelligenceProps {
  analysis: PropertyAnalysis;
}

export function RisksAndIntelligence({ analysis }: RisksAndIntelligenceProps) {
  const { riskAnalysis, areaAnalysis } = analysis;

  if (!riskAnalysis) {
    return <div className="text-slate-500 text-sm p-4">Risk data not available.</div>;
  }

  const getRiskColorClass = (riskLevel: string) => {
    const level = (riskLevel || '').toLowerCase();
    if (level.includes('low')) return 'bg-emerald-50 border-emerald-200 text-emerald-900';
    if (level.includes('medium')) return 'bg-amber-50 border-amber-200 text-amber-900';
    if (level.includes('high')) return 'bg-rose-50 border-rose-200 text-rose-900';
    return 'bg-slate-50 border-slate-200 text-slate-900';
  };

  const getRiskIconColorClass = (riskLevel: string) => {
    const level = (riskLevel || '').toLowerCase();
    if (level.includes('low')) return 'text-emerald-600';
    if (level.includes('medium')) return 'text-amber-600';
    if (level.includes('high')) return 'text-rose-600';
    return 'text-slate-600';
  };

  const getRiskTextColorClass = (riskLevel: string) => {
    const level = (riskLevel || '').toLowerCase();
    if (level.includes('low')) return 'text-emerald-800';
    if (level.includes('medium')) return 'text-amber-800';
    if (level.includes('high')) return 'text-rose-800';
    return 'text-slate-800';
  };

  const riskLevelStr = analysis.scores.riskLevel || 'Unknown';

  return (
    <div className="space-y-6">
      <div className={`border p-5 rounded-2xl flex items-start gap-4 ${getRiskColorClass(riskLevelStr)}`}>
        <div className="bg-white p-2 rounded-full shadow-sm flex-shrink-0">
          <ShieldAlert className={`w-6 h-6 ${getRiskIconColorClass(riskLevelStr)}`} />
        </div>
        <div>
          <h4 className="font-display font-semibold text-sm mb-1">Overall Risk Level: {riskLevelStr}</h4>
          <p className={`text-xs leading-relaxed ${getRiskTextColorClass(riskLevelStr)}`}>
            This risk level is calculated by assessing environmental factors, structural age, leasehold complexity, and local area crime statistics.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h4 className="font-display font-semibold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Environmental & Structural Risks
          </h4>
          <div className="space-y-4 pt-2">
            <div className="flex gap-3">
              <Waves className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="block text-xs font-semibold text-slate-800 mb-0.5">Flood Risk</span>
                <p className="text-xs text-slate-600 leading-relaxed">{riskAnalysis.floodRisk}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Droplets className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <span className="block text-xs font-semibold text-slate-800 mb-0.5">Subsidence & Soil Risk</span>
                <p className="text-xs text-slate-600 leading-relaxed">{riskAnalysis.subsidence}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Flame className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="block text-xs font-semibold text-slate-800 mb-0.5">Fire Safety / Cladding</span>
                <p className="text-xs text-slate-600 leading-relaxed">{riskAnalysis.fireSafety}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h4 className="font-display font-semibold text-sm text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-3">
            <FileWarning className="w-5 h-5 text-indigo-600" />
            Legal, Planning & Area Risks
          </h4>
          <div className="space-y-4 pt-2">
            <div className="flex gap-3">
              <Building className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="block text-xs font-semibold text-slate-800 mb-0.5">Leasehold & Service Charges</span>
                <p className="text-xs text-slate-600 leading-relaxed">{riskAnalysis.leaseholdIssues}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="block text-xs font-semibold text-slate-800 mb-0.5">Disruptive Planning Developments</span>
                <p className="text-xs text-slate-600 leading-relaxed">{riskAnalysis.planningDevelopments}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <ShieldAlert className="w-5 h-5 text-slate-500 flex-shrink-0 mt-0.5" />
              <div>
                <span className="block text-xs font-semibold text-slate-800 mb-0.5">Crime & Safety Rating</span>
                <p className="text-xs text-slate-600 leading-relaxed">
                  <strong>{areaAnalysis.crimeSafety.rating}</strong> - {areaAnalysis.crimeSafety.description}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h4 className="text-sm font-semibold text-slate-800 mb-1">Insurance Implications</h4>
        <p className="text-sm text-slate-600">{riskAnalysis.insuranceRisk}</p>
      </div>
    </div>
  );
}
