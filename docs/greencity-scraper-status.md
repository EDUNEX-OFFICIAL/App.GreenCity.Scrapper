# Green City Scraper — Project Status (Pre-Optimization)

**Portal:** `http://app.greencity.org.in` (Green City Muzaffarpur admin ERP)  
**Date:** 2026-06-21  
**Purpose:** Context-gathering pass before speed optimization (target: ~20 records/min → 60/sec, modeled on Bihar KhananSoft fixes).  
**Scope:** No optimization changes in this document — code inspection and architecture only.

---

## SECTION 1 — Architecture & tech stack

### 1.1 Package / folder location

| Component | Path (relative to repo root `GreenCityERP/`) |
|-----------|-----------------------------------------------|
| Monorepo root | `.` |
| Admin module scraper app | `apps/scraper/` |
| Genealogy / BP harvest worker entry | `apps/scraper/src/genealogy-index.ts` |
| Shared scraper engine | `packages/scraper-core/` |
| Job queues (BullMQ) | `packages/queue/` |
| DB layer (Prisma) | `packages/db/` |
| Config, module registry, selectors | `packages/shared/` |
| Live status API | `apps/api/src/app/api/scrape/live/route.ts` |
| Docker orchestration | `docker-compose.yml` |

This is a **pnpm + Turbo monorepo** (`packageManager: pnpm@10.28.2`, Node ≥ 20).

### 1.2 HTTP approach

**Primary: Playwright 1.52.0 (Chromium browser automation).**

Used for:

- Admin login and all admin report/grid scraping
- BP panel access (admin “Settings → Panel” impersonation **or** direct BP login)
- Genealogy tree rendering (orgchart DOM + Bootstrap modal parsing)
- ASP.NET WebForms pagination via in-page `form.submit()` postbacks

**Secondary (prototype, not production-configured):** raw `fetch()` HTTP harvest for genealogy trees when `GENEALOGY_HTTP_TREE_URL` + cookie are set (`packages/scraper-core/src/http-harvest.ts`). Falls back to Playwright when unset or parse fails.

**Why Playwright over plain HTTP today:**

1. Portal is **ASP.NET WebForms** — grids paginate via `__VIEWSTATE` / `__EVENTTARGET` postbacks (`apps/scraper/src/webforms/playwright.ts`).
2. Genealogy UI is **client-rendered orgchart** with click-to-open modals; tree data is not exposed as a simple public REST API in the current deployment.
3. BP access often requires **opening a new browser tab** from admin modal (“Click Here”) or cookie-based BP session — both are browser-native flows.
4. HTTP harvest is Phase 10 work-in-progress; `GENEALOGY_HTTP_TREE_URL` is empty in `docker-compose.yml`.

There is **no Selenium/Puppeteer** — only Playwright.

### 1.3 Language / runtime

- **TypeScript** (ES modules, `"type": "module"`)
- **Node.js ≥ 20**
- Build: `tsc` per package; scraper copies `dom-grid.browser.js` into `dist/`
- API: **Next.js** (`apps/api/`)

### 1.4 Queue system

**BullMQ** on **Redis** (`ioredis`).

| Queue name | Constant | Worker file | Purpose |
|------------|----------|-------------|---------|
| `greencity-module-scrape` | `QUEUE_NAME` | `apps/scraper/src/worker.ts` | Admin module jobs |
| `greencity-genealogy-scrape` | `GENEALOGY_QUEUE_NAME` | `apps/scraper/src/genealogy-worker.ts` | Genealogy batch coordinator + per-BP jobs |
| `greencity-bp-harvest` | `BP_HARVEST_QUEUE_NAME` | `apps/scraper/src/harvest-worker.ts` | Combined profile + genealogy per BP (when flag on) |

**Admin module worker config** (`apps/scraper/src/worker.ts` lines 29–42):

```typescript
concurrency: cfg.scraperConcurrency,  // default 2, env SCRAPER_CONCURRENCY
limiter: { max: cfg.scraperConcurrency, duration: cfg.scraperDelayMs },
lockDuration: 3_600_000,
maxStalledCount: 5,
```

