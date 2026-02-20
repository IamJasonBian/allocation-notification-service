/**
 * COMPANIES TO TRACK
 *
 * Supports multiple ATS platforms: Greenhouse, Lever, Ashby
 *
 * To add a company:
 * - Greenhouse: https://boards.greenhouse.io/{token}
 * - Lever: https://jobs.lever.co/{token}
 * - Ashby: https://jobs.ashbyhq.com/{token}
 *
 * Fork this repo? Edit THIS FILE to track different companies.
 */

export type ATSType = "greenhouse" | "lever" | "ashby";

export interface Company {
  /** ATS board URL token */
  boardToken: string;
  /** Human-readable company name */
  displayName: string;
  /** Brief description */
  description: string;
  /** ATS platform type (defaults to greenhouse for backwards compat) */
  atsType?: ATSType;
}

export const companies: Company[] = [
  // ── AI & Research (Lever/Ashby) ──
  { boardToken: "openai",      displayName: "OpenAI",       description: "ChatGPT, GPT-4, AI research", atsType: "lever" },
  { boardToken: "anthropic",   displayName: "Anthropic",    description: "Claude, AI safety", atsType: "lever" },

  // ── Productivity & Collaboration (Lever/Ashby) ──
  { boardToken: "notion",      displayName: "Notion",       description: "All-in-one workspace", atsType: "ashby" },
  { boardToken: "figma",       displayName: "Figma",        description: "Design tool", atsType: "lever" },
  { boardToken: "linear",      displayName: "Linear",       description: "Issue tracking for dev teams", atsType: "ashby" },
  { boardToken: "ashby",       displayName: "Ashby",        description: "ATS for high-growth startups", atsType: "ashby" },

  // ── Fintech & Payments (Lever/Ashby) ──
  { boardToken: "stripe",      displayName: "Stripe",       description: "Payments infrastructure", atsType: "lever" },
  { boardToken: "ramp",        displayName: "Ramp",         description: "Corporate cards & spend management", atsType: "ashby" },

  // ── Infrastructure & DevTools (Ashby) ──
  { boardToken: "perplexity",  displayName: "Perplexity",   description: "AI-powered search engine", atsType: "ashby" },
  { boardToken: "deel",        displayName: "Deel",         description: "Global payroll & compliance", atsType: "ashby" },

  // ── Tech Startups / Scale-ups (Greenhouse) ──
  { boardToken: "databricks",               displayName: "Databricks",           description: "Data + AI platform" },
  { boardToken: "scaleai",                  displayName: "Scale AI",             description: "Data labeling + AI infra" },
  { boardToken: "datadog",                  displayName: "Datadog",              description: "Observability platform" },
  { boardToken: "coinbase",                 displayName: "Coinbase",             description: "Crypto exchange" },
  { boardToken: "discord",                  displayName: "Discord",              description: "Communication platform" },
  { boardToken: "instacart",                displayName: "Instacart",            description: "Grocery delivery" },
  { boardToken: "airtable",                 displayName: "Airtable",             description: "No-code database platform" },
  { boardToken: "vercel",                   displayName: "Vercel",               description: "Frontend cloud platform" },
  { boardToken: "brex",                     displayName: "Brex",                 description: "Corporate cards + spend mgmt" },
  { boardToken: "gusto",                    displayName: "Gusto",                description: "Payroll + HR platform" },
  { boardToken: "coreweave",                displayName: "CoreWeave",            description: "GPU cloud provider" },
  { boardToken: "runwayml",                 displayName: "Runway",               description: "AI-powered creative tools" },

  // ── Quant / Trading (Greenhouse) ──
  // Uncomment to enable quant/finance tracking:
  // { boardToken: "clearstreet",              displayName: "Clear Street",         description: "Prime brokerage, risk, trading systems" },
  // { boardToken: "aquaticcapitalmanagement", displayName: "Aquatic Capital",      description: "Quant hedge fund" },
  // { boardToken: "gravitonresearchcapital",  displayName: "Graviton Research",    description: "Quant trading" },
  // { boardToken: "hudsonrivertrading",       displayName: "Hudson River Trading", description: "HFT" },
  // { boardToken: "janestreet",               displayName: "Jane Street",          description: "Quant trading" },
  // { boardToken: "twosigma",                 displayName: "Two Sigma",            description: "Quant hedge fund" },
  // { boardToken: "citabortsecurities",       displayName: "Citadel Securities",   description: "Market maker" },
  // { boardToken: "drweng",                   displayName: "DRW",                  description: "Trading firm" },
  // { boardToken: "oldmissioncapital",        displayName: "Old Mission Capital",  description: "Market maker" },
  // { boardToken: "imc",                      displayName: "IMC Trading",          description: "Market maker" },
  // { boardToken: "jumptrading",              displayName: "Jump Trading",         description: "HFT" },
  // { boardToken: "point72",                  displayName: "Point72",              description: "Hedge fund" },
  // { boardToken: "deshaw",                   displayName: "D.E. Shaw",            description: "Quant hedge fund" },
  // { boardToken: "sig",                      displayName: "Susquehanna (SIG)",    description: "Quant trading" },
  // { boardToken: "wolverine",                displayName: "Wolverine Trading",    description: "Options market maker" },
  // { boardToken: "voleon",                   displayName: "Voleon",               description: "ML hedge fund" },
  // { boardToken: "radixtrading",             displayName: "Radix Trading",        description: "Quant trading" },
  // { boardToken: "belaboredmoose",           displayName: "Belvedere Trading",    description: "Options trading" },
  // { boardToken: "aqr",                      displayName: "AQR Capital",          description: "Quant asset manager" },
  // { boardToken: "millenniumadvisors",       displayName: "Millennium",           description: "Multi-strat hedge fund" },
];
