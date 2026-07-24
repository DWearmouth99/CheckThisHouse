import { PropertyAnalysis } from '../types';
import { GraduationCap, Train, ShieldCheck, HelpCircle, Users, Store, Zap } from 'lucide-react';
import { renderSchoolRatingForDisplay } from '../lib/notOnRecordRules';

interface SchoolsAndTransportProps {
  analysis: PropertyAnalysis;
}

export default function SchoolsAndTransport({ analysis }: SchoolsAndTransportProps) {
  const { areaAnalysis } = analysis;
  const { schools, transport, crimeSafety, demographics, amenities, futureOutlook } = areaAnalysis;

  const getOfstedBadge = (rating: string) => {
    const r = rating?.toLowerCase() || '';
    if (r.includes('outstanding')) {
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    }
    if (r.includes('good')) {
      return 'bg-sky-50 text-sky-700 border border-sky-200';
    }
    if (r.includes('requires improvement') || r.includes('satisfactory')) {
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    }
    if (r.includes('not yet inspected') || r.includes('see ofsted')) {
      return 'bg-slate-100 text-slate-600 border border-slate-200';
    }
    return 'bg-slate-100 text-slate-600 border border-slate-200';
  };

  const getCrimeBadge = (rating: string) => {
    const r = rating?.toLowerCase() || '';
    if (r.includes('very safe')) {
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    }
    if (r.includes('safe')) {
      return 'bg-sky-50 text-sky-700 border border-sky-200';
    }
    if (r.includes('average')) {
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    }
    return 'bg-rose-50 text-rose-700 border border-rose-200';
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* 1. Schools List */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
            <GraduationCap className="w-5 h-5 text-violet-600" />
            <h4 className="font-display font-semibold text-sm text-slate-900">Local Education & School Quality</h4>
          </div>

          {schools && schools.length > 0 ? (
            <div className="space-y-3">
              {schools.map((school, i) => {
                const rating = renderSchoolRatingForDisplay(school);
                return (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-all border border-slate-200">
                  <div className="min-w-0 pr-2">
                    <p className="font-sans font-semibold text-xs text-slate-800 truncate">{school.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 font-mono">Distance: {school.distance}</p>
                  </div>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${getOfstedBadge(rating)}`}>
                    {rating}
                  </span>
                </div>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-slate-500">School lookup statistics not available for this area.</p>
          )}
        </div>

        {/* 2. Transport Infrastructure */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
            <Train className="w-5 h-5 text-sky-600" />
            <h4 className="font-display font-semibold text-sm text-slate-900">Commute & Transit Network</h4>
          </div>

          {transport && transport.length > 0 ? (
            <div className="space-y-3">
              {transport.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 hover:bg-slate-100 transition-all border border-slate-200">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-blue-500 shadow-sm flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-sans font-semibold text-xs text-slate-800 truncate">{item.line}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5 font-mono">Type: {item.type}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-sky-50 text-sky-700 rounded border border-sky-200">
                    {item.time}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Transit connection metrics not parsed for this area.</p>
          )}
        </div>

      </div>

      {/* 3. Safety and Demographic Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        
        {/* Crime Rate & Demographics */}
        <div className="lg:col-span-4 space-y-4 border-r border-slate-100 lg:pr-6">
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <label className="text-[10px] tracking-wider font-semibold uppercase text-slate-500 font-mono">Crime Rate Indicator</label>
            </div>
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-xs font-bold px-2.5 py-1 rounded-md ${getCrimeBadge(crimeSafety.rating)}`}>
                {crimeSafety.rating}
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {crimeSafety.description}
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="w-4 h-4 text-amber-600" />
              <label className="text-[10px] tracking-wider font-semibold uppercase text-slate-500 font-mono">Local Demographics</label>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {demographics}
            </p>
          </div>
        </div>

        {/* Local Amenities & Development Outlook */}
        <div className="lg:col-span-8 space-y-4 lg:pl-2">
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <Store className="w-4 h-4 text-violet-600" />
              <label className="text-[10px] tracking-wider font-semibold uppercase text-slate-500 font-mono">Key Facilities & Amenities</label>
            </div>
            <div className="flex flex-wrap gap-2">
              {amenities && amenities.length > 0 ? (
                amenities.map((item, id) => (
                  <span key={id} className="text-[11px] font-sans px-2.5 py-1 bg-slate-50 text-slate-700 rounded-lg border border-slate-200">
                    {item}
                  </span>
                ))
              ) : (
                <span className="text-xs text-slate-500">Retail hubs, health locations not specified.</span>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="w-4 h-4 text-amber-500" />
              <label className="text-[10px] tracking-wider font-semibold uppercase text-slate-500 font-mono">Municipal Area Outlook & Projects</label>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-200">
              {futureOutlook}
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
