import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `dist` / `src-tauri/target` are build output (the latter holds generated
  // tauri-codegen JS). Playwright e2e fixtures legitimately use the `use`-fixture
  // argument, which the React-hooks rule mis-flags; that scaffolding isn't app
  // code. None of these belong in the app lint pass.
  globalIgnores(['dist', 'src-tauri/target', 'tests/e2e']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Honour the `_` prefix convention for intentionally unused
      // arguments / destructured names (common when overriding base-class
      // signatures or accepting future-extension parameters).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
])
