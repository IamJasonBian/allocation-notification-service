import type { Config } from "@netlify/functions";
import { getRedisClient, disconnectRedis } from "../../src/lib/redis.js";
import { getAllVariantStats, RESUME_VARIANTS } from "../../src/lib/resume-variants.js";

/**
 * GET /api/resume-stats
 * Returns A/B testing statistics for all resume variants
 */
export default async (req: Request) => {
  const redis = getRedisClient();

  try {
    const stats = await getAllVariantStats(redis);

    // Merge with variant metadata
    const enrichedStats = stats.map((stat) => {
      const variant = RESUME_VARIANTS.find((v) => v.id === stat.variant_id);
      return {
        ...stat,
        name: variant?.name || stat.variant_id,
        file_path: variant?.file_path,
      };
    });

    // Sort by success rate descending
    enrichedStats.sort((a, b) => b.success_rate - a.success_rate);

    return new Response(
      JSON.stringify(
        {
          summary: {
            total_variants: enrichedStats.length,
            total_applications: enrichedStats.reduce((sum, s) => sum + s.total_applications, 0),
            total_responses: enrichedStats.reduce(
              (sum, s) => sum + s.rejected + s.interviews + s.offers,
              0,
            ),
            total_interviews: enrichedStats.reduce((sum, s) => sum + s.interviews, 0),
            total_offers: enrichedStats.reduce((sum, s) => sum + s.offers, 0),
            avg_response_rate:
              enrichedStats.reduce((sum, s) => sum + s.response_rate, 0) / enrichedStats.length,
            avg_success_rate:
              enrichedStats.reduce((sum, s) => sum + s.success_rate, 0) / enrichedStats.length,
          },
          variants: enrichedStats,
        },
        null,
        2,
      ),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error fetching resume stats:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch resume statistics" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  } finally {
    await disconnectRedis();
  }
};

export const config: Config = {
  path: "/api/resume-stats",
};
