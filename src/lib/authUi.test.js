import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bottomNavItems,
  initialLoginModalState,
  isVerifiedUser,
  loginModalReducer,
  persistPersonalDataConsent,
} from './authUi.js';

test('guest objects are not authenticated and never receive the Addresses tab', () => {
  const guest = { id: 41, phone: '+79990000000', phoneVerified: false };
  assert.equal(isVerifiedUser(guest), false);
  assert.deepEqual(bottomNavItems(guest).map((item) => item.label), ['Главная', 'Сохранено', 'Каталог', 'Войти']);
  assert.equal(bottomNavItems(guest).some((item) => item.to === '/recipients'), false);
});

test('verified users receive Addresses and Profile navigation', () => {
  const user = { id: 7, phoneVerified: true };
  assert.equal(isVerifiedUser(user), true);
  assert.deepEqual(bottomNavItems(user).map((item) => item.label), ['Главная', 'Сохранено', 'Каталог', 'Адреса', 'Профиль']);
});

test('login modal keeps an intended destination until close or success', () => {
  const opened = loginModalReducer(initialLoginModalState, { type: 'OPEN', intendedDestination: '/checkout' });
  assert.deepEqual(opened, { open: true, intendedDestination: '/checkout' });
  assert.equal(loginModalReducer(opened, { type: 'UNKNOWN' }), opened);
  assert.equal(loginModalReducer(opened, { type: 'CLOSE' }), initialLoginModalState);
  assert.equal(loginModalReducer(opened, { type: 'SUCCESS' }), initialLoginModalState);
});

test('consent is required and persisted through the existing auth profile call', async () => {
  let calls = 0;
  await assert.rejects(
    () => persistPersonalDataConsent({ accepted: false, updateMe: async () => { calls += 1; } }),
    (error) => error.code === 'CONSENT_REQUIRED',
  );
  assert.equal(calls, 0);
  const user = await persistPersonalDataConsent({
    accepted: true,
    updateMe: async (patch) => {
      calls += 1;
      assert.deepEqual(patch, { consentPersonal: true });
      return { user: { id: 41, consentPersonal: true } };
    },
  });
  assert.equal(calls, 1);
  assert.equal(user.consentPersonal, true);
});

test('failed consent persistence blocks OTP progression', async () => {
  await assert.rejects(
    () => persistPersonalDataConsent({ accepted: true, updateMe: async () => ({ user: { consentPersonal: false } }) }),
    (error) => error.code === 'CONSENT_SAVE_FAILED',
  );
});
