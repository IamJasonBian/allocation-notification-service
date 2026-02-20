# Resume A/B Testing System

A Redis-backed system for tracking job applications with different resume variants to optimize application success rates.

## Overview

This system allows you to:
- **Store multiple resume variants** (6 different versions)
- **Randomly assign variants** to job applications for A/B testing
- **Track application outcomes** (pending, rejected, interview, offer)
- **Compare performance** across variants to find the most effective resume

## Resume Variants

Located in: `/Users/jasonzb/Desktop/apollo/allocation-agent/blob/`

| Variant ID | Name | File |
|---|---|---|
| `variant_1` | Resume v1 | `resume_jasonzb (1).pdf` |
| `variant_2` | Resume v2 | `resume_jasonzb (2).pdf` |
| `variant_3` | Resume v3 | `resume_jasonzb (3).pdf` |
| `variant_4` | Resume v4 | `resume_jasonzb (4).pdf` |
| `variant_5` | Resume v5 (Oct 10) | `resume_jasonzb_oct10.pdf` |
| `variant_6` | Resume v6 (Oct 15 M) | `resume_jasonzb_oct15_m.pdf` |

## Redis Schema

### Variant Metadata: `resume:variant:{id}`
```redis
Hash fields:
- id: variant_1
- name: Resume v1
- file_path: /Users/jasonzb/Desktop/apollo/.../resume_jasonzb (1).pdf
- created_at: 2026-02-20T...
- file_hash: md5_hash
```

### Application Record: `application:{company}:{job_id}`
```redis
Hash fields:
- job_id: 12345
- company: notion
- company_name: Notion
- job_title: Software Engineer
- job_url: https://...
- resume_variant_id: variant_3
- applied_at: 2026-02-20T...
- status: pending|rejected|interview|offer|withdrawn
- updated_at: 2026-02-20T...
```

### Variant Statistics: `stats:resume_variant:{id}`
```redis
Hash fields:
- total_applications: 50
- pending: 20
- rejected: 15
- interviews: 10
- offers: 5
- withdrawn: 0
```

### Indexes
- `meta:resume_variants` (set) - All variant IDs
- `idx:applications:company:{company}` (set) - Applications per company
- `idx:applications:variant:{variant_id}` (set) - Applications per variant
- `feed:applications` (sorted set) - Application timeline

## Usage

### 1. Initialize Variants

Run once to set up the 6 resume variants in Redis:

```bash
REDIS_PASSWORD=your_password npx tsx scripts/init-resume-variants.ts
```

### 2. Record an Application

```typescript
import { getRedisClient } from "./src/lib/redis.js";
import { selectRandomVariant, recordApplication } from "./src/lib/resume-variants.js";

const redis = getRedisClient();

// Randomly select a variant
const variant = selectRandomVariant();

// Record the application
await recordApplication(redis, {
  job_id: "145ff46b-1441-4773-bcd3-c8c90baa598a",
  company: "notion",
  company_name: "Notion",
  job_title: "Software Engineer",
  job_url: "https://jobs.ashbyhq.com/notion/...",
  resume_variant_id: variant.id,
});
```

### 3. Update Application Status

```typescript
import { updateApplicationStatus } from "./src/lib/resume-variants.js";

// Update when you hear back
await updateApplicationStatus(redis, "notion", "145ff...", "interview");

// Possible statuses:
// - "pending"    (default, waiting for response)
// - "rejected"   (no response or explicit rejection)
// - "interview"  (got an interview!)
// - "offer"      (got an offer!)
// - "withdrawn"  (you withdrew)
```

### 4. View Statistics

**Via API:**
```bash
curl https://your-site.netlify.app/api/resume-stats
```

**Programmatically:**
```typescript
import { getAllVariantStats } from "./src/lib/resume-variants.js";

const stats = await getAllVariantStats(redis);

for (const stat of stats) {
  console.log(`${stat.variant_id}:`);
  console.log(`  Applications: ${stat.total_applications}`);
  console.log(`  Response Rate: ${(stat.response_rate * 100).toFixed(1)}%`);
  console.log(`  Success Rate: ${(stat.success_rate * 100).toFixed(1)}%`);
}
```

## API Endpoints

### `GET /api/resume-stats`

Returns A/B testing statistics for all variants.

