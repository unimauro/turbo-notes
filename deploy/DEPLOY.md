# Deploying to a single server (with automatic HTTPS)

This deploys the whole stack behind [Caddy](https://caddyserver.com/), which gets and
renews a Let's Encrypt certificate automatically. One subdomain serves both the app and
the API (`/api/*` is routed to Django, everything else to Next.js), so there are no
cross-origin or mixed-content issues.

Target: ~20 minutes on a fresh Ubuntu 22.04/24.04 VPS.

## 1. Point a subdomain at the server

In your DNS provider, add an **A record**:

```
notes.cardenas.pe   ->   <your server's public IP>
```

(Use whatever subdomain you like; set the same value in `.env` as `DOMAIN`.)
Wait until `dig +short notes.cardenas.pe` returns the server IP before continuing —
Caddy needs DNS to resolve to issue the certificate.

## 2. Install Docker on the server

```bash
curl -fsSL https://get.docker.com | sh
```

## 3. Open the firewall (ports 80 and 443)

```bash
sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
```

## 4. Clone and configure

```bash
git clone https://github.com/unimauro/turbo-notes.git
cd turbo-notes/deploy
cp .env.prod.example .env
# edit .env: set DOMAIN, and strong values for DJANGO_SECRET_KEY and POSTGRES_PASSWORD
#   python3 -c "import secrets; print(secrets.token_urlsafe(64))"   # for the secret key
nano .env
```

## 5. Launch

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

The backend waits for Postgres, runs migrations (seeding the categories), then serves.
Caddy provisions the TLS certificate on first request (give it ~30s).

## 6. (Optional) Load demo data

```bash
docker compose -f docker-compose.prod.yml exec backend \
  python manage.py seed_demo --force
# demo@turbo.ai / demo12345
```

## 7. Verify

- App:    https://notes.cardenas.pe
- API:    https://notes.cardenas.pe/api/v1/
- Docs:   https://notes.cardenas.pe/api/docs
- Health: https://notes.cardenas.pe/api/health

## Updating after a push

```bash
cd turbo-notes && git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env up -d --build
```

## Notes

- Postgres data persists in the `postgres_data` volume; certificates in `caddy_data`.
- For higher scale, see [`../k8s/`](../k8s/) — the same containers on Kubernetes with
  horizontal autoscaling. Compose is the right tool at this size; Kubernetes is the
  documented path when traffic demands it.
