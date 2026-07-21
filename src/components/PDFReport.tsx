import React from 'react';
import { BuyerGoal, PropertyAnalysis } from '../types';

interface PDFReportProps {
  analysis: PropertyAnalysis;
  generatedAt?: string;
  buyerGoal?: BuyerGoal;
}

function isInvestorGoal(goal?: BuyerGoal) {
  return goal === 'Buy-to-Let Investor';
}

function cleanField(value?: string): string {
  if (!value) return '';
  const cleaned = value
    .replace(/\bunknown\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,;:.\-/]+|[\s,;:.\-/]+$/g, '')
    .trim();
  if (!cleaned || /^n\/?a$/i.test(cleaned) || /^—$/.test(cleaned)) return '';
  return cleaned;
}

const NAVY = '#0b1f3a';
const GREEN = '#1f7a45';
const GREEN_SOFT = '#e8f5ee';
const NAVY_SOFT = '#e8eef5';
const LINE = '#d5dde7';
const MUTED = '#5b6b7c';
const LOGO = '/checkthishouselogo.png';

function parseMoney(raw?: string): number | null {
  if (!raw) return null;
  // Prefer first £x,xxx group to avoid "£285,000 - £295,000" becoming one huge number
  const pound = raw.match(/£\s*([\d,]+(?:\.\d+)?)/);
  if (pound) {
    const n = parseFloat(pound[1].replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const pct = raw.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (pct) return null; // percentage handled separately
  const digits = raw.replace(/[^0-9.]/g, '');
  if (!digits) return null;
  const n = parseFloat(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePercent(raw?: string): number | null {
  if (!raw) return null;
  const m = raw.match(/(-?\d+(?:\.\d+)?)\s*%/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : null;
}

function formatGbp(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1_000_000) return `£${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 2)}m`;
  if (n >= 10_000) return `£${Math.round(n / 1000)}k`;
  if (n >= 1000) return `£${(n / 1000).toFixed(1)}k`;
  return `£${Math.round(n)}`;
}

function scoreColor(score: number) {
  if (score >= 75) return GREEN;
  if (score >= 55) return '#c9891a';
  return '#c23b4e';
}

type RiskToneName = 'positive' | 'caution' | 'negative' | 'neutral';

function toneStyle(tone: RiskToneName) {
  if (tone === 'positive') return { bg: GREEN_SOFT, border: '#b8dfc8', fg: GREEN };
  if (tone === 'negative') return { bg: '#fff1f2', border: '#fecdd3', fg: '#be123c' };
  if (tone === 'caution') return { bg: '#fff8eb', border: '#f5d78e', fg: '#9a6b10' };
  return { bg: '#f8fafc', border: LINE, fg: NAVY };
}

/**
 * Colour risk cards from explicit AI tones when present, else infer from wording.
 * Planning/works that add value (extensions, granted apps) must read green — not grey.
 */
function riskStyle(
  text: string = '',
  kind: 'general' | 'planning' = 'general',
  tone?: RiskToneName | string | null
) {
  if (tone === 'positive' || tone === 'caution' || tone === 'negative' || tone === 'neutral') {
    // Still allow heuristic override when tone is wrongly "neutral" but text is clearly positive planning upside
    if (tone !== 'neutral' || kind !== 'planning') {
      return toneStyle(tone);
    }
  }

  const t = text.toLowerCase();

  if (kind === 'planning') {
    const upside =
      /\b(extension|loft|conservatory|outbuilding|garage\s+conversion|approved|granted|permitted|permission|adds?\s+value|valuation\s+premium|completed\s+works|improved|larger|benefit|positive|good|boost|enhance|upgrade|regeneration|investment|opportunity|welcome|masterplan|amenit|growth|building\s+control|dpp|full\s+planning|rear\s+extension|side\s+extension|supports?\s+(a\s+)?(higher|stronger|premium)|value[-\s]?adding)\b/.test(
        t
      ) ||
      /\b(none\s+found|no\s+(known|major)\s+(adverse|negative|issues?)|no\s+adverse)\b/.test(t);
    const downside =
      /\b(disrupt|overshadow|industrial|quarry|landfill|incinerat|motorway|flyover|objection|blight|compulsory|pollut|congest|demolit|high[-\s]?rise\s+next|noise\s+nuisance|flood\s+risk|refused|enforcement|unauthorised|non[-\s]?compliant|illegal)\b/.test(
        t
      );
    if (upside && !downside) return toneStyle('positive');
    if (downside && !upside) return toneStyle('negative');
    if (upside && downside) return toneStyle('caution');
    if (/\b(none|no\s+(known|major|significant)|low|clear|quiet)\b/.test(t)) {
      return toneStyle('positive');
    }
    return toneStyle('neutral');
  }

  const positive =
    /\b(low|minimal|negligible|none|no\s+(known\s+)?(concerns?|issues?|problems?)|not\s+a\s+concern|good|excellent|satisfactory|acceptable|compliant|clear|safe|sound|standard|typical|unremarkable|easily\s+insurable|standard\s+insurance|freehold|no\s+leasehold|no\s+flood|very\s+low)\b/.test(
      t
    ) ||
    /\bno\s+(high|elevated|significant|major)\b/.test(t) ||
    /\b(not|isn't|is not)\s+(high|elevated|severe)\b/.test(t);

  const negative =
    /\b(unsafe|non[-\s]?compliant|cladding\s+risk|severe|critical|serious\s+(risk|concern|issue|problem)|elevated\s+risk|high\s+risk|significant\s+(risk|concern|issue|problem|defect)|major\s+(risk|concern|issue|problem|defect)|hard\s+to\s+insure|uninsurable|short\s+lease|ground\s+rent\s+(doubl|escalat))\b/.test(
      t
    ) ||
    (/\bflood\s+risk\b/.test(t) && !/\b(no|low|minimal|negligible|very\s+low)\b/.test(t)) ||
    (/\b(high|elevated)\b/.test(t) &&
      /\b(risk|concern|danger|hazard|threat|likelihood)\b/.test(t) &&
      !/\b(highlight|highway|high\s+street)\b/.test(t));

  const medium = /\b(medium|moderate|mixed|some\s+concern|caution|average|watch|investigate|verify|confirm)\b/.test(t);

  if (positive && !negative) return toneStyle('positive');
  if (negative && !positive) return toneStyle('negative');
  if (medium || (positive && negative)) return toneStyle('caution');
  if (positive) return toneStyle('positive');
  return toneStyle('neutral');
}

function ScoreDial({ score }: { score: number }) {
  const s = Math.min(100, Math.max(0, Math.round(score || 0)));
  const color = scoreColor(s);
  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 78;
  const stroke = 14;
  const circ = 2 * Math.PI * r;
  const progress = (s / 100) * circ;

  return (
    <div className="flex flex-col items-center justify-center h-full">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circ - progress}`}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        <circle cx={cx} cy={cy} r={r - 28} fill="#f8fafc" />
        <text
          x={cx}
          y={cy - 6}
          textAnchor="middle"
          fontSize={48}
          fontWeight={700}
          fill={NAVY}
          fontFamily="Outfit, sans-serif"
        >
          {s}
        </text>
        <text
          x={cx}
          y={cy + 22}
          textAnchor="middle"
          fontSize={12}
          fill={MUTED}
          fontFamily="Manrope, sans-serif"
          letterSpacing="0.12em"
        >
          OVERALL / 100
        </text>
      </svg>
      <p className="text-[12px] mt-1 text-center max-w-[280px]" style={{ color: MUTED }}>
        Property score at a glance — higher means a stronger overall purchase picture.
      </p>
    </div>
  );
}

/** Pure SVG line chart — reliable under html-to-image (unlike Recharts axes) */
function AppreciationChart({
  points,
}: {
  points: { label: string; value: number }[];
}) {
  const w = 720;
  const h = 168;
  const padL = 48;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const vals = points.map((p) => p.value).filter((v) => Number.isFinite(v) && v > 0);
  if (vals.length < 2) {
    return <p className="text-[11px] text-slate-500 py-6 text-center">Insufficient forecast data to plot.</p>;
  }
  const min = Math.min(...vals) * 0.96;
  const max = Math.max(...vals) * 1.04;
  const span = Math.max(max - min, 1);
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;

  const coords = points.map((p, i) => {
    const x = padL + (i / Math.max(points.length - 1, 1)) * innerW;
    const y = padT + innerH - ((p.value - min) / span) * innerH;
    return { ...p, x, y };
  });

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' ');
  const area =
    `${path} L ${coords[coords.length - 1].x.toFixed(1)} ${(padT + innerH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  const ticks = 4;
  const yTicks = Array.from({ length: ticks + 1 }, (_, i) => min + (span * i) / ticks);

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block">
      {yTicks.map((t, i) => {
        const y = padT + innerH - ((t - min) / span) * innerH;
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#eef2f6" strokeWidth={1} />
            <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9} fill={MUTED} fontFamily="Manrope, sans-serif">
              {formatGbp(t)}
            </text>
          </g>
        );
      })}
      <path d={area} fill={GREEN} fillOpacity={0.12} />
      <path d={path} fill="none" stroke={GREEN} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {coords.map((c, i) => (
        <g key={i}>
          <circle cx={c.x} cy={c.y} r={3.5} fill={NAVY} />
          <text x={c.x} y={h - 8} textAnchor="middle" fontSize={9} fill={MUTED} fontFamily="Manrope, sans-serif">
            {c.label}
          </text>
          <text x={c.x} y={c.y - 8} textAnchor="middle" fontSize={8} fill={NAVY} fontWeight={700} fontFamily="Manrope, sans-serif">
            {formatGbp(c.value)}
          </text>
        </g>
      ))}
    </svg>
  );
}

function ScoreBars({ items }: { items: { label: string; value: number }[] }) {
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2.5">
          <span className="w-[92px] text-[10px] font-semibold uppercase tracking-wide text-slate-600 shrink-0 truncate">
            {item.label}
          </span>
          <div className="flex-1 h-[12px] rounded-sm bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-sm"
              style={{
                width: `${Math.min(100, Math.max(0, item.value || 0))}%`,
                backgroundColor: scoreColor(item.value || 0),
              }}
            />
          </div>
          <span className="w-7 text-right text-[12px] font-bold tabular-nums" style={{ color: NAVY }}>
            {Math.round(item.value || 0)}
          </span>
        </div>
      ))}
    </div>
  );
}

