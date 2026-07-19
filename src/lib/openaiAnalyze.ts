import OpenAI from "openai";
import { propertyAnalysisJsonSchema } from "./propertyAnalysisSchema";
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
Address: ${input.scrap.address || "Unknown"}
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

  console.log("[ai] OpenAI phase 1: web search research...");
  const research = await client.responses.create({
    model,
    tools: [{ type: "web_search_preview" as const }],
    input: [
      {
        role: "system",
        content:
          "You are a UK property research analyst. Use web search to find factual, recent information. Prefer Land Registry, Rightmove, Zoopla, Ofsted, police.uk, GOV.UK flood maps, and reputable local news. Be specific about postcodes, streets, and dates. If data is uncertain, say so.",
      },
      {
        role: "user",
        content: `Research this UK property for an investment / purchase report.

${listingBrief}

Find and summarise with sources where possible:
1. Past sold prices on this street/postcode (Land Registry / portals)
2. Nearby comparable sales
3. Schools (Ofsted), transport links, crime relative to UK average
4. Flood / planning / regeneration signals
5. Typical rents and yields for this property type in the area
6. Any leasehold/cladding/fire safety red flags if relevant

Return a dense research brief (not JSON). Include concrete figures and place names.`,
      },
    ],
  });

  const researchNotes = extractOutputText(research) || "No web research returned.";
  const sources = extractSources(research);

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
          "You are an independent, direct UK property valuer. No fluffy marketing. Use the listing and research brief as evidence. Populate every JSON field with concrete values. If a figure is estimated, make that clear in the string. Tailor pros/cons/suitability to the buyer goal.",
      },
      {
        role: "user",
        content: `Produce the full property analysis JSON.

Buyer goal: ${input.buyerGoal}

LISTING:
${listingBrief}

WEB RESEARCH BRIEF:
${researchNotes}

${UK_PROPERTY_TAX_RULES_PROMPT}

Requirements:
- Pros/cons tailored to the buyer goal
- At least 3 pros and 3 cons
- At least 3 comparable sales and sold history entries when research supports them
- Viewing checklist (5+) and agent questions (4+)
- Offer strategy with low / fair / premium bids in £
- Scores 0-100; growthPotential and riskLevel must be Low|Medium|High
- investmentMetrics.stampDuty must use correct nation tax (Scotland LBTT + ADS at 8% from 5 Dec 2024, never 6%)`,
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
  applyStampDutyEstimate(analysis, input.buyerGoal);
  return { analysis, sources, provider: "openai" };
}

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "MY_OPENAI_API_KEY");
}
