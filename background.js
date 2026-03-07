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
const REMINDER_REPEAT_MS = 20000;
const ACTIVE_TICK_GAP_MS = 2 * 60000;
const REMINDER_WINDOW_WIDTH = 560;
const REMINDER_WINDOW_HEIGHT = 560;
const OFFSCREEN_START_LOOP = "OFFSCREEN_START_LOOP";
const OFFSCREEN_STOP_LOOP = "OFFSCREEN_STOP_LOOP";
const OFFSCREEN_PLAY_PREVIEW = "OFFSCREEN_PLAY_PREVIEW";

async function getSettings() {
  const raw = await chrome.storage.sync.get({ ...DEFAULTS });
  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises.map((item) => String(item).trim()).filter(Boolean)
    : [];

  return {
    startTime: raw.startTime,
    endTime: raw.endTime,
    intervalMinutes: Math.max(1, Number(raw.intervalMinutes || DEFAULTS.intervalMinutes)),
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
    lastTickAt: null,
    reminderWindowId: null,
    queueDayKey: null,
    queueRemaining: [],
    completedToday: []
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

function todayKey(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

function sanitizeQueue(queue, fallbackExercises) {
  const validSet = new Set(fallbackExercises);
  return Array.isArray(queue)
    ? queue.map((item) => String(item).trim()).filter((item) => item && validSet.has(item))
    : [];
}

function sanitizeCompletedToday(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => ({
      exercise: String(entry?.exercise || "").trim(),
      completedAt: entry?.completedAt ? String(entry.completedAt) : null
    }))
    .filter((entry) => entry.exercise);
}

function shuffleExercises(exercises) {
  const pool = [...exercises];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool;
}

async function normalizeDayState(rawState, settings, now = new Date(), options = {}) {
  const currentDayKey = todayKey(now);
  let queueDayKey = rawState.queueDayKey;
  let queueRemaining = sanitizeQueue(rawState.queueRemaining, settings.exercises);
  let completedToday = sanitizeCompletedToday(rawState.completedToday);
  let hasChanges = false;

  if (queueDayKey !== currentDayKey) {
    queueDayKey = currentDayKey;
    queueRemaining = [];
    completedToday = [];
    hasChanges = true;
  }

  if (options.resetQueue || queueRemaining.length === 0) {
    queueRemaining = shuffleExercises(settings.exercises);
    hasChanges = true;
  }

  if (hasChanges) {
    await chrome.storage.local.set({
      queueDayKey,
      queueRemaining,
      completedToday
    });
  }

  return {
    ...rawState,
    queueDayKey,
    queueRemaining,
    completedToday
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildReminderSpeech(exercise) {
  return {
    introText: `Пора размяться. Сделайте упражнение: ${exercise}. Подтвердите выполнение кнопкой Сделано.`,
    repeatText: exercise
  };
}

async function ensureOffscreen() {
  const hasDocument = await chrome.offscreen.hasDocument();
  if (hasDocument) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Speak or play the reminder until the exercise is confirmed"
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
      console.warn("Offscreen reminder error:", retryError || error);
    }
  }
}

async function startReminderLoop(settings, reminder) {
  const speech = buildReminderSpeech(reminder.exercise);
  await sendOffscreenMessage({
    type: OFFSCREEN_START_LOOP,
    reminderId: reminder.startedAt,
    introText: speech.introText,
    repeatText: speech.repeatText,
    soundFile: settings.soundFile,
    volume: settings.volume,
    repeatMs: REMINDER_REPEAT_MS
  });
}

async function stopReminderLoop() {
  await sendOffscreenMessage({ type: OFFSCREEN_STOP_LOOP });
}

async function playPreview(settings, volumeOverride) {
  await sendOffscreenMessage({
    type: OFFSCREEN_PLAY_PREVIEW,
    introText: "Проверка сигнала. Пора размяться и сделать упражнение.",
    repeatText: "Пора размяться.",
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
    message: `Сейчас сделать: ${reminder.exercise}`,
    contextMessage: "Сигнал будет повторяться, пока вы не нажмете \"Сделано\".",
    buttons: [
      { title: "Сделано" }
    ],
    priority: 2,
    requireInteraction: true
  });
}

async function openReminderWindow() {
  const state = await getState();
  const existingWindowId = Number(state.reminderWindowId || 0);

  if (existingWindowId > 0) {
    try {
      await chrome.windows.update(existingWindowId, { focused: true, drawAttention: true });
      return;
    } catch (error) {
      await chrome.storage.local.set({ reminderWindowId: null });
    }
  }

  const url = chrome.runtime.getURL("popup.html?mode=reminder");
  const createdWindow = await chrome.windows.create({
    url,
    type: "popup",
    focused: true,
    width: REMINDER_WINDOW_WIDTH,
    height: REMINDER_WINDOW_HEIGHT
  });

  await chrome.storage.local.set({ reminderWindowId: createdWindow?.id ?? null });
}

async function closeReminderWindow() {
  const state = await getState();
  const existingWindowId = Number(state.reminderWindowId || 0);

  if (existingWindowId > 0) {
    try {
      await chrome.windows.remove(existingWindowId);
    } catch (error) {
      console.warn("Reminder window close failed:", error);
    }
  }

  await chrome.storage.local.set({ reminderWindowId: null });
}

async function clearReminderPresentation() {
  await stopReminderLoop();
  await setBadgePending(false);
  await chrome.notifications.clear(NOTIFICATION_ID);
  await closeReminderWindow();
}

async function hasVisibleReminderNotification() {
  const notifications = await chrome.notifications.getAll();
  return Boolean(notifications[NOTIFICATION_ID]);
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

function buildTodaySummary(completedToday) {
  const counts = new Map();
  for (const entry of completedToday) {
    counts.set(entry.exercise, (counts.get(entry.exercise) || 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([exercise, count]) => ({ exercise, count }))
    .sort((left, right) => right.count - left.count || left.exercise.localeCompare(right.exercise, "ru"));
}

async function getRuntimeState(now = new Date()) {
  const settings = await getSettings();
  const rawState = await getState();
  const stateWithDay = await normalizeDayState(rawState, settings, now);
  let pendingReminder = stateWithDay.pendingReminder;

  if (!isValidWindow(settings, now)) {
    await chrome.storage.local.set({
      nextDueAt: null,
      pendingReminder: null,
      lastTickAt: now.toISOString()
    });

    return {
      settings,
      state: {
        ...stateWithDay,
        nextDueAt: null,
        pendingReminder: null,
        lastTickAt: now.toISOString(),
        hasActiveReminder: false,
        todaySummary: buildTodaySummary(stateWithDay.completedToday)
      },
      validationError: "INVALID_WINDOW"
    };
  }

  const notificationVisible = await hasVisibleReminderNotification();

  if (!pendingReminder && notificationVisible) {
    pendingReminder = {
      exercise: stateWithDay.lastExercise || "Сделайте упражнение",
      dueAt: stateWithDay.lastTickAt || now.toISOString(),
      startedAt: stateWithDay.lastTickAt || now.toISOString(),
      restored: true
    };

    await chrome.storage.local.set({ pendingReminder });
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
        ...stateWithDay,
        pendingReminder,
        lastExercise: pendingReminder.exercise,
        lastTickAt: now.toISOString(),
        hasActiveReminder: true,
        todaySummary: buildTodaySummary(stateWithDay.completedToday)
      }
    };
  }

  const normalizedState = {
    ...stateWithDay,
    pendingReminder: null,
    nextDueAt: normalizeNextDue(stateWithDay, now, settings).toISOString(),
    lastTickAt: now.toISOString(),
    hasActiveReminder: false,
    todaySummary: buildTodaySummary(stateWithDay.completedToday)
  };

  await chrome.storage.local.set({
    nextDueAt: normalizedState.nextDueAt,
    lastTickAt: normalizedState.lastTickAt
  });

  return { settings, state: normalizedState };
}

async function triggerReminder(now, settings, state) {
  const queueRemaining = sanitizeQueue(state.queueRemaining, settings.exercises);
  const effectiveQueue = queueRemaining.length > 0 ? queueRemaining : shuffleExercises(settings.exercises);
  const exercise = effectiveQueue[0] || settings.exercises[0];
  const nextQueue = effectiveQueue.slice(1);
  const reminder = {
    exercise,
    dueAt: now.toISOString(),
    startedAt: now.toISOString()
  };

  await chrome.storage.local.set({
    pendingReminder: reminder,
    nextDueAt: null,
    lastExercise: reminder.exercise,
    lastTickAt: now.toISOString(),
    queueRemaining: nextQueue,
    queueDayKey: todayKey(now)
  });

  await setBadgePending(true);
  await showReminderNotification(reminder);
  await startReminderLoop(settings, reminder);
  await openReminderWindow();
}

async function keepPendingReminderAlive(pendingReminder, settings) {
  await setBadgePending(true);
  await showReminderNotification(pendingReminder);
  await startReminderLoop(settings, pendingReminder);
  await openReminderWindow();
}

async function rescheduleFromSettings() {
  const now = new Date();
  const state = await getState();

  if (!state.pendingReminder) {
    await chrome.storage.local.set({
      nextDueAt: null,
      lastTickAt: now.toISOString(),
      lastExercise: null
    });
  }

  await tick();
  return { ok: true, pending: Boolean(state.pendingReminder) };
}

async function resetQueueFromSettings() {
  const now = new Date();
  const settings = await getSettings();
  const rawState = await getState();
  const state = await normalizeDayState(rawState, settings, now, { resetQueue: true });

  await chrome.storage.local.set({
    queueDayKey: todayKey(now),
    queueRemaining: state.queueRemaining,
    lastTickAt: now.toISOString()
  });

  if (!state.pendingReminder) {
    await chrome.storage.local.set({ nextDueAt: null });
    await tick();
  }

  return {
    ok: true,
    queueLength: state.queueRemaining.length
  };
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
    await triggerReminder(now, settings, state);
    return;
  }

  await setBadgePending(false);
}

async function handleDone() {
  const now = new Date();
  const settings = await getSettings();
  const rawState = await getState();
  const state = await normalizeDayState(rawState, settings, now);
  const completedExercise = state.pendingReminder?.exercise || state.lastExercise || null;
  const completedToday = [...state.completedToday];

  if (completedExercise) {
    completedToday.push({
      exercise: completedExercise,
      completedAt: now.toISOString()
    });
  }

  if (!isValidWindow(settings, now)) {
    await chrome.storage.local.set({
      pendingReminder: null,
      nextDueAt: null,
      lastCompletedAt: now.toISOString(),
      lastTickAt: now.toISOString(),
      completedToday
    });
    await clearReminderPresentation();
    return { ok: true, nextDueAt: null };
  }

  const nextDueAt = computeNextDueAfter(now, settings);

  await chrome.storage.local.set({
    pendingReminder: null,
    nextDueAt: nextDueAt.toISOString(),
    lastCompletedAt: now.toISOString(),
    lastTickAt: now.toISOString(),
    completedToday
  });

  await clearReminderPresentation();
  return { ok: true, nextDueAt: nextDueAt.toISOString() };
}

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId !== NOTIFICATION_ID) {
    return;
  }

  if (buttonIndex === 0) {
    await handleDone();
  }
});

chrome.notifications.onClicked.addListener(async (notificationId) => {
  if (notificationId !== NOTIFICATION_ID) {
    return;
  }

  await openReminderWindow();
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const state = await getState();
  if (windowId === state.reminderWindowId) {
    await chrome.storage.local.set({ reminderWindowId: null });
  }
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

    if (message?.type === "RESET_QUEUE") {
      sendResponse(await resetQueueFromSettings());
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

