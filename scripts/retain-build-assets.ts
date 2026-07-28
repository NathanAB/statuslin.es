import { copyFile, lstat, mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises'
import { dirname, posix, relative, resolve, sep } from 'node:path'

const MANIFEST_FILENAME = '.asset-generations.json'
const DEFAULT_GENERATION_LIMIT = 20

type AssetManifest = {
  version: 1
  generations: string[][]
}

export type RetainBuildAssetsOptions = {
  currentAssetsDir: string
  previousAssetsDir: string
  generationLimit?: number
}

function assertSafeAssetPath(path: string): void {
  if (
    path.length === 0 ||
    path.includes('\0') ||
    path.includes('\\') ||
    path === MANIFEST_FILENAME ||
    posix.isAbsolute(path) ||
    posix.normalize(path) !== path ||
    path === '..' ||
    path.startsWith('../')
  ) {
    throw new Error(`Asset manifest contains unsafe path: ${JSON.stringify(path)}`)
  }
}

async function listFiles(root: string, directory = root): Promise<string[]> {
  const files: string[] = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (directory === root && entry.name === MANIFEST_FILENAME) continue
    const absolutePath = resolve(directory, entry.name)
    const relativePath = relative(root, absolutePath).split(sep).join('/')
    assertSafeAssetPath(relativePath)
    if (entry.isSymbolicLink()) throw new Error(`Asset is a symlink: ${relativePath}`)
    if (entry.isDirectory()) files.push(...(await listFiles(root, absolutePath)))
    else if (entry.isFile()) files.push(relativePath)
  }
  return files.sort()
}

function parseManifest(contents: string): AssetManifest {
  let value: unknown
  try {
    value = JSON.parse(contents)
  } catch {
    throw new Error('Asset generation manifest is malformed')
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    !('version' in value) ||
    value.version !== 1 ||
    !('generations' in value) ||
    !Array.isArray(value.generations) ||
    !value.generations.every(
      (generation) =>
        Array.isArray(generation) && generation.every((path) => typeof path === 'string'),
    )
  ) {
    throw new Error('Asset generation manifest is malformed')
  }
  const generations = value.generations.map((generation) => {
    for (const path of generation) assertSafeAssetPath(path)
    return [...new Set(generation)].sort()
  })
  return { version: 1, generations }
}

async function previousGenerations(previousAssetsDir: string): Promise<string[][]> {
  const manifestPath = resolve(previousAssetsDir, MANIFEST_FILENAME)
  try {
    return parseManifest(await readFile(manifestPath, 'utf8')).generations
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    const legacyFiles = await listFiles(previousAssetsDir)
    return legacyFiles.length === 0 ? [] : [legacyFiles]
  }
}

async function assertRegularFile(root: string, path: string): Promise<string> {
  assertSafeAssetPath(path)
  const rootPath = await realpath(root)
  const filePath = resolve(rootPath, path)
  if (!filePath.startsWith(`${rootPath}${sep}`)) throw new Error(`Asset path is unsafe: ${path}`)
  let stats: Awaited<ReturnType<typeof lstat>>
  let canonicalPath: string
  try {
    ;[stats, canonicalPath] = await Promise.all([lstat(filePath), realpath(filePath)])
  } catch {
    throw new Error(`Asset manifest references missing file: ${path}`)
  }
  if (!stats.isFile() || stats.isSymbolicLink() || canonicalPath !== filePath) {
    throw new Error(`Asset manifest references unsafe file: ${path}`)
  }
  return filePath
}

async function copyUniqueAsset(source: string, destination: string, path: string): Promise<void> {
  try {
    const existing = await readFile(destination)
    const incoming = await readFile(source)
    if (!existing.equals(incoming)) throw new Error(`Asset filename collision: ${path}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    await mkdir(dirname(destination), { recursive: true })
    await copyFile(source, destination)
  }
}

export async function retainBuildAssets({
  currentAssetsDir,
  previousAssetsDir,
  generationLimit = DEFAULT_GENERATION_LIMIT,
}: RetainBuildAssetsOptions): Promise<void> {
  if (!Number.isInteger(generationLimit) || generationLimit < 1) {
    throw new Error('generationLimit must be a positive integer')
  }

  const currentGeneration = await listFiles(currentAssetsDir)
  const previous = await previousGenerations(previousAssetsDir)
  const distinctGenerations: string[][] = []
  const seen = new Set<string>()
  for (const generation of [currentGeneration, ...previous]) {
    const normalized = [...new Set(generation)].sort()
    const identity = JSON.stringify(normalized)
    if (!seen.has(identity)) {
      seen.add(identity)
      distinctGenerations.push(normalized)
    }
  }

  for (const generation of previous) {
    for (const path of generation) await assertRegularFile(previousAssetsDir, path)
  }

  const retainedGenerations = distinctGenerations.slice(0, generationLimit)
  const retainedIdentities = new Set(
    retainedGenerations.map((generation) => JSON.stringify(generation)),
  )
  const retainedPriorFiles = previous
    .filter((generation) => retainedIdentities.has(JSON.stringify(generation)))
    .flat()
  for (const path of new Set(retainedPriorFiles)) {
    const source = await assertRegularFile(previousAssetsDir, path)
    await copyUniqueAsset(source, resolve(currentAssetsDir, path), path)
  }

  const manifest: AssetManifest = { version: 1, generations: retainedGenerations }
  await writeFile(
    resolve(currentAssetsDir, MANIFEST_FILENAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
}

if (import.meta.main) {
  const [currentAssetsDir, previousAssetsDir] = process.argv.slice(2)
  if (!currentAssetsDir || !previousAssetsDir) {
    throw new Error(
      'Usage: bun run scripts/retain-build-assets.ts <current-assets-dir> <previous-assets-dir>',
    )
  }
  await retainBuildAssets({ currentAssetsDir, previousAssetsDir })
}
