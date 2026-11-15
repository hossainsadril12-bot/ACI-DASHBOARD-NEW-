import path from "node:path";
import { isBcryptHash } from "@/auth/password";

export type StoreEnv = { dataDir: string; adminUser: string; adminPasswordHash: string };


/** Fails loudly at start-up when the store or the admin is not configured safely. */
export function assertStoreEnv(env: Record<string, string | undefined>, cwd: string = process.cwd()): StoreEnv {
  if (env.NETLIFY || env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME) {
    throw new Error("Media Mind needs one long-running server with a disk. Serverless hosting (Netlify, Vercel, AWS Lambda) is not supported. Refusing to start.");
  }
  const raw = env.MEDIA_MIND_DATA_DIR?.trim();
  if (!raw) throw new Error("MEDIA_MIND_DATA_DIR is not set. Point it at a folder outside the app, for example ../media-mind-data.");
  const dataDir = path.resolve(cwd, raw);
  const fold = (x: string) => (process.platform === "win32" ? x.toLowerCase() : x);
  for (const forbidden of ["src", "public", ".next"]) {
    const f = path.resolve(cwd, forbidden);
    if (fold(dataDir) === fold(f) || fold(dataDir).startsWith(fold(f + path.sep))) {
      throw new Error(`MEDIA_MIND_DATA_DIR must not be inside ${forbidden}/. Refusing to start.`);
    }
  }
  const adminUser = env.ADMIN_USER?.trim();
  if (!adminUser) throw new Error("ADMIN_USER is not set.");
  const adminPasswordHash = env.ADMIN_PASSWORD_HASH?.trim() ?? "";
  if (!isBcryptHash(adminPasswordHash)) {
    throw new Error("ADMIN_PASSWORD_HASH is missing or not a bcrypt hash. Create one with: npm run admin:hash");
  }
  return { dataDir, adminUser, adminPasswordHash };
}
