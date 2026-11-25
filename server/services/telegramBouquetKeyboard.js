const ACTIONS = {
  'Все фото загружены': '/import_done',
  'Добавлю ещё': '/import_more',
  'Новая загрузка': '/import',
  'Посмотреть результат': '/review',
  'Следующее фото': '/next',
  'Повторить загрузку': '/import_retry',
};

function bouquetKeyboard(stage = 'collecting') {
  const rows = stage === 'confirmation' ? [['Все фото загружены', 'Добавлю ещё']]
    : stage === 'review' ? [['Следующее фото'], ['Посмотреть результат', 'Новая загрузка']]
      : [['Посмотреть результат', 'Новая загрузка']];
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

module.exports = { bouquetKeyboard, normalizeBouquetUpdate };
