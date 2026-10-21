import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { SCREEN } from '@/ui/stage-screen'
import { mark } from '@/ui/terminal'

/** A way to customize Claude Code that this screen can point at. */
export type CustomizeFocus =
  | 'mods'
  | 'status-line'
  | 'themes'
  | 'spinner-verbs'
  | 'output-styles'
  | 'hooks'
  | 'skills'
  | 'subagents'

/**
 * One part of the session that a pick changes. The pick is lit with a coral wash and the rest dims,
 * so the eye lands on it; picking themes recolors the whole screen instead, so nothing is lit.
 */
function Part({
  part,
  focus,
  pane = false,
  children,
}: {
  part: Exclude<CustomizeFocus, 'themes'>
  focus: CustomizeFocus
  /** A mod's pane beside the conversation: its own column, on wide screens only. */
  pane?: boolean
  children: ReactNode
}) {
  const lit = focus === part
  return (
    <div
      data-part={part}
      data-lit={lit ? '' : undefined}
      className={cn(
        'rounded-md transition-[opacity,background-color] duration-500 ease-settle',
        pane ? 'w-[13.5rem] shrink-0 px-3.5 py-3 max-lg:hidden' : '-mx-2 px-2',
        pane && (focus === 'themes' ? 'bg-terminal-light-foreground/6' : 'bg-foreground/5'),
        lit && 'bg-primary/18',
        !lit && focus !== 'themes' && 'opacity-50',
      )}
    >
      {children}
    </div>
  )
}

/**
 * A Claude Code session in the terminal with a place for every way to customize it: a skill and a
 * subagent at work, a hook's note under a tool call, Claude's reply, the spinner, a mod's pane beside
 * the conversation and its band above the prompt, and the status line under it. `focus` lights the
 * part a pick changes; `themes` shows the same session in a light theme; `spinner-verbs` swaps the
 * spinner's word for one of your own. Its rows follow Claude Code's docs (the Agent tool, a hook's
 * error notice, no "esc to interrupt" once a status line is set); `caption` says which parts are
 * examples. One picture to a screen reader, named by `label`.
 */
export function CustomizeScreen({
  focus,
  label,
  caption,
}: {
  focus: CustomizeFocus
  label: string
  /** A line under the screen saying which parts are examples rather than Claude Code's own. */
  caption: string
}) {
  const light = focus === 'themes'
  const muted = light ? 'text-terminal-light-muted' : 'text-terminal-muted'
  const quiet = cn('transition-opacity duration-500', !light && 'opacity-50')
  return (
    <div className="rounded-frame bg-card p-1.75">
      <div
        role="img"
        aria-label={label}
        data-ui=""
        data-look={light ? 'light' : 'dark'}
        className={cn(
          SCREEN,
          'gap-1 whitespace-pre font-mono text-[0.875rem] leading-[1.45] transition-colors duration-700 ease-settle max-md:text-[0.6875rem]',
          light
            ? 'bg-terminal-light text-terminal-light-foreground'
            : 'bg-sunken text-terminal-foreground',
        )}
      >
        <div className="flex min-h-0 flex-1 gap-5">
          <div className="-mx-2 flex min-w-0 flex-1 flex-col justify-end gap-1 overflow-hidden px-2">
            <div
              className={cn(
                quiet,
                'mb-2 w-fit rounded-lg border px-3 py-1.5 max-xl:hidden',
                light ? 'border-terminal-light-muted/40' : 'border-terminal-rule',
              )}
            >
              <span className="text-primary">{mark('✻')}</span> Welcome to Claude Code{'\n'}
              <span className={muted}>{'  '}cwd: ~/app</span>
            </div>
            <div className={quiet}>{mark('❯')} Fix the flaky date test in utils</div>
            <Part part="skills" focus={focus}>
              {mark('●')} Skill(test-fixing)
            </Part>
            <Part part="subagents" focus={focus}>
              {mark('●')} Agent(Find every caller of parseDate){'\n'}
              <span className={muted}>
                {'  '}
                {mark('⎿')}
                {'  Done (6 tool uses · 12.4k tokens)'}
              </span>
            </Part>
            <Part part="hooks" focus={focus}>
              {mark('●')} Bash(rm -rf coverage){'\n'}
              <span className={muted}>
                {'  '}
                {mark('⎿')}
                {'  PreToolUse:Bash hook error: Blocked'}
              </span>
            </Part>
            <Part part="output-styles" focus={focus}>
              {mark('●')} The test assumed the local timezone.{'\n'}
              {'  '}It now pins UTC and passes 50 runs.
            </Part>
            <Part part="spinner-verbs" focus={focus}>
              <span className="text-primary">{mark('✻')}</span>{' '}
              {focus === 'spinner-verbs' ? 'Reticulating…' : 'Cooking…'}
              <span className={muted}> (12s)</span>
            </Part>
          </div>
          <Part part="mods" focus={focus} pane>
            <span className="text-primary">Plan</span>
            {'\n'}
            <span className="text-primary">✓</span> Find the cause{'\n'}
            <span className="text-primary">✓</span> Pin UTC{'\n'}
            <span className={muted}>◻ Run it 50 times</span>
            {'\n'}
            <span className={muted}>◻ Open the PR</span>
          </Part>
        </div>
        <Part part="mods" focus={focus}>
          <span className="text-primary">▂▃▅▆▇</span> context 22% <span className={muted}>·</span>{' '}
          5h 41% <span className={cn(muted, 'max-md:hidden')}>· resets in 2h 10m ·</span>{' '}
          <span className="max-md:hidden">$0.41</span>
        </Part>
        <div
          className={cn(
            'mt-1 border-y py-1.5',
            light ? 'border-terminal-light-muted/40' : 'border-terminal-rule',
          )}
        >
          <span className={muted}>❯</span>{' '}
          <span
            aria-hidden="true"
            className={cn(
              'inline-block h-[1.1em] w-[0.6em] align-[-0.2em] motion-safe:animate-blink',
              light ? 'bg-terminal-light-foreground' : 'bg-foreground',
            )}
          />
        </div>
        <Part part="status-line" focus={focus}>
          <span className="text-primary">app</span> <span className={muted}>·</span> main{' '}
          <span className={muted}>·</span> Opus 4.8 <span className={muted}>·</span> ctx 22%{' '}
          <span className={muted}>·</span> $0.41
        </Part>
      </div>
      <p className="px-3 pt-2.5 pb-1 text-muted-foreground text-small">{caption}</p>
    </div>
  )
}
