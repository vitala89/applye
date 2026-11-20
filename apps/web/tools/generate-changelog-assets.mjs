import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const recentLimit = 3;
const highlightLimit = 3;
const highlightLength = 100;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function buildChangelogAssets(markdown, highlights) {
  const releases = [];
  const versions = new Set();
  const headings = markdown.matchAll(/^## \[([^\]\r\n]+)\][ \t]*(?:-[ \t]*([^\r\n]+))?\r?$/gm);

  for (const [, version, date] of headings) {
    if (version === 'Unreleased') continue;
    if (!versionPattern.test(version) || versions.has(version)) {
      throw new Error(`Invalid or duplicate changelog version: ${version}`);
    }
    const parsedDate = new Date(date);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      Number.isNaN(parsedDate.getTime()) ||
      parsedDate.toISOString().slice(0, 10) !== date
    ) {
      throw new Error(`Invalid changelog date for ${version}: ${date}`);
    }
    versions.add(version);
    const anchor = `${version} - ${date}`
      .toLowerCase()
      .replaceAll(' ', '-')
      .replace(/[^a-z0-9-]/g, '');
    releases.push({ version, date, notesPath: `/blob/main/CHANGELOG.md#${anchor}` });
  }

  for (const [version, items] of Object.entries(highlights)) {
    if (!versions.has(version)) throw new Error(`Highlights reference unknown release: ${version}`);
    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > highlightLimit ||
      items.some(
        (item) =>
          typeof item !== 'string' ||
          !item.trim() ||
          /[\r\n]/.test(item) ||
          [...item].length > highlightLength,
      )
    ) {
      throw new Error(`Invalid highlights for ${version}: use up to three lines of 100 characters`);
    }
  }

  return {
    recent: {
      releases: releases.slice(0, recentLimit).map((release) => ({
        ...release,
        highlights: highlights[release.version] ?? [],
      })),
      hasArchive: releases.length > recentLimit,
    },
    archive: releases.slice(recentLimit),
  };
}

async function generate() {
  const [markdown, highlights] = await Promise.all([
    readFile(new URL('../../../CHANGELOG.md', import.meta.url), 'utf8'),
    readFile(new URL('./changelog-highlights.json', import.meta.url), 'utf8'),
  ]);
  const { recent, archive } = buildChangelogAssets(markdown, JSON.parse(highlights));
  const output = new URL('../.generated-changelog/', import.meta.url);

  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(new URL('recent.json', output), JSON.stringify(recent)),
    writeFile(new URL('archive.json', output), JSON.stringify(archive)),
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generate();
}
