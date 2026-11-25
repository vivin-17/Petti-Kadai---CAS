import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const sessionAge = 12 * 60 * 60;
const attemptLimit = 10;
const attemptWindow = 15 * 60;
let localAttempts = 0;
let localReset = 0;
const assets = new Map([
  ['app.js', 'text/javascript; charset=utf-8'],
  ['db.js', 'text/javascript; charset=utf-8'],
  ['style.css', 'text/css; charset=utf-8'],
]);

export function isConfigured(env, secure = false) {
  if (!/^\d{6}$/.test(env.PETTI_PASSCODE ?? '') || !/^[a-f0-9]{64}$/i.test(env.PETTI_SESSION_SECRET ?? '')) return false;
  if (!secure) return true;
  return env.UPSTASH_REDIS_REST_URL?.startsWith('https://') && Boolean(env.UPSTASH_REDIS_REST_TOKEN);
}

async function allowAttempt(env, secure) {
  if (!secure) {
    const now = Date.now();
    if (now >= localReset) {
      localAttempts = 0;
      localReset = now + attemptWindow * 1000;
    }
    return ++localAttempts <= attemptLimit;
  }
  const script = `
    local count = redis.call("INCR", KEYS[1])
    if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
    return count
  `;
  const key = 'petti-kada:unlock:' + (env.VERCEL_ENV ?? 'production');
  const response = await fetch(env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + env.UPSTASH_REDIS_REST_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(['EVAL', script, '1', key, String(attemptWindow)]),
    signal: AbortSignal.timeout(4000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('Attempt counter unavailable');
  const { result } = await response.json();
  if (!Number.isSafeInteger(result) || result < 1) throw new Error('Invalid attempt count');
  return result <= attemptLimit;
}

function digest(value) {
  return createHash('sha256').update(value).digest();
}

function signature(value, env) {
  return createHmac('sha256', Buffer.from(env.PETTI_SESSION_SECRET, 'hex'))
    .update(digest(env.PETTI_PASSCODE))
    .update(value)
    .digest();
}

function sessionCookie(value, age, secure) {
  const name = secure ? '__Host-petti_session' : 'petti_session';
  return name + '=' + value + '; Path=/; Max-Age=' + age + '; HttpOnly; SameSite=Strict' + (secure ? '; Secure' : '');
}

function authenticated(cookie, env, secure) {
  const name = secure ? '__Host-petti_session' : 'petti_session';
  const token = (cookie ?? '').split(';').map(part => part.trim()).find(part => part.startsWith(name + '='))?.slice(name.length + 1);
  if (!token || !/^\d{10}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)) return false;
  const [expires, nonce, mac] = token.split('.');
  if (Number(expires) <= Math.floor(Date.now() / 1000)) return false;
  return timingSafeEqual(signature(expires + '.' + nonce, env), Buffer.from(mac, 'hex'));
}

function unlockPage(message = '') {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Unlock Petti Kada</title>
  <style>
    *{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;background:#f8f6ef;color:#202c22;font:16px/1.5 system-ui,sans-serif}
    main{width:min(100%,400px);padding:30px;background:#fffefa;border:1px solid #dedfd4;border-radius:16px}
    h1{font:2.2rem Georgia,serif;margin:0}p{margin:12px 0}.error{color:#8b2c21}label{font-weight:650}
    input,button{display:block;width:100%;font:inherit;border-radius:8px;padding:10px;margin-top:7px}
    input{border:1px solid #8d9c8e}button{cursor:pointer;color:white;background:#244d36;border:0;margin-top:16px;font-weight:650}
    :focus-visible{outline:3px solid #367e58;outline-offset:3px}
  </style>
</head>
<body><main>
  <h1>Petti Kada</h1><p>Enter the stall passcode to open the dashboard.</p>
  ${message ? '<p class="error" role="alert">' + message + '</p>' : ''}
  <form action="/unlock" method="post">
    <label for="passcode">Passcode</label>
    <input id="passcode" name="passcode" type="password" required inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="current-password">
    <button type="submit">Unlock dashboard</button>
  </form>
</main></body></html>`;
}

function send(response, status, body, type = 'text/plain; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type });
  response.end(body);
}

function redirect(response) {
  response.writeHead(303, { Location: '/' });
  response.end();
}

async function readPasscode(request) {
  if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers['content-type'] ?? '')) return '';
  if (Number(request.headers['content-length']) > 2048) return '';
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 2048) return '';
    chunks.push(chunk);
  }
  return new URLSearchParams(Buffer.concat(chunks).toString('utf8')).get('passcode') ?? '';
}

export async function handleRequest(request, response, route, env, secure) {
  response.setHeader('Cache-Control', 'private, no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'none'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  if (!isConfigured(env, secure)) return send(response, 503, 'The stall dashboard is awaiting configuration.');

  const html = 'text/html; charset=utf-8';
  if (request.method === 'POST' && (route === 'unlock' || route === 'lock')) {
    if (request.headers['sec-fetch-site'] === 'cross-site') return send(response, 403, 'Forbidden');
    if (route === 'lock') {
      response.setHeader('Set-Cookie', sessionCookie('', 0, secure));
      return redirect(response);
    }
    try {
      const passcode = await readPasscode(request);
      if (!/^\d{6}$/.test(passcode)) {
        return send(response, 401, unlockPage('Enter the six-digit passcode.'), html);
      }
      if (!await allowAttempt(env, secure)) {
        return send(response, 429, unlockPage('Too many unlock attempts. Try again in 15 minutes.'), html);
      }
      if (!timingSafeEqual(digest(passcode), digest(env.PETTI_PASSCODE))) {
        return send(response, 401, unlockPage('Incorrect passcode. Try again.'), html);
      }
      const session = (Math.floor(Date.now() / 1000) + sessionAge) + '.' + randomBytes(16).toString('hex');
      response.setHeader('Set-Cookie', sessionCookie(session + '.' + signature(session, env).toString('hex'), sessionAge, secure));
      return redirect(response);
    } catch {
      return send(response, 503, unlockPage('Unlock is temporarily unavailable. Try again shortly.'), html);
    }
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return send(response, 405, 'Method not allowed');
  }
  if (route !== 'index' && !assets.has(route)) return send(response, 404, 'Not found');
  const unlocked = authenticated(request.headers.cookie, env, secure);
  if (!unlocked) {
    if (route === 'index') return send(response, 200, unlockPage(), html);
    return send(response, 401, 'Unlock the dashboard to continue.');
  }

  try {
    if (route === 'index') {
      const page = await readFile(join(process.cwd(), 'dist', 'index.html'), 'utf8');
      return send(response, 200, page
        .replace('</head>', '<meta name="petti-protected" content="true"></head>')
        .replace('<!-- lock control -->', '<form action="/lock" method="post"><button class="outline" type="submit">Lock</button></form>'), html);
    }
    const file = await readFile(join(process.cwd(), 'dist', route));
    return send(response, 200, file, assets.get(route));
  } catch {
    return send(response, 500, 'The dashboard could not be loaded.');
  }
}
