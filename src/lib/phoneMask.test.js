import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatRussianPhoneInput,
  normalizeRussianPhoneDigits,
  resolveRussianPhoneEdit,
  toRussianPhoneE164,
} from './phoneMask.js';

test('normalizes Russian 8, +7 and local ten-digit numbers', () => {
  assert.equal(normalizeRussianPhoneDigits('8 912 345-67-89'), '9123456789');
  assert.equal(normalizeRussianPhoneDigits('+7 (912) 345-67-89'), '9123456789');
  assert.equal(normalizeRussianPhoneDigits('9123456789'), '9123456789');
  assert.equal(normalizeRussianPhoneDigits('+7'), '');
  assert.equal(toRussianPhoneE164('8 (912) 345-67-89'), '+79123456789');
});

test('formats progressively and never accepts more than ten national digits', () => {
  assert.equal(formatRussianPhoneInput('9'), '(9');
  assert.equal(formatRussianPhoneInput('912'), '(912)');
  assert.equal(formatRussianPhoneInput('9123456789'), '(912) 345-67-89');
  assert.equal(formatRussianPhoneInput('891234567899999'), '(912) 345-67-89');
});

test('formats a pasted full number and places the caret at the end', () => {
  assert.deepEqual(resolveRussianPhoneEdit({
    previous: '',
    next: '+7 912 345 67 89 000',
    cursor: 21,
    inputType: 'insertFromPaste',
  }), {
    digits: '9123456789',
    formatted: '(912) 345-67-89',
    cursor: 15,
  });
});

test('backspace on a closing parenthesis removes the preceding digit', () => {
  const result = resolveRussianPhoneEdit({
    previous: '(912) 345-67-89',
    next: '(912 345-67-89',
    cursor: 4,
    inputType: 'deleteContentBackward',
  });
  assert.equal(result.digits, '913456789');
  assert.equal(result.formatted, '(913) 456-78-9');
  assert.equal(result.cursor, 3);
});

test('delete on a separator removes the following digit and preserves edit position', () => {
  const result = resolveRussianPhoneEdit({
    previous: '(912) 345-67-89',
    next: '(912 345-67-89',
    cursor: 4,
    inputType: 'deleteContentForward',
  });
  assert.equal(result.digits, '912456789');
  assert.equal(result.formatted, '(912) 456-78-9');
  assert.equal(result.cursor, 6);
});

