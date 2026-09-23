import { createCsrfMiddleware, createStart } from '@tanstack/react-start'

import { canonicalRedirectMiddleware } from './server/canonical-redirect'
import { htmlAcceptMiddleware } from './server/html-accept'
import { templatePathGuardMiddleware } from './server/template-path-guard'

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [
    templatePathGuardMiddleware,
    canonicalRedirectMiddleware,
    htmlAcceptMiddleware,
    csrfMiddleware,
  ],
}))
