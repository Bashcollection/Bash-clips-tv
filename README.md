# Bash Clips TV

Micro-drama streaming app. The front end is index.html, and the two payment functions are in api/. Both run on Vercel.

## Files
- index.html: the app (sign-in, catalog, unlock, coin wallet, Flutterwave checkout)
- logo.webp: the Bash Clips logo
- api/create-payment.js: sets the price for a coin pack on the server
- api/verify-payment.js: confirms the payment with Flutterwave, then adds coins
- lib/shared.js: pack prices and the sign-in check used by both payment functions

## Environment variables (Vercel → Settings → Environment Variables)
- SUPABASE_URL: https://wmoquxhnaoxeukoxfjod.supabase.co
- SUPABASE_PUBLISHABLE_KEY: the publishable key (sb_publishable_...)
- SUPABASE_SERVICE_ROLE_KEY: the service_role key from Supabase → Settings → API. Secret. Never put it in a file.
- FLW_SECRET_KEY: the Flutterwave secret key (FLWSECK_...). Secret.

## Supabase settings
- Authentication → URL Configuration: add your Vercel URL to Redirect URLs.
- Authentication → Providers → Google: enable it and add the Google client ID and secret.

## Deploy
Import the GitHub repo in Vercel (Add New → Project), add the environment variables above, then click Deploy.
