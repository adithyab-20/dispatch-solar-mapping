import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    // jsdom is still required: page-transition.test.ts drives document and
    // matchMedia. The remaining suites are otherwise pure logic.
    environment: "jsdom",
    css: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
