# Turbo Notes — Frontend

Next.js 16 (App Router) + React 19 + Tailwind v4 + TanStack Query frontend,
redesigned to match the official prototype: cream paper background, Playfair
Display serif headings, Inter body, pastel category-tinted cards and original
kawaii inline SVG illustrations (cactus, sleeping cat, boba cup).

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
```

Set `NEXT_PUBLIC_API_URL` (see `.env.example`) to point at the API; it
defaults to `http://localhost:8000/api/v1`.

```bash
npm test           # jest (51 tests)
npm run lint       # eslint
npm run build      # production build
```

## App structure

- `/signup` — "Yay, New Friend!" · `/login` — "Yay, You're Back!"
- `/` — the board (protected; client-side redirect to `/login` without a token):
  category sidebar with per-user note counts, masonry-style grid of
  category-tinted cards, "+ New Note" pill.
- Editor — fullscreen takeover with a category dropdown pill, an X to close
  and **no save button**: changes are autosaved (debounced 800 ms; the note is
  created on the first change, PATCHed afterwards, and pending changes are
  flushed on close).

## Design decisions & assumptions

- **Delete affordance.** The prototype shows no delete UI. We kept deletion as
  a small trash icon revealed on card hover (plus keyboard focus), guarded by
  a confirm dialog styled to the cozy palette. This is an intentional,
  documented extension — notes would otherwise be immortal.
- **Search.** The prototype has no search box, so the UI doesn't render one.
  The API's `?search=` support remains in the service layer
  (`listNotes({ search })`) for future use.
- **Blank titles.** Autosave creates drafts before a title exists, so empty
  titles are allowed end-to-end; cards render "Untitled" as a placeholder.
- **Category colors.** The API stores only a slug
  (`coral|yellow|teal|lavender`); the palette mapping lives in
  `src/lib/colors.ts`, so re-theming never needs a backend change.
- **Dark mode.** Kept (it predates the redesign) but adapted: warm
  dark-brown background with the same pastel cards, slightly muted via a
  `filter` on `.tinted` elements. The toggle is a subtle corner button.

## Auth & token storage tradeoff

Tokens (simplejwt access + refresh) are kept in `localStorage` with an axios
request interceptor adding the `Bearer` header and a response interceptor
that, on a 401, attempts **one** refresh and replays the request — otherwise
it clears tokens and redirects to `/login`.

`localStorage` is readable by any script running on the page, so an XSS hole
exposes tokens. The hardened alternative — `httpOnly` cookies — is immune to
script reads but requires CSRF protection, same-site coordination and
backend cookie issuance. For this exercise the API is a pure token-issuing
DRF backend, so `localStorage` + short-lived access tokens is the pragmatic
choice; swapping to cookies would only touch `src/lib/tokens.ts` and
`src/services/api.ts`.
