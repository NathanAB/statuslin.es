# Fonts

## hanken-grotesk-latin-wght-normal.woff2

**[Hanken Grotesk](https://github.com/marcologous/hanken-grotesk)**, the interface font (`--font-sans`
in `../app.css`). One variable file covers weights 100 to 900. It holds the Latin subset; other
characters fall back to the system font.

- **Source:** `files/hanken-grotesk-latin-wght-normal.woff2` from the npm package
  `@fontsource-variable/hanken-grotesk@5.3.0`, unmodified. sha256
  `e9201eddf1d41d0b62253295d869ce3cf65768f7102b797f02c7f8c876b4a9d5`.
- **Copyright:** © 2021 The Hanken Grotesk Project Authors.
- **License:** SIL Open Font License 1.1, see [`LICENSE-OFL-HankenGrotesk.txt`](./LICENSE-OFL-HankenGrotesk.txt).

The font is licensed separately from this repository's own code (which is MIT). It lives here, not
in `public/`, so Vite fingerprints it and `src/routes/__root.tsx` can preload the same URL.
