import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', 'docs/.vitepress/dist/', 'docs/.vitepress/cache/', 'artifacts/'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      // Promises that are neither awaited nor handled are the main source of silent failures here.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Interfaces are implemented with async methods even where an implementation has nothing to await.
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    // Plain JavaScript and config files are not part of the TypeScript project.
    files: ['**/*.js', '**/*.mjs', 'docs/.vitepress/**', '*.config.ts'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['scripts/**', 'test/fixtures/**'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
  {
    // Vitest's asymmetric matchers (expect.stringContaining…) are typed as `any`.
    files: ['test/**'],
    rules: { '@typescript-eslint/no-unsafe-assignment': 'off' },
  },
  prettier,
);
