import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    environmentMatchGlobs: [["src/components/**/*.test.tsx", "jsdom"]],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx", "src/**/*.test.tsx"],
  },
});
