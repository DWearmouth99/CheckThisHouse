import express from "express";
import path from "path";
import dns from "dns";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Body parser limits elevated to allow raw HTML copy-paste fallback
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// Initialize GoogleGenAI client (lazy client with fallback check)
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is missing. Please add it in the Secrets panel in AI Studio UI.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

/**
 * Basic scraper helper to try to extract property info
 * from a Rightmove URL. It mimics a modern user browser agent.
 * Fallbacks gracefully if blocked by Cloudflare.
 */
async function scrapeRightmoveUrl(targetUrl: string): Promise<{
  success: boolean;
  address?: string;
  price?: string;
  bedrooms?: string;
  bathrooms?: string;
  propertyType?: string;
  description?: string;
  images?: string[];
  message?: string;
}> {
  try {
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Referer": "https://www.google.com/",
    };

    console.log(`[scraper] Attempting to fetch Rightmove URL: ${targetUrl}`);
    const res = await fetch(targetUrl, { headers, signal: AbortSignal.timeout(8000) });

    if (!res.ok) {
      console.warn(`[scraper] HTTP status error: ${res.status}. Probably blocked by Rightmove/Cloudflare.`);
      return {
        success: false,
        message: `Status ${res.status} returned by Rightmove. This is common due to anti-scraping protections (Cloudflare). Our AI will search the web using Gemini Search Grounding as an alternative!`,
      };
    }

    const html = await res.text();
    console.log(`[scraper] Received ${html.length} bytes of HTML.`);

    // 1. Check for blocked content
    if (html.includes("Cloudflare") || html.includes("captcha") || html.includes("Security Check") || html.includes("unusual activity")) {
      console.warn("[scraper] Rightmove server triggered a captcha or security block.");
      return {
        success: false,
        message: "Rightmove blocked access via Cloudflare security. Grounding Search is enabled to bypass this!",
      };
    }

    // Attempt to extract information
    // Rightmove pages has window.PAGE_MODEL = { ... } inside a script
    const pageModelMatch = html.match(/window\.PAGE_MODEL\s*=\s*(\{.+?\})(?:<\/script>|;)/);
    
    let isPageModelParsed = false;
    let data: any = {};

    if (pageModelMatch && pageModelMatch[1]) {
      try {
        const parsed = JSON.parse(pageModelMatch[1]);
        if (parsed.propertyData) {
          const p = parsed.propertyData;
          data.address = p.address?.displayAddress || p.address?.streetAddress;
          data.price = p.prices?.primaryPrice;
          data.bedrooms = p.bedrooms?.toString();
          data.bathrooms = p.bathrooms?.toString();
          data.propertyType = p.propertyType || p.transactionType;
          data.description = p.text?.description;
          
          if (p.images && Array.isArray(p.images)) {
            data.images = p.images.slice(0, 5).map((img: any) => img.url || img.src);
          }
          isPageModelParsed = true;
          console.log("[scraper] Successfully parsed PAGE_MODEL data!");
        }
      } catch (err) {
        console.warn("[scraper] PAGE_MODEL JSON parsing failed:", err);
      }
    }

    // Fallback parsing via Meta tags & simple regex if PAGE_MODEL wasn't full or failed
    if (!isPageModelParsed) {
      console.log("[scraper] PAGE_MODEL fallback parsing initiated.");
      
      // Address from Title
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        const rawTitle = titleMatch[1].replace("- Rightmove", "").trim();
        data.address = rawTitle;
      }

      // Price from metadata or tags
      const priceMeta = html.match(/<meta\s+property="og:price:amount"\s+content="([^"]+)"/i) || 
                        html.match(/<meta\s+name="price"\s+content="([^"]+)"/i);
      const currencyMeta = html.match(/<meta\s+property="og:price:currency"\s+content="([^"]+)"/i);
      if (priceMeta && priceMeta[1]) {
        const amt = priceMeta[1];
        const cur = currencyMeta ? (currencyMeta[1] === "GBP" ? "£" : currencyMeta[1]) : "£";
        data.price = `${cur}${amt}`;
      } else {
        // Regex price matches like £350,000 or Offers over £350,000
        const regexPrice = html.match(/£[0-9]{1,3}(?:,[0-9]{3})+/);
        if (regexPrice) {
          data.price = regexPrice[0];
        }
      }

      // Description
      const descMeta = html.match(/<meta\s+name="description"\s+content="([^"]+)"/i) ||
                        html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/i);
      if (descMeta && descMeta[1]) {
        data.description = descMeta[1];
      }

      // Beds
      const bedMatch = html.match(/([0-9]+)\s*bedroom/i) || html.match(/bedroom[s]?\s*:\s*([0-9]+)/i);
      if (bedMatch) {
        data.bedrooms = bedMatch[1];
      }

      // Images
      const images: string[] = [];
      const imgRegex = /https:\/\/media\.rightmove\.co\.uk\/dir\/[0-9k]+\/[0-9]+\/[^'"]+?_max_[0-9]+x[0-9]+\.(?:jpeg|jpg|png)/gi;
      let match;
      while ((match = imgRegex.exec(html)) !== null && images.length < 5) {
        if (!images.includes(match[0])) {
          images.push(match[0]);
        }
      }
      if (images.length > 0) {
        data.images = images;
      }
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
      message: (data.address || data.price) ? undefined : "Fetched listing successfully, but most data was empty or structured differently.",
    };
  } catch (error: any) {
    console.error("[scraper] Fetch error:", error);
    return {
      success: false,
      message: `Failed to connect or fetch page: ${error.message || "Timeout"}. Our AI will search the web using Gemini Search Grounding as an alternative!`,
    };
  }
}

