# Petti Kada

A single-stall dashboard for taking orders and tracking Cash and UPI sales.

## Run on your computer

Install Node.js 22. From this repository, run:

```sh
cp .env.example .env
openssl rand -hex 12
openssl rand -hex 32
```

In `.env`, set `PETTI_PASSCODE` to the first generated value and `PETTI_SESSION_SECRET` to the second. You can use a different random passcode of at least 16 characters. Keep the two values separate. Start the server:

```sh
npm start
```

Open [Petti Kada on localhost](http://127.0.0.1:3000/) and enter the passcode. The server listens on this computer only. The real `.env` is ignored by Git. Only the empty `.env.example` belongs in the repository.

## Push to GitHub

Create an empty GitHub repository, then run the following from this folder with its real URL:

```sh
git remote add github https://github.com/YOUR-ACCOUNT/petti-kada.git
git push -u github HEAD:main
```

## Deploy to Vercel

1. Import the GitHub repository in Vercel. If this is a standalone repo, keep the project root at the repository root and use the **Other** framework preset. The checked-in configuration handles routing.
2. Add `PETTI_PASSCODE` and `PETTI_SESSION_SECRET` as **Secret** environment variables for **Production** before deploying. Generate independent random values for production. Add separate Preview values if you need working previews.
3. Deploy and open the production URL in a private browser window. It should show the unlock form first. After signing in, use **Lock** to close the session on a shared device.
4. When changing either secret, redeploy. Vercel applies changed environment variables to new deployments. Remove any older deployments you no longer want accessible.

The passcode is verified on the server. Dashboard files require a signed session cookie that expires after 12 hours. Access stays locked if either setting is missing. Keep `dist` outside Vercel's public output directory.

Menu items and orders live in the browser's IndexedDB. Localhost, the existing Sites URL, and Vercel each have separate records. Devices also have separate records. The passcode-protected version requires an online connection to open or reload in order to verify the session.
