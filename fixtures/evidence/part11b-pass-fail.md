# Part 11B PASS/FAIL evidence

**Vitest:** `npx vitest run` — **10 files / 84 tests passed** (exit 0).

| Criterion | Result | Evidence |
|-----------|--------|----------|
| Age band validation / era humanize | **PASS** | Mode A/C PDF: `Living with a 1930–1949 semi-detached`. `part11-gypsy.pdf.txt` same era + fabric lines. Cert-like / whitelist covered by green `part11b-ageband-mode` tests. |
| Insight titles | **PASS** | Mode C: `Three things worth knowing`. Gypsy insights: Class 1/3 era headlines (`Certificate confirms a typical 1930–1949…`, drainage “what to check”). Tests green for ranking/determinism. |
| FTB SDLT £0 | **PASS** | Mode A: `SDLT £0 (first-time buyer relief)`. Mode C at high estimate correctly shows `SDLT £23,620` (not the FTB £0 path). `part11-gypsy.pdf.txt`: `SDLT £0`. |
| Mode A vs Mode C mutual exclusivity | **PASS** | Mode A: `Asking price` + `Opening offer` / `Walk-away max`. Mode C: `Estimated value`; **no** Opening offer / Walk-away max. listingDetected: Mode A `listingDetected: true`, Mode C `false`. |
| Walk-away £1k | **PASS** | Mode A walk-away max `£268,000` (nearest-£1,000 rounding). Unit test “rounds premium/walk-away to nearest £1,000” green. |
| Living Here filters | **PASS** | Grep Mode A/C for `Arete`, `Brass Castle`, `Obstetrics`: **no hits**. Filter unit test drops school kitchen / B&B / hospital departments — green. |
| Tenure 10.8b Freehold | **PASS** | Mode A/C: `Freehold`, `Freehold assumed.`, `Freehold (HM Land Registry Price Paid)…`. Tenure test locks Freehold from LR — green. |
| Ofcom 10.8c Not on record (no API key) | **PASS** | Mode A/C: `Not on record — verify broadband and mobile at https://checker.ofcom.org.uk/…`. Ofcom skip test — green. |
| listingDetected evidence | **PASS** | See JSON below (Mode A scrap asking; Mode C estimated-value path). Parser tests green. |

## Grep highlights

### Mode C (`part11b-gypsy-modeC.pdf.txt`)
- Estimated value; Three things worth knowing; Freehold; Base estimated value £672,400; SDLT £23,620; Living with a 1930–1949; Ofcom Not on record
- No Opening offer / Walk-away; no Arete / Brass Castle / Obstetrics

### Mode A (`part11b-gypsy-modeA.pdf.txt`)
- Living with a 1930–1949; SDLT £0; Freehold; Opening offer £260,000; Walk-away max £268,000; Asking price £265,000

### `part11-gypsy.pdf.txt` (exists)
- Three things worth knowing; 1930–1949 fabric/era; Freehold; SDLT £0; Living with a 1930–1949; Opening offer; Walk-away max

## listingDetected JSON

```json
{
  "modeA": {
    "hasLiveAsking": true,
    "priceLabel": "Asking price",
    "listingDetected": {
      "listingDetected": true,
      "askingPrice": "£265,000",
      "portalUrl": null,
      "portal": "listing scrap",
      "evidence": "scrap.price=£265,000",
      "queried": []
    },
    "offerStrategy": {
      "lowOffer": "£260,000",
      "fairOffer": "£265,000",
      "premiumOffer": "£268,000",
      "negotiationTips": [
        "Open below asking only with comps evidence in hand.",
        "Use survey findings and time-on-market as levers.",
        "Confirm chain position before stretching to walk-away."
      ]
    }
  },
  "modeC": {
    "hasLiveAsking": false,
    "priceLabel": "Estimated value",
    "listingDetected": {
      "listingDetected": false,
      "askingPrice": null,
      "portalUrl": null,
      "portal": null,
      "evidence": "no scrap.price — Estimated value mode",
      "queried": []
    }
  }
}
```
