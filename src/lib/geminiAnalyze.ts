import { GoogleGenAI, Type } from "@google/genai";
import { applyStampDutyEstimate, UK_PROPERTY_TAX_RULES_PROMPT } from "./ukPropertyTax";

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
    "locationIntelligence",
    "advanced",
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

  console.log(`[ai] Gemini phase 1: Google Search research (${model})...`);
  const researchFocus = input.manualAddress
    ? `This is an ADDRESS-ONLY lookup for: "${input.manualAddress}". There may be no live Rightmove listing. Identify the property via Land Registry / sold history / street data, then research the area thoroughly.`
    : `Research this property listing:`;

  const research = await ai.models.generateContent({
    model,
    contents: `You are a UK property research analyst. Use Google Search to find factual, recent information.

Prefer Land Registry, Rightmove, Zoopla, Ofsted, police.uk, GOV.UK flood maps, and reputable local news.

${researchFocus}

${listingBrief}

Cover:
1. Past sold prices on this street/postcode (and this exact address if findable)
2. Nearby comparable sales
3. Schools (Ofsted), transport, crime vs UK average
4. Flood / planning / regeneration signals
5. Typical rents and yields for this type nearby
6. Leasehold / cladding / fire-safety red flags if relevant
7. If address-only: estimate likely asking value band from comps

Return a dense research brief (not JSON) with concrete figures and place names.`,
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction:
        "You are a meticulous UK property researcher. Cite specific figures, streets, and dates. If uncertain, say so.",
    },
  });

  const researchNotes = research.text || "No web research returned.";
  const sources = extractSources(research);

  console.log(`[ai] Gemini phase 2: structured valuation JSON (${model})...`);
  const structured = await ai.models.generateContent({
    model,
    contents: `Produce the full property analysis JSON for this UK listing.

Buyer goal: ${input.buyerGoal}

LISTING:
${listingBrief}

WEB RESEARCH BRIEF (from Google Search):
${researchNotes}

${UK_PROPERTY_TAX_RULES_PROMPT}

Requirements:
- Pros/cons tailored to the buyer goal (at least 5 each) with specific, detailed descriptions (2-3 sentences each — not one-liners)
- At least 5 comparable sales and 5 sold-history entries when research supports them; invent none — mark uncertainty clearly if data is thin
- Viewing checklist (8+) and agent questions (8+) that are property-specific
- Offer strategy with low / fair / premium bids in £ and at least 5 negotiation tips
- Scores 0-100; growthPotential and riskLevel must be Low, Medium, or High
- summary must be 4-6 dense sentences covering condition, pricing vs comps, area, and recommendation
- buyingSuitability must be a clear multi-sentence verdict
- investmentMetrics.growthReasoning and advanced.* fields must be detailed paragraphs
- investmentMetrics.stampDuty must use the correct nation tax (LBTT+ADS in Scotland at 8% ADS from 5 Dec 2024 — never 6%)
- Risk fields must be explanatory sentences, not single words like "Low"
- Fill every field with concrete values; mark estimates clearly in the string
- Prefer specific street names, school names, station names, and £ figures from the research brief`,
    config: {
      responseMimeType: "application/json",
      responseSchema: geminiAnalysisSchema,
      systemInstruction:
        "You are an independent, direct UK property valuer. No fluffy marketing. Always return JSON matching the schema precisely. Use current Scottish ADS at 8% (from 5 Dec 2024), not the old 6%.",
    },
  });

  const analysis = parseJsonText(structured.text || "{}") as Record<string, unknown>;
  analysis.sources = sources;
  applyStampDutyEstimate(analysis, input.buyerGoal);
  return { analysis, sources, provider: "gemini" };
}
