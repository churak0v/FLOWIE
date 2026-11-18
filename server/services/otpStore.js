const crypto = require('crypto');
const {
  OTP_TTL_MS,
  OTP_RESEND_MS,
  OTP_PHONE_LIMIT_PER_HOUR,
  OTP_IP_LIMIT_PER_HOUR,
  OTP_MAX_ATTEMPTS,
  hashOtp,
  safeHashEqual,
} = require('./phoneOtp');

function storeError(message, statusCode, extra = {}) {
  return Object.assign(new Error(message), { statusCode, ...extra });
}

async function withAdvisoryLocks(prisma, keys, work) {
  const ordered = [...new Set(keys.map(String))].sort();
  return prisma.$transaction(async (tx) => {
    for (const key of ordered) {
      // Parameterized query; the key is never interpolated into SQL.
      await tx.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))::text AS locked', key);
    }
    return work(tx);
  });
}

async function reserveOtpChallenge({ prisma, phone, ipHash, userId, code, now = new Date() }) {
  return withAdvisoryLocks(prisma, [`otp:phone:${phone}`, `otp:ip:${ipHash}`], async (tx) => {
    const since = new Date(now.getTime() - 60 * 60 * 1000);
    const latest = await tx.phoneOtpChallenge.findFirst({ where: { phone }, orderBy: { createdAt: 'desc' } });
    if (latest?.resendAfter > now) {
      throw storeError('OTP_RESEND_TOO_SOON', 429, {
        retryAfter: Math.ceil((latest.resendAfter.getTime() - now.getTime()) / 1000),
      });
    }

    const [phoneCount, ipCount] = await Promise.all([
      tx.phoneOtpChallenge.count({ where: { phone, createdAt: { gte: since } } }),
      tx.phoneOtpChallenge.count({ where: { ipHash, createdAt: { gte: since } } }),
    ]);
    if (phoneCount >= OTP_PHONE_LIMIT_PER_HOUR || ipCount >= OTP_IP_LIMIT_PER_HOUR) {
      throw storeError('OTP_RATE_LIMITED', 429, { retryAfter: 3600 });
    }

    const id = crypto.randomUUID();
    return tx.phoneOtpChallenge.create({
      data: {
        id,
        phone,
        codeHash: hashOtp({ challengeId: id, phone, code }),
        userId: userId || null,
        ipHash,
        expiresAt: new Date(now.getTime() + OTP_TTL_MS),
        resendAfter: new Date(now.getTime() + OTP_RESEND_MS),
        maxAttempts: OTP_MAX_ATTEMPTS,
      },
    });
  });
}

async function consumeOtpAttempt({ prisma, challengeId, code, now = new Date() }) {
  return withAdvisoryLocks(prisma, [`otp:challenge:${challengeId}`], async (tx) => {
    const challenge = await tx.phoneOtpChallenge.findUnique({ where: { id: challengeId } });
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= now || challenge.attempts >= challenge.maxAttempts) {
      return { ok: false, error: 'INVALID_OR_EXPIRED_CODE' };
    }

    // Every concurrent guess reserves an attempt before comparison while holding the challenge lock.
    await tx.phoneOtpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    const matches = safeHashEqual(challenge.codeHash, hashOtp({ challengeId, phone: challenge.phone, code }));
    if (!matches) return { ok: false, error: 'INVALID_OR_EXPIRED_CODE' };

    const consumed = await tx.phoneOtpChallenge.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) return { ok: false, error: 'OTP_ALREADY_USED' };
    return { ok: true, challenge: { ...challenge, attempts: challenge.attempts + 1, consumedAt: now } };
  });
}

module.exports = { withAdvisoryLocks, reserveOtpChallenge, consumeOtpAttempt, storeError };
