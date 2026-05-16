import type { Config } from "jest";

const config: Config = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          // Override Next.js-specific settings that break ts-jest
          module: "commonjs",
          moduleResolution: "node",
          jsx: "react",
        },
      },
    ],
  },
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: [
    "<rootDir>/tests/unit/**/*.test.ts",
    "<rootDir>/tests/behaviour/**/*.test.ts",
  ],
  collectCoverageFrom: [
    "src/lib/**/*.ts",
    "!src/lib/bess-sites.ts",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
  testPathIgnorePatterns: ["/node_modules/", "/.next/"],
  watchPathIgnorePatterns: ["/.next/"],
};

export default config;
