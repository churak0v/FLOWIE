'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CARD_ACTIONS,
  CARD_KEYBOARD_ROWS,
  bouquetKeyboard,
  normalizeBouquetUpdate,
} = require('../services/telegramBouquetKeyboard');

test('renders the polished product-card keyboard without commands or identifiers', () => {
  const expected = [
    ['Изменить состав', 'Изменить название'],
    ['Добавить фото', 'Объединить карточки'],
    ['Подтвердить состав', 'Дальше'],
    ['Посмотреть результат', 'Отмена'],
  ];
  assert.deepEqual(CARD_KEYBOARD_ROWS, expected);
  for (const stage of ['collecting', 'processing', 'review']) {
    const keyboard = bouquetKeyboard(stage);
    assert.deepEqual(keyboard.keyboard.map((row) => row.map((button) => button.text)), expected);
    assert.equal(JSON.stringify(keyboard.keyboard).includes('/'), false);
    assert.equal(keyboard.is_persistent, true);
  }
});

test('normalizes natural card actions and keeps /next internal', () => {
  for (const [label, command] of Object.entries(CARD_ACTIONS)) {
    const update = { update_id: 1, message: { text: label, chat: { id: 7 } } };
    assert.equal(normalizeBouquetUpdate(update).message.text, command);
  }
  assert.equal(normalizeBouquetUpdate({ message: { text: 'Дальше' } }).message.text, '/next');
});

test('keeps old keyboard labels and direct slash commands backward compatible', () => {
  assert.equal(normalizeBouquetUpdate({ message: { text: 'Следующее фото' } }).message.text, '/next');
  assert.equal(normalizeBouquetUpdate({ message: { text: 'Новая загрузка' } }).message.text, '/import');
  assert.equal(normalizeBouquetUpdate({ message: { text: '/review' } }).message.text, '/review');
  assert.equal(normalizeBouquetUpdate({ message: { text: '/next' } }).message.text, '/next');
});
