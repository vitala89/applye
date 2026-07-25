# i18n

The desktop UI's translation bundles and the `TranslateService` that resolves them.

## Layout

`src/lib/translations/` holds one file per locale - `en.ts`, `de.ts`, `ru.ts`, `es.ts`, `fr.ts`,
`uk.ts` - plus `translations.ts`, which is the only place `TRANSLATIONS` is assembled. `en` is the
source of truth: it defines the key set, and every other locale translates it in full.

Non-English locales are written as `stub(en, { ... })`. All six are complete, so the merge changes
nothing today; it is the safety net for a key added to `en` tomorrow, which then renders in English
instead of as a raw dotted key like `actions.close`. `stub()` merges deeply on purpose - a shallow
spread would replace a whole section and silently drop every key that section omits.

## Adding or changing a key

Add it to `en.ts` first, then translate it in the other five files. Two tests in
`translations.spec.ts` enforce this:

- every locale resolves exactly the keys `en` resolves;
- no locale's value equals the English one unless the key is listed in `SHARED_WITH_ENGLISH`.

That allowlist is per locale and covers the cases where matching English is correct: product names
(`Claude`, `DeepSeek`), URLs and console labels, format placeholders, empty strings, and genuine
cognates such as the French `Documents` or the Spanish `No`. Adding an entry is a deliberate claim
that the string is the same word in that language, not a way to defer a translation.

## Bundle budget

Six complete locales at 1438 keys each are about 460 kB of source strings, and Cyrillic costs two
bytes per character in UTF-8. They are all in the initial bundle because `tFor()` is synchronous -
the tracker renders its Eigenbemühungen report in a document language that can differ from the UI
language, inside a `computed`. The desktop `initial` budget in `apps/desktop/project.json` was
raised from 500 kb / 1 mb to 1300 kb / 1500 kb when the four stub locales were completed: the
initial bundle went from 692.69 kB to 1.26 MB raw (173.86 kB to 240.53 kB transferred). Applye is a
Tauri app that loads its assets from local disk, so the cost is parse time rather than download.
Splitting locales into lazily loaded chunks would claw that back, at the price of making `tFor()`
asynchronous.

## Running unit tests

Run `nx test i18n` to execute the unit tests.
