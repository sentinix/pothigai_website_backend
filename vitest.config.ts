import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20000,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://pothigai:pothigai@localhost:5432/pothigai_test",
      JWT_SECRET: "test-secret-test-secret-test-secret-123",
      SITE_URL: "https://shop.example.test",
      PUBLIC_API_URL: "https://api.example.test",
      UPLOAD_DIR: "./tmp-test-uploads",
    },
  },
});
