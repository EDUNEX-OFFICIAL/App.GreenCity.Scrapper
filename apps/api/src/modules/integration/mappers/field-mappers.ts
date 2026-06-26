import type { BpDetail, BpListItem } from '../dto/bp.dto';
import type { PaymentItem } from '../dto/payments.dto';
import type { ProjectItem } from '../dto/projects.dto';
import type { SaleItem } from '../dto/sales.dto';

export type RawRow = Record<string, string>;

const BLANK_CELL = /^(|&nbsp;|\u00a0)$/i;

/** Normalize scraped cell text — strips HTML entities and whitespace noise. */
export function sanitizeCell(value?: string): string {
  if (value == null) return '';
  let v = value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  v = v.replace(/&nbsp;/gi, '').replace(/&amp;/g, '&').trim();
  if (BLANK_CELL.test(v)) return '';
  return v;
}

/** Reject scraper noise rows (pagination artifacts, HTML entities, etc.). */
export function isValidBpCode(bpCode: string): boolean {
  const code = sanitizeCell(bpCode);
  if (!code || /^\d+$/.test(code) || code === '>>' || code === '...') return false;
  if (/&nbsp;|&#\d+;|<[^>]+>/i.test(code)) return false;
  if (!/[a-zA-Z0-9]/.test(code) || code.length < 3) return false;
  return true;
}

export function pick(row: RawRow, ...keys: string[]): string {
  for (const key of keys) {
    const v = sanitizeCell(row[key]);
    if (v) return v;
  }
  return '';
}

/** Extract deposit/receipt id from sale_transactions Receipt link. */
export function parseDepositIdFromHref(row: RawRow): string {
  const href = sanitizeCell(row.Receipt_href);
  const m = href.match(/depositid=([0-9]+)/i);
  return m?.[1] ?? '';
}

/** Parse numeric sale id from combined Sale column text. */
export function parseSaleIdFromSaleField(row: RawRow): string {
  const sale = pick(row, 'Sale');
  const m = sale.match(/Sale ID:\s*(\d+)/i);
  return m?.[1] ?? pick(row, 'Sale ID');
}

export function pickCommissionPct(row: RawRow): string {
  return pick(row, 'Current Percentage', 'Current %', 'Current', 'Percentage');
}

export function mapBpRow(row: RawRow, lastSeenAt: Date): BpListItem {
  const password = pick(row, 'Password');
  const commissionPct = pickCommissionPct(row);
  return {
    bpCode: pick(row, 'BP ID'),
    name: pick(row, 'Name'),
    mobile: pick(row, 'Mobile No', 'Mobile'),
    status: pick(row, 'Status', 'Current'),
    sponsorCode: pick(row, 'Sponsor BP ID', 'Sponsor ID'),
    joiningDate: pick(row, 'Add On', 'Registered On'),
    uid: pick(row, 'UID') || undefined,
    password: password || undefined,
    commissionPct: commissionPct || undefined,
    updatedAt: lastSeenAt.toISOString(),
  };
}

export function mapBpCandidate(row: RawRow): {
  uid: string;
  bpCode: string;
  name: string;
  sponsorCode: string;
  commissionPct?: string;
} {
  return {
    uid: pick(row, 'UID'),
    bpCode: pick(row, 'BP ID'),
    name: pick(row, 'Name'),
    sponsorCode: pick(row, 'Sponsor BP ID', 'Sponsor ID'),
    commissionPct: pickCommissionPct(row) || undefined,
  };
}

export function mapBpDetail(
  row: RawRow,
  lastSeenAt: Date,
  modalData?: Record<string, string | undefined>,
): BpDetail {
  const base = mapBpRow(row, lastSeenAt);
  if (!modalData) return base;
  return {
    ...base,
    genealogy: {
      sponsorName: modalData.sponsorName,
      registeredAt: modalData.registeredAt,
      position: modalData.position,
      leftPoint: modalData.leftPoint,
      rightPoint: modalData.rightPoint,
      selfPoint: modalData.selfPoint,
      selfBusiness: modalData.selfBusiness,
      totalBusiness: modalData.totalBusiness,
      totalMembers: modalData.totalMembers,
    },
  };
}

export function mapSaleRow(row: RawRow, lastSeenAt: Date): SaleItem {
  return {
    saleId: pick(row, 'Sale ID'),
    bookingNo: pick(row, 'Booking No'),
    name: pick(row, 'Name') || undefined,
    mobile: pick(row, 'Mobile No', 'Mobile') || undefined,
    project: pick(row, 'Project') || undefined,
    phase: pick(row, 'Phase') || undefined,
    plot: pick(row, 'Plot') || undefined,
    saleDate: pick(row, 'Sale Date') || undefined,
    totalAmount: pick(row, 'Total Amt', 'Total Amount') || undefined,
    paidAmount: pick(row, 'Paid Amt', 'Paid Amount') || undefined,
    saleStatus: pick(row, 'Sale Status') || undefined,
    paymentStatus: pick(row, 'Payment Status') || undefined,
    updatedAt: lastSeenAt.toISOString(),
    raw: row,
  };
}

export function mapNeftPayment(row: RawRow, lastSeenAt: Date): PaymentItem {
  return {
    type: 'neft',
    id: pick(row, 'NEFT ID', 'Reference No', 'Member ID', 'SrNo'),
    bpCode: pick(row, 'Member ID') || undefined,
    name: pick(row, 'Name') || undefined,
    mobile: pick(row, 'Mobile No') || undefined,
    amount: pick(row, 'Amt [Rs.]', 'Amount') || undefined,
    date: undefined,
    bankName: pick(row, 'Bank Name') || undefined,
    referenceNo: pick(row, 'Reference No', 'NEFT ID') || undefined,
    updatedAt: lastSeenAt.toISOString(),
    raw: row,
  };
}

export function mapReceiptPayment(row: RawRow, lastSeenAt: Date): PaymentItem {
  return {
    type: 'receipt',
    id: pick(row, 'Receipt No.', 'Sale ID'),
    saleId: pick(row, 'Sale ID') || undefined,
    name: pick(row, 'Name') || undefined,
    receiptNo: pick(row, 'Receipt No.') || undefined,
    amount: pick(row, 'Amount') || undefined,
    date: pick(row, 'Receipt Date') || undefined,
    bankName: pick(row, 'Bank Name') || undefined,
    paymentMode: pick(row, 'Mode') || undefined,
    paymentStatus: pick(row, 'Payment Status') || undefined,
    updatedAt: lastSeenAt.toISOString(),
    raw: row,
  };
}

export function mapProjectRow(row: RawRow, lastSeenAt: Date, id: string): ProjectItem {
  return {
    id,
    name: pick(row, 'Name'),
    company: pick(row, 'Company') || undefined,
    address: pick(row, 'Address') || undefined,
    startDate: pick(row, 'Start Date') || undefined,
    updatedAt: lastSeenAt.toISOString(),
    raw: row,
  };
}

export function mapTransactionRow(row: RawRow, lastSeenAt: Date): import('../dto/extended.dto').TransactionItem {
  return {
    id: pick(row, 'Trans ID', 'Voucher No', 'SrNo', 'ID'),
    voucherNo: pick(row, 'Voucher No', 'Voucher No.') || undefined,
    date: pick(row, 'Date', 'Trans Date', 'Transaction Date') || undefined,
    head: pick(row, 'Head', 'Accounting Head') || undefined,
    entity: pick(row, 'Entity', 'Name', 'Party Name') || undefined,
    amount: pick(row, 'Amount', 'Amt [Rs.]', 'Debit', 'Credit') || undefined,
    narration: pick(row, 'Narration', 'Description', 'Particulars') || undefined,
    paymentMode: pick(row, 'Mode', 'Payment Mode') || undefined,
    updatedAt: lastSeenAt.toISOString(),
    raw: row,
  };
}

export function mapSaleTransactionRow(
  row: RawRow,
  lastSeenAt: Date,
): import('../dto/extended.dto').SaleTransactionItem {
  const depositId = parseDepositIdFromHref(row);
  const saleId = parseSaleIdFromSaleField(row);
  const receiptNo = depositId || pick(row, 'Receipt No.', 'Receipt');
  const id = depositId || pick(row, 'Receipt No.', 'Receipt', 'Trans ID', 'SrNo') || saleId;

  return {
    id,
    depositId: depositId || undefined,
    saleId: saleId || undefined,
    bookingNo: pick(row, 'Booking No') || undefined,
    receiptNo: receiptNo || undefined,
    name: pick(row, 'Name') || undefined,
    amount: pick(row, 'Amount', 'Paid Amt') || undefined,
    date: pick(row, 'Receipt Date', 'Apply', 'Date', 'Sale Date') || undefined,
    paymentMode: pick(row, 'Mode', 'Payment Mode', 'Trans./ Cheque') || undefined,
    bankName: pick(row, 'Bank Name') || undefined,
    updatedAt: lastSeenAt.toISOString(),
    raw: row,
  };
}

export function mapIncomeBySaleEarningRow(
  row: RawRow,
  lastSeenAt: Date,
): import('../dto/extended.dto').IncomeBySaleEarningItem {
  const receiptNo = pick(row, 'Receipt No.');
  const saleId = pick(row, 'Sale ID');
  const payoutId = pick(row, 'Payout ID');
  const id = receiptNo || `${saleId}-${pick(row, 'SrNo')}` || pick(row, 'SrNo');

  return {
    id,
    receiptNo: receiptNo || undefined,
    receiptDate: pick(row, 'Receipt Date') || undefined,
    saleId: saleId || undefined,
    bpCode: pick(row, 'BP ID', 'Member ID', 'Sponsor BP ID') || undefined,
    customerName: pick(row, 'Name') || undefined,
    plot: pick(row, 'Plot') || undefined,
    phase: pick(row, 'Phase') || undefined,
    project: pick(row, 'Project') || undefined,
    saleAmount: pick(row, 'Amount') || undefined,
    commissionIncome: pick(row, 'Income') || undefined,
    paymentMode: pick(row, 'Mode') || undefined,
    paymentStatus: pick(row, 'Payment Status') || undefined,
    saleStatus: pick(row, 'Sale Status') || undefined,
    transactionDate: pick(row, 'Transaction Date') || undefined,
    payoutId: payoutId || undefined,
    updatedAt: lastSeenAt.toISOString(),
    raw: row,
  };
}

export function mapPlotRow(
  moduleKey: string,
  row: RawRow,
  lastSeenAt: Date,
  id: string,
): import('../dto/extended.dto').PlotItem {
  return {
    id,
    sourceModule: moduleKey,
    project: pick(row, 'Project') || undefined,
    phase: pick(row, 'Phase', 'Project Phase') || undefined,
    plotNo: pick(row, 'Plot', 'Plot No', 'Plot No.', 'Plot Number') || undefined,
    status: pick(row, 'Status', 'Plot Status') || undefined,
    area: pick(row, 'Area', 'Plot Area') || undefined,
    rate: pick(row, 'Rate', 'Plot Rate') || undefined,
    amount: pick(row, 'Amount', 'Total Amount') || undefined,
    updatedAt: lastSeenAt.toISOString(),
    raw: row,
  };
}

export function mapBranchRow(row: RawRow, lastSeenAt: Date, id: string): import('../dto/extended.dto').BranchItem {
  return {
    id,
    name: pick(row, 'Name', 'Branch Name'),
    code: pick(row, 'Code', 'Branch Code') || undefined,
    address: pick(row, 'Address') || undefined,
    contact: pick(row, 'Contact', 'Mobile No', 'Phone') || undefined,
    updatedAt: lastSeenAt.toISOString(),
    raw: row,
  };
}

export function mapBankRow(row: RawRow, lastSeenAt: Date, id: string): import('../dto/extended.dto').BankItem {
  return {
    id,
    bankName: pick(row, 'Bank Name', 'Name'),
    accountNo: pick(row, 'Account No', 'Account No.') || undefined,
    branch: pick(row, 'Branch') || undefined,
    ifsc: pick(row, 'IFSC', 'IFSC Code') || undefined,
    updatedAt: lastSeenAt.toISOString(),
    raw: row,
  };
}

export function mapAccountingEntityRow(
  row: RawRow,
  lastSeenAt: Date,
  id: string,
): import('../dto/extended.dto').AccountingEntityItem {
  return {
    id,
    name: pick(row, 'Name', 'Entity Name'),
    type: pick(row, 'Type', 'Entity Type') || undefined,
    mobile: pick(row, 'Mobile No', 'Mobile') || undefined,
    address: pick(row, 'Address') || undefined,
    updatedAt: lastSeenAt.toISOString(),
    raw: row,
  };
}

export function mapGenericPayoutRow(
  type: import('../dto/payments.dto').PaymentType,
  sourceModule: string,
  row: RawRow,
  lastSeenAt: Date,
): import('../dto/payments.dto').PaymentItem {
  const payoutId = pick(row, 'Payout ID');
  const bpCode = pick(row, 'Member ID', 'BP ID', 'Sponsor BP ID') || undefined;
  const date = pick(row, 'Date', 'Receipt Date', 'Payment Date') || undefined;
  const amount = pick(row, 'Amt [Rs.]', 'Amount', 'Paid Amt', 'Net Amount') || undefined;
  const payableAmount = pick(row, 'Payable Amt', 'Payable Amount', 'Net Amount') || undefined;

  const numericPayoutId = /^\d+$/.test(payoutId) ? payoutId : '';
  let id = pick(row, 'Payout ID', 'NEFT ID', 'Reference No', 'Receipt No.', 'Trans ID', 'ID', 'SrNo');
  if (type === 'bp_payout') {
    id = numericPayoutId || id;
    if (!numericPayoutId && (!id || /total|₹/i.test(id))) {
      id = [date, amount].filter(Boolean).join('-') || '';
    }
  }
  if (type === 'income_summary' && payoutId && bpCode) {
    id = `${payoutId}-${bpCode}`;
  } else if (type === 'income_summary' && bpCode) {
    id = `${pick(row, 'SrNo') || '0'}-${bpCode}`;
  }

  return {
    type,
    sourceModule,
    id,
    payoutId: numericPayoutId || payoutId || undefined,
    bpCode,
    name: pick(row, 'Name') || undefined,
    mobile: pick(row, 'Mobile No', 'Mobile') || undefined,
    amount: amount || undefined,
    payableAmount: payableAmount || undefined,
    date,
    bankName: pick(row, 'Bank Name') || undefined,
    referenceNo: pick(row, 'Reference No', 'NEFT ID') || undefined,
    saleId: pick(row, 'Sale ID') || undefined,
    receiptNo: pick(row, 'Receipt No.') || undefined,
    paymentMode: pick(row, 'Mode', 'Payment Mode') || undefined,
    paymentStatus: pick(row, 'Payment Status', 'Status') || undefined,
    updatedAt: lastSeenAt.toISOString(),
    raw: row,
  };
}

export function parseRowDate(value?: string): Date | undefined {
  if (!value?.trim()) return undefined;
  const trimmed = value.trim();
  const dmy = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const day = Number.parseInt(dmy[1]!, 10);
    const month = Number.parseInt(dmy[2]!, 10) - 1;
    const year = Number.parseInt(dmy[3]!, 10);
    const d = new Date(year, month, day);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export function paymentSortDate(item: PaymentItem): number {
  const d = parseRowDate(item.date) ?? new Date(item.updatedAt);
  return d.getTime();
}
