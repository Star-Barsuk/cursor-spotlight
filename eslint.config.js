// ESLint flat config for the extension sources.
//
// The files import GNOME platform modules (gi:// / resource://) that ESLint
// cannot resolve statically, so `no-undef` is disabled and only
// platform-agnostic rules are enforced. Run with `make lint` when `eslint` is
// installed.

export default [
    {
        files: ['**/*.js', '**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ARGV: 'readonly',
                console: 'readonly',
                global: 'readonly',
                imports: 'readonly',
                log: 'readonly',
                print: 'readonly',
                printerr: 'readonly',
                TextDecoder: 'readonly',
            },
        },
        rules: {
            'eqeqeq': ['error', 'always', {null: 'ignore'}],
            'no-empty': ['error', {allowEmptyCatch: true}],
            'no-undef': 'off',
            'no-unused-vars': ['warn', {argsIgnorePattern: '^_'}],
            'no-var': 'error',
            'prefer-const': 'warn',
        },
    },
    {
        ignores: ['node_modules/', 'schemas/'],
    },
];
