function fmtTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const time = d.toLocaleString([], { hour: "2-digit", minute: "2-digit" });
  const now = new Date();
  return d.toDateString() === now.toDateString() ? time : `${time} (${d.toLocaleDateString()})`;
}

function refresh() {
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (resp) => {
    if (!resp) {
      status.textContent = "Не удалось получить статус";
      return;
    }

    const { state } = resp;
    const pending = !!state.pendingAck;
    const missed = Number(state.missedCount || 0);

    status.textContent = pending
      ? `Ждёт подтверждения (пропуски: ${missed})`
      : `Ок (пропуски: ${missed})`;

    exercise.textContent = state.lastExercise ? `Последнее упражнение:\n${state.lastExercise}` : "";

    let extra = "";
    if (state.snoozedUntil) extra = `\nОтложено до: ${fmtTime(state.snoozedUntil)}`;
    next.textContent = `Следующий сигнал: ${fmtTime(state.nextDueAt)}${extra}`;
  });
}

doneBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "MARK_DONE" }, () => refresh());
});

snoozeBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "SNOOZE", minutes: 5 }, (resp) => {
    if (resp?.reason === "NO_PENDING_REMINDER") {
      status.textContent = "Сейчас нечего откладывать";
      setTimeout(refresh, 900);
      return;
    }
    refresh();
  });
});

replayBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ type: "REPLAY_SOUND" }, (resp) => {
    if (resp?.reason === "QUIET_MODE") {
      status.textContent = "Тихий режим включён";
      return;
    }
    status.textContent = "Сигнал повторён";
    setTimeout(refresh, 700);
  });
});

openOptionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

refresh();
