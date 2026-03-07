const DEFAULTS = {
  startTime: "09:00",
  endTime: "22:00",
  intervalMinutes: 60,
  volume: 0.7,
  soundFile: "sounds/bell.wav",
  exercises: [
    "приседания",
    "приседания широкие",
    "отжимания",
    "пинки перекрестные",
    "пинки боковые",
    "хлопки под бедром",
    "упражнения с резинкой на плечевые суставы/связки",
    "скакалка",
    "жонглирование"
  ]
};

const TICK_ALARM = "work-bell-tick";
const NOTIFICATION_ID = "work-bell-reminder";
const SOUND_REPEAT_MS = 20000;
const ACTIVE_TICK_GAP_MS = 2 * 60000;
const OFFSCREEN_START_LOOP = "OFFSCREEN_START_LOOP";
const OFFSCREEN_STOP_LOOP = "OFFSCREEN_STOP_LOOP";
const OFFSCREEN_PLAY_ONCE = "OFFSCREEN_PLAY_ONCE";

async function getSettings() {
  const raw = await chrome.storage.sync.get({ ...DEFAULTS });
  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises.map((item) => String(item).trim()).filter(Boolean)
    : [];

  return {
    startTime: raw.startTime,
    endTime: raw.endTime,
    intervalMinutes: Math.max(5, Number(raw.intervalMinutes || DEFAULTS.intervalMinutes)),
    volume: Math.max(0, Math.min(1, Number(raw.volume ?? DEFAULTS.volume))),
    soundFile: DEFAULTS.soundFile,
    exercises: exercises.length > 0 ? exercises : DEFAULTS.exercises
  };
}

async function getState() {
  return chrome.storage.local.get({
    nextDueAt: null,
    pendingReminder: null,
    lastCompletedAt: null,
    lastExercise: null,
    lastSnoozedAt: null,
    lastTickAt: null
  });
}

function parseHHMM(hhmm) {
  const [hours, minutes] = String(hhmm).split(":").map(Number);
  return { hours, minutes };
}

function atDay(hhmm, baseDate) {
  const { hours, minutes } = parseHHMM(hhmm);
  const date = new Date(baseDate);
  date.setHours(hours, minutes, 0, 0);
  return date;
}

function isValidWindow(settings, baseDate = new Date()) {
  return atDay(settings.startTime, baseDate).getTime() < atDay(settings.endTime, baseDate).getTime();
}

function isWithinWindow(moment, settings) {
  const start = atDay(settings.startTime, moment);
  const end = atDay(settings.endTime, moment);
  return moment >= start && moment <= end;
}

function isScheduledSlot(moment, settings) {
  if (!isWithinWindow(moment, settings)) {
    return false;
  }

  const start = atDay(settings.startTime, moment);
  const diffMs = moment.getTime() - start.getTime();
  const intervalMs = settings.intervalMinutes * 60000;
  return diffMs % intervalMs === 0;
}

