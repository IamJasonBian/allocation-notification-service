/**
 * Initialize resume variants in Redis
 * Run with: npx tsx scripts/init-resume-variants.ts
 */

import { getRedisClient, disconnectRedis } from "../src/lib/redis.js";
import {
  initializeVariants,
  recordApplication,
  selectRandomVariant,
  getAllVariantStats,
} from "../src/lib/resume-variants.js";

async function main() {
  console.log("🔧 Initializing resume variants in Redis...\n");

  const redis = getRedisClient();

  try {
    // Initialize all variants
    await initializeVariants(redis);
    console.log("✅ Initialized 6 resume variants\n");

    // Display variant stats
    const stats = await getAllVariantStats(redis);
    console.log("📊 Current Variant Statistics:");
    console.log("─".repeat(80));
    console.log(
      `${"Variant".padEnd(25)} ${"Apps".padEnd(8)} ${"Pending".padEnd(10)} ${"Response %".padEnd(12)} ${"Success %"}`,
    );
    console.log("─".repeat(80));

    for (const stat of stats) {
      console.log(
        `${stat.variant_id.padEnd(25)} ${String(stat.total_applications).padEnd(8)} ${String(stat.pending).padEnd(10)} ${(stat.response_rate * 100).toFixed(1).padEnd(12)}% ${(stat.success_rate * 100).toFixed(1)}%`,
      );
    }
    console.log("─".repeat(80));

    console.log("\n✅ Setup complete!");
    console.log("\n💡 Next steps:");
    console.log("   1. Record applications using recordApplication()");
    console.log("   2. Update status using updateApplicationStatus()");
    console.log("   3. View stats at /api/resume-stats endpoint");
    console.log("\n📝 Example usage:");
    console.log("   const variant = selectRandomVariant();");
    console.log("   await recordApplication(redis, {");
    console.log('     job_id: "12345",');
    console.log('     company: "notion",');
    console.log('     company_name: "Notion",');
    console.log('     job_title: "Software Engineer",');
    console.log('     job_url: "https://...",');
    console.log("     resume_variant_id: variant.id");
    console.log("   });");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await disconnectRedis();
  }
}

main();
