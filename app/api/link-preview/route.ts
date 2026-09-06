const MAX_HTML_BYTES = 350_000;

function normalizeUrl(value: unknown) {
  const raw = String(value || '').trim();
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only public HTTP or HTTPS websites can be added.');
  const host = url.hostname.toLowerCase();
  const privateIpv4 = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
  if (host === 'localhost' || host === '::1' || host.endsWith('.local') || privateIpv4.test(host)) throw new Error('Local and private network addresses cannot be previewed.');
  return url;
}

function decodeHtml(value: string) {
  const entities: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_, entity: string) => {
    if (entity[0] === '#') { const radix = entity[1]?.toLowerCase() === 'x' ? 16 : 10; const number = parseInt(entity.slice(radix === 16 ? 2 : 1), radix); return Number.isFinite(number) ? String.fromCodePoint(number) : ''; }
    return entities[entity.toLowerCase()] || '';
  }).replace(/\s+/g, ' ').trim();
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, 'i'),
  ];
  for (const pattern of patterns) { const match = html.match(pattern); if (match?.[1]) return decodeHtml(match[1]); }
  return '';
}

async function fetchPublicPage(start: URL) {
  let current = start;
  for (let redirects = 0; redirects < 4; redirects += 1) {
    const response = await fetch(current, { redirect: 'manual', headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'GarageGuideLinkPreview/1.0' }, signal: AbortSignal.timeout(8000) });
    if (response.status >= 300 && response.status < 400) { const location = response.headers.get('location'); if (!location) throw new Error('The website returned an incomplete redirect.'); current = normalizeUrl(new URL(location, current).href); continue; }
    if (!response.ok) throw new Error(`The website responded with ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) throw new Error('That address is not an HTML website.');
    const reader = response.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    if (!reader) throw new Error('The website returned no readable content.');
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_HTML_BYTES) { await reader.cancel(); break; } chunks.push(value); }
    const combined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0)); let offset = 0; for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }
    return { html: new TextDecoder().decode(combined), url: current.href };
  }
  throw new Error('The website redirected too many times.');
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { url?: unknown };
    const { html, url } = await fetchPublicPage(normalizeUrl(body.url));
    const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '';
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return Response.json({ url, title: meta(html, 'og:title') || decodeHtml(titleTag) || hostname, description: meta(html, 'og:description') || meta(html, 'description'), organization: meta(html, 'og:site_name') || hostname }, { headers: { 'cache-control': 'no-store' } });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'The website could not be read.';
    return Response.json({ error: message }, { status: 400, headers: { 'cache-control': 'no-store' } });
  }
}
