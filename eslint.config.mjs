import nx from '@nx/eslint-plugin';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

/**
 * The components that still inject `DbService`, and the only ones allowed to.
 *
 * ADR-0005 says a page component renders and delegates: screen state belongs to
 * a signal store in `libs/application`, and the gateway is the layer's to call.
 * The ADR planned to enforce that by removing `type:data` from `type:app`'s
 * allowlist once no component injected `DbService` - but `depConstraints` keys on
 * the **project** tag, so that flip also bans the gateway from the 18 `shared/*`
 * services, which is a different and much larger change. The rule below is what
 * the ADR actually meant, and it can be an error today.
 *
 * **This list only ever shrinks.** A component that is not on it fails the build
 * for injecting `DbService`, so the 27th cannot be added; each migrated page
 * deletes its own line. When the list is empty, the rule and the list go with it.
 *
 * The entries start with a double-star glob on purpose, and it is not decoration.
 * `nx lint` loads `apps/desktop/eslint.config.mjs`, which spreads this file, so a
 * `files` pattern resolves against **that** directory rather than the repository
 * root - a repo-relative path silently matches nothing, and a silent allowlist
 * entry means a rule that never fires where it should. Verified both ways: the
 * rule errors on a component not listed here, and stays quiet on every one that
 * is.
 */
const COMPONENTS_STILL_USING_THE_GATEWAY = [
  '**/core/onboarding/onboarding.component.ts',
  '**/pages/jobs/jobs.component.ts',
  '**/pages/settings/settings.component.ts',
];

/** Matches `inject(DbService)` however it is written, including a type argument. */
const GATEWAY_INJECTION =
  'CallExpression[callee.name="inject"] > Identifier.arguments[name="DbService"]';

const GATEWAY_INJECTION_MESSAGE =
  'A component may not inject DbService (ADR-0005). Screen state and data access belong to a signal store in libs/application; the component renders and delegates. If this component is being migrated, remove its entry from COMPONENTS_STILL_USING_THE_GATEWAY in eslint.config.mjs.';

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
              // `type:data` stays here, and it is **not** the rule that keeps a
              // component away from the gateway - see
              // `COMPONENTS_STILL_USING_THE_GATEWAY` above, which is. This
              // constraint keys on the project tag, so removing `type:data`
              // would also ban the gateway from the app's own `shared/*`
              // services; it leaves only when those have moved into
              // `libs/application` too (ADR-0005, amendment four).
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
    // ADR-0005, enforced: a component does not reach the data gateway. The
    // allowlist below it is the ratchet - a component not named there fails the
    // build for injecting `DbService`.
    files: ['**/*.component.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: GATEWAY_INJECTION, message: GATEWAY_INJECTION_MESSAGE },
      ],
    },
  },
  {
    files: COMPONENTS_STILL_USING_THE_GATEWAY,
    rules: { 'no-restricted-syntax': 'off' },
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
