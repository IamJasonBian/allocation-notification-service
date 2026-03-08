import type { Config } from "@netlify/functions";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "Allocation Notification Service API",
    description: "Job discovery and notification service. Polls Greenhouse, Lever, and Ashby boards, diffs against Redis, sends Slack alerts. Covers tech, PE (buy side), equity research & investment banking (sell side).",
    version: "1.3.0",
  },
  servers: [
    { url: "https://route-agent.netlify.app", description: "Production" },
    { url: "http://localhost:8888", description: "Local dev" },
  ],
  tags: [
    { name: "Companies", description: "Company CRUD — list, archive & remove tracked companies" },
    { name: "Jobs", description: "Job search, filtering, and new-job feeds" },
    { name: "Redis", description: "Direct Redis access — keys, values, individual job records" },
    { name: "Resume A/B Testing", description: "Resume variant statistics" },
    { name: "Crawler", description: "Crawl execution, job status updates, and run history" },
    { name: "Tags", description: "Relevance tag management (beam search filter)" },
    { name: "Debug", description: "Debug & diagnostics" },
  ],
  paths: {
    // ── Companies ──
    "/api/companies": {
      get: {
        tags: ["Companies"],
        summary: "List tracked companies",
        description: "Returns all active companies (excludes those archived via DELETE). Reads `meta:removed_companies` from Redis to filter.",
        responses: {
          "200": {
            description: "Company list",
            content: { "application/json": { schema: { $ref: "#/components/schemas/CompanyListResponse" } } },
          },
        },
      },
    },
    "/api/company/remove": {
      delete: {
        tags: ["Companies"],
        summary: "Archive & remove a company",
        description: "1) Archives all job data to Netlify Blobs (S3).  2) Deletes all Redis keys (jobs, board, indexes, feeds, stats, metadata).  3) Adds boardToken to `meta:removed_companies` so the crawler and /api/companies skip it at runtime — effectively removing it from config.",
        parameters: [
          { name: "token", in: "query", required: true, schema: { type: "string" }, description: "ATS board token (e.g. 'perplexity')" },
        ],
        responses: {
          "200": {
            description: "Company archived, Redis purged, removed from config",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ArchiveResponse" } } },
          },
          "400": { description: "Missing token parameter" },
          "405": { description: "Method not allowed (use DELETE)" },
          "409": { description: "Company already archived/removed" },
          "500": { description: "Server error" },
        },
      },
    },

    // ── Jobs ──
    "/api/status": {
      get: {
        tags: ["Jobs"],
        summary: "Company fetch status",
        description: "Returns last fetch times and job counts for each tracked company from Redis `stats:company:*` hashes.",
        responses: {
          "200": {
            description: "Status list",
            content: { "application/json": { schema: { $ref: "#/components/schemas/StatusResponse" } } },
          },
        },
      },
    },
    "/api/new-jobs": {
      get: {
        tags: ["Jobs"],
        summary: "Recently discovered jobs",
        description: "Returns jobs from the `feed:new` sorted set within a lookback window. Reads job hashes from Redis.",
        parameters: [
          { name: "limit", in: "query", schema: { type: "integer", default: 50 }, description: "Max results" },
          { name: "hours", in: "query", schema: { type: "integer", default: 24 }, description: "Lookback hours" },
          { name: "company", in: "query", schema: { type: "string" }, description: "Filter by boardToken" },
          { name: "tag", in: "query", schema: { type: "string" }, description: "Filter by tag" },
          { name: "dept", in: "query", schema: { type: "string" }, description: "Filter by department" },
        ],
        responses: {
          "200": {
            description: "New jobs list",
            content: { "application/json": { schema: { $ref: "#/components/schemas/NewJobsResponse" } } },
          },
        },
      },
    },
    "/api/jobs/search": {
      get: {
        tags: ["Jobs"],
        summary: "Search & filter jobs",
        description: "Intersects Redis index sets (`idx:company:*`, `idx:tag:*`, `idx:dept:*`, `idx:location:*`, `idx:status:*`) to find matching jobs.",
        parameters: [
          { name: "company", in: "query", schema: { type: "string" }, description: "Filter by boardToken" },
          { name: "tag", in: "query", schema: { type: "string" }, description: "Filter by tag (e.g. 'quantitative', 'engineering')" },
          { name: "dept", in: "query", schema: { type: "string" }, description: "Filter by department" },
          { name: "location", in: "query", schema: { type: "string" }, description: "Filter by location" },
          { name: "status", in: "query", schema: { type: "string", default: "active", enum: ["active", "removed"] }, description: "Job status" },
          { name: "limit", in: "query", schema: { type: "integer", default: 100 }, description: "Max results" },
        ],
        responses: {
          "200": {
            description: "Search results",
            content: { "application/json": { schema: { $ref: "#/components/schemas/SearchResponse" } } },
          },
        },
      },
    },

    // ── Crawler ──
    "/api/crawler/jobs": {
      get: {
        tags: ["Crawler"],
        summary: "List jobs or fetch crawl runs",
        description: "Returns all crawler jobs from Redis (new schema). Use `runs_for` param to get crawl run history instead.",
        parameters: [
          { name: "status", in: "query", schema: { type: "string", enum: ["active", "removed", "applying", "applied"] }, description: "Filter by job status" },
          { name: "board", in: "query", schema: { type: "string" }, description: "Filter by board token" },
          { name: "tag", in: "query", schema: { type: "string" }, description: "Filter by tag" },
          { name: "runs_for", in: "query", schema: { type: "string" }, description: "If present, returns crawl run history instead of jobs" },
        ],
        responses: {
          "200": {
            description: "Job list or crawl run list",
            content: { "application/json": { schema: { oneOf: [
              { $ref: "#/components/schemas/CrawlerJobListResponse" },
              { type: "array", items: { $ref: "#/components/schemas/CrawlRun" } },
            ] } } },
          },
        },
      },
      patch: {
        tags: ["Crawler"],
        summary: "Update job status",
        description: "Sets the status of a specific job. Used by the auto-apply service to mark jobs as 'applying' (in progress) or 'applied' (done).",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["board", "job_id", "status"],
                properties: {
                  board: { type: "string", example: "openai", description: "Board token" },
                  job_id: { type: "string", example: "12345", description: "Job ID" },
                  status: { type: "string", enum: ["active", "removed", "applying", "applied"], description: "New status" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Status updated",
            content: { "application/json": { schema: {
              type: "object",
              properties: {
                ok: { type: "boolean" },
                board: { type: "string" },
                job_id: { type: "string" },
                status: { type: "string" },
              },
            } } },
          },
          "400": { description: "Missing or invalid parameters" },
          "404": { description: "Job not found" },
        },
      },
      post: {
        tags: ["Crawler"],
        summary: "Trigger a crawl",
        description: "Triggers a full crawl of all active boards with beam search relevance filtering. Creates a crawl run record with stats.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["action"],
                properties: {
                  action: { type: "string", enum: ["retrieve"], description: "Must be 'retrieve'" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Crawl results with run ID and per-board stats",
            content: { "application/json": { schema: { $ref: "#/components/schemas/CrawlTriggerResponse" } } },
          },
        },
      },
    },

    // ── Tags ──
    "/api/tags": {
      get: {
        tags: ["Tags"],
        summary: "List active tags or get single tag",
        description: "Returns all enabled relevance tags. Use ?name=X for a single tag, add &history=true for version history.",
        parameters: [
          { name: "name", in: "query", schema: { type: "string" }, description: "Tag name (optional)" },
          { name: "history", in: "query", schema: { type: "string", enum: ["true"] }, description: "Include version history" },
        ],
        responses: { "200": { description: "Tag list or single tag" } },
      },
      post: {
        tags: ["Tags"],
        summary: "Create a tag",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["title", "description"], properties: { title: { type: "string" }, description: { type: "string" }, threshold: { type: "number" }, enabled: { type: "boolean" } } } } } },
        responses: { "201": { description: "Tag created" }, "409": { description: "Tag already exists" } },
      },
      put: {
        tags: ["Tags"],
        summary: "Update a tag",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["title"], properties: { title: { type: "string" }, description: { type: "string" }, threshold: { type: "number" }, enabled: { type: "boolean" } } } } } },
        responses: { "200": { description: "Tag updated" }, "404": { description: "Tag not found" } },
      },
      delete: {
        tags: ["Tags"],
        summary: "Disable (soft-delete) a tag",
        parameters: [{ name: "name", in: "query", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Tag disabled" }, "404": { description: "Tag not found" } },
      },
    },

    // ── Redis: Keys ──
    "/api/redis/keys": {
      get: {
        tags: ["Redis"],
        summary: "List Redis keys by pattern",
        description: "Runs `KEYS <pattern>` and returns matching keys with their types. Use glob patterns like `jobs:*`, `idx:company:*`, `feed:*`.",
        parameters: [
          { name: "pattern", in: "query", schema: { type: "string", default: "*" }, description: "Glob pattern (e.g. 'jobs:perplexity:*', 'idx:*', 'meta:*')" },
          { name: "limit", in: "query", schema: { type: "integer", default: 200 }, description: "Max keys to return" },
        ],
        responses: {
          "200": {
            description: "Key list with types",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    pattern: { type: "string" },
                    totalMatches: { type: "integer" },
                    count: { type: "integer" },
                    keys: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          key: { type: "string" },
                          type: { type: "string", enum: ["string", "hash", "list", "set", "zset"] },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      delete: {
        tags: ["Redis"],
        summary: "Delete a Redis key",
        description: "Runs `DEL <key>` to remove a single key from Redis.",
        parameters: [
          { name: "key", in: "query", required: true, schema: { type: "string" }, description: "Exact Redis key to delete" },
        ],
        responses: {
          "200": {
            description: "Deletion result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    deleted: { type: "boolean" },
                    key: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ── Redis: Key Value ──
    "/api/redis/key": {
      get: {
        tags: ["Redis"],
        summary: "Fetch value of a Redis key",
        description: "Auto-detects key type (string, hash, list, set, zset) and returns the value. Uses `GET`, `HGETALL`, `LRANGE`, `SMEMBERS`, or `ZRANGE` accordingly.",
        parameters: [
          { name: "k", in: "query", required: true, schema: { type: "string" }, description: "Redis key (e.g. 'jobs:point72:12345', 'idx:status:active')" },
          { name: "limit", in: "query", schema: { type: "integer", default: 100 }, description: "Max items for list/zset" },
        ],
        responses: {
          "200": {
            description: "Key value",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    key: { type: "string" },
                    type: { type: "string" },
                    value: {},
                    fieldCount: { type: "integer", description: "For hash keys" },
                    size: { type: "integer", description: "For set/zset keys" },
                    length: { type: "integer", description: "For list keys" },
                  },
                },
              },
            },
          },
          "404": { description: "Key does not exist" },
        },
      },
      delete: {
        tags: ["Redis"],
        summary: "Delete a Redis key by value",
        description: "Runs `DEL <key>` for the specified key.",
        parameters: [
          { name: "k", in: "query", required: true, schema: { type: "string" }, description: "Redis key to delete" },
        ],
        responses: {
          "200": {
            description: "Deletion result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { deleted: { type: "boolean" }, key: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },

    // ── Redis: Job CRUD ──
    "/api/redis/job": {
      get: {
        tags: ["Redis"],
        summary: "Fetch a single job record",
        description: "Reads `jobs:{company}:{id}` hash from Redis and returns all fields.",
        parameters: [
          { name: "company", in: "query", required: true, schema: { type: "string" }, description: "Board token (e.g. 'point72')" },
          { name: "id", in: "query", required: true, schema: { type: "string" }, description: "Job ID" },
        ],
        responses: {
          "200": {
            description: "Job record",
            content: { "application/json": { schema: { $ref: "#/components/schemas/RedisJobRecord" } } },
          },
          "404": { description: "Job not found" },
        },
      },
      delete: {
        tags: ["Redis"],
        summary: "Delete a single job + clean indexes",
        description: "Deletes the `jobs:{company}:{id}` hash and removes the composite key from all index sets (`idx:company`, `idx:status`, `idx:dept`, `idx:location`, `idx:tag`) and feed sorted sets (`feed:new`, `feed:removed`, `feed:company`).",
        parameters: [
          { name: "company", in: "query", required: true, schema: { type: "string" }, description: "Board token" },
          { name: "id", in: "query", required: true, schema: { type: "string" }, description: "Job ID" },
        ],
        responses: {
          "200": {
            description: "Job deleted",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    deleted: { type: "boolean" },
                    key: { type: "string" },
                    title: { type: "string" },
                    company: { type: "string" },
                  },
                },
              },
            },
          },
          "404": { description: "Job not found" },
        },
      },
    },

    // ── Redis Debug ──
    "/api/redis-debug": {
      get: {
        tags: ["Debug"],
        summary: "Redis debug info",
        description: "Returns database size, all keys grouped by pattern prefix, sample values for each type, and counts for applications, submissions, email verifications, meta, and stats keys.",
        responses: {
          "200": {
            description: "Redis debug data",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    connection: { type: "string" },
                    data: {
                      type: "object",
                      properties: {
                        totalKeys: { type: "integer" },
                        keyCount: { type: "integer" },
                        allKeys: { type: "array", items: { type: "string" } },
                        patterns: { type: "object", additionalProperties: { type: "integer" } },
                        samples: { type: "array", items: { type: "object" } },
                        applications: { type: "object" },
                        emailVerifications: { type: "object" },
                        submissions: { type: "object" },
                        statuses: { type: "object" },
                        meta: { type: "object" },
                        stats: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },

    // ── Resume A/B Testing ──
    "/api/resume-stats": {
      get: {
        tags: ["Resume A/B Testing"],
        summary: "Resume variant statistics",
        description: "Returns A/B testing statistics for all resume variants from Redis `stats:resume_variant:*` hashes.",
        responses: {
          "200": {
            description: "Resume stats",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ResumeStatsResponse" } } },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      Company: {
        type: "object",
        properties: {
          boardToken: { type: "string", example: "point72" },
          displayName: { type: "string", example: "Point72" },
          description: { type: "string", example: "Multi-strategy hedge fund, equity research" },
          atsType: { type: "string", enum: ["greenhouse", "lever", "ashby"] },
          careerPageUrl: { type: "string" },
        },
      },
      CompanyListResponse: {
        type: "object",
        properties: {
          count: { type: "integer" },
          companies: { type: "array", items: { $ref: "#/components/schemas/Company" } },
        },
      },
      ArchiveResponse: {
        type: "object",
        properties: {
          message: { type: "string" },
          removedFromConfig: { type: "boolean" },
          boardToken: { type: "string" },
          archivedJobCount: { type: "integer" },
          deletedRedisKeys: { type: "integer" },
          blobKey: { type: "string", description: "S3 blob key where the archive was stored" },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      Job: {
        type: "object",
        properties: {
          id: { type: "string" },
          company: { type: "string" },
          companyName: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
          location: { type: "string" },
          department: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          firstSeenAt: { type: "string", format: "date-time" },
          lastSeenAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          status: { type: "string", enum: ["active", "removed", "applying", "applied"] },
        },
      },
      CrawlerJobListResponse: {
        type: "object",
        properties: {
          count: { type: "integer" },
          jobs: { type: "array", items: { $ref: "#/components/schemas/CrawlerJobRecord" } },
        },
      },
      CrawlerJobRecord: {
        type: "object",
        properties: {
          job_id: { type: "string" },
          board: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
          location: { type: "string" },
          department: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          status: { type: "string", enum: ["active", "removed", "applying", "applied"] },
          discovered_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      CrawlRun: {
        type: "object",
        properties: {
          run_id: { type: "string", format: "uuid" },
          started_at: { type: "string", format: "date-time" },
          completed_at: { type: "string", format: "date-time", nullable: true },
          status: { type: "string", enum: ["running", "completed", "failed"] },
          trigger: { type: "string", enum: ["scheduled", "manual"] },
          boards_total: { type: "integer" },
          boards_ok: { type: "integer" },
          boards_error: { type: "integer" },
          jobs_fetched: { type: "integer" },
          jobs_relevant: { type: "integer" },
          jobs_new: { type: "integer" },
          jobs_updated: { type: "integer" },
          jobs_removed: { type: "integer" },
          jobs_unchanged: { type: "integer" },
          duration_ms: { type: "integer" },
          error: { type: "string", nullable: true },
        },
      },
      CrawlTriggerResponse: {
        type: "object",
        properties: {
          action: { type: "string" },
          run_id: { type: "string", format: "uuid" },
          boards: { type: "integer" },
          results: { type: "array", items: { type: "object" } },
          timestamp: { type: "string", format: "date-time" },
        },
      },
      RedisJobRecord: {
        type: "object",
        description: "Raw Redis hash fields for a job record at `jobs:{boardToken}:{jobId}`",
        properties: {
          key: { type: "string", example: "jobs:point72:12345" },
          job_id: { type: "string" },
          company: { type: "string" },
          company_name: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
          department: { type: "string" },
          location: { type: "string" },
          status: { type: "string", enum: ["active", "removed", "applying", "applied"] },
          first_seen_at: { type: "string", format: "date-time" },
          last_seen_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
          removed_at: { type: "string", format: "date-time", nullable: true },
          content_hash: { type: "string", description: "16-char SHA256 prefix" },
          tags: { type: "array", items: { type: "string" } },
        },
      },
      StatusResponse: {
        type: "object",
        properties: {
          statuses: {
            type: "array",
            items: {
              type: "object",
              properties: {
                company: { type: "string" },
                boardToken: { type: "string" },
                lastFetch: { type: "string", format: "date-time", nullable: true },
                activeJobs: { type: "string" },
                totalSeen: { type: "string" },
                lastNew: { type: "string" },
                lastRemoved: { type: "string" },
              },
            },
          },
        },
      },
      NewJobsResponse: {
        type: "object",
        properties: {
          lookbackHours: { type: "integer" },
          count: { type: "integer" },
          filters: { type: "object" },
          jobs: { type: "array", items: { $ref: "#/components/schemas/Job" } },
        },
      },
      SearchResponse: {
        type: "object",
        properties: {
          totalMatches: { type: "integer" },
          count: { type: "integer" },
          filters: { type: "object" },
          jobs: { type: "array", items: { $ref: "#/components/schemas/Job" } },
        },
      },
      ResumeStatsResponse: {
        type: "object",
        properties: {
          summary: {
            type: "object",
            properties: {
              total_variants: { type: "integer" },
              total_applications: { type: "integer" },
              total_responses: { type: "integer" },
              total_interviews: { type: "integer" },
              total_offers: { type: "integer" },
              avg_response_rate: { type: "number" },
              avg_success_rate: { type: "number" },
            },
          },
          variants: { type: "array", items: { type: "object" } },
        },
      },
    },
  },
};

export default async (req: Request) => {
  return new Response(JSON.stringify(spec, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const config: Config = {
  path: "/api/openapi.json",
};
