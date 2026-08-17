// The thirteen documentation pages, one file each.
//
// **This is a directory rather than a barrel over a directory**, and the
// distinction is what keeps `app.routes.ts` untouched: `import('./docs/pages')`
// resolved to `pages.ts` before and resolves to this `index.ts` now, so all
// thirteen `loadComponent` routes still name the same module and the build still
// emits one docs chunk rather than thirteen. Splitting the routes' chunking is a
// separate question from splitting the file, and this change is only the second.
//
export * from './bring-ai';
export * from './data-and-backup';
export * from './flow';
export * from './install';
export * from './judgement';
export * from './legality';
export * from './local-markets';
export * from './overview';
export * from './privacy';
export * from './requirements';
export * from './scoring';
export * from './status';
export * from './troubleshooting';
