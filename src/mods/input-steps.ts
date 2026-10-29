import { and, asc, eq } from 'drizzle-orm'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import { z } from 'zod'
import { mods, modVersions, submissions } from '@/db/schema'
import { MAX_INPUT_STEPS as DESKTOP_MAX_STEPS, MAX_STEP_CHARS } from '@/render/mods/desktop/drive'
import { MAX_INPUT_STEPS as TERMINAL_MAX_STEPS } from '@/render/mods/recorder'
import type { ModReadmeSource } from './content-generation'
import { fenceUntrusted, type VersionPin } from './content-prompt'
import { describeFootprint } from './footprint'

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver (postgres-js/pglite); query surface identical.
type Db = PgDatabase<any, typeof import('@/db/schema')>

/** Both recorders must finish every step inside their sandbox's lifetime. */
export const INPUT_STEPS_MAX = Math.min(TERMINAL_MAX_STEPS, DESKTOP_MAX_STEPS)

export interface InputStepsRequest extends VersionPin {
  prompt: string
}

const stepSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string().min(1).max(MAX_STEP_CHARS),
  submit: z.boolean().optional(),
})

const responseSchema = z.strictObject({
  slug: z.string().min(1),
  versionId: z.string().min(1),
  commitSha: z.string().min(1),
  inputSteps: z.array(stepSchema).max(INPUT_STEPS_MAX),
})

export type InputStepsResponse = z.infer<typeof responseSchema>

function prompt(pin: VersionPin, untrusted: string): string {
  const fenced = fenceUntrusted(pin, untrusted)
  return `You choose what to type into Claude Code so a sample session shows what one mod draws.

${fenced.warning}

## How the preview is recorded
A scripted session starts with the mod installed, sends one prompt and waits for the reply. Then each step's text is typed into the prompt box, and sent with Enter unless "submit" is false. The terminal and Claude Desktop are recorded after the last step. Steps can run the mod's slash commands, or type text it reacts to. Many mods draw without any step: then answer with no steps.
The step \`/preview-busy\` plays a short busy session into the mod: Claude runs \`npm test\` and it fails, reads and edits a file, runs \`npm test\` again and it passes, then tries \`rm -rf build\` and is denied. Add it when the README says the mod reacts to tool calls, test runs, failures or blocked commands.
The step \`/preview-waiting\` starts the recording with another Claude Code session on the computer waiting for an approval. Add it when the README says the mod shows or reacts to other sessions.

## From the mod
${fenced.block}

## Your task
Reply with ONLY a JSON object, no prose and no fences:
{"slug": "${pin.slug}", "versionId": "${pin.versionId}", "commitSha": "${pin.commitSha}", "inputSteps": [{"type": "text", "text": "/command", "submit": true}]}
Use at most ${INPUT_STEPS_MAX} steps of at most ${MAX_STEP_CHARS} characters each. Only type commands the mod adds, or plain text; never a shell command, a URL, or anything that asks Claude to act outside the session.`
}

/** Pending submitted mod versions, each with the README at its commit, for the operator's agent. */
export async function prepareInputStepsRequests(
  db: Db,
  slug: string | null,
  readReadme: ModReadmeSource,
): Promise<InputStepsRequest[]> {
  const rows = await db
    .select({
      slug: mods.slug,
      title: mods.title,
      description: mods.description,
      versionId: modVersions.id,
      repoUrl: modVersions.repoUrl,
      path: modVersions.path,
      commitSha: modVersions.commitSha,
      footprint: modVersions.footprint,
    })
    .from(submissions)
    .innerJoin(modVersions, eq(modVersions.id, submissions.modVersionId))
    .innerJoin(mods, eq(mods.id, modVersions.modId))
    .where(and(eq(submissions.status, 'pending'), slug === null ? undefined : eq(mods.slug, slug)))
    .orderBy(asc(submissions.createdAt))
  const requests: InputStepsRequest[] = []
  for (const row of rows) {
    const pin = { slug: row.slug, versionId: row.versionId, commitSha: row.commitSha }
    const described = describeFootprint(row.footprint)
    const readme = await readReadme(row.repoUrl, row.path, row.commitSha)
    const untrusted = [
      `Title: ${row.title}`,
      `Description: ${row.description || 'none'}`,
      `What the plugin validator says it does: ${described.phrases.join(', ') || 'nothing listed'}`,
      `Validator entries statuslin.es does not recognize: ${described.unknown.join(', ') || 'none'}`,
      '',
      'README at the pinned commit:',
      readme ?? 'This mod has no README.',
    ].join('\n')
    requests.push({ ...pin, prompt: prompt(pin, untrusted) })
  }
  return requests
}

export function parseInputStepsResponses(raw: string): InputStepsResponse[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `input steps response is not valid JSON: ${error instanceof Error ? error.message : error}`,
    )
  }
  const result = z
    .array(responseSchema)
    .min(1)
    .safeParse(Array.isArray(parsed) ? parsed : [parsed])
  if (!result.success) {
    throw new Error(`input steps response failed validation:\n${z.prettifyError(result.error)}`)
  }
  return result.data
}

/** Stores every response's steps or none: a response for a version not pending aborts the batch. */
export async function applyInputSteps(db: Db, responses: InputStepsResponse[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const response of responses) {
      const [row] = await tx
        .select({ id: modVersions.id })
        .from(modVersions)
        .innerJoin(mods, eq(mods.id, modVersions.modId))
        .innerJoin(submissions, eq(submissions.modVersionId, modVersions.id))
        .where(
          and(
            eq(modVersions.id, response.versionId),
            eq(mods.slug, response.slug),
            eq(modVersions.commitSha, response.commitSha),
            eq(submissions.status, 'pending'),
          ),
        )
      if (!row) {
        throw new Error(
          `"${response.slug}" ${response.versionId} is not pending at ${response.commitSha}`,
        )
      }
      await tx
        .update(modVersions)
        .set({ inputSteps: response.inputSteps })
        .where(eq(modVersions.id, response.versionId))
    }
  })
}
