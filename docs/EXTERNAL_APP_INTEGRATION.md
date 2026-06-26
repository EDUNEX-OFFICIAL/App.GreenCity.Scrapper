# GreenCityERP — External Application Integration Guide

This guide explains how **any external application** (MLM ERP, CRM, reporting tool, mobile app backend, etc.) can connect to GreenCityERP and consume scraped data from the Green City Muzaffarpur ERP portal.

GreenCityERP does **not** push data to your app. Your application **pulls** data over a versioned REST API. No direct database access is required or provided.

---

## Table of Contents

1. [How it works](#1-how-it-works)
2. [What you need before starting](#2-what-you-need-before-starting)
3. [Quick start (5 minutes)](#3-quick-start-5-minutes)
4. [Base URLs](#4-base-urls)
5. [Authentication](#5-authentication)
6. [Request & response conventions](#6-request--response-conventions)
7. [Pagination](#7-pagination)
8. [Delta sync (recommended)](#8-delta-sync-recommended)
9. [API reference](#9-api-reference)
10. [Field reference](#10-field-reference)
11. [Recommended sync schedule](#11-recommended-sync-schedule)
12. [Error handling & HTTP status codes](#12-error-handling--http-status-codes)
13. [Rate limiting](#13-rate-limiting)
14. [CORS (browser clients)](#14-cors-browser-clients)
15. [Sample integration code](#15-sample-integration-code)
16. [Troubleshooting](#16-troubleshooting)
17. [OpenAPI / Swagger](#17-openapi--swagger)
18. [For GreenCityERP operators](#18-for-greencityerp-operators)

> **New endpoints (June 2026):** See [`INTEGRATION_API_NEW_ENDPOINTS.md`](INTEGRATION_API_NEW_ENDPOINTS.md) for `/transactions`, `/sale-transactions`, `/plots`, `/modules`, and extended `/payments`.

---

## What's new (June 2026)

Extended Integration API coverage — previously only BPs, sales, payments (partial), projects, and genealogy were exposed. The following are now available:

| Endpoint | Data |
|----------|------|
| `GET /transactions` | Accounting ledger (~17k rows) |
| `GET /sale-transactions` | Sale payment ledger (~8k rows) |
| `GET /plots` | Plot modules (merged) |
| `GET /branches` | Branch master |
| `GET /banks` | Bank master |
| `GET /accounting-entities` | Accounting entities |
| `GET /modules` | Module catalog with row counts |
| `GET /modules/{moduleKey}` | Raw rows for allowlisted modules |
| `GET /payments` | Now includes 9 payment types (NEFT, receipts, BP payouts, income, etc.) |

---

## 1. How it works

```
┌─────────────────────┐     scrape      ┌──────────────────┐
│  Green City Portal  │ ──────────────► │  GreenCityERP    │
│  (source ERP)       │   (Playwright)  │  Scraper Worker  │
└─────────────────────┘                 └────────┬─────────┘
                                                 │ store
                                                 ▼
                                        ┌──────────────────┐
                                        │   PostgreSQL     │
                                        │  (scraped rows)  │
                                        └────────┬─────────┘
                                                 │ read
                                                 ▼
┌─────────────────────┐    REST + API key ┌──────────────────┐
│  Your Application   │ ◄──────────────── │  Integration API │
│  (consumer)         │    pull / sync    │  (port 3010)     │
└─────────────────────┘                   └──────────────────┘
```

1. GreenCityERP scrapes modules (BP list, sales, payments, genealogy, projects, etc.) from the source ERP.
2. Raw rows are stored in PostgreSQL and normalized by the Integration API.
3. Your application calls the Integration API on a schedule and upserts data into your own database.

**Data freshness** depends on how often GreenCityERP scrapes (configured separately) and how often your app syncs. The `updatedAt` field on each record tells you when GreenCityERP last saw that row during a scrape.

---

## 2. What you need before starting

Ask the GreenCityERP administrator for:

| Item | Example | Notes |
|------|---------|-------|
| **API base URL** | `https://greencity.example.com:3010` | Host and port where the API is deployed |
| **API key** | `gc_live_abc123...` | Shared secret — sent in every request header |
| **CORS origin** (if browser app) | `https://your-app.example.com` | Only needed for frontend calls from a browser |

The administrator must set these on the GreenCityERP server:

```env
INTEGRATION_API_KEY=your-secret-key-here
INTEGRATION_CORS_ORIGIN=https://your-app.example.com
INTEGRATION_RATE_LIMIT_POINTS=100
INTEGRATION_RATE_LIMIT_DURATION=60
```

> **Security:** Treat the API key like a password. Use HTTPS in production. Do not embed the key in public frontend code — call the Integration API from your backend.

---

## 3. Quick start (5 minutes)

### Step 1 — Verify connectivity

```bash
curl -s -H "x-api-key: YOUR_API_KEY" \
  "https://greencity.example.com:3010/api/integration/v1/health"
```

Expected response:

```json
{
  "success": true,
  "data": {
    "service": "integration-api",
    "status": "healthy",
    "timestamp": "2026-06-24T10:00:00.000Z"
  }
}
```

### Step 2 — Fetch first page of BPs

```bash
curl -s -H "x-api-key: YOUR_API_KEY" \
  "https://greencity.example.com:3010/api/integration/v1/bps?page=1&limit=10"
```

### Step 3 — Store `updatedAt` from each record

Use the maximum `updatedAt` value as your sync cursor for the next run.

### Step 4 — On the next run, use delta sync

```bash
curl -s -H "x-api-key: YOUR_API_KEY" \
  "https://greencity.example.com:3010/api/integration/v1/bps?updatedAfter=2026-06-20T10:00:00.000Z&limit=1000"
```

That is the full integration pattern: **paginate on first load, then poll with `updatedAfter`.**

---

## 4. Base URLs

| Resource | Path |
|----------|------|
| Integration API v1 | `{BASE_URL}/api/integration/v1` |
| Swagger UI (interactive docs) | `{BASE_URL}/api/docs` |
| OpenAPI JSON spec | `{BASE_URL}/api/openapi` |

Replace `{BASE_URL}` with your deployment host, e.g. `https://greencity.example.com:3010`.

Default local development URL: `http://localhost:3010`

---

## 5. Authentication

Every endpoint **except** Swagger UI and the OpenAPI spec requires authentication.

### Header

```http
x-api-key: <your-integration-api-key>
```

### Optional tracing header

```http
x-request-id: <your-uuid>
```

If omitted, the server generates one. The same value is returned in the response header `x-request-id` for log correlation.

### Unauthorized (401)

```json
{
  "success": false,
  "message": "Invalid or missing API key"
}
```

### Service not configured (503)

Returned when `INTEGRATION_API_KEY` is not set on the server:

```json
{
  "success": false,
  "message": "Integration API key not configured"
}
```

---

## 6. Request & response conventions

### HTTP methods

All integration endpoints are **GET** only. There is no write/update API — this is a read-only data export surface.

### Content type

Requests: no body required.  
Responses: `application/json`

### Success envelope (list endpoints)

```json
{
  "success": true,
  "data": [ /* array of records */ ],
  "meta": {
    "page": 1,
    "limit": 100,
    "total": 1769
  }
}
```

### Success envelope (single-resource endpoints)

```json
{
  "success": true,
  "data": { /* single object */ }
}
```

### Error envelope

```json
{
  "success": false,
  "message": "Human-readable error message",
  "errors": []
}
```

For validation errors (400), `errors` may contain structured detail.

---

## 7. Pagination

List endpoints support these query parameters:

| Parameter | Type | Default | Constraints |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Minimum `1` |
| `limit` | integer | `100` | Minimum `1`, maximum `1000` |

### Example

```
GET /api/integration/v1/bps?page=2&limit=500
```

### Pagination loop (pseudocode)

```
page = 1
repeat
  response = GET /endpoint?page={page}&limit=1000&updatedAfter={cursor}
  process(response.data)
  page = page + 1
until response.data is empty OR page * limit >= response.meta.total
```

Use `meta.total` to know how many records match the current filters. For large first-time syncs, use `limit=1000` to minimize round trips.

---

## 8. Delta sync (recommended)

Delta sync is the **primary** way to keep your application up to date. Instead of re-downloading all records, fetch only rows that changed since your last sync.

### Query parameter

| Parameter | Type | Description |
|-----------|------|-------------|
| `updatedAfter` | ISO 8601 datetime (UTC) | Return records whose `lastSeenAt` in GreenCityERP is **on or after** this timestamp |

Examples of valid values:

- `2026-06-20T10:00:00Z`
- `2026-06-20T10:00:00.000Z`

### How `updatedAt` maps to scraping

Each record includes an `updatedAt` field. This is the ISO timestamp of when GreenCityERP **last saw** that row during a scrape (`lastSeenAt`). It is **not** necessarily when the record changed in the source ERP — it reflects when our scraper observed it.

### Sync cursor workflow

```
┌─────────────────────────────────────────────────────────────┐
│  FIRST SYNC                                                 │
│  1. Call endpoint without updatedAfter                      │
│  2. Paginate through all pages                              │
│  3. Upsert each record in your DB                           │
│  4. Save max(updatedAt) as cursor for this entity type      │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  SUBSEQUENT SYNCS (every 15–30 min)                         │
│  1. Call endpoint with updatedAfter={saved cursor}          │
│  2. Paginate if needed                                      │
│  3. Upsert changed records                                  │
│  4. Update cursor to new max(updatedAt)                     │
└─────────────────────────────────────────────────────────────┘
```

### Important rules

1. Store **one cursor per entity type** (e.g. `bps`, `sales`, `payments`, `projects`).
2. Use the **maximum** `updatedAt` from processed records to advance the cursor — not the current wall-clock time.
3. Apply the **same** `updatedAfter` value across all pages in a single sync run.
4. On first sync, omit `updatedAfter` to load the full dataset.
5. All timestamps are **UTC**. Convert your local timezone before sending.

### Date range filter (sales & payments only)

In addition to `updatedAfter`, sales and payments support:

| Parameter | Type | Description |
|-----------|------|-------------|
| `from` | ISO 8601 datetime | Filter by record date ≥ `from` |
| `to` | ISO 8601 datetime | Filter by record date ≤ `to` |

These can be combined with `updatedAfter` and pagination.

---

## 9. API reference

### Endpoint overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Service health |
| `/bps` | GET | List Business Partners |
| `/bps/{bpCode}` | GET | Single BP detail |
| `/genealogy/{bpCode}` | GET | Sponsor + binary trees |
| `/sales` | GET | Sale bookings (`sale_list`) |
| `/sale-transactions` | GET | Sale payment ledger (`sale_transactions`) |
| `/transactions` | GET | Accounting ledger (`accounting_transactions`) |
| `/payments` | GET | NEFT, receipts, payouts, income (merged) |
| `/plots` | GET | Plots from multiple plot modules |
| `/branches` | GET | Branch master |
| `/banks` | GET | Bank master |
| `/accounting-entities` | GET | Accounting entity master |
| `/projects` | GET | Project master |
| `/modules` | GET | Module catalog with row counts |
| `/modules/{moduleKey}` | GET | Raw rows for allowlisted modules |

All paths are relative to `/api/integration/v1`.

### 9.1 Health check

```
GET /health
```

No query parameters.

**Response `data`:**

| Field | Type | Description |
|-------|------|-------------|
| `service` | string | Always `"integration-api"` |
| `status` | string | `"healthy"` when operational |
| `timestamp` | string | Server time (ISO 8601) |

---

### 9.2 List Business Partners

```
GET /bps
```

| Query param | Required | Description |
|-------------|----------|-------------|
| `page` | No | Page number (default `1`) |
| `limit` | No | Page size (default `100`, max `1000`) |
| `updatedAfter` | No | Delta sync cursor |
| `search` | No | Filter by name, mobile, or BP code (case-insensitive substring) |
| `uid` | No | Filter to a single ERP member UID (numeric) |

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `bpCode` | string | Business Partner ID from ERP (`BP ID` column) |
| `name` | string | BP name |
| `mobile` | string | Mobile number |
| `status` | string | Account status |
| `sponsorCode` | string | Upline/sponsor BP code |
| `joiningDate` | string | Registration date (as scraped) |
| `uid` | string? | ERP member UID — **canonical identity** when `bpCode` is duplicated |
| `password` | string? | Portal login password (as scraped from admin BP list) |
| `commissionPct` | string? | Current commission percentage |
| `updatedAt` | string | Last seen by scraper (ISO 8601) |

> **Note:** `bpCode` is not globally unique. Some members share the same `BP ID` (e.g. two rows with `bpCode=Vistaar`, UID 1 and 11). Use `uid` or `GET /bps/by-uid/{uid}` for unambiguous lookup.

**Example:**

```bash
curl -s -H "x-api-key: YOUR_KEY" \
  "https://greencity.example.com:3010/api/integration/v1/bps?search=john&page=1&limit=50"
```

---

### 9.3 Get single Business Partner

```
GET /bps/{bpCode}
GET /bps/{bpCode}?uid={uid}
GET /bps/by-uid/{uid}
```

| Path param | Description |
|------------|-------------|
| `bpCode` | Business Partner code, e.g. `Vistaar` |
| `uid` | (by-uid route) ERP member UID |

| Query param | Description |
|-------------|-------------|
| `uid` | Disambiguate when multiple members share the same `bpCode` |

**409 Conflict** when `GET /bps/{bpCode}` matches multiple `(UID, BP ID)` rows and `uid` is omitted. Response `errors[]` lists candidates: `{ uid, bpCode, name, sponsorCode, commissionPct? }`.

Returns the same fields as the list item, plus an optional `genealogy` object:

| Field | Type | Description |
|-------|------|-------------|
| `genealogy.sponsorName` | string? | Sponsor display name |
| `genealogy.registeredAt` | string? | Registration timestamp |
| `genealogy.position` | string? | Tree position |
| `genealogy.leftPoint` | string? | Left leg points |
| `genealogy.rightPoint` | string? | Right leg points |
| `genealogy.selfPoint` | string? | Self points |
| `genealogy.selfBusiness` | string? | Self business volume |
| `genealogy.totalBusiness` | string? | Total business volume |
| `genealogy.totalMembers` | string? | Total downline members |

**404** if BP code not found (or no matching `uid`).

---

### 9.4 Get BP genealogy trees

```
GET /genealogy/{bpCode}
GET /genealogy/{bpCode}?uid={uid}
GET /genealogy/by-uid/{uid}
```

Returns sponsor (unilevel) and binary (left/right) downline trees for a BP.

**409 Conflict** when `bpCode` is ambiguous and `uid` is omitted (same candidate list as `/bps/{bpCode}`).

**Response `data`:**

| Field | Type | Description |
|-------|------|-------------|
| `bpCode` | string | Root BP code |
| `uid` | string? | ERP member UID when known |
| `sponsorTree` | array | Unilevel/sponsor downline nodes |
| `binaryTree` | array | Binary left/right leg nodes |

**Tree node (`sponsorTree` / `binaryTree` items):**

| Field | Type | Description |
|-------|------|-------------|
| `bpCode` | string | Node BP code |
| `bpName` | string? | Display name |
| `leg` | string? | `"left"`, `"right"`, or `"sponsor"` |
| `children` | array | Nested nodes (recursive) |

**Example response:**

```json
{
  "success": true,
  "data": {
    "bpCode": "BP12345",
    "sponsorTree": [
      {
        "bpCode": "BP99999",
        "bpName": "Downline One",
        "leg": "sponsor",
        "children": []
      }
    ],
    "binaryTree": [
      {
        "bpCode": "BP88888",
        "bpName": "Left Leg",
        "leg": "left",
        "children": []
      },
      {
        "bpCode": "BP77777",
        "bpName": "Right Leg",
        "leg": "right",
        "children": []
      }
    ]
  }
}
```

> Genealogy is **not** paginated. Fetch per BP code. Re-fetch only BPs that changed in your latest BP delta sync.

---

### 9.5 List sales

```
GET /sales
```

| Query param | Required | Description |
|-------------|----------|-------------|
| `page` | No | Page number |
| `limit` | No | Page size (max `1000`) |
| `updatedAfter` | No | Delta sync cursor |
| `from` | No | Sale date lower bound (ISO 8601) |
| `to` | No | Sale date upper bound (ISO 8601) |

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `saleId` | string | Sale identifier |
| `bookingNo` | string | Booking number |
| `name` | string? | Customer name |
| `mobile` | string? | Customer mobile |
| `project` | string? | Project name |
| `phase` | string? | Phase |
| `plot` | string? | Plot identifier |
| `saleDate` | string? | Sale date (as scraped) |
| `totalAmount` | string? | Total amount |
| `paidAmount` | string? | Paid amount |
| `saleStatus` | string? | Sale status |
| `paymentStatus` | string? | Payment status |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original scraped key-value pairs |

---

### 9.6 List payments

```
GET /payments
```

Merges **NEFT payouts**, **sale receipts**, and **other payout/income modules** into one list. See [§9.16](#916-extended-payment-types) for all `type` values.

| Query param | Required | Description |
|-------------|----------|-------------|
| `page` | No | Page number |
| `limit` | No | Page size (max `1000`) |
| `updatedAfter` | No | Delta sync cursor |
| `from` | No | Payment date lower bound |
| `to` | No | Payment date upper bound |
| `type` | No | Filter by payment source — see [§9.16](#916-extended-payment-types) |

**Response `data[]` item (common fields):**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | `"neft"` or `"receipt"` |
| `id` | string | Record identifier |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original scraped key-value pairs |

**Additional fields for `type: "neft"`:**

| Field | Description |
|-------|-------------|
| `bpCode` | Member/BP ID |
| `name` | Payee name |
| `mobile` | Mobile number |
| `amount` | Payment amount |
| `bankName` | Bank name |
| `referenceNo` | NEFT reference |

**Additional fields for `type: "receipt"`:**

| Field | Description |
|-------|-------------|
| `saleId` | Linked sale ID |
| `receiptNo` | Receipt number |
| `name` | Customer name |
| `amount` | Receipt amount |
| `date` | Receipt date |
| `bankName` | Bank name |
| `paymentMode` | e.g. Cheque, Cash |
| `paymentStatus` | Payment status |

**Example — NEFT only:**

```bash
curl -s -H "x-api-key: YOUR_KEY" \
  "https://greencity.example.com:3010/api/integration/v1/payments?type=neft&page=1&limit=100"
```

---

### 9.7 List projects

```
GET /projects
```

| Query param | Required | Description |
|-------------|----------|-------------|
| `page` | No | Page number |
| `limit` | No | Page size (max `1000`) |
| `updatedAfter` | No | Delta sync cursor |

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Project identifier |
| `name` | string | Project name |
| `company` | string? | Company name |
| `address` | string? | Address |
| `startDate` | string? | Start date |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original scraped key-value pairs |

---

### 9.8 List accounting transactions

```
GET /transactions
```

Source module: `accounting_transactions` (~17k rows).

| Query param | Required | Description |
|-------------|----------|-------------|
| `page` | No | Page number |
| `limit` | No | Page size (max `1000`) |
| `updatedAfter` | No | Delta sync cursor |
| `from` | No | Transaction date lower bound (ISO 8601) |
| `to` | No | Transaction date upper bound (ISO 8601) |

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Transaction identifier (SrNo) |
| `voucherNo` | string? | Voucher number |
| `date` | string? | Transaction date |
| `head` | string? | Accounting head |
| `entity` | string? | Entity name |
| `amount` | string? | Debit/credit amount |
| `narration` | string? | Narration / description |
| `paymentMode` | string? | Payment mode (CASH, CHEQUE, etc.) |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original scraped key-value pairs |

---

### 9.9 List sale transactions

```
GET /sale-transactions
```

Source module: `sale_transactions` (~8k rows).

Same query parameters as `GET /transactions`.

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Transaction identifier |
| `saleId` | string? | Linked sale ID |
| `bookingNo` | string? | Booking number |
| `receiptNo` | string? | Receipt number |
| `name` | string? | Customer / payee name |
| `date` | string? | Transaction date |
| `amount` | string? | Amount |
| `paymentMode` | string? | Payment mode |
| `bankName` | string? | Bank name |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original scraped key-value pairs |

---

### 9.10 List plots

```
GET /plots
```

Merges three plot modules: `plot_list`, `registered_plot_list`, `govt_survey_plot`.

| Query param | Required | Description |
|-------------|----------|-------------|
| `page` | No | Page number |
| `limit` | No | Page size (max `1000`) |
| `updatedAfter` | No | Delta sync cursor |

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Plot identifier |
| `sourceModule` | string | Source module (`plot_list`, etc.) |
| `plotNo` | string? | Plot number |
| `project` | string? | Project name |
| `phase` | string? | Phase |
| `status` | string? | Plot status |
| `area` | string? | Area |
| `rate` | string? | Rate |
| `amount` | string? | Amount |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original scraped key-value pairs |

> **Note:** Plot modules may return empty until GreenCityERP scrapes them. Use `GET /modules` to check row counts.

---

### 9.11 List branches

```
GET /branches
```

Source module: `branch`.

| Query param | Required | Description |
|-------------|----------|-------------|
| `page` | No | Page number |
| `limit` | No | Page size (max `1000`) |
| `updatedAfter` | No | Delta sync cursor |

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Branch identifier |
| `name` | string? | Branch name |
| `address` | string? | Address |
| `city` | string? | City |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original scraped key-value pairs |

---

### 9.12 List banks

```
GET /banks
```

Source module: `master_bank`.

Same pagination params as branches.

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Bank identifier |
| `name` | string? | Bank name |
| `accountNo` | string? | Account number |
| `ifsc` | string? | IFSC code |
| `branch` | string? | Branch name |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original scraped key-value pairs |

---

### 9.13 List accounting entities

```
GET /accounting-entities
```

Source module: `accounting_entity`.

Same pagination params as branches.

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Entity identifier |
| `name` | string? | Entity name |
| `type` | string? | Entity type |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original scraped key-value pairs |

---

### 9.14 Module catalog

```
GET /modules
```

Returns every scraped module with row counts and whether a typed Integration API endpoint exists.

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `moduleKey` | string | Scraper module key |
| `rowCount` | number | Rows in database |
| `exposedOnApi` | boolean | Whether accessible via Integration API (typed or raw) |
| `typedEndpoint` | string? | Typed API path if available (e.g. `/transactions`) |

**Example:**

```bash
curl -s -H "x-api-key: YOUR_KEY" \
  "http://187.127.145.85:3010/api/integration/v1/modules"
```

---

### 9.15 Raw module rows

```
GET /modules/{moduleKey}
```

Returns paginated **raw scraped rows** for allowlisted modules not covered by a typed endpoint, or when you need every source column.

| Path param | Required | Description |
|------------|----------|-------------|
| `moduleKey` | Yes | Module key (e.g. `cash_ledger`, `registry_list`) |

| Query param | Required | Description |
|-------------|----------|-------------|
| `page` | No | Page number |
| `limit` | No | Page size (max `1000`) |
| `updatedAfter` | No | Delta sync cursor |

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `moduleKey` | string | Module key |
| `id` | string | Row identifier |
| `data` | object | Original key-value pairs from ERP |
| `updatedAt` | string | Last seen by scraper |

**Allowlisted modules** include: `cash_ledger`, `registry_list`, `raw_land`, `bp_income_summary_detail`, `finder_sales`, `epin_list`, `users`, and others — see `INTEGRATION_RAW_MODULE_ALLOWLIST` in the GreenCityERP repo.

**Example:**

```bash
curl -s -H "x-api-key: YOUR_KEY" \
  "http://187.127.145.85:3010/api/integration/v1/modules/cash_ledger?page=1&limit=50"
```

---

### 9.16 Extended payment types

`GET /payments` now merges **all payout modules**, not only NEFT and receipts.

| `type` value | Source module | Description |
|--------------|---------------|-------------|
| `neft` | `neft_list` | NEFT payouts to members |
| `receipt` | `sale_report_transactions` | Sale payment receipts |
| `bp_payout` | `bp_payout_mgmt` | BP payout management |
| `bp_payment` | `bp_payment` | Individual BP payments |
| `bulk_payment` | `bp_bulk_payment` | Bulk BP payments |
| `reward_emi` | `neft_list_reward_emi` | Reward EMI NEFT list |
| `reward` | `neft_list_reward` | Reward NEFT list |
| `income` | `income_details` | Income details |
| `income_summary` | `payout_income_summary` | Payout income summary |

Omit `type` to fetch all payment sources merged (sorted by date descending).

**Example — BP payouts only:**

```bash
curl -s -H "x-api-key: YOUR_KEY" \
  "http://187.127.145.85:3010/api/integration/v1/payments?type=bp_payout&page=1&limit=100"
```

---

## 10. Field reference

| API field | Used in | Description |
|-----------|---------|-------------|
| `bpCode` | BPs, genealogy, payments | Unique Business Partner identifier |
| `name` | BPs, sales, payments | Person or entity name |
| `mobile` | BPs, sales, payments | Phone number |
| `status` | BPs | BP account status |
| `sponsorCode` | BPs | Upline BP code |
| `joiningDate` | BPs | BP registration date |
| `updatedAt` | All entities | When GreenCityERP last saw this record (use for delta sync cursor) |
| `type` | string | Payment source — `neft`, `receipt`, `bp_payout`, etc. |
| `sponsorTree` | genealogy | Unilevel downline hierarchy |
| `binaryTree` | genealogy | Binary left/right legs |
| `leg` | genealogy nodes | Tree position: `left`, `right`, or `sponsor` |
| `raw` | sales, payments, projects | Unmapped source fields from the ERP scrape |

### Amounts and dates

- Amounts are returned as **strings** (as scraped from the source ERP), not numbers.
- Dates may appear as `DD/MM/YYYY` (scraped format) or ISO 8601 depending on the field.
- Always parse defensively in your application.

---

## 11. Recommended sync schedule

| Data | Suggested interval | Endpoint |
|------|-------------------|----------|
| Business Partners | Every 15 minutes | `GET /bps?updatedAfter=...` |
| Sales | Every 30 minutes | `GET /sales?updatedAfter=...` |
| Sale transactions | Every 30 minutes | `GET /sale-transactions?updatedAfter=...` |
| Accounting transactions | Hourly | `GET /transactions?updatedAfter=...` |
| Payments / payouts | Every 30 minutes | `GET /payments?updatedAfter=...` |
| Plots | Daily | `GET /plots?updatedAfter=...` |
| Branches & banks | Daily | `GET /branches`, `GET /banks` |
| Projects | Daily | `GET /projects?updatedAfter=...` |
| Genealogy | Every 1 hour | `GET /genealogy/{bpCode}` per changed BP |
| Module discovery | Weekly | `GET /modules` |
| Other raw modules | As needed | `GET /modules/{moduleKey}?updatedAfter=...` |

### Best practices

- Use `limit=1000` for bulk sync jobs.
- Run sync from a **backend worker**, not the browser.
- Upsert by natural key (`bpCode`, `saleId`, payment `id`, project `id`, transaction `id`).
- For genealogy, only re-fetch BPs that appeared in the latest BP delta response.
- On `429` responses, wait and retry with exponential backoff.
- Log `x-request-id` from responses when reporting issues to the GreenCityERP team.

---

## 12. Error handling & HTTP status codes

| Status | Meaning | Action |
|--------|---------|--------|
| `200` | Success | Process `data` |
| `400` | Invalid query parameters | Fix request (check date formats, `limit` max, etc.) |
| `401` | Missing or invalid API key | Verify `x-api-key` header |
| `404` | Resource not found | BP or genealogy does not exist |
| `429` | Rate limit exceeded | Back off and retry |
| `500` | Server error | Retry later; contact admin with `x-request-id` |
| `503` | API key not configured on server | Contact GreenCityERP administrator |

### Example error responses

**401 Unauthorized:**

```json
{
  "success": false,
  "message": "Invalid or missing API key"
}
```

**400 Validation error:**

```json
{
  "success": false,
  "message": "Validation failed",
  "errors": [/* detail */]
}
```

---

## 13. Rate limiting

The API enforces per-IP rate limits via Redis.

| Setting | Default |
|---------|---------|
| Requests allowed | `100` per `60` seconds per IP |
| Env vars | `INTEGRATION_RATE_LIMIT_POINTS`, `INTEGRATION_RATE_LIMIT_DURATION` |

When exceeded, the API returns **429** with message `"Rate limit exceeded"`.

**Retry strategy:**

```
wait = 1 second
repeat up to 5 times:
  response = fetch(...)
  if response.status != 429: return response
  sleep(wait)
  wait = wait * 2
```

---

## 14. CORS (browser clients)

Cross-origin requests are allowed **only** from the origin configured in `INTEGRATION_CORS_ORIGIN` on the GreenCityERP server.

Allowed methods: `GET`, `OPTIONS`  
Allowed headers: `x-api-key`, `Content-Type`

> **Recommendation:** Do not call this API directly from a public browser app. Proxy requests through your own backend to keep the API key secret.

---

## 15. Sample integration code

### 15.1 TypeScript / Node.js — full delta sync client

```typescript
const BASE_URL = 'https://greencity.example.com:3010/api/integration/v1';
const API_KEY = process.env.GREENCITY_API_KEY!;

interface ApiListResponse<T> {
  success: boolean;
  data: T[];
  meta?: { page: number; limit: number; total: number };
}

async function fetchPage<T>(
  endpoint: string,
  params: Record<string, string>,
): Promise<ApiListResponse<T>> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url, { headers: { 'x-api-key': API_KEY } });
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);

  const body = (await res.json()) as ApiListResponse<T>;
  if (!body.success) throw new Error('API returned success=false');
  return body;
}

async function syncEntity<T extends { updatedAt: string }>(
  endpoint: string,
  cursor: string | null,
  onRecord: (record: T) => Promise<void>,
): Promise<string | null> {
  let page = 1;
  let maxUpdatedAt = cursor;

  while (true) {
    const params: Record<string, string> = {
      page: String(page),
      limit: '1000',
    };
    if (cursor) params.updatedAfter = cursor;

    const { data, meta } = await fetchPage<T>(endpoint, params);
    if (data.length === 0) break;

    for (const record of data) {
      await onRecord(record);
      if (!maxUpdatedAt || record.updatedAt > maxUpdatedAt) {
        maxUpdatedAt = record.updatedAt;
      }
    }

    if (!meta || page * meta.limit >= meta.total) break;
    page += 1;
  }

  return maxUpdatedAt;
}

// Usage
async function main() {
  const savedCursor = await db.getCursor('bps'); // your persistence layer

  const newCursor = await syncEntity(
    '/bps',
    savedCursor,
    async (bp) => db.upsertBp(bp),
  );

  if (newCursor) await db.setCursor('bps', newCursor);
}

main().catch(console.error);
```

### 15.2 Python

```python
import os
import time
import requests

BASE_URL = "https://greencity.example.com:3010/api/integration/v1"
API_KEY = os.environ["GREENCITY_API_KEY"]
HEADERS = {"x-api-key": API_KEY}


def fetch_with_retry(url, params, max_retries=5):
    wait = 1
    for _ in range(max_retries):
        resp = requests.get(url, headers=HEADERS, params=params, timeout=60)
        if resp.status_code == 429:
            time.sleep(wait)
            wait *= 2
            continue
        resp.raise_for_status()
        body = resp.json()
        if not body.get("success"):
            raise RuntimeError(body.get("message", "API error"))
        return body
    raise RuntimeError("Rate limit exceeded after retries")


def sync_bps(cursor=None):
    page = 1
    max_updated = cursor
    while True:
        params = {"page": page, "limit": 1000}
        if cursor:
            params["updatedAfter"] = cursor
        body = fetch_with_retry(f"{BASE_URL}/bps", params)
        rows = body["data"]
        if not rows:
            break
        for bp in rows:
            upsert_bp(bp)  # your DB logic
            if not max_updated or bp["updatedAt"] > max_updated:
                max_updated = bp["updatedAt"]
        meta = body.get("meta", {})
        if page * meta.get("limit", 1000) >= meta.get("total", 0):
            break
        page += 1
    return max_updated


def upsert_bp(bp):
    pass  # implement in your application
```

### 15.3 PHP (Laravel-style)

```php
<?php

$baseUrl = 'https://greencity.example.com:3010/api/integration/v1';
$apiKey = env('GREENCITY_API_KEY');

$response = Http::withHeaders(['x-api-key' => $apiKey])
    ->get("{$baseUrl}/bps", [
        'page' => 1,
        'limit' => 1000,
        'updatedAfter' => $cursor, // null on first sync
    ]);

if ($response->status() === 429) {
    // backoff and retry
}

$data = $response->json();
foreach ($data['data'] as $bp) {
    Bp::updateOrCreate(['bp_code' => $bp['bpCode']], $bp);
}
```

---

## 16. Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| `401 Invalid or missing API key` | Wrong or missing header | Send `x-api-key` on every request |
| `503 Integration API key not configured` | Server env not set | Ask admin to set `INTEGRATION_API_KEY` |
| `429 Rate limit exceeded` | Too many requests | Reduce frequency; use `limit=1000`; add backoff |
| `400 Validation failed` | Bad query param | Check `updatedAfter` is valid ISO 8601; `limit` ≤ 1000 |
| `404 BP not found` | Invalid `bpCode` | Verify code exists via `GET /bps?search=...` |
| Empty `data` on delta sync | No changes since cursor | Normal — cursor is working |
| CORS error in browser | Origin mismatch | Ask admin to set `INTEGRATION_CORS_ORIGIN`; prefer backend proxy |
| Stale data | Infrequent scraping or sync | Increase your sync frequency; check GreenCityERP scrape schedule |

---

## 17. OpenAPI / Swagger

For interactive exploration and code generation:

| Resource | URL |
|----------|-----|
| Swagger UI | `{BASE_URL}/api/docs` |
| OpenAPI 3.1 JSON | `{BASE_URL}/api/openapi` |

The live OpenAPI spec is the authoritative source for schema changes. This document describes the stable v1 contract as of the current codebase.

---

## Endpoint summary

| Method | Endpoint | Pagination | Delta sync | Notes |
|--------|----------|------------|------------|-------|
| GET | `/health` | — | — | Connectivity check |
| GET | `/bps` | Yes | Yes | `search` supported |
| GET | `/bps/{bpCode}` | — | — | Includes genealogy stats |
| GET | `/genealogy/{bpCode}` | — | — | Per-BP trees |
| GET | `/sales` | Yes | Yes | `from` / `to` date filter |
| GET | `/sale-transactions` | Yes | Yes | `from` / `to` date filter |
| GET | `/transactions` | Yes | Yes | `from` / `to` date filter |
| GET | `/payments` | Yes | Yes | 9 `type` values — see §9.16 |
| GET | `/plots` | Yes | Yes | Merged plot modules |
| GET | `/branches` | Yes | Yes | |
| GET | `/banks` | Yes | Yes | |
| GET | `/accounting-entities` | Yes | Yes | |
| GET | `/projects` | Yes | Yes | |
| GET | `/modules` | — | — | Catalog with row counts |
| GET | `/modules/{moduleKey}` | Yes | Yes | Raw allowlisted modules |

---

## 18. For GreenCityERP operators

### Deploy API changes

```bash
cd /srv/GreenCityERP
docker compose build api
docker compose up -d api
```

### Queue scrapes for empty modules

Some modules (especially `plot_list`, `govt_survey_plot`, `raw_land`) may return zero rows until scraped:

```bash
pnpm --filter @greencity/scraper scrape:integration-modules
```

This enqueues scrapes for priority modules with fewer than 20 rows.

### Verify module coverage

```bash
curl -s -H "x-api-key: YOUR_KEY" \
  "http://187.127.145.85:3010/api/integration/v1/modules" | jq '.data[] | select(.rowCount == 0)'
```

### Genealogy alias migration

After bulk genealogy re-scrapes, run:

```bash
pnpm --filter @greencity/scraper migrate:genealogy-aliases
```

---

## Support checklist

When contacting the GreenCityERP team, include:

1. Endpoint called (full URL minus API key)
2. HTTP status code received
3. Response `x-request-id` header value
4. Approximate time of the request (UTC)
5. Whether it is first sync or delta sync

---

*GreenCityERP Integration API v1 — read-only REST surface for external application data consumption.*
