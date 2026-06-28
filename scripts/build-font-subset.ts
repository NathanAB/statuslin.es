import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'

/**
 * Regenerates the subset Nerd Font woff2 from upstream JetBrains Mono Nerd Font Mono.
 * One-time / occasional — the woff2 is committed, so normal installs and CI never run this.
 * Requires pyftsubset (pip install fonttools brotli) + curl + unzip on PATH.
 *
 * Unicode ranges kept (extend here when scenarios start emitting new icons):
 *   U+0020-007E  Basic Latin (text)
 *   U+00A0-00FF  Latin-1 (common punctuation/symbols)
 *   U+2500-259F  box drawing + block elements (some statuslines use them)
 *   U+E0A0-E0D7  Powerline (branch, line-number, separators)
 *   U+E5FA-E6B7  Seti-UI + custom dev icons
 *   U+F000-F0FF  Font Awesome subset (folders, git, etc.)
 */
const RELEASE = 'v3.2.1'
const ZIP_URL = `https://github.com/ryanoasis/nerd-fonts/releases/download/${RELEASE}/JetBrainsMono.zip`
const TTF = 'JetBrainsMonoNerdFontMono-Regular.ttf'
const UNICODES = 'U+0020-007E,U+00A0-00FF,U+2500-259F,U+E0A0-E0D7,U+E5FA-E6B7,U+F000-F0FF'
const OUT = 'public/fonts/statusline-nerd.woff2'
const TMP = '.font-tmp'

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })
mkdirSync('public/fonts', { recursive: true })

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
    `curl -sSL -o "${licenseOut}" "https://raw.githubusercontent.com/ryanoasis/nerd-fonts/${RELEASE}/LICENSE"`,
    { stdio: 'inherit' },
  )
}

rmSync(TMP, { recursive: true, force: true })
console.log(`Wrote ${OUT}`)
