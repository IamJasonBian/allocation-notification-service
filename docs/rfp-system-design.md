# RFP: Allocation Notification Service — System Design

**Author:** Jason Bian
**Date:** 2026-02-19
**Status:** Draft

---

## 1. Overview

The Allocation Notification Service is a serverless job-board scraper that monitors Greenhouse-hosted career pages for 35 companies (20 quant/trading firms + 15 tech startups), diffs job listings against cached state in Redis, and sends Slack digest notifications when jobs are added or removed.

The stored job index is designed to feed downstream auto-apply agents.

---

## 2. Current Architecture

### 2.1 Component Diagram

```
┌──────────────┐   cron 6h    ┌──────────────────┐   HTTP POST    ┌─────────────────────────┐
│  Netlify      │ ──────────→ │  fetch-jobs       │ ─────────────→ │  fetch-jobs-worker       │
│  Scheduler    │              │  (trigger fn)     │   w/ secret    │  -background (15m limit) │
└──────────────┘              └──────────────────┘                └────────────┬──────────────┘
                                                                              │
                                                          ┌───────────────────┼───────────────┐
                                                          ▼                   ▼               ▼
                                                   ┌────────────┐   ┌──────────────┐  ┌────────────┐
                                                   │ Greenhouse  │   │    Redis      │  │   Slack    │
                                                   │ API (read)  │   │  Cloud (TLS)  │  │  Webhook   │
                                                   └────────────┘   └──────────────┘  └────────────┘
```

### 2.2 Runtime Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js >= 18 |
| Language | TypeScript 5.4 (ESM, ES2022 target) |
| Bundler | esbuild (via Netlify) |
| Serverless | Netlify Functions (NOT Edge Functions — see §5) |
| Data store | Redis Cloud (RedisLabs) via ioredis 5.x w/ TLS |
| External API | Greenhouse public job board API |
| Notifications | Slack Incoming Webhooks (Block Kit) |

### 2.3 Function Inventory

| Function | Type | Purpose |
|---|---|---|
| `fetch-jobs` | Scheduled (cron `0 */6 * * *`) | Triggers background worker via internal POST |
| `fetch-jobs-worker-background` | Background (15-min timeout) | Main processing loop: fetch → diff → notify |
| `companies` | On-demand | `GET /api/companies` — lists tracked firms |
| `status` | On-demand | `GET /api/status` — per-company job counts |

### 2.4 Data Flow (per 6-hour cycle)

1. Netlify cron fires `fetch-jobs`, which POSTs to background worker with shared secret
2. Worker iterates 35 companies **sequentially** (500ms inter-request delay)
3. For each company: fetch Greenhouse API → SHA-256 content hash per job → diff against Redis
4. Classify each job as `NEW` / `UPDATED` / `REMOVED` / `UNCHANGED`
5. Write job records + indexes to Redis via pipelined batch
6. Collect all `JobNotification` objects **in-memory** into a single array
7. Send one Slack Block Kit digest with new/removed jobs
8. Prune feed entries older than 6 months

### 2.5 Redis Data Model

| Key Pattern | Type | Purpose |
|---|---|---|
| `jobs:{token}:{id}` | Hash | Full job record (title, url, status, hashes, tags, timestamps) |
| `idx:company:{token}` | Set | All job keys for a company |
| `idx:status:active` / `removed` | Set | Jobs by lifecycle status |
| `idx:dept:{dept}` | Set | Jobs by normalized department |
| `idx:location:{loc}` | Set | Jobs by normalized location |
| `idx:tag:{tag}` | Set | Jobs by auto-extracted tag |
| `feed:new` / `feed:removed` | Sorted Set | Time-ordered event streams |
| `feed:company:{token}` | Sorted Set | Per-company new-job feed |
| `meta:last_fetch:{token}` | String | ISO timestamp of last fetch |
| `stats:company:{token}` | Hash | Per-company active/total/new/removed counts |

---

## 3. Current Limitations

| Constraint | Impact |
|---|---|
| **Sequential processing** | 35 companies × 500ms = ~17.5s minimum; scales linearly |
| **15-min hard timeout** | Netlify background function ceiling caps company count |
| **In-memory notification buffer** | Crash at company #30 loses notifications for #1–29 |
| **No retry granularity** | Failed Slack POST loses the entire batch |
| **Single Greenhouse API only** | FAANG companies (Google, Meta, Apple, Netflix) use proprietary ATS — cannot be scraped via this approach |
| **No Edge Function support** | Edge Functions run Deno with 50ms CPU limit; ioredis requires Node.js TCP sockets (see §5) |

---

## 4. Proposed Scaling Path

### Phase 1: Single Container (recommended next step)

Migrate from 4 Netlify functions to a single long-running Node.js process.

