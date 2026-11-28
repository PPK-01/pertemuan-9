import { postAuthedApi } from '@/services/denda';
import type { Result } from '@/types';
import type { CreatePaymentRequest, CreatePaymentResponse } from '@/types/api';

/** Memanggil endpoint pembuatan transaksi Midtrans Snap untuk tagihan praktikan (FR-75). */
export function createPayment(billId: string): Promise<Result<CreatePaymentResponse>> {
  const payload: CreatePaymentRequest = { billId };
  return postAuthedApi<CreatePaymentResponse>('/api/payments/create', payload);
}
