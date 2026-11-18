function normalizeOrigin(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

function configuredOrigins(env = process.env) {
  const values = String(env.AUTH_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (env.PUBLIC_SITE_URL) values.push(env.PUBLIC_SITE_URL);
  return new Set(values.map(normalizeOrigin).filter(Boolean));
}

function isDevelopmentLoopback(origin, env = process.env) {
  if (env.NODE_ENV === 'production') return false;
  try {
    const url = new URL(origin);
    return (url.protocol === 'http:' || url.protocol === 'https:')
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isAllowedOrigin(origin, env = process.env) {
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;
  return configuredOrigins(env).has(normalized) || isDevelopmentLoopback(normalized, env);
}

function createCorsOriginCallback(env = process.env) {
  return (origin, callback) => callback(null, isAllowedOrigin(origin, env));
}

module.exports = {
  configuredOrigins,
  createCorsOriginCallback,
  isAllowedOrigin,
  normalizeOrigin,
};
