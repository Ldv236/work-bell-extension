const statusEl = document.getElementById("status");
const exerciseEl = document.getElementById("exercise");
const nextEl = document.getElementById("next");
const doneBtn = document.getElementById("doneBtn");
const snoozeBtn = document.getElementById("snoozeBtn");
const openOptionsBtn = document.getElementById("openOptionsBtn");

function formatTime(isoString) {
  if (!isoString) {
    return "—";
  }

  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const now = new Date();
  const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return date.toDateString() === now.toDateString() ? time : `${time} ${date.toLocaleDateString()}`;
}

function setBusyState(isBusy) {
  doneBtn.disabled = isBusy;
  snoozeBtn.disabled = isBusy;
}

function refresh() {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (!response) {
      statusEl.textContent = "Статус недоступен";
      exerciseEl.textContent = "";
      nextEl.textContent = "";
      return;
    }

    if (response.validationError === "INVALID_WINDOW") {
      statusEl.textContent = 'Проверьте настройки: время "с" должно быть раньше времени "по".';
      exerciseEl.textContent = "";
      nextEl.textContent = "";
      return;
    }

    const { state } = response;
    const pendingReminder = state.pendingReminder;

    if (pendingReminder) {
      statusEl.textContent = "Сейчас идет активное напоминание";
      exerciseEl.textContent = `Упражнение: ${pendingReminder.exercise}`;
      nextEl.textContent = `Сигнал начался в ${formatTime(pendingReminder.startedAt)}`;
      return;
    }

    statusEl.textContent = "Ожидание следующего сигнала";
    exerciseEl.textContent = state.lastExercise ? `Последнее упражнение: ${state.lastExercise}` : "Упражнение появится при следующем сигнале";
    nextEl.textContent = `Следующий сигнал: ${formatTime(state.nextDueAt)}`;
  });
}

doneBtn.addEventListener("click", () => {
  setBusyState(true);
  chrome.runtime.sendMessage({ type: "MARK_DONE" }, () => {
    setBusyState(false);
    refresh();
  });
});

snoozeBtn.addEventListener("click", () => {
  setBusyState(true);
  chrome.runtime.sendMessage({ type: "SNOOZE", minutes: 5 }, (response) => {
    setBusyState(false);
    if (response?.reason === "NO_PENDING_REMINDER") {
      statusEl.textContent = "Сейчас нечего откладывать";
      setTimeout(refresh, 1000);
      return;
    }

    refresh();
  });
});

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refresh();
