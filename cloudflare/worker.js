function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    const headers = { Vary: 'Origin' };
    if (origin && allowed.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
    if (origin && !allowed.includes(origin)) return json({ error: 'Origin not allowed' }, 403, headers);
    const url = new URL(request.url);
    if (url.pathname !== '/messages') return json({ error: 'Not found' }, 404, headers);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    try {
      if (request.method === 'GET') {
        const result = await env.DB.prepare('SELECT id, name, text, time FROM messages ORDER BY time DESC, id DESC LIMIT 150').all();
        return json({ messages: result.results.reverse() }, 200, headers);
      }
      if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, { ...headers, Allow: 'GET, POST, OPTIONS' });
      if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return json({ error: 'Expected JSON' }, 415, headers);
      if (Number(request.headers.get('Content-Length')) > 8192) return json({ error: 'Message too large' }, 413, headers);
      const body = await request.text();
      if (body.length > 8192) return json({ error: 'Message too large' }, 413, headers);
      let data;
      try { data = JSON.parse(body); } catch { return json({ error: 'Invalid JSON' }, 400, headers); }
      if (!data || typeof data.id !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(data.id) || typeof data.name !== 'string' || typeof data.text !== 'string') return json({ error: 'Invalid message' }, 400, headers);
      const name = data.name.trim(), text = data.text.trim();
      if (!name || name.length > 16 || !text || text.length > 500) return json({ error: 'Invalid message' }, 400, headers);
      await env.DB.prepare('INSERT INTO messages (id, name, text, time) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(id) DO NOTHING').bind(data.id, name, text, Date.now()).run();
      const message = await env.DB.prepare('SELECT id, name, text, time FROM messages WHERE id = ?1').bind(data.id).first();
      return json({ message }, 200, headers);
    } catch { return json({ error: 'Cloud unavailable' }, 503, headers); }
  }
};
