const CARD_ACTIONS = Object.freeze({
  'Изменить состав': '/card_edit_composition',
  'Изменить название': '/card_edit_name',
  'Добавить фото': '/card_add_photo',
  'Объединить карточки': '/card_merge',
  'Подтвердить состав': '/card_confirm',
  'Дальше': '/next',
  'Посмотреть результат': '/review',
  'Отмена': '/card_cancel',
});

// Previously rendered labels remain normalizable for messages sent from an
// older persistent Telegram keyboard. Slash commands pass through unchanged.
const LEGACY_ACTIONS = Object.freeze({
  'Все фото загружены': '/import_done',
  'Добавлю ещё': '/import_more',
  'Новая загрузка': '/import',
  'Посмотреть результат': '/review',
  'Следующее фото': '/next',
  'Повторить загрузку': '/import_retry',
});

const ACTIONS = Object.freeze({ ...LEGACY_ACTIONS, ...CARD_ACTIONS });
const CARD_KEYBOARD_ROWS = Object.freeze([
  Object.freeze(['Изменить состав', 'Изменить название']),
  Object.freeze(['Добавить фото', 'Объединить карточки']),
  Object.freeze(['Подтвердить состав', 'Дальше']),
  Object.freeze(['Посмотреть результат', 'Отмена']),
]);

function bouquetKeyboard(stage = 'collecting') {
  const rows = stage === 'confirmation' ? [['Все фото загружены', 'Добавлю ещё']] : CARD_KEYBOARD_ROWS;
  return { keyboard: rows.map((row) => row.map((text) => ({ text }))), resize_keyboard: true,
    is_persistent: true, one_time_keyboard: false,
    input_field_placeholder: stage === 'collecting' ? 'Отправляйте фотографии букетов' : 'Выберите действие',
  };
}

function normalizeBouquetUpdate(update) {
  const message = update?.message;
  const action = ACTIONS[String(message?.text || '').trim()];
  return action ? { ...update, message: { ...message, text: action } } : update;
}

module.exports = {
  ACTIONS,
  CARD_ACTIONS,
  CARD_KEYBOARD_ROWS,
  LEGACY_ACTIONS,
  bouquetKeyboard,
  normalizeBouquetUpdate,
};
