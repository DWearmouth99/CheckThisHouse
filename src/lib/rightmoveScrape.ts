/**
 * Rightmove listing scrape — PAGE_MODEL is now a flatted JSON blob, not nested propertyData.
 */

export type RightmoveScrape = {
  success: boolean;
  address?: string;
  price?: string;
  bedrooms?: string;
  bathrooms?: string;
  propertyType?: string;
  description?: string;
  images?: string[];
  keyFeatures?: string[];
  tenure?: string;
  message?: string;
};

function extractJsonObjectAfter(html: string, marker: string): string | null {
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  let i = idx + marker.length;
  while (i < html.length && /\s/.test(html[i]!)) i++;
  if (html[i] !== "{") return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  const start = i;
  for (; i < html.length; i++) {
    const c = html[i]!;
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return html.slice(start, i + 1);
    }
  }
  return null;
}

/** Reconstruct objects from Rightmove's flatted PAGE_MODEL.data array. */
function unflatten(data: string | unknown[]): unknown {
  const arr: unknown[] = typeof data === "string" ? JSON.parse(data) : data;
  const memo: unknown[] = new Array(arr.length);

  function resolve(v: unknown): unknown {
    if (typeof v !== "number") return v;
    if (memo[v] !== undefined) return memo[v];
    const node = arr[v];
    if (node === null || typeof node !== "object") {
      memo[v] = node;
      return node;
    }
    if (Array.isArray(node)) {
      const out: unknown[] = [];
      memo[v] = out;
      for (const item of node) out.push(resolve(item));
      return out;
    }
    const out: Record<string, unknown> = {};
    memo[v] = out;
    for (const [k, val] of Object.entries(node as Record<string, unknown>)) {
      out[k] = resolve(val);
    }
    return out;
  }

  return resolve(0);
}

function isLikelyBotChallenge(html: string): boolean {
  // Do NOT match the word "Cloudflare" alone — real listing pages mention it in cookie copy.
  const lower = html.toLowerCase();
  if (html.length < 8000 && (lower.includes("just a moment") || lower.includes("cf-browser-verification"))) {
    return true;
  }
  if (lower.includes("cf-challenge") || lower.includes("attention required! | cloudflare")) {
    return true;
  }
  if (lower.includes("unusual activity") && lower.includes("security check")) {
    return true;
  }
  return false;
}

function applyPropertyData(p: any, data: Record<string, any>): boolean {
  if (!p || typeof p !== "object") return false;
  data.address = p.address?.displayAddress || p.address?.outcode || p.address?.streetAddress;
  data.price = p.prices?.primaryPrice;
  if (p.bedrooms != null) data.bedrooms = String(p.bedrooms);
  if (p.bathrooms != null) data.bathrooms = String(p.bathrooms);
  data.propertyType = p.propertySubType || p.propertyType || p.transactionType;
  data.description = p.text?.description;
  data.tenure =
    p.tenure?.tenureType ||
    (p.tenure?.yearsRemaining != null ? String(p.tenure.yearsRemaining) : undefined) ||
    (typeof p.tenure === "string" ? p.tenure : undefined);
  if (Array.isArray(p.keyFeatures)) {
    data.keyFeatures = p.keyFeatures
      .map((f: unknown) => (typeof f === "string" ? f.trim() : ""))
      .filter(Boolean)
      .slice(0, 8);
  }
  if (Array.isArray(p.images)) {
    data.images = p.images
      .slice(0, 5)
      .map((img: any) => img?.url || img?.src || (typeof img === "string" ? img : null))
      .filter(Boolean);
  }
  return !!(data.address || data.price);
}

function parsePageModel(html: string): Record<string, any> | null {
  const data: Record<string, any> = {};

  // Current Rightmove: PAGE_MODEL = { "data": "<flatted json array string>" }
  const modern = extractJsonObjectAfter(html, "PAGE_MODEL =") || extractJsonObjectAfter(html, "window.PAGE_MODEL =");
  if (modern) {
    try {
      const parsed = JSON.parse(modern);
      if (typeof parsed?.data === "string" || Array.isArray(parsed?.data)) {
        const model = unflatten(parsed.data) as any;
        if (applyPropertyData(model?.propertyData, data)) return data;
      }
      // Legacy nested shape
      if (parsed?.propertyData && applyPropertyData(parsed.propertyData, data)) return data;
    } catch (err) {
      console.warn("[scraper] PAGE_MODEL parse failed:", err);
    }
  }

  return null;
}

