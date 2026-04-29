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
const soundToggleEl = document.getElementById("soundToggle");
const muteBtn = document.getElementById("muteBtn");
const soundStateEl = document.getElementById("soundState");
const pauseBtn = document.getElementById("pauseBtn");
const pauseOptionsEl = document.getElementById("pauseOptions");
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

function todayKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatEntryTime(isoString) {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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
  muteBtn.checked = !soundMuted;
  soundStateEl.textContent = soundMuted ? "выключен" : "включен";
  soundToggleEl.title = soundMuted ? "Включить звук напоминаний" : "Выключить звук напоминаний";
  soundToggleEl.classList.toggle("sound-muted", soundMuted);
  soundToggleEl.classList.toggle("disabled", !hasSettings || isBusy);
}

function setPauseButtonState(state, isBusy = false) {
  const hasState = Boolean(state);
  const isPaused = Boolean(state?.isPaused);
  pauseBtn.disabled = !hasState || isBusy;
  pauseBtn.textContent = isPaused ? "Снять паузу" : "Не беспокоить";
  pauseBtn.title = isPaused ? "Снова включить напоминания" : "Выберите длительность паузы ниже";
  pauseBtn.setAttribute("aria-pressed", isPaused ? "true" : "false");
  pauseBtn.classList.toggle("pause-active", isPaused);

  if (pauseOptionsEl) {
    pauseOptionsEl.hidden = !hasState || isPaused;
    for (const button of pauseOptionsEl.querySelectorAll("button")) {
      button.disabled = !hasState || isBusy || isPaused;
    }
  }
}

function renderTodayHistory(state) {
  if (isReminderMode || !todayOpen) {
    todayHistoryEl.classList.add("hidden");
    return;
  }

  const total = Array.isArray(state.completedToday) ? state.completedToday.length : 0;
  const entries = Array.isArray(state.completedToday) ? state.completedToday : [];
  const historySummary = Array.isArray(state.historySummary) ? state.historySummary : [];
  const currentDayKey = todayKey();
  const currentDay = historySummary.find((item) => item.dayKey === currentDayKey);
  const otherDays = historySummary.filter((item) => item.dayKey !== currentDayKey);
  const lines = [];

  if (total === 0) {
    lines.push("Сегодня пока ничего не выполнено.");
  } else {
    lines.push(`Сегодня выполнено: ${total}`);
    for (const entry of entries) {
      lines.push(`${formatEntryTime(entry.completedAt)} - ${entry.exercise}`);
    }
  }

  if (currentDay?.summary?.length) {
    lines.push("");
    lines.push("Итоги сегодня:");
    for (const item of currentDay.summary) {
      lines.push(`${item.exercise} - ${item.count}`);
    }
  }

  if (otherDays.length > 0) {
    lines.push("");
    lines.push("История по дням:");
    for (const day of otherDays) {
      const details = Array.isArray(day.summary)
        ? day.summary.map((item) => `${item.exercise}: ${item.count}`).join("; ")
        : "";
      lines.push(details ? `${day.dayKey} - ${day.total} (${details})` : `${day.dayKey} - ${day.total}`);
    }
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
      setPauseButtonState(null);
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
      setPauseButtonState(null);
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
    setPauseButtonState(state);

    if (state.isPaused) {
      setNormalMode();
      setActionState(false, false);
      statusEl.textContent = "Не беспокоить включен";
      exerciseEl.textContent = state.nextExercise ? `Следующее упражнение после паузы: ${state.nextExercise}` : "";
      nextEl.textContent = `Пауза до: ${formatTime(state.pausedUntil)}`;
      renderTodayHistory(state);
      return;
    }

    if (hasActiveReminder) {
      setAlertMode();
      setActionState(true, false);
      statusEl.textContent = pendingReminder.test
        ? "Тестовое напоминание"
        : (isReminderMode ? "Сейчас сделать" : "Сейчас нужно сделать упражнение");
      exerciseEl.textContent = isReminderMode ? pendingReminder.exercise : `Упражнение: ${pendingReminder.exercise}`;
      nextEl.textContent = pendingReminder.test
        ? "Это тест: очередь и история не изменятся"
        : (isReminderMode
          ? `Повтор сигнала: каждые ${formatMinutes(settings.repeatReminderMinutes)}`
          : `Активный сигнал. Повтор каждые ${formatMinutes(settings.repeatReminderMinutes)}`);
      renderTodayHistory(state);
      return;
    }

    setNormalMode();
    setActionState(false, false);
    statusEl.textContent = "Ожидание следующего сигнала";
    exerciseEl.textContent = state.isDeferredNext
      ? `Отложено: ${state.nextExercise} повторится следующим`
      : (state.nextExercise ? `Следующее упражнение: ${state.nextExercise}` : "");
    nextEl.textContent = `${settings.soundMuted ? "Звук выключен. " : ""}Следующий сигнал: ${formatTime(state.nextDueAt)}`;
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
  todayBtn.textContent = todayOpen ? "Скрыть историю" : "История";
  refresh();
});

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

muteBtn.addEventListener("change", () => {
  const soundMuted = !muteBtn.checked;
  setMuteButtonState({ soundMuted }, true);
  chrome.runtime.sendMessage({ type: "SET_SOUND_MUTED", soundMuted }, (response) => {
    if (response?.ok) {
      setMuteButtonState({ soundMuted: response.soundMuted });
      return;
    }

    refresh();
  });
});

function setPause(minutes) {
  setPauseButtonState({ isPaused: true }, true);
  chrome.runtime.sendMessage(
    { type: "SET_PAUSE", minutes },
    () => {
      if (isReminderMode) {
        window.close();
        return;
      }

      refresh();
    }
  );
}

pauseBtn.addEventListener("click", () => {
  const isPaused = pauseBtn.getAttribute("aria-pressed") === "true";
  if (!isPaused) {
    return;
  }

  setPauseButtonState({ isPaused: false }, true);
  chrome.runtime.sendMessage({ type: "CLEAR_PAUSE" }, () => {
    if (isReminderMode) {
      window.close();
      return;
    }

    refresh();
  });
});

pauseOptionsEl.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-pause-minutes]");
  if (!button) {
    return;
  }

  setPause(Number(button.dataset.pauseMinutes));
});

refresh();
refreshTimer = setInterval(refresh, 1000);

window.addEventListener("unload", () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
});
