import nx from '@nx/eslint-plugin';
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

/**
 * The data services a component may not inject, and why the rule outlived the
 * migration that created it.
 *
 * ADR-0005 says a page component renders and delegates: screen state belongs to
 * a signal store in `libs/application`, and the gateway is that layer's to call.
 * This rule began as a ratchet with an allowlist of 26 components that still
 * injected `DbService`; every migrated page deleted its own line, `jobs` deleted
 * the last one, and the allowlist and its conditional spread are gone with it
 * (ADR-0005, amendment fifty-six).
 *
 * **`@nx/enforce-module-boundaries` now catches strictly more than this rule**,
 * since `type:data` left `type:app`'s allowlist in amendment fifty-five: every
 * app file, not only components, and every service in `libs/data` rather than
 * these three. This rule is kept anyway, for two reasons that are worth stating
 * rather than assuming:
 *
 * 1. **The message.** nx reports a list of tags and cannot be given a custom
 *    one. This rule names the ADR and says what to do instead, which is the
 *    difference between an error a newcomer can act on and one they have to
 *    research.
 * 2. **The re-export path.** A data service re-exported through
 *    `@applye/application` would satisfy the tag check, and the `inject()` call
 *    would be the only remaining evidence. Nothing re-exports one today; this is
 *    what makes sure nothing starts.
 *
 * `app.ts` is matched explicitly because it is a component that is not named
 * like one, and for the whole campaign that is exactly what hid it - the
 * allowlist read 26 when 27 files were injecting the gateway. The glob is
 * therefore a **convention check, not a proof**: another component named off
 * convention would slip through the same hole, and the fix for that is the
 * naming convention rather than a longer glob.
 */
const GATEWAY_SERVICES = ['DbService', 'AiService', 'JobSourceService'];

/** Matches `inject(DbService)` however it is written, including a type argument. */
const GATEWAY_INJECTION = `CallExpression[callee.name="inject"] > Identifier.arguments[name=/^(${GATEWAY_SERVICES.join(
  '|',
)})$/]`;

const GATEWAY_INJECTION_MESSAGE = `A component may not inject a data-layer service (${GATEWAY_SERVICES.join(
  ', ',
)}) - ADR-0005. Screen state and data access belong to a signal store in libs/application; the component renders and delegates. Put this read, write or model call in a store.`;

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
    // ADR-0005, enforced: a component does not reach the data layer. See the
    // block comment on `GATEWAY_SERVICES` for why this survives the boundary
    // rule that now covers the same ground.
    files: ['**/*.component.ts', '**/app.ts'],
    ignores: ['**/*.spec.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: GATEWAY_INJECTION, message: GATEWAY_INJECTION_MESSAGE },
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
