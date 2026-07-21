import OpenAI from "openai";
import {
  formatPlanningBrief,
  lookupPlanningApplications,
  planningSources,
} from "./planningLookup";
import { propertyAnalysisJsonSchema } from "./propertyAnalysisSchema";
import { applyStampDutyEstimate, UK_PROPERTY_TAX_RULES_PROMPT } from "./ukPropertyTax";
import { sanitizeOfferStrategy } from "./sanitizeOfferStrategy";
import { refineRiskTones } from "./refineRiskTones";

export type ScrapContext = {
  url?: string;
  address?: string;
  price?: string;
  bedrooms?: string;
  bathrooms?: string;
  propertyType?: string;
  description?: string;
};

export type AnalyzeInput = {
  url?: string;
  pastedText?: string;
  manualAddress?: string;
  buyerGoal: string;
  scrap: ScrapContext;
};

export type AnalyzeResult = {
  analysis: Record<string, unknown>;
  sources: { title: string; url: string }[];
  provider: "openai";
};

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing. Add it to .env.local from https://platform.openai.com/api-keys");
  }
  return new OpenAI({ apiKey });
}

function buildListingBrief(input: AnalyzeInput) {
  const description =
    input.pastedText?.substring(0, 15000) ||
    input.scrap.description ||
    "No scraped description available.";

  return `
Listing URL: ${input.url || input.scrap.url || "Manual Entry"}
Buyer goal: ${input.buyerGoal}
Address: ${input.manualAddress || input.scrap.address || "Unknown"}
Asking price: ${input.scrap.price || "Unknown"}
Bedrooms: ${input.scrap.bedrooms || "Not specified"}
Bathrooms: ${input.scrap.bathrooms || "Not specified"}
Property type: ${input.scrap.propertyType || "Not specified"}
Description / features:
${description}
`.trim();
}

function extractOutputText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text;
  }
  const parts: string[] = [];
  for (const item of response?.output || []) {
    if (item?.type === "message") {
      for (const content of item.content || []) {
        if (content?.type === "output_text" && content.text) parts.push(content.text);
        if (content?.type === "text" && content.text) parts.push(content.text);
      }
    }
  }
  return parts.join("\n").trim();
}

function extractSources(response: any): { title: string; url: string }[] {
  const sources: { title: string; url: string }[] = [];
  const seen = new Set<string>();

  const push = (title: string, url: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    sources.push({ title: title || "Web reference", url });
  };

  for (const item of response?.output || []) {
    if (item?.type === "web_search_call") continue;
    if (item?.type === "message") {
      for (const content of item.content || []) {
        const annotations = content?.annotations || [];
        for (const ann of annotations) {
          if (ann?.type === "url_citation" && ann.url) {
            push(ann.title || ann.url, ann.url);
          }
        }
      }
    }
  }

  return sources.slice(0, 12);
}

/**
 * Two-phase analysis:
 * 1) Web search research brief (live UK comps / area intel)
 * 2) Strict JSON property report from listing + research
 */
