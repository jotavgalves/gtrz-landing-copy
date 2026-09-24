import type { APIRoute } from 'astro';
import { getHomePage } from '@/lib/cms';
import { API_BASE } from '@/lib/api';

const SITE = 'https://gtrz.com.br';

const staticPages = [
  '/',
  '/contato',
  '/parcerias',
  '/privacidade',
  '/privacidade-parcerias',
  '/privacidade-profissionais',
  '/sugestoes',
  '/termos',
  '/trabalhe-conosco'
];

const xml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const absolute = (path: string) => new URL(path, SITE).toString();
const esVariant = (path: string) => {
  const url = new URL(path, SITE);
  url.searchParams.set('lang', 'es');
  return url.toString();
};

const localizedEntry = (ptUrl: string, esUrl: string, imageUrl?: string) => `
  <url>
    <loc>${xml(ptUrl)}</loc>
    <xhtml:link rel="alternate" hreflang="pt-BR" href="${xml(ptUrl)}" />
    <xhtml:link rel="alternate" hreflang="es" href="${xml(esUrl)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${xml(ptUrl)}" />${imageUrl ? `
    <image:image><image:loc>${xml(imageUrl)}</image:loc></image:image>` : ''}
  </url>
  <url>
    <loc>${xml(esUrl)}</loc>
    <xhtml:link rel="alternate" hreflang="pt-BR" href="${xml(ptUrl)}" />
    <xhtml:link rel="alternate" hreflang="es" href="${xml(esUrl)}" />
    <xhtml:link rel="alternate" hreflang="x-default" href="${xml(ptUrl)}" />${imageUrl ? `
    <image:image><image:loc>${xml(imageUrl)}</image:loc></image:image>` : ''}
  </url>`;

function eventImage(event: any) {
  const direct = event?.hero_media_id;
  if (direct) return `${API_BASE}/api/media/${encodeURIComponent(direct)}`;
  try {
    const theme = JSON.parse(event?.theme_json || '{}');
    const id = theme.hubCardMediaId || theme.hub_card_media_id || theme.posterMediaId || theme.poster_media_id;
    return id ? `${API_BASE}/api/media/${encodeURIComponent(id)}` : '';
  } catch {
    return '';
  }
}

export const GET: APIRoute = async () => {
  const payload = await getHomePage();
  const bySlug = new Map<string, any[]>();

  for (const event of payload.events || []) {
    if (!event?.slug || !['published', 'sales_open', 'sold_out'].includes(event.status)) continue;
    const rows = bySlug.get(event.slug) || [];
    rows.push(event);
    bySlug.set(event.slug, rows);
  }

  const entries: string[] = [];

  for (const path of staticPages) {
    entries.push(localizedEntry(absolute(path), esVariant(path)));
  }

  for (const [slug, rows] of bySlug) {
    const event = rows[0];
    const ptUrl = absolute(`/eventos/${encodeURIComponent(slug)}`);
    const hasSpanish = rows.some((row) => row.locale === 'es');
    const esUrl = absolute(`/es/eventos/${encodeURIComponent(slug)}`);
    const imageUrl = eventImage(event);

    if (hasSpanish) {
      entries.push(localizedEntry(ptUrl, esUrl, imageUrl));
    } else {
      entries.push(`
  <url>
    <loc>${xml(ptUrl)}</loc>${imageUrl ? `
    <image:image><image:loc>${xml(imageUrl)}</image:loc></image:image>` : ''}
  </url>`);
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${entries.join('')}
</urlset>\n`;

  return new Response(body, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=300, s-maxage=900'
    }
  });
};
