# Deployment Guide

## Prerequisites

- GitHub repository: `IamJasonBian/allocation-notification-service` ✅
- Netlify account: `jasonzb@umich.edu` ✅
- Redis Cloud instance with credentials ✅

---

## Step 1: Deploy to Netlify

### Via Netlify Web UI (Recommended)

1. **Go to Netlify Dashboard**
   - Visit: https://app.netlify.com/
   - Login with your account

2. **Import Project**
   - Click **"Add new site"** → **"Import an existing project"**
   - Choose **"GitHub"**
   - Select repository: **`IamJasonBian/allocation-notification-service`**

3. **Configure Build Settings**
   - **Build command:** (leave empty)
   - **Publish directory:** (leave empty)
   - **Functions directory:** `netlify/functions` (should auto-detect)
   - Click **"Deploy site"**

4. **Note your site URL**
   - You'll get a URL like: `https://allocation-jobs-xyz.netlify.app`
   - Save this for next steps

---

## Step 2: Configure Environment Variables

In Netlify Dashboard:

1. Go to **Site settings** → **Environment variables**
2. Add the following variables:

| Variable | Value | Description |
|---|---|---|
| `REDIS_HOST` | `redis-17054.c99.us-east-1-4.ec2.cloud.redislabs.com` | Redis Cloud host |
| `REDIS_PORT` | `17054` | Redis Cloud port |
| `REDIS_PASSWORD` | `64n39uHOB0KEYZsfNbOdaGboWPZ0tOy4` | Redis Cloud password |
| `INTERNAL_WEBHOOK_SECRET` | `<generate random string>` | Secret for triggering background jobs |
| `SLACK_WEBHOOK_URL` | `<optional>` | Slack webhook for notifications |

**Generate `INTERNAL_WEBHOOK_SECRET`:**
```bash
openssl rand -hex 32
```

3. **Redeploy** after adding env vars:
   - Go to **Deploys** → **Trigger deploy** → **Deploy site**

---

## Step 3: Set Up GitHub Secrets

For automated job fetching via GitHub Actions:

1. Go to your GitHub repo: https://github.com/IamJasonBian/allocation-notification-service
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Add two secrets:

| Secret Name | Value |
|---|---|
| `NETLIFY_SITE_URL` | Your Netlify site URL (without `https://`, e.g., `allocation-jobs-xyz.netlify.app`) |
| `INTERNAL_WEBHOOK_SECRET` | Same value as the Netlify env var |

---

## Step 4: Test the Deployment

### Test the Status Endpoint

```bash
# Replace with your actual Netlify URL
curl https://YOUR-SITE.netlify.app/api/status
```

Expected response: JSON with company statuses

### Test Manual Job Fetch

```bash
# Replace with your actual secret and URL
curl -X POST \
  -H "x-webhook-secret: YOUR_SECRET" \
  https://YOUR-SITE.netlify.app/.netlify/functions/fetch-jobs-worker-background
```

Expected: 202 Accepted (background job triggered)

---

## Step 5: Verify GitHub Actions

1. Go to **Actions** tab in your GitHub repo
2. You should see the **"Fetch Jobs"** workflow
3. Click **"Run workflow"** to test manual trigger
4. Automated runs will happen every 6 hours based on the cron schedule

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│ GitHub Actions (Cron: every 6 hours)               │
│  └─ Triggers Netlify Function via webhook          │
└────────────────────┬────────────────────────────────┘
                     │ POST with secret
                     ▼
┌─────────────────────────────────────────────────────┐
│ Netlify Function (fetch-jobs-worker-background)    │
│  ├─ Fetches jobs from Greenhouse/Lever/Ashby APIs  │
│  ├─ Compares with Redis state                      │
│  ├─ Updates Redis indexes                          │
│  └─ Sends Slack notifications for changes          │
└────────────────────┬────────────────────────────────┘
                     │ Updates
                     ▼
┌─────────────────────────────────────────────────────┐
│ Redis Cloud                                         │
│  ├─ jobs:{company}:{id} (hash)                      │
│  ├─ idx:company:{token} (set)                       │
│  ├─ feed:new (sorted set)                          │
│  └─ stats:company:{token} (hash)                    │
└─────────────────────────────────────────────────────┘
```

---

## Current Companies Tracked

**Total: 22 companies across 3 ATS platforms**

### Lever (4 companies)
- OpenAI, Anthropic, Figma, Stripe

### Ashby (6 companies)
- Notion, Linear, Ashby, Ramp, Perplexity, Deel

### Greenhouse (12 companies)
- Databricks, Scale AI, Datadog, Coinbase, Discord, Instacart, Airtable, Vercel, Brex, Gusto, CoreWeave, Runway

---

## Monitoring

### Check Job Fetch Logs

1. **Netlify Function Logs:**
   - Dashboard → Functions → `fetch-jobs-worker-background` → View logs

2. **GitHub Actions Logs:**
   - Actions tab → Click on latest run

### Redis Inspection

```bash
# Connect to Redis (requires ioredis or redis-cli)
redis-cli -h redis-17054.c99.us-east-1-4.ec2.cloud.redislabs.com \
  -p 17054 \
  -a 64n39uHOB0KEYZsfNbOdaGboWPZ0tOy4 \
  --tls

# Check active jobs count
SCARD idx:status:active

# Check company stats
HGETALL stats:company:notion
```

---

## Troubleshooting

### Function times out
- Increase Netlify function timeout (requires Pro plan)
- Reduce number of companies tracked
- Add `await new Promise(r => setTimeout(r, 1000))` between API calls

### Redis connection fails
- Verify env vars are set correctly
- Check Redis Cloud dashboard for connection issues
- Ensure TLS is enabled in redis.ts

### No jobs appearing
- Check if companies are using different ATS platforms
- Verify boardToken is correct (test API manually)
- Check Netlify function logs for errors

---

## Next Steps

- [ ] Add Slack webhook for notifications
- [ ] Set up alerting for failed job fetches
- [ ] Add more companies to track
- [ ] Create a frontend dashboard to view job changes
