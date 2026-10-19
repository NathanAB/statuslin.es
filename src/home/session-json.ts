import { SCENARIO_BY_KEY } from '@/render/scenarios'

// The longest a one-line object may run, its indent included.
const LINE_WIDTH = 66

type Json = string | number | boolean | null | { [key: string]: Json }

/**
 * JSON as a person writes it: an object of plain values on one line when that line fits, its key
 * (`label`) and indent included, else indented.
 */
function format(value: Json, indent = '', label = ''): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  const entries = Object.entries(value)
  const inline = `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${format(v)}`).join(', ')} }`
  const plain = entries.every(([, v]) => v === null || typeof v !== 'object')
  if (plain && indent.length + label.length + inline.length <= LINE_WIDTH) return inline
  const inner = `${indent}  `
  const body = entries.map(([k, v]) => {
    const key = `${JSON.stringify(k)}: `
    return `${inner}${key}${format(v, inner, key)}`
  })
  return `{\n${body.join(',\n')}\n${indent}}`
}

const stdin = SCENARIO_BY_KEY.get('clean-main')?.stdin as {
  model: { display_name: string }
  effort: { level: string }
  workspace: { current_dir: string }
  context_window: { context_window_size: number; used_percentage: number }
  rate_limits: { five_hour: { used_percentage: number }; seven_day: { used_percentage: number } }
  cost: { total_cost_usd: number; total_duration_ms: number }
}

/**
 * What Claude Code sends a status line, as "How installing works" shows it: the Everyday session's
 * own data (the clean-main scenario the gallery renders), cut to the fields a reader recognises.
 */
export const EXAMPLE_SESSION_JSON = format({
  model: { display_name: stdin.model.display_name },
  effort: { level: stdin.effort.level },
  workspace: { current_dir: stdin.workspace.current_dir },
  context_window: {
    context_window_size: stdin.context_window.context_window_size,
    used_percentage: stdin.context_window.used_percentage,
  },
  rate_limits: {
    five_hour: { used_percentage: stdin.rate_limits.five_hour.used_percentage },
    seven_day: { used_percentage: stdin.rate_limits.seven_day.used_percentage },
  },
  cost: {
    total_cost_usd: stdin.cost.total_cost_usd,
    total_duration_ms: stdin.cost.total_duration_ms,
  },
})
