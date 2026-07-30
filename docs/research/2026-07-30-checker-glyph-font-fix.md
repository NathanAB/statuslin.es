# Rendering U+1FB95 consistently

Date: 2026-07-30

## Recommendation

Ship a tiny, repository-owned fallback font containing only `U+1FB95 CHECKER
BOARD FILL`, derived from pinned JuliaMono v0.062. JuliaMono's glyph already
uses the exact `0.6em` cell used by StatuslineNerd, so no outline or metric
distortion is required. Rename the subset to comply with JuliaMono's Reserved
Font Name, then register the same TTF asset after StatuslineNerd in both the
browser and Satori font stacks.

This is preferable to changing the submitted text, relying on operating-system
fonts, or adding an unmodified general-purpose symbol font.

## What is broken

- Unicode assigns `U+1FB95` the name **CHECKER BOARD FILL** in the Symbols for
  Legacy Computing block. The character is the submitted script's intentional
  representation of usage beyond the even-pace point.
  [Unicode names list](https://www.unicode.org/charts/nameslist/n_1FB00.html)
- Neither the browser's `statusline-nerd.woff2` nor the Open Graph renderer's
  `statusline-nerd-full.ttf` contains `U+1FB95`.
- The Open Graph fallback `unifont.otf` is the Basic Multilingual Plane build.
  `U+1FB95` is in Plane 1, which GNU ships in `unifont_upper`, so the current
  Unifont fallback cannot cover it.
  [GNU Unifont plane coverage](https://unifoundry.com/unifont/index.html#unifont_glyphs)
- Browser fallback currently depends on whatever fonts happen to be installed
  on the visitor's system. Satori has no system fallback; it can only use font
  buffers explicitly supplied by the application.
  [Satori font documentation](https://github.com/vercel/satori#fonts)

The rendered preview text is already correct. Re-rendering scenarios cannot
fix missing glyph coverage.

## Candidate comparison

| Approach | Coverage | Cell width at the current font size | Result |
| --- | --- | ---: | --- |
| Operating-system fallback | Platform-dependent | Platform-dependent | Reject: not reproducible |
| Replace `🮕` with `▒` or a CSS drawing | N/A | Can be forced | Reject: changes or special-cases submitted output |
| JuliaMono v0.062 subset | Yes | `0.6em` | **Recommend:** exact native metric; no glyph transform |
| Full Unifont Upper | Yes | `0.5em` | Reject unmodified: about 6.1 MB locally and one cell too narrow |
| One-glyph normalized Unifont Upper | Yes | `0.6em` | Viable runner-up, but requires changing the outline and advance |
| Noto Sans Symbols 2 fallback | Yes | `1em` | Reject unmodified: each checker is 67% wider than a `0.6em` status-line cell |

Noto Sans Symbols 2 is a valid source in licensing and coverage terms. Its
official build maps the Symbols for Legacy Computing range, including
`U+1FB95`, and is SIL Open Font License 1.1 licensed.
[Noto proof sheet](https://notofonts.github.io/symbols/proof/NotoSansSymbols2/Regular-diffbrowsers_glyphs.html),
[Noto license](https://github.com/notofonts/symbols/blob/main/OFL.txt)

It is not the best direct fallback here because its `U+1FB95` advance is
`1000/1000 = 1em`; StatuslineNerd uses `600/1000 = 0.6em`. A run of eight Noto
checker glyphs therefore expands a 16-cell terminal bar materially. Compressing
Noto's square design to `0.6em` also distorts it more than widening Unifont's
terminal-oriented `0.5em` design to `0.6em`.

JuliaMono v0.062 maps `U+1FB95`, declares itself monospaced, and gives the glyph
an advance of `1200/2000 = 0.6em`—exactly StatuslineNerd's `600/1000 = 0.6em`.
It is licensed under SIL Open Font License 1.1 with **JuliaMono** as a Reserved
Font Name, so a distributed subset must use a different family name.
[Official v0.062 release](https://github.com/cormullion/juliamono/releases/tag/v0.062),
[pinned license](https://github.com/cormullion/juliamono/blob/v0.062/LICENSE),
[official download documentation](https://juliamono.netlify.app/download/)

GNU Unifont explicitly ships `unifont_upper` for glyphs above the Basic
Multilingual Plane. Its compiled fonts are dual-licensed under the SIL Open
Font License 1.1 and GPL 2+ with the font embedding exception. It remains a
sound fallback candidate, but its `0.5em` source glyph must be widened by 20%
and given a new advance to match the bar.
[GNU Unifont downloads and licensing](https://unifoundry.com/unifont/index.html)

## Measured proof

The primary comparison used the official
[`JuliaMono-ttf.tar.gz` from v0.062](https://github.com/cormullion/juliamono/releases/download/v0.062/JuliaMono-ttf.tar.gz)
(`SHA-256 d686ba37d804a9075240abd555101a5f602e36dee4be17c945c70995116da8ec`).

- `JuliaMono-Regular.ttf`: 3,249,676 bytes; `SHA-256
  b9e7c00d2bbc69aa072b45c72d2156137de654ce032905df04d4217dc9853e9f`.
- Source `U+1FB95` advance: `1200/2000 = 0.6em`.
- StatuslineNerd advance: `600/1000 = 0.6em`.
- A straightforward FontTools one-glyph subset measured 5,908-byte TTF and
  2,820-byte WOFF2. A minimal renamed TTF build is about 1.2 KB; either size is
  negligible compared with the current 83 KB browser font.
- In the repository's actual Satori stack, `█🮕█` measured as three equal
  `0.6em` cells without modifying the glyph. Repeated checker cells were
  full-height, seamless, and visibly distinct from the solid blocks at the
  production preview's 14px size.

For comparison, the official pinned
[`unifont_upper-17.0.05.otf`](https://unifoundry.com/pub/unifont/unifont-17.0.05/font-builds/unifont_upper-17.0.05.otf)
was 6,138,788 bytes and its source advance was `32/64 = 0.5em`. A throwaway
normalized subset also rendered correctly, but required a 1.2× horizontal
outline transform plus an advance change. JuliaMono reaches the same result
without either operation.

These sizes are measurements, not proposed checked-in binaries. Production
artifacts should be regenerated by the repository's build recipe.

## Proposed implementation shape

1. Extend the existing font build tooling with pinned JuliaMono v0.062, its
   release URL, and a SHA-256 check. Use FontTools to extract only `U+1FB95`.
   FontTools officially supports Unicode-selected subsets and TTF/OTF/WOFF
   outputs. [FontTools subset documentation](https://fonttools.readthedocs.io/en/latest/subset/)
2. Preserve JuliaMono's source glyph, units-per-em, and `1200` advance. Rename
   the derivative family (for example, `StatuslineLegacySymbols`) because the
   OFL reserves the JuliaMono name. Preserve the copyright, OFL text,
   source-version, and modification notice.
3. Prefer one generated TTF asset shared by both consumers. It is only about
   1.2 KB, Satori supports TTF, and Vite can process a font referenced from CSS
   as a build asset. This avoids browser/Open Graph drift.
   [Vite asset handling](https://vite.dev/guide/assets),
   [Satori supported formats](https://github.com/vercel/satori#fonts)
4. Add an `@font-face` restricted to `unicode-range: U+1FB95`, then put the
   family immediately after StatuslineNerd in `--font-mono`. The CSS descriptor
   lets the browser limit the face to this character.
   [CSS Fonts `unicode-range`](https://www.w3.org/TR/css3-fonts/#descdef-unicode-range)
5. Import the same TTF into `loadOgFonts()` after StatuslineNerd and before the
   broad fallbacks. No stored previews need to be regenerated.

Keeping the fallback separate is safer than merging the glyph into the large
Nerd Font binaries: it leaves upstream assets unchanged, makes provenance
obvious, and gives the coverage/metric contract a small independently testable
surface.

## Verification contract

Implement with a failing test first:

1. Add `U+1FB95` to the Open Graph font-coverage test and observe that the
   current stack fails.
2. Add a metric assertion that the fallback glyph advance equals the
   StatuslineNerd advance (`0.6em`). Coverage alone would allow the Noto width
   regression.
3. Render `█████🮕🮕🮕` through Satori and verify no tofu, no gap at the
   transition, and equal cell advances.
4. In a real browser, wait for `document.fonts.ready`, then verify the staging
   admin preview visually and compare the computed width of `█` and `🮕`.
5. Check a real generated Open Graph card containing the above-pace scenario.

The acceptance criterion is not merely “the character appears.” The solid and
checker portions must occupy the same terminal grid, and browser and Open Graph
output must agree.
