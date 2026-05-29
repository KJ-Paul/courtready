// Whoop proxy — handles both token exchange AND API data fetches
// Needed because Whoop blocks direct browser requests (CORS)

const https = require('https');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function whoopRequest(method, path, body, headers) {
  return new Promise((resolve) => {
    const reqHeaders = {
      ...headers,
      ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) } : {}),
    };
    const options = { hostname: 'api.prod.whoop.com', path, method, headers: reqHeaders };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', (err) => resolve({ status: 500, body: JSON.stringify({ error: err.message }) }));
    if (body) req.write(body);
    req.end();
  });
}

exports.handler = async (event) => {
  // Health check
  if (event.httpMethod === 'GET' && !event.queryStringParameters?.path) {
    return { statusCode: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'text/plain' }, body: 'CourtReady Whoop proxy running' };
  }

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  // API data fetch (GET with ?path=/developer/v1/recovery etc)
  if (event.httpMethod === 'GET' && event.queryStringParameters?.path) {
    const apiPath = event.queryStringParameters.path;
    const authHeader = event.headers['authorization'] || event.headers['Authorization'];
    if (!authHeader) return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'No auth header' }) };
    const result = await whoopRequest('GET', apiPath, null, { Authorization: authHeader });
    return { statusCode: result.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: result.body };
  }

  // Token exchange (POST)
  if (event.httpMethod === 'POST') {
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;
    if (!clientSecret) return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'WHOOP_CLIENT_SECRET not set' }) };
    const params = new URLSearchParams(event.body || '');
    params.set('client_secret', clientSecret);
    const result = await whoopRequest('POST', '/oauth/oauth2/token', params.toString(), {});
    return { statusCode: result.status, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }, body: result.body };
  }

  return { statusCode: 405, headers: CORS_HEADERS, body: 'Method not allowed' };
};
