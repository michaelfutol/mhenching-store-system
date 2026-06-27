export type PaymentMethod =
  | 'cash'
  | 'gcash'
  | 'maya_qr'
  | 'card_terminal'
  | 'usdt_manual'
  | 'utang_ledger';

export type PaymentDetails = {
  method: PaymentMethod;
  reference: string;
  amountReceived: string;
  arCustomerName: string;
  arContactInfo: string;
  arDueDate: string;
};

export const paymentMethodOptions: Array<{ value: PaymentMethod; label: string; helper: string }> = [
  { value: 'cash', label: 'Cash', helper: 'Immediate cash payment' },
  { value: 'gcash', label: 'GCash', helper: 'Record GCash reference number' },
  { value: 'maya_qr', label: 'Maya QR', helper: 'Record Maya QR reference' },
  { value: 'card_terminal', label: 'Card Terminal', helper: 'Swipe, tap, or terminal reference later' },
  { value: 'usdt_manual', label: 'USDT Manual', helper: 'Manual external crypto reference only' },
  { value: 'utang_ledger', label: 'Utang Ledger', helper: 'Approved pay-later customer balance' },
];

export const getPaymentMethodLabel = (method: PaymentMethod) => (
  paymentMethodOptions.find((option) => option.value === method)?.label ?? method
);

export const createDefaultPaymentDetails = (): PaymentDetails => ({
  method: 'cash',
  reference: '',
  amountReceived: '',
  arCustomerName: '',
  arContactInfo: '',
  arDueDate: '',
});

export const defaultPaymentDetails = createDefaultPaymentDetails;
