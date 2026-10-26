const lines = (...source: string[]) => `${source.join('\n')}\n`

/**
 * A small web app every recording's workspace holds, relative to the workspace, in its seed
 * commit, so a mod that reads the user's project has files to read.
 */
export const SAMPLE_PROJECT_FILES: readonly { path: string; data: string }[] = [
  {
    path: 'src/components/site-header.tsx',
    data: lines(
      "import { InstallButton } from './install-button'",
      '',
      'export function SiteHeader({ title }: { title: string }) {',
      '  return (',
      '    <header>',
      '      <h1>{title}</h1>',
      '      <InstallButton slug="app" />',
      '    </header>',
      '  )',
      '}',
    ),
  },
  {
    path: 'src/components/install-button.tsx',
    data: lines(
      'export function InstallButton({ slug }: { slug: string }) {',
      '  return <button type="button" data-slug={slug}>Install</button>',
      '}',
    ),
  },
  {
    path: 'src/components/plugin-card.tsx',
    data: lines(
      "import { InstallButton } from './install-button'",
      '',
      'export function PluginCard({ name, slug }: { name: string; slug: string }) {',
      '  return (',
      '    <article>',
      '      <h2>{name}</h2>',
      '      <InstallButton slug={slug} />',
      '    </article>',
      '  )',
      '}',
    ),
  },
  {
    path: 'src/lib/slug.ts',
    data: lines(
      'export function slugify(name: string): string {',
      "  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')",
      '}',
    ),
  },
  {
    path: 'src/routes/api/plugins.ts',
    data: lines(
      "import { slugify } from '../../lib/slug'",
      '',
      'export function listPlugins(names: string[]) {',
      '  return names.map((name) => ({ name, slug: slugify(name) }))',
      '}',
    ),
  },
  {
    path: 'src/jobs/sync-registry.ts',
    data: lines(
      "import { listPlugins } from '../routes/api/plugins'",
      '',
      'export async function syncRegistry(fetchNames: () => Promise<string[]>) {',
      '  return listPlugins(await fetchNames())',
      '}',
    ),
  },
]
