export type PaymentType =
  | 'neft'
  | 'receipt'
  | 'bp_payout'
  | 'bp_payment'
  | 'bulk_payment'
  | 'reward_emi'
  | 'reward'
  | 'income'
  | 'income_summary';

export interface PaymentItem {
  type: PaymentType;
  sourceModule?: string;
  id: string;
  payoutId?: string;
  bpCode?: string;
  name?: string;
  mobile?: string;
  amount?: string;
  payableAmount?: string;
  date?: string;
  bankName?: string;
  referenceNo?: string;
  saleId?: string;
  receiptNo?: string;
  paymentMode?: string;
  paymentStatus?: string;
  updatedAt: string;
  raw?: Record<string, string>;
}
