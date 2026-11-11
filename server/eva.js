// EVA conversation backend: Claude Messages API for dialogue, optional ElevenLabs for voice.
// API keys are read from the server-side .env only and never sent to the browser.
import { sanitizeContext, buildSystemPrompt, validateAction, DOORS } from './evaKnowledge.js';

// ANTHROPIC_BASE_URL is optional (testing or a corporate proxy); defaults to the public API.
const anthropicUrl = () => `${(process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com').replace(/\/+$/, '')}/v1/messages`;
const ANTHROPIC_VERSION = '2026-10-21';

const num = (v, d) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : d; };

export function config() {
  const e = process.env;
  return {
    key: (e.ANTHROPIC_API_KEY || '').trim(),
    model: (e.EVA_MODEL || 'claude-haiku-5-5').trim(),
    effort: ['low', 'medium', 'high'].includes((e.EVA_EFFORT || '').trim()) ? e.EVA_EFFORT.trim() : 'low',
    elevenKey: (e.ELEVENLABS_API_KEY || '').trim(),
    elevenVoice: (e.ELEVENLABS_VOICE_ID || '').trim(),
    elevenModel: (e.ELEVENLABS_MODEL || 'eleven_multilingual_v2').trim(),
    maxTurns: num(e.EVA_MAX_TURNS_PER_SESSION, 40),
    perMinute: num(e.EVA_MAX_REQUESTS_PER_MINUTE, 8),
    daily: num(e.EVA_DAILY_LIMIT, 200),
    maxInput: num(e.EVA_MAX_INPUT_CHARS, 300),
  };
}

const sessions = new Map(); // sessionId -> { turns, history: [{role, content}], ttsChars, last }
let minuteLog = [];
let day = { key: '', count: 0 };

function session(id) {
  let s = sessions.get(id);
  if (!s) {
    if (sessions.size > 200) { // drop the oldest idle sessions
      const old = [...sessions.entries()].sort((a, b) => a[1].last - b[1].last).slice(0, 50);
      for (const [k] of old) sessions.delete(k);
    }
    s = { turns: 0, history: [], ttsChars: 0, last: Date.now() };
    sessions.set(id, s);
  }
  s.last = Date.now();
  return s;
}

export function status() {
  const c = config();
  const ai = !!c.key;
  return {
    ai,
    model: ai ? c.model : null,
    tts: ai && c.elevenKey && c.elevenVoice ? 'elevenlabs' : 'browser',
    reason: ai ? '' : 'No ANTHROPIC_API_KEY in .env (copy .env.example to .env and add your key, then restart the server).',
    limits: { turnsPerSession: c.maxTurns, perMinute: c.perMinute, daily: c.daily, maxInput: c.maxInput },
  };
}

