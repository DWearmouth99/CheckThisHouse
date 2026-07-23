import { GoogleGenAI, Type } from "@google/genai";
import {
  formatPlanningBrief,
  lookupPlanningApplications,
  planningSources,
} from "./planningLookup";
import { applyStampDutyEstimate, UK_PROPERTY_TAX_RULES_PROMPT } from "./ukPropertyTax";
import { sanitizeOfferStrategy } from "./sanitizeOfferStrategy";
import { refineRiskTones } from "./refineRiskTones";
import { applyPropertyFactLocks, gatherPropertyFacts } from "./propertyFacts";
import {
  REPORT_WRITING_ENGINE_SYSTEM,
  applyReportWritingEngine,
  buildReportWritingRequirements,
  detectReportMode,
} from "./reportWritingEngine";
import { extractPostcode, assertPayloadHasNoForeignTokens } from "./addressMatch";
import { lookupCrimeForAddress } from "./policeUkLookup";
import { lookupFloodForAddress } from "./floodLookup";
import { enforceReportPipeline } from "./enforceReportPipeline";
import { scrubEpcUrlsInText } from "./epcLinkFormat";

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
        growthAssumptions: {
          type: Type.OBJECT,
          properties: {
            lowPct: { type: Type.NUMBER },
            centralPct: { type: Type.NUMBER },
            highPct: { type: Type.NUMBER },
            basis: { type: Type.STRING },
          },
          required: ["lowPct", "centralPct", "highPct", "basis"],
        },
      },
      required: ["conservative", "fair", "optimistic", "growthAssumptions"],
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
      },
      required: ["askingVsSoldEvidence", "competingSupply", "pricePerSqmOrSqft"],
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
          basis: {
            type: Type.STRING,
            enum: ["size", "date", "planning", "listing", "unknown"],
          },
          note: { type: Type.STRING },
        },
        required: ["address", "price", "soldDate", "similarity", "basis", "note"],
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

/** Clone schema; SOLD mode omits offerStrategy; scores omitted (computed in code). */
export function buildGeminiResponseSchema(mode: "on_market" | "recently_sold") {
  const schema = JSON.parse(JSON.stringify(geminiAnalysisSchema)) as typeof geminiAnalysisSchema & {
    properties: Record<string, unknown>;
    required: string[];
  };
  // Scores are deterministic — do not request from LLM
  delete (schema.properties as any).scores;
  schema.required = schema.required.filter((k) => k !== "scores");

  if (mode === "recently_sold") {
    delete (schema.properties as any).offerStrategy;
    schema.required = schema.required.filter((k) => k !== "offerStrategy");
  }
  return schema;
}

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
Bedrooms: ${input.scrap.bedrooms || "Not on record — do not invent a number"}
Bathrooms: ${input.scrap.bathrooms || "Not on record — do not invent a number (EPC habitable rooms ≠ bathrooms)"}
Property type: ${input.scrap.propertyType || "Unknown — use EPC / Land Registry if provided below"}
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

