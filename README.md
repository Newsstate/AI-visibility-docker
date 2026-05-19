# AI Visibility — Production Full-Stack App

Track your brand's visibility across **ChatGPT, Perplexity, Gemini, Claude, and Google AI Overview**.

## Stack

| Layer      | Tech                                  |
|------------|---------------------------------------|
| Frontend   | React 18 + Vite + Tailwind CSS        |
| Backend    | Node.js (ESM) + Express               |
| Queue      | BullMQ (Redis-backed async jobs)      |
| Database   | PostgreSQL 16                         |
| Cache      | Redis 7                               |
| AI APIs    | OpenAI, Anthropic, Google GenAI, Perplexity |
| SERP       | SerpAPI (AI Overview)                 |
| Auth       | JWT (30-day tokens)                   |
| Deploy     | Docker Compose                        |

---

## Quick Start (Docker)

```bash
# 1. Clone and enter
git clone <your-repo>
cd ai-visibility

# 2. Copy env and fill in API keys
cp backend/.env.example backend/.env
# Edit backend/.env with your API keys

# 3. Start everything
docker-compose up --build

# App:     http://localhost:3000
# API:     http://localhost:4000
# DB:      localhost:5432
# Redis:   localhost:6379
```

---

## Local Dev Setup

### Backend

```bash
cd backend
npm install

# Copy and fill env
cp .env.example .env

# Run Postgres + Redis (Docker)
docker run -d -p 5432:5432 -e POSTGRES_DB=ai_visibility -e POSTGRES_USER=aiv -e POSTGRES_PASSWORD=aiv_secret postgres:16-alpine
docker run -d -p 6379:6379 redis:7-alpine

# Migrate DB
npm run db:migrate

# Start dev server (with auto-reload)
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:3000
```

---

## Required API Keys

| Key                  | Where to get                                   | Used for                  |
|----------------------|------------------------------------------------|---------------------------|
| `OPENAI_API_KEY`     | platform.openai.com                            | ChatGPT visibility checks |
| `ANTHROPIC_API_KEY`  | console.anthropic.com                          | Claude checks + AI analysis|
| `GOOGLE_AI_API_KEY`  | aistudio.google.com                            | Gemini checks             |
| `PERPLEXITY_API_KEY` | perplexity.ai/settings/api                     | Perplexity checks         |
| `SERPAPI_KEY`        | serpapi.com                                    | Google AI Overview checks |

> **Minimum viable**: just `ANTHROPIC_API_KEY` works for AI analysis/prompt generation. Add others to check those platforms.

---

## App Flow

```
User adds URL
    ↓
Website crawled (Playwright/axios + cheerio)
    ↓
Claude analyzes → extracts brand, niche, services, competitors
    ↓
Claude generates 16 prompts (4 categories × 4)
    ↓
User can add manual keywords
    ↓
User launches check → BullMQ job queued
    ↓
Worker runs: 16 prompts × 5 platforms × 5 runs = 400 queries
    ↓
Each response scored: tier, sentiment, consistency
    ↓
GEO score calculated (weighted average)
    ↓
Claude generates recommendations
    ↓
Report dashboard rendered
```

---

## Key Files

```
backend/src/
  index.js              ← Express server + cron scheduler
  db/
    migrate.js          ← PostgreSQL schema
    pool.js             ← DB connection pool
  services/
    crawler.js          ← Website crawler (axios + cheerio)
    analyzer.js         ← Claude: niche extraction + prompt generation
    platformChecker.js  ← All 5 AI platform checkers + scoring
  workers/
    checkWorker.js      ← BullMQ worker: runs all checks
  routes/
    auth.js             ← Register / login / me
    projects.js         ← CRUD + scan SSE + launch
    reports.js          ← Dashboard data + progress SSE
    track.js            ← JS snippet click tracking

frontend/src/
  pages/
    AddWebsite.jsx      ← Step 1: URL + manual keywords + scan
    RunningChecks.jsx   ← Step 2: Live progress screen
    ReportDashboard.jsx ← Step 3: Full report (matches your design)
    Dashboard.jsx       ← Projects list
    Auth.jsx            ← Login / Register
  components/
    RankBadge.jsx       ← Tier badge (Primary/Top/Mid/Buried/Absent)
    ConsistencyPips.jsx ← 5-dot consistency indicator
    ProtectedRoute.jsx  ← Auth guard
  lib/
    api.js              ← Axios client
    store.js            ← Zustand global state
```

---

## Tracking Snippet

Install on client sites to capture real AI referral clicks:

```html
<script src="https://yourdomain.com/api/track/snippet/YOUR_SITE_ID"></script>
```

Detects referrals from: `perplexity.ai`, `chatgpt.com`, `chat.openai.com`, `gemini.google.com`, `claude.ai`, `copilot.microsoft.com`.

---

## Prompt Category System

| Cat | Description                                    | Example                              |
|-----|------------------------------------------------|--------------------------------------|
| 1   | Niche & core services (no brand)               | "best online yoga platform"          |
| 2   | Brand + service informational                  | "YogaFlow review and pricing"        |
| 3   | General niche keywords                         | "yoga for stress and anxiety"        |
| 4   | Informational + niche + service hybrid         | "which yoga app is best for back pain"|

Each prompt runs **5×** per platform for consistency scoring.

---

## GEO Score Formula

```
GEO = (ChatGPT×0.25 + Perplexity×0.25 + Gemini×0.20 + Claude×0.15 + AI Overview×0.15)

Tier scores:
  Primary   = 100
  Top pick  = 80
  Mentioned = 50
  Buried    = 20
  Absent    = 0
```

---

## Scheduled Re-checks

The backend cron runs at 6am daily and automatically re-checks projects based on their configured frequency (daily / weekly / bi-weekly / monthly).

---

## Deployment (Production)

```bash
# Set production env vars
export JWT_SECRET=$(openssl rand -hex 32)
export FRONTEND_URL=https://yourdomain.com
export OPENAI_API_KEY=sk-...
# ... other keys

docker-compose up -d --build
```

For managed deployment: backend → Railway / Render, frontend → Vercel / Netlify, DB → Supabase / Neon, Redis → Upstash.

---

## Roadmap

- [ ] PDF export (GEO audit report)
- [ ] Email digests (weekly rank changes)
- [ ] Competitor deep-dive view
- [ ] Share of AI Voice (SAV) trend tracking
- [ ] Slack / webhook alerts on rank drops
- [ ] White-label for agencies
- [ ] API access for enterprise
