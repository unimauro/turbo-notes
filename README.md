# Turbo Notes

A production-quality notes application built for the Turbo AI Senior Full Stack Engineer challenge: Django 5 + DRF + PostgreSQL on the backend, Next.js (App Router) + TypeScript + TanStack Query on the frontend, fully dockerized with CI.

The guiding principle throughout: **the right amount of engineering for the scope** — clean layering, full test coverage, and documented tradeoffs, without inventing complexity the problem doesn't have.

## Features

- Notes CRUD — list, create, edit, delete (with confirmation)
- Search across title and content, debounced on the client, `?search=` on the API
- Pagination (12 per page, client-tunable up to 100) and ordering (default `-updated_at`)
- Optimistic updates on create, edit, and delete, with automatic rollback on error
- Full UI states: skeleton loading, empty (first-run and no-search-results variants), and error with retry
- Dark mode with no flash-of-wrong-theme on load; responsive from mobile to desktop; keyboard accessible (focus trap in modals, Escape to close, Cmd/Ctrl+Enter to save)
- OpenAPI docs at `/api/docs`, health endpoint at `/api/health`
- One-command startup: `docker compose up --build`

## Architecture

```
Browser
  │  (axios, typed service layer, TanStack Query cache)
  ▼
Next.js 16 (App Router, standalone server, :3000)
  │  REST over HTTP — http://localhost:8000/api/v1
  ▼
Django 5 + DRF (gunicorn, :8000)
  │  NoteViewSet → NoteSerializer → Note model
  ▼
PostgreSQL 16 (docker) / SQLite (local dev & tests)
```

**Request flow (e.g. a search):** the user types in the search bar → `useDebounce` waits 300ms → `useNotes` updates the query key → TanStack Query calls the typed service (`services/notes.ts`) → axios hits `GET /api/v1/notes/?search=...` → DRF's `SearchFilter` translates that to an `icontains` query over `title` and `content` → the paginated envelope (`count/next/previous/results`) renders into the card grid. `keepPreviousData` keeps the previous results on screen while the new page loads, so the grid never flashes empty.

**Why a service-less DRF ViewSet is the right size here.** The backend is intentionally a thin, idiomatic DRF stack: `ModelViewSet` + serializer + model. The brief allows a service layer "where it adds value" — and for pure CRUD with filter/ordering/pagination, it adds none. There are no cross-model transactions, no side effects (emails, events, billing), and no business rules beyond field validation, which belongs in the serializer. A service layer here would be a pass-through that makes every change touch one extra file. The moment a real rule appears (say, "creating a note also indexes it in search and notifies collaborators"), that's the cue to introduce one — and the seam to do it (the ViewSet's `perform_create`/`perform_update` hooks) already exists.

The same philosophy applies on the frontend: one page component owns the state wiring, components are small and presentational, all data access goes through three layers (`services/` for HTTP, `hooks/` for cache behavior, `types/` for contracts) so the API surface is mockable and the components are testable in isolation.

## Tradeoffs

| Decision | Chosen | Alternative | Why |
|---|---|---|---|
| Editor UX | Modal | Dedicated `/notes/[id]` route | Faster flow for short notes; preserves list scroll/search state; keyed mount (`key={note.id}`) prevents state leaking between notes. A route would add deep-linking — noted under future improvements. |
| Mutations | Optimistic updates | Invalidate-and-refetch only | The brief asks for it, and the UX is markedly better. Cost: real complexity (snapshot/rollback across every cached page). Contained in `useNotes` behind shared snapshot/restore helpers so components stay oblivious. |
| Test database | SQLite locally, Postgres in Docker | Postgres everywhere | Tests run in under a second with zero setup, which keeps the feedback loop tight and CI simple. The risk (engine-specific behavior) is low for this schema — no JSON fields, no full-text, no raw SQL. If we adopted `tsvector` search, tests would move to Postgres the same day. |
| Primary keys | Sequential `BigAutoField` | UUID | No auth means nothing is enumerable that the list endpoint doesn't already expose; integers index and paginate better. Documented in the model docstring; swapping is one migration. |
| Auth | None | Token/session auth | The challenge doesn't ask for it. Made explicit rather than implicit: DRF is configured with empty authentication classes and `AllowAny`, with comments explaining the decision. |
| Service layer | None | services.py between view and model | Pure CRUD; see architecture section. Adding indirection without behavior is the overengineering the brief forbids. |
| Pagination style | Page numbers | Cursor | Page numbers give users "page 3 of 12" semantics and are what DRF documents best. Cursor pagination is the right call at large scale — see scalability. |

