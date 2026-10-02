/**
 * @portal/config — shared ESLint preset (flat config, ESLint 9).
 * Sovereign Portal C-137 monorepo.
 *
 * Usage in a workspace package (`eslint.config.js`):
 *   import portalPreset from '@portal/config/eslint-preset';
 *   export default portalPreset;
 *
 * TypeScript-aware rules activate only when @typescript-eslint is resolvable,
 * so the preset never hard-fails in a partial install.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

const require = createRequire(import.meta.url);

function tryResolve(specifier) {
  try {
    return require.resolve(specifier);
  } catch {
    return null;
  }
}

const tsParserPath = tryResolve('@typescript-eslint/parser');
const tsPluginPath = tryResolve('@typescript-eslint/eslint-plugin');
const reactPluginPath = tryResolve('eslint-plugin-react');
const reactHooksPath = tryResolve('eslint-plugin-react-hooks');

const hasTypeScript = Boolean(tsParserPath && tsPluginPath);
const hasReact = Boolean(reactPluginPath);
const hasReactHooks = Boolean(reactHooksPath);

/** Base rules shared by every workspace package. */
export const baseRules = {
  'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
  'no-debugger': 'error',
  'no-var': 'error',
  'prefer-const': 'error',
  'object-shorthand': ['error', 'always'],
  eqeqeq: ['error', 'smart'],
  'no-implicit-coercion': 'warn',
  'no-duplicate-imports': 'error',
  'no-unused-private-class-members': 'error',
  'sort-imports': [
    'off',
    {
      ignoreDeclarationSort: true,
    },
  ],
};

/** Cybernetic-codebase conventions: no placeholder scaffolding may ship. */
export const sovereignGuardRules = {
  'no-warning-comments': [
    'error',
    {
      terms: ['todo', 'fixme', 'xxx', 'hack', 'placeholder', 'your-code-here'],
      location: 'anywhere',
    },
  ],
};

const config = [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/*.min.js',
      '**/public/models/**',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        self: 'readonly',
        caches: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        indexedDB: 'readonly',
        crypto: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      ...baseRules,
      ...sovereignGuardRules,
    },
  },
];

if (hasTypeScript) {
  config.push({
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: require(tsParserPath),
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': require(tsPluginPath),
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'error',
    },
  });
}

if (hasReact) {
  const reactPlugin = require(reactPluginPath);
  config.push({
    files: ['**/*.{jsx,tsx}'],
    plugins: { react: reactPlugin },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/jsx-uses-react': 'off',
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-key': 'error',
      'react/jsx-no-duplicate-props': 'error',
      'react/self-closing-comp': 'warn',
    },
  });
}

if (hasReactHooks) {
  config.push({
    files: ['**/*.{jsx,tsx}'],
    plugins: { 'react-hooks': require(reactHooksPath) },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  });
}

/**
 * Convenience helper: returns whether a workspace-local `eslint.config.js`
 * should layer on top of this preset (used by tooling scripts).
 */
export function hasLocalEslintConfig(cwd = process.cwd()) {
  return (
    existsSync(resolve(cwd, 'eslint.config.js')) ||
    existsSync(resolve(cwd, 'eslint.config.mjs')) ||
    existsSync(resolve(dirname(cwd), 'packages/config/eslint-preset.js'))
  );
}

export { hasTypeScript, hasReact, hasReactHooks };
export default config;
