// Confirms a Flutterwave payment and adds the coins once.
// Self-contained: no imports from other project files.

// Must match the amounts in create-payment.js.
const COINS_BY_PRICE = {
  NGN: { 1500: 100, 4000: 320, 8500: 800, 17000: 1850 },
  USD: { 1.15: 100, 3: 320, 6.5: 800, 12.75: 1850 },
};

function fail(res, step, message, status = 400) {
  console.error('verify-payment failed at ' + step + ': ' + message);
  return res.status(status).json({ error: message, step });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const SB_URL = (process.env.SUPABASE_URL || '').trim();
  const SB_PUB = (process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const SB_SERVICE = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const FLW_SECRET = (process.env.FLW_SECRET_KEY || '').trim();
  if (!SB_URL || !SB_PUB || !SB_SERVICE || !FLW_SECRET) {
    return fail(res, 'config', 'Payments are not set up yet. Please try again later.', 500);
  }

  // 1. Who is asking?
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(res, 'auth', 'Please sign in to confirm your payment.', 401);

  let userId;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/user`, {
      headers: { apikey: SB_PUB, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return fail(res, 'auth', 'Your sign-in has expired. Please sign in again.', 401);
    userId = (await r.json()).id;
  } catch (err) {
    return fail(res, 'auth', 'Could not check your sign-in. Please try again.', 502);
  }

  const { transaction_id, tx_ref } = req.body || {};
  if (!transaction_id || !tx_ref) return fail(res, 'input', 'Payment details are missing.');

  // 2. Find the pending purchase that this user made.
  let pending;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/user_transactions?tx_ref=eq.${encodeURIComponent(tx_ref)}&user_id=eq.${userId}&select=tx_ref,amount_paid,status`,
      { headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` } }
    );
    if (!r.ok) return fail(res, 'lookup', 'Could not find your purchase. ' + (await r.text()).slice(0, 200), 500);
    const rows = await r.json();
    if (!rows.length) return fail(res, 'lookup', 'This purchase was not found on your account.', 404);
    pending = rows[0];
  } catch (err) {
    return fail(res, 'lookup', 'Could not reach the database. ' + err.message, 502);
  }

  // Already credited? Do nothing, so a refresh never adds coins twice.
  if (pending.status === 'successful') return res.status(200).json({ ok: true, already: true });

  // 3. Ask Flutterwave whether the payment really succeeded.
  let flw;
  try {
    const r = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transaction_id)}/verify`, {
      headers: { Authorization: `Bearer ${FLW_SECRET}` },
    });
    flw = await r.json();
    if (!r.ok) return fail(res, 'flutterwave', 'Flutterwave could not confirm the payment (' + r.status + ').', 502);
  } catch (err) {
    return fail(res, 'flutterwave', 'Could not reach Flutterwave. ' + err.message, 502);
  }

  const data = flw.data || {};
  if (data.status !== 'successful') return fail(res, 'flutterwave', 'The payment is not complete yet.');
  if (data.tx_ref !== tx_ref) return fail(res, 'match', 'The payment does not match this purchase.');

  // 4. Check the amount and currency match what the server priced.
  const currency = data.currency;
  const coins = COINS_BY_PRICE[currency]?.[Number(data.amount)];
  if (!coins || Number(data.amount) !== Number(pending.amount_paid)) {
    return fail(res, 'amount', 'The amount paid does not match the coin pack.', 400);
  }

  // 5. Mark the purchase successful, then add the coins.
  try {
    const mark = await fetch(`${SB_URL}/rest/v1/user_transactions?tx_ref=eq.${encodeURIComponent(tx_ref)}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ status: 'successful' }),
    });
    if (!mark.ok) return fail(res, 'record', 'Could not update the purchase. ' + (await mark.text()).slice(0, 200), 500);

    const pr = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}&select=coin_balance`, {
      headers: { apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}` },
    });
    const prof = (await pr.json())[0];
    const newBalance = (prof?.coin_balance || 0) + coins;

    const up = await fetch(`${SB_URL}/rest/v1/profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: {
        apikey: SB_SERVICE, Authorization: `Bearer ${SB_SERVICE}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal',
      },
      body: JSON.stringify({ coin_balance: newBalance }),
    });
    if (!up.ok) return fail(res, 'credit', 'Payment received, but coins could not be added. Contact support with reference ' + tx_ref, 500);

    return res.status(200).json({ ok: true, credited: coins, balance: newBalance });
  } catch (err) {
    return fail(res, 'credit', 'Something went wrong while adding coins. Contact support with reference ' + tx_ref, 502);
  }
}
