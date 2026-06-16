export interface ReceiptItem {
  name: string;
  quantity: number;
  subtotal: number;
  unitPrice: number;
}

export interface ReceiptBusinessInfo {
  address?: string;
  name: string;
  phone?: string;
  timezone?: string;
}

export interface ReceiptOrderInfo {
  cashierName: string;
  createdAt: string;
  orderNumber: string;
}

export interface ReceiptLineAmount {
  amount: number;
  label: string;
}

export interface ReceiptTotals {
  adminFee?: ReceiptLineAmount;
  subtotal?: number;
  tax?: ReceiptLineAmount;
  total: number;
}

export interface ReceiptPaymentInfo {
  amountPaid: number;
  changeAmount: number | null;
  method: "cash" | "qris";
}

export interface ReceiptData {
  business: ReceiptBusinessInfo;
  items: ReceiptItem[];
  order: ReceiptOrderInfo;
  payment: ReceiptPaymentInfo;
  totals: ReceiptTotals;
}
