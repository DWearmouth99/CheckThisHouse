/**
 * OpenAI generation path — disabled (Gemini-only).
 * Kept as a stub so accidental imports fail loudly instead of calling a dead key.
 */

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

export async function analyzeWithOpenAI(_input: AnalyzeInput): Promise<AnalyzeResult> {
  throw new Error("provider disabled");
}

/** Always false — OpenAI is not a configured provider. */
export function hasOpenAIKey() {
  return false;
}
