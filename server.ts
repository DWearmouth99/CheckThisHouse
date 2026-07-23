import express from "express";
import path from "path";
import dns from "dns";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { analyzeWithGemini, hasGeminiKey } from "./src/lib/geminiAnalyze";
import { analyzeWithOpenAI, hasOpenAIKey } from "./src/lib/openaiAnalyze";
import { isInvalidListingUrl, validateListingUrl } from "./src/lib/listingUrl";
import { checkRateLimit, clientIp } from "./src/lib/rateLimit";
import { buildFullReportTeaserPlan } from "./src/lib/reportContents";
import {
  createReportCheckoutSession,
  formatPriceLabel,
  getPublicBaseUrl,
  getReportPricePence,
  getStripePublishableKey,
  isPaywallEnabled,
  markCheckoutSessionUsed,
  verifyPaidCheckoutSession,
} from "./src/lib/stripePaywall";
import { scrapeRightmoveUrl } from "./src/lib/rightmoveScrape";
import { addressPropertyKey, isInvalidAddress, validateUkAddress } from "./src/lib/ukAddress";
import {
  hasIdealPostcodesKey,
  resolveAddress,
  suggestAddresses,
} from "./src/lib/idealPostcodes";

// Load environment variables (.env.local overrides .env)
dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Stripe webhook needs the raw body — register before JSON parser
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req: express.Request, res: express.Response) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret || !isPaywallEnabled()) {
      return res.status(200).json({ received: true, skipped: true });
    }
    try {
      const { getStripe } = await import("./src/lib/stripePaywall");
      const stripe = getStripe();
      const sig = req.headers["stripe-signature"];
      if (!sig || typeof sig !== "string") {
        return res.status(400).send("Missing stripe-signature");
      }
      const event = stripe.webhooks.constructEvent(req.body, sig, secret);
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as { id?: string; metadata?: { listingUrl?: string } };
        console.log("[stripe] checkout.session.completed", session.id, session.metadata?.listingUrl);
      }
      res.json({ received: true });
    } catch (err: any) {
      console.error("[stripe] webhook error", err?.message || err);
      res.status(400).send(`Webhook Error: ${err?.message || "unknown"}`);
    }
  }
);

// Body parser limits elevated to allow raw HTML copy-paste fallback
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

app.get("/api/pricing", (_req, res) => {
  const pence = getReportPricePence();
  const publishableKey = getStripePublishableKey();
  res.json({
    paywallEnabled: isPaywallEnabled(),
    pricePence: pence,
    priceLabel: formatPriceLabel(pence),
    currency: "gbp",
    publishableKey: publishableKey.startsWith("pk_") ? publishableKey : null,
    addressAutocomplete: hasIdealPostcodesKey(),
  });
});

/** Ideal Postcodes autocomplete suggestions (not billed until resolve). */
app.get("/api/address/suggest", async (req, res) => {
  try {
    if (!hasIdealPostcodesKey()) {
      return res.status(503).json({
        error: "Address autocomplete is not configured.",
        suggestions: [],
      });
    }
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length < 3) {
      return res.json({ suggestions: [] });
    }

    const ip = clientIp(req);
    const ipLimit = checkRateLimit({
      key: `addr-suggest:${ip}`,
      limit: 90,
      windowMs: 15 * 60 * 1000,
    });
    if (ipLimit.ok === false) {
      res.setHeader("Retry-After", String(ipLimit.retryAfterSec));
      return res.status(429).json({
        error: "Too many address lookups. Please wait a moment.",
        code: "RATE_LIMITED",
      });
    }

    const result = await suggestAddresses(q);
    return res.json({
      suggestions: result.suggestions,
      source: result.source,
      completeList: result.completeList,
      notice: result.notice || null,
      didYouMean: result.didYouMean || [],
    });
  } catch (err: any) {
    console.error("[address/suggest]", err?.message || err);
    const status = typeof err?.status === "number" ? err.status : 502;
    return res.status(status).json({ error: err?.message || "Address lookup failed.", suggestions: [] });
  }
});

