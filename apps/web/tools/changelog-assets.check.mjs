import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildChangelogAssets } from './generate-changelog-assets.mjs';

const markdown = [
  '## [Unreleased]',
  '## [0.29.4] - 2026-08-26',
  '## [0.29.3] - 2026-08-26',
  '## [0.29.2] - 2026-08-02',
  '## [0.29.1] - 2026-07-30',
  '## [0.29.0] - 2026-07-29',
].join('\r\n');

test('keeps published releases in source order and splits the archive after three', () => {
  const { recent, archive } = buildChangelogAssets(markdown, {
    '0.29.3': ['A release highlight.'],
  });

  assert.equal(recent.hasArchive, true);
  assert.deepEqual(
    recent.releases.map(({ version, highlights }) => [version, highlights]),
    [
      ['0.29.4', []],
      ['0.29.3', ['A release highlight.']],
      ['0.29.2', []],
    ],
  );
  assert.deepEqual(
    archive.map(({ version }) => version),
    ['0.29.1', '0.29.0'],
  );
  assert.equal(archive[0].notesPath, '/blob/main/CHANGELOG.md#0291---2026-07-30');
  assert.ok(!('highlights' in archive[0]));
});

test('reports no archive when only three or fewer releases are published', () => {
  const { recent, archive } = buildChangelogAssets('## [1.0.0] - 2026-09-01', {});

  assert.equal(recent.hasArchive, false);
  assert.deepEqual(archive, []);
});

test('rejects duplicate versions and invalid calendar dates', () => {
  assert.throws(
    () => buildChangelogAssets(markdown + '\n## [0.29.4] - 2026-08-26', {}),
    /duplicate/,
  );
  assert.throws(
    () => buildChangelogAssets('## [1.0.0] - 2026-02-30', {}),
    /Invalid changelog date/,
  );
  assert.throws(
    () => buildChangelogAssets('## [1.0.0] - 2026-13-01', {}),
    /Invalid changelog date/,
  );
  assert.throws(() => buildChangelogAssets('## [1.0.0]', {}), /Invalid changelog date/);
});

test('rejects unknown, excessive, long or multiline highlights', () => {
  assert.throws(() => buildChangelogAssets(markdown, { '9.0.0': ['A point.'] }), /unknown release/);
  for (const items of [['One', 'Two', 'Three', 'Four'], ['a'.repeat(101)], ['Two\nlines']]) {
    assert.throws(() => buildChangelogAssets(markdown, { '0.29.3': items }), /Invalid highlights/);
  }
});

test('validates the checked-in release content and keeps the initial asset below 5 kB', () => {
  const source = readFileSync(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8');
  const highlights = JSON.parse(
    readFileSync(new URL('./changelog-highlights.json', import.meta.url), 'utf8'),
  );
  const { recent } = buildChangelogAssets(source, highlights);
  assert.ok(Buffer.byteLength(JSON.stringify(recent)) < 5000);
});
