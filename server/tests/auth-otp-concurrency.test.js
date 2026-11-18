const test = require('node:test');
const assert = require('node:assert/strict');
const { reserveOtpChallenge, consumeOtpAttempt } = require('../services/otpStore');

class MemoryOtpPrisma {
  constructor() {
    this.rows = [];
    this.queue = Promise.resolve();
    this.phoneOtpChallenge = this.model();
  }

  model() {
    return {
      findFirst: async ({ where }) => this.rows.filter((row) => row.phone === where.phone).sort((a, b) => b.createdAt - a.createdAt)[0] || null,
      count: async ({ where }) => this.rows.filter((row) => {
        if (where.phone != null && row.phone !== where.phone) return false;
        if (where.ipHash != null && row.ipHash !== where.ipHash) return false;
        if (where.createdAt?.gte && row.createdAt < where.createdAt.gte) return false;
        return true;
      }).length,
      create: async ({ data }) => {
        const row = { attempts: 0, consumedAt: null, createdAt: new Date(), ...data };
        this.rows.push(row);
        return { ...row };
      },
      findUnique: async ({ where }) => {
        const row = this.rows.find((item) => item.id === where.id);
        return row ? { ...row } : null;
      },
      update: async ({ where, data }) => {
        const row = this.rows.find((item) => item.id === where.id);
        if (!row) throw new Error('NOT_FOUND');
        if (data.attempts?.increment) row.attempts += data.attempts.increment;
        Object.assign(row, Object.fromEntries(Object.entries(data).filter(([key]) => key !== 'attempts')));
        return { ...row };
      },
      updateMany: async ({ where, data }) => {
        let count = 0;
        for (const row of this.rows) {
          if (where.id != null && row.id !== where.id) continue;
          if (where.consumedAt === null && row.consumedAt !== null) continue;
          if (data.consumedAt) row.consumedAt = data.consumedAt;
          count += 1;
        }
        return { count };
      },
      delete: async ({ where }) => {
        this.rows = this.rows.filter((row) => row.id !== where.id);
      },
    };
  }

  async $transaction(work) {
    const run = this.queue.then(() => work({ phoneOtpChallenge: this.phoneOtpChallenge, $queryRawUnsafe: async () => [{ locked: true }] }));
    this.queue = run.catch(() => {});
    return run;
  }
}

test('parallel OTP requests reserve resend and IP limits transactionally', async () => {
  const previous = process.env.OTP_HASH_SECRET;
  process.env.OTP_HASH_SECRET = 'concurrency-secret';
  const prisma = new MemoryOtpPrisma();
  const now = new Date('2026-11-18T09:00:00.000Z');

  const samePhone = await Promise.allSettled(Array.from({ length: 20 }, () => reserveOtpChallenge({
    prisma,
    phone: '+79990000001',
    ipHash: 'ip-one',
    userId: null,
    code: '123456',
    now,
  })));
  assert.equal(samePhone.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(samePhone.filter((result) => result.status === 'rejected' && result.reason.message === 'OTP_RESEND_TOO_SOON').length, 19);

  const ipLimited = await Promise.allSettled(Array.from({ length: 16 }, (_, index) => reserveOtpChallenge({
    prisma,
    phone: `+7999001${String(index).padStart(4, '0')}`,
    ipHash: 'shared-ip',
    userId: null,
    code: '123456',
    now,
  })));
  assert.equal(ipLimited.filter((result) => result.status === 'fulfilled').length, 15);
  assert.equal(ipLimited.filter((result) => result.status === 'rejected' && result.reason.message === 'OTP_RATE_LIMITED').length, 1);

  if (previous == null) delete process.env.OTP_HASH_SECRET; else process.env.OTP_HASH_SECRET = previous;
});

test('parallel guesses consume at most the configured attempts and a code is single-use', async () => {
  const previous = process.env.OTP_HASH_SECRET;
  process.env.OTP_HASH_SECRET = 'concurrency-secret';
  const prisma = new MemoryOtpPrisma();
  const now = new Date('2026-11-18T09:00:00.000Z');
  const challenge = await reserveOtpChallenge({
    prisma,
    phone: '+79990000002',
    ipHash: 'ip-two',
    userId: null,
    code: '654321',
    now,
  });

  const guesses = await Promise.all(Array.from({ length: 100 }, () => consumeOtpAttempt({
    prisma,
    challengeId: challenge.id,
    code: '000000',
    now,
  })));
  assert.equal(guesses.every((result) => result.ok === false), true);
  assert.equal(prisma.rows.find((row) => row.id === challenge.id).attempts, 5);

  const second = await reserveOtpChallenge({
    prisma,
    phone: '+79990000003',
    ipHash: 'ip-three',
    userId: null,
    code: '111222',
    now,
  });
  const correct = await Promise.all(Array.from({ length: 10 }, () => consumeOtpAttempt({
    prisma,
    challengeId: second.id,
    code: '111222',
    now,
  })));
  assert.equal(correct.filter((result) => result.ok).length, 1);

  if (previous == null) delete process.env.OTP_HASH_SECRET; else process.env.OTP_HASH_SECRET = previous;
});
