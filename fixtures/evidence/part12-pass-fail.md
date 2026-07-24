# Part 12 / v7 PASS/FAIL

**Vitest:** 11 files / 93 tests passed (exit 0).

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Negative-claim validator | **PASS** | Red-team freehold + “Unconfirmed Tenure” / “Tenure is not on record” scrubbed to Freehold fact. Gypsy PDF: Freehold present; contradiction phrases absent. |
| Plumbing jargon sweep | **PASS** | `part12-plumbing-sweep.json`: pentlandHits=[], gypsyHits=[], banned*=[]. |
| Flood / broadband phrasing | **PASS** | Flood: Rivers & sea Very Low, Flood Zone 1, not available from official records, GOV.UK long-term flood risk. Broadband: Ofcom broadband checker (no raw URL). |
| Mode C title | **PASS** | “If it comes to market — what to check” when Estimated value. |
| Valuation cross-field | **PASS** | Mode C: price=fair=£280,000; forecast baseValue=280000; cover £270,000–£295,000; chart “Base estimated value £280,000”. |
| Comps most-recent same-street | **PASS** | Unit test: comps include most recent `nearbySameStreet` sale from recorded LR. |
| EPC age band payload | **PASS** | Fixture `constructionAgeBand: "1930-1949"` — present, not nulled by 11B. |
| Listing detection post-mortem | **PASS (diagnosed)** | See verbatim evidence below. |

## Listing detection — verbatim (live Gypsy v7 run, terminal 30997)

```
[listingDetected] detected=false portal=— asking=— evidence=no portal URL in Phase 1 research notes
[listingDetected] queried=["\"3a Gypsy Lane, Nunthorpe, Middlesbrough, Cleveland, TS7 0DY\" site:rightmove.co.uk","\"3a Gypsy Lane, Nunthorpe, Middlesbrough, Cleveland, TS7 0DY\" site:zoopla.co.uk","\"3a Gypsy Lane, Nunthorpe, Middlesbrough, Cleveland, TS7 0DY\" for sale"]
```

**Diagnosis:** Search **ran**. Gate **rejected** because Phase 1 research returned **no portal URL**. Independent check (Jul 2026): 3A Gypsy Lane TS7 0DY shows as **last sold £275,500 (Mar 2025)** on public sold-price sites — no live Rightmove/Zoopla sale listing found. So “found=false” may be correct for a true for-sale listing, or Gemini Search failed to surface a private/agent listing.

**Fix shipped:** broader queries (`Rightmove`, OnTheMarket, house+street+postcode), soft-accept gate (portal + asking + address tokens without URL), mandatory `gateLog` + `researchSnippet` + **operator block** when Mode A cannot be reached:

```
=== OPERATOR ACTION NEEDED ===
What I need: a UK listings API (Rightmove/Zoopla/PropertyData) or a pasted listing URL.
Why: Gemini Google Search did not return a portal URL — Mode A cannot be entered safely from web research alone.
```

## Operator blocks (batched)

1. **Listings / Mode A:** Paste listing URL or provision listings API key — Gemini Search alone is unreliable for portal URLs.
2. **Ofcom 10.8c:** Set `OFCOM_API_KEY` / `OFCOM_SUBSCRIPTION_KEY` for Connected Nations speeds; until then reports use checker-name wording (no raw URL).
3. **Comps “46 Gypsy Lane £242,500 Feb 2026”:** Web/sold-price site data for TS7 0DU — **not** in postcode-scoped LR for TS7 0DY. Prose citing it without LR table row must be grounded/dropped or labelled “reported sale, not yet in Land Registry” after fixture capture.
