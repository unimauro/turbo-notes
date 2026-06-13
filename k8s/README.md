# Kubernetes manifests — the scale-out path

> **These are intentionally not used for the live demo.** At the current size, the app
> runs as a `docker compose` stack behind Caddy (see [`../deploy/`](../deploy/)), which is
> the right amount of operational complexity. Reaching for Kubernetes on a notes app today
> would add failure surface, latency, and cost without benefit.
>
> This directory documents *how the same containers scale horizontally when traffic
> justifies it* — the migration is mechanical because the app is already stateless and
> twelve-factor (config from env, no local session state, DB as the only stateful piece).

## What changes from compose to here

| Concern | Compose (today) | Kubernetes (this dir) |
| --- | --- | --- |
| Backend instances | 1 | `Deployment` + **HPA** (2→10 on CPU) |
| Frontend instances | 1 | `Deployment`, 2 replicas |
| Database | container + volume | here: a `StatefulSet` for demo, but **in real prod use a managed DB** (RDS/Cloud SQL) — comment in `postgres.yaml` |
| TLS / routing | Caddy | `Ingress` (ingress-nginx) + cert-manager |
| Secrets | `.env` file | `Secret` (here: example; in prod use a sealed/external secret store) |
| Config | env in compose | `ConfigMap` |

## Apply (illustrative — needs a cluster + ingress-nginx + cert-manager)

```bash
kubectl apply -f namespace.yaml
kubectl apply -f config.yaml          # ConfigMap + Secret (edit first)
kubectl apply -f postgres.yaml        # or skip and point DATABASE_URL at a managed DB
kubectl apply -f backend.yaml         # Deployment + Service + HPA
kubectl apply -f frontend.yaml        # Deployment + Service
kubectl apply -f ingress.yaml         # Ingress (TLS via cert-manager)
```

## How it scales from 100 to 10M users

1. **Stateless app tier** — both `Deployment`s scale horizontally; the backend HPA reacts
   to CPU (and could use custom/RPS metrics).
2. **Database first to bottleneck** — move to a managed Postgres with a read replica; send
   list/search reads to the replica.
3. **Search** — `?search=` is a trigram/`ILIKE` scan today; at scale switch to a Postgres
   `tsvector` GIN index (or a dedicated search service).
4. **Pagination** — page-number pagination is fine for a personal note count; switch to
   keyset/cursor pagination for very large per-user sets.
5. **Caching/CDN** — the Next.js tier sits behind a CDN; hot read endpoints can use a
   short-TTL cache (Redis) keyed by user + query.