## Project structure

```
turbo-notes/
├── docker-compose.yml          # db + backend + frontend, one command
├── .github/workflows/ci.yml    # backend + frontend jobs
├── docs/                       # video script, interview prep
├── backend/
│   ├── Dockerfile              # multi-stage, non-root, gunicorn
│   ├── entrypoint.sh           # migrate → gunicorn
│   ├── requirements.txt        # pinned
│   ├── config/                 # settings (12-factor), urls, wsgi
│   └── apps/notes/
│       ├── models.py           # Note (title, content, timestamps)
│       ├── serializers.py      # validation: trim, friendly blank/required errors
│       ├── views.py            # NoteViewSet (search/ordering/pagination)
│       ├── pagination.py       # 12/page, max 100
│       └── tests/              # factories + model/serializer/API tests
└── frontend/
    ├── Dockerfile              # multi-stage node:20-alpine, standalone output
    └── src/
        ├── app/                # layout (no-flash theme script), page (state wiring)
        ├── components/         # Header, SearchBar, NoteCard, NoteList, modals,
        │                       # Skeleton/Empty/Error states (+ __tests__/)
        ├── hooks/              # useNotes (query + optimistic mutations),
        │                       # useDebounce, useFocusTrap (+ __tests__/)
        ├── services/           # notes.ts — typed axios layer (+ __tests__/)
        ├── lib/                # query client, providers, relative time
        └── types/              # Note, NoteInput, Paginated<T>
```

## Quickstart

### Docker (recommended)

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:8000/api/v1/notes/
- API docs (Swagger): http://localhost:8000/api/docs
- Health: http://localhost:8000/api/health

The backend waits for Postgres to be healthy, runs migrations automatically, then serves. No other steps.

### Local development

Backend (Python 3.12, defaults to SQLite — no database setup needed):

```bash
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver        # http://localhost:8000
```

Frontend (Node 20):

```bash
cd frontend
npm install
npm run dev                       # http://localhost:3000
```

Environment variables are documented in `backend/.env.example` and `frontend/.env.example`; both apps run with sensible defaults if none are set. Note that `NEXT_PUBLIC_API_URL` is inlined at build time by Next.js, which is why docker-compose passes it as a **build arg**, not a runtime env.

## Testing

Backend — 37 tests, **100% coverage** on `apps/` (target was ≥85%):

```bash
cd backend && source .venv/bin/activate
pytest --cov=apps --cov-report=term    # 37 passed in ~1s
flake8 && black --check . && isort --check-only .
```

Coverage spans models (timestamps, ordering, `__str__`), serializers (trim, read-only protection, output shape), and the API surface: CRUD happy paths, validation errors (blank/whitespace/missing title on create and update), 404s, pagination edges (default size, remainder pages, `page_size` cap at 100), search over title and content, and all three ordering fields.

Frontend — 5 suites, 20 tests:

```bash
cd frontend
npm test          # 20 passed
npm run lint      # 0 problems
npm run build     # must pass (CI enforces it)
```

Suites cover `NoteCard` rendering and interaction, `SearchBar` debounce behavior with fake timers, `EmptyState` variants, the axios service layer (URL/params/payload assertions against a mocked client), and the `useDebounce` hook.

CI runs both jobs on every push and PR to `main` (lint + tests with a coverage floor for the backend; lint + tests + production build for the frontend).

## API

