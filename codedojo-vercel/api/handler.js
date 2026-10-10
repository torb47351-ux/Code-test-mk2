'use strict';
// Code Dojo บน Vercel: สมัคร/เข้าสู่ระบบด้วยอีเมล เก็บข้อมูลใน Upstash Redis (ผ่าน REST ไม่ต้องติดตั้งแพ็กเกจ)
// เส้นทาง /api/me /api/register /api/login /api/logout /api/progress ถูก rewrite มาที่ไฟล์นี้ (ดู vercel.json)
const crypto = require('crypto');

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const SECRET = process.env.SECRET;

async function redis(cmd) {
  const r = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + REDIS_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || 'redis ' + r.status);
  return j.result;
}

const hash = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');
const sign = v => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const mkToken = email => {
  const p = Buffer.from(JSON.stringify({ e: email, x: Date.now() + 30 * 864e5 })).toString('base64url');
  return p + '.' + sign(p);
};
const readToken = t => {
  if (!t) return null;
  const [p, s] = t.split('.');
  if (!p || !s) return null;
  const a = Buffer.from(sign(p)), b = Buffer.from(s);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { const o = JSON.parse(Buffer.from(p, 'base64url')); return o.x > Date.now() ? o.e : null; } catch (e) { return null; }
};
const cookieOf = req => {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)sid=([^;]*)/);
  return m ? m[1] : '';
};
const setCookie = (req, v, age) => `sid=${v}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}` +
  ((req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '');

const EM = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const clean = p => {
  const s = {};
  if (p && typeof p.s === 'object' && p.s) for (const k of Object.keys(p.s).slice(0, 2000)) if (p.s[k] === true && k.length < 60) s[k] = true;
  const kb = {};
  for (const k of ['html', 'css', 'cpp']) if (p && p.kb && p.kb[k] === true) kb[k] = true;
  return { s, xp: Math.max(0, Math.min(1e9, +(p && p.xp) || 0)), p: Math.max(0, Math.min(1e4, +(p && p.p) || 0)), kb };
};
const getUser = async email => { const v = await redis(['GET', 'user:' + email]); return v ? JSON.parse(v) : null; };

async function limited(ip) {
  const key = 'rl:' + ip;
  const n = await redis(['INCR', key]);
  if (n === 1) await redis(['EXPIRE', key, 60]);
  return n > 10;
}

module.exports = async (req, res) => {
  const send = (code, obj, cookie) => {
    res.setHeader('Cache-Control', 'no-store');
    if (cookie) res.setHeader('Set-Cookie', cookie);
    res.status(code).json(obj);
  };
  try {
    if (!REDIS_URL || !REDIS_TOKEN || !SECRET) return send(500, { error: 'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า SECRET และฐานข้อมูล (ดู README)' });
    const act = String((req.query && req.query.action) || '');
    if (req.method !== 'GET' && !String(req.headers['content-type'] || '').includes('application/json')) return send(415, { error: 'ต้องส่งเป็น JSON' });
    let body = req.body || {};
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    const me = readToken(cookieOf(req));

    if (act === 'me' && req.method === 'GET') {
      const u = me && await getUser(me);
      if (!u) return send(401, { error: 'ยังไม่ได้เข้าสู่ระบบ' });
      return send(200, { email: me, progress: u.progress });
    }
    if (act === 'logout' && req.method === 'POST') return send(200, { ok: true }, setCookie(req, '', 0));

    if (act === 'progress' && req.method === 'PUT') {
      const u = me && await getUser(me);
      if (!u) return send(401, { error: 'ยังไม่ได้เข้าสู่ระบบ' });
      u.progress = clean(body);
      await redis(['SET', 'user:' + me, JSON.stringify(u)]);
      return send(200, { ok: true });
    }

    if ((act === 'register' || act === 'login') && req.method === 'POST') {
      const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
      if (await limited(ip)) return send(429, { error: 'ลองบ่อยเกินไป กรุณารอ 1 นาที' });
      const email = String(body.email || '').trim().toLowerCase(), pw = String(body.password || '');
      if (email.length > 254 || !EM.test(email)) return send(400, { error: 'รูปแบบอีเมลไม่ถูกต้อง' });
      if (act === 'register') {
        if (pw.length < 8 || pw.length > 200) return send(400, { error: 'รหัสผ่านต้องยาว 8 ตัวอักษรขึ้นไป' });
        const salt = crypto.randomBytes(16).toString('hex');
        const u = { salt, hash: hash(pw, salt), progress: { s: {}, xp: 0, p: 0, kb: {} }, created: Date.now() };
        const ok = await redis(['SET', 'user:' + email, JSON.stringify(u), 'NX']);
        if (ok !== 'OK') return send(409, { error: 'อีเมลนี้ถูกใช้สมัครแล้ว' });
        return send(200, { email, progress: u.progress }, setCookie(req, mkToken(email), 2592000));
      }
      const u = await getUser(email), h = hash(pw, u ? u.salt : 'x'.repeat(32));
      if (!u || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(u.hash))) return send(401, { error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
      return send(200, { email, progress: u.progress }, setCookie(req, mkToken(email), 2592000));
    }
    send(404, { error: 'ไม่พบเส้นทางนี้' });
  } catch (e) {
    console.error(e);
    send(500, { error: 'เซิร์ฟเวอร์ผิดพลาด' });
  }
};
