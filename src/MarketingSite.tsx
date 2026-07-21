import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  ShieldCheck,
  Droplets,
  AlertTriangle,
  ClipboardList,
  Scale,
  GraduationCap,
  TrainFront,
  MapPinned,
  Shield,
  PoundSterling,
  Home,
  TrendingUp,
  MessageCircleQuestion,
  LineChart,
  Building2,
  Flame,
} from 'lucide-react';
import { BuyerGoal, PropertyAnalysis } from './types';
import { PDFReport } from './components/PDFReport';
import { generatePDF } from './utils/pdfExport';
import { SUPPORTED_PORTALS, isInvalidListingUrl, validateListingUrl } from './lib/listingUrl';
import { isInvalidAddress, validateUkAddress } from './lib/ukAddress';
import { REPORT_CONTENTS, INVESTOR_REPORT_CONTENTS } from './lib/reportContents';
import { EmbeddedCheckoutModal } from './components/EmbeddedCheckoutModal';
import { ReportTeaserModal, TeaserData } from './components/ReportTeaserModal';
import { AddressAutocomplete } from './components/AddressAutocomplete';
import { ReportGeneratingOverlay } from './components/ReportGeneratingOverlay';

const LOGO = '/checkthishouselogo.png';

type LookupMode = 'listing' | 'address';

const BENEFIT_ICONS = [
  Scale,
  ShieldCheck,
  CheckCircle2,
  Home,
  PoundSterling,
  LineChart,
  TrendingUp,
  Droplets,
  Building2,
  Flame,
  Shield,
  GraduationCap,
  TrainFront,
  MapPinned,
  FileText,
  FileText,
  Scale,
  ClipboardList,
  ClipboardList,
  MessageCircleQuestion,
] as const;

const BENEFITS = REPORT_CONTENTS.map((item, i) => ({
  icon: BENEFIT_ICONS[i] || CheckCircle2,
  title: item.label,
  body: item.detail,
}));

const INVESTOR_NOTE = INVESTOR_REPORT_CONTENTS.map((i) => i.label).join(' · ');

type Phase = 'idle' | 'previewing' | 'preview' | 'redirecting' | 'analyzing' | 'ready' | 'downloading';

const PENDING_CHECKOUT_KEY = 'cth_pending_checkout';

