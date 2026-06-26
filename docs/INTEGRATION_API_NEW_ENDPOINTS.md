# GreenCityERP — New Integration API Endpoints

> **Added:** June 2026  
> **Base path:** `/api/integration/v1`  
> **Full consumer guide:** [`EXTERNAL_APP_INTEGRATION.md`](EXTERNAL_APP_INTEGRATION.md)

Yeh document sirf **naye / extended** Integration API endpoints cover karta hai. Pehle se available endpoints (`/bps`, `/sales`, `/genealogy`, `/projects`) ke liye main guide dekho.

---

## Quick setup

| Item | Value |
|------|-------|
| **Base URL** | `http://187.127.145.85:3010/api/integration/v1` |
| **Auth header** | `x-api-key: YOUR_API_KEY` |
| **Response format** | `{ "success": true, "data": [...], "meta": { "page", "limit", "total" } }` |

```bash
export GREENCITY_API="http://187.127.145.85:3010/api/integration/v1"
export GREENCITY_KEY="your-api-key"

curl -s -H "x-api-key: $GREENCITY_KEY" "$GREENCITY_API/health"
```

---

## New endpoints overview

| Endpoint | Method | Source module(s) | Description |
|----------|--------|------------------|-------------|
| `/transactions` | GET | `accounting_transactions` | Accounting ledger (~17k rows) |
| `/sale-transactions` | GET | `sale_transactions` | Sale payment ledger (deduped by deposit id) |
| `/income-by-sale-earning` | GET | `income_by_sale_earning` | BP commission income per sale receipt |
| `/plots` | GET | `plot_list`, `registered_plot_list`, `govt_survey_plot` | Plot inventory (merged) |
| `/branches` | GET | `branch` | Branch master |
| `/banks` | GET | `master_bank` | Bank master |
| `/accounting-entities` | GET | `accounting_entity` | Accounting entity master |
| `/modules` | GET | — | Module catalog with row counts |
| `/modules/{moduleKey}` | GET | allowlisted modules | Raw scraped rows |
| `/payments` *(extended)* | GET | 8 payout modules | NEFT, receipts, BP payouts, income, etc. |

---

## Common query parameters

Most list endpoints support:

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | `1` | Page number |
| `limit` | integer | `100` | Page size (max `1000`) |
| `updatedAfter` | ISO 8601 | — | Delta sync — only rows updated on or after this time |

`GET /transactions`, `GET /sale-transactions`, and `GET /payments` also support:

| Parameter | Type | Description |
|-----------|------|-------------|
| `from` | ISO 8601 | Record date lower bound |
| `to` | ISO 8601 | Record date upper bound |

---

## 1. Accounting transactions

```
GET /transactions
```

**Example:**

```bash
curl -s -H "x-api-key: $GREENCITY_KEY" \
  "$GREENCITY_API/transactions?page=1&limit=100&updatedAfter=2026-06-20T00:00:00.000Z"
```

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Transaction ID (SrNo) |
| `voucherNo` | string? | Voucher number |
| `date` | string? | Transaction date |
| `head` | string? | Accounting head |
| `entity` | string? | Entity name |
| `amount` | string? | Debit/credit amount |
| `narration` | string? | Narration / description |
| `paymentMode` | string? | CASH, CHEQUE, etc. |
| `updatedAt` | string | Last seen by scraper (ISO 8601) |
| `raw` | object? | Original ERP columns |

**Sample response:**

```json
{
  "success": true,
  "data": [
    {
      "id": "4861",
      "date": "28/06/2025",
      "head": "Office Expense Petty Cash",
      "entity": "MUZAFFARPUR OFFICE",
      "amount": "364",
      "narration": "PAY TO MILK, BISCUITS...",
      "paymentMode": "CASH",
      "updatedAt": "2026-06-22T08:46:48.699Z",
      "raw": { "SrNo": "4861", "Debit": "364", "Head": "Office Expense Petty Cash" }
    }
  ],
  "meta": { "page": 1, "limit": 100, "total": 17588 }
}
```

---

## 2. Sale transactions

```
GET /sale-transactions
```

Sale payment ledger — cheques, receipts, adjustments linked to sales. **Deduplicated by deposit id** parsed from `Receipt_href` (not raw `SrNo`).

> **EduNex matching:** Receipt numbers align with `income_by_sale_earning` via `receiptNo` / `depositId` (e.g. `1137324`), not the empty `Receipt` text column in the ERP grid.

**Example:**

```bash
curl -s -H "x-api-key: $GREENCITY_KEY" \
  "$GREENCITY_API/sale-transactions?page=1&limit=50"
```

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Deposit/receipt id (primary key) |
| `depositId` | string? | Same as receipt/deposit id from ERP link |
| `saleId` | string? | Linked sale ID |
| `bookingNo` | string? | Booking number |
| `receiptNo` | string? | Receipt/deposit number |
| `name` | string? | Customer / payee name |
| `date` | string? | Transaction date |
| `amount` | string? | Amount |
| `paymentMode` | string? | CHEQUE, CASH, NEFT/RTGS, etc. |
| `bankName` | string? | Bank name |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original ERP columns |

