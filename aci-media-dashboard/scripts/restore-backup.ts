import { loadEnvConfig } from "@next/env";
import { assertStoreEnv } from "../src/store/assert-store-env";
import { restoreBackupFile } from "../src/store/restore";

async function main() {
  const backupPath = process.argv[2];
  if (!backupPath) throw new Error("Usage: npm run store:restore -- <backup.db>   (stop the app first)");
  loadEnvConfig(process.cwd());
  const { dataDir } = assertStoreEnv(process.env);
  const { previous } = await restoreBackupFile(dataDir, backupPath);
  console.log(previous ? `Restored. The old store was kept as ${previous}` : "Restored into an empty data folder.");
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
