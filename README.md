# Job Notification Service

A serverless job tracking system that monitors startup job postings across **multiple ATS platforms** (Greenhouse, Lever, Ashby) and sends notifications when jobs are added or removed.

**Now tracking 22 high-growth startups** including OpenAI, Anthropic, Notion, Stripe, Ramp, and more!

## Tracked Companies

**Full list:** [`src/config/companies.ts`](src/config/companies.ts)

### Multi-ATS Support
- **Greenhouse**: `https://boards-api.greenhouse.io/v1/boards/{token}/jobs`
- **Lever**: `https://api.lever.co/v0/postings/{token}`
- **Ashby**: `https://api.ashbyhq.com/posting-api/job-board/{token}`

### Current Companies (22 total)
- **AI**: OpenAI, Anthropic
- **Productivity**: Notion, Figma, Linear, Ashby
- **Fintech**: Stripe, Ramp
- **Infrastructure**: Perplexity, Deel
- **Tech Scale-ups**: Databricks, Scale AI, Datadog, Coinbase, Discord, Instacart, Airtable, Vercel, Brex, Gusto, CoreWeave, Runway

## Setup

```bash
npm install
```

### Environment Variables 

Netlify UI is used to manage secrets but any key-value store will work

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

## Flow

1. **Scheduled trigger** (`fetch-jobs`) runs every x hours via cron
2. Fires a POST to the **background worker** (`fetch-jobs-worker-background`) on a 15-minute timeout
3. The worker fetches each company's Greenhouse board, diffs against Redis, and updates existing indexes (data here is used by application agents)
4. New/removed jobs are collected and sent as a Slack digest via webhook

## Forking Deployment

1. Fork this repo
2. Edit `src/config/companies.ts` to track different companies
3. Deploy to Netlify site
4. Set the environment variables above in Netlify UI

## Monitoring

Healthy - 

<img width="657" height="599" alt="ops" src="https://github.com/user-attachments/assets/7387ebc0-222e-4616-831b-219bf646c3d8" />

* Email- jasonzb@umich.edu - gh auth
* Port - redis-17054.c99.us-east-1-4.ec2.cloud.redislabs.com:17054



