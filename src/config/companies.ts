/**
 * COMPANIES TO TRACK (~150 boards)
 *
 * Supports multiple ATS platforms: Greenhouse, Lever, Ashby
 *
 * To add a company:
 * - Greenhouse: https://boards.greenhouse.io/{token}
 * - Lever: https://jobs.lever.co/{token}
 * - Ashby: https://jobs.ashbyhq.com/{token}
 *
 * All tokens verified against live ATS APIs.
 * Jobs are filtered by beam-search relevance scoring against active tag definitions.
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
  // ════════════════════════════════════════
  // AI & Research
  // ════════════════════════════════════════
  { boardToken: "openai",       displayName: "OpenAI",          description: "ChatGPT, GPT-4, AI research", atsType: "lever" },
  { boardToken: "deepmind",     displayName: "DeepMind",        description: "AI research lab (Google)" },
  { boardToken: "xai",          displayName: "xAI",             description: "Grok, AI research" },
  { boardToken: "cohere",       displayName: "Cohere",          description: "Enterprise NLP/LLM platform", atsType: "ashby" },
  { boardToken: "scaleai",      displayName: "Scale AI",        description: "Data labeling + AI infra" },
  { boardToken: "runwayml",     displayName: "Runway",          description: "AI-powered creative tools" },
  { boardToken: "reka",         displayName: "Reka AI",         description: "Multimodal AI research", atsType: "ashby" },
  { boardToken: "langchain",    displayName: "LangChain",       description: "LLM application framework", atsType: "ashby" },
  { boardToken: "braintrust",   displayName: "Braintrust",      description: "AI evaluation platform", atsType: "ashby" },
  { boardToken: "motherduck",   displayName: "MotherDuck",      description: "Serverless analytics (DuckDB)", atsType: "ashby" },
  { boardToken: "cursor",       displayName: "Cursor",          description: "AI-powered code editor", atsType: "ashby" },

  // ════════════════════════════════════════
  // Productivity & Collaboration
  // ════════════════════════════════════════
  { boardToken: "notion",       displayName: "Notion",          description: "All-in-one workspace", atsType: "ashby" },
  { boardToken: "figma",        displayName: "Figma",           description: "Design tool", atsType: "lever" },
  { boardToken: "linear",       displayName: "Linear",          description: "Issue tracking for dev teams", atsType: "ashby" },
  { boardToken: "ashby",        displayName: "Ashby",           description: "ATS for high-growth startups", atsType: "ashby" },
  { boardToken: "asana",        displayName: "Asana",           description: "Work management platform" },
  { boardToken: "scribe",       displayName: "Scribe",          description: "Process documentation AI", atsType: "ashby" },

  // ════════════════════════════════════════
  // Fintech & Payments
  // ════════════════════════════════════════
  { boardToken: "stripe",       displayName: "Stripe",          description: "Payments infrastructure", atsType: "lever" },
  { boardToken: "affirm",       displayName: "Affirm",          description: "Buy now pay later" },
  { boardToken: "robinhood",    displayName: "Robinhood",       description: "Commission-free trading" },
  { boardToken: "marqeta",      displayName: "Marqeta",         description: "Card issuing platform" },
  { boardToken: "melio",        displayName: "Melio",           description: "B2B payments" },
  { boardToken: "alloy",        displayName: "Alloy",           description: "Identity verification for fintech" },
  { boardToken: "ramp",         displayName: "Ramp",            description: "Corporate cards & spend management", atsType: "ashby" },
  { boardToken: "mercury",      displayName: "Mercury",         description: "Startup banking", atsType: "ashby" },
  { boardToken: "greenlight",   displayName: "Greenlight",      description: "Family fintech platform", atsType: "lever" },
  { boardToken: "brex",         displayName: "Brex",            description: "Corporate cards + spend mgmt" },
  { boardToken: "coinbase",     displayName: "Coinbase",        description: "Crypto exchange" },
  { boardToken: "moderntreasury", displayName: "Modern Treasury", description: "Payment operations platform", atsType: "ashby" },

  // ════════════════════════════════════════
  // Infrastructure & DevTools
  // ════════════════════════════════════════
  { boardToken: "deel",         displayName: "Deel",            description: "Global payroll & compliance", atsType: "ashby" },
  { boardToken: "databricks",   displayName: "Databricks",      description: "Data + AI platform" },
  { boardToken: "datadog",      displayName: "Datadog",         description: "Observability platform" },
  { boardToken: "grafanalabs",  displayName: "Grafana Labs",    description: "Observability & dashboards" },
  { boardToken: "netlify",      displayName: "Netlify",         description: "Jamstack hosting" },
  { boardToken: "planetscale",  displayName: "PlanetScale",     description: "Serverless MySQL" },
  { boardToken: "cockroachlabs", displayName: "CockroachDB",    description: "Distributed SQL database" },
  { boardToken: "dbtlabsinc",   displayName: "dbt Labs",        description: "Analytics engineering" },
  { boardToken: "supabase",     displayName: "Supabase",        description: "Open-source Firebase", atsType: "ashby" },
  { boardToken: "neon",         displayName: "Neon",            description: "Serverless Postgres", atsType: "ashby" },
  { boardToken: "modal",        displayName: "Modal",           description: "Serverless GPU compute", atsType: "ashby" },
  { boardToken: "retool",       displayName: "Retool",          description: "Internal tools builder", atsType: "ashby" },
  { boardToken: "clerk",        displayName: "Clerk",           description: "Authentication & user management", atsType: "ashby" },
  { boardToken: "resend",       displayName: "Resend",          description: "Email API for developers", atsType: "ashby" },
  { boardToken: "inngest",      displayName: "Inngest",         description: "Event-driven background jobs", atsType: "ashby" },
  { boardToken: "posthog",      displayName: "PostHog",         description: "Open-source product analytics", atsType: "ashby" },
  { boardToken: "hightouch",    displayName: "Hightouch",       description: "Reverse ETL / data activation", atsType: "ashby" },
  { boardToken: "airbyte",      displayName: "Airbyte",         description: "Open-source ELT platform", atsType: "ashby" },
  { boardToken: "sentry",       displayName: "Sentry",          description: "Error tracking & performance", atsType: "ashby" },
  { boardToken: "nango",        displayName: "Nango",           description: "Unified API for integrations", atsType: "ashby" },
  { boardToken: "greptile",     displayName: "Greptile",        description: "AI codebase understanding", atsType: "ashby" },
  { boardToken: "knock",        displayName: "Knock",           description: "Notification infrastructure", atsType: "ashby" },

  // ════════════════════════════════════════
  // Enterprise SaaS
  // ════════════════════════════════════════
  { boardToken: "mongodb",      displayName: "MongoDB",         description: "Document database" },
  { boardToken: "elastic",      displayName: "Elastic",         description: "Search & observability" },
  { boardToken: "fivetran",     displayName: "Fivetran",        description: "Automated data integration" },
  { boardToken: "amplitude",    displayName: "Amplitude",       description: "Product analytics" },
  { boardToken: "launchdarkly", displayName: "LaunchDarkly",    description: "Feature flags platform" },
  { boardToken: "vanta",        displayName: "Vanta",           description: "Security compliance automation", atsType: "ashby" },
  { boardToken: "drata",        displayName: "Drata",           description: "Compliance automation", atsType: "ashby" },
  { boardToken: "verkada",      displayName: "Verkada",         description: "Cloud-managed security systems", atsType: "ashby" },
  { boardToken: "commonroom",   displayName: "Common Room",     description: "Community intelligence platform", atsType: "ashby" },

  // ════════════════════════════════════════
  // Big Tech & Scale-ups
  // ════════════════════════════════════════
  { boardToken: "discord",      displayName: "Discord",         description: "Communication platform" },
  { boardToken: "instacart",    displayName: "Instacart",       description: "Grocery delivery" },
  { boardToken: "airtable",     displayName: "Airtable",        description: "No-code database platform" },
  { boardToken: "gusto",        displayName: "Gusto",           description: "Payroll + HR platform" },
  { boardToken: "coreweave",    displayName: "CoreWeave",       description: "GPU cloud provider" },
  { boardToken: "lyft",         displayName: "Lyft",            description: "Rideshare" },
  { boardToken: "pinterest",    displayName: "Pinterest",       description: "Visual discovery platform" },
  { boardToken: "dropbox",      displayName: "Dropbox",         description: "Cloud storage & collaboration" },
  { boardToken: "twitch",       displayName: "Twitch",          description: "Live streaming (Amazon)" },
  { boardToken: "reddit",       displayName: "Reddit",          description: "Social news aggregation" },

  // ════════════════════════════════════════
  // Cybersecurity
  // ════════════════════════════════════════
  { boardToken: "zscaler",      displayName: "Zscaler",         description: "Cloud security / zero trust" },
  { boardToken: "tailscale",    displayName: "Tailscale",       description: "WireGuard-based VPN mesh" },
  { boardToken: "stytch",       displayName: "Stytch",          description: "Authentication infrastructure", atsType: "ashby" },
  { boardToken: "sardine",      displayName: "Sardine",         description: "Fraud prevention / compliance", atsType: "ashby" },

  // ════════════════════════════════════════
  // Crypto & Web3
  // ════════════════════════════════════════
  { boardToken: "paradigm",     displayName: "Paradigm",        description: "Crypto-native VC" },
  { boardToken: "fireblocks",   displayName: "Fireblocks",      description: "Digital asset custody" },
  { boardToken: "alchemy",      displayName: "Alchemy",         description: "Web3 developer platform" },
  { boardToken: "consensys",    displayName: "ConsenSys",       description: "Ethereum / MetaMask" },

  // ════════════════════════════════════════
  // Healthcare & Biotech
  // ════════════════════════════════════════
  { boardToken: "flatironhealth", displayName: "Flatiron Health", description: "Oncology data platform" },
  { boardToken: "veracyte",     displayName: "Veracyte",        description: "Genomic diagnostics" },
  { boardToken: "cedar",        displayName: "Cedar",           description: "Healthcare payments", atsType: "ashby" },

  // ════════════════════════════════════════
  // Robotics & Hardware
  // ════════════════════════════════════════
  { boardToken: "nuro",         displayName: "Nuro",            description: "Autonomous delivery robots" },
  { boardToken: "apptronik",    displayName: "Apptronik",       description: "Humanoid robotics" },

  // ════════════════════════════════════════
  // Misc Tech
  // ════════════════════════════════════════
  { boardToken: "envoy",        displayName: "Envoy",           description: "Workplace experience platform", atsType: "ashby" },
  { boardToken: "cloudtrucks",  displayName: "CloudTrucks",     description: "Trucking technology", atsType: "ashby" },
  { boardToken: "podium",       displayName: "Podium",          description: "Customer interaction platform", atsType: "ashby" },
  { boardToken: "homebase",     displayName: "Homebase",        description: "Hourly workforce management", atsType: "ashby" },
  { boardToken: "speak",        displayName: "Speak",           description: "AI language learning", atsType: "ashby" },
  { boardToken: "cambly",       displayName: "Cambly",          description: "English tutoring marketplace", atsType: "ashby" },
  { boardToken: "causal",       displayName: "Causal",          description: "Financial modeling platform", atsType: "ashby" },
  { boardToken: "primer",       displayName: "Primer",          description: "AI for intelligence analysis", atsType: "ashby" },
  { boardToken: "watershed",    displayName: "Watershed",       description: "Enterprise climate platform", atsType: "ashby" },
  { boardToken: "pylon",        displayName: "Pylon",           description: "B2B customer support", atsType: "ashby" },
  { boardToken: "incident",     displayName: "incident.io",     description: "Incident management", atsType: "ashby" },
  { boardToken: "warp",         displayName: "Warp",            description: "Modern terminal for teams", atsType: "ashby" },
  { boardToken: "radar",        displayName: "Radar",           description: "Location data infrastructure", atsType: "ashby" },
  { boardToken: "ghost",        displayName: "Ghost",           description: "Publishing platform", atsType: "ashby" },
  { boardToken: "beam",         displayName: "Beam",            description: "Digital wellness platform", atsType: "ashby" },
  { boardToken: "traba",        displayName: "Traba",           description: "Light industrial staffing", atsType: "ashby" },
  { boardToken: "hyperexponential", displayName: "hyperexponential", description: "Insurance pricing platform", atsType: "ashby" },
  { boardToken: "lightning",    displayName: "Lightning AI",    description: "PyTorch Lightning / AI infra", atsType: "ashby" },

  // ════════════════════════════════════════
  // Buy Side: PE / Growth Equity / Hedge Funds (Greenhouse)
  // ════════════════════════════════════════
  { boardToken: "generalatlantic",       displayName: "General Atlantic",     description: "Growth equity PE" },
  { boardToken: "gcmgrosvenor",          displayName: "GCM Grosvenor",        description: "Alternative asset management" },
  { boardToken: "vikingglobalinvestors", displayName: "Viking Global",        description: "PE / long-short equity hedge fund" },
  { boardToken: "a16z",                  displayName: "Andreessen Horowitz",  description: "Venture capital / growth equity" },
  { boardToken: "mangroup",              displayName: "Man Group",            description: "Quantitative hedge fund / asset manager" },
  { boardToken: "towerresearchcapital",  displayName: "Tower Research",       description: "Quantitative trading firm" },
  { boardToken: "gtcr",                  displayName: "GTCR",                description: "Middle-market PE, $35B+ AUM" },

  // ════════════════════════════════════════
  // Sell Side: Equity Research / Investment Banking
  // ════════════════════════════════════════
  { boardToken: "williamblair",    displayName: "William Blair",    description: "Equity research + investment banking" },
  { boardToken: "seaportglobal",   displayName: "Seaport Global",   description: "Equity research, capital markets", atsType: "lever" },
  { boardToken: "aerispartners.com", displayName: "Aeris Partners", description: "Tech M&A investment banking", atsType: "lever" },

  // ════════════════════════════════════════
  // Additional Verified Boards (Ashby)
  // ════════════════════════════════════════
  { boardToken: "abound",       displayName: "Abound",          description: "Digital banking for underserved markets", atsType: "ashby" },
  { boardToken: "assembly",     displayName: "Assembly",         description: "Employee recognition platform", atsType: "ashby" },
  { boardToken: "astra",        displayName: "Astra",            description: "Rocket launch services", atsType: "ashby" },
  { boardToken: "beacons",      displayName: "Beacons",          description: "Creator economy tools", atsType: "ashby" },
  { boardToken: "clearco",      displayName: "Clearco",          description: "Revenue-based financing", atsType: "ashby" },
  { boardToken: "glow",         displayName: "Glow",             description: "Insurance technology", atsType: "ashby" },
  { boardToken: "kustomer",     displayName: "Kustomer",         description: "Customer service CRM", atsType: "ashby" },
  { boardToken: "orchard",      displayName: "Orchard",          description: "Modern home buying platform", atsType: "ashby" },
  { boardToken: "parallel",     displayName: "Parallel",         description: "Specialized education for kids", atsType: "ashby" },
  { boardToken: "plane",        displayName: "Plane",            description: "Global payroll / contractor mgmt", atsType: "ashby" },
  { boardToken: "popl",         displayName: "Popl",             description: "Digital business cards", atsType: "ashby" },
  { boardToken: "rev",          displayName: "Rev",              description: "AI transcription services", atsType: "ashby" },
  { boardToken: "rula",         displayName: "Rula",             description: "Mental health provider network", atsType: "ashby" },
  { boardToken: "snappy",       displayName: "Snappy",           description: "Corporate gifting platform", atsType: "ashby" },
  { boardToken: "turnstile",    displayName: "Turnstile",        description: "Government technology", atsType: "ashby" },
  { boardToken: "unblocked",    displayName: "Unblocked",        description: "Engineering knowledge platform", atsType: "ashby" },
  { boardToken: "chalkboard",   displayName: "Chalkboard",       description: "Education technology", atsType: "ashby" },
  { boardToken: "campfire",     displayName: "Campfire",         description: "Social VR platform", atsType: "ashby" },
  { boardToken: "anyscale",     displayName: "Anyscale",         description: "Ray distributed compute", atsType: "ashby" },
  { boardToken: "prefect",      displayName: "Prefect",          description: "Data workflow orchestration", atsType: "ashby" },
  { boardToken: "dune",         displayName: "Dune",             description: "Crypto analytics platform", atsType: "ashby" },
  { boardToken: "pinecone",     displayName: "Pinecone",         description: "Vector database for AI", atsType: "ashby" },
  { boardToken: "weaviate",     displayName: "Weaviate",         description: "Open-source vector database", atsType: "ashby" },
  { boardToken: "rerun",        displayName: "Rerun",            description: "Multimodal data visualization", atsType: "ashby" },
  { boardToken: "rutter",       displayName: "Rutter",           description: "Unified commerce API", atsType: "ashby" },
  { boardToken: "finch",        displayName: "Finch",            description: "Unified employment API", atsType: "ashby" },
  { boardToken: "mux",          displayName: "Mux",              description: "Video infrastructure API", atsType: "ashby" },
  { boardToken: "ditto",        displayName: "Ditto",            description: "Peer-to-peer sync platform", atsType: "ashby" },
  { boardToken: "latchbio",     displayName: "Latch Bio",        description: "Bioinformatics platform", atsType: "ashby" },
  { boardToken: "baton",        displayName: "Baton",            description: "Critical systems migration", atsType: "ashby" },

  // ════════════════════════════════════════
  // Quant / Trading (Greenhouse)
  // ════════════════════════════════════════
  { boardToken: "aquaticcapitalmanagement", displayName: "Aquatic Capital",      description: "Quant hedge fund" },
  { boardToken: "gravitonresearchcapital",  displayName: "Graviton Research",    description: "Quant trading" },
  { boardToken: "janestreet",               displayName: "Jane Street",          description: "Quant trading" },
  { boardToken: "drweng",                   displayName: "DRW",                  description: "Trading firm" },
  { boardToken: "oldmissioncapital",        displayName: "Old Mission Capital",  description: "Market maker" },
  { boardToken: "imc",                      displayName: "IMC Trading",          description: "Market maker" },
  { boardToken: "jumptrading",              displayName: "Jump Trading",         description: "HFT" },
  { boardToken: "aqr",                      displayName: "AQR Capital",          description: "Quant asset manager" },
];