**Genealogy / harvest worker config** (`genealogy-worker.ts` / `harvest-worker.ts`):

```typescript
concurrency: Number.parseInt(process.env.GENEALOGY_CONCURRENCY ?? '15', 10),
lockDuration: 3_600_000,
maxStalledCount: 5,
// No BullMQ limiter on genealogy queue
```

**Job retry defaults:**

- Admin queue: 3 attempts, exponential backoff 5s (`packages/queue/src/index.ts`)
- Genealogy / harvest: 2 attempts, backoff 10s
- Backfill bulk enqueue: staggered `delay: i * 2000` per job

**Scheduling:** Hourly cron tick in `apps/scraper/src/index.ts` enqueues scheduled modules between 02:00–05:00; `ModuleSchedule` rows in Postgres.

**Docker genealogy service** (`docker-compose.yml` → `genealogy-scraper`):

| Env var | Value |
|---------|-------|
| `GENEALOGY_CONCURRENCY` | 25 |
| `SCRAPER_DELAY_MS` | 200 |
| `SCRAPER_BROWSER_POOL` | true |
| `GENEALOGY_AUTH_MODE` | direct_login |
| `BP_HARVEST_QUEUE` | true |
| `SCRAPER_ADMIN_CONTEXT` | false |

### 1.5 Database & schema

**PostgreSQL 15** via **Prisma 6** (`packages/db/prisma/schema.prisma`).  
Schemas: `ingest`, `system`.

#### Core ingest tables

```prisma
model ScrapeRun {
  id            String          @id @default(cuid())
  moduleKey     String
  portal        Portal          // admin | bp
  bpCode        String?
  status        ScrapeRunStatus // pending|running|completed|failed|partial|cancelled
  startedAt     DateTime?
  finishedAt    DateTime?
  rowCount      Int             @default(0)
  rowsInserted  Int             @default(0)
  rowsUpdated   Int             @default(0)
  error         String?
  metadata      Json?
  // relations: rawRows, failures
  @@schema("ingest")
}

model RawModuleRow {
  id          String    @id @default(cuid())
  moduleKey   String
  portal      Portal
  bpCode      String?
  rowJson     Json
  rowHash     String    @unique
  firstSeenAt DateTime  @default(now())
  lastSeenAt  DateTime  @default(now())
  scrapeRunId String
  @@schema("ingest")
}

model GenealogyNode {
  id            String            @id @default(cuid())
  bpCode        String
  bpName        String?
  uid           String?
  treeType      GenealogyTreeType // sponsor | binary
  modalData     Json              @default("{}")
  childrenJson  Json              @default("[]")
  scrapeRunId   String
  scrapedAt     DateTime          @default(now())
  @@unique([bpCode, treeType])
  @@schema("ingest")
}

model GenealogyEdge {
  id           String            @id @default(cuid())
  parentBpCode String
  childBpCode  String
  treeType     GenealogyTreeType
  leg          GenealogyLeg      // left|right|sponsor|unknown
  scrapeRunId  String
  @@unique([parentBpCode, childBpCode, treeType])
  @@schema("ingest")
}

model BpSession {
  bpCode            String          @unique
  storageStatePath  String
  source            BpSessionSource // panel | direct_login
  lastValidatedAt   DateTime?
  @@schema("ingest")
}
```

**Genealogy write path:** `upsertGenealogyResults()` in `packages/db/src/genealogy.ts` — single Prisma `$transaction` batching all node + edge upserts for one BP job.

**Admin row write path:** `upsertModuleRows()` in `packages/db/src/upsert.ts` — **one row at a time** (findUnique + create/update loop).

---

## SECTION 2 — Auth & session handling

### 2.1 Login model

**Fully automated** — credentials from environment variables (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `BP_USERNAME`, `BP_PASSWORD` in `.env.example`). No hardcoded live passwords in source.

