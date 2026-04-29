const LEGACY_REMINDER_INTRO_TEXT = "Пора размяться.";
const LEGACY_REMINDER_OUTRO_TEXT = "Подтвердите в приложении.";
const LEGACY_BAND_EXERCISE = "упражнения с резинкой на плечевые суставы/связки";
const BAND_EXERCISE_ROTATION = "с резинкой на плечевые суставы (ротация)";
const BAND_EXERCISE_ABDUCTION = "с резинкой на плечевые суставы (отведения)";
const LEGACY_DEFAULT_EXERCISES = [
  "приседания",
  "приседания широкие",
  "отжимания",
  "пинки перекрестные",
  "пинки боковые",
  "хлопки под бедром",
  LEGACY_BAND_EXERCISE,
  "скакалка",
  "жонглирование"
];
const PREVIOUS_DEFAULT_EXERCISES = [
  "приседания",
  "приседания широкие",
  "отжимания",
  "пинки перекрестные",
  "пинки боковые",
  "хлопки под бедром",
  BAND_EXERCISE_ROTATION,
  BAND_EXERCISE_ABDUCTION,
  "скакалка",
  "жонглирование"
];
const DEFAULT_EXERCISES = [
  "приседания",
  "отжимания от стены или стола",
  "наклоны вперед",
  "наклоны в стороны",
  "круговые движения плечами",
  "махи руками",
  "подъемы на носки",
  "ходьба на месте"
];
const DEFAULTS = {
  startTime: "09:00",
  endTime: "22:00",
  bedtimeEnabled: true,
  bedtimeEndTime: "23:30",
  bedtimeIntervalMinutes: 15,
  bedtimeReminderText: "Пора сворачивать дела и идти спать.",
  intervalMinutes: 60,
  repeatReminderMinutes: 3,
  scheduleMode: "after_confirmation",
  queueOrderMode: "random",
  audioMode: "voice",
  reminderIntroText: "Пора размяться. Выполни упражнение",
  reminderOutroText: ". Подтвердите в приложении.",
  volume: 0.7,
  soundMuted: false,
  soundFile: "sounds/bell.wav",
  exercises: DEFAULT_EXERCISES
};

const SCHEDULE_MODE_FIXED = "fixed_slots";
const SCHEDULE_MODE_AFTER_CONFIRMATION = "after_confirmation";
const QUEUE_ORDER_RANDOM = "random";
const QUEUE_ORDER_LISTED = "listed";
const AUDIO_MODE_VOICE = "voice";
const AUDIO_MODE_BEEP = "beep";
const REMINDER_KIND_EXERCISE = "exercise";
const REMINDER_KIND_BEDTIME = "bedtime";
const TICK_ALARM = "work-bell-tick";
const REPEAT_ALARM = "work-bell-repeat";
const NOTIFICATION_ID = "work-bell-reminder";
const ACTIVE_TICK_GAP_MS = 2 * 60000;
const REMINDER_WINDOW_WIDTH = 620;
const REMINDER_WINDOW_HEIGHT = 660;
const OFFSCREEN_PLAY = "OFFSCREEN_PLAY";
const OFFSCREEN_PLAY_PREVIEW = "OFFSCREEN_PLAY_PREVIEW";
const OFFSCREEN_STOP = "OFFSCREEN_STOP";
const EXPORT_VERSION = 1;

function isSameExerciseList(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((item, index) => String(item).trim() === String(right[index]).trim());
}

function migrateExercises(exercises) {
  if (!Array.isArray(exercises)) {
    return { exercises: [], changed: false };
  }

  const normalized = exercises.map((item) => String(item).trim()).filter(Boolean);

  if (isSameExerciseList(normalized, LEGACY_DEFAULT_EXERCISES)
    || isSameExerciseList(normalized, PREVIOUS_DEFAULT_EXERCISES)) {
    return { exercises: DEFAULT_EXERCISES, changed: true };
  }

  const migrated = [];
  let changed = false;

  for (const item of normalized) {
    if (item === LEGACY_BAND_EXERCISE) {
      migrated.push(BAND_EXERCISE_ROTATION, BAND_EXERCISE_ABDUCTION);
      changed = true;
      continue;
    }

    migrated.push(item);
  }

  return { exercises: migrated, changed };
}

