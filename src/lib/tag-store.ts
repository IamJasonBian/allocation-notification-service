import type Redis from "ioredis";

export interface TagDefinition {
  title: string;
  description: string;
  patterns: string[];
  threshold: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
  version: number;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "for", "in", "of", "to", "on",
  "at", "by", "with", "from", "as", "is", "are", "was", "were",
  "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "but", "not", "no", "nor", "so", "if", "then", "than", "too",
  "very", "can", "will", "just", "should", "now", "also",
]);

/**
 * Parse a tag description into matching patterns.
 * Splits on commas to get phrases, then also extracts individual words.
 * E.g. "Quantitative trading, risk management" →
 *   ["quantitative trading", "risk management", "quantitative", "trading", "risk", "management"]
 */
export function parseDescriptionToPatterns(description: string): string[] {
  const phrases = description
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 0);

  const words = new Set<string>();
  for (const phrase of phrases) {
    for (const word of phrase.split(/\s+/)) {
      const w = word.replace(/[^a-z0-9+#]/g, "");
      if (w.length > 1 && !STOP_WORDS.has(w)) {
        words.add(w);
      }
    }
  }

  // Full phrases first, then individual words (deduped from phrases)
  const patterns = [...phrases];
  for (const w of words) {
    if (!phrases.includes(w)) {
      patterns.push(w);
    }
  }
  return patterns;
}

function toRedisHash(tag: TagDefinition): Record<string, string> {
  return {
    title: tag.title,
    description: tag.description,
    patterns: JSON.stringify(tag.patterns),
    threshold: String(tag.threshold),
    enabled: String(tag.enabled),
    created_at: tag.created_at,
    updated_at: tag.updated_at,
    version: String(tag.version),
  };
}

function fromRedisHash(data: Record<string, string>): TagDefinition | null {
  if (!data || !data.title) return null;
  return {
    title: data.title,
    description: data.description || "",
    patterns: safeParse(data.patterns, []),
    threshold: parseFloat(data.threshold) || 0.3,
    enabled: data.enabled !== "false",
    created_at: data.created_at || "",
    updated_at: data.updated_at || "",
    version: parseInt(data.version) || 0,
  };
}

function safeParse(val: string | undefined, fallback: any): any {
  if (!val) return fallback;
  try { return JSON.parse(val); } catch { return fallback; }
}

export async function createTag(
  r: Redis,
  input: { title: string; description: string; threshold?: number; enabled?: boolean },
): Promise<TagDefinition> {
  const now = new Date().toISOString();
  const patterns = parseDescriptionToPatterns(input.description);

  const tag: TagDefinition = {
    title: input.title,
    description: input.description,
    patterns,
    threshold: input.threshold ?? 0.3,
    enabled: input.enabled ?? true,
    created_at: now,
    updated_at: now,
    version: 1,
  };

  const pipe = r.pipeline();
  pipe.hset(`tag:def:${tag.title}`, toRedisHash(tag));
  pipe.zadd(`tag:history:${tag.title}`, Date.now().toString(), JSON.stringify(tag));
  if (tag.enabled) {
    pipe.sadd("idx:tags:active", tag.title);
  }
  pipe.sadd("idx:tags:all", tag.title);
  await pipe.exec();

  return tag;
}

export async function updateTag(
  r: Redis,
  name: string,
  updates: Partial<Pick<TagDefinition, "description" | "threshold" | "enabled">>,
): Promise<TagDefinition | null> {
  const existing = await getTag(r, name);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updated: TagDefinition = {
    ...existing,
    ...updates,
    patterns: updates.description
      ? parseDescriptionToPatterns(updates.description)
      : existing.patterns,
    updated_at: now,
    version: existing.version + 1,
  };

  const pipe = r.pipeline();
  pipe.hset(`tag:def:${name}`, toRedisHash(updated));
  pipe.zadd(`tag:history:${name}`, Date.now().toString(), JSON.stringify(updated));
  if (updated.enabled) {
    pipe.sadd("idx:tags:active", name);
  } else {
    pipe.srem("idx:tags:active", name);
  }
  await pipe.exec();

  return updated;
}

export async function deleteTag(r: Redis, name: string): Promise<boolean> {
  const existing = await getTag(r, name);
  if (!existing) return false;

  return (await updateTag(r, name, { enabled: false })) !== null;
}

export async function getTag(r: Redis, name: string): Promise<TagDefinition | null> {
  const data = await r.hgetall(`tag:def:${name}`);
  return fromRedisHash(data);
}

export async function getAllActiveTags(r: Redis): Promise<TagDefinition[]> {
  const names = await r.smembers("idx:tags:active");
  if (names.length === 0) return [];

  const pipe = r.pipeline();
  for (const name of names) {
    pipe.hgetall(`tag:def:${name}`);
  }
  const results = await pipe.exec();

  const tags: TagDefinition[] = [];
  for (const [err, data] of results as Array<[Error | null, Record<string, string>]>) {
    if (err) continue;
    const tag = fromRedisHash(data);
    if (tag && tag.enabled) tags.push(tag);
  }
  return tags;
}

export async function getTagHistory(
  r: Redis,
  name: string,
  limit = 20,
): Promise<TagDefinition[]> {
  const entries = await r.zrevrange(`tag:history:${name}`, 0, limit - 1);
  return entries
    .map((entry) => { try { return JSON.parse(entry); } catch { return null; } })
    .filter(Boolean);
}
