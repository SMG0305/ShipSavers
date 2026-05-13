// /api/lead.js — serverless proxy to Web3Forms
//
// Sits on shipsavers.com as a same-origin endpoint. The browser POSTs here
// (which corporate firewalls allow because the visitor already loaded
// shipsavers.com), and this function forwards the request to Web3Forms
// from your server's IP. Visitor's corporate network never sees a
// third-party form-service domain.
//
// Drop-in for Vercel (Node 18+ runtime). Place at: api/lead.js (project root).
// Notes for Netlify and Cloudflare Pages are at the bottom of this file.

export const config = {
    api: {
        bodyParser: false,      // we forward the raw multipart body untouched
        sizeLimit: '10mb',      // Vercel Hobby cap is ~4.5MB; Pro is 50MB.
    },
};

import { Buffer } from 'node:buffer';

export default async function handler(req, res) {
    // CORS: same-origin in production but keep permissive for OPTIONS preflight
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(204).end();
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Collect the raw incoming body (multipart/form-data with access_key + file)
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks);

        // Forward to Web3Forms with the SAME Content-Type header
        // (preserves the multipart boundary). The access_key inside the
        // FormData tells Web3Forms which account to route to.
        const upstream = await fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: {
                'Content-Type': req.headers['content-type'],
                // Forward visitor origin so Web3Forms' "Restrict to Domains"
                // sees shipsavers.com, not Vercel's runtime origin.
                'Origin': 'https://www.shipsavers.com',
                'Referer': req.headers['referer'] || 'https://www.shipsavers.com/',
            },
            body: body,
        });

        const text = await upstream.text();
        res.status(upstream.status);
        const upstreamCt = upstream.headers.get('content-type');
        if (upstreamCt) res.setHeader('Content-Type', upstreamCt);
        return res.send(text);
    } catch (err) {
        console.error('[lead proxy] error:', err);
        return res.status(500).json({
            error: 'Proxy error',
            detail: err.message,
        });
    }
}

// ============================================================================
// Adaptation notes for other platforms
// ============================================================================
//
// NETLIFY (netlify/functions/lead.js):
//
//   import { Buffer } from 'node:buffer';
//   export const handler = async (event) => {
//       if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'No' };
//       const body = Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
//       const r = await fetch('https://api.web3forms.com/submit', {
//           method: 'POST',
//           headers: { 'Content-Type': event.headers['content-type'] },
//           body,
//       });
//       return { statusCode: r.status, body: await r.text() };
//   };
//   (Update fetch URL in index.html to '/.netlify/functions/lead'.)
//
// CLOUDFLARE PAGES (functions/api/lead.js):
//
//   export async function onRequestPost({ request }) {
//       const body = await request.arrayBuffer();
//       const r = await fetch('https://api.web3forms.com/submit', {
//           method: 'POST',
//           headers: { 'Content-Type': request.headers.get('content-type') },
//           body,
//       });
//       return new Response(await r.text(), { status: r.status });
//   }
//   (No URL change needed; Cloudflare auto-routes functions/api/lead.js to /api/lead.)
