/**
 * The curated list behind /resources. Hand-maintained; descriptions are our own
 * words (never copied from the target's README — both an SEO duplicate-content
 * rule and what makes the page an editorial feature worth a link back).
 * Section order is display order. Each entry earns its place with search traffic to this page or
 * public use (stars, downloads); all verified live 2026-10-21.
 */

export interface Resource {
  name: string
  url: string
  description: string
}

export function resourceAnchor(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export interface ResourceSection {
  key: string
  title: string
  resources: Resource[]
}

export const RESOURCE_SECTIONS: ResourceSection[] = [
  {
    key: 'marketplaces',
    title: 'Mods & plugin marketplaces',
    resources: [
      {
        name: 'Claude Marketplace',
        url: 'https://claude.com/marketplace/plugins',
        description:
          "Anthropic's web catalog of plugins, with install counts and an Anthropic verified mark.",
      },
      {
        name: 'claude-plugins-official',
        url: 'https://github.com/anthropics/claude-plugins-official',
        description:
          "Anthropic's own marketplace. Claude Code adds it the first time you start a session in the terminal.",
      },
      {
        name: 'wshobson/agents',
        url: 'https://github.com/wshobson/agents',
        description:
          'A large community marketplace of agents, skills and commands, built to install into several coding agents.',
      },
      {
        name: 'claude-code-templates',
        url: 'https://aitmpl.com',
        description:
          'A CLI and catalog for adding ready-made agents, commands, hooks, settings and MCP servers.',
      },
    ],
  },
  {
    key: 'tools',
    title: 'Status line tools',
    resources: [
      {
        name: 'ccstatusline',
        url: 'https://github.com/sirmalloc/ccstatusline',
        description:
          'A terminal UI writes your settings, with powerline themes and widgets for context and usage limits.',
      },
      {
        name: 'claude-powerline',
        url: 'https://github.com/Owloops/claude-powerline',
        description:
          'Vim-style powerline segments with themes and usage tracking. Powerline Studio builds its config in the browser.',
      },
      {
        name: 'claude-hud',
        url: 'https://github.com/jarrodwatts/claude-hud',
        description:
          'A Claude Code plugin that points your status line at itself. Shows context and usage limits, with optional lines for running tools, agents, and todos.',
      },
      {
        name: 'CCometixLine',
        url: 'https://github.com/Haleclipse/CCometixLine',
        description:
          'Written in Rust, configured through a terminal UI. Git integration and usage tracking come built in.',
      },
    ],
  },
  {
    key: 'usage-tracking',
    title: 'Usage & cost tracking',
    resources: [
      {
        name: 'ccusage',
        url: 'https://ccusage.com/guide/statusline',
        description:
          "Tracks Claude Code spend. Its status line mode shows session cost, the day's total, burn rate and the time left in your five-hour block.",
      },
      {
        name: 'CodexBar',
        url: 'https://github.com/steipete/CodexBar',
        description: 'A macOS menu bar app that shows your Claude Code and Codex usage limits.',
      },
    ],
  },
  {
    key: 'themes',
    title: 'Themes & sounds',
    resources: [
      {
        name: 'tweakcc',
        url: 'https://github.com/Piebald-AI/tweakcc',
        description:
          'Patches Claude Code to add custom themes, change the spinner and thinking verbs, and edit its system prompts.',
      },
      {
        name: 'peon-ping',
        url: 'https://github.com/PeonPing/peon-ping',
        description:
          "Plays game character voice lines, Warcraft III's peon among them, when Claude Code needs your attention.",
      },
    ],
  },
  {
    key: 'beyond',
    title: 'Beyond the interface',
    resources: [
      {
        name: 'anthropics/skills',
        url: 'https://github.com/anthropics/skills',
        description:
          "Anthropic's public Agent Skills. Add the repo as a plugin marketplace to install them.",
      },
      {
        name: 'awesome-claude-code-subagents',
        url: 'https://github.com/VoltAgent/awesome-claude-code-subagents',
        description: 'A collection of ready-made subagents, grouped by the job they do.',
      },
    ],
  },
  {
    key: 'guides',
    title: 'Guides & lists',
    resources: [
      {
        name: 'AI Hero: Creating the perfect status line',
        url: 'https://www.aihero.dev/creating-the-perfect-claude-code-status-line',
        description: "An opinionated take on what belongs in a status line and what doesn't.",
      },
      {
        name: 'awesome-claude-code',
        url: 'https://github.com/hesreallyhim/awesome-claude-code',
        description:
          'The big community list for Claude Code, with sections for status lines and mods.',
      },
    ],
  },
]