function parseFallback(html: string): Record<string, any> {
  const data: Record<string, any> = {};
  const titleMatch = html.match(/<title>(.*?)<\/title>/i);
  if (titleMatch?.[1]) {
    data.address = titleMatch[1].replace(/\s*[-|]\s*Rightmove.*$/i, "").trim();
  }

  const priceMeta =
    html.match(/<meta\s+property="og:price:amount"\s+content="([^"]+)"/i) ||
    html.match(/<meta\s+name="price"\s+content="([^"]+)"/i);
  const currencyMeta = html.match(/<meta\s+property="og:price:currency"\s+content="([^"]+)"/i);
  if (priceMeta?.[1]) {
    const cur = currencyMeta?.[1] === "GBP" || !currencyMeta?.[1] ? "£" : currencyMeta[1];
    data.price = `${cur}${Number(priceMeta[1]).toLocaleString("en-GB")}`;
  } else {
    const regexPrice = html.match(/£[0-9]{1,3}(?:,[0-9]{3})+/);
    if (regexPrice) data.price = regexPrice[0];
  }

  const descMeta =
    html.match(/<meta\s+name="description"\s+content="([^"]+)"/i) ||
    html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
  if (descMeta?.[1]) data.description = descMeta[1];

  const bedMatch = html.match(/([0-9]+)\s*bedroom/i) || html.match(/bedroom[s]?\s*:\s*([0-9]+)/i);
  if (bedMatch) data.bedrooms = bedMatch[1];

  const images: string[] = [];
  const imgRegex =
    /https:\/\/media\.rightmove\.co\.uk\/(?:dir\/[0-9k]+\/[0-9]+\/[^'"]+?_max_[0-9]+x[0-9]+|property-photo\/[^'"]+)\.(?:jpeg|jpg|png)/gi;
  let match: RegExpExecArray | null;
  while ((match = imgRegex.exec(html)) !== null && images.length < 5) {
    if (!images.includes(match[0])) images.push(match[0]);
  }
  if (images.length > 0) data.images = images;

  return data;
}

export async function scrapeRightmoveUrl(targetUrl: string): Promise<RightmoveScrape> {
  try {
    const headers = {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      Referer: "https://www.google.com/",
    };

    console.log(`[scraper] Attempting to fetch Rightmove URL: ${targetUrl}`);
    const res = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(15000) });

    if (!res.ok) {
      console.warn(`[scraper] HTTP status error: ${res.status}. Probably blocked by Rightmove.`);
      return {
        success: false,
        message: `Status ${res.status} returned by Rightmove. Anti-bot protections may be blocking the server. Web search research will fill gaps.`,
      };
    }

    const html = await res.text();
    console.log(`[scraper] Received ${html.length} bytes of HTML.`);

    if (isLikelyBotChallenge(html)) {
      console.warn("[scraper] Rightmove returned a bot challenge page.");
      return {
        success: false,
        message: "Rightmove blocked access with a security challenge. Web search research will fill gaps.",
      };
    }

    let data = parsePageModel(html);
    if (data) {
      console.log("[scraper] Successfully parsed PAGE_MODEL data!");
    } else {
      console.log("[scraper] PAGE_MODEL fallback parsing initiated.");
      data = parseFallback(html);
    }

    return {
      success: !!(data.address || data.price),
      address: data.address,
      price: data.price,
      bedrooms: data.bedrooms,
      bathrooms: data.bathrooms,
      propertyType: data.propertyType,
      description: data.description,
      images: data.images,
      keyFeatures: data.keyFeatures,
      tenure: data.tenure,
      message:
        data.address || data.price
          ? undefined
          : "Fetched listing successfully, but most data was empty or structured differently.",
    };
  } catch (error: any) {
    console.error("[scraper] Fetch error:", error);
    return {
      success: false,
      message: `Failed to connect or fetch page: ${error.message || "Timeout"}. Web search research will fill gaps.`,
    };
  }
}
