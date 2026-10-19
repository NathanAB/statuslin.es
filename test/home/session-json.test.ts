import { describe, expect, it } from 'vitest'
import { EXAMPLE_SESSION_JSON } from '@/home/session-json'
import { SCENARIO_BY_KEY } from '@/render/scenarios'

// "How installing works" shows what Claude Code sends a status line: the Everyday session's own
// data, cut to the fields a reader recognises, so it matches the render beside it.
describe('EXAMPLE_SESSION_JSON', () => {
  const stdin = SCENARIO_BY_KEY.get('clean-main')?.stdin as unknown as {
    model: { display_name: string }
    effort: { level: string }
    workspace: { current_dir: string }
    context_window: { context_window_size: number; used_percentage: number }
  }

  it("is valid JSON holding the Everyday session's values", () => {
    const shown = JSON.parse(EXAMPLE_SESSION_JSON)

    expect(shown).toEqual({
      model: { display_name: stdin.model.display_name },
      effort: stdin.effort,
      workspace: { current_dir: stdin.workspace.current_dir },
      context_window: {
        context_window_size: stdin.context_window.context_window_size,
        used_percentage: stdin.context_window.used_percentage,
      },
      rate_limits: {
        five_hour: { used_percentage: 26 },
        seven_day: { used_percentage: 7 },
      },
      cost: { total_cost_usd: 0.41, total_duration_ms: 612000 },
    })
  })

  it('keeps an object of plain values on one line, and indents the rest', () => {
    expect(EXAMPLE_SESSION_JSON.split('\n')).toEqual([
      '{',
      '  "model": { "display_name": "Opus 4.8" },',
      '  "effort": { "level": "high" },',
      '  "workspace": { "current_dir": "/home/user/app" },',
      '  "context_window": {',
      '    "context_window_size": 200000,',
      '    "used_percentage": 22',
      '  },',
      '  "rate_limits": {',
      '    "five_hour": { "used_percentage": 26 },',
      '    "seven_day": { "used_percentage": 7 }',
      '  },',
      '  "cost": { "total_cost_usd": 0.41, "total_duration_ms": 612000 }',
      '}',
    ])
  })
})
