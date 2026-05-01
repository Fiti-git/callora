import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts"],
    testTimeout: 5000,
    pool: "forks",
    alias: [
      // Map relative ".js" imports written for NodeNext to the actual ".ts"
      // source files at test time.
      { find: /^(\.{1,2}\/.*)\.js$/, replacement: "$1.ts" },
      // Stub @callora/shared so importing it doesn't try to load the
      // not-yet-generated Prisma client. Tests that need real prisma shape
      // use vi.mock("@callora/shared", () => ({...}));
      {
        find: "@callora/shared",
        replacement: resolve(__dirname, "../../tests/_stubs/callora-shared.ts"),
      },
    ],
  },
});
