export type Offer = {
  id: string; lot: number; user_id: string; amount: number;
  status: 'ready' | 'pending' | 'paid' | 'expired';
  created_at: number; notified_at: number | null; deadline: number | null;
  paid_at: number | null; payment_reference: string | null;
  mercado_pago_url: string | null; link_disabled_at: number | null;
};
