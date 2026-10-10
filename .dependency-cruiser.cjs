module.exports = {
  forbidden: [
    {
      name: 'compact-segments-stays-client-safe',
      comment:
        'compactSegments ships in the client bundle; importing the ANSI parser (Anser) from it would pull that library into every page.',
      severity: 'error',
      from: { path: '^src/render/compact-segments\\.ts$' },
      to: { path: '(^src/render/ansi\\.ts$|node_modules/anser)' },
    },
    {
      name: 'routes-no-direct-db',
      comment: 'Routes must go through server functions, not import the DB directly.',
      severity: 'error',
      from: { path: '^src/routes' },
      to: { path: '^src/db' },
    },
    {
      name: 'ui-stays-presentational',
      comment:
        'src/ui may import only src/ui and src/lib. Type-only imports are allowed (erased at build, no runtime coupling) so components can type props against shared data shapes.',
      severity: 'error',
      from: { path: '^src/ui' },
      to: {
        path: '^src/(routes|gallery|submit|review|render|adopt|votes|content|guide|resources|compare)',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'gallery-no-cross-feature',
      comment:
        'src/gallery may not import from other feature directories. src/mods builds on the gallery, never the reverse.',
      severity: 'error',
      from: { path: '^src/gallery/' },
      to: { path: '^src/(submit|review|adopt|votes|mods)/' },
    },
    {
      name: 'submit-no-cross-feature',
      comment: 'src/submit may not import from other feature directories.',
      severity: 'error',
      from: { path: '^src/submit/' },
      to: { path: '^src/(gallery|review|adopt|votes)/' },
    },
    {
      name: 'review-no-cross-feature',
      comment: 'src/review may not import from other feature directories.',
      severity: 'error',
      from: { path: '^src/review/' },
      to: { path: '^src/(gallery|submit|adopt|votes)/' },
    },
    {
      name: 'adopt-no-cross-feature',
      comment: 'src/adopt may not import from other feature directories.',
      severity: 'error',
      from: { path: '^src/adopt/' },
      to: { path: '^src/(gallery|submit|review|votes)/' },
    },
    {
      name: 'votes-no-cross-feature',
      comment: 'src/votes may not import from other feature directories.',
      severity: 'error',
      from: { path: '^src/votes/' },
      to: { path: '^src/(gallery|submit|review|adopt)/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    // TypeScript 7 ships no compiler API, so depcruise can't use it to read .ts/.tsx and silently
    // cruises 0 modules (issue #68). swc parses the TypeScript source directly and
    // still marks `import type` as type-only, which ui-stays-presentational relies on.
    // depcruise still prints a `missing-typescript-transpiler` warning because `tsConfig` is set;
    // it's expected. `tsConfig` only feeds the `@/` alias, which resolves without the TS API, and
    // test/scripts/check-boundaries.test.ts fails if any src module goes uncruised.
    parser: 'swc',
  },
}
