import { GoogleGenAI, Type } from "@google/genai";
import {
  formatPlanningBrief,
  lookupPlanningApplications,
  planningSources,
} from "./planningLookup";
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
  provider: "gemini";
};

const DEFAULT_MODEL = "gemini-3.1-pro-preview";

/** Gemini Type schema — used only on the structured (no-tools) pass */
export const geminiAnalysisSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    price: { type: Type.STRING },
    bedrooms: { type: Type.STRING },
    bathrooms: { type: Type.STRING },
    propertyType: { type: Type.STRING },
    location: {
      type: Type.OBJECT,
      properties: {
        address: { type: Type.STRING },
        postcode: { type: Type.STRING },
        town: { type: Type.STRING },
      },
      required: ["address", "postcode", "town"],
    },
    summary: { type: Type.STRING },
    specs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING },
          value: { type: Type.STRING },
        },
        required: ["label", "value"],
      },
    },
    scores: {
      type: Type.OBJECT,
      properties: {
        overall: { type: Type.NUMBER },
        valueForMoney: { type: Type.NUMBER },
        locationRating: { type: Type.NUMBER },
        conditionRating: { type: Type.NUMBER },
        investmentScore: { type: Type.NUMBER },
        marketScore: { type: Type.NUMBER },
        rentalScore: { type: Type.NUMBER },
        growthPotential: { type: Type.STRING },
        riskLevel: { type: Type.STRING },
        confidenceScore: { type: Type.NUMBER },
      },
      required: [
        "overall",
        "valueForMoney",
        "locationRating",
        "conditionRating",
        "investmentScore",
        "marketScore",
        "rentalScore",
        "growthPotential",
        "riskLevel",
        "confidenceScore",
      ],
    },
    valuation: {
      type: Type.OBJECT,
      properties: {
        conservative: { type: Type.STRING },
        fair: { type: Type.STRING },
        optimistic: { type: Type.STRING },
        forecast1y: { type: Type.STRING },
        forecast3y: { type: Type.STRING },
        forecast5y: { type: Type.STRING },
        forecast10y: { type: Type.STRING },
      },
      required: [
        "conservative",
        "fair",
        "optimistic",
        "forecast1y",
        "forecast3y",
        "forecast5y",
        "forecast10y",
      ],
    },
    investmentMetrics: {
      type: Type.OBJECT,
      properties: {
        estimatedRent: { type: Type.STRING },
        grossYield: { type: Type.STRING },
        netYield: { type: Type.STRING },
        roi: { type: Type.STRING },
        cashflow: { type: Type.STRING },
        stampDuty: { type: Type.STRING },
        breakEven: { type: Type.STRING },
        irr: { type: Type.STRING },
        growthReasoning: { type: Type.STRING },
      },
      required: [
        "estimatedRent",
        "grossYield",
        "netYield",
        "roi",
        "cashflow",
        "stampDuty",
        "breakEven",
        "irr",
        "growthReasoning",
      ],
    },
    marketAndRental: {
      type: Type.OBJECT,
      properties: {
        supplyDemand: { type: Type.STRING },
        timeOnMarket: { type: Type.STRING },
        priceTrend: { type: Type.STRING },
        vacancyRates: { type: Type.STRING },
        tenantProfile: { type: Type.STRING },
        airbnbPotential: { type: Type.STRING },
      },
      required: [
        "supplyDemand",
        "timeOnMarket",
        "priceTrend",
        "vacancyRates",
        "tenantProfile",
        "airbnbPotential",
      ],
    },
    riskAnalysis: {
      type: Type.OBJECT,
      properties: {
        floodRisk: { type: Type.STRING },
        subsidence: { type: Type.STRING },
        planningDevelopments: { type: Type.STRING },
        leaseholdIssues: { type: Type.STRING },
        fireSafety: { type: Type.STRING },
        insuranceRisk: { type: Type.STRING },
      },
      required: [
        "floodRisk",
        "subsidence",
        "planningDevelopments",
        "leaseholdIssues",
        "fireSafety",
        "insuranceRisk",
      ],
    },
    riskTones: {
      type: Type.OBJECT,
      properties: {
        floodRisk: { type: Type.STRING, enum: ["positive", "caution", "negative", "neutral"] },
        subsidence: { type: Type.STRING, enum: ["positive", "caution", "negative", "neutral"] },
        planningDevelopments: {
          type: Type.STRING,
          enum: ["positive", "caution", "negative", "neutral"],
        },
        leaseholdIssues: { type: Type.STRING, enum: ["positive", "caution", "negative", "neutral"] },
        fireSafety: { type: Type.STRING, enum: ["positive", "caution", "negative", "neutral"] },
        insuranceRisk: { type: Type.STRING, enum: ["positive", "caution", "negative", "neutral"] },
      },
      required: [
        "floodRisk",
        "subsidence",
        "planningDevelopments",
        "leaseholdIssues",
        "fireSafety",
        "insuranceRisk",
      ],
    },
    marketEvidence: {
      type: Type.OBJECT,
      properties: {
        askingVsSoldEvidence: { type: Type.STRING },
        competingSupply: { type: Type.STRING },
        pricePerSqmOrSqft: { type: Type.STRING },
        negotiationLevers: { type: Type.STRING },
      },
      required: [
        "askingVsSoldEvidence",
        "competingSupply",
        "pricePerSqmOrSqft",
        "negotiationLevers",
      ],
    },
    locationIntelligence: {
      type: Type.OBJECT,
      properties: {
        plannedInfrastructure: { type: Type.STRING },
        populationGrowth: { type: Type.STRING },
        regenerationProjects: { type: Type.STRING },
        walkability: { type: Type.STRING },
      },
      required: [
        "plannedInfrastructure",
        "populationGrowth",
        "regenerationProjects",
        "walkability",
      ],
    },
    advanced: {
      type: Type.OBJECT,
      properties: {
        undervaluedExplanation: { type: Type.STRING },
        renovationROI: { type: Type.STRING },
        developmentOpportunity: { type: Type.STRING },
      },
      required: ["undervaluedExplanation", "renovationROI", "developmentOpportunity"],
    },
    propertyWorks: {
      type: Type.OBJECT,
      properties: {
        extensionsAndAlterations: { type: Type.STRING },
        planningApplications: { type: Type.STRING },
        valueImpact: { type: Type.STRING },
        certainty: { type: Type.STRING },
      },
      required: [
        "extensionsAndAlterations",
        "planningApplications",
        "valueImpact",
        "certainty",
      ],
    },
    dueDiligence: {
      type: Type.OBJECT,
      properties: {
        epcAndEnergy: { type: Type.STRING },
        broadbandAndMobile: { type: Type.STRING },
        tenureAndLegal: { type: Type.STRING },
        councilTaxAndParking: { type: Type.STRING },
        purchaseCosts: { type: Type.STRING },
        environmentalOther: { type: Type.STRING },
        ownershipAndChain: { type: Type.STRING },
        recommendedNextSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: [
        "epcAndEnergy",
        "broadbandAndMobile",
        "tenureAndLegal",
        "councilTaxAndParking",
        "purchaseCosts",
        "environmentalOther",
        "ownershipAndChain",
        "recommendedNextSteps",
      ],
    },
    pros: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          desc: { type: Type.STRING },
          category: { type: Type.STRING },
        },
        required: ["title", "desc", "category"],
      },
    },
    cons: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          desc: { type: Type.STRING },
          category: { type: Type.STRING },
        },
        required: ["title", "desc", "category"],
      },
    },
    soldHistory: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          year: { type: Type.STRING },
          price: { type: Type.STRING },
          source: { type: Type.STRING },
          description: { type: Type.STRING },
        },
        required: ["year", "price", "source", "description"],
      },
    },
    comparableSales: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          address: { type: Type.STRING },
          price: { type: Type.STRING },
          soldDate: { type: Type.STRING },
          similarity: { type: Type.STRING },
        },
        required: ["address", "price", "soldDate", "similarity"],
      },
    },
    areaAnalysis: {
      type: Type.OBJECT,
      properties: {
        schools: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              distance: { type: Type.STRING },
              rating: { type: Type.STRING },
            },
            required: ["name", "distance", "rating"],
          },
        },
        transport: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              line: { type: Type.STRING },
              time: { type: Type.STRING },
            },
            required: ["type", "line", "time"],
          },
        },
        crimeSafety: {
          type: Type.OBJECT,
          properties: {
            rating: { type: Type.STRING },
            description: { type: Type.STRING },
          },
          required: ["rating", "description"],
        },
        demographics: { type: Type.STRING },
        amenities: { type: Type.ARRAY, items: { type: Type.STRING } },
        futureOutlook: { type: Type.STRING },
      },
      required: [
        "schools",
        "transport",
        "crimeSafety",
        "demographics",
        "amenities",
        "futureOutlook",
      ],
    },
    buyingSuitability: { type: Type.STRING },
    viewingChecks: { type: Type.ARRAY, items: { type: Type.STRING } },
    offerStrategy: {
      type: Type.OBJECT,
      properties: {
        lowOffer: { type: Type.STRING },
        fairOffer: { type: Type.STRING },
        premiumOffer: { type: Type.STRING },
        negotiationTips: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ["lowOffer", "fairOffer", "premiumOffer", "negotiationTips"],
    },
    agentQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: [
    "title",
    "price",
    "bedrooms",
    "bathrooms",
    "propertyType",
    "location",
    "summary",
    "specs",
    "scores",
    "valuation",
    "investmentMetrics",
    "marketAndRental",
    "riskAnalysis",
    "riskTones",
    "locationIntelligence",
    "advanced",
    "propertyWorks",
    "dueDiligence",
    "marketEvidence",
    "pros",
    "cons",
    "soldHistory",
    "comparableSales",
    "areaAnalysis",
    "buyingSuitability",
    "viewingChecks",
    "offerStrategy",
    "agentQuestions",
  ],
};

