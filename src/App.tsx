import React, { useState, useEffect } from 'react';
import { 
  Home, 
  Search, 
  ExternalLink, 
  Sparkles, 
  AlertCircle, 
  MapPin, 
  Activity, 
  FileText, 
  Layers, 
  Landmark, 
  HelpCircle,
  ChevronRight,
  ShieldCheck,
  Calendar,
  Compass,
  FileCheck,
  Loader2
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

const LOADING_STEPS = [
  "Retrieving listing details & images...",
  "Bypassing secure protections via Google Search grounding...",
  "Searching HM Land Registry & Zoopla postcode indices for historical values...",
  "Running Ofsted surveys & transport connection mappings...",
  "Synthesizing customized yields, pros/cons, and negotiation parameters..."
];

export default function App() {
  const [url, setUrl] = useState<string>('');
  const [pastedText, setPastedText] = useState<string>('');
  const [buyerGoal, setBuyerGoal] = useState<BuyerGoal>('First-time Buyer');
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [loadingStepIndex, setLoadingStepIndex] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Historical persistence
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>(() => {
    const rawSaved = localStorage.getItem('rightmove_analyses');
    if (rawSaved) {
      try { return JSON.parse(rawSaved); } catch { return []; }
    }
    return [];
  });
  
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'location' | 'financials' | 'viewing' | 'investment' | 'market' | 'risks'>('overview');
  const [showPastedField, setShowPastedField] = useState<boolean>(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<boolean>(false);

  // Rotate loading instructions during analysis
  useEffect(() => {
    let interval: any;
    if (isAnalyzing) {
      setLoadingStepIndex(0);
      interval = setInterval(() => {
        setLoadingStepIndex((prev) => (prev + 1) % LOADING_STEPS.length);
      }, 3500);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  // Sync saved searches to localStorage
  useEffect(() => {
    localStorage.setItem('rightmove_analyses', JSON.stringify(savedAnalyses));
  }, [savedAnalyses]);

  // Selected property report
  const activeItem = savedAnalyses.find(item => item.id === activeId);

  // Submit analysis query
  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() && !pastedText.trim()) {
      setErrorMessage("Please supply either a Property Listing URL or list descriptors in the copy-paste zone.");
      return;
    }

    setIsAnalyzing(true);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, pastedText, buyerGoal }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || "Failed to analyze the listing.");
      }

      const freshAnalysis: PropertyAnalysis = data.analysis;
      const parsedAddress = typeof freshAnalysis.location?.address === 'string' 
        ? freshAnalysis.location.address 
        : (freshAnalysis.location?.town || "Listing Address");
      const parsedPrice = typeof freshAnalysis.price === 'string' ? freshAnalysis.price : "Unknown value";

      // Build unique record
      const newRecord: SavedAnalysis = {
        id: crypto.randomUUID(),
        url: url || "Manual Paste",
        address: parsedAddress,
        price: parsedPrice,
        buyerGoal: buyerGoal,
        analyzedAt: new Date().toISOString(),
        analysis: {
          ...freshAnalysis,
          // Merge images from scraper if present
          scrapedImages: data.scraped ? data.scraped.images : undefined
        }
      };

      setSavedAnalyses((prev) => [newRecord, ...prev]);
      setActiveId(newRecord.id);
      setActiveTab('overview');
      setUrl('');
      setPastedText('');
      setShowPastedField(false);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Something went wrong during property formulation. Please make sure the server has active GEMINI_API_KEY value.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Remove this property report from your dashboard history?")) {
      setSavedAnalyses((prev) => prev.filter((item) => item.id !== id));
      if (activeId === id) {
        setActiveId(null);
      }
    }
  };

  const loadExample = (exampleUrl: string, sampleText: string, goal: BuyerGoal) => {
    setUrl(exampleUrl);
    setPastedText(sampleText);
    setBuyerGoal(goal);
    if (sampleText) {
      setShowPastedField(true);
    }
  };

  return (
    <div className="min-h-screen text-slate-800 flex flex-col font-sans">
      
      {/* 1. Header Area */}
      <header className="bg-white/95 border-b border-slate-200 px-6 py-4 sticky top-0 z-50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.25)]">
              <Compass className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-display font-bold text-base md:text-lg text-slate-900 tracking-tight flex items-center gap-1.5">
                CheckThisHouse
                <span className="bg-blue-50 text-blue-600 font-mono text-[9px] px-1.5 py-0.5 rounded border border-blue-200 uppercase tracking-wider">
                  UK Independent Valuer
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-sans mt-0.5">Scrape details, investigate sold histories, schools, safety, and estimate actual value yields.</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-mono flex items-center gap-1 bg-slate-50 py-1.5 px-3 rounded-lg border border-slate-200">
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              Grounding Engine: Online Realtime
            </span>
          </div>
        </div>
      </header>

      {/* 2. Main content Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left column - Analysis Form & History Saved List (4 cols) */}
        <section className="lg:col-span-4 space-y-6">
          
          {/* Form container */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="font-display font-bold text-sm text-slate-900 mb-4 flex items-center gap-2">
              <Search className="w-4.5 h-4.5 text-blue-600" />
              Configure Listing Check
            </h2>

            <form onSubmit={handleAnalyze} className="space-y-4">
              
              {/* URL input */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
                  Property Listing URL
                </label>
                <input
                  type="url"
                  placeholder="https://www.rightmove.co.uk/properties/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors"
                />
              </div>

              {/* Collapsible Manual Copy-Paste Zone */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono">
                    Text Details Fallback
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowPastedField(!showPastedField)}
                    className="text-[10px] text-blue-600 hover:underline hover:text-blue-500 font-mono"
                  >
                    {showPastedField ? "Hide details box" : "+ Paste description"}
                  </button>
                </div>
                
                {showPastedField && (
                  <textarea
                    rows={4}
                    placeholder="If scraping is blocked by Cloudflare, copy-paste the property text/description from the listing site here to guarantee 100% accurate results!"
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors font-sans"
                  />
                )}
              </div>

              {/* Profile Goal */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider font-mono flex items-center gap-1">
                  My Buying Goal
                  <HelpCircle className="w-3.5 h-3.5 text-slate-400" title="This goal is used to evaluate custom pros/cons specific to your needs." />
                </label>
                <select
                  value={buyerGoal}
                  onChange={(e) => setBuyerGoal(e.target.value as BuyerGoal)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs text-slate-700 focus:outline-none focus:border-blue-500"
                >
                  <option value="First-time Buyer">First-time Buyer (Low work, safe postcode)</option>
                  <option value="Buy-to-Let Investor">Buy-to-Let Investor (Rental yield maximization)</option>
                  <option value="Family Home">Family Home (Schools, garden size, amenities)</option>
                  <option value="House Flipping">House Flipping (Discount pricing, renovation scope)</option>
                  <option value="Retirement">Retirement (Quiet space, accessible commutes)</option>
                </select>
              </div>

              <button
                type="submit"
                disabled={isAnalyzing}
                className="w-full py-3 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 disabled:from-slate-300 disabled:to-slate-300 disabled:text-slate-500 text-white font-display font-semibold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed transition-all shadow-sm mt-6"
              >
                {isAnalyzing ? (
                  <>
                    <span className="w-3.5 h-3.5 rounded-full border-2 border-white/20 border-t-white animate-spin" />
                    Analyzing Listing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4.5 h-4.5 text-amber-300" />
                    Submit Listing Analysis
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-1 text-[11px] text-slate-500 leading-normal font-sans">
              <span className="font-semibold text-slate-600 flex items-center gap-1">
                💡 Smart Grounding Enabled
              </span>
              <span>
                Even if Cloudflare blocks our network scrapers, the system retrieves cached postcode stats automatically!
              </span>
            </div>
          </div>

          {/* Configuration examples helpers */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h3 className="text-xs font-semibold text-slate-600 mb-2">Try with Example Listing Details:</h3>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => loadExample(
                  "https://www.rightmove.co.uk/properties/example-victorian-3bed",
                  "Offers in region of £275,000. Charming 3-bedroom Victorian end-of-terrace house in Leeds (LS8). Well-proportioned rooms, high ceilings, large sash windows, lovely rear courtyard. Gas central heating, EPC band E. Needs double glazing upgrade and minor cosmetic refreshment. Leasehold with 800 years remaining, ground rent is £5/year. Close to local schools.",
                  "First-time Buyer"
                )}
                className="w-full text-left p-2.5 rounded bg-white hover:bg-slate-100 transition text-[11px] space-y-1 block border border-slate-200 shadow-sm group"
              >
                <div className="flex justify-between font-semibold text-slate-700 group-hover:text-blue-600">
                  <span>Victorian End-of-Terrace</span>
                  <span className="text-emerald-600">£275k</span>
                </div>
                <p className="text-slate-500 truncate text-[10px]">LS8 Leeds - Needs heating, cosmetic upgrades.</p>
              </button>

              <button
                type="button"
                onClick={() => loadExample(
                  "https://www.rightmove.co.uk/properties/example-modern-apartment",
                  "Asking price £340,000. Sleek 2-bedroom second-floor modern apartment in Manchester (M1). Built-in closets, Juliet balcony overlooking communal gardens, dedicated secure parking space. Underfloor electric heating, EPC band B. Cladding certificate EWS1 in place. High-speed broadband up to 1000Mbps, excellent transport connections.",
                  "Buy-to-Let Investor"
                )}
                className="w-full text-left p-2.5 rounded bg-white hover:bg-slate-100 transition text-[11px] space-y-1 block border border-slate-200 shadow-sm group"
              >
                <div className="flex justify-between font-semibold text-slate-700 group-hover:text-blue-600">
                  <span>Modern City Apartment</span>
                  <span className="text-emerald-600">£340k</span>
                </div>
                <p className="text-slate-500 truncate text-[10px]">M1 Manchester - Balcony, premium broadband yields.</p>
              </button>
            </div>
          </div>

          {/* History list */}
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

        {/* Right column - Main Analyzer Details (8 cols) */}
        <section className="lg:col-span-8 space-y-6 min-h-[400px]">
          
          {/* Main loader screen */}
          {isAnalyzing && (
            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center h-[500px] flex flex-col items-center justify-center space-y-6 shadow-sm">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-blue-100 border-t-blue-600 animate-spin" />
                <Sparkles className="w-6 h-6 text-amber-500 absolute top-5 left-5 animate-pulse" />
              </div>
              
              <div className="space-y-2 max-w-md">
                <h3 className="font-display font-bold text-base text-slate-900">Composing Shrewd Analysis Graph...</h3>
                <p className="text-xs text-blue-600 font-mono italic animate-pulse">
                  {LOADING_STEPS[loadingStepIndex]}
                </p>
                <p className="text-xs text-slate-500 leading-normal pt-4">
                  Using real-time Google search grounding, we crawl multiple UK archives to assemble complete area records, educational statistics, historical sales comparisons, and investment indicators!
                </p>
              </div>
            </div>
          )}

          {/* Error Message Screen */}
          {errorMessage && !isAnalyzing && (
            <div className="p-5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs leading-normal flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold underline uppercase">Analysis Error Encountered:</p>
                <p>{errorMessage}</p>
                <p className="text-rose-700/80 pt-1.5">Troubleshooting tip: If site blocking is persistent, check option &rdquo;+ Paste description&rdquo; and copy the plain page text from the listing site into our fallback container. We will formulate the complete report with 100% success!</p>
              </div>
            </div>
          )}

          {/* Welcome visual dashboard if no item is active */}
          {!activeItem && !isAnalyzing && (
            <div className="bg-white border border-slate-200 shadow-sm rounded-2xl p-8 text-center space-y-8">
              <div className="max-w-xl mx-auto space-y-4">
                <div className="w-12 h-12 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-blue-600">
                  <Compass className="w-6 h-6" />
                </div>
                <h3 className="font-display font-bold text-lg text-slate-900">CheckThisHouse Property Analyzer</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  Buying a house is likely your largest singular financial transaction. Listing agents represent pure vendor interests. Our tool uses advanced real estate analytics to inspect listings with raw mechanical compliance, exposing pros/cons customized strictly to your buying target profile.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left max-w-3xl mx-auto">
                
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="p-1.5 bg-rose-50 text-rose-600 w-fit rounded-lg border border-rose-100">
                    <Layers className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-semibold text-slate-800">Aesthetic Pros & Cons</h4>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Custom insights mapping structural limits and layouts adjusted to your goal (Buy-To-Let, families, flips).
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="p-1.5 bg-emerald-50 text-emerald-600 w-fit rounded-lg border border-emerald-100">
                    <Landmark className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-semibold text-slate-800">Historical sales check</h4>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Crawls Land Registry catalogs to check past transactions of the street postcode, giving you competitive leverage.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="p-1.5 bg-amber-50 text-amber-600 w-fit rounded-lg border border-amber-100">
                    <FileCheck className="w-4 h-4" />
                  </div>
                  <h4 className="text-xs font-semibold text-slate-800">Negotiation Tactic Bid</h4>
                  <p className="text-[11px] text-slate-500 leading-normal">
                    Calculates a low bidding framework, reasonable target price, and custom agent diagnostic checklists.
                  </p>
                </div>

              </div>

              <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl max-w-2xl mx-auto text-xs text-blue-800 leading-relaxed text-center font-sans flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span>Input a property listing URL on the left panel or choose one of our examples to start immediately!</span>
              </div>
            </div>
          )}

          {/* Property Report Sheet */}
          {activeItem && !isAnalyzing && (
            <div className="space-y-6">
              
              {/* Header Info Block */}
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                
                {/* Visual Listing Gallery if we scraped photos */}
                {activeItem.analysis.scrapedImages && activeItem.analysis.scrapedImages.length > 0 && (
                  <div className="grid grid-cols-5 gap-2 h-32 rounded-xl overflow-hidden bg-slate-100 p-1.5 border border-slate-200">
                    {activeItem.analysis.scrapedImages.slice(0, 5).map((imgUrl, id) => (
                      <div key={id} className="relative h-full w-full bg-slate-200 group">
                        <img 
                          src={imgUrl} 
                          alt={`Scraped property component ${id}`}
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            // Hide broken images from browser blockades
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] uppercase tracking-wider bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-200">
                        Target Listing Analysis
                      </span>
                      <button
                        onClick={async () => {
                          if (isGeneratingPDF) return;
                          setIsGeneratingPDF(true);
                          try {
                            const { generatePDF } = await import('./utils/pdfExport');
                            await generatePDF('pdf-report-container', 'Property-Investment-Report.pdf');
                          } finally {
                            setIsGeneratingPDF(false);
                          }
                        }}
                        disabled={isGeneratingPDF}
                        className="text-[10px] font-mono tracking-wide text-indigo-600 hover:bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isGeneratingPDF ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <FileCheck className="w-3 h-3" />
                            Download PDF Report
                          </>
                        )}
                      </button>
                    </div>
                    <h2 className="font-display font-bold text-base md:text-xl text-slate-900 tracking-tight leading-snug">
                      {activeItem.analysis.title}
                    </h2>
                    
                    <div className="flex flex-wrap items-center gap-y-1.5 gap-x-3 text-xs text-slate-500 pt-1 font-sans">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-rose-500" />
                        {typeof activeItem.analysis.location.address === 'string' ? activeItem.analysis.location.address : activeItem.address}, {activeItem.analysis.location.town} ({activeItem.analysis.location.postcode})
                      </span>
                    </div>
                  </div>

                  <div className="text-left md:text-right flex-shrink-0 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200">
                    <label className="text-[10px] tracking-wider uppercase font-mono text-slate-500 block">Asking Price</label>
                    <span className="font-sans font-bold text-lg md:text-xl text-emerald-600">{activeItem.analysis.price}</span>
                  </div>
                </div>

                {/* Key specs badge grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-center">
                    <label className="text-[9px] uppercase tracking-wider text-slate-500 font-mono block">Bedrooms</label>
                    <span className="text-xs font-semibold text-slate-800">{activeItem.analysis.bedrooms || "Not specified"}</span>
                  </div>
                  <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-center">
                    <label className="text-[9px] uppercase tracking-wider text-slate-500 font-mono block">Bathrooms</label>
                    <span className="text-xs font-semibold text-slate-800">{activeItem.analysis.bathrooms || "Not specified"}</span>
                  </div>
                  <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-center">
                    <label className="text-[9px] uppercase tracking-wider text-slate-500 font-mono block">Property Type</label>
                    <span className="text-xs font-semibold text-slate-800 truncate block">{activeItem.analysis.propertyType}</span>
                  </div>
                  <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-center">
                    <label className="text-[9px] uppercase tracking-wider text-slate-500 font-mono block">Analysis Goal</label>
                    <span className="text-xs font-semibold text-blue-600">{activeItem.buyerGoal}</span>
                  </div>
                </div>

                {/* Listing metadata specs parsed */}
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap gap-x-6 gap-y-2">
                  {activeItem.analysis.specs && activeItem.analysis.specs.map((spec, i) => (
                    <div key={i} className="text-xs">
                      <span className="text-slate-500 font-sans">{spec.label}: </span>
                      <strong className="text-slate-800 font-sans font-medium">{spec.value}</strong>
                    </div>
                  ))}
                </div>

              </div>

              {/* Navigation Tabs bar */}
              <div className="flex border-b border-slate-200 scale-100 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`py-3 px-4 text-xs font-display font-semibold border-b-2 transition-colors focus:outline-none whitespace-nowrap cursor-pointer ${
                    activeTab === 'overview'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Overview & Valuation
                </button>
                <button
                  onClick={() => setActiveTab('investment')}
                  className={`py-3 px-4 text-xs font-display font-semibold border-b-2 transition-colors focus:outline-none whitespace-nowrap cursor-pointer ${
                    activeTab === 'investment'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Investment & Financials
                </button>
                <button
                  onClick={() => setActiveTab('market')}
                  className={`py-3 px-4 text-xs font-display font-semibold border-b-2 transition-colors focus:outline-none whitespace-nowrap cursor-pointer ${
                    activeTab === 'market'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Market & Area
                </button>
                <button
                  onClick={() => setActiveTab('risks')}
                  className={`py-3 px-4 text-xs font-display font-semibold border-b-2 transition-colors focus:outline-none whitespace-nowrap cursor-pointer ${
                    activeTab === 'risks'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Risks & Intelligence
                </button>
                <button
                  onClick={() => setActiveTab('viewing')}
                  className={`py-3 px-4 text-xs font-display font-semibold border-b-2 transition-colors focus:outline-none whitespace-nowrap cursor-pointer ${
                    activeTab === 'viewing'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Viewing Checklist ({activeItem.analysis.viewingChecks?.length || 0})
                </button>
              </div>

              {/* Tab Outputs */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Rating gauges */}
                  <PropertyScores analysis={activeItem.analysis} />

                  {/* Aesthetic Pros & Cons Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    
                    {/* Strengths Pros */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                      <h4 className="font-display font-semibold text-xs uppercase tracking-wider text-emerald-700 border-b border-slate-100 pb-2 flex items-center gap-1.5 font-sans">
                        🟢 Structured Strengths (Pros)
                      </h4>
                      <div className="space-y-3">
                        {activeItem.analysis.pros && activeItem.analysis.pros.map((pro, index) => (
                          <div key={index} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                            <span className="font-semibold text-slate-800 block mb-1">{pro.title}</span>
                            <p className="text-slate-600 leading-relaxed font-sans">{pro.desc}</p>
                            <span className="text-[9px] font-mono tracking-wider uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 mt-2 inline-block rounded border border-emerald-200">
                              {pro.category}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Technical Caveats Cons */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                      <h4 className="font-display font-semibold text-xs uppercase tracking-wider text-rose-700 border-b border-slate-100 pb-2 flex items-center gap-1.5 font-sans">
                        🔴 Operational Drawbacks (Cons)
                      </h4>
                      <div className="space-y-3">
                        {activeItem.analysis.cons && activeItem.analysis.cons.map((con, index) => (
                          <div key={index} className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                            <span className="font-semibold text-slate-800 block mb-1">{con.title}</span>
                            <p className="text-slate-600 leading-relaxed font-sans">{con.desc}</p>
                            <span className="text-[9px] font-mono tracking-wider uppercase text-rose-700 bg-rose-50 px-2 py-0.5 mt-2 inline-block rounded border border-rose-200">
                              {con.category}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                  </div>
                </div>
              )}

              {activeTab === 'investment' && (
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

              {activeTab === 'risks' && (
                <RisksAndIntelligence analysis={activeItem.analysis} />
              )}

              {activeTab === 'viewing' && (
                <ViewingChecklist analysis={activeItem.analysis} />
              )}

              {/* Underlying research references sources utilized */}
              {activeItem.analysis.sources && activeItem.analysis.sources.length > 0 && (
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <h4 className="font-display font-semibold text-xs uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1">
                    🔍 Information & Sales Sources Utilized ({activeItem.analysis.sources.length})
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {activeItem.analysis.sources.map((src, i) => (
                      <a
                        key={i}
                        href={src.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 bg-slate-50 border border-slate-200 hover:border-slate-300 hover:bg-slate-100 transition rounded-lg text-blue-600 flex items-center justify-between group shadow-sm"
                      >
                        <span className="truncate pr-2 font-sans font-medium text-slate-700 group-hover:text-blue-600">
                          {src.title}
                        </span>
                        <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Analysis Meta facts */}
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono px-1">
                <span>Record Identifier: {activeItem.id.substring(0, 8)}</span>
                <span>Analysed on: {new Date(activeItem.analyzedAt).toLocaleString()}</span>
              </div>

            </div>
          )}

        </section>

        {/* Hidden PDF Report Container */}
        {activeItem && <PDFReport analysis={activeItem.analysis} />}

      </main>

      {/* 3. Footer */}
      <footer className="mt-12 bg-white/80 border-t border-slate-200 p-6 text-center text-xs text-slate-500 font-sans">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <p>© 2026 CheckThisHouse (Checkthishouse.co.uk). For advisory purposes only. All estimates should be validated with physical surveys.</p>
          <div className="flex justify-center gap-4">
            <span className="hover:text-slate-800 transition-colors">Local Data Shield</span>
            <span>•</span>
            <span className="hover:text-slate-800 transition-colors">Land Registry Grounding Enabled</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
