import noUnsanitized from 'eslint-plugin-no-unsanitized';
import globals from 'globals';

export default [
  {
    ignores: ['node_modules/', 'dist/', 'test-forms/', 'test/']
  },
  {
    files: ['src/**/*.{js,ts}'],
    plugins: {
      'no-unsanitized': noUnsanitized
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: 'readonly',
        browser: 'readonly',
        globalThis: 'readonly'
      }
    },
    rules: {
      // Clean Code Limits
      'max-lines': ['error', { max: 200, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true, IIFEs: true }],

      // Mozilla Add-on Security Rules
      'no-unsanitized/method': ['error', { escape: { methods: ['chrome.runtime.getURL'] } }],
      'no-unsanitized/property': 'error',

      // Best Practices
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-undef': 'error'
    }
  }
];
