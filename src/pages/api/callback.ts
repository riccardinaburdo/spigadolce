export const prerender = false;

import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('Missing code parameter', { status: 400 });
  }

  const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });

  const data = await tokenResponse.json();

  if (data.error) {
    return new Response(`OAuth error: ${data.error_description || data.error}`, { status: 400 });
  }

  const token = data.access_token;
  const provider = 'github';

  const html = `<!doctype html>
<html>
<head><title>Authenticating...</title></head>
<body>
<script>
  (function() {
    function receiveMessage(e) {
      console.log("receiveMessage %o", e);
      window.opener.postMessage(
        'authorization:${provider}:success:{"token":"${token}","provider":"${provider}"}',
        e.origin
      );
      window.removeEventListener("message", receiveMessage, false);
    }
    window.addEventListener("message", receiveMessage, false);
    window.opener.postMessage("authorizing:${provider}", "*");
  })();
</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html' },
  });
};