```
┌────────────────────────────────────┐
│  Single Container (Hono + cron)    │
│                                    │
│  ┌──────────┐  ┌────────────────┐  │
│  │ HTTP API  │  │  node-cron     │  │
│  │ /api/*    │  │  (0 */6 * * *) │  │
│  └──────────┘  └───────┬────────┘  │
│                        │           │
│       ┌────────────────┼────────┐  │
│       ▼                ▼        ▼  │
│  ┌──────────┐  ┌──────────┐  ┌──┐ │
│  │greenhouse│  │  differ  │  │S │ │
│  │  .ts     │  │  .ts     │  │l │ │
│  │          │  │          │  │a │ │
│  └──────────┘  └──────────┘  │c │ │
│                              │k │ │
│                              └──┘ │
└────────────────────────────────────┘
         │
         ▼
   ┌──────────────┐
   │  Redis Cloud  │
   └──────────────┘
```

**Changes required:**
- Remove `@netlify/functions` dependency
- Add `hono` (~14KB) + `cron` (~5KB)
- Replace 4 Netlify handler files with 1 server entrypoint (~50 lines)
- Add `Dockerfile` + `docker-compose.yml`
- `src/lib/*` stays **untouched** — pure Node.js, no Netlify coupling

**Gains:**
- No timeout ceiling
- No two-function webhook dance
- Deploy anywhere: Fly.io, Railway, ECS, $5 VPS
- Same Redis Cloud connection

**Estimated effort:** Small — the library layer (`src/lib/`) is already decoupled from the Netlify handler layer.

### Phase 2: Queue-Based Fan-Out (future, when company count > 100)

```
┌──────────────┐
│  Scheduler   │
└──────┬───────┘
       │ enqueue 1 msg per company
       ▼
┌──────────────────┐
│  Redis Streams   │
│  (XADD/XREAD)   │
└──────┬───────────┘
       │ fan-out to consumer group
  ┌────┼────┐
  ▼    ▼    ▼
┌───┐┌───┐┌───┐
│W1 ││W2 ││WN │  ← parallel scrapers
└─┬─┘└─┬─┘└─┬─┘
  │    │    │
  ▼    ▼    ▼
┌──────────────────┐
│  Redis Streams   │
│  "notifications" │
└──────┬───────────┘
       │ batch consume (60s window)
       ▼
┌──────────────┐
│  Notifier    │
│  (Slack POST)│
└──────────────┘
```

**Why Redis Streams over SQS:**
- Already paying for Redis Cloud — no new infra
- `XREADGROUP` provides consumer groups with ACK (at-least-once delivery)
- Sorted by insertion order — natural feed semantics
- Can inspect stream with `XRANGE` for debugging

**When to trigger this phase:**
- Company list exceeds ~100 (approaching 15-min wall-clock with 500ms delays)
- Need per-company retry isolation (one bad API response shouldn't block others)
- Adding non-Greenhouse scrapers (Lever, Workday) with different latency profiles

---

## 5. Why Not Netlify Edge Functions

| Constraint | Edge Functions | Regular Functions (current) |
|---|---|---|
| Runtime | Deno | Node.js |
| CPU time limit | **50ms** | 10s (background: 15min) |
| Native modules | Not supported | Supported (ioredis uses TCP) |
| Use case | Request transforms, auth, redirects | Long-running compute |

Edge Functions are designed for sub-millisecond request enrichment at CDN nodes, not multi-minute batch processing. The ioredis client requires Node.js `net.Socket` which is unavailable in Deno's restricted edge runtime.

---

## 6. Greenhouse API Constraints

The service is limited to companies with **public Greenhouse job boards**. Notable companies that cannot be tracked:

| Company | ATS Used |
|---|---|
| Google / Alphabet | Google Careers (proprietary) |
| Meta / Facebook | Internal ATS |
| Apple | apple.com/jobs (proprietary) |
| Netflix | Lever |
| Amazon | Amazon Jobs (proprietary) |
| Microsoft | Microsoft Careers (proprietary) |

Expanding to non-Greenhouse companies would require building additional scraper modules (Lever API, Workday scraper, etc.) — a Phase 2+ concern.

---

## 7. Applicant Profile Integration

Resume and structured profile data are stored at:
- `data/resume.pdf` — PDF resume for auto-apply agents
- `src/config/applicant.ts` — structured profile (contact, education, experience, skills)

Downstream submit/auto-apply agents can import the applicant config and attach the resume PDF when programmatically filling applications.

---

## 8. Company Coverage (as of 2026-02-19)

### Quant / Trading (20 firms)
Clear Street, Aquatic Capital, Graviton Research, Hudson River Trading, Jane Street, Two Sigma, Citadel Securities, DRW, Old Mission Capital, IMC Trading, Jump Trading, Point72, D.E. Shaw, Susquehanna (SIG), Wolverine Trading, Voleon, Radix Trading, Belvedere Trading, AQR Capital, Millennium

### Tech Startups / Scale-ups (15 companies)
Stripe, Databricks, Figma, Anthropic, Scale AI, Datadog, Coinbase, Discord, Instacart, Airtable, Vercel, Brex, Gusto, CoreWeave, Runway

---

## 9. Open Questions

- [ ] Target deployment platform for Phase 1 container (Fly.io vs Railway vs ECS)?
- [ ] Should the cron interval decrease from 6h to 1h for high-priority companies?
- [ ] Priority order for non-Greenhouse scraper modules (Lever, Workday, custom)?
- [ ] Auto-apply agent design: headless browser vs API-based submission?
