const statusEl = document.getElementById("status");
const exerciseEl = document.getElementById("exercise");
const nextEl = document.getElementById("next");
const doneBtn = document.getElementById("doneBtn");
const todayBtn = document.getElementById("todayBtn");
const todayHistoryEl = document.getElementById("todayHistory");
const openOptionsBtn = document.getElementById("openOptionsBtn");
const tipEl = document.getElementById("tip");
const isReminderMode = new URLSearchParams(window.location.search).get("mode") === "reminder";
let refreshTimer = null;
let todayOpen = false;

if (isReminderMode) {
  document.body.classList.add("reminder");
  todayBtn.hidden = true;
  todayHistoryEl.classList.add("hidden");
  tipEl.textContent = "Нажмите \"Сделано\", когда упражнение выполнено.";
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

function setActionState(hasActiveReminder, isBusy) {
  doneBtn.disabled = !hasActiveReminder || isBusy;
}

function setAlertMode() {
  statusEl.className = "line alert";
}

function setNormalMode() {
  statusEl.className = "line";
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

function refresh() {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (!response) {
      setNormalMode();
      setActionState(false, false);
      statusEl.textContent = "Статус недоступен";
      exerciseEl.textContent = "";
      nextEl.textContent = "";
      renderTodayHistory({ completedToday: [], todaySummary: [] });
      return;
    }

    if (response.validationError === "INVALID_WINDOW") {
      setAlertMode();
      setActionState(false, false);
      statusEl.textContent = 'Проверьте настройки: время "с" должно быть раньше времени "по".';
      exerciseEl.textContent = "";
      nextEl.textContent = "";
      renderTodayHistory(response.state || { completedToday: [], todaySummary: [] });
      return;
    }

    const { state } = response;
    const pendingReminder = state.pendingReminder;
    const hasActiveReminder = Boolean(state.hasActiveReminder && pendingReminder?.exercise);

    if (hasActiveReminder) {
      setAlertMode();
      setActionState(true, false);
      statusEl.textContent = "Сейчас нужно сделать упражнение";
      exerciseEl.textContent = `Упражнение: ${pendingReminder.exercise}`;
      nextEl.textContent = `Сигнал запущен в ${formatTime(pendingReminder.startedAt)}`;
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

doneBtn.addEventListener("click", () => {
  setActionState(true, true);
  chrome.runtime.sendMessage({ type: "MARK_DONE" }, () => {
    if (isReminderMode) {
      window.close();
      return;
    }

    refresh();
  });
});

todayBtn.addEventListener("click", () => {
  todayOpen = !todayOpen;
  todayBtn.textContent = todayOpen ? "Скрыть сегодня" : "Сегодня";
  refresh();
});

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refresh();
refreshTimer = setInterval(refresh, 1000);

window.addEventListener("unload", () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
});
