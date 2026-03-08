import type { UnifiedJob } from "./types.js";
import type { TagDefinition } from "./tag-store.js";

export interface RelevanceResult {
  relevant: boolean;
  matchedTags: string[];
  scores: Record<string, number>;
  topScore: number;
}

/**
 * Beam search relevance scorer.
 *
 * Each tag is a "beam". A job's text (title + department + location) is scored
 * against each tag's patterns. Jobs that fail to reach the threshold on ALL
 * beams are pruned (not stored).
 *
 * Scoring per tag:
 *   - Full phrase match in text → +1.0
 *   - Any single word from phrase found → +0.3
 *   - Normalized: rawScore / patterns.length
 *   - Tag matches if normalizedScore >= tag.threshold
 *
 * A job is "relevant" if at least 1 tag matches.
 */
export function scoreJob(
  job: UnifiedJob,
  tags: TagDefinition[],
  maxTags = 5,
): RelevanceResult {
  const text = `${job.title} ${job.department} ${job.location}`.toLowerCase();
  const scores: Record<string, number> = {};
  const matchedTags: string[] = [];

  for (const tag of tags) {
    if (tag.patterns.length === 0) continue;

    let rawScore = 0;
    for (const pattern of tag.patterns) {
      if (text.includes(pattern)) {
        // Full phrase match
        rawScore += 1.0;
      } else {
        // Check individual words in multi-word patterns
        const words = pattern.split(/\s+/);
        if (words.length > 1) {
          const wordHits = words.filter((w) => w.length > 1 && text.includes(w)).length;
          if (wordHits > 0) {
            rawScore += 0.3 * (wordHits / words.length);
          }
        }
      }
    }

    const normalized = Math.min(rawScore / tag.patterns.length, 1.0);
    scores[tag.title] = normalized;

    if (normalized >= tag.threshold) {
      matchedTags.push(tag.title);
    }
  }

  // Sort matched tags by score descending, take top maxTags
  matchedTags.sort((a, b) => scores[b] - scores[a]);
  const topMatched = matchedTags.slice(0, maxTags);

  const topScore = topMatched.length > 0 ? scores[topMatched[0]] : 0;

  return {
    relevant: topMatched.length > 0,
    matchedTags: topMatched,
    scores,
    topScore,
  };
}