async function readJsonResponse(response: Response): Promise<any> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(
      `Server returned an empty response (${response.status}). Restart npm run dev and try again.`
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Server returned a non-JSON response (${response.status}). Restart npm run dev — if this persists, the API route may not be running.`
    );
  }
}

function safeFilename(analysis: PropertyAnalysis): string {
  const base =
    analysis.location?.address ||
    analysis.title ||
    'property-report';
  return `CheckThisHouse-${base}`
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

export default function MarketingSite() {
  const [lookupMode, setLookupMode] = useState<LookupMode>('address');
  const [url, setUrl] = useState('');
  const [address, setAddress] = useState('');
  const [buyerGoal, setBuyerGoal] = useState<BuyerGoal>('First-time Buyer');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<PropertyAnalysis | null>(null);
  const [urlHint, setUrlHint] = useState<string | null>(null);
  const [addressHint, setAddressHint] = useState<string | null>(null);
  const [readyDismissed, setReadyDismissed] = useState(false);
  const [priceLabel, setPriceLabel] = useState('£4.99');
  const [paywallEnabled, setPaywallEnabled] = useState(true);
  const [checkoutSessionId, setCheckoutSessionId] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [checkoutClientSecret, setCheckoutClientSecret] = useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [teaser, setTeaser] = useState<TeaserData | null>(null);
  const [teaserOpen, setTeaserOpen] = useState(false);

  const isBusy =
    phase === 'analyzing' ||
    phase === 'downloading' ||
    phase === 'redirecting' ||
    phase === 'previewing';

  useEffect(() => {
    fetch('/api/pricing')
      .then((r) => r.json())
      .then((data) => {
        if (data?.priceLabel) setPriceLabel(data.priceLabel);
        if (typeof data?.paywallEnabled === 'boolean') setPaywallEnabled(data.paywallEnabled);
        if (typeof data?.publishableKey === 'string' && data.publishableKey.startsWith('pk_')) {
          setPublishableKey(data.publishableKey);
        }
      })
      .catch(() => {
        /* keep defaults */
      });
  }, []);

  const runAnalysis = async (opts: {
    listingUrl?: string;
    address?: string;
    goal: BuyerGoal;
    sessionId?: string | null;
  }) => {
    setPhase('analyzing');
    setError(null);
    setAnalysis(null);
    setReadyDismissed(false);

    try {
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: opts.listingUrl || undefined,
          address: opts.address || undefined,
          buyerGoal: opts.goal,
          sessionId: opts.sessionId || undefined,
        }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Could not generate the report.');
      }
      setAnalysis(data.analysis as PropertyAnalysis);
      setPhase('ready');
      setCheckoutSessionId(null);
      try {
        sessionStorage.removeItem(PENDING_CHECKOUT_KEY);
      } catch {
        /* ignore */
      }
      // Clean checkout params from the address bar
      if (typeof window !== 'undefined' && window.location.search.includes('session_id')) {
        window.history.replaceState({}, '', '/#generate');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      setPhase('idle');
    }
  };

  // Resume after Stripe redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    const sessionId = params.get('session_id');

    if (checkout === 'cancelled') {
      setError('Checkout was cancelled. No payment was taken.');
      window.history.replaceState({}, '', '/#generate');
      return;
    }

    if (checkout === 'success' && sessionId) {
      let pending: {
        mode?: LookupMode;
        url?: string;
        address?: string;
        buyerGoal?: BuyerGoal;
      } = {};
      try {
        pending = JSON.parse(sessionStorage.getItem(PENDING_CHECKOUT_KEY) || '{}');
      } catch {
        pending = {};
      }

      const mode = pending.mode || (pending.address ? 'address' : 'listing');
      const listingUrl = pending.url || '';
      const pendingAddress = pending.address || '';
      const goal = pending.buyerGoal || 'First-time Buyer';

      setLookupMode(mode);
      if (listingUrl) setUrl(listingUrl);
      if (pendingAddress) setAddress(pendingAddress);
      setBuyerGoal(goal);
      setCheckoutSessionId(sessionId);

      if (!listingUrl && !pendingAddress) {
        setError(
          'Payment succeeded, but we lost the property details. Enter them again and contact support with your receipt.'
        );
        setPhase('idle');
        return;
      }

      void runAnalysis({
        listingUrl: listingUrl || undefined,
        address: pendingAddress || undefined,
        goal,
        sessionId,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount for Stripe return
  }, []);

  const liveValidation = useMemo(() => {
    if (!url.trim()) return null;
    return validateListingUrl(url);
  }, [url]);

  const liveAddressValidation = useMemo(() => {
    if (!address.trim()) return null;
    return validateUkAddress(address);
  }, [address]);

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setError(null);
    if (!value.trim()) {
      setUrlHint(null);
      return;
    }
    const result = validateListingUrl(value);
    setUrlHint(isInvalidListingUrl(result) ? result.error : `Looks good — ${result.portal}`);
  };

  const handleAddressChange = (value: string) => {
    setAddress(value);
    setError(null);
    if (!value.trim()) {
      setAddressHint(null);
      return;
    }
    const result = validateUkAddress(value);
    // Only show positive confirmation while typing — don't nag with red errors mid-entry
    setAddressHint(
      isInvalidAddress(result) ? null : `Looks good — ${result.postcode || 'UK address'}`
    );
  };

  const startCheckout = async (opts: {
    listingUrl?: string;
    address?: string;
    goal: BuyerGoal;
  }) => {
    setPhase('redirecting');
    setError(null);
    try {
      sessionStorage.setItem(
        PENDING_CHECKOUT_KEY,
        JSON.stringify({
          mode: opts.address ? 'address' : 'listing',
          url: opts.listingUrl || undefined,
          address: opts.address || undefined,
          buyerGoal: opts.goal,
        })
      );
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: opts.listingUrl || undefined,
          address: opts.address || undefined,
          buyerGoal: opts.goal,
        }),
      });
      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error || 'Could not start checkout.');
      }

      if (data.mode === 'embedded' && data.clientSecret && data.publishableKey) {
        setPublishableKey(data.publishableKey);
        setCheckoutClientSecret(data.clientSecret);
        setTeaserOpen(false);
        setCheckoutOpen(true);
        setPhase('idle');
        return;
      }

      throw new Error(
        'Checkout could not start. Add your full STRIPE_PUBLISHABLE_KEY (pk_test_…) to .env.local, then restart the server.'
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Checkout failed.';
      setError(message);
      setPhase(teaser ? 'preview' : 'idle');
      setTeaserOpen(Boolean(teaser));
    }
  };

  const teaserFromResponse = (data: any, fallback: Partial<TeaserData>): TeaserData => ({
    limited: Boolean(data.limited),
    mode: data.mode === 'address' ? 'address' : 'listing',
    listingUrl: data.listingUrl || fallback.listingUrl || '',
    portal: data.portal || fallback.portal || 'Listing',
    host: data.host || fallback.host || '',
    address: data.address || fallback.address || null,
    price: data.price || null,
    bedrooms: data.bedrooms || null,
    bathrooms: data.bathrooms || null,
    propertyType: data.propertyType || null,
    images: Array.isArray(data.images) ? data.images.filter(Boolean).slice(0, 3) : [],
    keyFeatures: Array.isArray(data.keyFeatures)
      ? data.keyFeatures.filter(Boolean).slice(0, 6)
      : [],
    tenure: data.tenure || null,
    summary: data.summary || null,
    pricePerBedroom: data.pricePerBedroom || null,
    locationHint: data.locationHint || null,
    researchPlan: Array.isArray(data.researchPlan) ? data.researchPlan.filter(Boolean) : [],
  });

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (lookupMode === 'address') {
      const result = validateUkAddress(address);
      if (isInvalidAddress(result)) {
        setError(result.error);
        setAddressHint(null);
        return;
      }

      if (paywallEnabled && !checkoutSessionId) {
        if (teaser && teaser.mode === 'address' && teaser.address === result.address) {
          setError(null);
          setTeaserOpen(true);
          setPhase('preview');
          return;
        }

        setPhase('previewing');
        setError(null);
        setTeaser(null);
        setTeaserOpen(false);
        try {
          const response = await fetch('/api/teaser', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address: result.address }),
          });
          const data = await readJsonResponse(response);
          if (!response.ok) {
            throw new Error(data.error || 'Could not load preview.');
          }
          const next = teaserFromResponse(data, {
            listingUrl: '',
            portal: 'Address lookup',
            host: 'address',
            address: result.address,
          });
          setTeaser(next);
          setTeaserOpen(true);
          setPhase('preview');
          return;
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Could not load preview.';
          setError(message);
          setPhase('idle');
          return;
        }
      }

      await runAnalysis({
        address: result.address,
        goal: buyerGoal,
        sessionId: checkoutSessionId,
      });
      return;
    }

    const result = validateListingUrl(url);
    if (isInvalidListingUrl(result)) {
      setError(result.error);
      setUrlHint(result.error);
      return;
    }

    // Paywall on: free scrape preview first (no AI), then checkout
    if (paywallEnabled && !checkoutSessionId) {
      // Re-open existing preview for the same URL without hitting the API again
      if (teaser && teaser.listingUrl === result.url) {
        setError(null);
        setTeaserOpen(true);
        setPhase('preview');
        return;
      }

      setPhase('previewing');
      setError(null);
      setTeaser(null);
      setTeaserOpen(false);
      try {
        const response = await fetch('/api/teaser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: result.url }),
        });
        const data = await readJsonResponse(response);
        if (!response.ok) {
          throw new Error(data.error || 'Could not load preview.');
        }
        const next = teaserFromResponse(data, {
          listingUrl: result.url,
          portal: result.portal,
          host: result.host,
        });
        setTeaser(next);
        setTeaserOpen(true);
        setPhase('preview');
        return;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Could not load preview.';
        setError(message);
        setPhase('idle');
        return;
      }
    }

    await runAnalysis({
      listingUrl: result.url,
      goal: buyerGoal,
      sessionId: checkoutSessionId,
    });
  };

  const handleDownload = async () => {
    if (!analysis) return;
    setPhase('downloading');
    setError(null);
    try {
      // Let PDF pages paint before capture
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await generatePDF('pdf-report-container', safeFilename(analysis));
      setPhase('ready');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'PDF download failed.';
      setError(message);
      setPhase('ready');
    }
  };

  const addressLine = analysis
    ? [analysis.location?.address, analysis.location?.town, analysis.location?.postcode]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <div className="min-h-screen min-h-[100dvh] flex flex-col text-brand-navy overflow-x-hidden">
      <main className="flex-1">
        {/* ===== HERO ===== */}
        <section
          id="generate"
          className="relative z-10 overflow-x-hidden border-b border-brand-line"
          style={{
            background:
              'linear-gradient(165deg, #f7faf8 0%, #eef3f8 42%, #e8f0e9 100%)',
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'radial-gradient(circle at 1px 1px, rgba(11,31,58,0.12) 1px, transparent 0)',
              backgroundSize: '28px 28px',
            }}
          />
          <div
            className="pointer-events-none absolute -right-24 top-10 w-[520px] h-[520px] rounded-full blur-3xl"
            style={{ background: 'rgba(31,122,69,0.14)' }}
          />
          <div
            className="pointer-events-none absolute -left-20 bottom-0 w-[420px] h-[320px] rounded-full blur-3xl"
            style={{ background: 'rgba(11,31,58,0.08)' }}
          />

          <div className="relative max-w-6xl mx-auto px-4 sm:px-5 pt-6 pb-10 sm:pt-8 sm:pb-14 md:pt-12 md:pb-20 grid md:grid-cols-12 gap-8 md:gap-12 items-center">
            <div className="md:col-span-7 min-w-0 relative z-30">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="mb-3 sm:mb-4"
              >
                <img
                  src={LOGO}
                  alt="CheckThisHouse"
                  className="h-12 sm:h-16 md:h-[4.5rem] w-auto object-contain"
                />
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.05 }}
                className="font-display text-[1.65rem] leading-tight sm:text-3xl md:text-[2.1rem] md:leading-snug font-bold text-brand-navy max-w-xl mb-2.5 sm:mb-3"
              >
                Everything you need to know about a house — before you buy it.
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-[15px] sm:text-lg text-brand-muted max-w-lg leading-relaxed mb-6 sm:mb-8"
              >
                Paste a listing link, or look up any UK address — even if it isn’t for sale — and download a clear
                branded PDF you can use before you offer, remortgage or sell.
              </motion.p>

              <motion.form
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.15 }}
                onSubmit={handleGenerate}
                className="space-y-3 max-w-xl"
              >
                <div
                  className="flex rounded-xl border border-brand-line bg-white/80 p-1 gap-1"
                  role="tablist"
                  aria-label="Lookup type"
                >
                  {(
                    [
                      { id: 'address' as const, label: 'Address lookup' },
                      { id: 'listing' as const, label: 'Listing link' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={lookupMode === tab.id}
                      disabled={isBusy}
                      onClick={() => {
                        setLookupMode(tab.id);
                        setError(null);
                      }}
                      className={`flex-1 min-h-[40px] rounded-lg text-sm font-semibold transition ${
                        lookupMode === tab.id
                          ? 'bg-brand-navy text-white shadow-sm'
                          : 'text-brand-muted hover:text-brand-navy'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {lookupMode === 'listing' ? (
                  <>
                    <label className="block">
                      <span className="brand-label mb-1.5 block">Property listing link</span>
                      <input
                        type="url"
                        inputMode="url"
                        autoComplete="url"
                        placeholder="https://www.rightmove.co.uk/properties/…"
                        value={url}
                        onChange={(e) => handleUrlChange(e.target.value)}
                        disabled={isBusy}
                        className="brand-input text-base md:text-sm py-3.5"
                        aria-invalid={liveValidation?.ok === false}
                        aria-describedby="url-hint"
                      />
                    </label>
                    {urlHint && (
                      <p
                        id="url-hint"
                        className={`text-xs break-words ${liveValidation?.ok ? 'text-brand-green' : 'text-rose-700'}`}
                      >
                        {urlHint}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <label className="block">
                      <span className="brand-label mb-1.5 block">UK address</span>
                      <AddressAutocomplete
                        value={address}
                        onChange={handleAddressChange}
                        onResolved={(formatted) => {
                          handleAddressChange(formatted);
                        }}
                        disabled={
                          isBusy ||
                          checkoutOpen ||
                          phase === 'preview' ||
                          phase === 'previewing' ||
                          ((phase === 'ready' || phase === 'downloading') && !readyDismissed)
                        }
                        placeholder="Start with a postcode, e.g. PA2 8TR"
                        hintId="address-hint"
                      />
                    </label>
                    {addressHint && (
                      <p
                        id="address-hint"
                        className="text-xs break-words text-brand-green"
                      >
                        {addressHint}
                      </p>
                    )}
                    <p className="text-[11px] text-brand-muted leading-relaxed -mt-1">
                      Enter a full postcode to list every property there, or type your house number +
                      postcode to jump straight to yours.
                    </p>
                  </>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="flex-1 min-w-0">
                    <span className="brand-label mb-1.5 block">
                      {lookupMode === 'address' ? 'I’m checking as' : 'I am buying as'}
                    </span>
                    <select
                      value={buyerGoal}
                      onChange={(e) => setBuyerGoal(e.target.value as BuyerGoal)}
                      disabled={isBusy}
                      className="brand-input"
                    >
                      <option value="First-time Buyer">First-time buyer</option>
                      <option value="Moving Home">Moving home</option>
                      <option value="Buy-to-Let Investor">Buy to let</option>
                    </select>
                  </label>
                  <div className="sm:pt-[22px]">
                    <button
                      type="submit"
                      disabled={isBusy}
                      className="w-full sm:w-auto min-h-[48px] sm:min-h-0 inline-flex items-center justify-center gap-2 bg-brand-green hover:bg-brand-green-mid disabled:opacity-60 text-white font-semibold text-sm px-6 py-3.5 rounded-xl transition shadow-[0_8px_24px_rgba(31,122,69,0.25)]"
                    >
                      {phase === 'redirecting' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Opening checkout…
                        </>
                      ) : phase === 'analyzing' || phase === 'previewing' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />{' '}
                          {phase === 'previewing' ? 'Loading preview…' : 'Generating…'}
                        </>
                      ) : paywallEnabled ? (
                        <>
                          Get report <ArrowRight className="w-4 h-4" />
                        </>
                      ) : (
                        <>
                          Generate report <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="flex items-start gap-2 text-sm text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                <p className="text-[11px] text-brand-muted pt-1 leading-relaxed">
                  {paywallEnabled
                    ? `Pay securely on this page via Stripe · ${priceLabel} for one full PDF · `
                    : ''}
                  <span className="max-md:block max-md:mt-1">
                    {lookupMode === 'address'
                      ? 'Start typing a postcode to pick your address — no listing link needed.'
                      : `Supported: ${SUPPORTED_PORTALS.map((p) => p.name).join(', ')} and similar major portals.`}
                  </span>
                </p>
              </motion.form>
            </div>

            {/* Dominant product visual — compact on phones, unchanged from md up */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.65, delay: 0.2 }}
              className="md:col-span-5 relative z-0 min-w-0"
              aria-hidden
            >
              <div className="relative mx-auto max-w-md md:max-w-none">
                <div
                  className="absolute -inset-3 rounded-[28px] blur-2xl opacity-60 max-md:opacity-40"
                  style={{ background: 'linear-gradient(135deg, rgba(31,122,69,0.25), rgba(11,31,58,0.15))' }}
                />
                <div className="relative rounded-2xl border border-brand-line bg-white shadow-[0_24px_60px_rgba(11,31,58,0.14)] overflow-hidden">
                  <div className="h-11 sm:h-12 border-b border-brand-line bg-brand-cream flex items-center px-3.5 sm:px-4 relative">
                    <div className="flex gap-2">
                      <span className="w-3 h-3 rounded-full bg-[#ff6868]" />
                      <span className="w-3 h-3 rounded-full bg-[#f8c713]" />
                      <span className="w-3 h-3 rounded-full bg-[#49ce7b]" />
                    </div>
                    <p className="absolute inset-x-20 text-center text-[10px] sm:text-xs font-medium text-brand-muted truncate">
                      CheckThisHouse Report Preview
                    </p>
                  </div>

                  <div className="p-3.5 sm:p-5 space-y-3.5">
                    <div className="rounded-xl border border-brand-line bg-brand-cream/70 p-3.5 sm:p-4">
                      <div className="flex items-start justify-between gap-3 mb-4">
                        <div className="min-w-0">
                          <p className="font-display font-bold text-sm sm:text-base text-brand-navy truncate">
                            14 Maple Avenue, Bristol BS8
                          </p>
                          <p className="text-[10px] sm:text-xs text-brand-muted mt-0.5 truncate">
                            Victorian terrace · 4 bed · 1,847 sq ft
                          </p>
                        </div>
                        <span className="rounded-lg border border-brand-green/20 bg-brand-green-soft px-2.5 py-1.5 text-[9px] sm:text-[10px] font-mono text-brand-green shrink-0">
                          Report ready
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
                        <div>
                          <p className="font-display font-bold text-lg sm:text-2xl leading-none text-brand-navy">£585k</p>
                          <p className="text-[9px] sm:text-[10px] text-brand-muted mt-1">Fair value</p>
                        </div>
                        <div>
                          <p className="font-display font-bold text-lg sm:text-2xl leading-none text-brand-navy">C (72)</p>
                          <p className="text-[9px] sm:text-[10px] text-brand-muted mt-1">EPC rating</p>
                        </div>
                        <div>
                          <p className="font-display font-bold text-lg sm:text-2xl leading-none text-brand-green">Low</p>
                          <p className="text-[9px] sm:text-[10px] text-brand-muted mt-1">Flood risk</p>
                        </div>
                      </div>

                      <div className="rounded-lg bg-brand-navy-soft p-3">
                        <p className="text-[9px] sm:text-[10px] text-brand-muted mb-2">Your report includes:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {['Price history', 'EPC details', 'Risk scores', 'Planning', 'Local area'].map((label) => (
                            <span
                              key={label}
                              className="rounded-md border border-brand-line bg-white px-2 py-1 text-[8px] sm:text-[9px] font-medium text-brand-navy"
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-xl border border-brand-line bg-brand-cream/70 px-3.5 py-3">
                        <p className="font-display font-bold text-sm text-brand-green">72/100</p>
                        <p className="text-[9px] sm:text-[10px] text-brand-muted mt-0.5">Overall score</p>
                      </div>
                      <div className="rounded-xl border border-brand-line bg-brand-cream/70 px-3.5 py-3">
                        <p className="font-display font-bold text-sm text-brand-navy">9–10 pages</p>
                        <p className="text-[9px] sm:text-[10px] text-brand-muted mt-0.5">Full buyer report</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* ===== WHAT YOU GET ===== */}
        <section id="what-you-get" className="max-w-6xl mx-auto px-4 sm:px-5 py-12 sm:py-14 md:py-16">
          <p className="brand-label mb-2">What you get in the report</p>
          <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-bold mb-3 max-w-2xl">
            A complete picture of the home, the street and the deal.
          </h2>
          <p className="text-brand-muted max-w-2xl mb-6 sm:mb-7 leading-relaxed text-sm sm:text-base">
            Listings sell the dream. CheckThisHouse fills in the rest — so you can decide with confidence.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
            {BENEFITS.map(({ icon: Icon, title, body }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-20px' }}
                transition={{ delay: (i % 4) * 0.03, duration: 0.3 }}
                className="flex gap-2.5 rounded-lg border border-brand-line bg-white px-3 py-2.5 hover:border-brand-green/40 transition"
              >
                <span className="mt-0.5 shrink-0 w-7 h-7 rounded-md bg-brand-green/10 flex items-center justify-center">
                  <Icon className="w-3.5 h-3.5 text-brand-green" />
                </span>
                <div className="min-w-0">
                  <h3 className="font-display font-bold text-[13px] text-brand-navy leading-snug">{title}</h3>
                  <p className="text-[11px] text-brand-muted leading-snug mt-0.5 line-clamp-2">{body}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-brand-line bg-brand-paper/60 px-4 py-3">
            <p className="text-sm font-semibold text-brand-navy mb-0.5">Buying to let?</p>
            <p className="text-xs sm:text-sm text-brand-muted leading-relaxed">
              Choose buy to let and your PDF also adds: {INVESTOR_NOTE}.
            </p>
          </div>
        </section>

        {/* ===== HOW IT WORKS ===== */}
        <section id="how-it-works" className="bg-white border-y border-brand-line">
          <div className="max-w-6xl mx-auto px-4 sm:px-5 py-12 sm:py-16 md:py-20">
            <p className="brand-label mb-2">How it works</p>
            <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-bold mb-8 sm:mb-10">
              Three steps to a downloadable report
            </h2>
            <ol className="grid md:grid-cols-3 gap-8">
              {[
                {
                  n: '01',
                  title: 'Paste a link or enter an address',
                  body: 'Use a Rightmove, Zoopla or other listing URL — or look up any UK address with postcode, even if it isn’t for sale.',
                },
                {
                  n: '02',
                  title: 'We build the full picture',
                  body: 'Scores, what it’s worth, flood and damp risks, schools nearby, crime, transport links, shops & amenities, sold prices, what to offer, viewing checklist and agent questions — written for a normal buyer.',
                },
                {
                  n: '03',
                  title: 'Download your PDF',
                  body: 'A branded 9–10 page report you can take to viewings, share with family, or send to your surveyor and solicitor.',
                },
              ].map((step) => (
                <li key={step.n} className="relative">
                  <p className="font-display text-4xl font-extrabold text-brand-green/25 mb-2">{step.n}</p>
                  <h3 className="font-display font-bold text-lg mb-2">{step.title}</h3>
                  <p className="text-sm text-brand-muted leading-relaxed">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ===== SEO / FAQ ===== */}
        <section id="faq" className="max-w-6xl mx-auto px-4 sm:px-5 py-12 sm:py-16 md:py-20">
          <p className="brand-label mb-2">FAQ</p>
          <h2 className="font-display text-xl sm:text-2xl md:text-3xl font-bold mb-6 sm:mb-8">
            The research buyers wish they had before the second viewing
          </h2>
          <div className="max-w-3xl space-y-6">
            {[
              {
                q: 'What is CheckThisHouse?',
                a: 'CheckThisHouse turns a property listing link — or any UK address — into a clear multi-page PDF. You get summary and scores, whether it’s a good buy (or fair value) for your goal, pros and cons, what it’s worth, how value could change, flood/damp/lease/fire/insurance risks, crime in the area, schools nearby, transport links, shops and amenities, sold prices nearby, and practical next steps. Buy to let also gets rental yield and ROI sections.',
              },
              {
                q: 'Can I look up a house that isn’t for sale?',
                a: 'Yes. Use Address lookup, start typing your postcode, and pick the property from the list. The report researches sold history, local area and risks from public sources. There won’t be a live asking price unless comparable sales suggest one.',
              },
              {
                q: 'Is this a RICS survey?',
                a: 'No. The report is advisory research to help you decide what to investigate and how to negotiate. Always instruct a surveyor and solicitor before exchanging contracts.',
              },
              {
                q: 'Which listing websites are supported?',
                a: 'Major portals including Rightmove, Zoopla, OnTheMarket, Zillow, Realtor.com and Redfin. Links from unsupported websites are rejected. Or skip the link entirely and use Address lookup.',
              },
              {
                q: 'Who is it for?',
                a: 'First-time buyers and movers who want a clear picture before they offer, homeowners checking their own property, and landlords who select buy to let for yield-focused extras.',
              },
              {
                q: 'How detailed is the PDF?',
                a: 'Typically 9 pages for first-time buyers and movers, and 10 for buy to let — cover, summary & scores, pros & cons, valuation, risks, local area, due diligence, sold prices, then what to offer and what to check next. Built to use on a viewing or remortgage conversation, not skim once.',
              },
            ].map((item) => (
              <div key={item.q} className="border-b border-brand-line pb-5">
                <h3 className="font-display font-bold text-base mb-1.5">{item.q}</h3>
                <p className="text-sm text-brand-muted leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="bg-brand-navy text-white/75 mt-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-5 py-8 sm:py-10 flex flex-col md:flex-row gap-6 md:items-center justify-between pb-[max(2rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-3 min-w-0">
            <img src={LOGO} alt="CheckThisHouse" className="h-9 w-auto brightness-0 invert opacity-90 shrink-0" />
            <p className="text-xs leading-relaxed max-w-md">
              Advisory property intelligence only — not a survey, valuation or legal advice.
            </p>
          </div>
          <div className="text-xs space-y-1 md:text-right">
            <a
              href="/terms"
              className="inline-block text-white/90 hover:text-white underline underline-offset-4 transition"
            >
              Terms &amp; Conditions
            </a>
            <p className="flex items-center gap-1.5 md:justify-end">
              <FileText className="w-3.5 h-3.5 shrink-0" /> checkthishouse.co.uk
            </p>
            <p>© {new Date().getFullYear()} CheckThisHouse</p>
          </div>
        </div>
      </footer>

      <ReportTeaserModal
        open={teaserOpen && !checkoutOpen && (phase === 'preview' || phase === 'redirecting')}
        teaser={teaser}
        priceLabel={priceLabel}
        unlocking={phase === 'redirecting'}
        onClose={() => {
          setTeaserOpen(false);
          setPhase('idle');
        }}
        onUnlock={() => {
          if (!teaser) return;
          if (teaser.mode === 'address' || teaser.host === 'address') {
            void startCheckout({
              address: teaser.address || address,
              goal: buyerGoal,
            });
            return;
          }
          void startCheckout({
            listingUrl: teaser.listingUrl,
            goal: buyerGoal,
          });
        }}
      />

      <EmbeddedCheckoutModal
        open={checkoutOpen}
        clientSecret={checkoutClientSecret}
        publishableKey={publishableKey}
        priceLabel={priceLabel}
        onClose={() => {
          setCheckoutOpen(false);
          setCheckoutClientSecret(null);
          if (teaser) {
            setTeaserOpen(true);
            setPhase('preview');
          } else {
            setPhase('idle');
          }
        }}
      />

      {/* Loading + success overlay (same spot so finish is obvious) */}
      <AnimatePresence>
        {phase === 'previewing' && (
          <motion.div
            key="previewing"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/55 backdrop-blur-sm px-4 sm:px-5"
            role="status"
            aria-live="polite"
            aria-label="Loading preview"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-sm rounded-2xl bg-white border border-brand-line shadow-2xl p-6 sm:p-7"
            >
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-brand-green animate-spin shrink-0" />
                <div>
                  <p className="font-display font-bold text-lg">Loading preview</p>
                  <p className="text-xs text-brand-muted mt-0.5">
                    Pulling listing basics — no charge, no AI yet
                  </p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
        {phase === 'analyzing' && (
          <div key="analyzing">
            <ReportGeneratingOverlay open mode={lookupMode} />
          </div>
        )}

        {(phase === 'ready' || phase === 'downloading') && analysis && !readyDismissed && (
          <motion.div
            key="ready"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 backdrop-blur-sm px-4 sm:px-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-ready-title"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full max-w-md rounded-2xl bg-white border border-brand-line shadow-2xl p-5 sm:p-7 text-center max-h-[90dvh] overflow-y-auto"
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-brand-green-soft border border-brand-green/25">
                <CheckCircle2 className="h-9 w-9 text-brand-green" />
              </div>
              <p className="text-sm font-semibold uppercase tracking-wider text-brand-green mb-1">
                Success
              </p>
              <h2 id="report-ready-title" className="font-display font-bold text-2xl text-brand-navy mb-2">
                Your report is ready
              </h2>
              <p className="font-display font-semibold text-base text-brand-navy/90 leading-snug px-2">
                {analysis.title || 'Property report'}
              </p>
              {addressLine && (
                <p className="text-sm text-brand-muted mt-1 px-2 line-clamp-2">{addressLine}</p>
              )}
              {analysis.scores?.overall != null && (
                <p className="text-sm text-brand-muted mt-3">
                  Overall score{' '}
                  <strong className="text-brand-navy text-lg tabular-nums">{analysis.scores.overall}/100</strong>
                  {analysis.scores.riskLevel ? ` · Risk: ${analysis.scores.riskLevel}` : ''}
                </p>
              )}

              <button
                type="button"
                onClick={handleDownload}
                disabled={phase === 'downloading'}
                className="mt-6 w-full inline-flex items-center justify-center gap-2.5 bg-brand-green hover:bg-brand-green-mid disabled:opacity-70 text-white font-bold text-base px-6 py-4 rounded-xl transition shadow-[0_12px_32px_rgba(31,122,69,0.35)]"
              >
                {phase === 'downloading' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" /> Building PDF…
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" /> Download report
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setReadyDismissed(true)}
                disabled={phase === 'downloading'}
                className="mt-3 w-full text-sm font-medium text-brand-muted hover:text-brand-navy transition py-2"
              >
                Close — download later
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sticky download bar if they closed the success modal */}
      <AnimatePresence>
        {(phase === 'ready' || phase === 'downloading') && analysis && readyDismissed && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            className="fixed bottom-0 inset-x-0 z-40 border-t-2 border-brand-green bg-white shadow-[0_-8px_30px_rgba(11,31,58,0.12)] pb-[env(safe-area-inset-bottom)]"
          >
            <div className="max-w-6xl mx-auto px-4 sm:px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
              <div className="min-w-0 flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-brand-green shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-brand-navy truncate">
                    Report ready — {analysis.title || 'Property report'}
                  </p>
                  <p className="text-xs text-brand-muted truncate">{addressLine}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDownload}
                disabled={phase === 'downloading'}
                className="w-full sm:w-auto min-h-[48px] sm:min-h-0 inline-flex items-center justify-center gap-2 bg-brand-green hover:bg-brand-green-mid disabled:opacity-70 text-white font-bold text-sm px-5 py-3 rounded-xl transition shrink-0"
              >
                {phase === 'downloading' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Building PDF…
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" /> Download report
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Off-screen PDF for export */}
      {analysis && (
        <PDFReport
          analysis={analysis}
          buyerGoal={buyerGoal}
          generatedAt={new Date().toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        />
      )}
    </div>
  );
}
