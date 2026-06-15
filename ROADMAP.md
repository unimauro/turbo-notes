# Roadmap

Where Turbo Notes goes next, framed by **impact (the "wow")** against **effort**. The
current build is deliberately scoped — a faithful, fully-tested, deployed notes app with
AI voice transcription. This is the vision for turning it into a product people remember.

The bias is **AI-first**: the features that make people say "wow" are the ones where the
app does the thinking, not just the storing.

## The shortlist — what I'd build next (in order)

1. **Talk to your notes — realtime voice agent.** The Figma's "Voice" page, fully realized:
   a live, bidirectional voice conversation (OpenAI Realtime API over WebRTC) where you
   speak and the assistant captures, organizes, and answers about your notes hands-free.
   We already ship voice *dictation*; this is the leap to a voice *agent*.
   _Impact: ★★★★★ · Effort: ★★★★_
2. **Ask your notes — RAG chat.** Embed every note (pgvector), and add a chat box:
   "what did I decide about the trip?" returns an answer grounded in your own notes, with
   citations. The single most useful AI feature for a real note-taker.
   _Impact: ★★★★★ · Effort: ★★★_
3. **Semantic search.** The same embeddings power search-by-meaning, not just keywords —
   "things to buy" finds the grocery list even without those words. Drops straight into
   the existing (currently headless) `?search=` seam.
   _Impact: ★★★★ · Effort: ★★_

## AI-first features (the wow tier)

| Feature | What it does | Impact | Effort |
|---|---|---|---|
| Realtime voice agent | Live voice conversation with your notes (Realtime API) | ★★★★★ | ★★★★ |
| Ask-your-notes (RAG) | Chat grounded in your notes, with citations (pgvector) | ★★★★★ | ★★★ |
| Semantic search | Search by meaning via embeddings | ★★★★ | ★★ |
| Auto-categorize | AI suggests the category as you write | ★★★ | ★★ |
| Smart summaries | One-line TL;DR on long notes; "summarize this" | ★★★ | ★★ |
| Writing assistant | Continue / rewrite / expand a note inline | ★★★ | ★★ |
| Multi-language transcription | Whisper already supports it; surface a language picker | ★★ | ★ |

## Product & UX (the delight tier)

| Feature | Why | Impact | Effort |
|---|---|---|---|
| Real-time collaboration | Multiplayer editing (the cross-cutting rule that would finally justify a service layer) | ★★★★ | ★★★★ |
| Offline-first PWA | Install on a phone; write notes with no signal, sync later | ★★★★ | ★★★ |
| Rich text / markdown | Headings, checklists, links — beyond plain text | ★★★ | ★★ |
| User-defined categories & tags | Beyond the seeded four; colors and tags per user | ★★★ | ★★ |
| Reminders & notifications | "remind me about this note tomorrow" | ★★★ | ★★ |
| Share a note (read-only link) | Public link with a token; the data model already scopes by owner | ★★ | ★★ |

## Engineering & scale (the trust tier)

| Item | Why | Effort |
|---|---|---|
| httpOnly cookie auth | Remove the localStorage/XSS tradeoff (already documented) | ★★ |
| Postgres full-text search (tsvector + GIN) | Scale `?search=` past `ILIKE` | ★★ |
| Cursor pagination | Stable paging for very large per-user note sets | ★ |
| Redis caching + CDN | Cache hot reads; cache category counts | ★★ |
| Kubernetes rollout | Use the `k8s/` manifests when traffic justifies it (HPA, ingress) | ★★★ |
| Observability | Structured request logging, metrics, tracing | ★★ |
| Playwright E2E | Browser tests over the `docker compose` stack | ★★ |

## If I had one more week

I'd ship **#2 and #3 first** — semantic search and ask-your-notes — because they reuse one
embeddings pipeline (pgvector) and transform the product from "where I put notes" into
"where I get answers," at moderate effort. Then **#1**, the realtime voice agent, as the
signature demo. Everything else is incremental.

> Guiding principle, unchanged: ship the wow, but never let an AI feature become a single
> point of failure or a forced cost — each one degrades gracefully, exactly like the
> Whisper transcription does today.
