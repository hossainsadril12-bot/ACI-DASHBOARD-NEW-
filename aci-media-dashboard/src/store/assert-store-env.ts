import path from "node:path";

export type StoreEnv = { dataDir: string; adminUser: string; adminPasswordHash: string };

const HASH_RE = /^bcrypt:[A-Za-z0-9_-]{60,}$/;

/** Fails loudly at start-up when the store or the admin is not configured safely. */
export function assertStoreEnv(env: Record<string, string | undefined>, cwd: string = process.cwd()): StoreEnv {
  const raw = env.MEDIA_MIND_DATA_DIR?.trim();
  if (!raw) throw new Error("MEDIA_MIND_DATA_DIR is not set. Point it at a folder outside the app, for example ../media-mind-data.");
  const dataDir = path.resolve(cwd, raw);
  for (const forbidden of ["src", "public", ".next"]) {
    const f = path.resolve(cwd, forbidden);
    if (dataDir === f || dataDir.startsWith(f + path.sep)) {
      throw new Error(`MEDIA_MIND_DATA_DIR must not be inside ${forbidden}/. Refusing to start.`);
    }
  }
  const adminUser = env.ADMIN_USER?.trim();
  if (!adminUser) throw new Error("ADMIN_USER is not set.");
  const adminPasswordHash = env.ADMIN_PASSWORD_HASH?.trim() ?? "";
  if (!HASH_RE.test(adminPasswordHash)) {
    throw new Error("ADMIN_PASSWORD_HASH is missing or not a bcrypt hash. Create one with: npm run admin:hash");
  }
  return { dataDir, adminUser, adminPasswordHash };
}