/** Ideal Postcodes resolve (billed). */
app.post("/api/address/resolve", async (req, res) => {
  try {
    if (!hasIdealPostcodesKey()) {
      return res.status(503).json({ error: "Address autocomplete is not configured." });
    }
    const id = typeof req.body?.id === "string" ? req.body.id.trim() : "";
    if (!id) {
      return res.status(400).json({ error: "Missing address suggestion id." });
    }

    const ip = clientIp(req);
    const ipLimit = checkRateLimit({
      key: `addr-resolve:${ip}`,
      limit: 40,
      windowMs: 15 * 60 * 1000,
    });
    if (ipLimit.ok === false) {
      res.setHeader("Retry-After", String(ipLimit.retryAfterSec));
      return res.status(429).json({
        error: "Too many address selections. Please wait a moment.",
        code: "RATE_LIMITED",
      });
    }

    const resolved = await resolveAddress(id);
    return res.json({
      success: true,
      address: resolved.formatted,
      postcode: resolved.postcode,
      postTown: resolved.postTown,
      line1: resolved.line1,
      line2: resolved.line2,
      line3: resolved.line3,
    });
  } catch (err: any) {
    console.error("[address/resolve]", err?.message || err);
    const status = typeof err?.status === "number" ? err.status : 502;
    return res.status(status).json({ error: err?.message || "Could not resolve address." });
  }
});

app.post("/api/checkout", async (req, res) => {
  try {
    if (!isPaywallEnabled()) {
      return res.status(400).json({
        error:
          "Paywall is not enabled. Add STRIPE_SECRET_KEY to .env.local (or set PAYWALL_DISABLED=true only for local free testing).",
      });
    }

    const rawUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    const rawAddress = typeof req.body?.address === "string" ? req.body.address.trim() : "";
    const buyerGoal = typeof req.body?.buyerGoal === "string" ? req.body.buyerGoal : "First-time Buyer";

    let propertyKey = "";
    let productDescription = "Single listing property report";

    if (rawAddress) {
      const addr = validateUkAddress(rawAddress);
      if (isInvalidAddress(addr)) {
        return res.status(400).json({ error: addr.error });
      }
      propertyKey = addr.propertyKey;
      productDescription = "Single address property report";
    } else if (rawUrl) {
      const listing = validateListingUrl(rawUrl);
      if (isInvalidListingUrl(listing)) {
        return res.status(400).json({ error: listing.error });
      }
      propertyKey = listing.url;
    } else {
      return res.status(400).json({
        error: "Enter a supported listing URL or a full UK address with postcode.",
      });
    }

    const publishableKey = getStripePublishableKey();
    if (!publishableKey) {
      return res.status(503).json({
        error:
          "On-site checkout needs STRIPE_PUBLISHABLE_KEY in .env.local. Copy the full pk_test_… key from Stripe Dashboard → Developers → API keys (not the sk_ secret, and not a placeholder with …). Uncomment the line, save, then restart the server.",
        mode: "missing_publishable_key",
      });
    }

    const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
    const baseUrl = getPublicBaseUrl(req.get("host") || undefined, proto);
    const session = await createReportCheckoutSession({
      propertyKey,
      buyerGoal,
      baseUrl,
      uiMode: "embedded",
      productDescription,
    });

    return res.json({
      success: true,
      sessionId: session.sessionId,
      clientSecret: session.clientSecret || null,
      mode: "embedded",
      publishableKey,
      priceLabel: formatPriceLabel(),
    });
  } catch (err: any) {
    console.error("[stripe] checkout error", err?.message || err);
    return res.status(500).json({ error: err?.message || "Could not start checkout." });
  }
});

/**
 * Free listing / address preview (NO AI). Rate-limited.
 * Full Gemini/OpenAI analysis stays behind paid /api/analyze.
 */
