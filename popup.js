const titleEl = document.getElementById("title");
const subtitleEl = document.getElementById("subtitle");
const statusEl = document.getElementById("status");
const exerciseEl = document.getElementById("exercise");
const nextEl = document.getElementById("next");
const doneBtn = document.getElementById("doneBtn");
const skipBtn = document.getElementById("skipBtn");
const deferBtn = document.getElementById("deferBtn");
const mainControlsEl = document.getElementById("mainControls");
const todayBtn = document.getElementById("todayBtn");
const todayHistoryEl = document.getElementById("todayHistory");
const muteBtn = document.getElementById("muteBtn");
const openOptionsBtn = document.getElementById("openOptionsBtn");
const tipEl = document.getElementById("tip");
const isReminderMode = new URLSearchParams(window.location.search).get("mode") === "reminder";
let refreshTimer = null;
let todayOpen = false;

if (isReminderMode) {
  document.body.classList.add("reminder");
  mainControlsEl.hidden = true;
  openOptionsBtn.hidden = true;
  todayHistoryEl.classList.add("hidden");
}

function formatTime(isoString) {
  if (!isoString) {
    return "-";
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === now.toDateString() ? time : `${time} ${date.toLocaleDateString()}`;
}

function formatMinutes(value) {
  const minutes = Math.max(1, Number(value || 1));
  return minutes === 1 ? "1 минуту" : `${minutes} мин.`;
}

function setActionState(hasActiveReminder, isBusy) {
  doneBtn.disabled = !hasActiveReminder || isBusy;
  deferBtn.disabled = !hasActiveReminder || isBusy;
  skipBtn.disabled = !hasActiveReminder || isBusy;
}

function setAlertMode() {
  statusEl.className = "line alert";
}

function setNormalMode() {
  statusEl.className = "line";
}

function setMuteButtonState(settings, isBusy = false) {
  if (isReminderMode) {
    return;
  }

  const hasSettings = Boolean(settings);
  const soundMuted = Boolean(settings?.soundMuted);
  muteBtn.disabled = !hasSettings || isBusy;
  muteBtn.textContent = soundMuted ? "Звук выключен" : "Звук включен";
  muteBtn.title = soundMuted ? "Включить звук напоминаний" : "Выключить звук напоминаний";
  muteBtn.setAttribute("aria-pressed", soundMuted ? "true" : "false");
  muteBtn.classList.toggle("sound-muted", soundMuted);
}

function renderTodayHistory(state) {
  if (isReminderMode || !todayOpen) {
    todayHistoryEl.classList.add("hidden");
    return;
  }

  const total = Array.isArray(state.completedToday) ? state.completedToday.length : 0;
  const summary = Array.isArray(state.todaySummary) ? state.todaySummary : [];

  if (total === 0) {
    todayHistoryEl.textContent = "Сегодня пока ничего не выполнено.";
    todayHistoryEl.classList.remove("hidden");
    return;
  }

  const lines = [`Сегодня выполнено: ${total}`];
  for (const item of summary) {
    lines.push(`${item.exercise} - ${item.count}`);
  }

  todayHistoryEl.textContent = lines.join("\n");
  todayHistoryEl.classList.remove("hidden");
}

function applyBaseCopy() {
  if (isReminderMode) {
    titleEl.textContent = "Пора размяться";
    subtitleEl.textContent = "Подтвердите выполнение или пропустите текущий сигнал, если сейчас нельзя отвлечься.";
    tipEl.hidden = true;
    return;
  }

  titleEl.textContent = "Work Bell";
  subtitleEl.textContent = "Напоминание встать, размяться и сделать одно упражнение. Если вас нет за компьютером, сигнал повторится и окно появится снова.";
  tipEl.hidden = false;
}

function refresh() {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    applyBaseCopy();

    if (!response) {
      setNormalMode();
      setActionState(false, false);
      setMuteButtonState(null);
      statusEl.textContent = "Статус недоступен";
      exerciseEl.textContent = "";
      nextEl.textContent = "";
      renderTodayHistory({ completedToday: [], todaySummary: [] });
      return;
    }

    if (response.validationError === "INVALID_WINDOW") {
      setAlertMode();
      setActionState(false, false);
      setMuteButtonState(response.settings);
      statusEl.textContent = 'Проверьте настройки: время "с" должно быть раньше времени "по".';
      exerciseEl.textContent = "";
      nextEl.textContent = "";
      renderTodayHistory(response.state || { completedToday: [], todaySummary: [] });
      return;
    }

    const { state, settings } = response;
    const pendingReminder = state.pendingReminder;
    const hasActiveReminder = Boolean(state.hasActiveReminder && pendingReminder?.exercise);
    setMuteButtonState(settings);

    if (hasActiveReminder) {
      setAlertMode();
      setActionState(true, false);
      statusEl.textContent = isReminderMode ? "Сейчас сделать" : "Сейчас нужно сделать упражнение";
      exerciseEl.textContent = isReminderMode ? pendingReminder.exercise : `Упражнение: ${pendingReminder.exercise}`;
      nextEl.textContent = isReminderMode
        ? `Повтор сигнала: каждые ${formatMinutes(settings.repeatReminderMinutes)}`
        : `Активный сигнал. Повтор каждые ${formatMinutes(settings.repeatReminderMinutes)}`;
      renderTodayHistory(state);
      return;
    }

    setNormalMode();
    setActionState(false, false);
    statusEl.textContent = "Ожидание следующего сигнала";
    exerciseEl.textContent = "";
    nextEl.textContent = `Следующий сигнал: ${formatTime(state.nextDueAt)}`;
    renderTodayHistory(state);
  });
}

function resolveReminder(type) {
  setActionState(true, true);
  chrome.runtime.sendMessage({ type }, () => {
    if (isReminderMode) {
      window.close();
      return;
    }

    refresh();
  });
}

doneBtn.addEventListener("click", () => {
  resolveReminder("MARK_DONE");
});

skipBtn.addEventListener("click", () => {
  resolveReminder("MARK_SKIPPED");
});

deferBtn.addEventListener("click", () => {
  resolveReminder("MARK_DEFERRED");
});

todayBtn.addEventListener("click", () => {
  todayOpen = !todayOpen;
  todayBtn.textContent = todayOpen ? "Скрыть сегодня" : "Сегодня";
  refresh();
});

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

muteBtn.addEventListener("click", () => {
  const soundMuted = muteBtn.getAttribute("aria-pressed") !== "true";
  setMuteButtonState({ soundMuted }, true);
  chrome.runtime.sendMessage({ type: "SET_SOUND_MUTED", soundMuted }, (response) => {
    if (response?.ok) {
      setMuteButtonState({ soundMuted: response.soundMuted });
      return;
    }

    refresh();
  });
});

refresh();
refreshTimer = setInterval(refresh, 1000);

window.addEventListener("unload", () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
});
