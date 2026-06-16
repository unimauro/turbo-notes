# Security

How Turbo Notes addresses the **OWASP Top 10 (2021)**, honestly — what's covered, and
where the gaps are. The bias is to do the right thing at this scope and to *name* the
tradeoffs rather than hide them.

| # | Risk | Posture | Where |
|---|---|---|---|
| **A01** | Broken Access Control | **Covered** | Every notes query starts from `Note.objects.filter(owner=request.user)` in `get_queryset` — another user's note id returns **404, not 403** (no existence leaking). `IsAuthenticated` is the global default permission; only register/token/health and the AI *availability* probes are public. `category_id` writes are validated against existing categories. |
| **A02** | Cryptographic Failures | **Covered** | HTTPS end-to-end (Caddy + Let's Encrypt, auto-renew). Passwords hashed with Django's PBKDF2. JWTs signed with `DJANGO_SECRET_KEY` (from env, never committed). In prod: HSTS, `SESSION_COOKIE_SECURE`, `CSRF_COOKIE_SECURE`. The session-based Django admin is protected by `CsrfViewMiddleware`. **Tradeoff named:** access/refresh tokens live in `localStorage` (XSS-exposed) rather than `httpOnly` cookies — documented in the README, contained to two files, on the roadmap. |
| **A03** | Injection | **Covered** | All DB access via the Django ORM (no raw SQL). Input validated by DRF serializers; `?ordering=` is constrained to an allow-list, `?category=` is coerced and ignored if non-numeric. Output rendered by React (auto-escaped); the only `dangerouslySetInnerHTML` is a static, dependency-free theme-init script — no user data. |
| **A04** | Insecure Design | **Covered** | Right-sized architecture (no needless surface). **Rate limiting** on the abusable paths (below). AI features degrade gracefully and can't become a forced cost or single point of failure. |
| **A05** | Security Misconfiguration | **Covered** | `DEBUG=False` in prod, `ALLOWED_HOSTS` pinned to the domain, CORS restricted to the known origin (no wildcard). Security headers set when not `DEBUG`: HSTS (1y, preload), `SECURE_CONTENT_TYPE_NOSNIFF`, `X-Frame-Options: DENY` (Django default), `SECURE_PROXY_SSL_HEADER` for the Caddy hop. No default credentials; the dev-only compose secret is clearly labelled. |
| **A06** | Vulnerable / Outdated Components | **Covered** | Dependencies pinned; **Dependabot** opens weekly update + security PRs (pip, npm, Actions), each gated by CI. `npm audit` is **clean — 0 vulnerabilities**: the transitive *moderate* advisories (`postcss`, `js-yaml`) are pinned forward via npm `overrides`. **Deliberate hold:** Django stays on **5.2 LTS** (security support to 2028) rather than chasing the non-LTS 6.0 — stability over latest-major, by design. |
| **A07** | Identification & Auth Failures | **Covered** | JWT auth (simplejwt), 30-min access / 7-day refresh. Django's 4 password validators on register. **Login + register are rate-limited to 10/min per IP** to blunt brute force. Email-as-username invariant enforced (lowercased, case-insensitive duplicate check) in `RegisterSerializer`. **Not in scope:** MFA, account lockout, email verification — noted as future. |
| **A08** | Software & Data Integrity Failures | **Covered** | CI runs lint + tests + build on every push (coverage gate). **CodeQL** static analysis (TypeScript + Python) runs on every PR + weekly — initial findings were remediated (see *Static analysis & remediation* below). Multi-stage Docker images, non-root containers. No untrusted deserialization (JSON via DRF only). |
| **A09** | Security Logging & Monitoring | **Mostly** | **Auth audit log** (`apps.audit.AuthEvent` — login/register events with IP) and **AI usage tracking** (`AiUsageEvent` — every transcribe/speak/assist call, success/failure), both persisted and browsable in the Django admin. Provider/exception errors are logged server-side (never echoed to clients). Product analytics via Google Analytics (opt-in, env-gated); app logs to stdout (captured by Docker). **Remaining:** no SIEM/alerting — Sentry (free tier) wired behind `SENTRY_DSN` is the next layer. |
| **A10** | Server-Side Request Forgery (SSRF) | **Covered** | The only outbound call is to OpenAI, and the endpoint (`OPENAI_BASE_URL`) is **server-configured via env, never user-supplied** — users send text/audio, not URLs. No fetch-by-user-URL anywhere. |

## Rate limiting (A04 / A07)

Scoped throttles via DRF `ScopedRateThrottle`:

| Scope | Limit | Endpoints | Why |
|---|---|---|---|
| `auth` | 10/min per IP | `POST /auth/token/`, `POST /auth/register/` | Brute-force / credential-stuffing resistance |
| `ai` | 20/min per user | `POST /transcribe/`, `POST /speak/` | Caps OpenAI cost abuse from a compromised or hostile account |

(The AI *availability* probes — `GET /transcribe/`, `GET /speak/` — are unthrottled and leak no secrets.)

## Input limits

- Audio upload (`/transcribe/`) capped at **25 MB** with content-type validation.
- TTS text (`/speak/`) capped at **4 000 chars**; the voice arg is validated against an allow-list.

## Static analysis & remediation

CodeQL (code scanning) and Dependabot run on the repo. The initial findings were triaged and fixed — a closed loop, not just enabled-and-ignored:

| Finding | Severity | Fix |
|---|---|---|
| `py/csrf-protection-disabled` | High | Added `CsrfViewMiddleware` — protects the session-based Django admin. The JWT REST API is unaffected (no `SessionAuthentication`; DRF views are `csrf_exempt`). |
| `py/stack-trace-exposure` (×3) | Medium | The AI endpoints (transcribe/speak/assist) no longer return `str(exc)`. They reply with a fixed generic message and log the real exception **server-side**, so provider internals never reach the client. |
| `postcss` XSS, `js-yaml` DoS (transitive npm) | Moderate | Pinned forward via npm `overrides` (`postcss ^8.5.10`, `js-yaml ^4.1.2`) → `npm audit` clean (19 → 0). |

## Secrets

- No secrets are committed — verified. `OPENAI_API_KEY`, `DJANGO_SECRET_KEY`, DB password
  and the analytics id live only in the server's `.env` (gitignored). `.env.example`
  documents the variables with empty values. Upstream errors never echo the API key.

## Reporting

For a real deployment, security issues would go to a private channel rather than a public
issue. This is a hiring-challenge project; the analysis above is part of the deliverable.