---

## 2b. Income by sale earning

```
GET /income-by-sale-earning
```

Typed endpoint for BP Management → Income by Sale Earning. Each row links a sale receipt to commission income for a payout period.

**Example:**

```bash
curl -s -H "x-api-key: $GREENCITY_KEY" \
  "$GREENCITY_API/income-by-sale-earning?page=1&limit=100"
```

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Row id (receipt no or composite) |
| `receiptNo` | string? | Receipt number — join key to `/sale-transactions` |
| `receiptDate` | string? | Receipt date |
| `saleId` | string? | Sale ID |
| `bpCode` | string? | BP / member id (when present in scrape) |
| `customerName` | string? | Customer name on sale |
| `plot` | string? | Plot |
| `phase` | string? | Phase |
| `project` | string? | Project |
| `saleAmount` | string? | Sale payment amount |
| `commissionIncome` | string? | BP commission income |
| `paymentMode` | string? | Payment mode |
| `paymentStatus` | string? | Payment status |
| `saleStatus` | string? | Sale status |
| `transactionDate` | string? | Transaction date |
| `payoutId` | string? | Payout period id (from scraper dropdown) |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original ERP columns |

---

## 3. Plots

```
GET /plots
```

Merges three plot modules into one list:

- `plot_list`
- `registered_plot_list`
- `govt_survey_plot`

**Example:**

```bash
curl -s -H "x-api-key: $GREENCITY_KEY" \
  "$GREENCITY_API/plots?page=1&limit=100"
```

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Plot identifier |
| `sourceModule` | string | Which module this row came from |
| `plotNo` | string? | Plot number |
| `project` | string? | Project name |
| `phase` | string? | Phase |
| `status` | string? | Plot status |
| `area` | string? | Area |
| `rate` | string? | Rate |
| `amount` | string? | Amount |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original ERP columns |

> **Note:** Agar `data` empty hai, pehle `GET /modules` se `rowCount` check karo. Plot modules scrape hone ke baad data aayega.

---

## 4. Branches

```
GET /branches
```

**Example:**

```bash
curl -s -H "x-api-key: $GREENCITY_KEY" \
  "$GREENCITY_API/branches?page=1&limit=50"
```

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Branch identifier |
| `name` | string | Branch name |
| `code` | string? | Branch code |
| `address` | string? | Address |
| `contact` | string? | Contact number |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original ERP columns |

---

## 5. Banks

```
GET /banks
```

**Example:**

```bash
curl -s -H "x-api-key: $GREENCITY_KEY" \
  "$GREENCITY_API/banks?page=1&limit=50"
```

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Bank record ID |
| `bankName` | string | Bank name |
| `accountNo` | string? | Account number |
| `branch` | string? | Branch name |
| `ifsc` | string? | IFSC code |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original ERP columns |

---

## 6. Accounting entities

```
GET /accounting-entities
```

**Example:**

```bash
curl -s -H "x-api-key: $GREENCITY_KEY" \
  "$GREENCITY_API/accounting-entities?page=1&limit=100"
```

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Entity identifier |
| `name` | string | Entity name |
| `type` | string? | Entity type |
| `mobile` | string? | Contact number |
| `address` | string? | Address |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original ERP columns |

---

## 7. Module catalog

```
GET /modules
```

Har scraped module ka row count aur typed endpoint mapping. **Pehle yeh call karo** jab decide karna ho kaunsa endpoint use karna hai.

**Example:**

```bash
curl -s -H "x-api-key: $GREENCITY_KEY" \
  "$GREENCITY_API/modules" | jq '.data[] | select(.rowCount > 0) | {moduleKey, rowCount, typedEndpoint}'
```

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `moduleKey` | string | Scraper module key |
| `rowCount` | number | Total rows in database |
| `exposedOnApi` | boolean | API se accessible hai ya nahi |
| `typedEndpoint` | string? | Typed path, e.g. `/transactions` |

**Sample response:**

```json
{
  "success": true,
  "data": [
    {
      "moduleKey": "accounting_transactions",
      "rowCount": 17588,
      "exposedOnApi": true,
      "typedEndpoint": "/transactions"
    },
    {
      "moduleKey": "plot_list",
      "rowCount": 0,
      "exposedOnApi": true,
      "typedEndpoint": "/plots"
    }
  ],
  "meta": { "page": 1, "limit": 54, "total": 54 }
}
```

---

## 8. Raw module rows

```
GET /modules/{moduleKey}
```

Jab typed endpoint nahi hai ya aapko **saare original ERP columns** chahiye, raw rows use karo.

**Example:**

```bash
curl -s -H "x-api-key: $GREENCITY_KEY" \
  "$GREENCITY_API/modules/cash_ledger?page=1&limit=50"
```

**Response `data[]` item:**

| Field | Type | Description |
|-------|------|-------------|
| `moduleKey` | string | Module key |
| `id` | string | Row ID |
| `data` | object | Original key-value pairs from ERP |
| `updatedAt` | string | Last seen by scraper |

