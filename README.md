# Quant Job Tracker — Notification Service

Scrapes Greenhouse job boards for 20 quant firms every 6 hours, diffs against Redis state, and sends Slack notifications for new/removed postings.

## Tracked Companies

See [`src/config/companies.ts`](src/config/companies.ts) for the full list. Currently tracking:

| Company | Board Token | Type |
|---------|------------|------|
| Clear Street | `clearstreet` | Prime brokerage |
| Aquatic Capital | `aquaticcapitalmanagement` | Quant hedge fund |
| Graviton Research | `gravitonresearchcapital` | Quant trading |
| Hudson River Trading | `hudsonrivertrading` | HFT |
| Jane Street | `janestreet` | Quant trading |
| Two Sigma | `twosigma` | Quant hedge fund |
| Citadel Securities | `citabortsecurities` | Market maker |
| DRW | `drweng` | Trading firm |
| Old Mission Capital | `oldmissioncapital` | Market maker |
| IMC Trading | `imc` | Market maker |
| Jump Trading | `jumptrading` | HFT |
| Point72 | `point72` | Hedge fund |
| D.E. Shaw | `deshaw` | Quant hedge fund |
| Susquehanna (SIG) | `sig` | Quant trading |
| Wolverine Trading | `wolverine` | Options market maker |
| Voleon | `voleon` | ML hedge fund |
| Radix Trading | `radixtrading` | Quant trading |
| Belvedere Trading | `belaboredmoose` | Options trading |
| AQR Capital | `aqr` | Quant asset manager |
| Millennium | `millenniumadvisors` | Multi-strat hedge fund |

Each board is fetched via `https://boards-api.greenhouse.io/v1/boards/{token}/jobs`.

## Setup

```bash
npm install
```

### Environment Variables (set in Netlify UI)

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_HOST` | Yes | Redis Cloud endpoint |
| `REDIS_PORT` | Yes | Redis Cloud port |
| `REDIS_PASSWORD` | Yes | Redis Cloud password |
| `SLACK_WEBHOOK_URL` | Yes | Slack incoming webhook URL |
| `INTERNAL_WEBHOOK_SECRET` | Yes | Random string for internal auth |

## API Endpoints

- `GET /api/companies` — Lists all tracked companies and their Greenhouse URLs
- `GET /api/status` — Shows last fetch time and job counts per company

## How It Works

1. **Scheduled trigger** (`fetch-jobs`) runs every 6 hours via cron
2. It fires a POST to the **background worker** (`fetch-jobs-worker-background`) which has a 15-minute timeout
3. The worker fetches each company's Greenhouse board, diffs against Redis, and updates indexes
4. New/removed jobs are collected and sent as a Slack digest via webhook

## Forking

1. Fork this repo
2. Edit `src/config/companies.ts` to track different companies
3. Deploy to your own Netlify site
4. Set the environment variables above in Netlify UI
