export const REGISTRATION_GIFT_DWELL_MS = 1_000;

export function normalizeRegistrationGiftStatus(value) {
  const campaign = value?.campaign && typeof value.campaign === 'object'
    ? {
        id: String(value.campaign.id || ''),
        title: String(value.campaign.title || ''),
        body: String(value.campaign.body || value.campaign.terms || ''),
        terms: String(value.campaign.terms || ''),
        ctaLabel: String(value.campaign.ctaLabel || ''),
      }
    : null;

  return {
    enabled: value?.enabled === true,
    eligible: value?.eligible === true,
    exposed: value?.exposed === true,
    claimed: value?.claimed === true,
    fulfilled: value?.fulfilled === true,
    campaign,
  };
}

export function shouldShowRegistrationGift(status) {
  return Boolean(status?.enabled && status?.eligible && !status?.claimed);
}

export function shouldShowRegistrationGiftAccountStatus(status) {
  // A recorded obligation remains visible even after the acquisition campaign is disabled.
  return Boolean(status?.claimed);
}

