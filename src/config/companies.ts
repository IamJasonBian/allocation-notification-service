/**
 * COMPANIES TO TRACK
 *
 * Each entry is a Greenhouse job board to scrape.
 * To add a company: add an entry with its Greenhouse board token.
 * Find a board token by visiting: https://boards.greenhouse.io/{token}
 *
 * Fork this repo? Edit THIS FILE to track different companies.
 */

export interface Company {
  /** Greenhouse board URL token (the slug in boards.greenhouse.io/{token}) */
  boardToken: string;
  /** Human-readable company name */
  displayName: string;
  /** Brief description */
  description: string;
}

export const companies: Company[] = [
  // ── Quant / Trading ──
  { boardToken: "clearstreet",              displayName: "Clear Street",         description: "Prime brokerage, risk, trading systems" },
  { boardToken: "aquaticcapitalmanagement", displayName: "Aquatic Capital",      description: "Quant hedge fund" },
  { boardToken: "gravitonresearchcapital",  displayName: "Graviton Research",    description: "Quant trading" },
  { boardToken: "hudsonrivertrading",       displayName: "Hudson River Trading", description: "HFT" },
  { boardToken: "janestreet",               displayName: "Jane Street",          description: "Quant trading" },
  { boardToken: "twosigma",                 displayName: "Two Sigma",            description: "Quant hedge fund" },
  { boardToken: "citabortsecurities",       displayName: "Citadel Securities",   description: "Market maker" },
  { boardToken: "drweng",                   displayName: "DRW",                  description: "Trading firm" },
  { boardToken: "oldmissioncapital",        displayName: "Old Mission Capital",  description: "Market maker" },
  { boardToken: "imc",                      displayName: "IMC Trading",          description: "Market maker" },
  { boardToken: "jumptrading",              displayName: "Jump Trading",         description: "HFT" },
  { boardToken: "point72",                  displayName: "Point72",              description: "Hedge fund" },
  { boardToken: "deshaw",                   displayName: "D.E. Shaw",            description: "Quant hedge fund" },
  { boardToken: "sig",                      displayName: "Susquehanna (SIG)",    description: "Quant trading" },
  { boardToken: "wolverine",                displayName: "Wolverine Trading",    description: "Options market maker" },
  { boardToken: "voleon",                   displayName: "Voleon",               description: "ML hedge fund" },
  { boardToken: "radixtrading",             displayName: "Radix Trading",        description: "Quant trading" },
  { boardToken: "belaboredmoose",           displayName: "Belvedere Trading",    description: "Options trading" },
  { boardToken: "aqr",                      displayName: "AQR Capital",          description: "Quant asset manager" },
  { boardToken: "millenniumadvisors",       displayName: "Millennium",           description: "Multi-strat hedge fund" },

  // ── Tech Startups / Scale-ups ──
  { boardToken: "stripe",                   displayName: "Stripe",               description: "Payments infrastructure" },
  { boardToken: "databricks",               displayName: "Databricks",           description: "Data + AI platform" },
  { boardToken: "figma",                    displayName: "Figma",                description: "Design tools" },
  { boardToken: "anthropic",                displayName: "Anthropic",            description: "AI safety and research" },
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
];