export function hasGeminiKey() {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return Boolean(key && key !== "MY_GEMINI_API_KEY" && key !== "PLACEHOLDER_REPLACE_OR_USE_OPENAI");
}

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing. Add it to .env.local from https://aistudio.google.com/apikey");
  }
  return new GoogleGenAI({ apiKey });
}

function buildListingBrief(input: AnalyzeInput) {
  const description =
    input.pastedText?.substring(0, 15000) ||
    input.scrap.description ||
    (input.manualAddress
      ? "No listing description — research this address using public UK property data."
      : "No scraped description available.");

  const address =
    input.manualAddress ||
    input.scrap.address ||
    "Unknown";

  return `
Mode: ${input.manualAddress ? "ADDRESS LOOKUP (no online listing required)" : "LISTING ANALYSIS"}
Listing URL: ${input.url || input.scrap.url || (input.manualAddress ? "N/A — address-only lookup" : "Manual Entry")}
Buyer goal: ${input.buyerGoal}
Address / search target: ${address}
Asking price: ${input.scrap.price || (input.manualAddress ? "Unknown — estimate from comps" : "Unknown")}
Bedrooms: ${input.scrap.bedrooms || "Not specified"}
Bathrooms: ${input.scrap.bathrooms || "Not specified"}
Property type: ${input.scrap.propertyType || "Not specified"}
Description / features:
${description}
`.trim();
}