**Allowlisted modules:**

| Module key | Use case |
|------------|----------|
| `cash_ledger` | Cash ledger entries |
| `registry_list` | Registry records |
| `raw_land` | Raw land inventory |
| `bp_income_summary_detail` | BP income detail |
| `finder_sales` | Finder sales |
| `finder_sales_transaction` | Finder sale transactions |
| `finder_accounting_transactions` | Finder accounting |
| `epin_list` | E-PIN list |
| `users` | ERP users |
| `company` | Company master |
| `sale_cheques` | Sale cheques |
| `accounting_cheques` | Accounting cheques |
| `bank_to_bank` | Bank-to-bank transfers |
| `downline_income_summary` | Downline income |
| `income_by_sale_earning` | Income by sale earning |
| `reward_emi_details` | Reward EMI details |
| `payout_balance_sheet` | Payout balance sheet (ERP page may be broken) |

Typed endpoints wale modules (`accounting_transactions`, `branch`, etc.) bhi allowlisted hain — raw access ke liye use kar sakte ho.

---

## 9. Extended payments

`GET /payments` ab sirf NEFT + receipts nahi — **8 payment types** merge hote hain.

| `type` value | Source module | Description |
|--------------|---------------|-------------|
| `neft` | `neft_list` | NEFT payouts to members |
| `receipt` | `sale_report_transactions` | Sale payment receipts |
| `bp_payout` | `bp_payout_mgmt` | BP payout generations (`Payout ID` field) |
| `bulk_payment` | `bp_bulk_payment` | Bulk BP payments |
| `reward_emi` | `neft_list_reward_emi` | Reward EMI NEFT |
| `reward` | `neft_list_reward` | Reward NEFT |
| `income` | `income_details` | Income details |
| `income_summary` | `payout_income_summary` | Payout income summary (id = `payoutId-memberId`) |

**Common response fields:**

| Field | Type | Description |
|-------|------|-------------|
| `type` | string | Payment source type |
| `id` | string | Record identifier |
| `payoutId` | string? | Payout period id (for linkage to BpPayoutDetail) |
| `payableAmount` | string? | Net payable after TDS/admin charges |
| `updatedAt` | string | Last seen by scraper |
| `raw` | object? | Original ERP columns |

> **Note:** `bp_payment` type removed — that module is a BP picker, not a payment ledger.

**Raw module:** `GET /modules/payout_balance_sheet` is allowlisted but ERP page may return 0 rows until portal DB error is fixed.

**NEFT-specific fields:** `bpCode`, `name`, `mobile`, `amount`, `bankName`, `referenceNo`

**Receipt-specific fields:** `saleId`, `receiptNo`, `name`, `amount`, `date`, `bankName`, `paymentMode`, `paymentStatus`

---

## Recommended sync order (EduNex / consumer apps)

```
1. GET /modules              → discover what data is available
2. GET /bps?updatedAfter=    → members
3. GET /sales?updatedAfter=  → sale bookings
4. GET /sale-transactions    → sale payment ledger (match on receiptNo/depositId)
5. GET /income-by-sale-earning → BP commission per receipt (match on receiptNo + payoutId)
6. GET /transactions         → accounting ledger
7. GET /payments             → all payouts (or filter by type)
8. GET /branches, /banks     → master data
9. GET /plots                → plot inventory
10. GET /genealogy/{bpCode}   → per changed BP
11. GET /modules/{key}       → any extra raw modules you need
```

Har entity type ke liye alag `updatedAfter` cursor store karo.

---

## EduNex `.env` example

```env
GREENCITY_ERP_API_BASE_URL=http://187.127.145.85:3010/api/integration/v1
GREENCITY_ERP_API_KEY=your-api-key-here
```

**Node.js fetch example:**

```javascript
const BASE = process.env.GREENCITY_ERP_API_BASE_URL;
const KEY = process.env.GREENCITY_ERP_API_KEY;

async function fetchTransactions(cursor) {
  const params = new URLSearchParams({ page: '1', limit: '1000' });
  if (cursor) params.set('updatedAfter', cursor);

  const res = await fetch(`${BASE}/transactions?${params}`, {
    headers: { 'x-api-key': KEY },
  });
  const body = await res.json();
  if (!body.success) throw new Error(body.message);
  return body;
}
```

---

## OpenAPI

Live Swagger UI: `http://187.127.145.85:3010/api/docs`  
OpenAPI JSON: `http://187.127.145.85:3010/api/openapi`

---

## Related docs

| Document | Purpose |
|----------|---------|
| [`EXTERNAL_APP_INTEGRATION.md`](EXTERNAL_APP_INTEGRATION.md) | Full integration guide (auth, pagination, errors, troubleshooting) |
| [`MLM_ERP_INTEGRATION.md`](MLM_ERP_INTEGRATION.md) | Redirects to main guide |

---

*GreenCityERP Integration API — new endpoints reference (June 2026)*