app.post("/api/teaser", async (req, res) => {
  try {
    const rawUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    const rawAddress = typeof req.body?.address === "string" ? req.body.address.trim() : "";

    // Address-only preview (no scrape)
    if (rawAddress && !rawUrl) {
      const addr = validateUkAddress(rawAddress);
      if (isInvalidAddress(addr)) {
        return res.status(400).json({ error: addr.error });
      }

      const cacheKey = addr.propertyKey;
      const cached = teaserCacheGet(cacheKey);
      if (cached) {
        return res.json(cached);
      }

      const ip = clientIp(req);
      const ipLimit = checkRateLimit({
        key: `teaser:ip:${ip}`,
        limit: 60,
        windowMs: 15 * 60 * 1000,
      });
      if (ipLimit.ok === false) {
        res.setHeader("Retry-After", String(ipLimit.retryAfterSec));
        return res.status(429).json({
          error: "Too many preview requests. Please wait a few minutes and try again.",
          code: "RATE_LIMITED",
        });
      }

      const payload = {
        success: true,
        limited: true,
        mode: "address" as const,
        listingUrl: "",
        portal: "Address lookup",
        host: "address",
        address: addr.address,
        price: null,
        bedrooms: null,
        bathrooms: null,
        propertyType: null,
        images: [] as string[],
        keyFeatures: [] as string[],
        tenure: null,
        summary:
          "Address lookup — we’ll research sold history, local area, risks and estimated value bands from public UK sources. No live asking price unless comps show one.",
        pricePerBedroom: null,
        locationHint: addr.locationHint,
        researchPlan: buildFullReportTeaserPlan({
          locationHint: addr.locationHint,
          bedrooms: null,
          propertyType: null,
          price: null,
          tenure: null,
        }),
      };

      teaserCacheSet(cacheKey, payload);
      return res.json(payload);
    }

    const listing = validateListingUrl(rawUrl);
    if (isInvalidListingUrl(listing)) {
      return res.status(400).json({ error: listing.error });
    }

    // Serve cached preview freely (no rate-limit hit) so re-opening the same listing works
    const cached = teaserCacheGet(listing.url);
    if (cached) {
      return res.json(cached);
    }

    const ip = clientIp(req);
    // Looser limit: enough for normal testing/browsing; still blocks scrapers
    const ipLimit = checkRateLimit({
      key: `teaser:ip:${ip}`,
      limit: 60,
      windowMs: 15 * 60 * 1000,
    });
    if (ipLimit.ok === false) {
      res.setHeader("Retry-After", String(ipLimit.retryAfterSec));
      return res.status(429).json({
        error: "Too many preview requests. Please wait a few minutes and try again.",
        code: "RATE_LIMITED",
      });
    }

    const isRightmove = listing.host.includes("rightmove.co.uk");
    let address: string | undefined;
    let price: string | undefined;
    let bedrooms: string | undefined;
    let bathrooms: string | undefined;
    let propertyType: string | undefined;
    let images: string[] = [];
    let keyFeatures: string[] = [];
    let tenure: string | undefined;
    let summary: string | undefined;
    let limited = !isRightmove;

    if (isRightmove) {
      const scrap = await scrapeRightmoveUrl(listing.url);
      if (scrap.success) {
        address = scrap.address;
        price = scrap.price;
        bedrooms = scrap.bedrooms;
        bathrooms = scrap.bathrooms;
        propertyType = scrap.propertyType;
        images = (scrap.images || []).filter(Boolean).slice(0, 3);
        keyFeatures = (scrap.keyFeatures || []).slice(0, 6);
        tenure = scrap.tenure;
        if (scrap.description) {
          const plain = scrap.description
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim();
          summary = plain.slice(0, 320);
          if (plain.length > 320) summary += "…";
        }
        limited = !(address || price);
      } else {
        limited = true;
        summary =
          "We couldn’t reliably read this Rightmove listing. Use Address lookup with the full UK address before paying.";
      }
    } else {
      summary = `${listing.portal} links can’t be read as reliably as Rightmove yet. Use Address lookup with the full UK address before paying.`;
    }

    // Cheap derived signal (no AI): price per bedroom when parseable
    let pricePerBedroom: string | null = null;
    if (price && bedrooms) {
      const pence = Number(String(price).replace(/[^\d]/g, ""));
      const beds = Number(String(bedrooms).replace(/[^\d]/g, ""));
      if (Number.isFinite(pence) && pence > 0 && Number.isFinite(beds) && beds > 0) {
        const each = Math.round(pence / beds);
        pricePerBedroom = `£${each.toLocaleString("en-GB")}`;
      }
    }

    const locationHint =
      (address || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(-2)
        .join(", ") || null;

    const payload = {
      success: true,
      limited,
      mode: "listing" as const,
      listingUrl: listing.url,
      portal: listing.portal,
      host: listing.host,
      address: address || null,
      price: price || null,
      bedrooms: bedrooms || null,
      bathrooms: bathrooms || null,
      propertyType: propertyType || null,
      images,
      keyFeatures,
      tenure: tenure || null,
      summary: summary || null,
      pricePerBedroom,
      locationHint,
      researchPlan: buildFullReportTeaserPlan({
        locationHint,
        bedrooms,
        propertyType,
        price,
        tenure,
      }),
    };

    teaserCacheSet(listing.url, payload);
    return res.json(payload);
  } catch (err: any) {
    console.error("[teaser] error", err?.message || err);
    return res.status(500).json({ error: err?.message || "Could not load preview." });
  }
});

const TEASER_CACHE_TTL_MS = 30 * 60 * 1000;
const teaserResponseCache = new Map<string, { expires: number; payload: Record<string, unknown> }>();

function teaserCacheGet(url: string): Record<string, unknown> | null {
  const hit = teaserResponseCache.get(url);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    teaserResponseCache.delete(url);
    return null;
  }
  return hit.payload;
}

