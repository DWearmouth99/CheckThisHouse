# CheckThisHouse

Rightmove property & area analyzer with a multi-page PDF investment report.

## AI provider

**Provider:** Gemini + Google Search only (set `GEMINI_API_KEY` in `.env.local`)  
Default model: `gemini-3.1-pro-preview` (override with `GEMINI_MODEL`)

Analysis runs in two steps (required by the Gemini API):
1. Google Search research brief
2. Structured JSON valuation report

OpenAI is disabled — Gemini failures surface as generation errors (no silent provider fallback).

## Run locally

1. `npm install`
2. Copy `.env.example` → `.env.local` and set `GEMINI_API_KEY`
3. `npm run dev` → http://localhost:3000