async function getSettings() {
  const raw = await chrome.storage.sync.get({ ...DEFAULTS });
  const scheduleMode = raw.scheduleMode === SCHEDULE_MODE_FIXED
    ? SCHEDULE_MODE_FIXED
    : SCHEDULE_MODE_AFTER_CONFIRMATION;
  const queueOrderMode = raw.queueOrderMode === QUEUE_ORDER_LISTED
    ? QUEUE_ORDER_LISTED
    : QUEUE_ORDER_RANDOM;
  const audioMode = raw.audioMode === AUDIO_MODE_BEEP ? AUDIO_MODE_BEEP : AUDIO_MODE_VOICE;
  const migratedExercises = migrateExercises(raw.exercises);
  const reminderIntroTextRaw = String(raw.reminderIntroText ?? DEFAULTS.reminderIntroText).trim();
  const reminderOutroTextRaw = String(raw.reminderOutroText ?? DEFAULTS.reminderOutroText).trim();
  let bedtimeEnabled = raw.bedtimeEnabled !== false;
  const bedtimeEndTime = isValidHHMM(raw.bedtimeEndTime) ? raw.bedtimeEndTime : DEFAULTS.bedtimeEndTime;
  const bedtimeReminderText = String(raw.bedtimeReminderText ?? DEFAULTS.bedtimeReminderText).trim()
    || DEFAULTS.bedtimeReminderText;
  const reminderIntroText = reminderIntroTextRaw === LEGACY_REMINDER_INTRO_TEXT
    ? DEFAULTS.reminderIntroText
    : (reminderIntroTextRaw || DEFAULTS.reminderIntroText);
  const reminderOutroText = reminderOutroTextRaw === LEGACY_REMINDER_OUTRO_TEXT
    ? DEFAULTS.reminderOutroText
    : reminderOutroTextRaw;
  const exercises = migratedExercises.exercises.length > 0 ? migratedExercises.exercises : DEFAULTS.exercises;

  if (bedtimeEnabled && isValidHHMM(raw.endTime) && raw.endTime >= bedtimeEndTime) {
    bedtimeEnabled = false;
  }

  if (migratedExercises.changed
    || reminderIntroTextRaw === LEGACY_REMINDER_INTRO_TEXT
    || reminderOutroTextRaw === LEGACY_REMINDER_OUTRO_TEXT) {
    await chrome.storage.sync.set({
      exercises,
      reminderIntroText,
      reminderOutroText
    });
  }

  return {
    startTime: raw.startTime,
    endTime: raw.endTime,
    bedtimeEnabled,
    bedtimeEndTime,
    bedtimeIntervalMinutes: positiveNumber(raw.bedtimeIntervalMinutes, DEFAULTS.bedtimeIntervalMinutes),
    bedtimeReminderText,
    intervalMinutes: positiveNumber(raw.intervalMinutes, DEFAULTS.intervalMinutes),
    repeatReminderMinutes: positiveNumber(raw.repeatReminderMinutes, DEFAULTS.repeatReminderMinutes),
    scheduleMode,
    queueOrderMode,
    audioMode,
    reminderIntroText,
    reminderOutroText,
    volume: normalizedVolume(raw.volume),
    soundMuted: Boolean(raw.soundMuted),
    soundFile: DEFAULTS.soundFile,
    exercises
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
    pausedUntil: null,
    nextBedtimeDueAt: null,
    deferredExercise: null,
    queueDayKey: null,
    queueRemaining: [],
    completedToday: [],
    historyByDay: {}
  });
}

