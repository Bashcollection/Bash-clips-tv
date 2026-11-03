// Diagnostic endpoint. Open /api/health in the browser after deploying.
// Reports which checks pass. Never returns secret values.
// Remove this file once payments work.

const REQUIRED = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'FLW_SECRET_KEY'];

export default async function handler(req, res) {
  const report = { node: process.version, env: {}, checks: {} };

  // 1. Environment variables: present or missing, plus a length hint (never the value)
  for (const name of REQUIRED) {
    const v = process.env[name];
    report.env[name] = v ? `set (${v.length} chars)` : 'MISSING';
  }
  // Common mistake: a trailing space or newline pasted into Vercel
  for (const name of REQUIRED) {
    const v = process.env[name];
    if (v && v !== v.trim()) report.env[name] += ' - has leading/trailing spaces, remove them';
  }

  // 2. Supabase: can the service key read a table?
  const sbUrl = (process.env.SUPABASE_URL || '').trim();
  const sbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (sbUrl && sbKey) {
    try {
      const r = await fetch(`${sbUrl}/rest/v1/series?select=id&limit=1`, {
        headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` },
      });
      report.checks.supabase_service_key = r.ok
        ? 'OK'
        : `FAILED: HTTP ${r.status}. Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service_role, not publishable).`;
    } catch (err) {
      report.checks.supabase_service_key = 'FAILED: network error: ' + err.message;
    }
  } else {
    report.checks.supabase_service_key = 'SKIPPED: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY';
  }

  // 3. Flutterwave: does the secret key authenticate?
  const flw = (process.env.FLW_SECRET_KEY || '').trim();
  if (flw) {
    try {
      const r = await fetch('https://api.flutterwave.com/v3/transactions?page=1&size=1', {
        headers: { Authorization: `Bearer ${flw}` },
      });
      report.checks.flutterwave_secret_key = r.ok
        ? 'OK'
        : `FAILED: HTTP ${r.status}. Check FLW_SECRET_KEY is the SECRET key (FLWSECK-...) from the same account as the public key.`;
    } catch (err) {
      report.checks.flutterwave_secret_key = 'FAILED: network error: ' + err.message;
    }
  } else {
    report.checks.flutterwave_secret_key = 'SKIPPED: FLW_SECRET_KEY missing';
  }

  // 4. Summary
  const envOk = REQUIRED.every(n => process.env[n]);
  const allOk = envOk && report.checks.supabase_service_key === 'OK' && report.checks.flutterwave_secret_key === 'OK';
  report.summary = allOk
    ? 'All checks passed. If payment still fails, send the Vercel runtime log for /api/create-payment.'
    : 'One or more checks failed. Fix the items marked MISSING or FAILED, then redeploy.';

  res.status(200).json(report);
}
