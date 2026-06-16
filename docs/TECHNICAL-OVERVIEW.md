# Turbo Notes — Technical Overview

![Coverage 100%](https://img.shields.io/badge/coverage-100%25-brightgreen)
![Backend tests](https://img.shields.io/badge/backend-pytest%20100%25-blue)
![Frontend tests](https://img.shields.io/badge/frontend-105%20jest%20tests-blue)
![CI](https://img.shields.io/badge/CI-green-brightgreen)

> A 5-minute technical tour: what it is, how it's built, and how to see it running.
> Companion to the full [README](../README.md).

---

## 1. What it is

A production-quality, per-user notes app built for the Turbo AI Senior Full Stack challenge — matched to the official prototype's cozy-journal design, with live AI voice features layered on top.

- **Backend** — Django 5 + DRF + PostgreSQL, JWT auth (simplejwt), owner-scoped data.
- **Frontend** — Next.js 16 (App Router) + TypeScript + TanStack Query, autosaving editor.
- **AI (live, optional)** — OpenAI Whisper (dictation), TTS (read-aloud), `gpt-4o-mini` (suggest title / summarize), and a hands-free **"close my note"** voice command — each degrades gracefully to free in-browser speech when no key is set.

**Guiding principle:** *the right amount of engineering for the scope* — clean layering, full test coverage, documented tradeoffs, no invented complexity.

---

## 2. Live demo

**🔴 [notes.cardenas.pe](https://notes.cardenas.pe)**

| | |
| --- | --- |
| **Login** | `demo@turbo.ai` / `demo12345` (backup `demo2@turbo.ai`) |
| **Try** | create a note (autosaves, no save button) · change its category (recolors instantly) · dictate by mic · read aloud · "suggest a title" / "summarize" |
| **Hands-free** | while dictating, say **"close my note"** → it strips the command, AI-names the note, and the editor evaporates closed |
| **Polish** | uniform card grid · the most-recent note carries a **"Latest"** highlight · dark mode · infinite scroll |

![Board](screenshots/03-board.png)

---

## 3. Architecture at a glance

```mermaid
flowchart TD
    subgraph Client["Client · browser"]
        UI["Next.js 16 SPA<br/>React · TanStack Query · TypeScript"]
    end
    CADDY["Caddy<br/>HTTPS · routes / → web, /api → API"]
    subgraph Server["Server"]
        WEB["Next.js standalone server :3000"]
        API["Django 5 + DRF :8000<br/>JWT auth · owner-scoped ViewSet"]
        DB[("PostgreSQL 16")]
    end
    WHISPER["OpenAI Whisper / TTS / gpt-4o-mini<br/>optional · AI features"]

    UI -->|HTTPS| CADDY
    CADDY -->|"/"| WEB
    CADDY -->|"/api/v1 · JWT Bearer"| API
    API --> DB
    API -.->|key-gated| WHISPER
```

**Layering.** Backend: idiomatic DRF (ViewSet + serializers + models) — ownership stamping in `perform_create`, scoping in `get_queryset`, no pass-through service layer it doesn't need. Frontend: pages wire state, components are presentational, all data access goes through `services/` (HTTP) → `hooks/` (cache) → `types/` (contracts), so it's mockable and unit-testable.

---

## 4. Two flows that show the design

**Autosave** — no save button; the note is born on the first keystroke and PATCHed on an 800 ms debounce, with a single transparent token refresh on 401.

```mermaid
sequenceDiagram
    actor User
    participant Editor as NoteEditor (React)
    participant Axios as axios + interceptors
    participant API as Django /api/v1/notes
    participant DB as PostgreSQL
    User->>Editor: first keystroke
    Editor->>Axios: POST /notes (create)
    Axios->>API: + Bearer access token
    API->>DB: INSERT (owner = request.user)
    API-->>Editor: 201 note
    loop each change · debounced 800 ms
        User->>Editor: edits title / content
        Editor->>API: PATCH /notes/:id
    end
    Note over Axios,API: on 401 → one refresh + replay,<br/>else clear tokens → /login
```

**Voice → text** — AI is never a single point of failure or a forced cost.

```mermaid
flowchart TD
    Start["User clicks mic"] --> Check{"Whisper enabled?"}
    Check -->|"yes + MediaRecorder"| Rec["Record audio"] --> Up["POST → /api/v1/transcribe"] --> W["OpenAI Whisper"] --> Ins["Insert text → autosave"]
    Check -->|"no key / unsupported"| Web["Web Speech API<br/>free in-browser"] --> Ins
```

---

## 5. CI/CD & quality

Every change ships through a pull request; nothing reaches production unless the pipeline is green.

```mermaid
flowchart LR
    PR["Pull request"] --> CI["CI · ci.yml"]
    PR --> CR["CodeRabbit · AI review"]
    PR --> QL["CodeQL · security scan"]
    CI --> GATE{"All green?"}
    GATE -->|yes| MERGE["Merge to main"]
    GATE -->|no| FIX["Fix & push"] --> CI
    MERGE --> DEP["Deploy to VPS"]
    DEP --> LIVE(("notes.cardenas.pe"))
```

- **CI gate** — backend (`flake8` · `black`/`isort` · `pytest` with an 85% coverage floor, currently **100%**) and frontend (`lint` · Jest · `next build`).
- **CodeRabbit** — free AI PR review. **CodeQL** — static security/quality scan (TS + Python). **Dependabot** — weekly dependency + security PRs.
- **Hardened deploy** — isolated Compose project on `127.0.0.1:3300`; idempotent Caddy wiring with `caddy validate` **before** reload (a bad edit never takes down neighbouring sites); post-deploy `/api/health` check; secrets only in GitHub Actions.

---

## 6. A note on the `k8s/` folder *(intentional, not in use)*

The repo includes Kubernetes manifests under `k8s/`. They are **documentation of the horizontal scale-out path, not the deployment in use.** At this scale the app runs as a single isolated Docker Compose stack behind a shared Caddy — which is the right size for the workload. The manifests exist to show the seam to Deployment + Service + HPA *if* traffic ever demanded it, without overbuilding today. See [Scalability considerations](../README.md#scalability-considerations).

This is deliberate: ship what the problem needs, document where it would grow.

---

## 7. Testing

- **Backend:** `pytest` + coverage, **100%** (floor enforced at 85% in CI). All OpenAI calls are mocked — tests need no key and no network.
- **Frontend:** Jest + React Testing Library, 100+ tests across components, hooks, services, and the voice-command logic.
- **Run it:** `docker compose up --build` (full stack), or see the [Quickstart](../README.md#quickstart).