**Response:**
```json
{
  "summary": {
    "total_variants": 6,
    "total_applications": 120,
    "total_responses": 45,
    "total_interviews": 15,
    "total_offers": 5,
    "avg_response_rate": 0.375,
    "avg_success_rate": 0.167
  },
  "variants": [
    {
      "variant_id": "variant_3",
      "name": "Resume v3",
      "file_path": "/Users/.../resume_jasonzb (3).pdf",
      "total_applications": 25,
      "pending": 10,
      "rejected": 8,
      "interviews": 5,
      "offers": 2,
      "withdrawn": 0,
      "response_rate": 0.6,
      "success_rate": 0.28
    },
    // ... other variants
  ]
}
```

## Metrics Explained

| Metric | Formula | Meaning |
|---|---|---|
| **Response Rate** | (rejected + interviews + offers) / total | How often you hear back (good or bad) |
| **Success Rate** | (interviews + offers) / total | How often you get to next stage |
| **Total Applications** | Count of all applications | Volume |
| **Pending** | Applications without response yet | Waiting |

## Example Workflow

### Scenario: Apply to 100 jobs

```typescript
import { fetchJobs } from "./src/lib/job-fetcher.js";
import { companies } from "./src/config/companies.js";
import { selectRandomVariant, recordApplication } from "./src/lib/resume-variants.js";

const redis = getRedisClient();

// Fetch all new jobs
for (const company of companies) {
  const jobs = await fetchJobs(company);

  for (const job of jobs) {
    // Randomly select variant
    const variant = selectRandomVariant();

    // Record application with variant
    await recordApplication(redis, {
      job_id: job.id,
      company: company.boardToken,
      company_name: company.displayName,
      job_title: job.title,
      job_url: job.url,
      resume_variant_id: variant.id,
    });

    console.log(`Applied to ${job.title} at ${company.displayName} with ${variant.name}`);

    // TODO: Actually submit application with the variant PDF
  }
}
```

### After 2 Weeks: Check Results

```bash
curl https://your-site.netlify.app/api/resume-stats | jq '.variants | sort_by(-.success_rate)'
```

Output shows which variant performs best:
```json
[
  {
    "variant_id": "variant_3",
    "success_rate": 0.28,  // 28% success rate!
    "response_rate": 0.6
  },
  {
    "variant_id": "variant_1",
    "success_rate": 0.15,  // Only 15%
    "response_rate": 0.4
  }
]
```

**Decision**: Use `variant_3` (Resume v3) going forward!

## Integration with Job Tracker

The resume variant system integrates seamlessly with the existing job notification service:

1. **Job discovered** → Redis (via differ.ts)
2. **Application submitted** → Record with random variant
3. **Response received** → Update status
4. **Analyze** → Compare variant performance

## Best Practices

### Randomization
- Use `selectRandomVariant()` for unbiased A/B testing
- Don't manually pick variants (introduces bias)

### Sample Size
- Need at least 20-30 applications per variant for statistical significance
- More is better (aim for 50+ per variant)

### Status Updates
- Update status as soon as you hear back (don't let data go stale)
- Be consistent with status definitions

### Variant Management
- Don't change resume files mid-test (invalidates results)
- If you update a resume, create a new variant_7, variant_8, etc.

## Troubleshooting

### Q: How do I add a new variant?

Edit `src/lib/resume-variants.ts`:
```typescript
export const RESUME_VARIANTS = [
  // ... existing variants
  {
    id: "variant_7",
    name: "Resume v7 (New Format)",
    file_path: "/Users/.../resume_new.pdf",
  },
];
```

Then re-run `npx tsx scripts/init-resume-variants.ts`

### Q: Can I reset stats?

Yes, delete the stats keys:
```bash
redis-cli DEL stats:resume_variant:variant_1
redis-cli DEL stats:resume_variant:variant_2
# ... etc
```

### Q: How do I see which variant was used for a specific job?

```bash
redis-cli HGET application:notion:145ff46b-1441-4773-bcd3-c8c90baa598a resume_variant_id
```

## Future Enhancements

- [ ] Auto-update status from email parsing
- [ ] Segment by company (which variant works best for startups vs. FAANG?)
- [ ] Segment by role (SWE vs. ML Engineer)
- [ ] Multi-armed bandit algorithm (auto-select best variant over time)
- [ ] Weekly email digest with A/B test results

## Related Files

- `src/lib/resume-variants.ts` - Core logic
- `netlify/functions/resume-stats.mts` - API endpoint
- `scripts/init-resume-variants.ts` - Setup script
- `src/lib/redis.ts` - Redis client

---

Built with ❤️ for data-driven job hunting

🤖 Enhanced with [Claude Code](https://claude.com/claude-code)
