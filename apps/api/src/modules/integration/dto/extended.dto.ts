export interface TransactionItem {
  id: string;
  voucherNo?: string;
  date?: string;
  head?: string;
  entity?: string;
  amount?: string;
  narration?: string;
  paymentMode?: string;
  updatedAt: string;
  raw?: Record<string, string>;
}

export interface SaleTransactionItem {
  id: string;
  depositId?: string;
  saleId?: string;
  bookingNo?: string;
  receiptNo?: string;
  name?: string;
  amount?: string;
  date?: string;
  paymentMode?: string;
  bankName?: string;
  updatedAt: string;
  raw?: Record<string, string>;
}

export interface IncomeBySaleEarningItem {
  id: string;
  receiptNo?: string;
  receiptDate?: string;
  saleId?: string;
  bpCode?: string;
  customerName?: string;
  plot?: string;
  phase?: string;
  project?: string;
  saleAmount?: string;
  commissionIncome?: string;
  paymentMode?: string;
  paymentStatus?: string;
  saleStatus?: string;
  transactionDate?: string;
  payoutId?: string;
  updatedAt: string;
  raw?: Record<string, string>;
}

export interface PlotItem {
  id: string;
  sourceModule: string;
  project?: string;
  phase?: string;
  plotNo?: string;
  status?: string;
  area?: string;
  rate?: string;
  amount?: string;
  updatedAt: string;
  raw?: Record<string, string>;
}

export interface BranchItem {
  id: string;
  name: string;
  code?: string;
  address?: string;
  contact?: string;
  updatedAt: string;
  raw?: Record<string, string>;
}

export interface BankItem {
  id: string;
  bankName: string;
  accountNo?: string;
  branch?: string;
  ifsc?: string;
  updatedAt: string;
  raw?: Record<string, string>;
}

export interface AccountingEntityItem {
  id: string;
  name: string;
  type?: string;
  mobile?: string;
  address?: string;
  updatedAt: string;
  raw?: Record<string, string>;
}

export interface ModuleCatalogItem {
  moduleKey: string;
  rowCount: number;
  exposedOnApi: boolean;
  typedEndpoint?: string;
}

export interface RawModuleRowItem {
  moduleKey: string;
  id: string;
  data: Record<string, string>;
  updatedAt: string;
}
