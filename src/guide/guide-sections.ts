import type { ContentsEntry } from '@/ui/doc-layout'

/**
 * The /guide page's sections: each heading's words and the id a link like
 * /guide#the-json-your-script-receives lands on. The ids are public URLs, so they never change,
 * even when a heading's words do.
 */
export const GUIDE_SECTION = {
  fastPaths: { id: 'the-fast-paths', title: 'The fast paths' },
  runStatusline: { id: 'run-statusline', title: 'Run /statusline' },
  copyFromGallery: { id: 'copy-from-the-gallery', title: 'Copy from the gallery' },
  wireUp: { id: 'wire-up-a-script-by-hand', title: 'Wire up a script by hand' },
  saveScript: { id: 'save-a-minimal-working-script', title: 'Save a minimal working script' },
  makeRunnable: { id: 'make-it-runnable', title: 'Make it runnable' },
  pointSettings: { id: 'point-settings-json-at-it', title: 'Point settings.json at it' },
  testIt: { id: 'test-it', title: 'Test it' },
  payload: { id: 'the-json-your-script-receives', title: 'The JSON your script receives' },
  // The FAQ's heading is drawn by FaqSection; this is the anchor around it.
  faq: { id: 'common-questions', title: 'Common questions' },
  goingFurther: { id: 'going-further', title: 'Going further' },
} as const

const S = GUIDE_SECTION

/** The contents list: the page's h2s, and the hand-wiring steps under theirs. */
export const GUIDE_CONTENTS: readonly ContentsEntry[] = [
  S.fastPaths,
  { ...S.wireUp, children: [S.saveScript, S.makeRunnable, S.pointSettings, S.testIt, S.payload] },
  S.faq,
  S.goingFurther,
]
