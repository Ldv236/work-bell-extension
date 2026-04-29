const titleEl = document.getElementById("title");
const subtitleEl = document.getElementById("subtitle");
const statusEl = document.getElementById("status");
const exerciseEl = document.getElementById("exercise");
const nextEl = document.getElementById("next");
const doneBtn = document.getElementById("doneBtn");
const skipBtn = document.getElementById("skipBtn");
const deferBtn = document.getElementById("deferBtn");
const actionsEl = document.getElementById("actions");
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
let activeReminderKind = "exercise";

if (isReminderMode) {
  document.body.classList.add("reminder");
  mainControlsEl.hidden = true;
  pauseBtn.hidden = true;
  pauseOptionsEl.hidden = true;
  openOptionsBtn.hidden = true;
  todayHistoryEl.classList.add("hidden");
} else {
  mainControlsEl.hidden = false;
  pauseBtn.hidden = false;
  openOptionsBtn.hidden = false;
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

function getReminderKind(reminder) {
  return reminder?.kind === "bedtime" ? "bedtime" : "exercise";
}

function setActionMode(kind, hasActiveReminder) {
  const isBedtime = hasActiveReminder && kind === "bedtime";
  const showBedtimeClose = isBedtime;
  activeReminderKind = isBedtime ? "bedtime" : "exercise";
  actionsEl.hidden = isBedtime && !showBedtimeClose;
  doneBtn.textContent = showBedtimeClose ? "Ок" : "Сделано";
  deferBtn.hidden = isBedtime;
  skipBtn.hidden = isBedtime;
  actionsEl.classList.toggle("single-action", showBedtimeClose);
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

function setPauseHidden(hidden) {
  if (isReminderMode) {
    return;
  }

  pauseBtn.hidden = hidden;
  if (hidden && pauseOptionsEl) {
    pauseOptionsEl.hidden = true;
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
  const historyByDay = state.historyByDay && typeof state.historyByDay === "object" ? state.historyByDay : {};
  const currentDayKey = todayKey();
  const currentDay = historySummary.find((item) => item.dayKey === currentDayKey);
  const otherDays = Object.entries(historyByDay)
    .filter(([dayKey, dayEntries]) => dayKey !== currentDayKey && Array.isArray(dayEntries) && dayEntries.length > 0)
    .sort(([leftKey], [rightKey]) => rightKey.localeCompare(leftKey));
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
    for (const [dayKey, dayEntries] of otherDays) {
      lines.push(`${dayKey} - ${dayEntries.length}`);
      for (const entry of dayEntries) {
        lines.push(`  ${formatEntryTime(entry.completedAt)} - ${entry.exercise}`);
      }
    }
  }

  todayHistoryEl.textContent = lines.join("\n");
  todayHistoryEl.classList.remove("hidden");
}

function applyBaseCopy(kind = "exercise") {
  if (isReminderMode) {
    titleEl.textContent = kind === "bedtime" ? "Пора спать" : "Пора размяться";
    subtitleEl.textContent = kind === "bedtime"
      ? "Сверните дела, выключите ноутбук и идите отдыхать."
      : "Подтвердите выполнение или пропустите текущий сигнал, если сейчас нельзя отвлечься.";
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
      setActionMode("exercise", false);
      setActionState(false, false);
      setMuteButtonState(null);
      setPauseButtonState(null);
      setPauseHidden(false);
      statusEl.textContent = "Статус недоступен";
      exerciseEl.textContent = "";
      nextEl.textContent = "";
      renderTodayHistory({ completedToday: [], todaySummary: [] });
      return;
    }

    if (response.validationError === "INVALID_WINDOW") {
      setAlertMode();
      setActionMode("exercise", false);
      setActionState(false, false);
      setMuteButtonState(response.settings);
      setPauseButtonState(null);
      setPauseHidden(false);
      statusEl.textContent = 'Проверьте настройки: дневное "с" должно быть раньше "по", а вечернее "по" не должно совпадать с дневным.';
      exerciseEl.textContent = "";
      nextEl.textContent = "";
      renderTodayHistory(response.state || { completedToday: [], todaySummary: [] });
      return;
    }

    const { state, settings } = response;
    const pendingReminder = state.pendingReminder;
    const pendingKind = getReminderKind(pendingReminder);
    const reminderText = pendingKind === "bedtime"
      ? (pendingReminder?.message || pendingReminder?.exercise)
      : pendingReminder?.exercise;
    const hasActiveReminder = Boolean(state.hasActiveReminder && reminderText);
    applyBaseCopy(pendingKind);
    const isTestReminder = Boolean(pendingReminder?.test);
    setActionMode(pendingKind, hasActiveReminder, isTestReminder);
    setMuteButtonState(settings);
    setPauseButtonState(state);
    setPauseHidden(hasActiveReminder && pendingKind === "bedtime");

    if (state.isPaused) {
      setNormalMode();
      setActionMode("exercise", false);
      setPauseHidden(false);
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
      statusEl.textContent = pendingKind === "bedtime"
        ? (isTestReminder ? "Тест вечернего сигнала" : "Вечернее напоминание")
        : (pendingReminder.test
          ? "Тестовое напоминание"
          : (isReminderMode ? "Сейчас сделать" : "Сейчас нужно сделать упражнение"));
      exerciseEl.textContent = pendingKind === "bedtime"
        ? reminderText
        : (isReminderMode ? pendingReminder.exercise : `Упражнение: ${pendingReminder.exercise}`);
      nextEl.textContent = pendingKind === "bedtime"
        ? (isTestReminder
          ? "Это тест: реальное вечернее расписание не изменится"
          : `Ок закроет текущее напоминание. Следующее: ${formatTime(state.nextBedtimeDueAt)}`)
        : (pendingReminder.test
        ? "Это тест: очередь и история не изменятся"
        : (isReminderMode
          ? `Повтор сигнала: каждые ${formatMinutes(settings.repeatReminderMinutes)}`
          : `Активный сигнал. Повтор каждые ${formatMinutes(settings.repeatReminderMinutes)}`));
      renderTodayHistory(state);
      return;
    }

    setNormalMode();
    setActionMode("exercise", false);
    setPauseHidden(false);
    setActionState(false, false);
    statusEl.textContent = "Ожидание следующего сигнала";
    exerciseEl.textContent = state.isDeferredNext
      ? `Отложено: ${state.nextExercise} повторится следующим`
      : (state.nextExercise ? `Следующее упражнение: ${state.nextExercise}` : "");
    const nextItems = [`Следующий сигнал: ${formatTime(state.nextDueAt)}`];
    if (settings.bedtimeEnabled && state.nextBedtimeDueAt) {
      nextItems.push(`Вечернее: ${formatTime(state.nextBedtimeDueAt)}`);
    }
    nextEl.textContent = `${settings.soundMuted ? "Звук выключен. " : ""}${nextItems.join(" · ")}`;
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
    (response) => {
      if (!response?.ok) {
        refresh();
        return;
      }

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
