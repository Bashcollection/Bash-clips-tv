// Creates a pending coin purchase and returns the tx_ref the checkout needs.
// Self-contained: no imports from other project files.
// Prices and coin amounts live here, on the server, and cannot be changed by the browser.

const PACKS = {
  p100:  { coins: 100,  ngn: 1500,  usd: 1.15  },
  p300:  { coins: 320,  ngn: 4000,  usd: 3.00  },
  p700:  { coins: 800,  ngn: 8500,  usd: 6.50  },
  p1500: { coins: 1850, ngn: 17000, usd: 12.75 },
};

function fail(res, step, message, status = 400) {
  console.error('create-payment failed at ' + step + ': ' + message);
  return res.status(status).json({ error: message, step });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = (process.env.SUPABASE_URL || '').trim();
  const SB_PUB = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const SB_SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!SB_URL || !SB_PUB || !SB_SERVICE) {
    return fail(res, 'config', 'Payments are not set up yet. Please try again later.', 500);
  }

  // 1. Who is asking?
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(res, 'auth', 'Please sign in to buy coins.', 401);

  let userId, userEmail;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_PUB, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return fail(res, 'auth', 'Your sign-in has expired. Please sign in again.', 401);
    const u = await r.json();
    userId = u.id;
    userEmail = u.email;
  } catch (err) {
    return fail(res, 'auth', 'Could not check your sign-in. Please try again.', 502);
  }

  // 2. Which pack, and in which currency?
  const { packId, currency } = req.body || {};
  const pack = PACKS[packId];
  if (!pack) return fail(res, 'pack', 'That coin pack is not available.');
  if (currency !== 'NGN' && currency !== 'USD') return fail(res, 'currency', 'Choose Naira or USD.');

  const amount = currency === 'NGN' ? pack.ngn : pack.usd;
  const txRef = `bct_${userId.slice(0, 8)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // 3. Record the pending purchase so verification can match it later.
  try {
    const r = await fetch(`${SB_URL}/rest/v1/user_transactions`, {
      method: 'POST',
      headers: {
        apikey: SB_SERVICE,
        Authorization: `Bearer ${SB_SERVICE}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        tx_ref: txRef,
        amount_paid: amount,
        status: 'pending',
      }),
    });
    if (!r.ok) {
      const detail = await r.text();
      return fail(res, 'record', 'Could not record the purchase. ' + detail.slice(0, 200), 500);
    }
  } catch (err) {
    return fail(res, 'record', 'Could not reach the database. ' + err.message, 502);
  }

  return res.status(200).json({
    tx_ref: txRef,
    amount,
    currency,
    coins: pack.coins,
    email: userEmail,
  });
                  }
