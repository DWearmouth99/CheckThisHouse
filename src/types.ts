export type BuyerGoal = 'First-time Buyer' | 'Moving Home' | 'Buy-to-Let Investor';

export interface PropertyScrapeResult {
  success: boolean;
  url: string;
  address?: string;
  price?: string;
  bedrooms?: string;
  bathrooms?: string;
  propertyType?: string;
  description?: string;
  images?: string[];
  isPasted?: boolean;
  pastedText?: string;
  message?: string;
}

export interface SoldHistoryItem {
  year: string;
  price: string;
  source: string;
  description: string;
}

export interface ComparableSaleItem {
  address: string;
  price: string;
  soldDate: string;
  similarity: string; // e.g., "Identical layout on same street", "Larger garden nearby"
}

export interface SchoolItem {
  name: string;
  distance: string;
  rating: string; // e.g., "Outstanding", "Good", "Requires Improvement"
}

export interface TransportItem {
  type: string; // "Train/Metro" | "Bus" | "Road"
  line: string;
  time: string;
}

export interface ProConsItem {
  title: string;
  desc: string;
  category: string; // e.g., "Financial", "Location", "Condition", "Agent/Lease"
}

export interface PropertyScores {
  overall: number;
  valueForMoney: number;
  locationRating: number;
  conditionRating: number;
  investmentScore: number;
  marketScore: number;
  rentalScore: number;
  growthPotential: 'Low' | 'Medium' | 'High';
  riskLevel: 'Low' | 'Medium' | 'High';
  confidenceScore: number;
}

export interface Valuation {
  conservative: string;
  fair: string;
  optimistic: string;
  forecast1y: string;
  forecast3y: string;
  forecast5y: string;
  forecast10y: string;
}

export interface InvestmentMetrics {
  estimatedRent: string;
  grossYield: string;
  netYield: string;
  roi: string;
  cashflow: string;
  stampDuty: string;
  breakEven: string;
  irr: string;
  growthReasoning: string;
}

export interface MarketAndRental {
  supplyDemand: string;
  timeOnMarket: string;
  priceTrend: string;
  vacancyRates: string;
  tenantProfile: string;
  airbnbPotential: string;
}

export interface RiskAnalysis {
  floodRisk: string;
  subsidence: string;
  planningDevelopments: string;
  leaseholdIssues: string;
  fireSafety: string;
  insuranceRisk: string;
}

/** Explicit tone for PDF colouring — set by the model from evidence, not vibes. */
export type RiskTone = 'positive' | 'caution' | 'negative' | 'neutral';

export interface RiskTones {
  floodRisk: RiskTone;
  subsidence: RiskTone;
  planningDevelopments: RiskTone;
  leaseholdIssues: RiskTone;
  fireSafety: RiskTone;
  insuranceRisk: RiskTone;
}

/** Market / listing context grounded in online sold & listing evidence. */
export interface MarketEvidence {
  /** How asking compares to recent sold comps (streets, £ deltas) */
  askingVsSoldEvidence: string;
  /** Nearby similar homes for sale / supply pressure if found */
  competingSupply: string;
  /** £/sqft or £/sqm context when floor area or EPC floor area is known */
  pricePerSqmOrSqft: string;
  /** Evidence-based levers (days on market, chain, condition, works) */
  negotiationLevers: string;
}

export interface LocationIntelligence {
  plannedInfrastructure: string;
  populationGrowth: string;
  regenerationProjects: string;
  walkability: string;
}

export interface AdvancedMetrics {
  undervaluedExplanation: string;
  renovationROI: string;
  developmentOpportunity: string;
}

/** Planning history, extensions and works — must feed valuation. */
export interface PropertyWorks {
  /** What extensions/alterations appear to exist (or "None found in public sources") */
  extensionsAndAlterations: string;
  /** Local council / Planning Portal applications for this address */
  planningApplications: string;
  /** How works (or lack of) change fair value and forecasts vs unextended comps */
  valueImpact: string;
  /** How confident we are; what still needs survey/solicitor checks */
  certainty: string;
}

/** Extra due-diligence depth beyond core valuation / area pages. */
export interface DueDiligence {
  /** EPC band, estimated running costs, upgrade notes */
  epcAndEnergy: string;
  /** Fixed broadband / mobile coverage notes */
  broadbandAndMobile: string;
  /** Freehold/leasehold, ground rent, service charge, title caveats */
  tenureAndLegal: string;
  /** Council tax band, parking permits, CPZ, bins / local charges */
  councilTaxAndParking: string;
  /** Stamp duty/LBTT, solicitor, survey, moving — rough cash needed besides deposit */
  purchaseCosts: string;
  /** Radon, mining, conservation area, noise, airports, other env flags */
  environmentalOther: string;
  /** Ownership length, chain, sales history context if known */
  ownershipAndChain: string;
  /** Ordered practical next steps after reading this report */
  recommendedNextSteps: string[];
}

export interface PropertyAnalysis {
  title: string;
  price: string;
  bedrooms: string;
  bathrooms: string;
  propertyType: string;
  location: {
    address: string;
    postcode: string;
    town: string;
  };
  summary: string;
  specs: { label: string; value: string }[];
  scores: PropertyScores;
  valuation: Valuation;
  investmentMetrics: InvestmentMetrics;
  marketAndRental: MarketAndRental;
  riskAnalysis: RiskAnalysis;
  /** Optional for older saved reports; new runs should always populate */
  riskTones?: RiskTones;
  locationIntelligence: LocationIntelligence;
  advanced: AdvancedMetrics;
  propertyWorks: PropertyWorks;
  dueDiligence: DueDiligence;
  marketEvidence?: MarketEvidence;
  pros: ProConsItem[];
  cons: ProConsItem[];
  soldHistory: SoldHistoryItem[];
  comparableSales: ComparableSaleItem[];
  areaAnalysis: {
    schools: SchoolItem[];
    transport: TransportItem[];
    crimeSafety: {
      rating: 'Very Safe' | 'Safe' | 'Average' | 'Higher Risk' | string;
      description: string;
    };
    demographics: string;
    amenities: string[];
    futureOutlook: string; // Council regeneration, development plans etc.
  };
  buyingSuitability: string; // customized to user selected goal
  viewingChecks: string[]; // what to check physically when looking around
  offerStrategy: {
    lowOffer: string;
    fairOffer: string;
    premiumOffer: string;
    negotiationTips: string[];
  };
  agentQuestions: string[]; // smart questions to ask the listing agent
  sources: { title: string; url: string }[]; // grounding search URLs
  scrapedImages?: string[]; // list of scraped listing image URLs
}

export interface SavedAnalysis {
  id: string;
  url: string;
  address: string;
  price: string;
  buyerGoal: BuyerGoal;
  analyzedAt: string;
  analysis: PropertyAnalysis;
}
