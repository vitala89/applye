import nx from '@nx/eslint-plugin';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: ['**/dist/**', '**/.nx/**', '**/node_modules/**', '**/src-tauri/**'],
  },
  {
    // Architecture, enforced rather than trusted. The dependency graph is a
    // straight stack - domain and ui depend on nothing, util and data depend on
    // domain, apps depend on the layers below - and these constraints are what
    // stops the next feature from quietly reversing an arrow. `scope:desktop`
    // on the data layer is deliberate: it wraps Tauri IPC, which the web app
    // has no runtime for and must never import.
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              // `type:data` is still here, and leaves only when no component
              // injects `DbService` any more (ADR-0005). Removing it earlier
              // would fail lint in 46 places at once. Until then the "a page
              // does not reach the gateway" rule is held by review, not by this
              // file - which is the known weak point of that decision.
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: [
                'type:application',
                'type:data',
                'type:ui',
                'type:util',
                'type:domain',
              ],
            },
            {
              // Page state and orchestration. Depends on the gateway and the
              // domain; deliberately cannot depend on `type:ui`, so a store can
              // never start reaching for a component.
              sourceTag: 'type:application',
              onlyDependOnLibsWithTags: ['type:data', 'type:domain', 'type:util'],
            },
            { sourceTag: 'type:data', onlyDependOnLibsWithTags: ['type:domain', 'type:util'] },
            { sourceTag: 'type:ui', onlyDependOnLibsWithTags: ['type:domain', 'type:util'] },
            { sourceTag: 'type:util', onlyDependOnLibsWithTags: ['type:domain', 'type:util'] },
            { sourceTag: 'type:domain', onlyDependOnLibsWithTags: ['type:domain'] },
            {
              sourceTag: 'scope:desktop',
              onlyDependOnLibsWithTags: ['scope:desktop', 'scope:shared'],
            },
            { sourceTag: 'scope:web', onlyDependOnLibsWithTags: ['scope:web', 'scope:shared'] },
            { sourceTag: 'scope:shared', onlyDependOnLibsWithTags: ['scope:shared'] },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.ts'],
    extends: [...tseslint.configs.recommended, ...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: ['app', 'lib'], style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: ['app', 'lib'], style: 'kebab-case' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
    rules: {
      // `x != null` is the idiomatic "neither null nor undefined" guard and is
      // used deliberately in templates; strict comparisons stay required.
      '@angular-eslint/template/eqeqeq': ['error', { allowNullOrUndefined: true }],
    },
  },
);