**Session persistence:** Playwright `storageState` JSON files under `STORAGE_STATE_DIR` (default `./.data/sessions`):

- `admin.json` — admin portal session
- `bp-{bpCode}.json` — per-BP cached sessions

**Manual renewal CLI:** `pnpm --filter @greencity/scraper renew:session` → `apps/scraper/src/cli-renew-session.ts` deletes stale `admin.json`, re-logs in, verifies BP list grid.

### 2.2 Framework & login request structure

**Yes — ASP.NET WebForms**, same family as Bihar KhananSoft.

Admin login (`packages/scraper-core/src/session-manager.ts` lines 102–126):

- URL: `{ERP_BASE_URL}/_admin/Login.aspx`
- Method: browser form fill + submit (not raw HTTP POST in production path)
- Fields located by Playwright selectors:
  - Username: `input[type="text"], input[name*="User" i]`
  - Password: `input[type="password"]`
  - Submit: `input[type="submit"], button[type="submit"]`
- Content-Type on real wire: `application/x-www-form-urlencoded` (standard ASP.NET form post)
- Hidden fields on subsequent pages: `__VIEWSTATE`, `__EVENTVALIDATION`, `__VIEWSTATEGENERATOR`, `__EVENTTARGET`, `__EVENTARGUMENT` (parsed in `packages/shared/src/webforms/index.ts`)

**Illustrative login POST shape (credentials redacted):**

```
POST /_admin/Login.aspx HTTP/1.1
Content-Type: application/x-www-form-urlencoded

__VIEWSTATE=<redacted>&
__VIEWSTATEGENERATOR=<redacted>&
__EVENTVALIDATION=<redacted>&
ctl00$MainContent$txtUserName=<ADMIN_USERNAME>&
ctl00$MainContent$txtPassword=<ADMIN_PASSWORD>&
ctl00$MainContent$btnLogin=Login
```

(Field names are representative; actual `ctl00$...` IDs should be confirmed via `inspect:genealogy` or DevTools.)

**BP direct login** (`apps/scraper/src/session/panel.ts` lines 167–176):

- URL: `{ERP_BASE_URL}/_bp/Login.aspx`
- Username field filled with **BP code**; password from BP list row or env fallback.

### 2.3 Session lifetime & expiry handling

- **No explicit TTL documented in code.** Sessions are cookie-based ASP.NET auth cookies in `storageState`.
- **Automatic re-login:** `ensureAdminSession()` and `withAdminPage()` detect login page URL (`/Login.aspx`) or visible password field → call `loginAdmin()` → save new `storageState`.
- **Admin context refresh:** When `SCRAPER_ADMIN_CONTEXT=true`, `AdminContextManager` re-navigates to BP list every **15 minutes** and re-logs if needed (`packages/scraper-core/src/admin-context.ts`).
- **Failure mode:** If auto re-login fails, job throws; `cli-renew-session` exists for manual recovery.

### 2.4 Anti-automation vs Bihar

| Measure | Green City | Notes |
|---------|------------|-------|
| ASP.NET ViewState / postback | Yes | Same as Bihar |
| CSRF tokens | ViewState/EventValidation | Standard WebForms, not separate CSRF header |
| Captcha | **Not observed in code paths** | No captcha handling in login or scrape flows |
| Rate limiting | Unknown server-side | Client-side artificial delays exist (see §4) |
| Admin panel impersonation | **Green City-specific** | Must open BP via admin grid → Settings → Panel modal |
| Orgchart + modal UI | **Green City-specific** | Genealogy requires DOM interaction or undiscovered XHR |

---

## SECTION 3 — What data is being scraped

### 3.1 Data types & URL patterns

#### A. Admin portal modules (~90 reports)

Registry: `packages/shared/src/modules/admin-registry.ts` + URL map `packages/shared/src/modules/admin-urls.ts`.

All admin URLs follow: `{ERP_BASE_URL}/_admin{path}`

**Wave 1 (pilot) modules:**

