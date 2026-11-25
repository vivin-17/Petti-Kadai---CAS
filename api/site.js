import { handleRequest } from '../gate.js';

export default function site(request, response) {
  const url = new URL(request.url, 'https://localhost');
  return handleRequest(request, response, url.searchParams.get('petti_route'), process.env, true);
}
