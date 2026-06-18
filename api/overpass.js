// api/overpass.js
// Vercel Serverless Function: Proxies Overpass API requests server-side.
// This bypasses browser CORS and the 406 Not Acceptable error caused by
// Overpass requiring a valid User-Agent header (which browsers forbid JS from setting).

export default async function handler(req, res) {
  // Only allow POST requests from our frontend
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid query parameter' });
  }

  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  let lastError = null;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'AlongTheRoute/1.0 (https://along-the-route.vercel.app)',
          'Referer': 'https://along-the-route.vercel.app'
        },
        body: `data=${encodeURIComponent(query)}`
      });

      if (response.ok) {
        const data = await response.json();
        // Allow CORS from our own origin
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        return res.status(200).json(data);
      }

      lastError = `Endpoint ${endpoint} returned ${response.status}`;
    } catch (err) {
      lastError = `Endpoint ${endpoint} failed: ${err.message}`;
      console.error(lastError);
    }
  }

  return res.status(502).json({ error: 'All Overpass endpoints failed', detail: lastError });
}
