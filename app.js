// ↓↓↓ Настройки
const API_URL = "https://script.google.com/macros/s/AKfycbzw8GdqxQ8ax0FJO1y1JuQGF2euRaYxzJst4qR0UUIaAsAPzVMgKCEYB_VPx6sRcPAb/exec"; // URL веб-приложения Apps Script (/exec)
const EVENT_DATE = "05.10.2026";                   // Дата рейда — меняется только здесь

const timeList = document.querySelector("#time-list");
const form = document.querySelector("#raid-form");
const nameInput = document.querySelector("#full-name");
const nickInput = document.querySelector("#platform-nick");
const telegramInput = document.querySelector("#telegram");
const submitButton = document.querySelector(".submit-button");
const soldOut = document.querySelector("#sold-out");
const message = document.querySelector("#message");

const TELEGRAM_RE = /^@[A-Za-z][A-Za-z0-9_]{4,31}$/;
const NICK_RE = /^[A-Za-z0-9._-]{2,32}$/;

let selectedTime = null;
let isSubmitting = false;

document.querySelectorAll("[data-event-date]").forEach((el) => {
  el.textContent = EVENT_DATE;
});

/* ---------- Нормализация полей ---------- */

function normalizeTelegram(value) {
  let nick = value.trim().replace(/\s+/g, "");
  nick = nick.replace(/^@+/, "");
  nick = nick.replace(/^(https?:\/\/)?(www\.)?(t\.me|telegram\.me)\//i, "");
  nick = nick.replace(/^@+/, "");
  return nick ? "@" + nick : "";
}

function normalizeNick(value) {
  return value.trim().replace(/\s+/g, "").replace(/^@+/, "");
}

// Telegram: @ появляется сразу, пока человек печатает
telegramInput.addEventListener("input", () => {
  const value = telegramInput.value;
  if (value && !value.startsWith("@")) {
    telegramInput.value = "@" + value.replace(/^\s+/, "");
  }
  if (telegramInput.value === "@") telegramInput.value = "";
});

telegramInput.addEventListener("blur", () => {
  telegramInput.value = normalizeTelegram(telegramInput.value);
});

nickInput.addEventListener("blur", () => {
  nickInput.value = normalizeNick(nickInput.value);
});

/* ---------- Слоты из таблицы ---------- */

async function loadTimes() {
  selectedTime = null;
  setListStatus("Загружаем свободное время…");
  submitButton.disabled = true;

  if (!API_URL.startsWith("https://")) {
    setListStatus("Не указан адрес Apps Script в app.js (API_URL).");
    return;
  }

  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    const data = await response.json();
    if (!data.ok) throw new Error(data.message);
    renderTimes(data.slots);
  } catch (error) {
    console.error(error);
    setListStatus("Не удалось загрузить время.");
    showMessage("Проверьте интернет и обновите страницу.", "error");
  }
}

function renderTimes(times) {
  timeList.innerHTML = "";

  if (!times.length) {
    form.hidden = true;
    soldOut.hidden = false;
    return;
  }

  form.hidden = false;
  soldOut.hidden = true;

  times.forEach((time) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "time-button";
    button.textContent = time;
    button.setAttribute("aria-pressed", "false");

    button.addEventListener("click", () => {
      selectedTime = time;
      timeList.querySelectorAll(".time-button").forEach((item) => {
        item.classList.remove("selected");
        item.setAttribute("aria-pressed", "false");
      });
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");
      showMessage("", "");
    });

    timeList.appendChild(button);
  });

  submitButton.disabled = false;
}

function setListStatus(text) {
  timeList.innerHTML = "";
  const p = document.createElement("p");
  p.className = "time-list-status";
  p.textContent = text;
  timeList.appendChild(p);
}

/* ---------- Отправка ---------- */

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isSubmitting) return;

  const fullName = nameInput.value.trim().replace(/\s+/g, " ");
  const platformNick = normalizeNick(nickInput.value);
  const telegram = normalizeTelegram(telegramInput.value);
  nickInput.value = platformNick;
  telegramInput.value = telegram;

  if (fullName.split(" ").length < 2) {
    return fail("Укажите фамилию и имя тимлида.", nameInput);
  }
  if (!NICK_RE.test(platformNick)) {
    return fail("Укажите ник на платформе: латиница, цифры, точка, _ или -.", nickInput);
  }
  if (!TELEGRAM_RE.test(telegram)) {
    return fail("Укажите ник Telegram: от 5 символов, латиница, цифры и _. Например: @ivan_dev", telegramInput);
  }
  if (!selectedTime) {
    return fail("Выберите время для команды.");
  }

  setSubmitting(true);

  try {
    // text/plain — без preflight-запроса, который Apps Script не поддерживает
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ fullName, platformNick, telegram, time: selectedTime })
    });
    const data = await response.json();

    if (data.ok) {
      showMessage(`Команда записана: ${EVENT_DATE} в ${data.time}.`, "success");
      form.reset();
      await loadTimes();
      return;
    }

    showMessage(data.message || "Не удалось записаться.", "error");

    if (data.error === "taken" || data.error === "not_found") {
      await loadTimes();
    }
  } catch (error) {
    console.error(error);
    showMessage("Ошибка соединения. Попробуйте ещё раз.", "error");
  } finally {
    setSubmitting(false);
  }
});

function fail(text, input) {
  showMessage(text, "error");
  if (input) input.focus();
}

function setSubmitting(state) {
  isSubmitting = state;
  submitButton.disabled = state || !timeList.querySelector(".time-button");
  submitButton.textContent = state ? "Записываем…" : "Записать команду";
}

function showMessage(text, type) {
  message.textContent = text;
  message.className = type ? `message ${type}` : "message";
}

loadTimes();
