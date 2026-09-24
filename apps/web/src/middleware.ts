import { defineMiddleware } from 'astro:middleware';

const eventPathPattern = /^\/eventos\/([^/]+)\/?$/;
const spanishEventPathPattern = /^\/es\/eventos\/([^/]+)\/?$/;
const privatePathPattern = /^\/(?:admin|adm)(?:\/|$)|^\/r\//;

function applySearchHeaders(response: Response, pathname: string) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) return response;

  if (privatePathPattern.test(pathname)) {
    response.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
  } else if (response.status >= 200 && response.status < 300) {
    response.headers.set('x-robots-tag', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');
  }

  return response;
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = context.url;
  const spanishMatch = url.pathname.match(spanishEventPathPattern);

  if (spanishMatch) {
    const target = new URL(url);
    target.pathname = `/eventos/${spanishMatch[1]}`;
    target.searchParams.set('lang', 'es');
    const response = await next(target);
    return applySearchHeaders(response, url.pathname);
  }

  const eventMatch = url.pathname.match(eventPathPattern);
  if (eventMatch && url.searchParams.has('lang')) {
    const language = url.searchParams.get('lang');
    const clean = new URL(url);
    clean.searchParams.delete('lang');

    if (language === 'es') {
      clean.pathname = `/es/eventos/${eventMatch[1]}`;
    } else {
      clean.pathname = `/eventos/${eventMatch[1]}`;
    }

    return Response.redirect(clean, 308);
  }

  const response = await next();
  return applySearchHeaders(response, url.pathname);
});
