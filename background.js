const DEFAULTS = {
  startTime: "09:00",
  endTime: "22:00",
  intervalMinutes: 60,
  volume: 0.7,
  soundFile: "sounds/bell.wav",
  requireInteraction: true,
  quietMode: false,
  lateAfterMinutes: 10,
  exercises: [
    "10 приседаний",
    "10 отжиманий",
    "20 хлопков под бедром (по 10 на ногу)",
    "20 перекрестных пинков (по 10 на ногу)",
    "20 боковых пинков (по 10 на ногу)",
    "30 секунд планка",
    "10 выпадов на каждую ногу",
    "20 подъёмов коленей (по 10 на ногу)"
  ]
};

const TICK_ALARM = "tick";
const NOTIF_ID = "work-bell-notif";
const OFFSCREEN_PLAY_SOUND = "OFFSCREEN_PLAY_SOUND";

async function getSettings() {
  return await chrome.storage.sync.get({ ...DEFAULTS });
}

function parseHHMM(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return { h, m };
}

function atDay(hhmm, now = new Date()) {
  const { h, m } = parseHHMM(hhmm);
  const d = new Date(now);
  d.setHours(h, m, 0, 0);
  return d;
}

function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isWithinWindow(now, startHHMM, endHHMM) {
  const start = atDay(startHHMM, now);
  const end = atDay(endHHMM, now);
  return now >= start && now <= end;
}

function computeNextDue(now, startHHMM, endHHMM, intervalMinutes) {
  const start = atDay(startHHMM, now);
  const end = atDay(endHHMM, now);

  if (now < start) return start;

  if (now > end) {
    const t = new Date(start);
    t.setDate(t.getDate() + 1);
    return t;
  }

  const minsFromStart = Math.floor((now - start) / 60000);
  const nextSlot = Math.floor(minsFromStart / intervalMinutes) * intervalMinutes + intervalMinutes;
  const next = new Date(start.getTime() + nextSlot * 60000);

  if (next > end) {
    const t = new Date(start);
    t.setDate(t.getDate() + 1);
    return t;
  }
  return next;
}

async function ensureOffscreen() {
  const hasDoc = await chrome.offscreen.hasDocument();
  if (hasDoc) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play reminder sound for Work Bell"
  });
}

async function playSound(soundFile, volume) {
  try {
    await ensureOffscreen();
    chrome.runtime.sendMessage({ type: OFFSCREEN_PLAY_SOUND, soundFile, volume });
  } catch (e) {
    console.warn("Sound playback failed:", e);
  }
}