| moduleKey | Label | URL path |
|-----------|-------|----------|
| `master_bank` | Bank | `/master/BankDetails.aspx` |
| `bp_list` | BP List | `/membermanagement/AdminMemberList.aspx` |
| `sale_list` | Sale List | `/sales/BookingPlotList.aspx` |
| `accounting_transactions` | Accounting Transactions | `/accountingoperation/transactions.aspx` |
| `neft_list` | NEFT List | `/memberpayout/NEFTList.aspx` |

**Full registry:** 90 `mod(...)` entries covering Accounts Operation, Sale Operation, BP Management, BP Payout, Banking, Master, Raw Management, Sale Report, Administrator, Finder & Editor, Joining Pin, etc. See `ADMIN_DIRECT_URLS` for every path.

#### B. BP portal — genealogy (current performance focus)

| Data | BP URL path | Full URL pattern |
|------|-------------|------------------|
| Sponsor genealogy tree | `/team/TreeSponsor.aspx` | `{ERP_BASE_URL}/_bp/team/TreeSponsor.aspx` |
| Binary genealogy tree | `/team/TreeBinary.aspx` | `{ERP_BASE_URL}/_bp/team/TreeBinary.aspx` |

Extractor: `apps/scraper/src/extractors/genealogy-tree.ts`  
Per BP job scrapes **both trees** (root node modal + direct children snapshot).

#### C. BP harvest modules (optional combined job)

| Module | What it captures |
|--------|------------------|
| `profile` | Page title, heading, welcome text (`packages/scraper-core/src/modules/profile-module.ts`) |
| `genealogy` | Sponsor + binary tree snapshots |

### 3.2 Pagination mechanisms

| Data type | Pagination |
|-----------|------------|
| Most admin grids (`paginated-grid`) | ASP.NET GridView `__doPostBack` / `Page$N` via `triggerPostBack()` |
| `bp_list` | `pagingMode: 'inline-grid'`, `maxPages: 1769`, chunked 1–600 / 601–1200 / 1201–1769 in sequential orchestrator |
| Report-filter modules | Date/month/year filter loops + inner grid pagination |
| Genealogy trees | **Single page per tree** (orgchart); binary tree uses date filter bar (wide range 2010–2030) then one snapshot |
| Export-first modules | XLSX download path in `extractors/export-xlsx.ts` |

### 3.3 Total record estimates

| Dataset | Estimate | Source |
|---------|----------|--------|
| BP list rows | **~1769 pages** configured (`maxPages: 1769`); total BPs ≈ tens of thousands (page size × pages — exact total from portal paging label `Results X - Y Of Z`) | Module config |
| Genealogy nodes | **2 per BP** (sponsor + binary) when complete | `getCompletedBpCodes()` logic |
| Admin raw rows | Up to **90 modules × their grid rows** | Registry count |
| Live DB counts | **Not queried in this pass** (Postgres/Docker not reachable in audit environment) | — |

### 3.4 Known data-quality quirks

Documented in code / ops notes:

1. **Garbage grid detection** — pagination widget mistaken for data grid; run marked `partial` (`apps/scraper/src/extractors/grid.ts`, `isGarbageGrid()`).
2. **BP list HTML noise** — filters `&nbsp;`, `>>`, numeric-only pseudo-IDs (`packages/db/src/genealogy.ts` `loadAllBpListEntries()`).
3. **Deferred root BPs** — `vistaar`, `vistaarcity01`, etc. scraped last (`GENEALOGY_DEFER_BP_CODES`).
4. **Binary tree date filter** — requires wide date range or tree may be incomplete (`applyBinaryDateFilters()`).
5. **Orgchart fallback** — if direct children parse fails, uses all visible nodes minus root (`genealogy-tree.ts` lines 277–279).
6. **Phantom / blank pages** — not explicitly logged; paging loop breaks on `isPagingComplete()` or empty/garbage grid.
7. **src vs dist drift** — was a production issue; Phase 0 reconciled (`docs/phase-0-reconcile-report.md`).

---

## SECTION 4 — Current performance bottleneck (~20/min)

