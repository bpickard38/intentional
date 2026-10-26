import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Run in a timezone west of UTC so date-key parsing bugs surface in tests.
process.env.TZ = "America/Denver";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