function extractSources(response: any): { title: string; url: string }[] {
  const sources: { title: string; url: string }[] = [];
  const seen = new Set<string>();
  const chunks = response?.candidates?.[0]?.groundingMetadata?.groundingChunks;
  if (!chunks) return sources;
  for (const chunk of chunks) {
    const uri = chunk?.web?.uri;
    if (!uri || seen.has(uri)) continue;
    seen.add(uri);
    sources.push({ title: chunk.web?.title || "Web reference", url: uri });
  }
  return sources.slice(0, 12);
}

function parseJsonText(raw: string) {
  let text = (raw || "{}").trim();
  if (text.startsWith("```json")) text = text.replace(/^```json\n?/, "").replace(/\n?```$/, "");
  else if (text.startsWith("```")) text = text.replace(/^```\n?/, "").replace(/\n?```$/, "");
  return JSON.parse(text);
}

/**
 * Two-phase Gemini analysis:
 * 1) Google Search grounding (no JSON schema — API forbids combining them)
 * 2) Structured JSON report from listing + research notes
 */
export async function analyzeWithGemini(input: AnalyzeInput): Promise<AnalyzeResult> {
  const ai = getClient();
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const listingBrief = buildListingBrief(input);
  const addressForPlanning =
    input.manualAddress || input.scrap.address || "";

  console.log("[ai] Council planning portal lookup...");
  let planningBlock = "";
  const planning = addressForPlanning
    ? await lookupPlanningApplications(addressForPlanning)
    : null;
  if (planning) {
    planningBlock = formatPlanningBrief(planning);
    console.log(
      `[ai] Planning: ${planning.council} — ${planning.matchedToProperty.length} match(es) for property, ${planning.applications.length} total hits`
    );
  } else {
    console.log("[ai] Planning: no mapped council portal for this postcode (AI web search only)");
  }

  console.log(`[ai] Gemini phase 1: Google Search research (${model})...`);
  const researchFocus = input.manualAddress
    ? `This is an ADDRESS-ONLY lookup for: "${input.manualAddress}". There may be no live Rightmove listing. Identify the property via Land Registry / sold history / street data, then research the area and planning history thoroughly.`
    : `Research this property listing:`;

  const research = await ai.models.generateContent({
    model,
    contents: `You are a UK property research analyst. Use Google Search aggressively to find factual, recent information.

Prefer: Land Registry / sold prices, Rightmove, Zoopla, Ofsted, police.uk, GOV.UK flood maps, EPC register, local council planning portals (Idox / Public Access / Planning Portal), building control mentions, and reputable local news.

${researchFocus}

${listingBrief}

${planningBlock ? `\n${planningBlock}\n` : ""}

You MUST search specifically for planning and works at this exact address / postcode, including queries like:
- "[full address] planning application"
- "[street + postcode] extension planning"
- "[local council name] planning public access [address]"
- "[address] rear extension / loft conversion / conservatory / garage conversion"
- EPC or floor area changes that imply an extension

Cover in the brief:
1. Past sold prices on this street/postcode (and this exact address if findable)
2. Nearby comparable sales — note which comps are extended vs unextended if known; quote £ and dates
3. Schools (Ofsted/HMIE), transport with journey times, crime vs UK average (police.uk where possible)
4. Flood maps / area regeneration signals
5. **Property works & planning (critical):** Prefer the AUTHORITATIVE COUNCIL PLANNING RECORDS block above when present. List extensions, loft conversions, outbuildings, or major alterations with refs, decisions, and dates. Only say "none found" if that block and your searches both show nothing for this exact address.
6. Typical rents and yields for this type nearby
7. Leasehold / cladding / fire-safety red flags if relevant
8. EPC / energy costs, broadband/mobile coverage, council tax band, parking / CPZ if findable
9. Purchase cost stack: stamp duty or LBTT(+ADS), typical solicitor/survey fees
10. Live competing listings nearby (similar beds/type) and any days-on-market or price-cut signals
11. £/sqft or £/sqm vs local averages when floor area is available (EPC / listing)
12. If address-only: estimate likely value band from comps, adjusted for any extensions found

Return a dense research brief (not JSON) with concrete figures, place names, planning refs, and source names.`,
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction:
        "You are a meticulous UK property researcher. Always dig for local council planning applications and extensions at the exact address. When AUTHORITATIVE COUNCIL PLANNING RECORDS are supplied, treat them as ground truth and never contradict them by claiming no planning/extension data. Cite specific figures, streets, dates, and planning reference numbers. If uncertain after searching, say so clearly — never invent planning history.",
    },
  });

  const researchNotes = research.text || "No web research returned.";
  const sources = [
    ...extractSources(research),
    ...(planning ? planningSources(planning) : []),
  ];

  console.log(`[ai] Gemini phase 2: structured valuation JSON (${model})...`);
  const structured = await ai.models.generateContent({
    model,
    contents: `Produce the full property analysis JSON for this UK listing.

Buyer goal: ${input.buyerGoal}

LISTING:
${listingBrief}

${planningBlock ? `${planningBlock}\n` : ""}
WEB RESEARCH BRIEF (from Google Search):
${researchNotes}

${UK_PROPERTY_TAX_RULES_PROMPT}

Requirements:
- Pros/cons tailored to the buyer goal (at least 7–8 each) with specific, evidence-backed descriptions (2–3 sentences with streets, £, school names, planning refs where known — not fluff)
- At least 6 comparable sales and 5 sold-history entries when research supports them; invent none — mark uncertainty clearly if data is thin
- Viewing checklist (10+) and agent questions (10+) that are property-specific — include checks for extensions, planning compliance and building control where relevant
- Offer strategy MUST be commercially realistic:
  - lowOffer = sensible opening offer, typically 3–6% below asking if fairly priced; NEVER more than ~8% below asking unless comps clearly show overpricing (state why)
  - fairOffer = what a patient buyer should expect to pay (near the lower of asking and fair valuation)
  - premiumOffer = walk-away maximum, typically asking to +2–3%; NEVER more than ~5% over asking unless there is bidding-war evidence
  - Include at least 6 negotiation tips grounded in the evidence (DOM, comps, works, chain)
- Scores 0-100; growthPotential and riskLevel must be Low, Medium, or High
- summary must be 4-6 dense sentences covering condition, **extensions/works if any**, pricing vs comps, area, and recommendation
- buyingSuitability must be a clear multi-sentence verdict
- investmentMetrics.growthReasoning and advanced.* fields must be detailed paragraphs
- investmentMetrics.stampDuty must use the correct nation tax (LBTT+ADS in Scotland at 8% ADS from 5 Dec 2024 — never 6%)
- Risk fields must be explanatory sentences with concrete local detail, not single words like "Low"
- riskTones: for EACH risk field set positive | caution | negative | neutral from the buyer's perspective. Examples: approved extension that adds value = positive for planningDevelopments; low flood risk = positive; cladding concern = negative; freehold with no issues = positive for leaseholdIssues
- marketEvidence: fill from research — asking vs sold comps with £, competing supply nearby, £/sqft or £/sqm if known, and negotiation levers (never invent listings)
- Populate dueDiligence thoroughly with named figures where found
- Prefer specific street names, school names, station names, planning refs, and £ figures from the research brief
- specs: include as many factual rows as research supports (tenure, EPC, council tax, parking, garden, heating, etc.)

PROPERTY WORKS & VALUATION (mandatory):
- Populate propertyWorks from AUTHORITATIVE COUNCIL PLANNING RECORDS when present — cite refs (e.g. 20/00880/DPP), proposals, and status. Never say "no extension data" if those records list an extension at this address.
- propertyWorks.valueImpact MUST explain how works change fair value and 1/3/5/10-year forecasts vs similar unextended homes
- If an extension / loft conversion / major works is evidenced, valuation.conservative/fair/optimistic and forecast* MUST reflect the larger/improved dwelling — do not value it as if it were still the original footprint
- If works are not evidenced in the council block or public sources, say so in propertyWorks and keep valuation based on comps, noting the uncertainty
- riskAnalysis.planningDevelopments should cover nearby developments AND this property's own planning/extension history (and riskTones.planningDevelopments should be positive when works add value)
- advanced.renovationROI / developmentOpportunity should distinguish completed works vs remaining upside`,
    config: {
      responseMimeType: "application/json",
      responseSchema: geminiAnalysisSchema,
      systemInstruction:
        "You are an independent, direct UK property valuer. No fluffy marketing. Always return JSON matching the schema precisely. Never invent sold prices, listings, or planning refs. Never ignore evidenced extensions when valuing. When AUTHORITATIVE COUNCIL PLANNING RECORDS list extensions at this address, propertyWorks must reflect them and riskTones.planningDevelopments should usually be positive if works add value. Keep offerStrategy commercially realistic (no extreme lowballs or overbids). Use current Scottish ADS at 8% (from 5 Dec 2024), not the old 6%.",
    },
  });

  const analysis = parseJsonText(structured.text || "{}") as Record<string, unknown>;
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
  // If the model still under-reported but we have portal matches, backfill propertyWorks.
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
          ? ext
              .map((a) => `${a.proposal} (${a.reference}, ${a.status})`)
              .join("; ")
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
  return { analysis, sources, provider: "gemini" };
}