> **Record unit:** For genealogy throughput, ops docs and live API use **BP jobs/min** (`bpPerMin`). One BP job produces **2 `GenealogyNode` rows** (sponsor + binary) plus edges. User-stated **~20 records/min** is treated as **~20 BP completions/min** (~40 genealogy nodes/min). Target **60/sec** = **3,600 BP jobs/min** if interpreted literally.

### 4.1 Core scraping loop (genealogy — primary bottleneck)

**Queue worker** (`apps/scraper/src/genealogy-worker.ts`):

```typescript
const worker = new Worker<GenealogyJobPayload>(
  GENEALOGY_QUEUE_NAME,
  async (job) => {
    if (job.data.moduleKey === 'genealogy_batch') {
      await runGenealogyBatchJob(job.data);  // coordinator only — enqueues BP jobs
    } else {
      await runGenealogyBpJob(job.data);     // actual per-BP scrape
    }
  },
  { concurrency, lockDuration: 3_600_000, maxStalledCount: 5 },
);
```

**Per-BP job** (`apps/scraper/src/genealogy-runner.ts`):

```typescript
await withBpPanel(session, bpCode, async (bpPage) => {
  const [result] = await genealogyMetrics.time('navigation_ms', () =>
    runBpModules(bpPage, ctx, ['genealogy'], moduleRegistry),
  { bpCode });
  await genealogyMetrics.time('db_upsert_ms', async () => {
    await upsertGenealogyResults({ nodes: ..., edges: ... });
  }, { bpCode });
}, { uid, bpName, password });
```

**Sequential module execution within one BP** (`packages/scraper-core/src/bp-harvest.ts`):

```typescript
for (const name of moduleNames) {
  const mod = registry.get(name);
  results.push(await mod.execute(bpPage, ctx));  // profile then genealogy — sequential
}
```

**Per-tree scrape** (`apps/scraper/src/extractors/genealogy-tree.ts`):

```typescript
export async function scrapeBothGenealogyTrees(page, rootBpCode) {
  const sponsor = await scrapeGenealogyTree(page, 'sponsor', rootBpCode);
  const binary = await scrapeGenealogyTree(page, 'binary', rootBpCode);
  return { nodes: [...sponsor.nodes, ...binary.nodes], edges: [...] };
}
```

Each `scrapeGenealogyTree` tries HTTP first, then Playwright: navigate → wait orgchart → click root node → parse modal → parse children.

**Admin grid loop** (separate path, for `bp_list` etc.) — `apps/scraper/src/extractors/grid.ts` lines 103–152: sequential page loop with postback + `jitteredDelay` between pages.

### 4.2 End-to-end timing (one BP genealogy record)

**Live timing not captured in this audit** (Docker/portal/DB unavailable). Instrumentation exists via structured logs:

| Metric key | What it measures | File |
|------------|------------------|------|
| `genealogy.login_ms` | BP panel open / direct login | `session/panel.ts` |
| `genealogy.navigation_ms` | Full `runBpModules` | `genealogy-runner.ts` |
| `genealogy.tree_extract_ms` | Both trees | `genealogy-module.ts` |
| `genealogy.db_upsert_ms` | Prisma transaction | `genealogy-runner.ts` |
| `genealogy.harvest_ms` | Combined harvest path | `bp-harvest-runner.ts` |

**Estimated breakdown at ~20 BP/min (≈3 s effective per BP slot at concurrency 25):**

| Phase | Estimate | Driver |
|-------|----------|--------|
| Auth / panel open | 1–8 s (cached session faster; admin panel slower) | Playwright navigation, BP search + modal |
| Sponsor tree | 2–5 s | `gotoGenealogyTree` + orgchart wait + modal click |
| Binary tree | 2–6 s | + date filter + search button |
| Parse | 50–300 ms | In-page `evaluate()` |
| DB upsert | 50–200 ms | Batched transaction (2 nodes + edges) |
| Artificial delays | 200–800 ms/job | `jitteredDelay` (see §4.3) |