Base URL: `/api/v1` · Interactive docs: [`/api/docs`](http://localhost:8000/api/docs) (Swagger UI via drf-spectacular) · Raw schema: `/api/schema`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/v1/notes/` | List notes. Query params: `search` (title+content), `ordering` (`updated_at`, `created_at`, `title`, prefix `-` for desc), `page`, `page_size` (max 100). Returns DRF envelope `{count, next, previous, results}`. |
| POST | `/api/v1/notes/` | Create a note. Body: `{title, content?}`. `title` required, trimmed, max 255 chars. Returns 201. |
| GET | `/api/v1/notes/{id}/` | Retrieve one note. 404 if missing. |
| PATCH | `/api/v1/notes/{id}/` | Partial update. Same validation as create. |
| PUT | `/api/v1/notes/{id}/` | Full update. |
| DELETE | `/api/v1/notes/{id}/` | Delete. Returns 204. |
| GET | `/api/health` | Liveness probe (no DB access). |

Validation errors return DRF's structured 400 shape, e.g. `{"title": ["This field may not be blank."]}` — which the frontend surfaces in the editor.

## AI usage

I built this project with Claude (Anthropic's agentic coding tooling) as a force multiplier, and I want to be precise about the division of labor, because I think that's what responsible AI-assisted engineering looks like.

**What I owned:** the architecture and every consequential decision — service-less DRF ViewSets over a ceremonial service layer, modal editor over a route, page pagination now with a documented path to cursor pagination, SQLite for tests with Postgres in Docker, no auth as an explicit scope decision rather than an omission. I also owned code review: I read the generated code the way I'd review a teammate's PR, and rejected or reworked anything that didn't meet the bar.

**What AI accelerated:** scaffolding (Django project layout, Next.js setup, Dockerfiles, CI), test generation (I specified the cases I wanted covered — pagination edges, whitespace-title validation, optimistic-rollback paths — and had the agent write and run them), and documentation drafts. The agent also caught things worth keeping: pip initially resolved Django 6.0, which violated the "Django 5" requirement, so it was pinned to 5.2.x explicitly; and Next.js 16's stricter react-hooks lint rules pushed the theme toggle toward a cleaner `useSyncExternalStore` pattern instead of the usual mounted-flag hack.

**Workflow:** I worked from a written brief that served as the single source of truth, ran specialized agent sessions for backend and frontend with explicit quality gates (tests green, lint clean, build passing — verified by actually running them, not by assertion), and reviewed the output against the brief before integration. Where the two halves had to agree — the DRF pagination envelope, default ordering, CORS origins, the build-time inlining of `NEXT_PUBLIC_API_URL` — I verified the contract on both sides myself.

**Net effect:** roughly a 3-4x speedup on a challenge of this scope, with the time saved reinvested where it compounds — test depth (100% backend coverage), edge cases, and this documentation. AI didn't make the decisions; it made the decisions cheaper to execute well.

## Scalability considerations

The current design is honest about its scale (a challenge app) but the upgrade path is deliberate:

- **Already in place:** pagination capped at 100 per page, an index on `updated_at` (it backs the default ordering of every list call), pinned dependencies, stateless app containers (state lives in Postgres), and a DB-free health endpoint suitable as a liveness probe.
- **First bottleneck (~100k notes, real traffic):** `icontains` search becomes a sequential scan. The fix stays inside Postgres: a `tsvector` column with a GIN index for full-text search (with ranking and stemming), or `pg_trgm` for fuzzy matching. No new infrastructure needed — this is one migration plus a small change in the ViewSet's filter backend.
- **Read scaling:** notes are read-heavy. Add Postgres read replicas with Django's database routing; put a CDN (CloudFront/Cloudflare) in front of the Next.js static assets — the standalone build already separates static output for exactly this. Short-TTL caching of hot list responses (Redis) sits behind the API if replica lag isn't acceptable for the freshness this UI needs.
- **Path to 10M+ notes:** offset pagination degrades at deep pages (`OFFSET 200000` scans and discards). Switch to DRF's `CursorPagination` keyed on `(-updated_at, -id)` — the frontend already treats pagination links as opaque, so the change is contained. Beyond that: partition by tenant once auth/multi-tenancy lands, move search to a dedicated engine (OpenSearch) only when `tsvector` measurably stops being enough, and scale gunicorn horizontally behind a load balancer — the containers are already stateless and non-root.

The theme: each step is taken when measurement demands it, and none of them require rearchitecting, because the boundaries (typed service layer, ViewSet hooks, opaque pagination) were placed where the system would need to flex.

## Future improvements

- **Authentication and per-user notes** — token auth (or session + CSRF), a `user` FK on `Note` (a single migration), and queryset scoping in the ViewSet. Deliberately out of scope per the brief.
- **Tags / folders** — a `Tag` model with M2M, filter chips in the UI; this is also the point where a service layer might start earning its place.
- **Autosave with debounce + conflict detection** — save drafts as the user types; an `updated_at` precondition (or version field) to detect concurrent edits.
- **E2E tests with Playwright** — the unit/integration pyramid is solid; a thin E2E layer over the critical paths (create → search → edit → delete) against the docker-compose stack would close the loop.
- **Dedicated note route** (`/notes/[id]`) alongside the modal, for deep linking and shareable URLs.
- **Observability** — structured request logging, Sentry, and a `/api/health/ready` readiness probe that does check the DB.
