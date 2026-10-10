// posthog-node processes a person profile for every distinct id it sees, so a server event sent under
// an id that isn't a signed-in user (an anonymous browser id, an ip hash, 'server') would create a
// profile per id. Spreading this into an event's properties turns that off — the client's
// person_profiles: 'identified_only', applied server-side. Assigned through a variable key so
// neither the camelCase naming rule nor the literal-keys rule fires on the leading '$'.
// Its own module, free of posthog-node, so client-bundled modules can build server events with it.
const PROCESS_PERSON_PROFILE_PROP = '$process_person_profile'
export const PERSONLESS: Readonly<Record<string, false>> = { [PROCESS_PERSON_PROFILE_PROP]: false }

/**
 * The person flag for a copy event. A signed-in browser identifies on user.id (see __root.tsx), so
 * only that id is a person; an anonymous browser id or the ipHash fallback is not.
 */
export function copierPersonProperties(
  distinctId: string,
  signedInUserId: string | null,
): Readonly<Record<string, false>> {
  return distinctId === signedInUserId ? {} : PERSONLESS
}
