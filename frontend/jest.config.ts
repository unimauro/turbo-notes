import type { Config } from "jest";
import nextJest from "next/jest.js";

const createJestConfig = nextJest({
  // Load next.config.ts and .env files in the test environment.
  dir: "./",
});

const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // e2e/ holds Playwright specs (*.spec.ts) — they must not be run by jest.
  testPathIgnorePatterns: ["/node_modules/", "<rootDir>/e2e/"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/**/*.d.ts",
    "!src/app/layout.tsx", // server component shell, covered by build
  ],
};

export default createJestConfig(config);
