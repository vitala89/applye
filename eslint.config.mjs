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
 * **The list only ever shrank, and it is now empty.** It started at 26; every
 * migrated page deleted its own line, and `jobs` deleted the last one. The rule
 * itself stays, and now applies to every component without exception: a new
 * `inject(DbService)` in a `*.component.ts` fails the build outright, which is
 * the state the ADR was written to reach.
 *
 * **It is not deleted yet, and that is deliberate.** `app.ts` injects the
 * gateway and this rule cannot see it, because the glob matches `*.component.ts`
 * and that file is not one - so the list was undercounting by one throughout.
 * Deleting the rule now would remove the only pressure on that file. The rule
 * goes when `app.ts` is migrated or the glob is widened (ADR-0005, level two).
 *
 * The override below is spread in conditionally, because a flat-config entry
 * with `files: []` does not mean "no files" - an empty allowlist written inline
 * would have switched the rule off everywhere. The entries used to start with a
 * double-star glob
 * on purpose: `nx lint` loads `apps/desktop/eslint.config.mjs`, which spreads
 * this file, so a `files` pattern resolves against **that** directory rather
 * than the repository root, and a repo-relative path would have silently matched
 * nothing. Verified both ways while the list still had entries: the rule errored
 * on a component not listed, and stayed quiet on every one that was.
 */
const COMPONENTS_STILL_USING_THE_GATEWAY = [];

/** Matches `inject(DbService)` however it is written, including a type argument. */
const GATEWAY_INJECTION =
  'CallExpression[callee.name="inject"] > Identifier.arguments[name="DbService"]';

const GATEWAY_INJECTION_MESSAGE =
  'A component may not inject DbService (ADR-0005). Screen state and data access belong to a signal store in libs/application; the component renders and delegates. There is no allowlist any more - every component in the app was migrated, so put this read or write in a store.';

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
              // `type:data` is gone from this list: no production file in the
              // app reaches the gateway any more, which is what amendment four
              // said this flip was waiting for. Tests are exempted separately
              // below - a spec provides fakes for its unit's collaborators, and
              // that is not a dependency direction.
              sourceTag: 'type:app',
              onlyDependOnLibsWithTags: ['type:application', 'type:ui', 'type:util', 'type:domain'],
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
    // Tests are exempt from the `type:data` half of the rule above, and only
    // from that half. A spec provides fakes for the collaborators of the unit
    // it tests - an app component's store reaches the gateway, so its spec has
    // to be able to name `DbService` to stub it. That is test wiring, not a
    // dependency direction, and rewriting 25 specs to fake a store's own
    // collaborator graph instead would test less while changing more.
    //
    // `*.harness.ts` is here for the same reason: `onboarding.harness.ts`
    // imports `TestBed` and is a spec in everything but its filename.
    //
    // The hole this leaves is a production file named `*.spec.ts`, which
    // nothing else prevents either (ADR-0005, amendment fifty-five).
    files: ['**/*.spec.ts', '**/*.harness.ts'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
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
    // ADR-0005, enforced: a component does not reach the data gateway.
    //
    // `app.ts` is listed explicitly because it is a component that is not named
    // like one, and for the whole campaign that is exactly what hid it - the
    // allowlist read 26 when 27 files were injecting the gateway. The pattern is
    // therefore a **convention check, not a proof**: another component named off
    // convention would slip through the same hole, and the fix for that is the
    // naming convention rather than a longer glob.
    files: ['**/*.component.ts', '**/app.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: GATEWAY_INJECTION, message: GATEWAY_INJECTION_MESSAGE },
      ],
    },
  },
  // Spread rather than written inline: a flat-config entry with `files: []`
  // does not mean "no files", so an empty allowlist would have turned the rule
  // off everywhere - the exact opposite of what emptying it means.
  ...(COMPONENTS_STILL_USING_THE_GATEWAY.length
    ? [
        {
          files: COMPONENTS_STILL_USING_THE_GATEWAY,
          rules: { 'no-restricted-syntax': 'off' },
        },
      ]
    : []),
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
