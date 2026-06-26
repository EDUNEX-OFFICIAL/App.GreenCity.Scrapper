export interface SaleItem {
  saleId: string;
  bookingNo: string;
  name?: string;
  mobile?: string;
  project?: string;
  phase?: string;
  plot?: string;
  saleDate?: string;
  totalAmount?: string;
  paidAmount?: string;
  saleStatus?: string;
  paymentStatus?: string;
  updatedAt: string;
  raw?: Record<string, string>;
}
