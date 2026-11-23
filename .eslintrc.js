module.exports = {
  root: true,
  extends: 'airbnb-base',
  env: {
    browser: true,
  },
  parser: '@babel/eslint-parser',
  parserOptions: {
    allowImportExportEverywhere: true,
    sourceType: 'module',
    requireConfigFile: false,
  },
  rules: {
    'import/extensions': ['error', { js: 'always' }], // require js file extensions in imports
    'linebreak-style': ['error', 'unix'], // enforce unix linebreaks
    'no-param-reassign': [2, { props: false }], // allow modifying properties of param
  },
  overrides: [
    {
      // Node.js tool scripts — relax browser/airbnb rules that don't apply here
      files: ['tools/**/*.mjs', 'tools/**/*.js'],
      env: { browser: false, node: true },
      rules: {
        'no-restricted-syntax': 'off',
        'no-continue': 'off',
        'no-await-in-loop': 'off',
        'no-plusplus': 'off',
        'no-console': 'off',
        'no-bitwise': 'off',
        'no-underscore-dangle': 'off',
        'no-promise-executor-return': 'off',
        'consistent-return': 'off',
        'no-unused-expressions': 'off',
        'quote-props': 'off',
        'object-curly-newline': 'off',
        'import/no-extraneous-dependencies': 'off',
      },
    },
  ],
};
