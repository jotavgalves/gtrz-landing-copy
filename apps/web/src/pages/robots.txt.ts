import type { APIRoute } from 'astro';

const robots = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /adm
Disallow: /r/

Sitemap: https://gtrz.com.br/sitemap.xml
`;

export const GET: APIRoute = () => new Response(robots, {
  headers: {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'public, max-age=3600, s-maxage=86400'
  }
});