export async function analyzeWithOpenAI(input: AnalyzeInput): Promise<AnalyzeResult> {
  const client = getOpenAIClient();
  const listingBrief = buildListingBrief(input);
  const model = process.env.OPENAI_MODEL || "gpt-4.1";
  const addressForPlanning = input.manualAddress || input.scrap.address || "";

  console.log("[ai] Council planning portal lookup...");
  let planningBlock = "";
  const planning = addressForPlanning
    ? await lookupPlanningApplications(addressForPlanning)
    : null;
  if (planning) {
    planningBlock = formatPlanningBrief(planning);
    console.log(
      `[ai] Planning: ${planning.council} — ${planning.matchedToProperty.length} match(es) for property`
    );
  }

  console.log("[ai] OpenAI phase 1: web search research...");
  const research = await client.responses.create({
    model,
    tools: [{ type: "web_search_preview" as const }],
    input: [
      {
        role: "system",
        content:
          "You are a UK property research analyst. Use web search to find factual, recent information. Prefer Land Registry, Rightmove, Zoopla, Ofsted, police.uk, GOV.UK flood maps, local council planning portals (Idox/Public Access/Planning Portal), EPC register, and reputable local news. Always search for planning applications and extensions at the exact address. When AUTHORITATIVE COUNCIL PLANNING RECORDS are supplied, treat them as ground truth and never claim there is no extension/planning data if those records list works. Be specific about postcodes, streets, dates, and planning refs. If data is uncertain, say so.",
      },
      {
        role: "user",
        content: `Research this UK property for an investment / purchase report.

${listingBrief}

${planningBlock ? `${planningBlock}\n` : ""}
Find and summarise with sources where possible:
1. Past sold prices on this street/postcode (Land Registry / portals)
2. Nearby comparable sales (note extended vs unextended comps if known; £ and dates)
3. Schools (Ofsted/HMIE), transport links with journey times, crime relative to UK average
4. Flood / regeneration signals
5. **Property works & planning (critical):** Prefer AUTHORITATIVE COUNCIL PLANNING RECORDS when present. Include refs and decisions; only say none found if portal + search both show nothing for this exact address.
6. Typical rents and yields for this property type in the area
7. Any leasehold/cladding/fire safety red flags if relevant
8. EPC / energy costs, broadband/mobile coverage, council tax band, parking / CPZ if findable
9. Purchase cost stack: stamp duty or LBTT(+ADS), typical solicitor/survey fees
10. Competing similar listings nearby and any days-on-market / price-cut signals
11. £/sqft or £/sqm vs local averages when floor area is available

Return a dense research brief (not JSON). Include concrete figures, place names, and planning references.`,
      },
    ],
  });

  const researchNotes = extractOutputText(research) || "No web research returned.";
  const sources = [
    ...extractSources(research),
    ...(planning ? planningSources(planning) : []),
  ];

  console.log("[ai] OpenAI phase 2: structured valuation report...");
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.2,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "property_analysis",
        strict: true,
        schema: propertyAnalysisJsonSchema as unknown as Record<string, unknown>,
      },
    },
    messages: [
      {
        role: "system",
        content:
          "You are an independent, direct UK property valuer. No fluffy marketing. Use the listing and research brief as evidence. Never ignore evidenced extensions when valuing. When AUTHORITATIVE COUNCIL PLANNING RECORDS list extensions, propertyWorks must reflect them. Populate every JSON field with concrete values. If a figure is estimated, make that clear in the string. Tailor pros/cons/suitability to the buyer goal.",
      },
      {
        role: "user",
        content: `Produce the full property analysis JSON.

Buyer goal: ${input.buyerGoal}

LISTING:
${listingBrief}

${planningBlock ? `${planningBlock}\n` : ""}
WEB RESEARCH BRIEF:
${researchNotes}

${UK_PROPERTY_TAX_RULES_PROMPT}

Requirements:
- Pros/cons tailored to the buyer goal (at least 7–8 each) with specific, evidence-backed descriptions (2–3 sentences with streets, £, school names, planning refs where known — not fluff)
- At least 6 comparable sales and 5 sold-history entries when research supports them; invent none
- Viewing checklist (10+) and agent questions (10+) — include extension/planning compliance checks where relevant
- Offer strategy MUST be commercially realistic:
  - lowOffer typically 3–6% below asking if fairly priced; never more than ~8% below unless comps show clear overpricing
  - fairOffer near the lower of asking and fair valuation
  - premiumOffer (walk-away) typically asking to +2–3%; never more than ~5% over asking without bidding-war evidence
  - At least 6 negotiation tips grounded in evidence
- Scores 0-100; growthPotential and riskLevel must be Low|Medium|High
- investmentMetrics.stampDuty must use correct nation tax (Scotland LBTT + ADS at 8% from 5 Dec 2024, never 6%)
- Populate propertyWorks (extensions, planning applications, value impact, certainty) from council records when present
- Populate riskTones for every risk field (positive|caution|negative|neutral). Approved value-adding extensions = positive for planningDevelopments; low flood = positive; freehold with no issues = positive for leaseholdIssues
- Populate marketEvidence from research (asking vs solds, competing supply, £/sqft if known, negotiation levers) — never invent listings
- Populate dueDiligence thoroughly: EPC/energy, broadband/mobile, tenure/legal, council tax/parking, purchase cost stack, other environmental flags, ownership/chain notes, and 6–10 recommendedNextSteps
- If extensions/works are evidenced, valuation bands and forecasts MUST reflect the improved property — not the original footprint
- If no works found in public sources, say so in propertyWorks`,
      },
    ],
  });

  const raw = completion.choices[0]?.message?.content || "{}";
  let analysis: Record<string, unknown>;
  try {
    analysis = JSON.parse(raw);
  } catch {
    throw new Error("OpenAI returned invalid JSON for the property analysis.");
  }

  analysis.sources = sources;
  if (!analysis.propertyWorks || typeof analysis.propertyWorks !== "object") {
    analysis.propertyWorks = {
      extensionsAndAlterations:
        "Not summarised — verify extensions on the local council planning portal and with a surveyor.",
      planningApplications:
        "No structured planning summary returned. Search the council Public Access / Planning Portal for this address.",
      valueImpact:
        "Confirm any completed extensions before relying on value bands; extended homes often outperform unextended street comps.",
      certainty: "Low until planning history is manually confirmed.",
    };
  }
  if (!analysis.dueDiligence || typeof analysis.dueDiligence !== "object") {
    analysis.dueDiligence = {
      epcAndEnergy: "Check the EPC register for the current band and estimated running costs before offering.",
      broadbandAndMobile: "Confirm broadband availability and mobile coverage on Ofcom / provider checkers for this postcode.",
      tenureAndLegal: "Confirm freehold/leasehold, remaining term, ground rent and any title restrictions with a conveyancer.",
      councilTaxAndParking: "Verify council tax band and any parking permit or controlled-parking zone rules with the local authority.",
      purchaseCosts:
        "Budget for stamp duty/LBTT (and ADS if relevant), solicitor fees, survey and moving costs on top of the deposit.",
      environmentalOther: "Ask your surveyor about radon, mining, conservation constraints and other local environmental factors.",
      ownershipAndChain: "Ask how long the seller has owned the property and whether the sale is part of a chain.",
      recommendedNextSteps: [
        "Book a viewing and complete the checklist in this report",
        "Instruct a solicitor early and share this report",
        "Order an appropriate level survey",
        "Confirm insurance quote before offering",
        "Cross-check planning history on the council portal",
      ],
    };
  }
  if (!analysis.riskTones || typeof analysis.riskTones !== "object") {
    analysis.riskTones = {
      floodRisk: "neutral",
      subsidence: "neutral",
      planningDevelopments: "neutral",
      leaseholdIssues: "neutral",
      fireSafety: "neutral",
      insuranceRisk: "neutral",
    };
  }
  if (!analysis.marketEvidence || typeof analysis.marketEvidence !== "object") {
    analysis.marketEvidence = {
      askingVsSoldEvidence:
        "Compare the asking price carefully against the sold comps in this report before locking an offer.",
      competingSupply: "Check live portals for similar nearby listings on the day you offer.",
      pricePerSqmOrSqft: "Confirm floor area from the EPC or measured survey before relying on £/sqft comparisons.",
      negotiationLevers:
        "Use days on market, survey findings, chain status and any incomplete works as leverage — not arbitrary lowballs.",
    };
  }
  if (planning && planning.matchedToProperty.length > 0) {
    const pw = analysis.propertyWorks as Record<string, string>;
    const thin =
      !pw.planningApplications ||
      /no (structured )?planning|none found|no data|not summarised|not found/i.test(
        `${pw.extensionsAndAlterations || ""} ${pw.planningApplications || ""}`
      );
    if (thin) {
      const ext = planning.matchedToProperty.filter((a) =>
        /extension|loft|alteration|conservatory|outbuilding|garage|conversion/i.test(a.proposal)
      );
      pw.extensionsAndAlterations =
        ext.length > 0
          ? ext.map((a) => `${a.proposal} (${a.reference}, ${a.status})`).join("; ")
          : planning.matchedToProperty.map((a) => `${a.proposal} (${a.reference})`).join("; ");
      pw.planningApplications = planning.matchedToProperty
        .map(
          (a) =>
            `${a.reference}: ${a.proposal} — ${a.status}${a.received ? ` (received ${a.received})` : ""} [${planning.council}]`
        )
        .join(" | ");
      if (!pw.certainty || /low until|manually confirm/i.test(pw.certainty)) {
        pw.certainty = `High for planning refs listed — sourced directly from ${planning.council} online planning portal. Confirm build quality and building control with a surveyor.`;
      }
      if (!pw.valueImpact || /confirm any completed/i.test(pw.valueImpact)) {
        pw.valueImpact =
          ext.length > 0
            ? "Council records show extension/alteration applications at this address — fair value and forecasts should reflect the improved dwelling versus unextended street comps, pending survey confirmation that works were completed as approved."
            : "Council planning history exists for this address; weigh decided applications when comparing to unextended comps.";
      }
      analysis.propertyWorks = pw;
    }
  }
  applyStampDutyEstimate(analysis, input.buyerGoal);
  refineRiskTones(analysis);
  const valuation = analysis.valuation as { fair?: string; conservative?: string; optimistic?: string } | undefined;
  analysis.offerStrategy = sanitizeOfferStrategy(
    analysis.offerStrategy as {
      lowOffer: string;
      fairOffer: string;
      premiumOffer: string;
      negotiationTips: string[];
    },
    {
      asking: String(analysis.price || input.scrap.price || ""),
      fairValue: valuation?.fair,
      conservative: valuation?.conservative,
      optimistic: valuation?.optimistic,
    }
  );
  return { analysis, sources, provider: "openai" };
}

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "MY_OPENAI_API_KEY");
}
