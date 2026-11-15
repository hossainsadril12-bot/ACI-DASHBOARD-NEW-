export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertEnv } = await import("./db/assert-env");
    assertEnv(process.env);
    const { assertStoreEnv } = await import("./store/assert-store-env");
    assertStoreEnv(process.env);
  }
}
