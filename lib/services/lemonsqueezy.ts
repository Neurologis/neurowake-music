import crypto from 'crypto';

const LS_BASE = 'https://api.lemonsqueezy.com/v1';
const API_KEY = process.env.LEMON_SQUEEZY_API_KEY ?? '';

async function lsFetch(
  path: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(`${LS_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      ...(options.headers ?? {}),
    },
  });
}

export async function createCheckoutUrl(
  userId: string,
  email: string
): Promise<string> {
  const storeId = process.env.LEMON_SQUEEZY_STORE_ID;
  const variantId = process.env.LEMON_SQUEEZY_VARIANT_ID;

  if (!storeId || !variantId) {
    throw new Error('Lemon Squeezy store/variant not configured');
  }

  const res = await lsFetch('/checkouts', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          checkout_data: {
            email,
            custom: { user_id: userId },
          },
        },
        relationships: {
          store: {
            data: { type: 'stores', id: storeId },
          },
          variant: {
            data: { type: 'variants', id: variantId },
          },
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(`LemonSqueezy checkout failed: ${res.status}`);
  }

  const data = await res.json();
  return data.data.attributes.url;
}

export async function cancelSubscription(
  subscriptionId: string
): Promise<void> {
  const res = await lsFetch(`/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    throw new Error(`LemonSqueezy cancel failed: ${res.status}`);
  }
}

export async function verifyWebhook(
  payload: Buffer,
  signature: string
): Promise<boolean> {
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET ?? '';
  const hash = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(hash, 'hex'),
    Buffer.from(signature.replace('sha256=', ''), 'hex')
  );
}

export async function getCustomerPortalUrl(
  customerId: string
): Promise<string> {
  const res = await lsFetch(`/customers/${customerId}`);
  if (!res.ok) {
    throw new Error(`LemonSqueezy customer fetch failed: ${res.status}`);
  }
  const data = await res.json();
  return data.data.attributes.urls?.customer_portal ?? '';
}
