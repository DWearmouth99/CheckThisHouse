import React, { useState, useEffect } from 'react';
import {
  Search,
  ExternalLink,
  AlertCircle,
  MapPin,
  Activity,
  Layers,
  Landmark,
  HelpCircle,
  ShieldCheck,
  FileCheck,
  Loader2,
  Link2,
  ClipboardPaste,
  Home,
} from 'lucide-react';

import { BuyerGoal, SavedAnalysis, PropertyAnalysis } from './types';
import SavedList from './components/SavedList';
import PropertyScores from './components/PropertyScores';
import SchoolsAndTransport from './components/SchoolsAndTransport';
import OfferStrategyComp from './components/OfferStrategyComp';
import ViewingChecklist from './components/ViewingChecklist';
import { InvestmentAndFinancials } from './components/InvestmentAndFinancials';
import { MarketAndArea } from './components/MarketAndArea';
import { RisksAndIntelligence } from './components/RisksAndIntelligence';
import { PDFReport } from './components/PDFReport';

type InputMode = 'url' | 'address' | 'paste';
type ReportTab = 'overview' | 'location' | 'financials' | 'viewing' | 'investment' | 'market' | 'risks';

const LOADING_STEPS = [
  'Resolving listing or address details…',
  'Cross-checking Land Registry & sold-price indices…',
  'Mapping schools, transport links & local risk signals…',
  'Building yields, valuation bands & negotiation ranges…',
  'Tailoring strengths, risks and viewing checks to your goal…',
];

const INPUT_MODES: { id: InputMode; label: string; icon: React.ReactNode }[] = [
  { id: 'url', label: 'Listing URL', icon: <Link2 className="w-3.5 h-3.5" /> },
  { id: 'address', label: 'Property Address', icon: <Home className="w-3.5 h-3.5" /> },
  { id: 'paste', label: 'Paste details', icon: <ClipboardPaste className="w-3.5 h-3.5" /> },
];

function scoreTone(score: number) {
  if (score >= 75) return 'text-brand-green bg-brand-green-soft border-brand-green/20';
  if (score >= 55) return 'text-amber-800 bg-amber-50 border-amber-200';
  return 'text-rose-700 bg-rose-50 border-rose-200';
}

