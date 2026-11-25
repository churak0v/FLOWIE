export function isVerifiedUser(user) {
  return Boolean(user?.phoneVerified);
}

export function bottomNavItems(user) {
  const common = [
    { key: 'home', to: '/', label: 'Главная' },
    { key: 'favorites', to: '/favorites', label: 'Сохранено' },
    { key: 'catalog', to: '/catalog', label: 'Каталог' },
  ];
  if (!isVerifiedUser(user)) return [...common, { key: 'login', to: null, label: 'Войти' }];
  return [
    ...common,
    { key: 'recipients', to: '/recipients', label: 'Адреса' },
    { key: 'account', to: '/account', label: 'Профиль' },
  ];
}

export const initialLoginModalState = Object.freeze({ open: false, intendedDestination: null });

export function loginModalReducer(state, action) {
  if (action?.type === 'OPEN') {
    return { open: true, intendedDestination: action.intendedDestination || null };
  }
  if (action?.type === 'CLOSE' || action?.type === 'SUCCESS') return initialLoginModalState;
  return state;
}

export async function persistPersonalDataConsent({ accepted, updateMe }) {
  if (!accepted) throw Object.assign(new Error('CONSENT_REQUIRED'), { code: 'CONSENT_REQUIRED' });
  if (typeof updateMe !== 'function') throw Object.assign(new Error('CONSENT_SAVE_FAILED'), { code: 'CONSENT_SAVE_FAILED' });
  const result = await updateMe({ consentPersonal: true });
  if (!result?.user?.consentPersonal) throw Object.assign(new Error('CONSENT_SAVE_FAILED'), { code: 'CONSENT_SAVE_FAILED' });
  return result.user;
}