function teaserCacheSet(url: string, payload: Record<string, unknown>) {
  teaserResponseCache.set(url, { expires: Date.now() + TEASER_CACHE_TTL_MS, payload });
  if (teaserResponseCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of teaserResponseCache) {
      if (now > v.expires) teaserResponseCache.delete(k);
    }
  }
}

// Ensure the dev server starts DNS searches with IPv4 first to solve local proxy address bindings
dns.setDefaultResultOrder("ipv4first");

/** Proxy listing photos so PDF export can embed them (avoids Rightmove CORS blocks). */
app.get("/api/image-proxy", async (req: express.Request, res: express.Response) => {
  try {
    const raw = typeof req.query.url === "string" ? req.query.url : "";
    if (!raw || !/^https:\/\//i.test(raw)) {
      return res.status(400).json({ error: "Valid https image url required" });
    }
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const allowed =
      host.endsWith("rightmove.co.uk") ||
      host.endsWith("zoopla.co.uk") ||
      host.endsWith("onthemarket.com") ||
      host.endsWith("cloudfront.net");
    if (!allowed) {
      return res.status(403).json({ error: "Image host not allowed" });
    }

    const upstream = await fetch(raw, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        Referer: "https://www.rightmove.co.uk/",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: "Upstream image fetch failed" });
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.send(buf);
  } catch (err: any) {
    console.error("[image-proxy]", err?.message || err);
    res.status(500).json({ error: "Image proxy failed" });
  }
});