**Observed throughput API** (`apps/api/src/app/api/scrape/live/route.ts`): computes `bpPerMin` from completed `genealogy_bp` / `bp_harvest` runs in last 5 minutes; exposes `etaMinutes`, queue depth, `workerCapacity`.

### 4.3 Artificial delays

| Location | Delay | Config |
|----------|-------|--------|
| `packages/shared/src/config.ts` | `jitteredDelay(baseMs)` = base + up to 30% random | `SCRAPER_DELAY_MS` (default **1500**, docker genealogy **200**) |
| `packages/scraper-core/src/navigation.ts:47-48` | `max(50, scraperDelayMs / 2)` after each tree navigation | Half delay per tree |
| `packages/scraper-core/src/navigation.ts:19` | Full `scraperDelayMs` per sidebar click | When sidebar fallback used |
| `apps/scraper/src/session/panel.ts:65` | Full delay after BP list search | Admin panel auth path |
| `apps/scraper/src/runner.ts:96` | Full delay after admin nav | Admin modules |
| `apps/scraper/src/extractors/grid.ts:87,95,133,151` | Full delay between pagination pages | Admin grids |
| `packages/queue/src/index.ts:54` | `i * 2000` ms stagger | Backfill bulk enqueue |
| Admin BullMQ limiter | `duration: scraperDelayMs` | Rate-limits admin worker |

**No `sleep()` in hot genealogy path except `jitteredDelay` and retry backoff.**

### 4.4 Browser instance lifecycle

| Mode | Behavior |
|------|----------|
| `SCRAPER_BROWSER_POOL=true` (default) | **One Chromium per worker process**, shared via `BrowserPool`; **new BrowserContext per job**; context closed after job (`session-manager.ts`, `browser-pool.ts`) |
| `SCRAPER_BROWSER_POOL=false` | New browser per `SessionManager`, closed in `session.close()` |
| Admin context mode | **Long-lived admin Page**; BP tabs opened/closed per job (`admin-context.ts`) |

**Not** one new browser per record — pool reuses browser; contexts/pages are per job.

### 4.5 DB write pattern

| Path | Pattern |
|------|---------|
| Genealogy | **Batched** — `prisma.$transaction([...upserts])` per BP |
| Admin `RawModuleRow` | **One row at a time** — loop with `findUnique` + create/update (`upsert.ts` lines 22–52) |
| Per-page streaming (`upsertPerPage: true`) | Batch = one grid page’s rows per upsert call, still row-by-row inside |

### 4.6 Concurrency summary

| Layer | Concurrency |
|-------|-------------|
| Genealogy BP jobs | `GENEALOGY_CONCURRENCY` (15 default, 25 in docker) — **parallel BullMQ jobs** |
| Admin module jobs | `SCRAPER_CONCURRENCY` (2 default, 3 in docker scraper) + limiter |
| Modules inside one BP job | **Sequential** (`runBpModules` for loop) |
| Sponsor + binary trees | **Sequential** (`scrapeBothGenealogyTrees`) |
| BP list sequential orchestrator | Chunks A/B/C run **sequentially** per chunk job |
| HTTP harvest fallback | Would be per-tree `fetch()` but not enabled |

---

## SECTION 5 — Known issues / historical failures

### 5.1 Partial / failed runs

From code and docs:

- **Stale runs:** Jobs `running` > 15 min marked `failed` (`packages/db/src/reconcile.ts`).
- **Pending never picked up:** > 60 min → failed (“queue may be offline”).
- **Admin login failure:** Throws if still on login page after submit.
- **BP not found on admin list:** After search + session renew retry (`panel.ts`).
- **Garbage grid:** Module completes as `partial` with column warnings.
- **src/dist mismatch:** Caused regression before Phase 0 reconcile (see `docs/phase-0-reconcile-report.md`).

### 5.2 Retry mechanisms