export default function App() {
  const [inputMode, setInputMode] = useState<InputMode>('url');
  const [url, setUrl] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [buyerGoal, setBuyerGoal] = useState<BuyerGoal>('First-time Buyer');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showUrlPasteFallback, setShowUrlPasteFallback] = useState(false);

  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>(() => {
    const rawSaved = localStorage.getItem('rightmove_analyses');
    if (rawSaved) {
      try {
        return JSON.parse(rawSaved);
      } catch {
        return [];
      }
    }
    return [];
  });

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isAnalyzing) {
      setLoadingStepIndex(0);
      interval = setInterval(() => {
        setLoadingStepIndex((prev) => (prev + 1) % LOADING_STEPS.length);
      }, 3500);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAnalyzing]);

  useEffect(() => {
    localStorage.setItem('rightmove_analyses', JSON.stringify(savedAnalyses));
  }, [savedAnalyses]);

  const activeItem = savedAnalyses.find((item) => item.id === activeId);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedUrl = url.trim();
    const trimmedAddress = addressInput.trim();
    const trimmedPaste = pastedText.trim();

    if (!trimmedUrl && !trimmedAddress && !trimmedPaste) {
      setErrorMessage(
        'Enter a Rightmove URL, a UK property address, or paste listing details to continue.'
      );
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: trimmedUrl,
          pastedText: trimmedPaste,
          buyerGoal,
          address: trimmedAddress || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to analyze the listing.');
      }

      const freshAnalysis: PropertyAnalysis = data.analysis;
      const parsedAddress =
        typeof freshAnalysis.location?.address === 'string'
          ? freshAnalysis.location.address
          : freshAnalysis.location?.town || trimmedAddress || 'Listing Address';
      const parsedPrice =
        typeof freshAnalysis.price === 'string' ? freshAnalysis.price : 'Unknown value';

      const sourceLabel = trimmedUrl
        ? trimmedUrl
        : trimmedAddress
          ? 'Address lookup'
          : 'Manual Paste';

      const newRecord: SavedAnalysis = {
        id: crypto.randomUUID(),
        url: sourceLabel,
        address: parsedAddress,
        price: parsedPrice,
        buyerGoal,
        analyzedAt: new Date().toISOString(),
        analysis: {
          ...freshAnalysis,
          scrapedImages: data.scraped ? data.scraped.images : undefined,
        },
      };

      setSavedAnalyses((prev) => [newRecord, ...prev]);
      setActiveId(newRecord.id);
      setActiveTab('overview');
      setUrl('');
      setAddressInput('');
      setPastedText('');
      setShowUrlPasteFallback(false);
    } catch (err: unknown) {
      console.error(err);
      const message =
        err instanceof Error
          ? err.message
          : 'Something went wrong during analysis. Check that GEMINI_API_KEY is configured.';
      setErrorMessage(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Remove this property report from your history?')) {
      setSavedAnalyses((prev) => prev.filter((item) => item.id !== id));
      if (activeId === id) setActiveId(null);
    }
  };

  const loadExample = (exampleUrl: string, sampleText: string, goal: BuyerGoal) => {
    setInputMode('paste');
    setUrl(exampleUrl);
    setPastedText(sampleText);
    setBuyerGoal(goal);
    setAddressInput('');
    setShowUrlPasteFallback(false);
  };

  const tabClass = (tab: ReportTab) =>
    `py-3 px-4 text-xs font-display font-semibold border-b-2 transition-colors focus:outline-none whitespace-nowrap cursor-pointer ${
      activeTab === tab
        ? 'border-brand-green text-brand-green'
        : 'border-transparent text-brand-muted hover:text-brand-navy'
    }`;

  return (
    <div className="min-h-screen text-brand-ink flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white/95 border-b border-brand-line px-5 md:px-6 py-3 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src="/checkthishouselogo.png"
              alt="CheckThisHouse"
              className="h-11 md:h-12 w-auto object-contain"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.src.endsWith('.jpg')) img.src = '/checkthishouselogo.jpg';
              }}
            />
            <span className="hidden sm:inline-flex items-center text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-muted bg-brand-navy-soft border border-brand-line px-2.5 py-1 rounded-md">
              UK Property Intelligence
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-brand-muted bg-brand-cream border border-brand-line py-1.5 px-3 rounded-lg">
              <Activity className="w-3.5 h-3.5 text-brand-green" />
              Live research online
            </span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: form + history */}
        <section className="lg:col-span-4 space-y-6">
          <div className="brand-card p-6">
            <h2 className="font-display font-bold text-sm text-brand-navy mb-4 flex items-center gap-2">
              <Search className="w-4 h-4 text-brand-green" />
              Analyse a property
            </h2>

            <form onSubmit={handleAnalyze} className="space-y-4">
              {/* Mode switcher */}
              <div className="space-y-2">
                <label className="brand-label">Input method</label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-brand-paper rounded-xl border border-brand-line">
                  {INPUT_MODES.map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => setInputMode(mode.id)}
                      className={`flex flex-col sm:flex-row items-center justify-center gap-1 px-2 py-2 rounded-lg text-[10px] sm:text-[11px] font-semibold transition cursor-pointer ${
                        inputMode === mode.id
                          ? 'bg-white text-brand-navy shadow-sm border border-brand-line'
                          : 'text-brand-muted hover:text-brand-navy border border-transparent'
                      }`}
                    >
                      {mode.icon}
                      <span className="leading-tight text-center">{mode.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {inputMode === 'url' && (
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="brand-label">Rightmove listing URL</label>
                    <input
                      type="url"
                      placeholder="https://www.rightmove.co.uk/properties/…"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      className="brand-input text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="brand-label">Paste fallback</label>
                      <button
                        type="button"
                        onClick={() => setShowUrlPasteFallback(!showUrlPasteFallback)}
                        className="text-[10px] text-brand-green hover:underline font-semibold cursor-pointer"
                      >
                        {showUrlPasteFallback ? 'Hide paste box' : '+ Paste description'}
                      </button>
                    </div>
                    {showUrlPasteFallback && (
                      <textarea
                        rows={4}
                        placeholder="If scraping is blocked, paste the listing description here for a full report."
                        value={pastedText}
                        onChange={(e) => setPastedText(e.target.value)}
                        className="brand-input text-xs resize-y min-h-[96px]"
                      />
                    )}
                  </div>
                </div>
              )}

              {inputMode === 'address' && (
                <div className="space-y-1.5">
                  <label className="brand-label">Full UK address or street + postcode</label>
                  <input
                    type="text"
                    placeholder="14 Oak Road, Leeds, LS8 1AB"
                    value={addressInput}
                    onChange={(e) => setAddressInput(e.target.value)}
                    className="brand-input text-xs"
                    autoComplete="street-address"
                  />
                  <p className="text-[11px] text-brand-muted leading-relaxed">
                    We look up sold history, schools, transport and market context from the address — no listing URL required.
                  </p>
                </div>
              )}

              {inputMode === 'paste' && (
                <div className="space-y-1.5">
                  <label className="brand-label">Listing text</label>
                  <textarea
                    rows={7}
                    placeholder="Paste the full property listing text, price, and key details here…"
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    className="brand-input text-xs resize-y min-h-[140px]"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="brand-label flex items-center gap-1">
                  Buyer goal
                  <HelpCircle
                    className="w-3.5 h-3.5 text-brand-muted"
                    title="Shapes pros, cons and suitability advice to your profile."
                  />
                </label>
                <select
                  value={buyerGoal}
                  onChange={(e) => setBuyerGoal(e.target.value as BuyerGoal)}
                  className="brand-input text-xs"
                >
                  <option value="First-time Buyer">First-time buyer</option>
                  <option value="Moving Home">Moving home</option>
                  <option value="Buy-to-Let Investor">Buy to let — yield & ROI page</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isAnalyzing}
                className="w-full py-3 px-4 bg-brand-navy hover:bg-brand-navy-mid disabled:bg-brand-line disabled:text-brand-muted text-white font-display font-semibold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed transition mt-2 shadow-[0_4px_14px_rgba(11,31,58,0.18)]"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analysing property…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-brand-green-mid" />
                    Run intelligence report
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-brand-line text-[11px] text-brand-muted leading-relaxed">
              <p className="font-semibold text-brand-navy mb-0.5">Grounded UK research</p>
              <p>
                Sold prices, Ofsted, flood/crime context and comparables — even when listing sites block scrapers.
              </p>
            </div>
          </div>

          {/* Examples */}
          <div className="brand-card p-4 bg-brand-cream/80">
            <h3 className="text-xs font-semibold text-brand-navy mb-2">Try an example</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() =>
                  loadExample(
                    'https://www.rightmove.co.uk/properties/example-victorian-3bed',
                    'Offers in region of £275,000. Charming 3-bedroom Victorian end-of-terrace house in Leeds (LS8). Well-proportioned rooms, high ceilings, large sash windows, lovely rear courtyard. Gas central heating, EPC band E. Needs double glazing upgrade and minor cosmetic refreshment. Leasehold with 800 years remaining, ground rent is £5/year. Close to local schools.',
                    'First-time Buyer'
                  )
                }
                className="w-full text-left p-2.5 rounded-xl bg-white hover:border-brand-green/40 transition text-[11px] space-y-1 border border-brand-line group cursor-pointer"
              >
                <div className="flex justify-between font-semibold text-brand-navy group-hover:text-brand-green">
                  <span>Victorian end-of-terrace</span>
                  <span className="text-brand-green">£275k</span>
                </div>
                <p className="text-brand-muted truncate text-[10px]">LS8 Leeds — cosmetic upgrades needed</p>
              </button>

              <button
                type="button"
                onClick={() =>
                  loadExample(
                    'https://www.rightmove.co.uk/properties/example-modern-apartment',
                    'Asking price £340,000. Sleek 2-bedroom second-floor modern apartment in Manchester (M1). Built-in closets, Juliet balcony overlooking communal gardens, dedicated secure parking space. Underfloor electric heating, EPC band B. Cladding certificate EWS1 in place. High-speed broadband up to 1000Mbps, excellent transport connections.',
                    'Buy-to-Let Investor'
                  )
                }
                className="w-full text-left p-2.5 rounded-xl bg-white hover:border-brand-green/40 transition text-[11px] space-y-1 border border-brand-line group cursor-pointer"
              >
                <div className="flex justify-between font-semibold text-brand-navy group-hover:text-brand-green">
                  <span>Modern city apartment</span>
                  <span className="text-brand-green">£340k</span>
                </div>
                <p className="text-brand-muted truncate text-[10px]">M1 Manchester — balcony, strong yield profile</p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setInputMode('address');
                  setAddressInput('14 Oak Road, Leeds, LS8 1AB');
                  setUrl('');
                  setPastedText('');
                  setBuyerGoal('Moving Home');
                  setShowUrlPasteFallback(false);
                }}
                className="w-full text-left p-2.5 rounded-xl bg-white hover:border-brand-green/40 transition text-[11px] space-y-1 border border-brand-line group cursor-pointer"
              >
                <div className="flex justify-between font-semibold text-brand-navy group-hover:text-brand-green">
                  <span>Address lookup</span>
                  <span className="text-[10px] uppercase tracking-wider text-brand-muted">New</span>
                </div>
                <p className="text-brand-muted truncate text-[10px]">14 Oak Road, Leeds, LS8 1AB</p>
              </button>
            </div>
          </div>

          <SavedList
            savedAnalyses={savedAnalyses}
            activeId={activeId}
            onSelect={(id) => {
              setActiveId(id);
              setActiveTab('overview');
            }}
            onDelete={handleDelete}
          />
        </section>

        {/* Right: empty / loading / report */}
        <section className="lg:col-span-8 space-y-6 min-h-[400px]">
          {isAnalyzing && (
            <div className="brand-card p-12 text-center h-[500px] flex flex-col items-center justify-center space-y-6">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-brand-navy-soft border-t-brand-navy animate-spin" />
                <ShieldCheck className="w-6 h-6 text-brand-green absolute top-5 left-5" />
              </div>
              <div className="space-y-2 max-w-md">
                <h3 className="font-display font-bold text-base text-brand-navy">
                  Building your intelligence report…
                </h3>
                <p className="text-xs text-brand-green font-medium animate-pulse">
                  {LOADING_STEPS[loadingStepIndex]}
                </p>
                <p className="text-xs text-brand-muted leading-relaxed pt-4">
                  Address lookups and listings are cross-checked against UK sold data, schools,
                  transport and local risk signals before we score the property for your buyer goal.
                </p>
              </div>
            </div>
          )}

          {errorMessage && !isAnalyzing && (
            <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs leading-relaxed flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold uppercase tracking-wide text-[11px]">Analysis error</p>
                <p>{errorMessage}</p>
                <p className="text-rose-800/80 pt-1.5">
                  Tip: switch to <strong>Paste details</strong> or use the URL paste fallback if the listing site is blocking scrapes. Address mode works without a URL.
                </p>
              </div>
            </div>
          )}

          {!activeItem && !isAnalyzing && (
            <div className="brand-card p-8 space-y-8">
              <div className="max-w-xl mx-auto text-center space-y-4">
                <img
                  src="/checkthishouselogo.png"
                  alt=""
                  className="h-14 w-auto mx-auto object-contain opacity-90"
                  onError={(e) => {
                    const img = e.currentTarget;
                    if (!img.src.endsWith('.jpg')) img.src = '/checkthishouselogo.jpg';
                  }}
                />
                <h3 className="font-display font-bold text-xl text-brand-navy tracking-tight">
                  Independent UK property intelligence
                </h3>
                <p className="text-sm text-brand-muted leading-relaxed">
                  Agents sell the house. We stress-test it — valuation bands, schools, risks, yields and
                  a negotiation plan shaped to your goal. Start with a listing URL, a full address, or pasted details.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-left max-w-3xl mx-auto">
                <div className="p-4 rounded-xl bg-brand-paper border border-brand-line space-y-2">
                  <div className="p-1.5 bg-brand-green-soft text-brand-green w-fit rounded-lg border border-brand-green/15">
                    <Layers className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-semibold text-brand-navy">Goal-fit pros & cons</h4>
                  <p className="text-[11px] text-brand-muted leading-relaxed">
                    Structural and lifestyle signals tuned for FTB, BTL, family, flip or retirement.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-brand-paper border border-brand-line space-y-2">
                  <div className="p-1.5 bg-brand-navy-soft text-brand-navy w-fit rounded-lg border border-brand-line">
                    <Landmark className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-semibold text-brand-navy">Sold history leverage</h4>
                  <p className="text-[11px] text-brand-muted leading-relaxed">
                    Land Registry-style context on the street and postcode for sharper offers.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-brand-paper border border-brand-line space-y-2">
                  <div className="p-1.5 bg-amber-50 text-amber-800 w-fit rounded-lg border border-amber-100">
                    <FileCheck className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-semibold text-brand-navy">Offer & viewing kit</h4>
                  <p className="text-[11px] text-brand-muted leading-relaxed">
                    Low / fair / stretch bids plus a physical checklist and agent questions.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] text-brand-muted">
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-navy-soft border border-brand-line text-brand-navy font-medium">
                  <Link2 className="w-3 h-3" /> Listing URL
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-green-soft border border-brand-green/20 text-brand-green font-medium">
                  <Home className="w-3 h-3" /> Property address
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-brand-cream border border-brand-line font-medium">
                  <ClipboardPaste className="w-3 h-3" /> Paste details
                </span>
              </div>
            </div>
          )}

          {activeItem && !isAnalyzing && (
            <div className="space-y-6">
              <div className="brand-card p-6 space-y-4">
                {activeItem.analysis.scrapedImages && activeItem.analysis.scrapedImages.length > 0 && (
                  <div className="grid grid-cols-5 gap-2 h-32 rounded-xl overflow-hidden bg-brand-paper p-1.5 border border-brand-line">
                    {activeItem.analysis.scrapedImages.slice(0, 5).map((imgUrl, id) => (
                      <div key={id} className="relative h-full w-full bg-brand-line/40 group">
                        <img
                          src={imgUrl}
                          alt={`Property photo ${id + 1}`}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[9px] uppercase tracking-[0.14em] font-semibold bg-brand-navy-soft text-brand-navy px-2 py-0.5 rounded border border-brand-line">
                        Intelligence report
                      </span>
                      <span className="text-[9px] uppercase tracking-[0.14em] font-semibold bg-brand-green-soft text-brand-green px-2 py-0.5 rounded border border-brand-green/20">
                        {activeItem.buyerGoal}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          if (isGeneratingPDF) return;
                          setIsGeneratingPDF(true);
                          try {
                            const { generatePDF } = await import('./utils/pdfExport');
                            const addr =
                              activeItem.analysis.location?.address ||
                              activeItem.address ||
                              'Property';
                            const safe = addr
                              .replace(/[^\w\s-]/g, '')
                              .trim()
                              .replace(/\s+/g, '-')
                              .slice(0, 48);
                            await generatePDF(
                              'pdf-report-container',
                              `CheckThisHouse-${safe || 'Report'}.pdf`
                            );
                          } finally {
                            setIsGeneratingPDF(false);
                          }
                        }}
                        disabled={isGeneratingPDF}
                        className="text-[10px] font-semibold tracking-wide text-white bg-brand-green hover:bg-brand-green-mid px-2.5 py-1 rounded-md border border-brand-green transition flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isGeneratingPDF ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Generating…
                          </>
                        ) : (
                          <>
                            <FileCheck className="w-3 h-3" />
                            Download PDF
                          </>
                        )}
                      </button>
                    </div>

                    <h2 className="font-display font-bold text-base md:text-xl text-brand-navy tracking-tight leading-snug">
                      {activeItem.analysis.title}
                    </h2>

                    <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 text-xs text-brand-muted pt-0.5">
                      <span className="flex items-center gap-1 min-w-0">
                        <MapPin className="w-3.5 h-3.5 text-brand-green shrink-0" />
                        <span className="truncate">
                          {typeof activeItem.analysis.location.address === 'string'
                            ? activeItem.analysis.location.address
                            : activeItem.address}
                          {activeItem.analysis.location.town
                            ? `, ${activeItem.analysis.location.town}`
                            : ''}
                          {activeItem.analysis.location.postcode
                            ? ` (${activeItem.analysis.location.postcode})`
                            : ''}
                        </span>
                      </span>
                    </div>
                  </div>

                  <div className="text-left md:text-right shrink-0 bg-brand-green-soft px-4 py-2.5 rounded-xl border border-brand-green/20">
                    <label className="text-[10px] tracking-wider uppercase font-semibold text-brand-muted block">
                      Asking price
                    </label>
                    <span className="font-display font-bold text-lg md:text-xl text-brand-green">
                      {activeItem.analysis.price}
                    </span>
                  </div>
                </div>

                {/* Score summary strip */}
                {activeItem.analysis.scores && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 pt-1">
                    {[
                      { label: 'Overall', value: activeItem.analysis.scores.overall },
                      { label: 'Value', value: activeItem.analysis.scores.valueForMoney },
                      { label: 'Location', value: activeItem.analysis.scores.locationRating },
                      { label: 'Condition', value: activeItem.analysis.scores.conditionRating },
                      ...(activeItem.buyerGoal === 'Buy-to-Let Investor'
                        ? [{ label: 'Investment', value: activeItem.analysis.scores.investmentScore }]
                        : []),
                      { label: 'Confidence', value: activeItem.analysis.scores.confidenceScore },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className={`px-2.5 py-2 rounded-xl border text-center ${scoreTone(s.value ?? 0)}`}
                      >
                        <label className="text-[9px] uppercase tracking-wider font-semibold opacity-80 block">
                          {s.label}
                        </label>
                        <span className="text-sm font-display font-bold tabular-nums">
                          {s.value ?? '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="px-3 py-2 bg-brand-paper rounded-xl border border-brand-line text-center">
                    <label className="text-[9px] uppercase tracking-wider text-brand-muted font-semibold block">
                      Bedrooms
                    </label>
                    <span className="text-xs font-semibold text-brand-navy">
                      {activeItem.analysis.bedrooms || 'Not specified'}
                    </span>
                  </div>
                  <div className="px-3 py-2 bg-brand-paper rounded-xl border border-brand-line text-center">
                    <label className="text-[9px] uppercase tracking-wider text-brand-muted font-semibold block">
                      Bathrooms
                    </label>
                    <span className="text-xs font-semibold text-brand-navy">
                      {activeItem.analysis.bathrooms || 'Not specified'}
                    </span>
                  </div>
                  <div className="px-3 py-2 bg-brand-paper rounded-xl border border-brand-line text-center">
                    <label className="text-[9px] uppercase tracking-wider text-brand-muted font-semibold block">
                      Type
                    </label>
                    <span className="text-xs font-semibold text-brand-navy truncate block">
                      {activeItem.analysis.propertyType}
                    </span>
                  </div>
                  <div className="px-3 py-2 bg-brand-paper rounded-xl border border-brand-line text-center">
                    <label className="text-[9px] uppercase tracking-wider text-brand-muted font-semibold block">
                      Risk
                    </label>
                    <span className="text-xs font-semibold text-brand-navy">
                      {activeItem.analysis.scores?.riskLevel || '—'}
                    </span>
                  </div>
                </div>

                {activeItem.analysis.specs && activeItem.analysis.specs.length > 0 && (
                  <div className="p-3 bg-brand-paper rounded-xl border border-brand-line flex flex-wrap gap-x-6 gap-y-2">
                    {activeItem.analysis.specs.map((spec, i) => (
                      <div key={i} className="text-xs">
                        <span className="text-brand-muted">{spec.label}: </span>
                        <strong className="text-brand-navy font-medium">{spec.value}</strong>
                      </div>
                    ))}
                  </div>
                )}

                {activeItem.analysis.summary && (
                  <p className="text-xs text-brand-muted leading-relaxed border-t border-brand-line pt-3">
                    {activeItem.analysis.summary}
                  </p>
                )}
              </div>

              <div className="flex border-b border-brand-line overflow-x-auto">
                <button type="button" onClick={() => setActiveTab('overview')} className={tabClass('overview')}>
                  Overview & valuation
                </button>
                {activeItem.buyerGoal === 'Buy-to-Let Investor' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('investment')}
                    className={tabClass('investment')}
                  >
                    Investment & financials
                  </button>
                )}
                <button type="button" onClick={() => setActiveTab('market')} className={tabClass('market')}>
                  Market & area
                </button>
                <button type="button" onClick={() => setActiveTab('risks')} className={tabClass('risks')}>
                  Risks & intelligence
                </button>
                <button type="button" onClick={() => setActiveTab('viewing')} className={tabClass('viewing')}>
                  Viewing checklist ({activeItem.analysis.viewingChecks?.length || 0})
                </button>
              </div>

              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <PropertyScores analysis={activeItem.analysis} buyerGoal={activeItem.buyerGoal} />

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="brand-card p-6 space-y-4">
                      <h4 className="font-display font-semibold text-xs uppercase tracking-wider text-brand-green border-b border-brand-line pb-2">
                        Strengths
                      </h4>
                      <div className="space-y-3">
                        {activeItem.analysis.pros?.map((pro, index) => (
                          <div
                            key={index}
                            className="p-3 rounded-lg bg-brand-paper border border-brand-line text-xs"
                          >
                            <span className="font-semibold text-brand-navy block mb-1">{pro.title}</span>
                            <p className="text-brand-muted leading-relaxed">{pro.desc}</p>
                            <span className="text-[9px] font-semibold tracking-wider uppercase text-brand-green bg-brand-green-soft px-2 py-0.5 mt-2 inline-block rounded border border-brand-green/20">
                              {pro.category}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="brand-card p-6 space-y-4">
                      <h4 className="font-display font-semibold text-xs uppercase tracking-wider text-rose-700 border-b border-brand-line pb-2">
                        Drawbacks
                      </h4>
                      <div className="space-y-3">
                        {activeItem.analysis.cons?.map((con, index) => (
                          <div
                            key={index}
                            className="p-3 rounded-lg bg-brand-paper border border-brand-line text-xs"
                          >
                            <span className="font-semibold text-brand-navy block mb-1">{con.title}</span>
                            <p className="text-brand-muted leading-relaxed">{con.desc}</p>
                            <span className="text-[9px] font-semibold tracking-wider uppercase text-rose-700 bg-rose-50 px-2 py-0.5 mt-2 inline-block rounded border border-rose-200">
                              {con.category}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {activeItem.buyerGoal !== 'Buy-to-Let Investor' && (
                      <OfferStrategyComp analysis={activeItem.analysis} />
                    )}
                </div>
              )}

              {activeTab === 'investment' &&
                activeItem.buyerGoal === 'Buy-to-Let Investor' && (
                <div className="space-y-6">
                  <InvestmentAndFinancials analysis={activeItem.analysis} />
                  <OfferStrategyComp analysis={activeItem.analysis} />
                </div>
              )}

              {activeTab === 'market' && (
                <div className="space-y-6">
                  <MarketAndArea analysis={activeItem.analysis} />
                  <SchoolsAndTransport analysis={activeItem.analysis} />
                </div>
              )}

              {activeTab === 'risks' && <RisksAndIntelligence analysis={activeItem.analysis} />}

              {activeTab === 'viewing' && <ViewingChecklist analysis={activeItem.analysis} />}

              {activeItem.analysis.sources && activeItem.analysis.sources.length > 0 && (
                <div className="brand-card p-5">
                  <h4 className="font-display font-semibold text-xs uppercase tracking-wider text-brand-muted mb-3">
                    Sources ({activeItem.analysis.sources.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {activeItem.analysis.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-brand-paper border border-brand-line hover:border-brand-green/40 hover:bg-brand-green-soft/40 transition rounded-lg text-brand-green flex items-center justify-between group"
                      >
                        <span className="truncate pr-2 font-medium text-brand-navy group-hover:text-brand-green">
                          {src.title}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between text-[10px] text-brand-muted px-1">
                <span>ID {activeItem.id.substring(0, 8)}</span>
                <span>Analysed {new Date(activeItem.analyzedAt).toLocaleString()}</span>
              </div>
            </div>
          )}
        </section>

        {activeItem && (
          <PDFReport
            analysis={activeItem.analysis}
            buyerGoal={activeItem.buyerGoal}
            generatedAt={new Date(activeItem.analyzedAt || Date.now()).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          />
        )}
      </main>

      <footer className="mt-auto bg-brand-navy text-white/80 border-t border-brand-navy">
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <img
              src="/checkthishouselogo.png"
              alt="CheckThisHouse"
              className="h-8 w-auto object-contain brightness-0 invert opacity-90"
              onError={(e) => {
                const img = e.currentTarget;
                if (!img.src.endsWith('.jpg')) img.src = '/checkthishouselogo.jpg';
              }}
            />
            <p className="max-w-md leading-relaxed">
              © 2026 CheckThisHouse. Advisory only — validate estimates with surveys and professional advice.
            </p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-white/60">
            <span>Land Registry research</span>
            <span className="text-white/30">·</span>
            <span>Local data shield</span>
            <span className="text-white/30">·</span>
            <span className="text-brand-green-mid font-medium">checkthishouse.co.uk</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
