const PHONE_DIGITS = 10;

function digitsOnly(value) {
  return String(value || '').replace(/\D+/g, '');
}

/**
 * Normalize Russian phone input to the ten digits after +7.
 * Accepts a local ten-digit number and full numbers beginning with 7 or 8.
 */
export function normalizeRussianPhoneDigits(value) {
  const raw = String(value || '').trim();
  let digits = digitsOnly(value);
  if (raw.startsWith('+') && digits === '7') return '';
  if (digits.length > PHONE_DIGITS && (digits.startsWith('7') || digits.startsWith('8'))) {
    digits = digits.slice(1);
  }
  return digits.slice(0, PHONE_DIGITS);
}

export function formatRussianPhoneInput(value) {
  const digits = normalizeRussianPhoneDigits(value);
  if (!digits) return '';

  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 8);
  const p4 = digits.slice(8, 10);
  let formatted = `(${p1}`;
  if (digits.length >= 3) formatted += ')';
  if (p2) formatted += ` ${p2}`;
  if (p3) formatted += `-${p3}`;
  if (p4) formatted += `-${p4}`;
  return formatted;
}

export function toRussianPhoneE164(value) {
  const digits = normalizeRussianPhoneDigits(value);
  return digits.length === PHONE_DIGITS ? `+7${digits}` : '';
}

/** Delete the adjacent digit when a browser edit removes only mask punctuation. */
export function resolvePhoneNumberEdit(previous, next, cursor, inputType) {
  if (next.length >= previous.length || digitsOnly(next) !== digitsOnly(previous)) {
    return next;
  }
  const forward = inputType === 'deleteContentForward';
  let index = forward ? (cursor ?? 0) : (cursor ?? next.length) - 1;
  while (index >= 0 && index < next.length) {
    if (/\d/.test(next[index])) return next.slice(0, index) + next.slice(index + 1);
    index += forward ? 1 : -1;
  }
  return next;
}

function nationalDigitsBeforeCursor(value, cursor) {
  const fullDigits = digitsOnly(value);
  let before = digitsOnly(String(value || '').slice(0, Math.max(0, cursor ?? 0))).length;
  if (fullDigits.length > PHONE_DIGITS && (fullDigits.startsWith('7') || fullDigits.startsWith('8'))) {
    before -= 1;
  }
  return Math.max(0, Math.min(PHONE_DIGITS, before));
}

function cursorAfterDigits(formatted, digitCount) {
  if (digitCount <= 0) return formatted ? 1 : 0;
  let seen = 0;
  for (let index = 0; index < formatted.length; index += 1) {
    if (/\d/.test(formatted[index])) seen += 1;
    if (seen === digitCount) {
      let cursor = index + 1;
      while (cursor < formatted.length && !/\d/.test(formatted[cursor])) cursor += 1;
      return cursor;
    }
  }
  return formatted.length;
}

export function resolveRussianPhoneEdit({ previous, next, cursor, inputType }) {
  const edited = resolvePhoneNumberEdit(previous, next, cursor, inputType);
  const digitCount = nationalDigitsBeforeCursor(edited, cursor);
  const digits = normalizeRussianPhoneDigits(edited);
  const formatted = formatRussianPhoneInput(digits);
  return {
    digits,
    formatted,
    cursor: cursorAfterDigits(formatted, Math.min(digitCount, digits.length)),
  };
}

