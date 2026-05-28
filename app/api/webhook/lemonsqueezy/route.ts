import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { verifyWebhook } from '@/lib/services/lemonsqueezy';

export async function POST(req: NextRequest) {
  const signature = req.headers.get('x-signature') ?? '';
  const rawBody = await req.arrayBuffer();
  const buffer = Buffer.from(rawBody);

  const valid = await verifyWebhook(buffer, signature);
  if (!valid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const payload = JSON.parse(buffer.toString('utf-8'));
  const eventName = payload.meta?.event_name;
  const data = payload.data?.attributes;
  const customUserId = payload.meta?.custom_data?.user_id;
  const customerId = data?.customer_id?.toString();
  const subscriptionId = data?.id?.toString();

  const admin = createAdminClient();

  switch (eventName) {
    case 'subscription_created':
      if (customUserId) {
        await admin.from('abonnements').upsert({
          user_id: customUserId,
          ls_customer_id: customerId,
          ls_subscription_id: subscriptionId,
          statut: 'actif',
          current_period_end: data?.renews_at,
          updated_at: new Date().toISOString(),
        });
      }
      break;

    case 'subscription_updated':
      if (subscriptionId) {
        await admin.from('abonnements')
          .update({
            statut: data?.status === 'active' ? 'actif' : 'suspendu',
            current_period_end: data?.renews_at,
            updated_at: new Date().toISOString(),
          })
          .eq('ls_subscription_id', subscriptionId);
      }
      break;

    case 'subscription_cancelled':
    case 'subscription_expired':
      if (subscriptionId) {
        await admin.from('abonnements')
          .update({ statut: 'inactif', updated_at: new Date().toISOString() })
          .eq('ls_subscription_id', subscriptionId);
      }
      break;

    case 'subscription_payment_failed':
      if (customerId) {
        await admin.from('abonnements')
          .update({ statut: 'suspendu', updated_at: new Date().toISOString() })
          .eq('ls_customer_id', customerId);
      }
      break;
  }

  return NextResponse.json({ received: true });
}