function checkLimits(c, s) {
  const now = Date.now();
  minuteLog = minuteLog.filter((t) => now - t < 60000);
  const today = new Date().toISOString().slice(0, 10);
  if (day.key !== today) day = { key: today, count: 0 };
  if (s.turns >= c.maxTurns) return 'This session has reached its EVA conversation limit. Reload the game to start a new session, or raise EVA_MAX_TURNS_PER_SESSION in .env.';
  if (minuteLog.length >= c.perMinute) return 'Too many EVA requests this minute. Wait a moment and try again.';
  if (day.count >= c.daily) return 'The daily EVA conversation limit has been reached (EVA_DAILY_LIMIT in .env).';
  return null;
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

function cleanReply(s) {
  return String(s || '')
    .replace(/[*_#`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

export async function chat(body) {
  const c = config();
  if (!c.key) return { status: 503, json: { error: status().reason } };
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 64) : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!sessionId || !message) return { status: 400, json: { error: 'Missing message.' } };
  if (message.length > c.maxInput) return { status: 400, json: { error: `Message too long (max ${c.maxInput} characters).` } };

  const s = session(sessionId);
  const limited = checkLimits(c, s);
  if (limited) return { status: 429, json: { error: limited } };

  const ctx = sanitizeContext(body.context);
  const system = buildSystemPrompt(ctx);
  const messages = [...s.history.slice(-12), { role: 'user', content: `Commander Voss says: "${message.replace(/"/g, '\'')}"` }];

  const req = {
    model: c.model,
    max_tokens: 800,
    system,
    messages,
    output_config: { effort: c.effort },
  };
  // Haiku 5.5 accepts thinking disabled at high effort or below; skip up-front thinking for latency.
  if (/^claude-haiku-5/.test(c.model)) req.thinking = { type: 'disabled' };

  minuteLog.push(Date.now());
  day.count++;
  s.turns++;

  let r, data;
  try {
    r = await fetch(anthropicUrl(), {
      method: 'POST',
      headers: { 'x-api-key': c.key, 'anthropic-version': ANTHROPIC_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(20000),
    });
    data = await r.json().catch(() => ({}));
  } catch (e) {
    return { status: 502, json: { error: e.name === 'TimeoutError' ? 'The Claude API did not respond in time.' : `Could not reach the Claude API: ${e.message}` } };
  }
  if (!r.ok) {
    const msg = data && data.error && data.error.message ? data.error.message : `HTTP ${r.status}`;
    const map = {
      401: 'The Claude API rejected the key in .env (ANTHROPIC_API_KEY).',
      403: 'The Claude API key does not have permission for this model.',
      404: `Model not found: ${c.model}. Check EVA_MODEL in .env.`,
      429: 'The Claude API is rate limiting requests. Try again shortly.',
      529: 'The Claude API is overloaded. Try again shortly.',
    };
    console.error(`[eva] Claude API error ${r.status}: ${msg}`);
    return { status: 502, json: { error: map[r.status] || `Claude API error: ${msg}` } };
  }

  const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  const parsed = extractJson(text);
  let reply = cleanReply(parsed && typeof parsed.reply === 'string' ? parsed.reply : text);
  if (!reply) reply = 'I did not catch that, Commander.';
  const action = validateAction(parsed && parsed.action, ctx);
  // If the model claimed to open a door that the rules do not allow, never let EVA say it did.
  if (parsed && parsed.action && parsed.action.type === 'open_door' && action.type !== 'open_door') {
    const d = DOORS[parsed.action.door];
    const st = d ? ctx.doors[parsed.action.door] : null;
    const guide = d && st && d.guide[st] ? ` ${d.guide[st]}` : '';
    reply = `I can't release that door from here, Commander.${guide}`.slice(0, 600);
  }

  s.history.push({ role: 'user', content: messages[messages.length - 1].content });
  s.history.push({ role: 'assistant', content: JSON.stringify({ reply, action }) });
  if (s.history.length > 24) s.history.splice(0, s.history.length - 24);

  return { status: 200, json: { reply, action, turnsLeft: Math.max(0, c.maxTurns - s.turns) } };
}

export async function tts(body) {
  const c = config();
  if (!c.elevenKey || !c.elevenVoice) return { status: 503, json: { error: 'ElevenLabs is not configured.' } };
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 600) : '';
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 64) : '';
  if (!text || !sessionId || !sessions.has(sessionId)) return { status: 400, json: { error: 'Invalid speech request.' } };
  const s = session(sessionId);
  if (s.ttsChars > c.maxTurns * 600) return { status: 429, json: { error: 'Voice limit reached for this session.' } };
  s.ttsChars += text.length;
  try {
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(c.elevenVoice)}?output_format=mp3_44100_128`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': c.elevenKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: c.elevenModel }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      console.error(`[eva] ElevenLabs error ${r.status}: ${t.slice(0, 200)}`);
      return { status: 502, json: { error: `ElevenLabs error ${r.status}` } };
    }
    return { status: 200, audio: Buffer.from(await r.arrayBuffer()) };
  } catch (e) {
    return { status: 502, json: { error: `Could not reach ElevenLabs: ${e.message}` } };
  }
}