function isValidHHMM(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value || ""));
  if (!match) {
    return false;
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
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

function isSameCalendarDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function isValidWindow(settings, baseDate = new Date()) {
  if (!isValidHHMM(settings.startTime) || !isValidHHMM(settings.endTime)) {
    return false;
  }

  const dayStart = atDay(settings.startTime, baseDate);
  const dayEnd = atDay(settings.endTime, baseDate);
  if (dayStart.getTime() >= dayEnd.getTime()) {
    return false;
  }

  if (!settings.bedtimeEnabled) {
    return true;
  }

  if (!isValidHHMM(settings.bedtimeEndTime)) {
    return false;
  }

  return dayEnd.getTime() < atDay(settings.bedtimeEndTime, baseDate).getTime();
}

function isWithinWindow(moment, settings) {
  const start = atDay(settings.startTime, moment);
  const end = atDay(settings.endTime, moment);
  return moment >= start && moment < end;
}

function isBedtimeWindowConfigured(settings, baseDate = new Date()) {
  return Boolean(settings.bedtimeEnabled
    && isValidHHMM(settings.endTime)
    && isValidHHMM(settings.bedtimeEndTime)
    && atDay(settings.endTime, baseDate).getTime() < atDay(settings.bedtimeEndTime, baseDate).getTime());
}

function isWithinBedtimeWindow(moment, settings) {
  if (!isBedtimeWindowConfigured(settings, moment)) {
    return false;
  }

  const start = atDay(settings.endTime, moment);
  const end = atDay(settings.bedtimeEndTime, moment);
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

  if (now >= end || (!inclusive && now.getTime() === end.getTime())) {
    const tomorrow = new Date(start);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const offsetMs = now.getTime() - start.getTime();
  const slotsPassed = inclusive
    ? Math.ceil(offsetMs / intervalMs)
    : Math.floor(offsetMs / intervalMs) + 1;
  const next = new Date(start.getTime() + slotsPassed * intervalMs);

  if (next >= end) {
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

function computeRelativeInitialDue(now, settings) {
  const start = atDay(settings.startTime, now);
  const end = atDay(settings.endTime, now);

  if (now < start) {
    return start;
  }

  if (now >= end) {
    const tomorrow = new Date(start);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  return now;
}

function computeRelativeDueAfter(baseMoment, settings) {
  const start = atDay(settings.startTime, baseMoment);
  const end = atDay(settings.endTime, baseMoment);
  const intervalMs = settings.intervalMinutes * 60000;

  if (baseMoment < start) {
    return start;
  }

  if (baseMoment >= end) {
    const tomorrow = new Date(start);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow;
  }

  const candidate = new Date(baseMoment.getTime() + intervalMs);
  if (candidate < end) {
    return candidate;
  }

  const tomorrow = new Date(start);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

function computeBedtimeStart(baseMoment, settings) {
  return atDay(settings.endTime, baseMoment);
}

function computeTomorrowBedtimeStart(baseMoment, settings) {
  const tomorrow = computeBedtimeStart(baseMoment, settings);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

function computeNextBedtimeDue(now, settings) {
  if (!isBedtimeWindowConfigured(settings, now)) {
    return null;
  }

  const start = computeBedtimeStart(now, settings);
  const end = atDay(settings.bedtimeEndTime, now);

  if (now < start) {
    return start;
  }

  if (now <= end) {
    return now;
  }

  return computeTomorrowBedtimeStart(now, settings);
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

function sanitizeHistoryByDay(historyByDay) {
  if (!historyByDay || typeof historyByDay !== "object" || Array.isArray(historyByDay)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(historyByDay)
      .filter(([dayKey]) => /^\d{4}-\d{2}-\d{2}$/.test(dayKey))
      .map(([dayKey, entries]) => [dayKey, sanitizeCompletedToday(entries)])
      .filter(([, entries]) => entries.length > 0)
  );
}

function shuffleExercises(exercises) {
  const pool = [...exercises];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }
  return pool;
}

function buildExerciseQueue(exercises, queueOrderMode) {
  return queueOrderMode === QUEUE_ORDER_LISTED ? [...exercises] : shuffleExercises(exercises);
}

async function normalizeDayState(rawState, settings, now = new Date(), options = {}) {
  const currentDayKey = todayKey(now);
  let queueDayKey = rawState.queueDayKey;
  let queueRemaining = sanitizeQueue(rawState.queueRemaining, settings.exercises);
  let completedToday = sanitizeCompletedToday(rawState.completedToday);
  let historyByDay = sanitizeHistoryByDay(rawState.historyByDay);
  let hasChanges = false;

  if (queueDayKey !== currentDayKey) {
    const previousDayEntries = historyByDay[queueDayKey] || [];
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(queueDayKey || ""))
      && completedToday.length > 0
      && completedToday.length > previousDayEntries.length) {
      historyByDay = {
        ...historyByDay,
        [queueDayKey]: completedToday
      };
    }

    queueDayKey = currentDayKey;
    queueRemaining = [];
    completedToday = historyByDay[currentDayKey] || [];
    hasChanges = true;
  }

  const currentHistoryEntries = historyByDay[currentDayKey] || [];
  if (completedToday.length > 0 && completedToday.length > currentHistoryEntries.length) {
    historyByDay = {
      ...historyByDay,
      [currentDayKey]: completedToday
    };
    hasChanges = true;
  }

  if (options.resetQueue || (!options.preserveEmptyQueue && queueRemaining.length === 0)) {
    queueRemaining = buildExerciseQueue(settings.exercises, settings.queueOrderMode);
    hasChanges = true;
  }

  if (hasChanges) {
    await chrome.storage.local.set({
      queueDayKey,
      queueRemaining,
      completedToday,
      historyByDay
    });
  }

  return {
    ...rawState,
    queueDayKey,
    queueRemaining,
    completedToday,
    historyByDay
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildReminderSpeech(exercise, settings) {
  const parts = [settings.reminderIntroText, exercise, settings.reminderOutroText]
    .map((item) => String(item || "").trim())
    .filter(Boolean);

  return {
    introText: parts.join(" "),
    repeatText: exercise
  };
}

function getReminderKind(reminder) {
  return reminder?.kind === REMINDER_KIND_BEDTIME ? REMINDER_KIND_BEDTIME : REMINDER_KIND_EXERCISE;
}

function getReminderText(reminder, settings) {
  if (getReminderKind(reminder) === REMINDER_KIND_BEDTIME) {
    return String(reminder?.message || settings.bedtimeReminderText || DEFAULTS.bedtimeReminderText).trim();
  }

  return String(reminder?.exercise || "").trim();
}

function getReminderRepeatMinutes(settings, reminder) {
  return getReminderKind(reminder) === REMINDER_KIND_BEDTIME
    ? settings.bedtimeIntervalMinutes
    : settings.repeatReminderMinutes;
}

async function ensureOffscreen() {
  const hasDocument = await chrome.offscreen.hasDocument();
  if (hasDocument) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Speak or play reminder audio on demand"
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

async function playSignal(text, settings, volumeOverride) {
  if (settings.soundMuted) {
    return;
  }

  await sendOffscreenMessage({
    type: OFFSCREEN_PLAY,
    text,
    audioMode: settings.audioMode,
    soundFile: settings.soundFile,
    volume: Math.max(0, Math.min(1, Number(volumeOverride ?? settings.volume)))
  });
}

async function stopOffscreenSignal() {
  try {
    const hasDocument = await chrome.offscreen.hasDocument();
    if (!hasDocument) {
      return;
    }

    await chrome.runtime.sendMessage({ type: OFFSCREEN_STOP });
  } catch (error) {
    console.warn("Offscreen stop error:", error);
  }
}

async function playReminderIntro(settings, reminder) {
  if (getReminderKind(reminder) === REMINDER_KIND_BEDTIME) {
    await playSignal(getReminderText(reminder, settings), settings);
    return;
  }

  const speech = buildReminderSpeech(reminder.exercise, settings);
  await playSignal(speech.introText, settings);
}

async function playReminderRepeat(settings, reminder) {
  await playSignal(getReminderText(reminder, settings), settings);
}

async function playPreview(settings, volumeOverride, introOverride, outroOverride, audioModeOverride) {
  const previewSettings = {
    ...settings,
    audioMode: audioModeOverride === AUDIO_MODE_BEEP ? AUDIO_MODE_BEEP : settings.audioMode,
    reminderIntroText: String(introOverride ?? settings.reminderIntroText).trim() || DEFAULTS.reminderIntroText,
    reminderOutroText: String(outroOverride ?? settings.reminderOutroText).trim()
  };
  const speech = buildReminderSpeech(settings.exercises[0] || "приседания", previewSettings);

  await sendOffscreenMessage({
    type: OFFSCREEN_PLAY_PREVIEW,
    text: speech.introText,
    audioMode: previewSettings.audioMode,
    soundFile: settings.soundFile,
    volume: Math.max(0, Math.min(1, Number(volumeOverride ?? settings.volume)))
  });
}

async function scheduleRepeatAlarm(repeatReminderMinutes) {
  await chrome.alarms.clear(REPEAT_ALARM);
  chrome.alarms.create(REPEAT_ALARM, {
    delayInMinutes: repeatReminderMinutes,
    periodInMinutes: repeatReminderMinutes
  });
}

async function ensureRepeatAlarmScheduled(repeatReminderMinutes) {
  const existingAlarm = await chrome.alarms.get(REPEAT_ALARM);
  const expected = Number(repeatReminderMinutes);
  const current = Number(existingAlarm?.periodInMinutes || 0);

  if (!existingAlarm || Math.abs(current - expected) > 0.001) {
    await scheduleRepeatAlarm(repeatReminderMinutes);
  }
}

async function clearRepeatAlarm() {
  await chrome.alarms.clear(REPEAT_ALARM);
}

async function setBadgePending(isPending) {
  await chrome.action.setBadgeBackgroundColor({ color: isPending ? "#B42318" : "#667085" });
  await chrome.action.setBadgeText({ text: isPending ? "!" : "" });
}

async function showReminderNotification(reminder) {
  const isTest = Boolean(reminder.test);
  const isBedtime = getReminderKind(reminder) === REMINDER_KIND_BEDTIME;
  await chrome.notifications.create(NOTIFICATION_ID, {
    type: "basic",
    iconUrl: "icons/128.png",
    title: isBedtime
      ? "Пора спать"
      : (isTest ? "Тестовое напоминание Work Bell" : "Пора встать от компьютера"),
    message: isBedtime ? (reminder.message || "Пора идти спать") : `Сейчас сделать: ${reminder.exercise}`,
    contextMessage: isTest
      ? "Это тест: очередь и история не изменятся."
      : (isBedtime ? "Сигнал будет повторяться, пока браузер или расширение работают." : "Откройте окно, чтобы отложить или включить паузу."),
    ...(isBedtime ? {} : {
      buttons: [
        { title: "Сделано" },
        { title: "Пропущу" }
      ]
    }),
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
  await clearRepeatAlarm();
  await setBadgePending(false);
  await chrome.notifications.clear(NOTIFICATION_ID);
  await closeReminderWindow();
}

async function hasVisibleReminderNotification() {
  const notifications = await chrome.notifications.getAll();
  return Boolean(notifications[NOTIFICATION_ID]);
}

function computeFallbackNextDue(now, settings) {
  return settings.scheduleMode === SCHEDULE_MODE_FIXED
    ? computeNextDueAtOrAfter(now, settings)
    : computeRelativeInitialDue(now, settings);
}

function didRelativeScheduleInputsChange(previousSettings, currentSettings) {
  if (!previousSettings || !currentSettings) {
    return true;
  }

  return previousSettings.scheduleMode !== currentSettings.scheduleMode
    || previousSettings.startTime !== currentSettings.startTime
    || previousSettings.endTime !== currentSettings.endTime
    || Number(previousSettings.intervalMinutes) !== Number(currentSettings.intervalMinutes);
}

function computeRelativeDueAfterSettingsChange(now, state, settings) {
  const lastCompletedAt = state.lastCompletedAt ? new Date(state.lastCompletedAt) : null;

  if (lastCompletedAt && !Number.isNaN(lastCompletedAt.getTime()) && isSameCalendarDay(lastCompletedAt, now)) {
    return computeRelativeDueAfter(lastCompletedAt, settings);
  }

  return computeRelativeDueAfter(now, settings);
}

function normalizeNextDue(state, now, settings) {
  const fallback = computeFallbackNextDue(now, settings);

  if (!state.nextDueAt) {
    return fallback;
  }

  const nextDue = new Date(state.nextDueAt);
  if (Number.isNaN(nextDue.getTime())) {
    return fallback;
  }

  const lastTickAt = state.lastTickAt ? new Date(state.lastTickAt) : null;
  const wasRecentlyActive = lastTickAt && now.getTime() - lastTickAt.getTime() <= ACTIVE_TICK_GAP_MS;

  if (settings.scheduleMode === SCHEDULE_MODE_FIXED) {
    if (!isScheduledSlot(nextDue, settings)) {
      return fallback;
    }

    if (nextDue >= now) {
      return nextDue;
    }

    if (wasRecentlyActive) {
      return nextDue;
    }

    return fallback;
  }

  if (nextDue >= now) {
    return nextDue;
  }

  if (wasRecentlyActive) {
    return nextDue;
  }

  return computeRelativeDueAfter(now, settings);
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

function buildHistorySummary(historyByDay) {
  return Object.entries(sanitizeHistoryByDay(historyByDay))
    .map(([dayKey, entries]) => ({
      dayKey,
      total: entries.length,
      summary: buildTodaySummary(entries)
    }))
    .sort((left, right) => right.dayKey.localeCompare(left.dayKey));
}

function getNextExercisePreview(state, settings) {
  const queueRemaining = sanitizeQueue(state.queueRemaining, settings.exercises);
  return queueRemaining[0] || settings.exercises[0] || "";
}

function parseIsoDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isPauseActive(pausedUntil, now) {
  const pauseDate = parseIsoDate(pausedUntil);
  return Boolean(pauseDate && pauseDate > now);
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? number : fallback;
}

function normalizedVolume(value, fallback = DEFAULTS.volume) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(1, number)) : fallback;
}

function computeDueAfterPause(pausedUntil, settings) {
  const pauseEnd = parseIsoDate(pausedUntil) || new Date();

  if (settings.scheduleMode === SCHEDULE_MODE_FIXED) {
    return computeNextDueAtOrAfter(pauseEnd, settings);
  }

  if (isWithinWindow(pauseEnd, settings)) {
    return pauseEnd;
  }

  return computeRelativeDueAfter(pauseEnd, settings);
}

function buildStatusState(state, settings, extras = {}) {
  const nextExercise = extras.nextExercise ?? getNextExercisePreview(state, settings);
  const deferredExercise = String(state.deferredExercise || "").trim();

  return {
    ...state,
    ...extras,
    nextExercise,
    deferredExercise,
    isDeferredNext: Boolean(deferredExercise && deferredExercise === nextExercise),
    todaySummary: buildTodaySummary(state.completedToday),
    historySummary: buildHistorySummary(state.historyByDay)
  };
}

function restoreExerciseToQueue(exercise, queueRemaining, settings) {
  const normalizedExercise = String(exercise || "").trim();
  const sanitizedQueue = sanitizeQueue(queueRemaining, settings.exercises);

  if (!normalizedExercise || !settings.exercises.includes(normalizedExercise)) {
    return sanitizedQueue;
  }

  if (sanitizedQueue[0] === normalizedExercise) {
    return sanitizedQueue;
  }

  return [normalizedExercise, ...sanitizedQueue];
}

async function refreshPendingReminderPresentation(pendingReminder, settings, options = {}) {
  await setBadgePending(true);
  const notificationVisible = await hasVisibleReminderNotification();
  if (options.forceNotification || !notificationVisible) {
    await showReminderNotification(pendingReminder);
  }
  if (options.forceWindow) {
    await openReminderWindow();
  }
  await ensureRepeatAlarmScheduled(getReminderRepeatMinutes(settings, pendingReminder));
}

async function getRuntimeState(now = new Date()) {
  const settings = await getSettings();
  const rawState = await getState();
  const stateWithDay = await normalizeDayState(rawState, settings, now);
  let pendingReminder = stateWithDay.pendingReminder;

  if (pendingReminder?.dueAt) {
    const reminderDueAt = new Date(pendingReminder.dueAt);
    if (!Number.isNaN(reminderDueAt.getTime()) && !isSameCalendarDay(reminderDueAt, now)) {
      pendingReminder = null;
      await chrome.storage.local.set({
        pendingReminder: null,
        nextDueAt: null,
        nextBedtimeDueAt: null,
        reminderWindowId: null
      });
      await clearReminderPresentation();
    }
  }

  if (!isValidWindow(settings, now)) {
    await chrome.storage.local.set({
      nextDueAt: null,
      nextBedtimeDueAt: null,
      pendingReminder: null,
      lastTickAt: now.toISOString()
    });

    return {
      settings,
      state: {
        ...buildStatusState(stateWithDay, settings, {
          nextDueAt: null,
          nextBedtimeDueAt: null,
          pendingReminder: null,
          lastTickAt: now.toISOString(),
          hasActiveReminder: false,
          isPaused: false
        })
      },
      validationError: "INVALID_WINDOW"
    };
  }

  if (getReminderKind(pendingReminder) === REMINDER_KIND_EXERCISE && !isWithinWindow(now, settings)) {
    pendingReminder = null;
    await chrome.storage.local.set({
      pendingReminder: null,
      nextDueAt: computeFallbackNextDue(now, settings).toISOString(),
      lastTickAt: now.toISOString()
    });
    await clearReminderPresentation();
  }

  const isBedtimeNow = isWithinBedtimeWindow(now, settings);

  if (isPauseActive(stateWithDay.pausedUntil, now) && !isBedtimeNow) {
    await chrome.storage.local.set({
      pendingReminder: null,
      lastTickAt: now.toISOString()
    });

    if (pendingReminder) {
      await clearReminderPresentation();
      pendingReminder = null;
    }

    return {
      settings,
      state: buildStatusState(stateWithDay, settings, {
        pendingReminder: null,
        lastTickAt: now.toISOString(),
        nextBedtimeDueAt: computeNextBedtimeDue(now, settings)?.toISOString() || null,
        hasActiveReminder: false,
        isPaused: true,
        pausedUntil: stateWithDay.pausedUntil
      })
    };
  }

  if (stateWithDay.pausedUntil && (!isPauseActive(stateWithDay.pausedUntil, now) || isBedtimeNow)) {
    stateWithDay.pausedUntil = null;
    await chrome.storage.local.set({ pausedUntil: null });
  }

  const notificationVisible = await hasVisibleReminderNotification();

  if (!pendingReminder && notificationVisible) {
    await chrome.notifications.clear(NOTIFICATION_ID);
  }

  if (pendingReminder?.exercise && pendingReminder?.dueAt) {
    const pendingKind = getReminderKind(pendingReminder);
    const lastExercise = pendingKind === REMINDER_KIND_EXERCISE
      ? pendingReminder.exercise
      : stateWithDay.lastExercise;

    await chrome.storage.local.set({
      pendingReminder,
      lastExercise,
      lastTickAt: now.toISOString()
    });

    return {
      settings,
      state: buildStatusState(stateWithDay, settings, {
        pendingReminder,
        lastExercise,
        lastTickAt: now.toISOString(),
        nextBedtimeDueAt: computeNextBedtimeDue(now, settings)?.toISOString() || null,
        hasActiveReminder: true,
        isPaused: false
      })
    };
  }

  const normalizedState = buildStatusState(stateWithDay, settings, {
    pendingReminder: null,
    nextDueAt: normalizeNextDue(stateWithDay, now, settings).toISOString(),
    nextBedtimeDueAt: computeNextBedtimeDue(now, settings)?.toISOString() || null,
    lastTickAt: now.toISOString(),
    hasActiveReminder: false,
    isPaused: false
  });

  await chrome.storage.local.set({
    nextDueAt: normalizedState.nextDueAt,
    nextBedtimeDueAt: normalizedState.nextBedtimeDueAt,
    lastTickAt: normalizedState.lastTickAt
  });

  return { settings, state: normalizedState };
}

async function triggerReminder(now, settings, state) {
  const queueRemaining = sanitizeQueue(state.queueRemaining, settings.exercises);
  const effectiveQueue = queueRemaining.length > 0 ? queueRemaining : buildExerciseQueue(settings.exercises, settings.queueOrderMode);
  const exercise = effectiveQueue[0] || settings.exercises[0];
  const nextQueue = effectiveQueue.slice(1);
  const reminder = {
    kind: REMINDER_KIND_EXERCISE,
    exercise,
    dueAt: now.toISOString(),
    startedAt: now.toISOString()
  };

  await chrome.storage.local.set({
    pendingReminder: reminder,
    nextDueAt: null,
    deferredExercise: null,
    lastExercise: reminder.exercise,
    lastTickAt: now.toISOString(),
    queueRemaining: nextQueue,
    queueDayKey: todayKey(now)
  });

  await setBadgePending(true);
  await showReminderNotification(reminder);
  await openReminderWindow();
  await scheduleRepeatAlarm(settings.repeatReminderMinutes);
  await playReminderIntro(settings, reminder);
}

async function triggerBedtimeReminder(now, settings) {
  const text = String(settings.bedtimeReminderText || DEFAULTS.bedtimeReminderText).trim();
  const reminder = {
    kind: REMINDER_KIND_BEDTIME,
    message: text,
    exercise: text,
    dueAt: now.toISOString(),
    startedAt: now.toISOString()
  };

  await chrome.storage.local.set({
    pendingReminder: reminder,
    nextBedtimeDueAt: null,
    lastTickAt: now.toISOString()
  });

  await setBadgePending(true);
  await showReminderNotification(reminder);
  await openReminderWindow();
  await scheduleRepeatAlarm(settings.bedtimeIntervalMinutes);
  await playReminderIntro(settings, reminder);
}

async function resolveReminder(countExercise, options = {}) {
  const now = new Date();
  const settings = await getSettings();
  const rawState = await getState();
  const deferExercise = Boolean(options.deferExercise);
  const state = await normalizeDayState(rawState, settings, now, {
    preserveEmptyQueue: deferExercise
  });

  if (getReminderKind(state.pendingReminder) === REMINDER_KIND_BEDTIME) {
    return { ok: false, reason: "BEDTIME_ACTIVE" };
  }

  const completedExercise = state.pendingReminder?.exercise || state.lastExercise || null;
  const completedToday = [...state.completedToday];
  const historyByDay = sanitizeHistoryByDay(state.historyByDay);
  const isTestReminder = Boolean(state.pendingReminder?.test);
  const queueRemaining = deferExercise
    ? restoreExerciseToQueue(completedExercise, state.queueRemaining, settings)
    : state.queueRemaining;
  const deferredExercise = deferExercise && !isTestReminder ? completedExercise : null;

  if (countExercise && completedExercise && !isTestReminder) {
    const historyEntry = {
      exercise: completedExercise,
      completedAt: now.toISOString()
    };
    completedToday.push(historyEntry);
    historyByDay[todayKey(now)] = completedToday;
  }

  if (isTestReminder) {
    const nextDueAt = state.pendingReminder?.previousNextDueAt || state.nextDueAt || null;

    await chrome.storage.local.set({
      pendingReminder: null,
      nextDueAt,
      lastTickAt: now.toISOString(),
      completedToday,
      historyByDay,
      deferredExercise: null
    });
    await clearReminderPresentation();
    return { ok: true, nextDueAt, test: true };
  }

  if (!isValidWindow(settings, now)) {
    await chrome.storage.local.set({
      pendingReminder: null,
      nextDueAt: null,
      lastCompletedAt: now.toISOString(),
      lastTickAt: now.toISOString(),
      completedToday,
      historyByDay,
      queueRemaining,
      queueDayKey: todayKey(now),
      deferredExercise
    });
    await clearReminderPresentation();
    return { ok: true, nextDueAt: null };
  }

  const nextDueAt = settings.scheduleMode === SCHEDULE_MODE_FIXED
    ? computeNextDueAfter(now, settings)
    : computeRelativeDueAfter(now, settings);

  await chrome.storage.local.set({
    pendingReminder: null,
    nextDueAt: nextDueAt.toISOString(),
    lastCompletedAt: now.toISOString(),
    lastTickAt: now.toISOString(),
    completedToday,
    historyByDay,
    queueRemaining,
    queueDayKey: todayKey(now),
    deferredExercise
  });

  await clearReminderPresentation();
  return { ok: true, nextDueAt: nextDueAt.toISOString() };
}

async function handleRepeatAlarm() {
  const now = new Date();
  const runtime = await getRuntimeState(now);

  if (runtime.validationError === "INVALID_WINDOW") {
    await clearReminderPresentation();
    return;
  }

  const { settings, state } = runtime;
  if (!state.pendingReminder) {
    await clearRepeatAlarm();
    return;
  }

  await setBadgePending(true);
  await showReminderNotification(state.pendingReminder);
  await openReminderWindow();
  await playReminderRepeat(settings, state.pendingReminder);
}

async function setPauseFor(minutes) {
  const now = new Date();
  const settings = await getSettings();
  if (!isValidWindow(settings, now)) {
    return { ok: false, reason: "INVALID_WINDOW" };
  }

  const rawState = await getState();
  const state = await normalizeDayState(rawState, settings, now, { preserveEmptyQueue: true });
  if (getReminderKind(state.pendingReminder) === REMINDER_KIND_BEDTIME || isWithinBedtimeWindow(now, settings)) {
    return { ok: false, reason: "BEDTIME_ACTIVE" };
  }

  const pauseMinutes = Math.max(1, Math.min(24 * 60, Number(minutes || 30)));
  const pausedUntil = new Date(now.getTime() + pauseMinutes * 60000).toISOString();
  const activeExercise = state.pendingReminder?.test || getReminderKind(state.pendingReminder) === REMINDER_KIND_BEDTIME
    ? null
    : (state.pendingReminder?.exercise || null);
  const queueRemaining = activeExercise
    ? restoreExerciseToQueue(activeExercise, state.queueRemaining, settings)
    : state.queueRemaining;
  const nextDueAt = computeDueAfterPause(pausedUntil, settings).toISOString();

  await chrome.storage.local.set({
    pausedUntil,
    pendingReminder: null,
    nextDueAt,
    lastTickAt: now.toISOString(),
    queueRemaining,
    queueDayKey: todayKey(now),
    deferredExercise: activeExercise || state.deferredExercise || null
  });
  await clearReminderPresentation();

  return { ok: true, pausedUntil };
}

async function clearPause() {
  await chrome.storage.local.set({
    pausedUntil: null,
    nextDueAt: null,
    lastTickAt: new Date().toISOString()
  });
  await tick();
  return { ok: true };
}

async function triggerTestReminder() {
  const now = new Date();
  const runtime = await getRuntimeState(now);

  if (runtime.validationError === "INVALID_WINDOW") {
    return { ok: false, reason: "INVALID_WINDOW" };
  }

  if (runtime.state.isPaused) {
    return { ok: false, reason: "PAUSED" };
  }

  if (runtime.state.pendingReminder) {
    return { ok: false, reason: "ACTIVE_REMINDER" };
  }

  const { settings, state } = runtime;
  const exercise = state.nextExercise || settings.exercises[0];
  const reminder = {
    exercise,
    dueAt: now.toISOString(),
    startedAt: now.toISOString(),
    previousNextDueAt: state.nextDueAt || null,
    test: true
  };

  await chrome.storage.local.set({
    pendingReminder: reminder,
    lastExercise: reminder.exercise,
    lastTickAt: now.toISOString()
  });

  await setBadgePending(true);
  await showReminderNotification(reminder);
  await openReminderWindow();
  await scheduleRepeatAlarm(settings.repeatReminderMinutes);
  await playReminderIntro(settings, reminder);

  return { ok: true };
}

function sanitizeImportedSettings(rawSettings) {
  const raw = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
  const exercises = Array.isArray(raw.exercises)
    ? raw.exercises.map((item) => String(item).trim()).filter(Boolean).slice(0, 200)
    : DEFAULTS.exercises;
  const settings = {
    startTime: isValidHHMM(raw.startTime) ? raw.startTime : DEFAULTS.startTime,
    endTime: isValidHHMM(raw.endTime) ? raw.endTime : DEFAULTS.endTime,
    bedtimeEnabled: raw.bedtimeEnabled !== false,
    bedtimeEndTime: isValidHHMM(raw.bedtimeEndTime) ? raw.bedtimeEndTime : DEFAULTS.bedtimeEndTime,
    bedtimeIntervalMinutes: positiveNumber(raw.bedtimeIntervalMinutes, DEFAULTS.bedtimeIntervalMinutes),
    bedtimeReminderText: String(raw.bedtimeReminderText || DEFAULTS.bedtimeReminderText).trim()
      || DEFAULTS.bedtimeReminderText,
    scheduleMode: raw.scheduleMode === SCHEDULE_MODE_FIXED ? SCHEDULE_MODE_FIXED : SCHEDULE_MODE_AFTER_CONFIRMATION,
    queueOrderMode: raw.queueOrderMode === QUEUE_ORDER_LISTED ? QUEUE_ORDER_LISTED : QUEUE_ORDER_RANDOM,
    audioMode: raw.audioMode === AUDIO_MODE_BEEP ? AUDIO_MODE_BEEP : AUDIO_MODE_VOICE,
    intervalMinutes: positiveNumber(raw.intervalMinutes, DEFAULTS.intervalMinutes),
    repeatReminderMinutes: positiveNumber(raw.repeatReminderMinutes, DEFAULTS.repeatReminderMinutes),
    reminderIntroText: String(raw.reminderIntroText || DEFAULTS.reminderIntroText).trim() || DEFAULTS.reminderIntroText,
    reminderOutroText: String(raw.reminderOutroText ?? DEFAULTS.reminderOutroText).trim(),
    volume: normalizedVolume(raw.volume),
    soundMuted: Boolean(raw.soundMuted),
    soundFile: DEFAULTS.soundFile,
    exercises: exercises.length > 0 ? exercises : DEFAULTS.exercises
  };

  if (settings.startTime >= settings.endTime) {
    settings.startTime = DEFAULTS.startTime;
    settings.endTime = DEFAULTS.endTime;
  }

  if (settings.bedtimeEnabled && settings.endTime >= settings.bedtimeEndTime) {
    settings.bedtimeEnabled = false;
  }

  return settings;
}

async function exportData() {
  const settings = await getSettings();
  const state = await getState();

  return {
    ok: true,
    data: {
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      settings,
      state: {
        pausedUntil: state.pausedUntil || null,
        nextBedtimeDueAt: state.nextBedtimeDueAt || null,
        deferredExercise: state.deferredExercise || null,
        queueDayKey: state.queueDayKey || null,
        queueRemaining: sanitizeQueue(state.queueRemaining, settings.exercises),
        completedToday: sanitizeCompletedToday(state.completedToday),
        historyByDay: sanitizeHistoryByDay(state.historyByDay)
      }
    }
  };
}

async function importData(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, reason: "INVALID_DATA" };
  }

  const now = new Date();
  const settings = sanitizeImportedSettings(data.settings || data);
  const importedState = data.state && typeof data.state === "object" ? data.state : {};
  const historyByDay = sanitizeHistoryByDay(importedState.historyByDay);
  const currentDayKey = todayKey(now);
  const importedCompletedToday = sanitizeCompletedToday(importedState.completedToday);
  const completedToday = (historyByDay[currentDayKey]?.length || 0) >= importedCompletedToday.length
    ? (historyByDay[currentDayKey] || [])
    : importedCompletedToday;
  const queueRemaining = sanitizeQueue(importedState.queueRemaining, settings.exercises);
  const deferredExercise = settings.exercises.includes(importedState.deferredExercise)
    ? importedState.deferredExercise
    : null;
  const pausedUntilDate = parseIsoDate(importedState.pausedUntil);
  const pausedUntil = pausedUntilDate && pausedUntilDate > now ? pausedUntilDate.toISOString() : null;
  if (completedToday.length > 0) {
    historyByDay[currentDayKey] = completedToday;
  }

  await chrome.storage.sync.set(settings);
  await chrome.storage.local.set({
    nextDueAt: null,
    pendingReminder: null,
    lastCompletedAt: null,
    lastExercise: null,
    lastTickAt: now.toISOString(),
    reminderWindowId: null,
    pausedUntil,
    nextBedtimeDueAt: computeNextBedtimeDue(now, settings)?.toISOString() || null,
    deferredExercise,
    queueDayKey: currentDayKey,
    queueRemaining,
    completedToday,
    historyByDay
  });
  await clearReminderPresentation();
  await tick();

  return { ok: true };
}

chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId !== NOTIFICATION_ID) {
    return;
  }

  if (buttonIndex === 0) {
    await resolveReminder(true);
    return;
  }

  if (buttonIndex === 1) {
    await resolveReminder(false);
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
      sendResponse(await resolveReminder(true));
      return;
    }

    if (message?.type === "MARK_SKIPPED") {
      sendResponse(await resolveReminder(false));
      return;
    }

    if (message?.type === "MARK_DEFERRED") {
      sendResponse(await resolveReminder(false, { deferExercise: true }));
      return;
    }

    if (message?.type === "PLAY_PREVIEW") {
      const settings = await getSettings();
      await playPreview(settings, message.volume, message.reminderIntroText, message.reminderOutroText, message.audioMode);
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "SET_SOUND_MUTED") {
      const soundMuted = Boolean(message.soundMuted);
      await chrome.storage.sync.set({ soundMuted });
      if (soundMuted) {
        await stopOffscreenSignal();
      }
      sendResponse({ ok: true, soundMuted });
      return;
    }

    if (message?.type === "SET_PAUSE") {
      sendResponse(await setPauseFor(message.minutes));
      return;
    }

    if (message?.type === "CLEAR_PAUSE") {
      sendResponse(await clearPause());
      return;
    }

    if (message?.type === "TRIGGER_TEST_REMINDER") {
      sendResponse(await triggerTestReminder());
      return;
    }

    if (message?.type === "EXPORT_DATA") {
      sendResponse(await exportData());
      return;
    }

    if (message?.type === "IMPORT_DATA") {
      sendResponse(await importData(message.data));
      return;
    }

    if (message?.type === "SETTINGS_UPDATED") {
      const now = new Date();
      const runtime = await getRuntimeState(now);
      if (runtime.state.pendingReminder) {
        await refreshPendingReminderPresentation(runtime.state.pendingReminder, runtime.settings, { forceNotification: true });
      } else if (runtime.state.isPaused) {
        await chrome.storage.local.set({
          nextDueAt: computeDueAfterPause(runtime.state.pausedUntil, runtime.settings).toISOString(),
          lastTickAt: now.toISOString()
        });
      } else if (runtime.settings.scheduleMode === SCHEDULE_MODE_FIXED) {
        await chrome.storage.local.set({
          nextDueAt: null,
          lastTickAt: now.toISOString(),
          lastExercise: null
        });
        await tick();
      } else {
        const shouldRecalculate = didRelativeScheduleInputsChange(message.previousSettings, message.currentSettings || runtime.settings);

        if (shouldRecalculate) {
          const nextDueAt = computeRelativeDueAfterSettingsChange(now, runtime.state, runtime.settings);
          await chrome.storage.local.set({
            nextDueAt: nextDueAt.toISOString(),
            lastTickAt: now.toISOString(),
            lastExercise: null
          });
        } else {
          await chrome.storage.local.set({ lastTickAt: now.toISOString() });
        }
      }

      await chrome.storage.local.set({
        nextBedtimeDueAt: computeNextBedtimeDue(now, runtime.settings)?.toISOString() || null
      });
      sendResponse({ ok: true });
      return;
    }

    if (message?.type === "RESET_QUEUE") {
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

      sendResponse({ ok: true, queueLength: state.queueRemaining.length });
      return;
    }

    sendResponse({ ok: false, reason: "UNKNOWN_MESSAGE" });
  })();

  return true;
});

async function tick() {
  const now = new Date();
  const runtime = await getRuntimeState(now);

  if (runtime.validationError === "INVALID_WINDOW") {
    await clearReminderPresentation();
    return;
  }

  const { settings, state } = runtime;

  if (state.isPaused) {
    await clearReminderPresentation();
    return;
  }

  if (state.pendingReminder) {
    await refreshPendingReminderPresentation(state.pendingReminder, settings);
    return;
  }

  const nextDueAt = state.nextDueAt ? new Date(state.nextDueAt) : computeFallbackNextDue(now, settings);

  if (now >= nextDueAt && isWithinWindow(nextDueAt, settings)) {
    await triggerReminder(now, settings, state);
    return;
  }

  const nextBedtimeDueAt = state.nextBedtimeDueAt
    ? new Date(state.nextBedtimeDueAt)
    : computeNextBedtimeDue(now, settings);

  if (nextBedtimeDueAt
    && !Number.isNaN(nextBedtimeDueAt.getTime())
    && now >= nextBedtimeDueAt
    && isWithinBedtimeWindow(now, settings)) {
    await triggerBedtimeReminder(now, settings);
    return;
  }

  await setBadgePending(false);
}

async function bootstrap() {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  const runtime = await getRuntimeState(new Date());
  if (runtime.validationError === "INVALID_WINDOW") {
    await clearReminderPresentation();
    return;
  }
  if (runtime.state.pendingReminder) {
    await refreshPendingReminderPresentation(runtime.state.pendingReminder, runtime.settings, {
      forceNotification: true,
      forceWindow: true
    });
    return;
  }
  await tick();
}

chrome.runtime.onInstalled.addListener(bootstrap);
chrome.runtime.onStartup.addListener(bootstrap);
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === TICK_ALARM) {
    await tick();
    return;
  }

  if (alarm.name === REPEAT_ALARM) {
    await handleRepeatAlarm();
  }
});
