import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { refuseArchiveDifferences, type TreeEntry } from '@/mods/archive-differences'
import { PluginRefusal } from '@/mods/plugin-facts'

/** Git's id for a file holding `text`, which the tree lists it by. */
const blobSha = (text: string) =>
  createHash('sha1')
    .update(`blob ${Buffer.byteLength(text)}\0${text}`)
    .digest('hex')
const tree = (...extra: TreeEntry[]): TreeEntry[] => [
  { path: 'hooks/register.ts', type: 'blob', sha: blobSha('x') },
  ...extra,
]
const attributes = (path: string, text: string) => ({ path, type: 'blob', sha: blobSha(text) })

/** Serves each text's bytes by its blob id, and records which ids were read. */
function blobs(...texts: string[]) {
  const read: string[] = []
  const bytes = new Map(texts.map((text) => [blobSha(text), new TextEncoder().encode(text)]))
  const readBlob = async (sha: string, maxBytes: number) => {
    read.push(sha)
    const all = bytes.get(sha) ?? new Uint8Array()
    return { bytes: all.subarray(0, maxBytes), truncated: all.byteLength > maxBytes }
  }
  return { read, readBlob }
}

const refusal = (entries: TreeEntry[], readBlob = blobs().readBlob) =>
  refuseArchiveDifferences(entries, readBlob).catch((error: unknown) => error)

describe('what makes the checkout statuslin.es inspects differ from the one Claude Code installs', () => {
  it.each([
    ['a submodule', { path: 'lib', type: 'commit', sha: 'c'.repeat(40) }],
    ['a .gitmodules', { path: '.gitmodules', type: 'blob', sha: blobSha('') }],
  ])('refuses a plugin folder with %s', async (_name, entry) => {
    const result = await refusal(tree(entry))

    expect(result).toBeInstanceOf(PluginRefusal)
    expect((result as Error).message).toMatch(/submodules/)
  })

  it.each([
    ['export-ignore', '/mod/monitors export-ignore\n'],
    ['export-subst', 'hooks/*.ts export-subst\n'],
    [
      'working-tree-encoding, which a Mac checkout converts',
      'hooks/register.ts working-tree-encoding=SHIFT_JIS\n',
    ],
    ['ident', '*.ts ident\n'],
    ['filter=lfs', '*.ts filter=lfs diff=lfs merge=lfs -text\n'],
    ['a macro', '[attr]plain text\n*.ts plain\n'],
    ['a quoted pattern glued to its attribute', '"*"working-tree-encoding=SHIFT_JIS\n'],
    ['a quoted macro', '"[attr]x"working-tree-encoding=SHIFT_JIS\n'],
    ['a quoted pattern with a space', '"my file.ts" text\n'],
    ['a pattern that is a non-ASCII space', '  working-tree-encoding=SHIFT_JIS\n'],
    ['a pattern git reads where JS sees a comment', '\v#x/** working-tree-encoding=SHIFT_JIS\n'],
    ['a byte-order mark before a pattern', '﻿#x working-tree-encoding=SHIFT_JIS\n'],
    ['a byte-order mark before a quoted pattern', '﻿"*"working-tree-encoding=SHIFT_JIS\n'],
  ])('refuses a .gitattributes using %s', async (_name, text) => {
    const result = await refusal(tree(attributes('mod/.GitAttributes', text)), blobs(text).readBlob)

    expect(result).toBeInstanceOf(PluginRefusal)
    expect((result as Error).message).toMatch(/mod\/\.GitAttributes sets more than line endings/)
  })

  it('accepts a .gitattributes that only sets line endings and how git diffs', async () => {
    const text =
      '# endings\r\n* text=auto eol=lf\n\n*.png binary\n*.md linguist-documentation -diff\n'

    expect(
      await refusal(tree(attributes('.gitattributes', text)), blobs(text).readBlob),
    ).toBeUndefined()
  })

  it('reads a .gitattributes shared by many paths once', async () => {
    const text = '* text=auto\n'
    const { read, readBlob } = blobs(text)

    await refusal(
      tree(attributes('.gitattributes', text), attributes('a/.gitattributes', text)),
      readBlob,
    )

    expect(read).toHaveLength(1)
  })

  it('refuses more than 10 .gitattributes without reading any', async () => {
    const many = Array.from({ length: 11 }, (_, i) => attributes(`d${i}/.gitattributes`, `${i}\n`))
    const { read, readBlob } = blobs()

    const result = await refusal(tree(...many), readBlob)

    expect(result).toBeInstanceOf(PluginRefusal)
    expect(read).toEqual([])
  })

  it('fails as our own error when the bytes read are not the blob the tree names', async () => {
    const text = '* text=auto\n'
    const readBlob = async () => ({ bytes: new TextEncoder().encode('* t'), truncated: false })

    const result = await refusal(tree(attributes('.gitattributes', text)), readBlob)

    expect(result).toBeInstanceOf(Error)
    expect(result).not.toBeInstanceOf(PluginRefusal)
  })
})
