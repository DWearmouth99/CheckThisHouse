import React from 'react';
import { PropertyAnalysis } from '../types';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { MapPin, ShieldAlert, TrendingUp, Building2, Coins, Landmark, Target, Home } from 'lucide-react';

interface PDFReportProps {
  analysis: PropertyAnalysis;
}

export function PDFReport({ analysis }: PDFReportProps) {
  const { title, price, location, summary, scores, valuation, investmentMetrics, marketAndRental, riskAnalysis, offerStrategy, comparableSales, soldHistory } = analysis;

  // Chart data for appreciation
  const currentPrice = parseInt(price.replace(/[^0-9]/g, ''), 10) || 300000;
  const parseForecastValue = (val: string, current: number) => {
    const numeric = parseFloat(val?.replace(/[^0-9.-]/g, '') || '0') || 0;
    if (numeric > 1000) return numeric; 
    return current * (1 + numeric / 100); 
  };

  const chartData = [
    { year: 'Now', value: currentPrice },
    { year: 'Year 1', value: parseForecastValue(valuation?.forecast1y, currentPrice) },
    { year: 'Year 3', value: parseForecastValue(valuation?.forecast3y, currentPrice) },
    { year: 'Year 5', value: parseForecastValue(valuation?.forecast5y, currentPrice) },
    { year: 'Year 10', value: parseForecastValue(valuation?.forecast10y, currentPrice) },
  ];

  // Helper to determine risk colors for individual items
  const getRiskItemColor = (riskText: string = '') => {
    const text = riskText.toLowerCase();
    if (text.includes('low') || text.includes('none') || text.includes('minimal')) {
      return { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800' };
    }
    if (text.includes('medium') || text.includes('moderate')) {
      return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800' };
    }
    if (text.includes('high') || text.includes('severe')) {
      return { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-800' };
    }
    return { bg: 'bg-slate-50', border: 'border-slate-200', text: 'text-slate-800' };
  };

  const floodColor = getRiskItemColor(riskAnalysis?.floodRisk);
  const subColor = getRiskItemColor(riskAnalysis?.subsidence);
  const planColor = getRiskItemColor(riskAnalysis?.planningDevelopments);
  const leaseColor = getRiskItemColor(riskAnalysis?.leaseholdIssues);

  const getRiskColorClass = (riskLevel: string) => {
    const level = (riskLevel || '').toLowerCase();
    if (level.includes('low')) return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    if (level.includes('medium')) return 'bg-amber-50 border-amber-200 text-amber-700';
    if (level.includes('high')) return 'bg-rose-50 border-rose-200 text-rose-700';
    return 'bg-slate-50 border-slate-200 text-slate-700';
  };

  return (
    <div id="pdf-report-container" style={{ position: 'fixed', top: '200%', left: '-9999px' }} className="w-[794px] opacity-0 pointer-events-none">
      
      {/* PAGE 1: Executive Summary */}
      <div className="pdf-page bg-white w-[794px] h-[1123px] p-8 box-border flex flex-col font-sans relative overflow-hidden">
        {/* Header */}
        <div className="border-b-2 border-slate-900 pb-6 mb-8 flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-display font-bold text-slate-900">CheckThisHouse Property Investment Report</h1>
            <p className="text-slate-500 mt-2 flex items-center gap-2">
              <MapPin className="w-4 h-4" /> {typeof location.address === 'string' ? location.address : 'Property Address'}, {typeof location.town === 'string' ? location.town : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">{price}</p>
            <p className="text-sm text-slate-500">{title}</p>
          </div>
        </div>

        {/* Summary */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-2">Executive Summary</h2>
          <p className="text-sm text-slate-700 leading-relaxed">{summary}</p>
        </div>

        {/* Main Scores Grid */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Overall</p>
            <p className="text-2xl font-bold text-slate-900">{scores.overall}/100</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Value for Money</p>
            <p className="text-2xl font-bold text-slate-900">{scores.valueForMoney}/100</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Location & Lifestyle</p>
            <p className="text-2xl font-bold text-slate-900">{scores.locationRating}/100</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Condition & Repairs</p>
            <p className="text-2xl font-bold text-slate-900">{scores.conditionRating}/100</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Investment Score</p>
            <p className="text-2xl font-bold text-blue-600">{scores.investmentScore}/100</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Market Demand</p>
            <p className="text-2xl font-bold text-indigo-600">{scores.marketScore}/100</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-slate-500 mb-1">Rentability</p>
            <p className="text-2xl font-bold text-emerald-600">{scores.rentalScore}/100</p>
          </div>
          <div className={`p-4 rounded-xl border ${getRiskColorClass(scores.riskLevel)}`}>
            <p className="text-[10px] uppercase font-bold mb-1 opacity-80">Risk Level</p>
            <p className="text-2xl font-bold">{scores.riskLevel}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl">
            <p className="text-[10px] uppercase font-bold text-amber-600 mb-1">Confidence Score</p>
            <p className="text-2xl font-bold text-amber-700">{scores.confidenceScore}%</p>
          </div>
        </div>

        {/* Valuation & Chart */}
        <div className="mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-blue-600" /> Value Assessment
          </h2>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="border border-rose-200 bg-rose-50 p-4 rounded-xl text-center">
              <p className="text-xs text-rose-700 uppercase font-bold mb-1">Conservative</p>
              <p className="text-xl font-bold text-rose-900">{valuation.conservative}</p>
            </div>
            <div className="border border-blue-200 bg-blue-50 p-4 rounded-xl text-center shadow-sm">
              <p className="text-xs text-blue-700 uppercase font-bold mb-1">Fair Market</p>
              <p className="text-2xl font-bold text-blue-900">{valuation.fair}</p>
            </div>
            <div className="border border-emerald-200 bg-emerald-50 p-4 rounded-xl text-center">
              <p className="text-xs text-emerald-700 uppercase font-bold mb-1">Optimistic</p>
              <p className="text-xl font-bold text-emerald-900">{valuation.optimistic}</p>
            </div>
          </div>
          
          <div className="h-64 mt-4 bg-white border border-slate-200 p-4 rounded-xl">
            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">10-Year Capital Appreciation Forecast</h3>
            <div style={{ width: 700, height: 220 }}>
              <LineChart width={700} height={220} data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="year" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `£${(val/1000)}k`} tick={{ fontSize: 12, fill: '#64748b' }} width={60} />
                <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} dot={{ r: 4, fill: '#2563eb' }} isAnimationActive={false} />
              </LineChart>
            </div>
          </div>
        </div>
      </div>

      {/* PAGE 2: Financials & Market */}
      <div className="pdf-page bg-white w-[794px] h-[1123px] p-8 box-border flex flex-col font-sans relative overflow-hidden">
        <h2 className="text-2xl font-display font-bold text-slate-900 mb-6 border-b border-slate-200 pb-4 flex items-center gap-2">
          <Coins className="w-6 h-6 text-emerald-600" /> Financials & Market Data
        </h2>

        {/* Investment Metrics */}
        <div className="mb-8">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Investment Metrics</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-slate-200 p-4 rounded-xl flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-600">Expected Rent</span>
              <span className="font-bold text-slate-900">{investmentMetrics.estimatedRent}</span>
            </div>
            <div className="border border-slate-200 p-4 rounded-xl flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-600">Gross Yield</span>
              <span className="font-bold text-slate-900">{investmentMetrics.grossYield}</span>
            </div>
            <div className="border border-slate-200 p-4 rounded-xl flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-600">Net Yield</span>
              <span className="font-bold text-slate-900">{investmentMetrics.netYield}</span>
            </div>
            <div className="border border-slate-200 p-4 rounded-xl flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-600">Expected Cashflow</span>
              <span className="font-bold text-slate-900">{investmentMetrics.cashflow}</span>
            </div>
            <div className="border border-slate-200 p-4 rounded-xl flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-600">Estimated ROI</span>
              <span className="font-bold text-slate-900">{investmentMetrics.roi}</span>
            </div>
            <div className="border border-slate-200 p-4 rounded-xl flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-600">Break Even Timeline</span>
              <span className="font-bold text-slate-900">{investmentMetrics.breakEven}</span>
            </div>
          </div>
        </div>

        {/* Market & Area */}
        <div className="mb-8">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-600" /> Market Intelligence
          </h3>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <div className="border-b border-slate-100 pb-2">
              <span className="text-slate-500 block mb-1">Time on Market</span>
              <span className="font-medium text-slate-900">{marketAndRental?.timeOnMarket || 'N/A'}</span>
            </div>
            <div className="border-b border-slate-100 pb-2">
              <span className="text-slate-500 block mb-1">Price Trends</span>
              <span className="font-medium text-slate-900">{marketAndRental?.priceTrend || 'N/A'}</span>
            </div>
            <div className="border-b border-slate-100 pb-2">
              <span className="text-slate-500 block mb-1">Supply vs Demand</span>
              <span className="font-medium text-slate-900">{marketAndRental?.supplyDemand || 'N/A'}</span>
            </div>
            <div className="border-b border-slate-100 pb-2">
              <span className="text-slate-500 block mb-1">Tenant Profile</span>
              <span className="font-medium text-slate-900">{marketAndRental?.tenantProfile || 'N/A'}</span>
            </div>
          </div>
          <div className="mt-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm">
            <p className="font-bold text-slate-800 mb-1">Area Growth Reasoning</p>
            <p className="text-slate-600">{investmentMetrics.growthReasoning}</p>
          </div>
        </div>

        {/* Risks */}
        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-600" /> Risk Analysis
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className={`${floodColor.bg} p-4 rounded-xl border ${floodColor.border}`}>
              <p className={`text-xs font-bold ${floodColor.text} mb-1`}>Flood Risk</p>
              <p className="text-sm text-slate-700">{riskAnalysis?.floodRisk || 'N/A'}</p>
            </div>
            <div className={`${subColor.bg} p-4 rounded-xl border ${subColor.border}`}>
              <p className={`text-xs font-bold ${subColor.text} mb-1`}>Subsidence</p>
              <p className="text-sm text-slate-700">{riskAnalysis?.subsidence || 'N/A'}</p>
            </div>
            <div className={`${planColor.bg} p-4 rounded-xl border ${planColor.border}`}>
              <p className={`text-xs font-bold ${planColor.text} mb-1`}>Planning / Developments</p>
              <p className="text-sm text-slate-700">{riskAnalysis?.planningDevelopments || 'N/A'}</p>
            </div>
            <div className={`${leaseColor.bg} p-4 rounded-xl border ${leaseColor.border}`}>
              <p className={`text-xs font-bold ${leaseColor.text} mb-1`}>Leasehold & Fire Safety</p>
              <p className="text-sm text-slate-700">{riskAnalysis?.leaseholdIssues} • {riskAnalysis?.fireSafety}</p>
            </div>
          </div>
        </div>
      </div>

      {/* PAGE 3: Offer Strategy & Comparables */}
      <div className="pdf-page bg-white w-[794px] h-[1123px] p-8 box-border flex flex-col font-sans relative overflow-hidden">
        <h2 className="text-2xl font-display font-bold text-slate-900 mb-6 border-b border-slate-200 pb-4 flex items-center gap-2">
          <Landmark className="w-6 h-6 text-blue-600" /> Negotiation Strategy & Evidence
        </h2>

        <div className="mb-8">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Recommended Bidding Tiers</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="border border-rose-200 bg-rose-50 p-4 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-rose-700 mb-1 block">Cheeky Bid (Low)</span>
              <p className="font-bold text-xl text-slate-900">{offerStrategy?.lowOffer || 'N/A'}</p>
            </div>
            <div className="border border-blue-200 bg-blue-50 p-4 rounded-xl shadow-sm">
              <span className="text-[10px] uppercase font-bold text-blue-700 mb-1 block">Fair Market Bid</span>
              <p className="font-bold text-2xl text-emerald-600">{offerStrategy?.fairOffer || 'N/A'}</p>
            </div>
            <div className="border border-amber-200 bg-amber-50 p-4 rounded-xl">
              <span className="text-[10px] uppercase font-bold text-amber-700 mb-1 block">Absolute Limit (Max)</span>
              <p className="font-bold text-xl text-slate-900">{offerStrategy?.premiumOffer || 'N/A'}</p>
            </div>
          </div>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <h4 className="text-sm font-bold text-slate-800 mb-2">Negotiation Tactics</h4>
            <ul className="space-y-1">
              {offerStrategy?.negotiationTips?.map((tip, i) => (
                <li key={i} className="text-sm text-slate-700 flex gap-2"><span className="text-blue-600">•</span> {tip}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mb-8">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" /> Recent Comparable Sales
          </h3>
          <div className="space-y-2">
            {comparableSales?.slice(0, 5).map((sale, i) => (
              <div key={i} className="border border-slate-200 p-3 rounded-lg flex justify-between items-center bg-slate-50">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{sale.address}</p>
                  <p className="text-xs text-slate-500">{sale.similarity}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">{sale.price}</p>
                  <p className="text-xs text-slate-500">Sold: {sale.soldDate}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Home className="w-5 h-5 text-emerald-600" /> Historical Sold Data
          </h3>
          <div className="space-y-2">
            {soldHistory?.slice(0, 5).map((hist, i) => (
              <div key={i} className="border border-slate-200 p-3 rounded-lg flex justify-between items-center bg-slate-50">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">{hist.description}</p>
                  <p className="text-xs text-slate-500">{hist.source}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-slate-900">{hist.price}</p>
                  <p className="text-xs text-slate-500">Year: {hist.year}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="mt-auto border-t border-slate-200 pt-4 text-xs text-slate-400 text-center">
          Generated by CheckThisHouse (Checkthishouse.co.uk) • Confidential Report
        </div>
      </div>

      {/* PAGE 4: Area, Checks & Details */}
      <div className="pdf-page bg-white w-[794px] h-[1123px] p-8 box-border flex flex-col font-sans relative overflow-hidden">
        <h2 className="text-2xl font-display font-bold text-slate-900 mb-6 border-b border-slate-200 pb-4 flex items-center gap-2">
          <MapPin className="w-6 h-6 text-emerald-600" /> Area & Action Plan
        </h2>

        {/* Pros & Cons */}
        <div className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-3 text-emerald-700">Top Advantages</h3>
            <ul className="space-y-2">
              {analysis.pros?.slice(0, 4).map((pro, i) => (
                <li key={i} className="text-sm bg-emerald-50 p-2 rounded border border-emerald-100">
                  <span className="font-semibold block">{pro.title}</span>
                  <span className="text-slate-600 text-xs">{pro.desc}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-3 text-rose-700">Key Drawbacks</h3>
            <ul className="space-y-2">
              {analysis.cons?.slice(0, 4).map((con, i) => (
                <li key={i} className="text-sm bg-rose-50 p-2 rounded border border-rose-100">
                  <span className="font-semibold block">{con.title}</span>
                  <span className="text-slate-600 text-xs">{con.desc}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Area Analysis */}
        <div className="mb-6">
          <h3 className="text-lg font-bold text-slate-800 mb-3">Local Area Insights</h3>
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm space-y-3">
            <p><strong className="text-slate-900">Demographics:</strong> {analysis.areaAnalysis?.demographics}</p>
            <p><strong className="text-slate-900">Future Outlook:</strong> {analysis.areaAnalysis?.futureOutlook}</p>
            <p><strong className="text-slate-900">Crime & Safety:</strong> {analysis.areaAnalysis?.crimeSafety?.rating} - {analysis.areaAnalysis?.crimeSafety?.description}</p>
          </div>
        </div>

        {/* Viewing Checklist & Agent Questions */}
        <div className="mb-6 grid grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-3">Viewing Checklist</h3>
            <ul className="space-y-1.5 text-sm">
              {analysis.viewingChecks?.map((check, i) => (
                <li key={i} className="flex gap-2 text-slate-700">
                  <span className="text-amber-500 font-bold">□</span> {check}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800 mb-3">Questions for Agent</h3>
            <ul className="space-y-1.5 text-sm text-slate-700">
              {analysis.agentQuestions?.map((q, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-blue-500 font-bold">?</span> {q}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Suitability */}
        <div className="mb-4 bg-indigo-50 p-4 rounded-xl border border-indigo-100">
          <h3 className="text-sm font-bold text-indigo-900 mb-1">Buying Suitability</h3>
          <p className="text-sm text-indigo-800">{analysis.buyingSuitability}</p>
        </div>
      </div>

    </div>
  );
}
