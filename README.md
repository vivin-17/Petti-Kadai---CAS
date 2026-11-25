# Petti Kada

A single-stall dashboard for taking orders and tracking Cash and UPI sales.

## Run on your computer

Install Node.js 22. From this repository, run:

```sh
cp .env.example .env
openssl rand -hex 32
```

In `.env`, set `PETTI_PASSCODE` to your six-digit code and `PETTI_SESSION_SECRET` to the generated value. Preserve any leading zeros. Start the server:

```sh
npm start
```

Open [Petti Kada on localhost](http://127.0.0.1:3000/) and enter the passcode. The server listens on this computer only. The real `.env` is ignored by Git. Only the empty `.env.example` belongs in the repository.

## Push to GitHub

Create an empty GitHub repository, then run the following from this folder with its real URL:

```sh
git remote add github https://github.com/vivin-17/Petti-Kadai---CAS.git
git push -u github HEAD:main
```

## Deploy to Vercel

1. Import the GitHub repository in Vercel. If this is a standalone repo, keep the project root at the repository root and use the **Other** framework preset. The checked-in configuration handles routing.
2. Create an [Upstash Redis database](https://upstash.com/docs/redis/features/restapi) to count unlock attempts across Vercel instances. Copy its HTTPS REST URL and standard REST token.
3. In Vercel, add `PETTI_PASSCODE`, `PETTI_SESSION_SECRET`, `UPSTASH_REDIS_REST_URL`, and `UPSTASH_REDIS_REST_TOKEN` as **Production** environment variables. Use the **Secret** type for the passcode, session secret, and token. Use `openssl rand -hex 32` for the session secret. Add separate Preview values if you need working previews.
4. Deploy and open the production URL in a private browser window. It should show the unlock form first. After signing in, use **Lock** to close the session on a shared device.
5. When changing an environment variable, redeploy. Vercel applies changes to new deployments. Remove any older deployments you no longer want accessible.

The passcode is verified on the server. The app allows 10 six-digit unlock attempts per 15-minute window across each deployment environment. An active session keeps working if unlock attempts are limited. Dashboard files require a signed session cookie that expires after 12 hours. Hosted access stays locked if required settings are missing. Keep `dist` outside Vercel's public output directory.

Menu items and orders live in the browser's IndexedDB. Localhost, the existing Sites URL, and Vercel each have separate records. Devices also have separate records. The passcode-protected version requires an online connection to open or reload in order to verify the session.
