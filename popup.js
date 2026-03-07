const statusEl = document.getElementById("status");
const exerciseEl = document.getElementById("exercise");
const nextEl = document.getElementById("next");
const doneBtn = document.getElementById("doneBtn");
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

function setActionState(hasActiveReminder, isBusy) {
  doneBtn.disabled = !hasActiveReminder || isBusy;
}

function setAlertMode() {
  statusEl.className = "line alert";
}

function setNormalMode() {
  statusEl.className = "line";
}

function refresh() {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (!response) {
      setNormalMode();
      setActionState(false, false);
      statusEl.textContent = "Статус недоступен";
      exerciseEl.textContent = "";
      nextEl.textContent = "";
      return;
    }

    if (response.validationError === "INVALID_WINDOW") {
      setAlertMode();
      setActionState(false, false);
      statusEl.textContent = 'Проверьте настройки: время "с" должно быть раньше времени "по".';
      exerciseEl.textContent = "";
      nextEl.textContent = "";
      return;
    }

    const { state } = response;
    const pendingReminder = state.pendingReminder;
    const hasActiveReminder = Boolean(state.hasActiveReminder && pendingReminder?.exercise);

    if (hasActiveReminder) {
      setAlertMode();
      setActionState(true, false);
      statusEl.textContent = "Сейчас нужно сделать упражнение";
      exerciseEl.textContent = `Новое упражнение: ${pendingReminder.exercise}`;
      nextEl.textContent = `Голосовой сигнал запущен в ${formatTime(pendingReminder.startedAt)}`;
      return;
    }

    setNormalMode();
    setActionState(false, false);
    statusEl.textContent = "Ожидание следующего сигнала";
    exerciseEl.textContent = "";
    nextEl.textContent = `Следующий сигнал: ${formatTime(state.nextDueAt)}`;
  });
}

doneBtn.addEventListener("click", () => {
  setActionState(true, true);
  chrome.runtime.sendMessage({ type: "MARK_DONE" }, () => {
    refresh();
  });
});

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refresh();
