import { createServer } from 'node:http';
import { handleRequest, isConfigured } from './gate.js';

if (!isConfigured(process.env)) {
  console.error('Set a six-digit PETTI_PASSCODE and a 64-character hexadecimal PETTI_SESSION_SECRET in .env.');
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3000);
const paths = new Map([
  ['/', 'index'],
  ['/unlock', 'unlock'],
  ['/lock', 'lock'],
  ['/app.js', 'app.js'],
  ['/db.js', 'db.js'],
  ['/style.css', 'style.css'],
]);
createServer((request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  return handleRequest(request, response, paths.get(path), process.env, false);
}).listen(port, '127.0.0.1', () => console.log('Petti Kada is running at http://127.0.0.1:' + port));
