import bcrypt from "bcryptjs";

export const BCRYPT_COST = 12;
const PREFIX = "bcrypt:";
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/** Hash for ADMIN_PASSWORD_HASH. Base64url keeps "$" out of .env files, which would expand it. */
export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < 12) throw new Error("Use a password of at least 12 characters.");
  if (Buffer.byteLength(plain, "utf8") > 72) throw new Error("Use a password of at most 72 bytes.");
  const hash = await bcrypt.hash(plain, BCRYPT_COST);
  return PREFIX + Buffer.from(hash, "utf8").toString("base64url");
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  if (!stored.startsWith(PREFIX)) return false;
  const hash = Buffer.from(stored.slice(PREFIX.length), "base64url").toString("utf8");
  if (!BCRYPT_RE.test(hash)) return false;
  if (Buffer.byteLength(plain, "utf8") > 72) return false;
  return bcrypt.compare(plain, hash);
}
