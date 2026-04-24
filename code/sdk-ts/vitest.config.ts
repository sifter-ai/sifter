import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    extensions: [".ts", ".js"],
    alias: [
      // Redirect .js imports to .ts sources so vitest runs against TypeScript directly
      { find: /^(\.\.?\/.+)\.js$/, replacement: "$1.ts" },
    ],
  },
  test: {
    environment: "node",
    include: ["src/test/**/*.test.ts"],
  },
});