function scrubResearchNotesForSubject(
  notes: string,
  subjectPostcode: string | null
): string {
  if (!subjectPostcode) return notes;
  const subjectNorm = subjectPostcode.replace(/\s+/g, '').toUpperCase();
  const subjectArea = subjectNorm.slice(0, 3); // e.g. DL6
  // Drop lines that mention a different full UK postcode
  return notes
    .split(/\n/)
    .filter((line) => {
      const pcs = line.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/gi) || [];
      for (const pc of pcs) {
        const n = pc.replace(/\s+/g, '').toUpperCase();
        if (n !== subjectNorm && !n.startsWith(subjectArea.slice(0, 2))) {
          // Allow same outward area; drop clearly different (e.g. YO32 vs DL6)
          const lineArea = n.match(/^([A-Z]{1,2}\d)/)?.[1];
          const subArea = subjectNorm.match(/^([A-Z]{1,2}\d)/)?.[1];
          if (lineArea && subArea && lineArea !== subArea) {
            console.warn(`[addressMatch] DROP research line (foreign postcode ${pc}): ${line.slice(0, 120)}`);
            return false;
          }
        }
      }
      // Hard denylist for known York mismatch tokens when subject is DL6
      if (subjectNorm.startsWith('DL6')) {
        if (/YO32|Pentland Drive|19\/01242|25\/00196|Huntington/i.test(line)) {
          console.warn(`[addressMatch] DROP research line (York denylist): ${line.slice(0, 120)}`);
          return false;
        }
      }
      return true;
    })
    .join('\n');
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
  const addressForFacts =
    input.manualAddress || input.scrap.address || "";

  console.log("[ai] Verified facts (EPC + Land Registry) + planning + crime + flood...");
  const [facts, planning, crime, flood] = await Promise.all([
    addressForFacts ? gatherPropertyFacts(addressForFacts) : Promise.resolve(null),
    addressForFacts ? lookupPlanningApplications(addressForFacts) : Promise.resolve(null),
    addressForFacts ? lookupCrimeForAddress(addressForFacts) : Promise.resolve(null),
    addressForFacts ? lookupFloodForAddress(addressForFacts) : Promise.resolve(null),
  ]);

  const subjectPostcode = extractPostcode(addressForFacts);

  let planningBlock = "";
  if (planning) {
    planningBlock = formatPlanningBrief(planning);
    console.log(
      `[ai] Planning: ${planning.council} — ${planning.matchedToProperty.length} match(es) for property, ${planning.applications.length} same-postcode hits`
    );
  } else {
    console.log("[ai] Planning: no mapped council portal for this postcode (web research only)");
  }

  const factsBlock = facts?.brief || "";
  if (facts) {
    console.log(
      `[ai] Facts: EPC ${facts.epc.matched ? "matched" : "no match"} · LR this-property sales ${facts.landRegistry.thisProperty.length} · same-street ${facts.landRegistry.nearbySameStreet.length} · postcode ${facts.landRegistry.nearbyPostcode.length}`
    );
  }
  if (crime) {
    console.log(
      `[ai] Crime: ${crime.incidentsPerThousand != null ? `${crime.incidentsPerThousand}/1,000/yr` : "unreliable"} · incidents_12m=${crime.crimeCountYear} · pop=${crime.population} (${crime.populationSource}) · ${crime.monthStart}→${crime.monthEnd}`
    );
  }
  if (flood) {
    console.log(`[ai] Flood: ${flood.bandingLabel}`);
  }

  const modeCtx = detectReportMode({
    liveAsking: input.scrap.price,
    thisPropertySales: facts?.landRegistry.thisProperty,
  });
  console.log(`[ai] Report mode: ${modeCtx.mode} (${modeCtx.priceLabel})`);

  const crimeBlock =
    crime && crime.incidentsPerThousand != null
      ? `\nVERIFIED FACTS — CRIME (police.uk). The renderer prints the per-1,000 rate once from data. Your crimeSafety.description must be interpretation ONLY — do NOT include any "per 1,000" or "incidents per" figures.\nRate (for context, do not repeat in description): ${crime.label}\nHint: ${crime.interpretationHint}\n`
      : crime
        ? `\nVERIFIED FACTS — CRIME\n${crime.label}\n`
        : "";

  const floodBlock = flood
    ? `\nVERIFIED FACTS — FLOOD (EA / planning.data). Print these bandings verbatim in floodRisk. You may add ONE interpretation sentence that introduces NO geographic claims (no river/beck/place names) absent from this block.\n${flood.llmContext}\n`
    : "";

  console.log(`[ai] Gemini phase 1: Google Search research (${model})...`);
  const researchFocus = input.manualAddress
    ? `This is an ADDRESS-ONLY lookup for: "${input.manualAddress}". There may be no live listing. Prefer VERIFIED FACTS (EPC + Land Registry) below over web guesses. Research the exact address and local area thoroughly.`
    : `Research this property listing:`;

  const phase1Contents = `You are a UK property research analyst. Use Google Search aggressively to find factual, recent information for an internal research brief (not customer-facing).

Prefer: Land Registry / sold prices, Rightmove, Zoopla, Ofsted, police.uk, GOV.UK flood maps, EPC register, local council planning portals, and reputable local news.

${researchFocus}

${listingBrief}

${factsBlock ? `\n${factsBlock}\n` : ""}
${planningBlock ? `\n${planningBlock}\n` : ""}
${crimeBlock}
${floodBlock}

Search for planning and works at this exact address / postcode ${subjectPostcode || ""}. Cover:
1. Sold prices — prefer VERIFIED Land Registry facts; do not invent different prices for matched addresses
2. Nearby comps (extended vs unextended if known)
3. Schools (with inspection year), transport, crime (use VERIFIED per-1,000 figure)
4. Flood / regeneration
5. Planning & works — prefer VERIFIED council matches for this exact property only; never include other postcodes
6. Rents/yields if relevant
7. Leasehold / fire-safety flags
8. EPC / energy — prefer VERIFIED EPC; never invent bathroom counts or lettered EPC ranges
9. Purchase cost stack (SDLT/LBTT+ADS)
10. Competing listings / DOM if on market
11. £/sqm when floor area known

Return a dense research brief (not JSON) with figures, place names, planning refs, and source names. Do not write customer-facing prose.`;

  // Soften D2 hard-fail: scrub foreign tokens from payload instead of throwing when only council name leaked
  if (subjectPostcode?.startsWith("DL6")) {
    const check = assertPayloadHasNoForeignTokens(phase1Contents, [
      "YO32",
      "Pentland Drive",
      "19/01242",
      "25/00196",
      "Huntington",
    ]);
    if (!check.ok) {
      console.error("[ai] D2 FAIL — foreign tokens in phase-1 payload:", check.hits);
      throw new Error(
        `Address filter failed: LLM payload contained foreign tokens: ${check.hits.join(", ")}`
      );
    }
    if (/\bYork\b/i.test(phase1Contents) && !/Northallerton|DL6/i.test(phase1Contents)) {
      console.error("[ai] D2 FAIL — lone York token without subject context");
      throw new Error("Address filter failed: LLM payload contained York without subject context");
    }
  }

  const research = await ai.models.generateContent({
    model,
    contents: phase1Contents,
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction:
        "You are a meticulous UK property researcher preparing internal notes. VERIFIED FACTS blocks override web guesses. Never invent bathroom counts, sold prices, or planning refs. Only attribute planning to the exact subject address. Never mention discarded or discounted records.",
    },
  });

  const researchNotesRaw = research.text || "No web research returned.";
  const researchNotes = scrubResearchNotesForSubject(researchNotesRaw, subjectPostcode);
  const sources = [
    ...extractSources(research),
    ...(facts ? facts.sources : []),
    ...(planning ? planningSources(planning) : []),
    ...(crime?.sourceUrl ? [{ title: "police.uk crime data", url: crime.sourceUrl }] : []),
  ];

  const responseSchema = buildGeminiResponseSchema(modeCtx.mode);

  console.log(`[ai] Gemini phase 2: structured valuation JSON (${model}, mode=${modeCtx.mode})...`);
  const phase2Contents = `Produce the full property analysis JSON for CheckThisHouse.

Buyer goal: ${input.buyerGoal}

${buildReportWritingRequirements(modeCtx.mode)}

LISTING / SUBJECT:
${listingBrief}

${factsBlock ? `${factsBlock}\n` : ""}
${planningBlock ? `${planningBlock}\n` : ""}
${crimeBlock}
${floodBlock}
INTERNAL WEB RESEARCH NOTES:
${researchNotes}

${UK_PROPERTY_TAX_RULES_PROMPT}

Fill every schema field. Extra content rules:
- Pros/cons: at least 7–8 each, evidence-backed, consistent with summary; every risk needs a so-what
- comparableSales: prefer VERIFIED Land Registry; each note MUST set basis to size|date|planning|listing|unknown — if unknown, note must not speculate
- bathrooms: never invent; if unknown use Not on record — verify with a viewing or the listing
- Viewing checklist (10+) and agent/professional questions (10+)
- Do NOT invent numeric scores or forecast milestone £ — propose growthAssumptions only
- summary: 4–6 dense sentences; buyingSuitability multi-sentence for the buyer goal and report mode
- riskTones for every risk field; dueDiligence thorough
- propertyWorks only from exact-address planning matches; interpret /LBC /FUL /OUT /TPO correctly
- Yields must include rent assumption; SDLT/LBTT must state residence assumption
- Never invent EPC letter ranges (e.g. D to F)
- Comp notes: set basis honestly; never invent structural explanations without planning/listing facts`;

  if (subjectPostcode?.startsWith("DL6")) {
    const check2 = assertPayloadHasNoForeignTokens(phase2Contents, [
      "YO32",
      "Pentland Drive",
      "19/01242",
      "25/00196",
      "Huntington",
      "do not apply to this address",
    ]);
    if (!check2.ok) {
      console.error("[ai] D2 FAIL — foreign tokens in phase-2 payload:", check2.hits);
      throw new Error(
        `Address filter failed: LLM payload contained foreign tokens: ${check2.hits.join(", ")}`
      );
    }
  }
  console.log("[ai] LLM phase-1/2 payload lengths:", phase1Contents.length, "/", phase2Contents.length);

  const structured = await ai.models.generateContent({
    model,
    contents: phase2Contents,
    config: {
      responseMimeType: "application/json",
      responseSchema,
      systemInstruction: REPORT_WRITING_ENGINE_SYSTEM,
    },
  });

  const analysis = parseJsonText(structured.text || "{}") as Record<string, unknown>;
  analysis.sources = sources.map((s) => ({
    ...s,
    title: scrubEpcUrlsInText(s.title),
    url: /find-energy-certificate\.service\.gov\.uk\/?$/i.test(s.url)
      ? 'https://www.gov.uk/find-energy-certificate'
      : s.url,
  }));
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
        pw.certainty = `Planning refs listed were matched to this address on the ${planning.council} portal. Confirm build quality and building control with a surveyor.`;
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
  if (facts) {
    applyPropertyFactLocks(analysis, facts, {
      bedrooms: input.scrap.bedrooms,
      bathrooms: input.scrap.bathrooms,
      propertyType: input.scrap.propertyType,
      price: input.scrap.price,
    });
  }

  if (modeCtx.mode === "on_market") {
    const valuation = analysis.valuation as
      | { fair?: string; conservative?: string; optimistic?: string }
      | undefined;
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
  } else {
    delete analysis.offerStrategy;
  }

  applyReportWritingEngine(analysis, {
    modeCtx,
    scrapBathrooms: input.scrap.bathrooms,
    scrapBedrooms: input.scrap.bedrooms,
    hasVerifiedEpc: Boolean(facts?.epc.matched),
    hasVerifiedSoldHistory: Boolean(facts?.landRegistry.thisProperty.length),
  });

  const rewriteField = async (path: string, value: string, hits: string[]) => {
    const rewrite = await ai.models.generateContent({
      model,
      contents: `Rewrite the following property-report field so it contains NONE of these banned terms/patterns: ${hits.join(", ")}.
Keep the same facts and meaning. Do not invent new numbers. Return ONLY the rewritten field text.

Field path: ${path}
Original:
${value}`,
      config: {
        systemInstruction:
          "You rewrite UK property report prose. Remove banned terms without changing factual meaning. Never invent data.",
      },
    });
    return (rewrite.text || value).trim();
  };

  const { warnings } = await enforceReportPipeline(analysis, {
    modeCtx,
    scrapPrice: input.scrap.price,
    crime,
    epc: facts?.epc,
    landRegistry: facts?.landRegistry,
    flood,
    hasVerifiedPlanning: Boolean(planning?.matchedToProperty?.length),
    rewriteField,
  });
  if (warnings.length) {
    console.warn("[ai] Enforcement warnings:", warnings.slice(0, 20));
  }

  return { analysis, sources, provider: "gemini" };
}
