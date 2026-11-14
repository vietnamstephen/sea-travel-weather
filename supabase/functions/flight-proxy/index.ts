import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.119.0';

const ENDPOINT = 'https://ai.variflight.com/servers/aviation/mcp';
const PROTOCOL = '2025-03-26';
class Failure extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function sanitize(tool: string, input: unknown): Record<string, string | number> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Failure(400, 'Invalid args');
  const source = input as Record<string, unknown>;
  const schemas: Record<string, string[]> = {
    searchFlightsByNumber: ['fnum', 'date', 'dep', 'arr'],
    searchFlightsByDepArr: ['date', 'dep', 'depcity', 'arr', 'arrcity', 'limit', 'detail'],
    getFutureWeatherByAirport: ['airport'],
  };
  const allowed = schemas[tool];
  if (!allowed || Object.keys(source).some((k) => !allowed.includes(k))) throw new Failure(400, 'Unsupported tool or args');
  const args: Record<string, string | number> = {};
  for (const key of Object.keys(source)) {
    const raw = source[key];
    if (key === 'limit') {
      if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 50) throw new Failure(400, 'Invalid limit');
      args[key] = raw; continue;
    }
    if (typeof raw !== 'string') throw new Failure(400, 'Invalid argument type');
    let value = raw.trim();
    if (['airport', 'dep', 'arr', 'fnum'].includes(key)) value = value.toUpperCase();
    if (['airport', 'dep', 'arr'].includes(key) && !/^[A-Z]{3}$/.test(value)) throw new Failure(400, 'Invalid airport');
    if (key === 'fnum' && !/^[A-Z0-9]{2}\d{1,4}[A-Z]?$/.test(value)) throw new Failure(400, 'Invalid flight number');
    if (key === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') throw new Failure(400, 'Invalid date');
      const date = new Date(value + 'T00:00:00Z');
      if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Failure(400, 'Invalid date');
    }
    if (['depcity', 'arrcity'].includes(key) && (!value || value.length > 120 || /[\x00-\x1f\x7f]/.test(value))) throw new Failure(400, 'Invalid city');
    if (key === 'detail' && value !== 'summary') throw new Failure(400, 'Invalid detail');
    args[key] = value;
  }
  if (tool === 'getFutureWeatherByAirport' && !args.airport) throw new Failure(400, 'Airport required');
  if (tool !== 'getFutureWeatherByAirport' && !args.date) throw new Failure(400, 'Date required');
  if (tool === 'searchFlightsByNumber' && !args.fnum) throw new Failure(400, 'Flight number required');
  if (tool === 'searchFlightsByDepArr') {
    if (!!args.dep === !!args.depcity || !!args.arr === !!args.arrcity) throw new Failure(400, 'Specify one origin and one destination');
    args.detail = 'summary';
    if (!args.limit) args.limit = 20;
  }
  return Object.fromEntries(Object.keys(args).sort().map((key) => [key, args[key]]));
}

