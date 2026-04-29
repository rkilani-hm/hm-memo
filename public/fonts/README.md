# Brand fonts

This folder is the home for the licensed Al Hamra brand typefaces
(Century Gothic). The application's CSS in `src/index.css` already
declares `@font-face` rules pointing at the filenames below — once
the actual font files are uploaded here, the app will pick them up
automatically. Until then, the browser falls back to Libre Franklin
(loaded from Google Fonts) and then Arial, so the app remains usable.

## Required files

Drop these into this directory, named exactly as shown:

```
century-gothic-regular.woff2     ← weight 400
century-gothic-regular.woff      ← weight 400 (fallback)
century-gothic-bold.woff2        ← weight 700
century-gothic-bold.woff         ← weight 700 (fallback)
```

Both `.woff2` and `.woff` are listed in `@font-face` so older browsers
that don't support `.woff2` can still use `.woff`. Modern browsers
will prefer `.woff2`. You can ship just `.woff2` if license permits;
omitting `.woff` is fine — the browser silently skips missing sources.

## Sourcing the files

Century Gothic is a licensed Monotype typeface. Per the brand
guidelines (Identity Guidelines PDF), Al Hamra has a license for
brand use. The web-font (`.woff2` / `.woff`) versions need to be
purchased or generated separately from any desktop license — the
desktop `.ttf` / `.otf` license usually does NOT cover web embedding.

If you don't have the web-font version yet, request it from the
brand/design team or Monotype directly. In the meantime the fallback
to Libre Franklin keeps the site looking clean and readable.

## How to verify it loaded

Open the deployed site in a browser, open DevTools → Network →
filter by "Font". You should see `century-gothic-regular.woff2` and
`century-gothic-bold.woff2` returning 200 OK. If they return 404,
the files aren't in `/public/fonts/` on the deployed build.

## Arabic typefaces

The brand guide also calls for "Ge Flow" (Bold + Regular) for Arabic
text. The current application is English-only — when Arabic UI is
added, repeat the same setup with `ge-flow-regular.woff2` /
`ge-flow-bold.woff2` and add corresponding `@font-face` entries
in `src/index.css` scoped to `:lang(ar)`.
