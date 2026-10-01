/**
 * tomorrow school — регистрация команд на Raid
 * Google Apps Script (backend для формы)
 *
 * Лист «Слоты»:
 *   A: Время            — заполняете вы (например 11:30)
 *   B: Тимлид           — заполняет скрипт
 *   C: Ник на платформе — заполняет скрипт
 *   D: Telegram         — заполняет скрипт
 *   E: Дата записи      — заполняет скрипт
 *
 * Слот свободен, если колонка B пустая.
 */

const SHEET_NAME = 'Слоты';
const HEADER_ROWS = 1;
const COL_TIME = 1;  // A
const COL_LEAD = 2;  // B (дальше подряд: C, D, E)

// Один тимлид (ФИО, ник на платформе или Telegram) — одна запись
const ONE_BOOKING_PER_LEAD = true;

const TELEGRAM_RE = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;
const NICK_RE = /^[A-Za-z0-9._-]{2,32}$/;


/* ---------- GET: свободные слоты ---------- */

function doGet() {
  try {
    const rows = readRows_(getSheet_());
    const slots = rows.filter((r) => !r.lead).map((r) => r.time);
    return json_({ ok: true, slots: slots, total: rows.length });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server', message: 'Ошибка сервера. Попробуйте позже.' });
  }
}


/* ---------- POST: запись команды ---------- */

function doPost(e) {
  const lock = LockService.getScriptLock();

  try {
    const data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fullName = cleanText_(data.fullName);
    const platformNick = String(data.platformNick || '').replace(/\s+/g, '').replace(/^@+/, '');
    const telegram = cleanTelegram_(data.telegram);
    const time = String(data.time || '').trim();

    if (fullName.split(' ').length < 2) {
      return json_({ ok: false, error: 'invalid_name', message: 'Укажите фамилию и имя тимлида.' });
    }
    if (!NICK_RE.test(platformNick)) {
      return json_({ ok: false, error: 'invalid_nick', message: 'Укажите корректный ник на платформе.' });
    }
    if (!TELEGRAM_RE.test(telegram)) {
      return json_({ ok: false, error: 'invalid_telegram', message: 'Укажите корректный ник Telegram, например @ivan_dev.' });
    }
    if (!time) {
      return json_({ ok: false, error: 'invalid_time', message: 'Выберите время для команды.' });
    }

    if (!lock.tryLock(10000)) {
      return json_({ ok: false, error: 'busy', message: 'Сервер занят, попробуйте ещё раз.' });
    }

    const sheet = getSheet_();
    const rows = readRows_(sheet);

    if (ONE_BOOKING_PER_LEAD) {
      const already = rows.find((r) => r.lead && (
        same_(r.lead, fullName) || same_(r.nick, platformNick) || same_(r.telegram, telegram)
      ));
      if (already) {
        return json_({
          ok: false,
          error: 'already_booked',
          message: 'Ваша команда уже записана на ' + already.time + '.'
        });
      }
    }

    const slot = rows.find((r) => r.time === time);
    if (!slot) {
      return json_({ ok: false, error: 'not_found', message: 'Такого времени нет в расписании.' });
    }
    if (slot.lead) {
      return json_({ ok: false, error: 'taken', message: 'Это время уже заняла другая команда. Выберите другое.' });
    }

    sheet.getRange(slot.rowNumber, COL_LEAD, 1, 4)
      .setValues([[fullName, platformNick, telegram, new Date()]]);
    SpreadsheetApp.flush();

    return json_({ ok: true, time: time });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server', message: 'Ошибка сервера. Попробуйте позже.' });
  } finally {
    lock.releaseLock();
  }
}


/* ---------- Настройка листа (запустить один раз вручную) ---------- */

function setupSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);

  sheet.getRange(1, 1, 1, 5)
    .setValues([['Время', 'Тимлид', 'Ник на платформе', 'Telegram', 'Дата записи']])
    .setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Текстовый формат, чтобы 11:30 не превращалось в дату
  sheet.getRange('A:D').setNumberFormat('@');

  if (sheet.getLastRow() < 2) {
    const demo = ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30'].map((t) => [t]);
    sheet.getRange(2, 1, demo.length, 1).setValues(demo);
  }
}


/* ---------- Вспомогательные ---------- */

function getSheet_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Лист «' + SHEET_NAME + '» не найден. Запустите setupSheet().');
  return sheet;
}

function readRows_(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= HEADER_ROWS) return [];

  return sheet
    .getRange(HEADER_ROWS + 1, COL_TIME, lastRow - HEADER_ROWS, 4)
    .getDisplayValues()
    .map((v, i) => ({
      rowNumber: HEADER_ROWS + 1 + i,
      time: String(v[0]).trim(),
      lead: String(v[1]).trim(),
      nick: String(v[2]).trim(),
      telegram: String(v[3]).trim()
    }))
    .filter((r) => r.time);
}

function cleanText_(value) {
  let text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (/^[=+\-@]/.test(text)) text = "'" + text; // защита от формул
  return text;
}

function cleanTelegram_(value) {
  let nick = String(value || '').replace(/\s+/g, '');
  nick = nick.replace(/^@+/, '');
  nick = nick.replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i, '');
  nick = nick.replace(/^@+/, '');
  return nick ? '@' + nick : '';
}

function same_(a, b) {
  const n = (s) => String(s || '').replace(/^['@]+/, '').toLowerCase().replace(/ё/g, 'е').trim();
  return n(a) !== '' && n(a) === n(b);
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
