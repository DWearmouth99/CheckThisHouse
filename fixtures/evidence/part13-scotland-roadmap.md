# Part 13.5 — Scotland stack roadmap (operator decision — fuller sources)

Scotland **is supported** for purchase/generation today. E&W-only datasets degrade
honestly (region-aware messages + vacuum Mode C + distance caps). This roadmap is
what a *full* Scottish official-record stack still needs.

Demand signal: fuller nation-specific registers (RoS, Scottish EPC, Police Scotland, etc.).
No regional waitlist currently — England, Wales, Scotland and Northern Ireland are all purchasable.

## Required Scottish sources (effort estimates)

| Domain | Source | Notes | Effort |
|--------|--------|-------|--------|
| Sold prices | Registers of Scotland (ScotLIS / RoS open data) | Licensing + cost differ from HM Land Registry Price Paid. Need subject + street comps matching. | **L** (3–5 weeks) — API/download + address match + licensing review |
| EPC | Scottish EPC register | Separate service from England/Wales find-energy-certificate. Confirm bulk download vs API. | **M** (1–2 weeks) |
| Crime | Police Scotland published statistics | Different granularity than police.uk; may be force/division not street. | **M–L** (2–4 weeks) |
| Schools | Education Scotland / school information dashboard | Inspection reports differ from Ofsted single-word grades; no GIAS. | **M** (2–3 weeks) |
| Council tax | Scottish Assessors Association (SAA) portal | Band lookup by address. | **S–M** (1–2 weeks) |
| Flood | SEPA flood maps | Replace EA / planning.data England layers. | **M** (1–2 weeks) |
| Tax | LBTT + ADS in code module | LLM already produced correct LBTT; `ukPropertyTax.ts` already has Scotland bands + ADS 8%. Keep region-keyed calculator ready; wire PDF copy when Scotland launches. | **S** (done / polish) |

## Existing sources that already cover Scotland (verify before launch)

| Source | Covers Scotland? | Notes |
|--------|------------------|-------|
| **NaPTAN** (DfT) | **Yes** | National public-transport stops include Scotland. Distance caps still apply. |
| **OSM / Overpass** (Living Here POIs) | **Yes** | UK-wide OSM tags; hygiene ratings via FSA may still apply where rated. |
| **FSA** food hygiene | **Yes** | Food Standards Agency ratings cover Scotland. |
| **NHS** GP/dentist feeds | **Partial** | England NHS APIs dominate; Scotland uses NHS Scotland / different directories — treat as **not interchangeable** without a Scottish healthcare lookup. |
| **Ideal Postcodes / postcodes.io** | **Yes** | Geocoding works for Scottish postcodes (used for coords only). |
| **Ofcom broadband** | **Yes** | UK-wide checker. |
| GIAS / Ofsted | **No** | England (and Wales Ofsted) only. |
| HM Land Registry Price Paid | **No** | England & Wales. |
| police.uk | **No** | England & Wales (and some non-Scotland forces). |
| EA flood | **No** | England. |

## Launch sequence (suggested)

1. Waitlist volume threshold (operator call).
2. RoS sold prices + Scottish EPC (core valuation/facts).
3. SEPA flood + SAA council tax.
4. Education Scotland schools + Police Scotland crime (area pages).
5. Deeper nation-specific schools/crime/EPC/sold registers when demand justifies.

## Explicit non-goals right now

- Do not soft-fail into inventing Asking Price / Mode A offers when listing is unverified.
- Do not show 36-mile “local” schools — distance caps stay.
- Do not remove the LBTT calculator — keep it region-keyed.
- Northern Ireland is supported with the same honest source-gap messaging as Scotland.
