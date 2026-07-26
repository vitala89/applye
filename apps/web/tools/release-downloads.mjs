#!/usr/bin/env node
/**
 * Prints how many times each release asset has actually been downloaded.
 *
 * Site analytics cannot answer this. The download button leaves for GitHub, so
 * `download_click` in GA4 counts *intent*: someone who wanted the app. Whether
 * the transfer completed, and which platform's installer they took, happens on
 * a domain we do not and should not observe. GitHub keeps the real number and
 * hands it over for free, so the honest report is the two numbers side by side:
 * clicks from GA4, completed downloads from here.
 *
 *   npm run web:downloads
 *   GITHUB_TOKEN=... npm run web:downloads   # higher rate limit, private repo
 *
 * Unauthenticated calls are limited to 60/hour and see public repos only, so
 * this stays useless until the repository is public (`SOURCE_PUBLIC` in
 * site.ts) or a token is supplied.
 */
const REPO = process.env.GITHUB_REPOSITORY ?? 'vitala89/applye';
const token = process.env.GITHUB_TOKEN ?? '';

const headers = {
  accept: 'application/vnd.github+json',
  'user-agent': 'applye-release-downloads',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
};

const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=100`, { headers });

if (!res.ok) {
  console.error(`GitHub API returned ${res.status} ${res.statusText} for ${REPO}.`);
  if (res.status === 404) {
    console.error('A private repository needs GITHUB_TOKEN with `repo` scope.');
  }
  process.exit(1);
}

const releases = await res.json();

if (releases.length === 0) {
  console.log(`No releases published on ${REPO} yet - nothing to count.`);
  process.exit(0);
}

let total = 0;

for (const release of releases) {
  const assets = release.assets ?? [];
  const subtotal = assets.reduce((sum, a) => sum + (a.download_count ?? 0), 0);
  total += subtotal;

  console.log(`\n${release.tag_name}${release.prerelease ? ' (prerelease)' : ''} - ${subtotal}`);
  for (const asset of assets.sort((a, b) => b.download_count - a.download_count)) {
    console.log(`  ${String(asset.download_count).padStart(7)}  ${asset.name}`);
  }
  if (assets.length === 0) console.log('  (no assets)');
}

console.log(`\nTotal completed downloads across ${releases.length} release(s): ${total}`);
