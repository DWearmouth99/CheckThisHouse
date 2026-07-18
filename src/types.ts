export type BuyerGoal = 'First-time Buyer' | 'Buy-to-Let Investor' | 'Family Home' | 'House Flipping' | 'Retirement';

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
  locationIntelligence: LocationIntelligence;
  advanced: AdvancedMetrics;
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
