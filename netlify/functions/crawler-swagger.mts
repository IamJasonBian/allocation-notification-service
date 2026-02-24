import type { Config } from "@netlify/functions";

const spec = {
  openapi: "3.0.3",
  info: {
    title: "Allocation Crawler Service",
    version: "1.0.0",
    description: "CRUD API for managing boards (companies), jobs, job runs, and users for the allocation crawler pipeline.",
  },
  servers: [{ url: "/api/crawler" }],
  paths: {
    "/boards": {
      get: {
        summary: "List boards",
        parameters: [
          { name: "id", in: "query", schema: { type: "string" }, description: "Get a single board by ID" },
        ],
        responses: {
          "200": { description: "Board(s) returned", content: { "application/json": { schema: { $ref: "#/components/schemas/BoardList" } } } },
          "404": { description: "Board not found" },
        },
      },
      post: {
        summary: "Add a board (filtered company)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/BoardInput" } } },
        },
        responses: {
          "201": { description: "Board created", content: { "application/json": { schema: { $ref: "#/components/schemas/Board" } } } },
          "400": { description: "Missing required fields" },
        },
      },
      delete: {
        summary: "Remove a board and all its jobs",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["id"], properties: { id: { type: "string" } } } } },
        },
        responses: {
          "200": { description: "Board removed" },
          "404": { description: "Board not found" },
        },
      },
    },
    "/jobs": {
      get: {
        summary: "List jobs",
        parameters: [
          { name: "board", in: "query", schema: { type: "string" }, description: "Filter by board ID" },
          { name: "status", in: "query", schema: { type: "string", enum: ["discovered", "queued", "applied", "found", "rejected", "expired"] } },
          { name: "id", in: "query", schema: { type: "string" }, description: "Get single job (requires board param)" },
        ],
        responses: {
          "200": { description: "Jobs returned", content: { "application/json": { schema: { $ref: "#/components/schemas/JobList" } } } },
        },
      },
      post: {
        summary: "Add one or many jobs",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  { $ref: "#/components/schemas/JobInput" },
                  { type: "object", properties: { jobs: { type: "array", items: { $ref: "#/components/schemas/JobInput" } } } },
                ],
              },
            },
          },
        },
        responses: {
          "201": { description: "Job(s) created" },
          "400": { description: "Missing required fields" },
        },
      },
      patch: {
        summary: "Update job status (mark found/applied/etc.)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["board", "job_id", "status"],
                properties: {
                  board: { type: "string" },
                  job_id: { type: "string" },
                  status: { type: "string", enum: ["discovered", "queued", "applied", "found", "rejected", "expired"] },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Job updated", content: { "application/json": { schema: { $ref: "#/components/schemas/Job" } } } },
          "404": { description: "Job not found" },
        },
      },
      delete: {
        summary: "Remove a job",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { type: "object", required: ["board", "job_id"], properties: { board: { type: "string" }, job_id: { type: "string" } } },
            },
          },
        },
        responses: {
          "200": { description: "Job removed" },
          "404": { description: "Job not found" },
        },
      },
    },
    "/runs": {
      get: {
        summary: "List job runs",
        parameters: [
          { name: "job_id", in: "query", schema: { type: "string" }, description: "Filter by job_id" },
        ],
        responses: {
          "200": { description: "Runs returned", content: { "application/json": { schema: { $ref: "#/components/schemas/RunList" } } } },
        },
      },
      post: {
        summary: "Create a job run",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/RunInput" } } },
        },
        responses: {
          "201": { description: "Run created", content: { "application/json": { schema: { $ref: "#/components/schemas/JobRun" } } } },
        },
      },
      patch: {
        summary: "Update run status",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["run_id", "status"],
                properties: {
                  run_id: { type: "string" },
                  status: { type: "string", enum: ["pending", "submitted", "success", "failed"] },
                  error: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Run updated" },
          "404": { description: "Run not found" },
        },
      },
    },
    "/users": {
      get: {
        summary: "List users",
        parameters: [
          { name: "id", in: "query", schema: { type: "string" }, description: "Get single user" },
        ],
        responses: {
          "200": { description: "User(s) returned", content: { "application/json": { schema: { $ref: "#/components/schemas/UserList" } } } },
        },
      },
      post: {
        summary: "Create or update a user",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/UserInput" } } },
        },
        responses: {
          "201": { description: "User upserted", content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } },
        },
      },
    },
    "/discover": {
      post: {
        summary: "Discovery actions (notify Slack, cleanup, retrieve for agent)",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["action"],
                properties: {
                  action: { type: "string", enum: ["notify", "cleanup", "retrieve"], description: "notify: send Slack digest. cleanup: remove processed jobs. retrieve: get jobs for allocation-agent." },
                  board: { type: "string", description: "Optional board filter" },
                  status: { type: "string", description: "Optional status filter (default: discovered for notify/retrieve, applied for cleanup)" },
                },
              },
            },
          },
        },
        responses: {
          "200": { description: "Action completed" },
        },
      },
    },
  },
  components: {
    schemas: {
      Board: {
        type: "object",
        properties: {
          id: { type: "string" },
          company: { type: "string" },
          created_at: { type: "string", format: "date-time" },
        },
      },
      BoardInput: {
        type: "object",
        required: ["id", "company"],
        properties: {
          id: { type: "string", example: "stripe" },
          company: { type: "string", example: "Stripe" },
        },
      },
      BoardList: {
        type: "object",
        properties: {
          count: { type: "integer" },
          boards: { type: "array", items: { $ref: "#/components/schemas/Board" } },
        },
      },
      Job: {
        type: "object",
        properties: {
          job_id: { type: "string" },
          board: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
          location: { type: "string" },
          department: { type: "string" },
          status: { type: "string", enum: ["discovered", "queued", "applied", "found", "rejected", "expired"] },
          discovered_at: { type: "string", format: "date-time" },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      JobInput: {
        type: "object",
        required: ["job_id", "board"],
        properties: {
          job_id: { type: "string" },
          board: { type: "string" },
          title: { type: "string" },
          url: { type: "string" },
          location: { type: "string" },
          department: { type: "string" },
        },
      },
      JobList: {
        type: "object",
        properties: {
          count: { type: "integer" },
          jobs: { type: "array", items: { $ref: "#/components/schemas/Job" } },
        },
      },
      JobRun: {
        type: "object",
        properties: {
          run_id: { type: "string" },
          job_id: { type: "string" },
          board: { type: "string" },
          variant_id: { type: "string" },
          status: { type: "string", enum: ["pending", "submitted", "success", "failed"] },
          started_at: { type: "string", format: "date-time" },
          completed_at: { type: "string", format: "date-time", nullable: true },
          error: { type: "string", nullable: true },
        },
      },
      RunInput: {
        type: "object",
        required: ["run_id", "job_id", "board", "variant_id"],
        properties: {
          run_id: { type: "string" },
          job_id: { type: "string" },
          board: { type: "string" },
          variant_id: { type: "string" },
        },
      },
      RunList: {
        type: "object",
        properties: {
          count: { type: "integer" },
          runs: { type: "array", items: { $ref: "#/components/schemas/JobRun" } },
        },
      },
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          resumes: { type: "array", items: { type: "string" } },
          answers: { type: "object", additionalProperties: { type: "string" } },
          updated_at: { type: "string", format: "date-time" },
        },
      },
      UserInput: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
          resumes: { type: "array", items: { type: "string" } },
          answers: { type: "object", additionalProperties: { type: "string" } },
        },
      },
      UserList: {
        type: "object",
        properties: {
          count: { type: "integer" },
          users: { type: "array", items: { $ref: "#/components/schemas/User" } },
        },
      },
    },
  },
};

const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Allocation Crawler Service - API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui.css" />
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.11.0/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      spec: ${JSON.stringify(spec)},
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: "BaseLayout",
    });
  </script>
</body>
</html>`;

export default async (req: Request) => {
  const url = new URL(req.url);

  // Return raw OpenAPI JSON
  if (url.searchParams.get("format") === "json") {
    return new Response(JSON.stringify(spec, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Return Swagger UI
  return new Response(swaggerHtml, {
    headers: { "Content-Type": "text/html" },
  });
};

export const config: Config = {
  path: "/api/crawler/docs",
};
