import { createInterface } from "node:readline/promises";
import { hashPassword } from "../src/auth/password";

async function main() {
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const plain = await rl.question("New admin password (12 to 72 characters): ");
  rl.close();
  console.log(`ADMIN_PASSWORD_HASH=${await hashPassword(plain)}`);
  console.error("Put that line in .env.local (never in git).");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