// Ensure the dev server starts DNS searches with IPv4 first to solve local proxy address bindings
dns.setDefaultResultOrder("ipv4first");

// Property Scraper + AI analysis endpoint
app.post("/api/analyze", async (req: express.Request, res: express.Response) => {
  const { url, pastedText, buyerGoal } = req.body;

  if (!url && !pastedText) {
    return res.status(400).json({ error: "Please enter a Rightmove URL or paste the listing text content." });
  }

  const selectedGoal = buyerGoal || "First-time Buyer";

  try {
    const ai = getGeminiClient();

    let scrapResult = { success: false, url: url || "Manual Entry" } as any;

    // Scrape only if a Rightmove URL was provided
    if (url && url.toLowerCase().includes("rightmove.co.uk")) {
      scrapResult = await scrapeRightmoveUrl(url);
    }

    // Clean description to avoid excessive token sizes
    let descriptionSnippet = scrapResult.description || "No scraped description available.";
    if (pastedText) {
      // User pasted source override
      descriptionSnippet = pastedText.substring(0, 15000); 
    }

    // Build grounding instruction and prompt parameters for Gemini
    const userPrompt = `
      You are an expert UK Property Valuer & investment advisor.
      Analyze the Rightmove listing at: ${url || "Manual Entry"}
      
      Client Purchase Profile / Goal: "${selectedGoal}"
      
      Below is the scraped/pasted property listing metadata:
      - Title/Address: ${scrapResult.address || "Unknown Address (Please deduce from listing URL or pasted text)"}
      - Asking Price: ${scrapResult.price || "Unknown Asking Price"}
      - Bedrooms: ${scrapResult.bedrooms || "Not specified"}
      - Bathrooms: ${scrapResult.bathrooms || "Not specified"}
      - Property Type: ${scrapResult.propertyType || "Not specified"}
      - Description/Features: ${descriptionSnippet}
      
      INSTRUCTIONS:
      Use Google Search Grounding to find details about the exact address or street/postcode area.
      1. Find past sold prices: Research Zoopla, Land Registry, and general UK house price databases for past transactions in that specific postcode or road. Dedicate a small section to comparable historical sales.
      2. Evaluate specific area health (postcode or community): Include nearest highly-rated schools, average transport commute times (rail, metro, or buses to nearby centers), crime ratings (e.g. crime rate relative to UK average), amenities, and any notable local news (development, regeneration, council initiatives).
      3. Evaluate custom Pros and Cons strictly tailored to the client's Profile ("${selectedGoal}"). e.g. First-time buyers need lower maintenance and good transport; Buy-to-Let investors look for high rental yields and high-density renting; House Flippers look for properties with structural potentials, extension permissions, or below-market-value issues.
      4. Provide an estimate of rental yield and monthly rent matching this specific configuration in its postcode.
      5. Formulate a complete bidding proposal plan: cheeky low offer, realistic fair offer, and standard competitive premium bid. Add negotiation tactics.
      6. Generate 5 smart inspection points to look closely at (e.g., check Victorian roofs, cladding, leasehold years remaining, EPC energy fixes) and 4 intelligent questions to ask the estate agent to reveal the vendor's motivation.

      You must return your response strictly in JSON format matching the specifications. Ensure all fields are fully populated with smart, factual data. Do not return empty fields.
    `;

    // Define the rigid JSON schema for the response
    const analysisSchema = {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING, description: "A catchy expert title summarizing the property's core market value (e.g., 'Solid Terraced Investment opportunity under EPC limits' or 'Attractive first-time home with school proximities')" },
        price: { type: Type.STRING, description: "The asking price, formatted like £250,000" },
        bedrooms: { type: Type.STRING, description: "Number of bedrooms like '3 bedrooms'" },
        bathrooms: { type: Type.STRING, description: "Number of bathrooms like '1 bathroom' or '2 bathrooms'" },
        propertyType: { type: Type.STRING, description: "Property physical category (e.g. Victorian End-of-Terrace)" },
        location: {
          type: Type.OBJECT,
          properties: {
            address: { type: Type.STRING, description: "Street and flat details" },
            postcode: { type: Type.STRING, description: "UK Postcode parsed or searched" },
            town: { type: Type.STRING, description: "Town, Area or City" }
          },
          required: ["address", "postcode", "town"]
        },
        summary: { type: Type.STRING, description: "A 3-sentence expert summary of the property condition, its general market appeal, and our advice for the given buyer profile." },
        specs: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              label: { type: Type.STRING },
              value: { type: Type.STRING }
            },
            required: ["label", "value"]
          },
          description: "4-5 tech key specifications: e.g. Tenure (Freehold/Leasehold & years remaining), Council Tax Band, Heating system, EPC Rating, Floor Area, Building Age, Listed Status."
        },
        scores: {
          type: Type.OBJECT,
          properties: {
            overall: { type: Type.NUMBER, description: "Suitability score out of 100 representing standard property health matched to user goals" },
            valueForMoney: { type: Type.NUMBER, description: "Value rating out of 100 relative to surrounding street comparables" },
            locationRating: { type: Type.NUMBER, description: "Transit, crime, noise, amenities rating out of 100" },
            conditionRating: { type: Type.NUMBER, description: "Structural readiness, decorative condition, and required updates rating out of 100" },
            investmentScore: { type: Type.NUMBER, description: "Score out of 100 representing pure financial investment strength" },
            marketScore: { type: Type.NUMBER, description: "Score out of 100 for overall area market health and demand" },
            rentalScore: { type: Type.NUMBER, description: "Score out of 100 for rentability and tenant demand" },
            growthPotential: { type: Type.STRING, description: "Capital Growth Outlook scale: 'Low', 'Medium', or 'High'" },
            riskLevel: { type: Type.STRING, description: "Overall Risk Level: 'Low', 'Medium', or 'High'" },
            confidenceScore: { type: Type.NUMBER, description: "AI Prediction Confidence percentage (e.g. 85 for 85%)" }
          },
          required: ["overall", "valueForMoney", "locationRating", "conditionRating", "investmentScore", "marketScore", "rentalScore", "growthPotential", "riskLevel", "confidenceScore"]
        },
        valuation: {
          type: Type.OBJECT,
          properties: {
            conservative: { type: Type.STRING, description: "Conservative bottom-end valuation" },
            fair: { type: Type.STRING, description: "Fair market valuation" },
            optimistic: { type: Type.STRING, description: "Optimistic top-end valuation" },
            forecast1y: { type: Type.STRING, description: "1-year appreciation forecast percentage" },
            forecast3y: { type: Type.STRING, description: "3-year appreciation forecast percentage" },
            forecast5y: { type: Type.STRING, description: "5-year appreciation forecast percentage" },
            forecast10y: { type: Type.STRING, description: "10-year appreciation forecast percentage" }
          },
          required: ["conservative", "fair", "optimistic", "forecast1y", "forecast3y", "forecast5y", "forecast10y"]
        },
        investmentMetrics: {
          type: Type.OBJECT,
          properties: {
            estimatedRent: { type: Type.STRING, description: "Est monthly rent e.g. £1,100 - £1,200/month" },
            grossYield: { type: Type.STRING, description: "Estimated percentage gross yield e.g. 5.1%" },
            netYield: { type: Type.STRING, description: "Estimated percentage net yield after standard costs" },
            roi: { type: Type.STRING, description: "Return on Investment percentage" },
            cashflow: { type: Type.STRING, description: "Estimated monthly cashflow" },
            stampDuty: { type: Type.STRING, description: "Estimated standard UK stamp duty" },
            breakEven: { type: Type.STRING, description: "Estimated break even timeline" },
            irr: { type: Type.STRING, description: "Internal Rate of Return (IRR)" },
            growthReasoning: { type: Type.STRING, description: "Justification explaining transport expansion, supply shortage, or area demographic popularity" }
          },
          required: ["estimatedRent", "grossYield", "netYield", "roi", "cashflow", "stampDuty", "breakEven", "irr", "growthReasoning"]
        },
        marketAndRental: {
          type: Type.OBJECT,
          properties: {
            supplyDemand: { type: Type.STRING, description: "Supply vs demand ratio/status in this area" },
            timeOnMarket: { type: Type.STRING, description: "Typical days on market for this property type" },
            priceTrend: { type: Type.STRING, description: "Recent price trend direction (e.g. 'Up 3% YOY')" },
            vacancyRates: { type: Type.STRING, description: "Local rental vacancy rate" },
            tenantProfile: { type: Type.STRING, description: "Typical local tenant profile (e.g. 'Young Professionals')" },
            airbnbPotential: { type: Type.STRING, description: "Viability of short-term lets here" }
          },
          required: ["supplyDemand", "timeOnMarket", "priceTrend", "vacancyRates", "tenantProfile", "airbnbPotential"]
        },
        riskAnalysis: {
          type: Type.OBJECT,
          properties: {
            floodRisk: { type: Type.STRING, description: "Environmental flood risk level" },
            subsidence: { type: Type.STRING, description: "Subsidence/soil risk" },
            planningDevelopments: { type: Type.STRING, description: "Any nearby disruptive planning applications" },
            leaseholdIssues: { type: Type.STRING, description: "Ground rent, service charges, short leases if applicable" },
            fireSafety: { type: Type.STRING, description: "Cladding or fire safety concerns" },
            insuranceRisk: { type: Type.STRING, description: "Overall property insurance risk level" }
          },
          required: ["floodRisk", "subsidence", "planningDevelopments", "leaseholdIssues", "fireSafety", "insuranceRisk"]
        },
        locationIntelligence: {
          type: Type.OBJECT,
          properties: {
            plannedInfrastructure: { type: Type.STRING, description: "Major new transport/amenity links planned" },
            populationGrowth: { type: Type.STRING, description: "Population and employment growth trend" },
            regenerationProjects: { type: Type.STRING, description: "Any local council regeneration zones" },
            walkability: { type: Type.STRING, description: "Walkability and local high street access" }
          },
          required: ["plannedInfrastructure", "populationGrowth", "regenerationProjects", "walkability"]
        },
        advanced: {
          type: Type.OBJECT,
          properties: {
            undervaluedExplanation: { type: Type.STRING, description: "Detailed explanation of why it is under/over valued" },
            renovationROI: { type: Type.STRING, description: "Estimated ROI for standard renovations/extensions" },
            developmentOpportunity: { type: Type.STRING, description: "Potential for flipping, extensions, or loft conversions" }
          },
          required: ["undervaluedExplanation", "renovationROI", "developmentOpportunity"]
        },
        pros: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              desc: { type: Type.STRING },
              category: { type: Type.STRING }
            },
            required: ["title", "desc", "category"]
          },
          description: "At least 3 strengths matching their goal"
        },
        cons: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              desc: { type: Type.STRING },
              category: { type: Type.STRING }
            },
            required: ["title", "desc", "category"]
          },
          description: "At least 3 drawbacks or warnings matching their goal"
        },
        soldHistory: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              year: { type: Type.STRING, description: "Year of sale" },
              price: { type: Type.STRING, description: "Price sold, e.g. £145,000" },
              source: { type: Type.STRING, description: "Source of reference (e.g., 'Land Registry (2018)')" },
              description: { type: Type.STRING, description: "Summary, e.g., 'Sold as new build flat', 'Capital growth of 30% since this era'" }
            },
            required: ["year", "price", "source", "description"]
          },
          description: "List of actual or derived past sales data of this specific property or street history"
        },
        comparableSales: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              address: { type: Type.STRING },
              price: { type: Type.STRING },
              soldDate: { type: Type.STRING },
              similarity: { type: Type.STRING, description: "Explanation of how it compares (e.g. Same street, same layout, larger yard)" }
            },
            required: ["address", "price", "soldDate", "similarity"]
          },
          description: "3 nearby comparable sales"
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
                  rating: { type: Type.STRING, description: "Ofsted score: e.g. 'Outstanding', 'Good'" }
                },
                required: ["name", "distance", "rating"]
              }
            },
            transport: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING },
                  line: { type: Type.STRING },
                  time: { type: Type.STRING }
                },
                required: ["type", "line", "time"]
              }
            },
            crimeSafety: {
              type: Type.OBJECT,
              properties: {
                rating: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["rating", "description"]
            },
            demographics: { type: Type.STRING, description: "Who lives here: young couples, elderly, commuter cluster" },
            amenities: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            futureOutlook: { type: Type.STRING, description: "Underlying council investments or major development plans" }
          },
          required: ["schools", "transport", "crimeSafety", "demographics", "amenities", "futureOutlook"]
        },
        buyingSuitability: { type: Type.STRING, description: "Clear advisory verdict: buy, negotiate hard, or avoid." },
        viewingChecks: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        },
        offerStrategy: {
          type: Type.OBJECT,
          properties: {
            lowOffer: { type: Type.STRING, description: "Cheeky bid value" },
            fairOffer: { type: Type.STRING, description: "Fair value bid" },
            premiumOffer: { type: Type.STRING, description: "High competition bid maximum" },
            negotiationTips: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["lowOffer", "fairOffer", "premiumOffer", "negotiationTips"]
        },
        agentQuestions: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
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
        "agentQuestions"
      ]
    };

    console.log("[ai] Submitting query to Gemini with Search Grounding enabled...");
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: userPrompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: analysisSchema,
        systemInstruction: "You are an independent, direct, and incredibly shrewd UK Property Valuer. Evaluate the physical properties, postcodes, nearby real-estate sales, and crime levels with raw commercial honesty. Do not contain fluffy marketing. Always return structured JSON that matches the prompt parameters precisely.",
      },
    });

    let parsedText = response.text || "{}";
    // Strip markdown formatting if the model still wrapped it
    if (parsedText.startsWith('```json')) {
      parsedText = parsedText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (parsedText.startsWith('```')) {
      parsedText = parsedText.replace(/^```\n/, '').replace(/\n```$/, '');
    }
    
    // Also try to replace any rogue unquoted dots that might break JSON (e.g., `.` instead of `"."`)
    // But this is risky, let's rely on the better model `gemini-2.5-pro`.

    const parsedData = JSON.parse(parsedText);

    // Extract search grounding URLs if present
    const sources: { title: string; url: string }[] = [];
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      chunks.forEach((chunk: any) => {
        if (chunk.web && chunk.web.uri) {
          sources.push({
            title: chunk.web.title || "Web Reference",
            url: chunk.web.uri,
          });
        }
      });
    }

    parsedData.sources = sources;

    // Attach imagery if extracted during listing scrape
    if (scrapResult.images && scrapResult.images.length > 0) {
      parsedData.scrapedImages = scrapResult.images;
    }

    res.json({
      success: true,
      scraped: scrapResult,
      analysis: parsedData,
    });

  } catch (error: any) {
    console.error("[api] Error during property analysis:", error);
    res.status(500).json({
      error: error.message || "An unexpected error occurred during analysis.",
    });
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
