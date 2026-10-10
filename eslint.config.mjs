import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  globalIgnores([
    '.next/**', 'out/**', 'build/**', 'node_modules/**', 'next-env.d.ts',
    'output/**', 'test-results/**', '_backup/**', '_to_delete/**',
    '.agent/**', '.claude/**', '.codex/**', 'email-previews/**',
  ]),
]);
