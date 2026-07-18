import { PropertyAnalysis } from '../types';
import { ShieldCheck, Info, Sparkles, AlertTriangle } from 'lucide-react';

interface PropertyScoresProps {
  analysis: PropertyAnalysis;
}

export default function PropertyScores({ analysis }: PropertyScoresProps) {
  const { scores, summary, buyingSuitability } = analysis;

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-700 bg-emerald-50 stroke-emerald-500 border-emerald-200';
    if (score >= 70) return 'text-sky-700 bg-sky-50 stroke-sky-500 border-sky-200';
    if (score >= 55) return 'text-amber-700 bg-amber-50 stroke-amber-500 border-amber-200';
    return 'text-rose-700 bg-rose-50 stroke-rose-500 border-rose-200';
  };

  const getProgressBarColor = (score: number) => {
    if (score >= 85) return 'bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.3)]';
    if (score >= 70) return 'bg-gradient-to-r from-sky-500 to-sky-400 shadow-[0_0_8px_rgba(56,189,248,0.3)]';
    if (score >= 55) return 'bg-gradient-to-r from-amber-500 to-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.3)]';
    return 'bg-gradient-to-r from-rose-600 to-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.3)]';
  };

  // Convert scores to list for cleaner rendering
  const subScores = [
    { label: 'Value for Money', value: scores.valueForMoney, tooltip: 'Evaluates the property price per square meter relative to historical postcode averages.' },
    { label: 'Location & Lifestyle', value: scores.locationRating, tooltip: 'Measures neighborhood transit options, Ofsted school grades, noise levels, and criminal safety feel.' },
    { label: 'Condition & Repairs', value: scores.conditionRating, tooltip: 'Estimates the structural readiness and upfront work budget needed for this building type.' },
    { label: 'Investment Score', value: scores.investmentScore || 0, tooltip: 'Pure financial investment strength, yield capability, and cashflow.' },
    { label: 'Market Demand', value: scores.marketScore || 0, tooltip: 'Overall area market health, supply/demand balance, and time on market.' },
    { label: 'Rentability', value: scores.rentalScore || 0, tooltip: 'Tenant demand, typical void periods, and short-term let viability.' },
  ];

  // Draw circular SVG gauge for overall score
  const strokeDash = 2 * Math.PI * 45; // r=45
  const offset = strokeDash - (scores.overall / 100) * strokeDash;

  return (
    <div className="space-y-6">
      {/* Top dashboard summary summary */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        
        {/* Overall Circular Gauge */}
        <div className="md:col-span-4 flex flex-col items-center justify-center text-center p-3 border-r border-slate-100 md:pr-6">
          <div className="relative w-36 h-36 flex items-center justify-center">
            {/* Background Circle */}
            <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="transparent"
                stroke="#f1f5f9"
                strokeWidth="7"
              />
              {/* Foreground Animated Circle */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="transparent"
                strokeWidth="7"
                strokeDasharray={strokeDash}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className={`transition-all duration-1000 ease-out ${getScoreColor(scores.overall)}`}
              />
            </svg>
            
            <div className="flex flex-col items-center">
              <span className="font-display font-bold text-4xl text-slate-900 tracking-tight">
                {scores.overall}
              </span>
              <span className="font-sans font-semibold text-[10px] uppercase text-slate-400 tracking-wider">
                Suitability
              </span>
            </div>
          </div>
          
          <div className="mt-3 flex items-center gap-1">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-slate-600 font-medium">Independent Grade</span>
          </div>
          {scores.confidenceScore && (
            <div className="mt-1 flex items-center gap-1">
              <span className="text-[10px] text-slate-400 font-medium">Confidence: {scores.confidenceScore}%</span>
            </div>
          )}
        </div>

        {/* AI Quick Verdict & Summary */}
        <div className="md:col-span-8 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <h3 className="font-display font-bold text-sm text-slate-800">Executive Advisor Verdict</h3>
            </div>
            
            {/* Summary */}
            <p className="text-slate-600 text-sm leading-relaxed mb-4">
              {summary}
            </p>

            {/* Suitability Custom alert */}
            <div className={`p-4 rounded-xl border flex gap-3 ${
              scores.overall >= 75 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : scores.overall >= 60
                ? 'bg-amber-50 border-amber-200 text-amber-800'
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              <div className="mt-0.5">
                {scores.overall >= 60 ? (
                  <Sparkles className="w-4.5 h-4.5 text-amber-500 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-4.5 h-4.5 text-rose-500 flex-shrink-0" />
                )}
              </div>
              <div className="text-xs">
                <span className="font-bold underline uppercase block mb-1">Tailored Profile Fit Check:</span>
                <p className="leading-relaxed font-sans">{buyingSuitability}</p>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Sub-Metrics Progress Bars */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <h4 className="font-display font-bold text-sm text-slate-900 mb-6 flex items-center gap-2">
          <Info className="w-4 h-4 text-blue-600" />
          Detailed Valuation & Decision Drivers
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {subScores.map((score, idx) => (
            <div key={idx} className="space-y-2 group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-sans font-semibold text-xs text-slate-700">
                    {score.label}
                  </span>
                </div>
                <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded border ${getScoreColor(score.value)}`}>
                  {score.value}/100
                </span>
              </div>
              
              {/* Progress track */}
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ease-out ${getProgressBarColor(score.value)}`}
                  style={{ width: `${score.value}%` }}
                />
              </div>

              {/* Tooltip hint */}
              <p className="text-[10px] text-slate-500 leading-normal font-sans opacity-80 group-hover:opacity-100 transition-opacity">
                {score.tooltip}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