function PageShell({
  page,
  total,
  address,
  children,
  cover,
  fitContent,
}: {
  page: number;
  total: number;
  address: string;
  children: React.ReactNode;
  cover?: boolean;
  fitContent?: boolean;
}) {
  return (
    <div
      className="pdf-page bg-white w-[794px] h-[1123px] box-border flex flex-col relative overflow-hidden"
      style={{ fontFamily: 'Manrope, sans-serif', color: NAVY }}
    >
      {!cover && (
        <div className="px-7 pt-4 pb-2.5 flex items-center justify-between border-b-2 shrink-0" style={{ borderColor: NAVY }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <img src={LOGO} alt="" className="h-8 w-auto object-contain shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold tracking-[0.14em] uppercase" style={{ color: NAVY }}>
                Full Property Intelligence Report
              </p>
              <p className="text-[10px] truncate max-w-[460px]" style={{ color: MUTED }}>
                {address}
              </p>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-[9px] font-mono uppercase tracking-wider" style={{ color: MUTED }}>
              Paid report
            </p>
            <p className="text-[11px] font-bold tabular-nums" style={{ color: NAVY }}>
              {page}/{total}
            </p>
          </div>
        </div>
      )}
      <div
        className={`flex-1 min-h-0 overflow-hidden ${cover ? '' : 'px-7 py-4'} ${
          fitContent ? 'pdf-page-fit-area' : ''
        }`}
      >
        {fitContent ? <div className="pdf-page-fit-content">{children}</div> : children}
      </div>
      {!cover && (
        <div
          className="px-7 py-2 border-t flex items-center justify-between text-[9px] shrink-0"
          style={{ borderColor: LINE, color: MUTED }}
        >
          <span>CheckThisHouse · Advisory only · Confirm with survey, solicitor & lender</span>
          <span className="font-mono">checkthishouse.co.uk</span>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="text-[15px] font-bold uppercase tracking-[0.04em] leading-snug mb-3.5 pb-2 border-b-2 break-words"
      style={{ color: NAVY, borderColor: GREEN, fontFamily: 'Outfit, sans-serif' }}
    >
      {children}
    </h2>
  );
}

function SubHead({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="text-[11px] font-bold uppercase tracking-[0.06em] leading-snug mb-2 break-words"
      style={{ color: MUTED }}
    >
      {children}
    </h3>
  );
}

function ProConCard({
  item,
  tone,
}: {
  item: { title?: string; desc?: string; category?: string };
  tone: 'pro' | 'con';
}) {
  const isPro = tone === 'pro';
  return (
    <div
      className="rounded border px-2 py-1.5 break-words"
      style={
        isPro
          ? { borderColor: '#b8dfc8', background: GREEN_SOFT }
          : { borderColor: '#fecdd3', background: '#fff1f2' }
      }
    >
      <p
        className="text-[7.5px] uppercase font-bold leading-none mb-0.5"
        style={{ color: isPro ? GREEN : '#be123c' }}
      >
        {item.category || (isPro ? 'Strength' : 'Watch-out')}
      </p>
      <p className="text-[10px] font-bold leading-snug" style={{ color: NAVY }}>
        {item.title}
      </p>
      <p className="text-[9.5px] leading-snug mt-0.5" style={{ color: '#334155' }}>
        {item.desc}
      </p>
    </div>
  );
}

function KV({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex gap-2 text-[11px] leading-snug border-b border-slate-100 py-1.5">
      <span className="w-[118px] shrink-0 font-semibold" style={{ color: MUTED }}>
        {label}
      </span>
      <span className="flex-1 font-medium" style={{ color: NAVY }}>
        {value || 'N/A'}
      </span>
    </div>
  );
}

export function PDFReport({ analysis, generatedAt, buyerGoal }: PDFReportProps) {
  const {
    title,
    price,
    bedrooms,
    bathrooms,
    propertyType,
    location,
    summary,
    scores,
    valuation,
    investmentMetrics,
    marketAndRental,
    riskAnalysis,
    riskTones,
    offerStrategy,
    comparableSales,
    soldHistory,
    locationIntelligence,
    advanced,
    propertyWorks,
    dueDiligence,
    marketEvidence,
    specs,
    pros,
    cons,
    areaAnalysis,
    viewingChecks,
    agentQuestions,
    buyingSuitability,
  } = analysis;

  const showInvestment = isInvestorGoal(buyerGoal);

  const addressLine = [location?.address, location?.town, location?.postcode]
    .filter((p) => typeof p === 'string' && !!p.trim())
    .join(', ');

  const reportDate =
    generatedAt ||
    new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const basePrice = parseMoney(price) || parseMoney(valuation?.fair) || 300000;

  const forecastPoint = (raw: string | undefined, years: number) => {
    const asMoney = parseMoney(raw);
    if (asMoney && asMoney > 1000) return asMoney;
    const pct = parsePercent(raw);
    if (pct != null) return basePrice * (1 + pct / 100);
    const bare = parseFloat((raw || '').replace(/[^0-9.-]/g, ''));
    if (Number.isFinite(bare) && Math.abs(bare) <= 80) {
      return basePrice * (1 + bare / 100);
    }
    return basePrice * Math.pow(1.02, years);
  };

  const chartPoints = [
    { label: 'Now', value: basePrice },
    { label: '1yr', value: forecastPoint(valuation?.forecast1y, 1) },
    { label: '3yr', value: forecastPoint(valuation?.forecast3y, 3) },
    { label: '5yr', value: forecastPoint(valuation?.forecast5y, 5) },
    { label: '10yr', value: forecastPoint(valuation?.forecast10y, 10) },
  ].map((p) => ({
    ...p,
    value: Number.isFinite(p.value) && p.value > 0 ? p.value : basePrice,
  }));

  const scoreItems = [
    { label: 'Value', value: scores?.valueForMoney ?? 0 },
    { label: 'Location', value: scores?.locationRating ?? 0 },
    { label: 'Condition', value: scores?.conditionRating ?? 0 },
    ...(showInvestment
      ? [
          { label: 'Invest', value: scores?.investmentScore ?? 0 },
          { label: 'Market', value: scores?.marketScore ?? 0 },
          { label: 'Rental', value: scores?.rentalScore ?? 0 },
        ]
      : [{ label: 'Market', value: scores?.marketScore ?? 0 }]),
  ];

  const planningRiskText = [
    riskAnalysis?.planningDevelopments,
    propertyWorks?.extensionsAndAlterations,
    propertyWorks?.valueImpact,
  ]
    .filter(Boolean)
    .join(' ');

  const riskRows: {
    label: string;
    value?: string;
    kind: 'general' | 'planning';
    toneKey: keyof NonNullable<typeof riskTones>;
  }[] = [
    { label: 'Flood', value: riskAnalysis?.floodRisk, kind: 'general', toneKey: 'floodRisk' },
    { label: 'Subsidence', value: riskAnalysis?.subsidence, kind: 'general', toneKey: 'subsidence' },
    {
      label: 'Planning & works',
      value: riskAnalysis?.planningDevelopments,
      kind: 'planning',
      toneKey: 'planningDevelopments',
    },
    {
      label: 'Leasehold',
      value: riskAnalysis?.leaseholdIssues,
      kind: 'general',
      toneKey: 'leaseholdIssues',
    },
    { label: 'Fire safety', value: riskAnalysis?.fireSafety, kind: 'general', toneKey: 'fireSafety' },
    {
      label: 'Insurance',
      value: riskAnalysis?.insuranceRisk,
      kind: 'general',
      toneKey: 'insuranceRisk',
    },
  ];

  const comps = (comparableSales || [])
    .map((sale) => ({
      address: cleanField(sale.address),
      price: cleanField(sale.price),
      soldDate: cleanField(sale.soldDate),
      similarity: cleanField(sale.similarity),
    }))
    .filter((sale) => sale.address || sale.price)
    .slice(0, 10);

  const history = (soldHistory || [])
    .map((h) => ({
      year: cleanField(h.year),
      price: cleanField(h.price),
      source: cleanField(h.source),
      description: cleanField(h.description),
    }))
    .filter((h) => h.year || h.price)
    .slice(0, 10);

  const prosList = (pros || []).slice(0, 8);
  const consList = (cons || []).slice(0, 8);
  const nextSteps = dueDiligence?.recommendedNextSteps?.filter(Boolean).slice(0, 10) || [];

  // 1 cover + summary + pros + valuation + [investor] + risks + area + diligence + comps + offer
  const TOTAL = showInvestment ? 10 : 9;
  const pageValuation = 4;
  const pageInvest = 5;
  const pageRisk = showInvestment ? 6 : 5;
  const pageArea = showInvestment ? 7 : 6;
  const pageDiligence = showInvestment ? 8 : 7;
  const pageComps = showInvestment ? 9 : 8;
  const pageOffer = showInvestment ? 10 : 9;
  const overall = scores?.overall ?? 0;

  return (
    <div
      id="pdf-report-container"
      style={{ position: 'fixed', top: '200%', left: '-9999px' }}
      className="w-[794px] opacity-0 pointer-events-none"
      aria-hidden
    >
      {/* ========== 1 COVER ========== */}
      <PageShell page={1} total={TOTAL} address={addressLine} cover>
        <div className="h-full flex flex-col bg-white">
          <div className="px-8 pt-7 flex items-start justify-between shrink-0">
            <img src={LOGO} alt="CheckThisHouse" className="h-14 w-auto object-contain" />
            <div className="text-right text-[10px] font-mono pt-1" style={{ color: MUTED }}>
              <p>{reportDate}</p>
              <p className="mt-1 uppercase tracking-wider" style={{ color: '#94a3b8' }}>
                Confidential buyer report
              </p>
            </div>
          </div>

          <div className="px-8 pt-7 pb-4 shrink-0" style={{ color: NAVY }}>
            <p className="text-[10px] uppercase tracking-[0.28em] mb-2.5" style={{ color: GREEN }}>
              Full property report
            </p>
            <h1 className="text-[30px] font-bold leading-[1.12] mb-2.5" style={{ fontFamily: 'Outfit, sans-serif' }}>
              {title || 'Property Intelligence Report'}
            </h1>
            <p className="text-[14px] leading-relaxed mb-4 max-w-[640px]" style={{ color: '#475569' }}>
              {addressLine}
            </p>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                ['Asking price', price],
                ['Overall score', `${overall}/100`],
                ['Risk level', scores?.riskLevel || '—'],
                ['Confidence', `${scores?.confidenceScore ?? '—'}%`],
              ].map(([l, v]) => (
                <div
                  key={l}
                  className="rounded-lg px-3 py-2"
                  style={{ background: '#f8fafc', border: `1px solid ${LINE}` }}
                >
                  <p className="text-[8px] uppercase tracking-wide" style={{ color: MUTED }}>
                    {l}
                  </p>
                  <p className="text-[14px] font-bold mt-0.5" style={{ color: NAVY }}>
                    {v}
                  </p>
                </div>
              ))}
            </div>

            <div
              className="grid grid-cols-5 gap-2 text-[11px] border-t pt-3"
              style={{ borderColor: LINE }}
            >
              {[
                ['Type', propertyType],
                ['Beds', bedrooms],
                ['Baths', bathrooms],
                ['Town', location?.town],
                ['Postcode', location?.postcode],
              ].map(([l, v]) => (
                <div key={l}>
                  <p className="text-[8px] uppercase tracking-wide" style={{ color: MUTED }}>
                    {l}
                  </p>
                  <p className="font-semibold truncate" style={{ color: NAVY }}>
                    {v || '—'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="px-8 flex-1 min-h-0 pb-3 flex flex-col items-center justify-center">
            <ScoreDial score={overall} />
          </div>

          <div
            className="px-8 py-3 text-[9px] border-t shrink-0"
            style={{ color: MUTED, borderColor: LINE }}
          >
            Prepared by CheckThisHouse for personal purchase decision support. Not a RICS survey or legal advice.
          </div>
        </div>
      </PageShell>

      {/* ========== 2 EXEC + SCORES ========== */}
      <PageShell page={2} total={TOTAL} address={addressLine}>
        <SectionTitle>1. Summary & scores</SectionTitle>
        <p className="text-[12px] leading-[1.55] mb-4" style={{ color: '#1e293b' }}>
          {summary}
        </p>

        <div className="grid grid-cols-[128px_1fr] gap-4 mb-4">
          <div
            className="rounded-xl border-2 flex flex-col items-center justify-center py-4"
            style={{ borderColor: scoreColor(overall), background: overall >= 75 ? GREEN_SOFT : overall >= 55 ? '#fff8eb' : '#fff1f2' }}
          >
            <p className="text-[36px] font-bold tabular-nums leading-none" style={{ color: scoreColor(overall) }}>
              {overall}
            </p>
            <p className="text-[9px] uppercase tracking-wider mt-1.5" style={{ color: MUTED }}>
              Overall / 100
            </p>
            <p className="text-[10px] font-bold mt-2.5" style={{ color: NAVY }}>
              Growth: {scores?.growthPotential}
            </p>
            <p className="text-[10px] font-bold" style={{ color: NAVY }}>
              Risk: {scores?.riskLevel}
            </p>
          </div>
          <div>
            <SubHead>Score breakdown</SubHead>
            <ScoreBars items={scoreItems} />
          </div>
        </div>

        <div className="rounded-lg border px-3.5 py-2.5 mb-4" style={{ borderColor: '#b8dfc8', background: GREEN_SOFT }}>
          <SubHead>Is it a good buy for you?</SubHead>
          <p className="text-[12px] leading-relaxed" style={{ color: NAVY }}>
            {buyingSuitability}
          </p>
        </div>

        {(specs?.length ?? 0) > 0 && (
          <div>
            <SubHead>Property details</SubHead>
            <div className="grid grid-cols-2 gap-x-4">
              {specs!.slice(0, 16).map((s, i) => (
                <React.Fragment key={i}>
                  <KV label={s.label} value={s.value} />
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </PageShell>

      {/* ========== 3 PROS & CONS (own page — prevents footer clipping) ========== */}
      <PageShell page={3} total={TOTAL} address={addressLine}>
        <SectionTitle>2. Pros & cons</SectionTitle>
          <p className="text-[11px] leading-relaxed mb-3" style={{ color: MUTED }}>
            Balanced strengths and watch-outs grounded in research for this buyer goal — use as talking points with your
            surveyor and solicitor.
          </p>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <SubHead>Pros</SubHead>
            <div className="space-y-1.5">
              {prosList.map((p, i) => (
                <React.Fragment key={i}>
                  <ProConCard item={p} tone="pro" />
                </React.Fragment>
              ))}
              {prosList.length === 0 && (
                <p className="text-[11px]" style={{ color: MUTED }}>
                  No pros returned for this run.
                </p>
              )}
            </div>
          </div>
          <div>
            <SubHead>Cons</SubHead>
            <div className="space-y-1.5">
              {consList.map((c, i) => (
                <React.Fragment key={i}>
                  <ProConCard item={c} tone="con" />
                </React.Fragment>
              ))}
              {consList.length === 0 && (
                <p className="text-[11px]" style={{ color: MUTED }}>
                  No cons returned for this run.
                </p>
              )}
            </div>
          </div>
        </div>
      </PageShell>

      {/* ========== 4 VALUATION ========== */}
      <PageShell page={pageValuation} total={TOTAL} address={addressLine} fitContent>
        <SectionTitle>3. What is it worth?</SectionTitle>

        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {[
            ['Conservative', valuation?.conservative, '#fff1f2', '#fecdd3', '#be123c'],
            ['Fair market', valuation?.fair, GREEN_SOFT, '#b8dfc8', GREEN],
            ['Optimistic', valuation?.optimistic, NAVY_SOFT, '#c5d4e8', NAVY],
          ].map(([label, value, bg, border, fg]) => (
            <div key={String(label)} className="rounded-lg border px-3 py-3 text-center" style={{ background: String(bg), borderColor: String(border) }}>
              <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: String(fg) }}>
                {label}
              </p>
              <p className="text-[19px] font-bold mt-1.5 tabular-nums" style={{ color: NAVY }}>
                {value || '—'}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border p-2.5 mb-3" style={{ borderColor: LINE }}>
          <div className="flex items-center justify-between mb-1.5 px-1">
            <SubHead>How value could change</SubHead>
            <p className="text-[9px]" style={{ color: MUTED }}>
              Base asking {formatGbp(basePrice)}
            </p>
          </div>
          <AppreciationChart points={chartPoints} />
        </div>

        <div className="grid grid-cols-4 gap-2.5 mb-4">
          {[
            ['1-year', chartPoints[1]?.value],
            ['3-year', chartPoints[2]?.value],
            ['5-year', chartPoints[3]?.value],
            ['10-year', chartPoints[4]?.value],
          ].map(([label, num]) => (
            <div key={String(label)} className="rounded border px-2.5 py-2.5" style={{ borderColor: LINE, background: '#fafbfc' }}>
              <p className="text-[9px] font-bold uppercase" style={{ color: MUTED }}>
                {label}
              </p>
              <p className="text-[13px] font-bold mt-0.5" style={{ color: NAVY }}>
                {formatGbp(num as number)}
              </p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3.5 mb-3.5">
          <div className="rounded-lg border p-3" style={{ borderColor: LINE, background: NAVY_SOFT }}>
            <SubHead>Is the asking price fair?</SubHead>
            <p className="text-[11px] leading-relaxed" style={{ color: NAVY }}>
              {advanced?.undervaluedExplanation || 'No additional pricing narrative provided.'}
            </p>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: '#b8dfc8', background: GREEN_SOFT }}>
            <SubHead>Renovation potential</SubHead>
            <p className="text-[11px] leading-relaxed mb-1.5" style={{ color: NAVY }}>
              <strong>ROI:</strong> {advanced?.renovationROI || 'N/A'}
            </p>
            <p className="text-[11px] leading-relaxed" style={{ color: NAVY }}>
              <strong>Opportunity:</strong> {advanced?.developmentOpportunity || 'N/A'}
            </p>
          </div>
        </div>

        <div className="rounded-lg border px-3.5 py-2.5 mb-3" style={{ borderColor: LINE, background: '#fafbfc' }}>
          <SubHead>Market evidence (from online research)</SubHead>
          <p className="text-[10px] leading-snug mb-1" style={{ color: '#1e293b' }}>
            <strong>Asking vs solds:</strong>{' '}
            {marketEvidence?.askingVsSoldEvidence || 'See sold comps later in this report.'}
          </p>
          <p className="text-[10px] leading-snug mb-1" style={{ color: '#1e293b' }}>
            <strong>Competing supply:</strong> {marketEvidence?.competingSupply || 'Check live portals on offer day.'}
          </p>
          <p className="text-[10px] leading-snug mb-1" style={{ color: '#1e293b' }}>
            <strong>£/sqft or £/sqm:</strong>{' '}
            {marketEvidence?.pricePerSqmOrSqft || 'Confirm floor area from EPC / measured survey.'}
          </p>
          <p className="text-[10px] leading-snug" style={{ color: '#1e293b' }}>
            <strong>Negotiation levers:</strong>{' '}
            {marketEvidence?.negotiationLevers || 'Use survey, chain and comps — not arbitrary lowballs.'}
          </p>
        </div>

        <div className="rounded-lg border px-3.5 py-3" style={{ borderColor: '#c5d4e8', background: '#f4f7fb' }}>
          <SubHead>Extensions, planning & works</SubHead>
          <p className="text-[11px] leading-relaxed mb-2" style={{ color: '#1e293b' }}>
            <strong>Works found:</strong>{' '}
            {propertyWorks?.extensionsAndAlterations ||
              'No dedicated works summary — check planning notes in Risks.'}
          </p>
          <p className="text-[11px] leading-relaxed mb-2" style={{ color: '#1e293b' }}>
            <strong>Planning applications:</strong>{' '}
            {propertyWorks?.planningApplications || 'Not summarised in this report.'}
          </p>
          <p className="text-[11px] leading-relaxed mb-2" style={{ color: '#1e293b' }}>
            <strong>Impact on value & forecasts:</strong>{' '}
            {propertyWorks?.valueImpact ||
              'Confirm any extensions with the agent, planning portal and survey before relying on value bands.'}
          </p>
          <p className="text-[10px] leading-relaxed" style={{ color: MUTED }}>
            <strong>Certainty:</strong> {propertyWorks?.certainty || 'Verify on the local council planning portal.'}
          </p>
        </div>
      </PageShell>

      {/* ========== FINANCIALS (investors only) ========== */}
      {showInvestment && (
      <PageShell page={pageInvest} total={TOTAL} address={addressLine}>
        <SectionTitle>4. Rental & investment numbers</SectionTitle>

        <div className="grid grid-cols-3 gap-2.5 mb-4">
          {[
            ['Est. monthly rent', investmentMetrics?.estimatedRent],
            ['Gross yield', investmentMetrics?.grossYield],
            ['Net yield', investmentMetrics?.netYield],
            ['Cashflow', investmentMetrics?.cashflow],
            ['ROI', investmentMetrics?.roi],
            ['IRR', investmentMetrics?.irr],
            ['Stamp duty (est.)', investmentMetrics?.stampDuty],
            ['Break-even', investmentMetrics?.breakEven],
            ['Vacancy rates', marketAndRental?.vacancyRates],
          ].map(([l, v]) => (
            <div key={String(l)} className="rounded border px-3 py-2.5" style={{ borderColor: LINE }}>
              <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: MUTED }}>
                {l}
              </p>
              <p className="text-[14px] font-bold mt-1 tabular-nums" style={{ color: NAVY }}>
                {v || 'N/A'}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border px-3.5 py-2.5 mb-4" style={{ borderColor: LINE, background: '#fafbfc' }}>
          <SubHead>Why these numbers</SubHead>
          <p className="text-[11px] leading-relaxed" style={{ color: '#1e293b' }}>
            {investmentMetrics?.growthReasoning}
          </p>
        </div>

        <SubHead>Local rental market</SubHead>
        <div className="grid grid-cols-2 gap-x-4 mb-4">
          <KV label="Time on market" value={marketAndRental?.timeOnMarket} />
          <KV label="Price trend" value={marketAndRental?.priceTrend} />
          <KV label="Supply vs demand" value={marketAndRental?.supplyDemand} />
          <KV label="Tenant profile" value={marketAndRental?.tenantProfile} />
          <KV label="Airbnb potential" value={marketAndRental?.airbnbPotential} />
          <KV label="Walkability" value={locationIntelligence?.walkability} />
        </div>

        <div className="rounded-lg border px-3 py-2" style={{ borderColor: LINE }}>
          <SubHead>Investor area notes</SubHead>
          <p className="text-[10px] leading-snug mb-1" style={{ color: '#1e293b' }}>
            <strong>Population growth:</strong> {locationIntelligence?.populationGrowth || 'N/A'}
          </p>
          <p className="text-[10px] leading-snug" style={{ color: '#1e293b' }}>
            <strong>Infrastructure:</strong> {locationIntelligence?.plannedInfrastructure || 'N/A'}
          </p>
        </div>
      </PageShell>
      )}

      {/* ========== RISKS ========== */}
      <PageShell page={pageRisk} total={TOTAL} address={addressLine}>
        <SectionTitle>{showInvestment ? '5' : '4'}. Risks & red flags</SectionTitle>

        <div className="grid grid-cols-2 gap-2.5 mb-4">
          {riskRows.map((row) => {
            const textForStyle =
              row.kind === 'planning' ? planningRiskText || row.value || '' : row.value || '';
            const s = riskStyle(textForStyle, row.kind, riskTones?.[row.toneKey]);
            return (
              <div
                key={row.label}
                className="rounded-lg border px-3 py-2.5"
                style={{ background: s.bg, borderColor: s.border }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-wide leading-snug mb-1.5 break-words"
                  style={{ color: s.fg }}
                >
                  {row.label}
                </p>
                <p className="text-[11px] leading-relaxed" style={{ color: '#1e293b' }}>
                  {row.value || 'N/A'}
                </p>
              </div>
            );
          })}
        </div>

        {(propertyWorks?.extensionsAndAlterations || propertyWorks?.valueImpact) && (
          <div className="rounded-lg border px-3.5 py-2.5 mb-3" style={{ borderColor: '#b8dfc8', background: GREEN_SOFT }}>
            <SubHead>This property’s planning & works (value context)</SubHead>
            <p className="text-[10px] leading-snug mb-1" style={{ color: '#1e293b' }}>
              <strong>Works:</strong> {propertyWorks?.extensionsAndAlterations || 'See planning notes above.'}
            </p>
            <p className="text-[10px] leading-snug" style={{ color: '#1e293b' }}>
              <strong>Value impact:</strong>{' '}
              {propertyWorks?.valueImpact || 'Confirm completed works with survey before relying on uplift.'}
            </p>
          </div>
        )}

        <div className="rounded-lg border px-3.5 py-2.5 mb-3" style={{ borderColor: LINE, background: '#fafbfc' }}>
          <SubHead>Crime in the area</SubHead>
          <p className="text-[11px] leading-relaxed" style={{ color: '#1e293b' }}>
            <strong>{areaAnalysis?.crimeSafety?.rating || 'N/A'}</strong>
            {areaAnalysis?.crimeSafety?.description ? ` — ${areaAnalysis.crimeSafety.description}` : ''}
          </p>
        </div>

        <div className="rounded-lg border px-3.5 py-2.5" style={{ borderColor: LINE }}>
          <SubHead>Local context that affects risk</SubHead>
          <p className="text-[10px] leading-snug mb-1" style={{ color: '#1e293b' }}>
            <strong>Regeneration / projects:</strong> {locationIntelligence?.regenerationProjects || 'N/A'}
          </p>
          <p className="text-[10px] leading-snug mb-1" style={{ color: '#1e293b' }}>
            <strong>Planned infrastructure:</strong> {locationIntelligence?.plannedInfrastructure || 'N/A'}
          </p>
          <p className="text-[10px] leading-snug" style={{ color: '#1e293b' }}>
            <strong>Future outlook:</strong> {areaAnalysis?.futureOutlook || 'N/A'}
          </p>
        </div>
      </PageShell>

      {/* ========== LOCAL AREA ========== */}
      <PageShell page={pageArea} total={TOTAL} address={addressLine}>
        <SectionTitle>{showInvestment ? '6' : '5'}. Schools, transport & amenities</SectionTitle>

        <div className="grid grid-cols-2 gap-3.5 mb-3">
          <div>
            <SubHead>Schools in the local area</SubHead>
            <table className="w-full text-[10px]">
              <thead>
                <tr style={{ background: NAVY, color: '#fff' }}>
                  <th className="text-left font-semibold px-2 py-1.5">School</th>
                  <th className="text-left font-semibold px-2 py-1.5">Dist.</th>
                  <th className="text-left font-semibold px-2 py-1.5">Rating</th>
                </tr>
              </thead>
              <tbody>
                {(areaAnalysis?.schools || []).slice(0, 10).map((s, i) => (
                  <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                    <td className="px-2 py-1.5 font-medium border-b border-slate-100">{s.name}</td>
                    <td className="px-2 py-1.5 border-b border-slate-100" style={{ color: MUTED }}>
                      {s.distance}
                    </td>
                    <td className="px-2 py-1.5 border-b border-slate-100 font-bold" style={{ color: GREEN }}>
                      {s.rating}
                    </td>
                  </tr>
                ))}
                {!(areaAnalysis?.schools?.length) && (
                  <tr>
                    <td colSpan={3} className="px-2 py-2.5" style={{ color: MUTED }}>
                      No school rows returned
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div>
            <SubHead>Transport links</SubHead>
            <table className="w-full text-[10px]">
              <thead>
                <tr style={{ background: NAVY, color: '#fff' }}>
                  <th className="text-left font-semibold px-2 py-1.5">Type</th>
                  <th className="text-left font-semibold px-2 py-1.5">Line / route</th>
                  <th className="text-left font-semibold px-2 py-1.5">Time</th>
                </tr>
              </thead>
              <tbody>
                {(areaAnalysis?.transport || []).slice(0, 10).map((t, i) => (
                  <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                    <td className="px-2 py-1.5 border-b border-slate-100">{t.type}</td>
                    <td className="px-2 py-1.5 font-medium border-b border-slate-100">{t.line}</td>
                    <td className="px-2 py-1.5 border-b border-slate-100 font-mono">{t.time}</td>
                  </tr>
                ))}
                {!(areaAnalysis?.transport?.length) && (
                  <tr>
                    <td colSpan={3} className="px-2 py-2.5" style={{ color: MUTED }}>
                      No transport rows returned
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border px-3.5 py-2.5 mb-3" style={{ borderColor: LINE, background: '#fafbfc' }}>
          <SubHead>Who lives here & how walkable it feels</SubHead>
          <p className="text-[11px] leading-relaxed mb-1" style={{ color: '#1e293b' }}>
            <strong>Demographics:</strong> {areaAnalysis?.demographics || 'N/A'}
          </p>
          <p className="text-[11px] leading-relaxed" style={{ color: '#1e293b' }}>
            <strong>Walkability:</strong> {locationIntelligence?.walkability || 'N/A'}
          </p>
        </div>

        {(areaAnalysis?.amenities?.length ?? 0) > 0 && (
          <div>
            <SubHead>Shops & amenities</SubHead>
            <div className="flex flex-wrap gap-1.5">
              {areaAnalysis!.amenities.slice(0, 36).map((a, i) => (
                <span
                  key={i}
                  className="text-[9px] px-2 py-1 rounded border"
                  style={{ borderColor: LINE, background: '#f8fafc', color: NAVY }}
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        )}
      </PageShell>

      {/* ========== DUE DILIGENCE ========== */}
      <PageShell page={pageDiligence} total={TOTAL} address={addressLine}>
        <SectionTitle>{showInvestment ? '7' : '6'}. Due diligence deep dive</SectionTitle>
        <p className="text-[11px] leading-relaxed mb-3" style={{ color: MUTED }}>
          Practical checks buyers often miss — energy, connectivity, tenure, cash needed beyond deposit, and what to do next.
        </p>

        <div className="grid grid-cols-2 gap-2.5 mb-3">
          {[
            ['EPC & energy', dueDiligence?.epcAndEnergy],
            ['Broadband & mobile', dueDiligence?.broadbandAndMobile],
            ['Tenure & legal', dueDiligence?.tenureAndLegal],
            ['Council tax & parking', dueDiligence?.councilTaxAndParking],
            ['Purchase costs stack', dueDiligence?.purchaseCosts],
            ['Other environmental', dueDiligence?.environmentalOther],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border px-3 py-2.5" style={{ borderColor: LINE, background: '#fafbfc' }}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-1.5" style={{ color: GREEN }}>
                {label}
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: '#1e293b' }}>
                {value || 'Confirm before offering.'}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border px-3.5 py-2.5 mb-3" style={{ borderColor: LINE }}>
          <SubHead>Ownership & chain notes</SubHead>
          <p className="text-[11px] leading-relaxed" style={{ color: '#1e293b' }}>
            {dueDiligence?.ownershipAndChain || 'Ask how long the seller has owned the home and whether they are in a chain.'}
          </p>
        </div>

        <div className="rounded-lg border px-3.5 py-2.5" style={{ borderColor: '#b8dfc8', background: GREEN_SOFT }}>
          <SubHead>Recommended next steps</SubHead>
          <ol className="list-decimal pl-4 space-y-1">
            {(nextSteps.length
              ? nextSteps
              : [
                  'Book a viewing with this report’s checklist',
                  'Instruct a conveyancer early',
                  'Order an appropriate survey',
                  'Confirm buildings insurance before offering',
                  'Re-check council planning history',
                ]
            ).map((step, i) => (
              <li key={i} className="text-[11px] leading-snug" style={{ color: NAVY }}>
                {step}
              </li>
            ))}
          </ol>
        </div>
      </PageShell>

      {/* ========== COMPS ========== */}
      <PageShell page={pageComps} total={TOTAL} address={addressLine}>
        <SectionTitle>{showInvestment ? '8' : '7'}. Sold prices nearby</SectionTitle>

        <SubHead>Similar homes sold nearby</SubHead>
        <table className="w-full text-[10px] mb-4">
          <thead>
            <tr style={{ background: NAVY, color: '#fff' }}>
              <th className="text-left font-semibold px-2.5 py-2 w-[32%]">Address</th>
              <th className="text-left font-semibold px-2.5 py-2 w-[14%]">Price</th>
              <th className="text-left font-semibold px-2.5 py-2 w-[14%]">Sold</th>
              <th className="text-left font-semibold px-2.5 py-2">Similarity / notes</th>
            </tr>
          </thead>
          <tbody>
            {comps.map((sale, i) => (
              <tr key={i} style={{ background: i % 2 ? NAVY_SOFT : '#fff' }}>
                <td className="px-2.5 py-2 font-semibold border-b border-slate-100 align-top">{sale.address || '—'}</td>
                <td className="px-2.5 py-2 font-bold border-b border-slate-100 align-top tabular-nums">{sale.price || '—'}</td>
                <td className="px-2.5 py-2 border-b border-slate-100 align-top" style={{ color: MUTED }}>
                  {sale.soldDate || '—'}
                </td>
                <td className="px-2.5 py-2 border-b border-slate-100 align-top leading-snug">{sale.similarity || '—'}</td>
              </tr>
            ))}
            {comps.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2.5 py-3" style={{ color: MUTED }}>
                  No comparable sales returned for this run.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <SubHead>Sold history for this street</SubHead>
        <table className="w-full text-[10px] mb-4">
          <thead>
            <tr style={{ background: GREEN, color: '#fff' }}>
              <th className="text-left font-semibold px-2.5 py-2 w-[10%]">Year</th>
              <th className="text-left font-semibold px-2.5 py-2 w-[16%]">Price</th>
              <th className="text-left font-semibold px-2.5 py-2 w-[22%]">Source</th>
              <th className="text-left font-semibold px-2.5 py-2">Detail</th>
            </tr>
          </thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i} style={{ background: i % 2 ? GREEN_SOFT : '#fff' }}>
                <td className="px-2.5 py-2 font-mono border-b border-slate-100 align-top">{h.year || '—'}</td>
                <td className="px-2.5 py-2 font-bold border-b border-slate-100 align-top">{h.price || '—'}</td>
                <td className="px-2.5 py-2 border-b border-slate-100 align-top" style={{ color: MUTED }}>
                  {h.source || '—'}
                </td>
                <td className="px-2.5 py-2 border-b border-slate-100 align-top leading-snug">{h.description || '—'}</td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2.5 py-3" style={{ color: MUTED }}>
                  No sold history returned for this run.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="rounded-lg border px-3.5 py-2.5" style={{ borderColor: LINE, background: '#fafbfc' }}>
          <SubHead>How to use these sold prices</SubHead>
          <p className="text-[11px] leading-relaxed" style={{ color: '#1e293b' }}>
            Focus first on homes on the same street (or very nearby) with a similar number of bedrooms. Adjust your view of
            the asking price if this property is in better or worse condition, has a larger garden, parking, or a shorter
            lease. If this exact address has sold before, treat that as your best guide. Listing prices are what sellers
            hope for — use them as a starting point for negotiation, not the true market value.
          </p>
        </div>
      </PageShell>

      {/* ========== OFFERS ========== */}
      <PageShell page={pageOffer} total={TOTAL} address={addressLine}>
        <SectionTitle>{showInvestment ? '9' : '8'}. What to offer & what to check</SectionTitle>

        <div className="grid grid-cols-3 gap-2.5 mb-3">
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-3">
            <p className="text-[9px] font-bold uppercase leading-snug text-rose-700">Opening offer</p>
            <p className="text-[20px] font-bold mt-1.5 leading-tight" style={{ color: NAVY }}>
              {offerStrategy?.lowOffer || 'N/A'}
            </p>
            <p className="text-[8px] mt-1 leading-snug text-rose-800/80">Realistic opener — not a lowball</p>
          </div>
          <div className="rounded-lg border-2 px-3 py-3" style={{ borderColor: GREEN, background: GREEN_SOFT }}>
            <p className="text-[9px] font-bold uppercase leading-snug" style={{ color: GREEN }}>
              Fair market target
            </p>
            <p className="text-[22px] font-bold mt-1.5 leading-tight" style={{ color: NAVY }}>
              {offerStrategy?.fairOffer || 'N/A'}
            </p>
            <p className="text-[8px] mt-1 leading-snug" style={{ color: MUTED }}>
              What a patient buyer should expect to pay
            </p>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
            <p className="text-[9px] font-bold uppercase leading-snug text-amber-800">Walk-away max</p>
            <p className="text-[20px] font-bold mt-1.5 leading-tight" style={{ color: NAVY }}>
              {offerStrategy?.premiumOffer || 'N/A'}
            </p>
            <p className="text-[8px] mt-1 leading-snug text-amber-900/80">Stop above this unless strategy changes</p>
          </div>
        </div>

        {(marketEvidence?.askingVsSoldEvidence || marketEvidence?.negotiationLevers) && (
          <div className="rounded-lg border px-3 py-2 mb-3" style={{ borderColor: LINE, background: '#fafbfc' }}>
            <p className="text-[10px] leading-snug mb-1" style={{ color: '#1e293b' }}>
              <strong>Evidence behind these figures:</strong> {marketEvidence?.askingVsSoldEvidence}
            </p>
            <p className="text-[10px] leading-snug" style={{ color: '#1e293b' }}>
              <strong>Levers to use:</strong> {marketEvidence?.negotiationLevers}
            </p>
          </div>
        )}

        <SubHead>How to negotiate</SubHead>
        <ol className="mb-3 space-y-1">
          {(offerStrategy?.negotiationTips || []).slice(0, 8).map((tip, i) => (
            <li key={i} className="flex gap-2.5 text-[10.5px] leading-relaxed items-start">
              <span
                className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 text-white leading-none"
                style={{ background: NAVY }}
              >
                {i + 1}
              </span>
              <span style={{ color: '#1e293b' }}>{tip}</span>
            </li>
          ))}
        </ol>

        <div className="grid grid-cols-2 gap-3.5 mb-3">
          <div>
            <SubHead>Viewing checklist</SubHead>
            <ul className="space-y-1">
              {(viewingChecks || []).slice(0, 12).map((c, i) => (
                <li key={i} className="flex gap-2 text-[10.5px] leading-relaxed">
                  <span className="font-mono" style={{ color: GREEN }}>
                    ☐
                  </span>
                  <span style={{ color: '#1e293b' }}>{c}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <SubHead>Questions for the agent</SubHead>
            <ul className="space-y-1">
              {(agentQuestions || []).slice(0, 12).map((q, i) => (
                <li key={i} className="flex gap-2 text-[10.5px] leading-relaxed">
                  <span className="font-bold" style={{ color: NAVY }}>
                    {i + 1}.
                  </span>
                  <span style={{ color: '#1e293b' }}>{q}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-auto rounded-lg border px-3.5 py-2.5" style={{ borderColor: '#f5d78e', background: '#fff8eb' }}>
          <SubHead>Important disclaimer</SubHead>
          <p className="text-[10px] leading-relaxed" style={{ color: '#1e293b' }}>
            CheckThisHouse provides informational analysis only. Figures may be incomplete, outdated, or estimated. Always
            commission an independent survey, confirm title/lease terms with a solicitor, and verify lending criteria with
            your mortgage broker before exchanging contracts. CheckThisHouse accepts no liability for decisions made solely
            on this report, and this PDF is not a substitute for a RICS survey, valuation, or legal advice.
          </p>
          <div className="flex items-center gap-2 mt-2.5 pt-2 border-t border-amber-200/80">
            <img src={LOGO} alt="" className="h-7 w-auto object-contain" />
            <p className="text-[9px]" style={{ color: MUTED }}>
              End of report · {reportDate} · checkthishouse.co.uk
            </p>
          </div>
        </div>
      </PageShell>
    </div>
  );
}
