// ESLint flat config (v9) for par-zombie3.
//
// --- Limitation: typescript-eslint is incompatible with TypeScript 7 ---
// The project runs TypeScript 7.0.2 (the Go-native compiler). TS 7's npm
// package exports only `{ version, versionMajorMinor }` — the programmatic
// JS compiler API was removed. `typescript-eslint` v8.x hard-throws at load
// time when `versionMajor >= 7` (upstream tracking: typescript-eslint#10940,
// still open as of 2026-07). The MS-recommended side-by-side TS 6 install
// would require reverting the approved TS 7 migration (spec 2026-07-21).
//
// Fallback (per AUDIT ARC-003 orchestrator guidance): use
// `@babel/eslint-parser` with `@babel/preset-typescript`. This gives a real
// AST-level lint over `.ts` source WITHOUT the TS compiler.
//
// Two `eslint:recommended` rules are disabled for `.ts` files because they
// rely on JS scope semantics that don't apply to TS syntax — this matches
// the upstream `@typescript-eslint` guidance ("you don't need no-undef with
// TypeScript", and unused-vars is reported better by tsc):
//   - `no-undef`: fires on interface member names (`interface Foo { x: number }`
//     — `x` is a property key, not an identifier reference; the rule can't tell).
//   - `no-unused-vars`: tsc already enforces this via `noUnusedLocals`/`noUnusedParameters`
//     in tsconfig.json, with TS-aware accuracy the JS rule cannot match.
//
// What this config DOES catch (the bug-catching lint that remains): empty
// blocks, unreachable code, duplicate keys/cases, debugger statements,
// constant conditions, irregular whitespace, useless escapes, sparse arrays,
// and unused private class members (no-unused-private-class-members).
//
// When typescript-eslint ships TS 7 support, swap this for
// `tseslint.configs.recommended` and remove the @babel/* devDeps.
import eslint from '@eslint/js';
import babelParser from '@babel/eslint-parser';
import globals from 'globals';

export default [
  // Global ignores: build output, deps, and CommonJS/ESM config files whose
  // module/strict setup differs from `src/`.
  {
    ignores: [
      'dist/',
      '.cache/',
      'node_modules/',
      'webpack.config.js',
      'vitest.config.ts',
      'eslint.config.mjs',
      'glsl.d.ts',
    ],
  },

  eslint.configs.recommended,

  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        requireConfigFile: false,
        babelOptions: {
          presets: ['@babel/preset-typescript'],
        },
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      // See config header — both are TS-misinterpreted rules; tsc covers them.
      'no-undef': 'off',
      'no-unused-vars': 'off',
      // Allow short-circuit `x && x.foo()` — used legitimately for null guards.
      'no-unused-expressions': 'off',
    },
  },
];
