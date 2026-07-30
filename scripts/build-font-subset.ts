import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'

/**
 * Regenerates the subset Nerd Font woff2 from upstream JetBrains Mono Nerd Font Mono.
 * One-time / occasional — the woff2 is committed, so normal installs and CI never run this.
 * Requires Python + FontTools/Brotli (pip install fonttools brotli), pyftsubset,
 * curl, unzip, and tar on PATH.
 *
 * Unicode ranges kept (extend here when scenarios start emitting new icons):
 *   U+0020-007E  Basic Latin (text)
 *   U+00A0-00FF  Latin-1 (common punctuation/symbols)
 *   U+2500-259F  box drawing + block elements (some statuslines use them)
 *   U+E0A0-E0D7  Powerline (branch, line-number, separators)
 *   U+E5FA-E6B7  Seti-UI + custom dev icons
 *   U+F000-F0FF  Font Awesome subset (folders, git, etc.)
 */
const NERD_RELEASE = 'v3.2.1'
const ZIP_URL = `https://github.com/ryanoasis/nerd-fonts/releases/download/${NERD_RELEASE}/JetBrainsMono.zip`
const TTF = 'JetBrainsMonoNerdFontMono-Regular.ttf'
const UNICODES = 'U+0020-007E,U+00A0-00FF,U+2500-259F,U+E0A0-E0D7,U+E5FA-E6B7,U+F000-F0FF'
const OUT = 'public/fonts/statusline-nerd.woff2'
const JULIA_RELEASE = 'v0.062'
const JULIA_ARCHIVE = 'JuliaMono-ttf.tar.gz'
const JULIA_URL = `https://github.com/cormullion/juliamono/releases/download/${JULIA_RELEASE}/${JULIA_ARCHIVE}`
const JULIA_ARCHIVE_SHA256 = 'd686ba37d804a9075240abd555101a5f602e36dee4be17c945c70995116da8ec'
const JULIA_TTF = 'JuliaMono-Regular.ttf'
const JULIA_TTF_SHA256 = 'b9e7c00d2bbc69aa072b45c72d2156137de654ce032905df04d4217dc9853e9f'
const LEGACY_OUT = 'src/og/fonts/statusline-legacy-symbols.ttf'
const LEGACY_LICENSE_OUT = 'src/og/fonts/LICENSE-JuliaMono.txt'
const TMP = '.font-tmp'

function verifySha256(path: string, expected: string): void {
  const actual = createHash('sha256').update(readFileSync(path)).digest('hex')
  if (actual !== expected) {
    throw new Error(`${path} SHA-256 mismatch: expected ${expected}, received ${actual}`)
  }
}

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
mkdirSync('public/fonts', { recursive: true })
mkdirSync('src/og/fonts', { recursive: true })

console.log(`Downloading ${ZIP_URL}...`)
execSync(`curl -sSL -o ${TMP}/jbm.zip "${ZIP_URL}"`, { stdio: 'inherit' })

console.log(`Extracting ${TTF}...`)
execSync(`unzip -o -j "${TMP}/jbm.zip" "${TTF}" -d "${TMP}"`, { stdio: 'inherit' })
if (!existsSync(`${TMP}/${TTF}`)) throw new Error(`expected ${TTF} not found in zip`)

console.log(`Subsetting to ${OUT}...`)
execSync(
  `pyftsubset "${TMP}/${TTF}" --unicodes="${UNICODES}" --flavor=woff2 --output-file="${OUT}"`,
  { stdio: 'inherit' },
)

// Extract the license from the zip
const licenseOut = 'public/fonts/LICENSE-OFL.txt'
try {
  execSync(`unzip -o -j "${TMP}/jbm.zip" "LICENSE" -d "${TMP}"`, { stdio: 'pipe' })
  if (existsSync(`${TMP}/LICENSE`)) {
    execSync(`cp "${TMP}/LICENSE" "${licenseOut}"`, { stdio: 'inherit' })
    console.log(`Wrote ${licenseOut}`)
  }
} catch {
  // LICENSE might not be at root; fall back to fetching from GitHub
  console.log('LICENSE not found in zip root; fetching from GitHub...')
  execSync(
    `curl -sSL -o "${licenseOut}" "https://raw.githubusercontent.com/ryanoasis/nerd-fonts/${NERD_RELEASE}/LICENSE"`,
    { stdio: 'inherit' },
  )
}

console.log(`Downloading ${JULIA_URL}...`)
execSync(`curl -sSL -o "${TMP}/${JULIA_ARCHIVE}" "${JULIA_URL}"`, { stdio: 'inherit' })
verifySha256(`${TMP}/${JULIA_ARCHIVE}`, JULIA_ARCHIVE_SHA256)

console.log(`Extracting ${JULIA_TTF} and license...`)
execSync(`tar -xzf "${TMP}/${JULIA_ARCHIVE}" -C "${TMP}" "${JULIA_TTF}" LICENSE`, {
  stdio: 'inherit',
})
verifySha256(`${TMP}/${JULIA_TTF}`, JULIA_TTF_SHA256)

console.log(`Building ${LEGACY_OUT}...`)
execSync(`python3 scripts/subset-legacy-symbol-font.py "${TMP}/${JULIA_TTF}" "${LEGACY_OUT}"`, {
  stdio: 'inherit',
})
writeFileSync(LEGACY_LICENSE_OUT, readFileSync(`${TMP}/LICENSE`, 'utf8').replaceAll('\r\n', '\n'))

rmSync(TMP, { recursive: true, force: true })
console.log(`Wrote ${OUT}`)
console.log(`Wrote ${LEGACY_OUT}`)
console.log(`Wrote ${LEGACY_LICENSE_OUT}`)
