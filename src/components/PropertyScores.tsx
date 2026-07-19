import { BuyerGoal, PropertyAnalysis } from '../types';
import { ShieldCheck, Info, Sparkles, AlertTriangle } from 'lucide-react';

interface PropertyScoresProps {
  analysis: PropertyAnalysis;
  buyerGoal?: BuyerGoal;
}

export default function PropertyScores({ analysis, buyerGoal }: PropertyScoresProps) {
  const { scores, summary, buyingSuitability } = analysis;
  const showInvestment = buyerGoal === 'Buy-to-Let Investor';

  const getProgressBarColor = (score: number) => {
    if (score >= 85) return 'bg-brand-green';
    if (score >= 70) return 'bg-brand-navy-mid';
    if (score >= 55) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  const getRingClass = (score: number) => {
    if (score >= 75) return 'score-ring-good';
    if (score >= 55) return 'score-ring-mid';
    return 'score-ring-low';
  };

  const subScores = [
    { label: 'Value for Money', value: scores.valueForMoney, tooltip: 'Price vs local comparables and postcode averages.' },
    { label: 'Location & Lifestyle', value: scores.locationRating, tooltip: 'Transit, schools, amenities, and neighbourhood feel.' },
    { label: 'Condition & Repairs', value: scores.conditionRating, tooltip: 'Structural readiness and likely upfront works.' },
    ...(showInvestment
      ? [
          { label: 'Investment Score', value: scores.investmentScore || 0, tooltip: 'Yield, cashflow, and investment strength.' },
          { label: 'Market Demand', value: scores.marketScore || 0, tooltip: 'Supply/demand balance and time on market.' },
          { label: 'Rentability', value: scores.rentalScore || 0, tooltip: 'Tenant demand and void risk.' },
        ]
      : [
          { label: 'Market Demand', value: scores.marketScore || 0, tooltip: 'Supply/demand balance and time on market.' },
        ]),
  ];

  const strokeDash = 2 * Math.PI * 45;
  const offset = strokeDash - (scores.overall / 100) * strokeDash;

  return (
    <div className="space-y-6">
      <div className="brand-card p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
        <div className="md:col-span-4 flex flex-col items-center justify-center text-center p-3 md:border-r border-brand-line md:pr-6">
          <div className="relative w-36 h-36 flex items-center justify-center">
            <svg className="absolute w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="transparent" stroke="#e8eef5" strokeWidth="7" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="transparent"
                strokeWidth="7"
                strokeDasharray={strokeDash}
                strokeDashoffset={offset}
                strokeLinecap="round"
                className={`transition-all duration-1000 ease-out ${getRingClass(scores.overall)}`}
              />
            </svg>
            <div className="flex flex-col items-center">
              <span className="font-display font-bold text-4xl text-brand-navy tracking-tight">{scores.overall}</span>
              <span className="font-semibold text-[10px] uppercase text-brand-muted tracking-wider">Suitability</span>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-navy-soft text-brand-navy border border-brand-line">
              <Sparkles className="w-3 h-3 text-brand-green" /> Growth: {scores.growthPotential}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-green-soft text-brand-green border border-brand-line">
              <ShieldCheck className="w-3 h-3" /> Risk: {scores.riskLevel}
            </span>
          </div>
        </div>

        <div className="md:col-span-8 space-y-4">
          <div>
            <h3 className="font-display font-bold text-sm text-brand-navy mb-2">Analyst verdict</h3>
            <p className="text-sm text-brand-muted leading-relaxed">{summary}</p>
          </div>
          <div className="rounded-xl bg-brand-green-soft border border-brand-line p-4">
            <p className="text-[10px] uppercase tracking-wider font-bold text-brand-green mb-1 flex items-center gap-1">
              <Info className="w-3.5 h-3.5" /> Buying suitability
            </p>
            <p className="text-sm text-brand-navy leading-relaxed">{buyingSuitability}</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {subScores.map((item) => (
              <div key={item.label} className="space-y-1.5" title={item.tooltip}>
                <div className="flex justify-between text-[11px]">
                  <span className="font-semibold text-brand-muted uppercase tracking-wide">{item.label}</span>
                  <span className="font-bold text-brand-navy tabular-nums">{item.value}</span>
                </div>
                <div className="h-2 rounded-full bg-brand-navy-soft overflow-hidden">
                  <div className={`h-full rounded-full ${getProgressBarColor(item.value)}`} style={{ width: `${item.value}%` }} />
                </div>
              </div>
            ))}
          </div>
          {scores.confidenceScore < 60 && (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              Confidence is {scores.confidenceScore}% — treat figures as directional and verify with primary sources.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
