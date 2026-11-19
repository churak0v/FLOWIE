const crypto = require('crypto');

const DEFAULT_SCRYPT = Object.freeze({ N: 16384, r: 8, p: 1, keylen: 64 });

function normalizedLogin(value) {
  return String(value || '').trim().toLowerCase();
}

function validLogin(value) {
  return /^[a-z0-9._-]{3,64}$/.test(normalizedLogin(value));
}

function validPassword(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 256;
}

function passwordHash(password, { salt = crypto.randomBytes(16), N, r, p, keylen } = {}) {
  if (!validPassword(password)) throw new Error('BAD_ADMIN_PASSWORD');
  const params = {
    N: Number(N) || DEFAULT_SCRYPT.N,
    r: Number(r) || DEFAULT_SCRYPT.r,
    p: Number(p) || DEFAULT_SCRYPT.p,
    keylen: Number(keylen) || DEFAULT_SCRYPT.keylen,
  };
  const derived = crypto.scryptSync(password, salt, params.keylen, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 64 * 1024 * 1024,
  });
  return ['scrypt', params.N, params.r, params.p, salt.toString('base64url'), derived.toString('base64url')].join(':');
}

function parsePasswordHash(value) {
  const [algorithm, nRaw, rRaw, pRaw, saltRaw, hashRaw, ...extra] = String(value || '').split(':');
  const N = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (
    extra.length ||
    algorithm !== 'scrypt' ||
    N !== DEFAULT_SCRYPT.N ||
    r !== DEFAULT_SCRYPT.r ||
    p !== DEFAULT_SCRYPT.p ||
    !/^[A-Za-z0-9_-]{20,30}$/.test(saltRaw || '') ||
    !/^[A-Za-z0-9_-]{80,100}$/.test(hashRaw || '')
  ) return null;
  try {
    const salt = Buffer.from(saltRaw, 'base64url');
    const expected = Buffer.from(hashRaw, 'base64url');
    if (salt.length !== 16 || expected.length !== DEFAULT_SCRYPT.keylen) return null;
    return { N, r, p, salt, expected };
  } catch {
    return null;
  }
}

function safeTextEqual(left, right) {
  const a = crypto.createHash('sha256').update(String(left || '')).digest();
  const b = crypto.createHash('sha256').update(String(right || '')).digest();
  return crypto.timingSafeEqual(a, b);
}

function verifyAdminCredentials({ login, password, expectedLogin, encodedPasswordHash }) {
  const parsed = parsePasswordHash(encodedPasswordHash);
  if (!parsed || !validPassword(password) || !normalizedLogin(expectedLogin)) return false;
  const actual = crypto.scryptSync(password, parsed.salt, parsed.expected.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    maxmem: 64 * 1024 * 1024,
  });
  const loginMatches = safeTextEqual(normalizedLogin(login), normalizedLogin(expectedLogin));
  const passwordMatches = crypto.timingSafeEqual(actual, parsed.expected);
  return loginMatches && passwordMatches;
}

function adminCredentialsConfigured(env = process.env) {
  return Boolean(normalizedLogin(env.ADMIN_LOGIN) && parsePasswordHash(env.ADMIN_PASSWORD_HASH));
}

async function verifyStoredAdminCredentials({ prisma, login, password }) {
  const normalized = normalizedLogin(login);
  if (!validLogin(normalized)) return null;
  const credential = await prisma.staffCredential.findUnique({
    where: { login: normalized },
    include: { user: true },
  });
  if (!credential?.user?.staffRole || !credential.user.staffActive) return null;
  const valid = verifyAdminCredentials({
    login: normalized,
    password,
    expectedLogin: credential.login,
    encodedPasswordHash: credential.passwordHash,
  });
  return valid ? credential.user : null;
}

function createAdminLoginLimiter({ max = 5, windowMs = 15 * 60_000, now = () => Date.now() } = {}) {
  const attempts = new Map();
  return {
    consume(key) {
      const current = now();
      const normalized = crypto.createHash('sha256').update(String(key || 'unknown')).digest('hex');
      const entry = attempts.get(normalized);
      if (!entry || current - entry.startedAt >= windowMs) {
        attempts.set(normalized, { startedAt: current, count: 1 });
        return { allowed: true, retryAfter: 0 };
      }
      entry.count += 1;
      return {
        allowed: entry.count <= max,
        retryAfter: Math.max(1, Math.ceil((windowMs - (current - entry.startedAt)) / 1000)),
      };
    },
    reset(key) {
      const normalized = crypto.createHash('sha256').update(String(key || 'unknown')).digest('hex');
      attempts.delete(normalized);
    },
  };
}

module.exports = {
  adminCredentialsConfigured,
  createAdminLoginLimiter,
  normalizedLogin,
  passwordHash,
  validLogin,
  verifyAdminCredentials,
  verifyStoredAdminCredentials,
};