type Rpc = { jsonrpc?: string; id?: number; result?: unknown; error?: { message?: string; code?: number } };
async function rpc(body: Record<string, unknown>, apiKey: string, session?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json', Accept: 'application/json, text/event-stream',
    'X-API-Key': apiKey, 'MCP-Protocol-Version': PROTOCOL,
  };
  if (session) headers['Mcp-Session-Id'] = session;
  const response = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  const sessionId = response.headers.get('Mcp-Session-Id') || session;
  // Notifications have no JSON-RPC response; cancel any response stream.
  if (body.id === undefined) {
    await response.body?.cancel();
    return { status: response.status, session: sessionId, message: null as Rpc | null, hint: '' };
  }
  let hint = '', message: Rpc | null = null;
  const accept = (text: string) => {
    hint = (hint + text).slice(0, 4096);
    try {
      const json = JSON.parse(text);
      const messages = Array.isArray(json) ? json : [json];
      message = messages.find((item: Rpc) => item && item.id === body.id) || message;
    } catch { /* Ignore SSE comments, pings and unrelated events. */ }
  };
  if ((response.headers.get('content-type') || '').includes('text/event-stream') && response.body) {
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '', size = 0;
    try {
      while (!message) {
        const { value, done } = await reader.read();
        if (done) { if (buffer.trim()) accept(buffer.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n')); break; }
        size += value.length;
        if (size > 2_000_000) throw new Failure(502, 'Upstream response too large');
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = /\r?\n\r?\n/.exec(buffer))) {
          const event = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          accept(event.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n'));
          if (message) break;
        }
      }
    } finally { await reader.cancel(); }
  } else {
    const text = await response.text();
    if (text.length > 2_000_000) throw new Failure(502, 'Upstream response too large');
    accept(text);
  }
  return { status: response.status, session: sessionId, message, hint };
}
async function callTool(tool: string, args: Record<string, unknown>, apiKey: string) {
  let id = 1;
  const call = (session?: string) => rpc({ jsonrpc: '2.0', id: id++, method: 'tools/call', params: { name: tool, arguments: args } }, apiKey, session);
  let response = await call();
  const errorText = response.message?.error?.message || response.hint;
  if ((response.status >= 400 || response.message?.error) && /initializ|session.*(missing|required|invalid|not found)|missing.*session|no.*session|session.*not.*(exist|found)/i.test(errorText)) {
    const init = await rpc({ jsonrpc: '2.0', id: id++, method: 'initialize', params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'sea-travel-weather', version: '1.0.0' } } }, apiKey);
    if (init.status >= 400 || !init.message?.result || init.message.error) throw new Failure(502, 'Flight provider initialization failed');
    const notification = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' }, apiKey, init.session);
    if (notification.status >= 400) throw new Failure(502, 'Flight provider initialization failed');
    response = await call(init.session);
  }
  if (response.status >= 400 || !response.message || response.message.error || response.message.result === undefined) {
    console.error('upstream_failed', JSON.stringify({ tool, status: response.status, error: response.message?.error?.message?.slice(0, 300), hint: response.hint.slice(0, 300) }));
    if (response.status === 401) throw new Failure(502, 'Flight provider key invalid');
    if (response.status === 403) throw new Failure(502, 'Flight provider balance or key disabled');
    throw new Failure(502, 'Flight provider request failed');
  }
  const result = response.message.result;
  if (result && typeof result === 'object' && 'isError' in result && result.isError) {
    console.error('tool_error', JSON.stringify({ tool, args, result: JSON.stringify(result).slice(0, 500) }));
    throw new Failure(404, 'No flight data found');
  }
  return result;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get('Origin') || '';
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || 'https://vietnamstephen.github.io').split(',').map((v) => v.trim()).filter(Boolean);
  const local = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const cors: Record<string, string> = {
    Vary: 'Origin', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store',
  };
  if (allowed.includes(origin) || local) cors['Access-Control-Allow-Origin'] = origin;
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  if (origin && !cors['Access-Control-Allow-Origin']) return reply(403, { ok: false, error: 'Origin not allowed' });
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return reply(405, { ok: false, error: 'POST required' });
  try {
    const authorization = request.headers.get('Authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization)) throw new Failure(401, 'Sign in required');
    const url = Deno.env.get('SUPABASE_URL'), anon = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY'), service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY');
    if (!url || !anon || !service) throw new Failure(503, 'Server configuration unavailable');
    const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: auth, error } = await userClient.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
    if (error || !auth.user) throw new Failure(401, 'Invalid session');
    const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: profile, error: profileError } = await admin.from('profiles').select('role,vip_until').eq('id', auth.user.id).maybeSingle();
    if (profileError || !profile || !(profile.role === 'admin' || (profile.role === 'vip' && (profile.vip_until == null || Date.parse(profile.vip_until) > Date.now())))) return reply(403, { ok: false, error: 'VIP only' });
    const text = await request.text();
    if (text.length > 4096) throw new Failure(413, 'Request too large');
    let body;
    try { body = JSON.parse(text); } catch { throw new Failure(400, 'Invalid JSON'); }
    if (!body || typeof body.tool !== 'string') throw new Failure(400, 'Tool required');
    const tool = body.tool, args = sanitize(tool, body.args);
    const cacheKey = tool + ':' + JSON.stringify(args);
    const { data: cached } = await admin.from('flight_cache').select('response, expires_at').eq('cache_key', cacheKey).maybeSingle();
    if (cached && Date.parse(cached.expires_at) > Date.now()) return reply(200, { ok: true, cached: true, data: cached.response });
    const apiKey = Deno.env.get('VARIFLIGHT_API_KEY');
    if (!apiKey) throw new Failure(503, 'Flight provider not configured');
    const result = await callTool(tool, args, apiKey);
    const configuredTtl = Number(Deno.env.get('CACHE_TTL_MINUTES') || 20);
    const ttl = Math.max(15, Math.min(30, Number.isFinite(configuredTtl) ? configuredTtl : 20));
    await admin.from('flight_cache').upsert({ cache_key: cacheKey, tool, args, response: result, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + ttl * 60000).toISOString() });
    return reply(200, { ok: true, cached: false, data: result });
  } catch (error) {
    // Never return upstream bodies, URLs, headers or exception messages with secrets.
    if (!(error instanceof Failure)) console.error('unexpected', String(error).slice(0, 300));
    return error instanceof Failure ? reply(error.status, { ok: false, error: error.message }) : reply(502, { ok: false, error: 'Flight service temporarily unavailable' });
  }
});
