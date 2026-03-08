import type { Config } from "@netlify/functions";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";

/**
 * GET /api/crawler/boards
 * Returns all job boards from Redis.
 * Response: Board[] where Board = { id, company, ats, created_at }
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    const boardIds = await redis.smembers("idx:boards");

    const boards = await Promise.all(
      boardIds.map(async (id) => {
        const data = await redis.hgetall(`board:${id}`);
        return {
          id: data.id || id,
          company: data.company || id,
          ats: data.ats || "greenhouse",
          created_at: data.created_at || null,
        };
      }),
    );

    boards.sort((a, b) => a.company.localeCompare(b.company));

    return new Response(JSON.stringify(boards), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Error fetching boards:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    await disconnectRedis();
  }
};

export const config: Config = {
  path: "/api/crawler/boards",
};
