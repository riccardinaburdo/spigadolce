export const prerender = false;

import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ redirect }) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const redirectUri = `${process.env.SITE || 'https://spigadolce.com'}/api/callback`;
  const scope = 'repo,user';

  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scope);

  return redirect(authUrl.toString(), 302);
};
