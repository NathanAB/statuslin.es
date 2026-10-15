import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

import { canonicalRedirectMiddleware } from './server/canonical-redirect'
import { htmlAcceptMiddleware } from './server/html-accept'
import { noindexMiddleware } from './server/noindex'
import { templatePathGuardMiddleware } from './server/template-path-guard'

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [
    // First, so it also tags the 404s and redirects the middleware after it return.
    noindexMiddleware,
    templatePathGuardMiddleware,
    canonicalRedirectMiddleware,
    htmlAcceptMiddleware,
    csrfMiddleware,
  ],
}))
