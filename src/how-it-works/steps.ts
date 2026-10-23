import { Box, ListChecks, type LucideIcon, Pin, Radar } from 'lucide-react'

export interface CheckStep {
  /** The anchor a link lands on: /how-it-works#pinned-to-one-version. */
  id: string
  title: string
  /** The step in one line, for the home page. */
  summary: string
  icon: LucideIcon
}

/**
 * The four checks every status line and mod passes before it's listed, in order. The home page
 * names them in a line each; /how-it-works shows each one with a real example.
 */
export const CHECK_STEP = {
  pinned: {
    id: 'pinned-to-one-version',
    title: 'Pinned to one version',
    summary: 'You install the exact version that was checked.',
    icon: Pin,
  },
  sandboxed: {
    id: 'run-in-a-sandbox',
    title: 'Run in a sandbox',
    summary: 'Its previews are recorded in a throwaway sandbox.',
    icon: Box,
  },
  reviewed: {
    id: 'reviewed-before-its-listed',
    title: "Reviewed before it's listed",
    summary: 'Nothing goes live on its own, updates included.',
    icon: ListChecks,
  },
  listed: {
    id: 'listed-with-what-it-can-reach',
    title: 'Listed with what it can reach',
    summary: 'Its page shows what it can reach, next to the install button.',
    icon: Radar,
  },
} as const satisfies Record<string, CheckStep>

/** The four checks in the order a listing passes them. */
export const CHECK_STEPS: readonly CheckStep[] = Object.values(CHECK_STEP)
