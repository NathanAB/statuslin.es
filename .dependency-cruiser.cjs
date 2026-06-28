module.exports = {
  forbidden: [
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
        path: '^src/(routes|gallery|submit|review|render|adopt|votes)',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'gallery-no-cross-feature',
      comment: 'src/gallery may not import from other feature directories.',
      severity: 'error',
      from: { path: '^src/gallery/' },
      to: { path: '^src/(submit|review|adopt|votes)/' },
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
    tsPreCompilationDeps: true,
  },
}
