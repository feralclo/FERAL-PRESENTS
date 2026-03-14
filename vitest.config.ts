import { defineConfig } from "vitest/config";
import path from "path";

const alias = { "@": path.resolve(__dirname, "./src") };

export default defineConfig({
  resolve: { alias },
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/__tests__/setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/__tests__/integration/**"],
        },
      },
      {
        resolve: { alias },
        test: {
          name: "integration",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./src/__tests__/setup.ts"],
          include: ["src/__tests__/integration/**/*.integration.test.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