| Layer | Retry |
|-------|-------|
| BullMQ | 2–3 attempts, exponential backoff |
| `withRetry()` | Generic 3× exponential (`packages/scraper-core/src/retry.ts`) — used selectively |
| Auth fallbacks | `GENEALOGY_AUTH_MODE=auto`: admin panel → direct login; cached session → admin panel |
| HTTP harvest | Returns `null` → Playwright fallback (not a retry, alternate path) |
| Admin context | `recover()` on BP open failure |

### 5.3 Logging / monitoring

| Mechanism | Details |
|-----------|---------|
| Structured logs | **pino** via `createLogger()` — includes timing metrics |
| Failure HTML | Saved to `FAILURE_HTML_DIR/{runId}.html` |
| Live dashboard API | `GET /api/scrape/live` — worker heartbeat, queue counts, `bpPerMin`, ETA |
| Redis heartbeat | `setWorkerHeartbeat` / `setGenealogyWorkerHeartbeat` every 30s |
| DB audit | `ScrapeRun`, `ScrapeFailure` tables |

**Not fire-and-forget** when docker stack + API are running; no external APM observed.

---

## SECTION 6 — Git / deployment state

### 6.1 Git status

- **`/srv/GreenCityERP` is not a git repository** (`git status` → `fatal: not a git repository`).
- No `.git` at `/srv` root either.
- **Cannot assess:** uncommitted changes, branch, remote, commit history.

### 6.2 Deployment configuration

**Intended deployment:** Docker Compose on VPS (`docker-compose.yml`):

| Service | Command | Role |
|---------|---------|------|
| `postgres` | — | Port 5435 |
| `redis` | — | Port 6380 |
| `scraper` | `node apps/scraper/dist/index.js` | Admin module worker |
| `genealogy-scraper` | `node apps/scraper/dist/genealogy-index.js` | Genealogy + harvest workers |
| `api` | Next.js | Port 3010, live status |

**Current audit host:** Docker daemon **not running**; `.data/` sessions dir **absent**; live DB counts not available.

### 6.3 Where it runs

- Designed for **VPS / server** via Docker (persistent volumes `scraper_data`, `postgres_data`).
- Can run **locally** via `pnpm dev:scraper` or `pnpm --filter @greencity/scraper start:genealogy`.
- Manual CLIs: `inspect:genealogy`, `inspect:http-harvest`, `renew:session`, `run:bp-remaining`.

---

## Appendix A — Key environment variables

From `.env.example`:

```
SCRAPER_CONCURRENCY=2
SCRAPER_DELAY_MS=1500
GENEALOGY_CONCURRENCY=25
GENEALOGY_AUTH_MODE=direct_login
GENEALOGY_BP_ORDER=leaf_first
SCRAPER_BROWSER_POOL=true
SCRAPER_BLOCK_RESOURCES=true
SCRAPER_ADMIN_CONTEXT=false
BP_HARVEST_QUEUE=true
GENEALOGY_HTTP_TREE_URL=          # empty — HTTP path disabled
GENEALOGY_HTTP_COOKIE=
```

## Appendix B — Optimization planning notes (for next pass only)

Do **not** implement yet — observations for the 60/sec target:

1. **Biggest sequential chains:** BP auth → sponsor tree → binary tree → sequential modules; mirrors pre-fix Bihar pattern.
2. **Artificial delay still present** even at 200 ms — adds up across navigations.
3. **Admin row upserts are row-by-row** — bottleneck for `bp_list` scale.
4. **HTTP harvest stub ready** but endpoint not discovered/configured.
5. **Platform flags exist** (`SCRAPER_ADMIN_CONTEXT`, `BP_HARVEST_QUEUE`, browser pool) — rollout stages documented in `docs/bp-harvest-platform-implementation.md` (20→35→60→100+ BP/min targets).
6. **Bihar-style wins likely:** single job per BP for full tree, zero delay, batch DB, async concurrency — several pieces partially built but not fully realized at 60/sec.

---

*Document generated from static code analysis. Re-run live timing against `/api/scrape/live` and Postgres once stack is up for empirical `bpPerMin` confirmation.*
