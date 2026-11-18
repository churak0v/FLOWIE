const crypto = require('crypto');

const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_PHONE_LIMIT_PER_HOUR = 5;
const OTP_IP_LIMIT_PER_HOUR = 15;
const OTP_MAX_ATTEMPTS = 5;

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) return `+7${digits.slice(1)}`;
  if (digits.length >= 10 && digits.length <= 15) return `+${digits}`;
  return null;
}

function otpSecret() {
  const secret = process.env.OTP_HASH_SECRET || process.env.APP_JWT_SECRET;
  if (!secret) throw new Error('OTP_HASH_SECRET_NOT_SET');
  return secret;
}

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashOtp({ challengeId, phone, code }) {
  return crypto.createHmac('sha256', otpSecret()).update(`${challengeId}:${phone}:${code}`).digest('hex');
}

function safeHashEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && a.length > 0 && crypto.timingSafeEqual(a, b);
}

function hashIp(ip) {
  return crypto.createHmac('sha256', otpSecret()).update(String(ip || 'unknown')).digest('hex');
}

module.exports = {
  OTP_TTL_MS,
  OTP_RESEND_MS,
  OTP_PHONE_LIMIT_PER_HOUR,
  OTP_IP_LIMIT_PER_HOUR,
  OTP_MAX_ATTEMPTS,
  normalizePhone,
  generateOtp,
  hashOtp,
  safeHashEqual,
  hashIp,
};
