// Whoop OAuth token exchange proxy
// Handles CORS and injects client_secret server-side (never exposed to browser)

const https = require('https');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  // Health check
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' },
      body: 'CourtReady Whoop proxy is running',
    };
  }

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method not allowed' };
  }

  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  if (!clientSecret) {
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: 'WHOOP_CLIENT_SECRET environment variable not set in Netlify' }),
    };
  }

  // Parse incoming body and inject client_secret
  const incomingParams = new URLSearchParams(event.body || '');
  incomingParams.set('client_secret', clientSecret);
  const body = incomingParams.toString();

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.prod.whoop.com',
      path: '/oauth/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: data,
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        statusCode: 500,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: err.message }),
      });
    });

    req.write(body);
    req.end();
  });
};