function computeSlot(now, settings, inclusive) {
  const start = atDay(settings.startTime, now);
  const end = atDay(settings.endTime, now);
  const intervalMs = settings.intervalMinutes * 60000;

  if (now < start || (inclusive && now.getTime() === start.getTime())) {
    return start;
  }

  if (now > end || (!inclusive && now.getTime() === end.getTime())) {
    const tomorrow = new Date(start);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const offsetMs = now.getTime() - start.getTime();
  const slotsPassed = inclusive
    ? Math.ceil(offsetMs / intervalMs)
    : Math.floor(offsetMs / intervalMs) + 1;
  const next = new Date(start.getTime() + slotsPassed * intervalMs);

  if (next > end) {
    const tomorrow = new Date(start);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  return next;
}

function computeNextDueAtOrAfter(now, settings) {
  return computeSlot(now, settings, true);
}

function computeNextDueAfter(now, settings) {
  return computeSlot(now, settings, false);
}

function pickExercise(exercises) {
  const pool = Array.isArray(exercises) && exercises.length > 0 ? exercises : DEFAULTS.exercises;
  const index = Math.floor(Math.random() * pool.length);
  return pool[index];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureOffscreen() {
  const hasDocument = await chrome.offscreen.hasDocument();
  if (hasDocument) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Loop reminder sound until the exercise is confirmed"
  });
}

async function sendOffscreenMessage(message) {
  try {
    await ensureOffscreen();
    await delay(80);
    await chrome.runtime.sendMessage(message);
  } catch (error) {
    try {
      await delay(160);
      await chrome.runtime.sendMessage(message);
    } catch (retryError) {
      console.warn("Offscreen audio error:", retryError || error);
    }
  }
}

async function startAlertLoop(settings) {
  await sendOffscreenMessage({
    type: OFFSCREEN_START_LOOP,
    soundFile: settings.soundFile,
    volume: settings.volume,
    repeatMs: SOUND_REPEAT_MS
  });
}

async function stopAlertLoop() {
  await sendOffscreenMessage({ type: OFFSCREEN_STOP_LOOP });
}

async function playPreview(settings, volumeOverride) {
  await sendOffscreenMessage({
    type: OFFSCREEN_PLAY_ONCE,
    soundFile: settings.soundFile,
    volume: Math.max(0, Math.min(1, Number(volumeOverride ?? settings.volume)))
  });
}

async function setBadgePending(isPending) {
  await chrome.action.setBadgeBackgroundColor({ color: isPending ? "#B42318" : "#667085" });
  await chrome.action.setBadgeText({ text: isPending ? "!" : "" });
}

async function showReminderNotification(reminder) {
  await chrome.notifications.create(NOTIFICATION_ID, {
    type: "basic",
    iconUrl: "icons/128.png",
    title: "Пора встать от компьютера",
    message: `Сделайте упражнение: ${reminder.exercise}`,
    contextMessage: "Сигнал будет повторяться, пока вы не подтвердите выполнение.",
    buttons: [
      { title: "Сделано" },
      { title: "Отложить на 5 минут" }
    ],
    priority: 2,
    requireInteraction: true
  });
}

async function clearReminderPresentation() {
  await stopAlertLoop();
  await setBadgePending(false);
  await chrome.notifications.clear(NOTIFICATION_ID);
}

function normalizeNextDue(state, now, settings) {
  const fallback = computeNextDueAtOrAfter(now, settings);

  if (!state.nextDueAt) {
    return fallback;
  }

  const nextDue = new Date(state.nextDueAt);
  if (Number.isNaN(nextDue.getTime())) {
    return fallback;
  }

  if (!isScheduledSlot(nextDue, settings)) {
    return fallback;
  }

  if (nextDue >= now) {
    return nextDue;
  }

  const lastTickAt = state.lastTickAt ? new Date(state.lastTickAt) : null;
  const wasRecentlyActive = lastTickAt && now.getTime() - lastTickAt.getTime() <= ACTIVE_TICK_GAP_MS;

  if (wasRecentlyActive) {
    return nextDue;
  }

  return fallback;
}

async function getRuntimeState(now = new Date()) {
  const settings = await getSettings();
  const rawState = await getState();
  const pendingReminder = rawState.pendingReminder;

  if (!isValidWindow(settings, now)) {
    await chrome.storage.local.set({
      nextDueAt: null,
      pendingReminder: null,
      lastTickAt: now.toISOString()
    });

    return {
      settings,
      state: {
        ...rawState,
        nextDueAt: null,
        pendingReminder: null,
        lastTickAt: now.toISOString()
      },
      validationError: "INVALID_WINDOW"
    };
  }

  if (pendingReminder?.exercise && pendingReminder?.dueAt) {
    await chrome.storage.local.set({
      pendingReminder,
      lastExercise: pendingReminder.exercise,
      lastTickAt: now.toISOString()
    });

    return {
      settings,
      state: {
        ...rawState,
        pendingReminder,
        lastExercise: pendingReminder.exercise,
        lastTickAt: now.toISOString()
      }
    };
  }

  const nextDueAt = normalizeNextDue(rawState, now, settings);
  const normalizedState = {
    ...rawState,
    pendingReminder: null,
    nextDueAt: nextDueAt.toISOString(),
    lastTickAt: now.toISOString()
  };

  await chrome.storage.local.set({
    nextDueAt: normalizedState.nextDueAt,
    lastTickAt: normalizedState.lastTickAt
  });

  return { settings, state: normalizedState };
}

async function triggerReminder(now, settings) {
  const reminder = {
    exercise: pickExercise(settings.exercises),
    dueAt: now.toISOString(),
    startedAt: now.toISOString()
  };

  await chrome.storage.local.set({
    pendingReminder: reminder,
    nextDueAt: null,
    lastExercise: reminder.exercise,
    lastTickAt: now.toISOString()
  });

  await setBadgePending(true);
  await showReminderNotification(reminder);
  await startAlertLoop(settings);
}

async function keepPendingReminderAlive(pendingReminder, settings) {
  await setBadgePending(true);
  await showReminderNotification(pendingReminder);
}

async function rescheduleFromSettings() {
  const now = new Date();
  const state = await getState();

  if (state.pendingReminder) {
    return { ok: true, pending: true };
  }

  await chrome.storage.local.set({
    nextDueAt: null,
    lastTickAt: now.toISOString()
  });

  await tick();
  return { ok: true, pending: false };
}

async function tick() {
  const now = new Date();
  const runtime = await getRuntimeState(now);

  if (runtime.validationError === "INVALID_WINDOW") {
    await clearReminderPresentation();
    return;
  }

  const { settings, state } = runtime;

  if (state.pendingReminder) {
    await keepPendingReminderAlive(state.pendingReminder, settings);
    return;
  }

  const nextDueAt = state.nextDueAt ? new Date(state.nextDueAt) : computeNextDueAtOrAfter(now, settings);

  if (now >= nextDueAt && isWithinWindow(nextDueAt, settings)) {
    await triggerReminder(now, settings);
    return;
  }

  await setBadgePending(false);
}

async function handleDone() {
  const now = new Date();
  const settings = await getSettings();

  if (!isValidWindow(settings, now)) {
    await chrome.storage.local.set({
      pendingReminder: null,
      nextDueAt: null,
      lastCompletedAt: now.toISOString(),
      lastTickAt: now.toISOString()
    });
    await clearReminderPresentation();
    return { ok: true, nextDueAt: null };
  }

  const nextDueAt = computeNextDueAfter(now, settings);

  await chrome.storage.local.set({
    pendingReminder: null,
    nextDueAt: nextDueAt.toISOString(),
    lastCompletedAt: now.toISOString(),
    lastTickAt: now.toISOString()
  });

  await clearReminderPresentation();
  return { ok: true, nextDueAt: nextDueAt.toISOString() };
}

async function handleSnooze(minutes = 5) {
  const now = new Date();
  const state = await getState();

  if (!state.pendingReminder) {
    return { ok: false, reason: "NO_PENDING_REMINDER" };
  }

  const snoozedUntil = new Date(now.getTime() + minutes * 60000);
  await chrome.storage.local.set({
    pendingReminder: null,
    nextDueAt: snoozedUntil.toISOString(),
    lastSnoozedAt: now.toISOString(),
    lastTickAt: now.toISOString()
  });

  await clearReminderPresentation();
  return { ok: true, nextDueAt: snoozedUntil.toISOString() };
}

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId !== NOTIFICATION_ID) {
    return;
  }

  if (buttonIndex === 0) {
    await handleDone();
    return;
  }

  if (buttonIndex === 1) {
    await handleSnooze(5);
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId !== NOTIFICATION_ID) {
    return;
  }

  await chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    if (message?.type === "GET_STATUS") {
      sendResponse(await getRuntimeState(new Date()));
      return;
    }

    if (message?.type === "MARK_DONE") {
      sendResponse(await handleDone());
      return;
    }

    if (message?.type === "SNOOZE") {
      sendResponse(await handleSnooze(Number(message.minutes || 5)));
      return;
    }

    if (message?.type === "PLAY_PREVIEW") {
      const settings = await getSettings();
      await playPreview(settings, message.volume);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "SETTINGS_UPDATED") {
      sendResponse(await rescheduleFromSettings());
      return;
    }

    sendResponse({ ok: false, reason: "UNKNOWN_MESSAGE" });
  })();

  return true;
});

async function bootstrap() {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  await tick();
}

chrome.runtime.onInstalled.addListener(bootstrap);
chrome.runtime.onStartup.addListener(bootstrap);
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === TICK_ALARM) {
    await tick();
  }
});