async function setBadge(pending, missedCount) {
  if (pending) {
    const text = missedCount > 0 ? String(missedCount) : "!";
    await chrome.action.setBadgeText({ text });
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}

function pickExercise(exercises) {
  if (!Array.isArray(exercises) || exercises.length === 0) return "Сделай короткий сет упражнений";
  const idx = Math.floor(Math.random() * exercises.length);
  return exercises[idx];
}

async function showReminderNotification(exerciseText, requireInteraction = true) {
  await chrome.notifications.create(NOTIF_ID, {
    type: "basic",
    iconUrl: "icons/128.png",
    title: "Пора размяться",
    message: exerciseText + "\nНажми “Сделал(а)” для подтверждения.",
    buttons: [{ title: "Сделал(а)" }, { title: "Отложить на 5 минут" }],
    priority: 2,
    requireInteraction
  });
}

async function resetDailyStateIfNeeded() {
  const key = todayKey(new Date());
  const st = await chrome.storage.local.get({ dayKey: null, missedCount: 0 });
  if (st.dayKey !== key) {
    await chrome.storage.local.set({
      dayKey: key,
      missedCount: 0,
      pendingAck: false,
      snoozedUntil: null
    });
  }
}

async function getRuntimeState(now = new Date()) {
  const s = await getSettings();
  await resetDailyStateIfNeeded();

  const raw = await chrome.storage.local.get({
    nextDueAt: null,
    pendingAck: false,
    missedCount: 0,
    lastFiredAt: null,
    lastExercise: null,
    snoozedUntil: null
  });

  let nextDueAt = raw.nextDueAt ? new Date(raw.nextDueAt) : null;
  const pendingAck = !!raw.pendingAck;
  const snoozedUntil = raw.snoozedUntil ? new Date(raw.snoozedUntil) : null;

  if (!pendingAck) {
    if (snoozedUntil && now < snoozedUntil) {
      nextDueAt = snoozedUntil;
    } else {
      const computedNext = computeNextDue(now, s.startTime, s.endTime, s.intervalMinutes);
      const isMissing = !nextDueAt;
      const isStale = nextDueAt && nextDueAt.getTime() < now.getTime() - 60000;
      const isOutsideWindow = nextDueAt && !isWithinWindow(nextDueAt, s.startTime, s.endTime);
      if (isMissing || isStale || isOutsideWindow) {
        nextDueAt = computedNext;
      }
    }
  }

  const normalizedState = {
    ...raw,
    pendingAck,
    nextDueAt: nextDueAt ? nextDueAt.toISOString() : null
  };

  await chrome.storage.local.set({
    nextDueAt: normalizedState.nextDueAt,
    pendingAck: normalizedState.pendingAck
  });

  return { settings: s, state: normalizedState };
}

async function tick() {
  const now = new Date();
  const { settings: s, state } = await getRuntimeState(now);

  let nextDueAt = state.nextDueAt ? new Date(state.nextDueAt) : null;
  let pendingAck = !!state.pendingAck;
  let missedCount = Number(state.missedCount || 0);
  const snoozedUntil = state.snoozedUntil ? new Date(state.snoozedUntil) : null;

  if (pendingAck) {
    await setBadge(true, missedCount);
    return;
  }

  if (snoozedUntil) {
    if (now < snoozedUntil) return;
    nextDueAt = snoozedUntil;
  }

  if (now >= nextDueAt && isWithinWindow(now, s.startTime, s.endTime)) {
    pendingAck = true;
    missedCount += 1;

    const exerciseText = pickExercise(s.exercises);

    await chrome.storage.local.set({
      pendingAck,
      missedCount,
      lastFiredAt: now.toISOString(),
      lastExercise: exerciseText,
      snoozedUntil: null
    });

    await setBadge(true, missedCount);
    await showReminderNotification(exerciseText, !!s.requireInteraction);

    if (!s.quietMode) {
      await playSound(s.soundFile, s.volume);
    }
  }
}

async function handleDone() {
  const now = new Date();
  const s = await getSettings();
  await resetDailyStateIfNeeded();

  const state = await chrome.storage.local.get({
    missedCount: 0,
    lastFiredAt: null,
    pendingAck: false
  });

  const lastFiredAt = state.lastFiredAt ? new Date(state.lastFiredAt) : null;
  let missedCount = Number(state.missedCount || 0);
  const lateAfter = Number(s.lateAfterMinutes || 10);

  let isLate = false;
  if (lastFiredAt && state.pendingAck) {
    const minutes = (now - lastFiredAt) / 60000;
    isLate = minutes > lateAfter;
  }

  if (!isLate && missedCount > 0 && state.pendingAck) missedCount -= 1;

  const nextDueAt = computeNextDue(now, s.startTime, s.endTime, s.intervalMinutes);

  await chrome.storage.local.set({
    pendingAck: false,
    nextDueAt: nextDueAt.toISOString(),
    missedCount,
    snoozedUntil: null
  });

  await setBadge(false, missedCount);
  chrome.notifications.clear(NOTIF_ID);
}

async function handleSnooze(minutes = 5) {
  const now = new Date();
  const state = await chrome.storage.local.get({
    pendingAck: false,
    missedCount: 0
  });

  if (!state.pendingAck) {
    return { ok: false, reason: "NO_PENDING_REMINDER" };
  }

  const until = new Date(now.getTime() + minutes * 60000);

  await chrome.storage.local.set({
    pendingAck: false,
    snoozedUntil: until.toISOString(),
    nextDueAt: until.toISOString()
  });

  await setBadge(false, Number(state.missedCount || 0));
  chrome.notifications.clear(NOTIF_ID);
  return { ok: true, snoozedUntil: until.toISOString() };
}

async function replayCurrentSound() {
  const s = await getSettings();
  if (s.quietMode) return { ok: false, reason: "QUIET_MODE" };
  await playSound(s.soundFile, s.volume);
  return { ok: true };
}

chrome.notifications.onButtonClicked.addListener(async (notifId, btnIdx) => {
  if (notifId !== NOTIF_ID) return;
  if (btnIdx === 0) await handleDone();
  if (btnIdx === 1) await handleSnooze(5);
});

chrome.notifications.onClosed.addListener(async (notifId) => {
  if (notifId !== NOTIF_ID) return;
  const st = await chrome.storage.local.get({ pendingAck: false, missedCount: 0 });
  if (st.pendingAck) await setBadge(true, Number(st.missedCount || 0));
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "GET_STATUS") {
      const runtimeState = await getRuntimeState(new Date());
      sendResponse(runtimeState);
      return;
    }

    if (msg?.type === "MARK_DONE") {
      await handleDone();
      sendResponse({ ok: true });
      return;
    }

    if (msg?.type === "SNOOZE") {
      const result = await handleSnooze(Number(msg.minutes || 5));
      sendResponse(result);
      return;
    }

    if (msg?.type === "REPLAY_SOUND") {
      const result = await replayCurrentSound();
      sendResponse(result);
      return;
    }

    if (msg?.type === "PLAY_SOUND") {
      const settings = await getSettings();
      await playSound(msg.soundFile || settings.soundFile, Number(msg.volume ?? settings.volume));
      sendResponse({ ok: true });
      return;
    }

    sendResponse({ ok: false });
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  await tick();
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
  await tick();
});

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name === TICK_ALARM) await tick();
});
