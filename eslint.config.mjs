// ESLint flat config for the hela monorepo's TypeScript surfaces
// (apps/web, apps/app, packages/*, scripts/*). Mirrors the CI shape:
// prettier-clean (handled by prettier itself), react-hooks rules,
// react-refresh fast-refresh boundary checks, react-compiler
// optimization signals (warns on bailouts), and TypeScript rules.
//
// Lefthook runs `bunx eslint --max-warnings 0 .` on commit; CI runs
// the same in `js · prettier + typecheck` so a warning here fails
// the same way a prettier diff does.

import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import reactCompiler from "eslint-plugin-react-compiler";
import prettier from "eslint-config-prettier";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/_build/**",
      "**/deps/**",
      "**/.vite/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "apps/web/public/schemas/**",
      "packages/sdk-types/_generated/**",
      "packages/sdk-py/**",
      "packages/sdk-go/**",
      "packages/sdk-rs/**",
      // The Playwright e2e package and the SDK's own TS build are
      // out of scope for the dashboard-facing lint rules. Their own
      // tsconfig + tests cover them.
      "packages/sdk-js-e2e/**",
      "packages/sdk-js/**",
      "packages/sdk-types/**",
      "packages/ui/**",
      "infra/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["apps/{app,web}/src/**/*.{ts,tsx}", "scripts/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      globals: {
        // browser
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        crypto: "readonly",
        localStorage: "readonly",
        navigator: "readonly",
        console: "readonly",
        // node / bun (scripts)
        process: "readonly",
        Bun: "readonly",
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "react-compiler": reactCompiler,
    },
    rules: {
      // react-hooks: catches useEffectEvent misuse + exhaustive-deps
      ...reactHooks.configs.recommended.rules,

      // react-compiler: warn when a component would bail out of the
      // React 19 compiler's optimizations
      "react-compiler/react-compiler": "warn",

      // react-refresh: keep fast-refresh boundaries clean
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],

      // ts-eslint: don't make the rules so strict that adopting it
      // here is a refactor sprint. We're catching real bugs, not
      // style.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-unused-vars": "off", // covered by @typescript-eslint variant
    },
  },

  // prettier last so it disables any rules that conflict with the
  // formatter (we only run prettier for formatting; eslint stays on
  // logic).
  prettier,
];