// Property Scraper + AI analysis endpoint
app.post("/api/analyze", async (req: express.Request, res: express.Response) => {
  const { url, pastedText, buyerGoal, address, sessionId } = req.body;
  const rawAddress = typeof address === "string" ? address.trim() : "";
  const rawUrl = typeof url === "string" ? url.trim() : "";
  const checkoutSessionId = typeof sessionId === "string" ? sessionId.trim() : "";

  let manualAddress = "";
  if (rawAddress) {
    const addr = validateUkAddress(rawAddress);
    if (isInvalidAddress(addr)) {
      return res.status(400).json({ error: addr.error });
    }
    manualAddress = addr.address;
  }

  if (!rawUrl && !pastedText && !manualAddress) {
    return res.status(400).json({
      error: "Please enter a supported listing URL, a property address, or paste listing text.",
    });
  }

  let normalizedUrl = rawUrl;
  if (rawUrl) {
    const listing = validateListingUrl(rawUrl);
    if (isInvalidListingUrl(listing)) {
      return res.status(400).json({ error: listing.error });
    }
    normalizedUrl = listing.url;
  }

  const propertyKey = manualAddress
    ? addressPropertyKey(manualAddress)
    : normalizedUrl;

  // Public marketing reports require a paid Stripe Checkout session
  if (isPaywallEnabled()) {
    if (!checkoutSessionId) {
      return res.status(402).json({
        error: "Payment required. Complete checkout to generate your report.",
        code: "PAYMENT_REQUIRED",
      });
    }
    if (!propertyKey) {
      return res.status(400).json({
        error: "A valid listing URL or address is required when using a paid checkout session.",
      });
    }
    try {
      await verifyPaidCheckoutSession({
        sessionId: checkoutSessionId,
        propertyKey,
      });
    } catch (err: any) {
      const status = typeof err?.status === "number" ? err.status : 402;
      return res.status(status).json({ error: err?.message || "Payment verification failed." });
    }
  }

  const selectedGoal = buyerGoal || "First-time Buyer";

  try {
    let scrapResult = {
      success: false,
      url: normalizedUrl || (manualAddress ? "Address lookup" : "Manual Entry"),
      address: manualAddress || undefined,
    } as any;

    if (normalizedUrl && normalizedUrl.toLowerCase().includes("rightmove.co.uk")) {
      scrapResult = await scrapeRightmoveUrl(normalizedUrl);
    }

    if (manualAddress) {
      scrapResult = {
        ...scrapResult,
        success: true,
        address: manualAddress,
        url: scrapResult.url || "Address lookup",
        description:
          scrapResult.description ||
          `Address-only property check for: ${manualAddress}. No online listing provided.`,
      };
    }

    const scrap = {
      url: scrapResult.url || normalizedUrl || "Address lookup",
      address: scrapResult.address || manualAddress,
      price: scrapResult.price,
      bedrooms: scrapResult.bedrooms,
      bathrooms: scrapResult.bathrooms,
      propertyType: scrapResult.propertyType,
      description: scrapResult.description,
    };

    // Gemini is primary (works with AI Studio keys). OpenAI only if a real key is set.
    let analysis: Record<string, unknown>;
    let sources: { title: string; url: string }[] = [];
    let provider: "gemini" | "openai";

    if (hasGeminiKey()) {
      console.log("[ai] Using Gemini + Google Search research pipeline...");
      const result = await analyzeWithGemini({
        url: normalizedUrl || undefined,
        pastedText,
        manualAddress: manualAddress || undefined,
        buyerGoal: selectedGoal,
        scrap,
      });
      analysis = result.analysis;
      sources = result.sources;
      provider = "gemini";
    } else if (hasOpenAIKey()) {
      console.log("[ai] GEMINI_API_KEY missing — using OpenAI + web search...");
      const result = await analyzeWithOpenAI({
        url: normalizedUrl || undefined,
        pastedText,
        manualAddress: manualAddress || undefined,
        buyerGoal: selectedGoal,
        scrap,
      });
      analysis = result.analysis;
      sources = result.sources;
      provider = "openai";
    } else {
      return res.status(401).json({
        error:
          "No AI provider configured. Set GEMINI_API_KEY in .env.local (https://aistudio.google.com/apikey).",
      });
    }

    if (scrapResult.images && scrapResult.images.length > 0) {
      (analysis as any).scrapedImages = scrapResult.images;
    }
    (analysis as any).sources = sources;

    if (isPaywallEnabled() && checkoutSessionId) {
      markCheckoutSessionUsed(checkoutSessionId, propertyKey);
    }

    return res.json({
      success: true,
      scraped: scrapResult,
      analysis,
      provider,
    });
  } catch (error: any) {
    console.error("[api] Error during property analysis:", error);
    const raw = error?.message || String(error) || "An unexpected error occurred during analysis.";
    const isModelGone = raw.includes("no longer available");
    const isAuthKeyIssue =
      raw.includes("ACCESS_TOKEN_TYPE_UNSUPPORTED") ||
      raw.includes("UNAUTHENTICATED") ||
      raw.includes("invalid authentication credentials");

    let helpful = raw;
    if (isModelGone) {
      helpful =
        "Gemini model not available for this key. Set GEMINI_MODEL=gemini-3.5-flash (or gemini-3.1-pro-preview) in .env.local. Original: " +
        raw;
    } else if (isAuthKeyIssue) {
      helpful =
        "Gemini auth failed. Confirm GEMINI_API_KEY in .env.local matches a working AI Studio key. Original: " +
        raw;
    }

    res.status(isAuthKeyIssue ? 401 : 500).json({ error: helpful });
  }
});
// Setup dev vs production environments
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("[server] Operating in DEVELOPMENT mode. Initializing Vite dev server...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[server] Operating in PRODUCTION mode. Serving static files...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[server] Server running on http://localhost:${PORT}`);
  });
}

startServer();
