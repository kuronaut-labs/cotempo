import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist/**', '.wrangler/**', 'node_modules/**', 'src/routeTree.gen.ts', 'worker-configuration.d.ts'] },
  ...tseslint.configs.recommended,
  {
    rules: {
      // Stub signatures keep their parameter names; underscore marks them intentionally unused.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/lib/**/*.ts', 'src/lib/**/*.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'cloudflare:workers', message: 'src/lib is runtime-agnostic (#20)' }],
          patterns: [{ group: ['~/server/*', '**/server/*'], message: 'src/lib is runtime-agnostic (#20)' }],
        },
      ],
    },
  },
)
