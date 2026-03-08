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
  intervalMinutes: 60,
  repeatReminderMinutes: 3,
  scheduleMode: "after_confirmation",
  queueOrderMode: "random",
  audioMode: "voice",
  reminderIntroText: "Пора размяться. Выполни упражнение",
  reminderOutroText: ". Подтвердите в приложении.",
  volume: 0.7,
  soundFile: "sounds/bell.wav",
  exercises: DEFAULT_EXERCISES
};

const startTimeEl = document.getElementById("startTime");
const endTimeEl = document.getElementById("endTime");
const scheduleModeEl = document.getElementById("scheduleMode");
const queueOrderModeEl = document.getElementById("queueOrderMode");
const audioModeEl = document.getElementById("audioMode");
const intervalMinutesEl = document.getElementById("intervalMinutes");
const repeatReminderMinutesEl = document.getElementById("repeatReminderMinutes");
const reminderIntroTextEl = document.getElementById("reminderIntroText");
const reminderOutroTextEl = document.getElementById("reminderOutroText");
const volumeEl = document.getElementById("volume");
const volumeValueEl = document.getElementById("volumeValue");
const exercisesEl = document.getElementById("exercises");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("save");
const resetQueueBtn = document.getElementById("resetQueue");
const testSoundBtn = document.getElementById("testSound");
let loadedSettings = null;

function autoResizeExercises() {
  exercisesEl.style.height = "auto";

  const computed = window.getComputedStyle(exercisesEl);
  const lineHeight = parseFloat(computed.lineHeight) || 16;
  const padding = (parseFloat(computed.paddingTop) || 0) + (parseFloat(computed.paddingBottom) || 0);
  const border = (parseFloat(computed.borderTopWidth) || 0) + (parseFloat(computed.borderBottomWidth) || 0);
  const minHeight = lineHeight * 5 + padding + border;
  const nextHeight = Math.max(minHeight, exercisesEl.scrollHeight);

  exercisesEl.style.height = `${Math.ceil(nextHeight)}px`;
}

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

async function load() {
  const rawSettings = await chrome.storage.sync.get({ ...DEFAULTS });
  const migratedExercises = migrateExercises(rawSettings.exercises);
  const reminderIntroTextRaw = String(rawSettings.reminderIntroText ?? DEFAULTS.reminderIntroText).trim();
  const reminderOutroTextRaw = String(rawSettings.reminderOutroText ?? DEFAULTS.reminderOutroText).trim();
  const settings = {
    ...rawSettings,
    queueOrderMode: rawSettings.queueOrderMode || DEFAULTS.queueOrderMode,
    exercises: migratedExercises.exercises.length > 0 ? migratedExercises.exercises : DEFAULTS.exercises,
    reminderIntroText: reminderIntroTextRaw === LEGACY_REMINDER_INTRO_TEXT
      ? DEFAULTS.reminderIntroText
      : (reminderIntroTextRaw || DEFAULTS.reminderIntroText),
    reminderOutroText: reminderOutroTextRaw === LEGACY_REMINDER_OUTRO_TEXT
      ? DEFAULTS.reminderOutroText
      : reminderOutroTextRaw
  };

  if (migratedExercises.changed
    || reminderIntroTextRaw === LEGACY_REMINDER_INTRO_TEXT
    || reminderOutroTextRaw === LEGACY_REMINDER_OUTRO_TEXT) {
    await chrome.storage.sync.set({
      exercises: settings.exercises,
      reminderIntroText: settings.reminderIntroText,
      reminderOutroText: settings.reminderOutroText
    });
  }

  startTimeEl.value = settings.startTime;
  endTimeEl.value = settings.endTime;
  scheduleModeEl.value = settings.scheduleMode || DEFAULTS.scheduleMode;
  queueOrderModeEl.value = settings.queueOrderMode || DEFAULTS.queueOrderMode;
  audioModeEl.value = settings.audioMode || DEFAULTS.audioMode;
  intervalMinutesEl.value = settings.intervalMinutes;
  repeatReminderMinutesEl.value = settings.repeatReminderMinutes;
  reminderIntroTextEl.value = settings.reminderIntroText;
  reminderOutroTextEl.value = settings.reminderOutroText;
  volumeEl.value = Math.round(Number(settings.volume || DEFAULTS.volume) * 100);
  volumeValueEl.textContent = `${volumeEl.value}%`;
  exercisesEl.value = (settings.exercises || []).join("\n");
  autoResizeExercises();
  loadedSettings = collectSettings();
}

function parseExercises(text) {
  return text.split("\n").map((item) => item.trim()).filter(Boolean).slice(0, 200);
}

function validate() {
  const list = parseExercises(exercisesEl.value);

  if (!startTimeEl.value || !endTimeEl.value) {
    return "Укажите оба времени.";
  }

  if (startTimeEl.value >= endTimeEl.value) {
    return 'Время "с" должно быть раньше времени "по".';
  }

  if (!["after_confirmation", "fixed_slots"].includes(scheduleModeEl.value)) {
    return "Выберите корректный режим интервала.";
  }

  if (!["random", "listed"].includes(queueOrderModeEl.value)) {
    return "Выберите корректный порядок очереди.";
  }

  if (!["voice", "beep"].includes(audioModeEl.value)) {
    return "Выберите корректный тип сигнала.";
  }

  if (Number(intervalMinutesEl.value) < 1) {
    return "Основной интервал должен быть не меньше 1 минуты.";
  }

  if (Number(repeatReminderMinutesEl.value) < 1) {
    return "Повтор сигнала должен быть не меньше 1 минуты.";
  }

  if (!String(reminderIntroTextEl.value).trim()) {
    return "Заполните начало фразы.";
  }

  if (list.length === 0) {
    return "Добавьте хотя бы одно упражнение.";
  }

  return "";
}

function collectSettings() {
  return {
    startTime: startTimeEl.value,
    endTime: endTimeEl.value,
    scheduleMode: scheduleModeEl.value,
    queueOrderMode: queueOrderModeEl.value,
    audioMode: audioModeEl.value,
    intervalMinutes: Number(intervalMinutesEl.value),
    repeatReminderMinutes: Number(repeatReminderMinutesEl.value),
    reminderIntroText: String(reminderIntroTextEl.value).trim(),
    reminderOutroText: String(reminderOutroTextEl.value).trim(),
    volume: Number(volumeEl.value) / 100,
    soundFile: "sounds/bell.wav",
    exercises: parseExercises(exercisesEl.value)
  };
}

function flashStatus(text, className = "", timeoutMs = 1600) {
  statusEl.textContent = text;
  statusEl.className = className;

  if (timeoutMs > 0) {
    setTimeout(() => {
      statusEl.textContent = "";
      statusEl.className = "";
    }, timeoutMs);
  }
}

async function save(showMessage = true) {
  const error = validate();
  if (error) {
    statusEl.textContent = error;
    statusEl.className = "error";
    return false;
  }

  const nextSettings = collectSettings();
  const previousSettings = loadedSettings || nextSettings;

  await chrome.storage.sync.set(nextSettings);
  await chrome.runtime.sendMessage({
    type: "SETTINGS_UPDATED",
    previousSettings,
    currentSettings: nextSettings
  });
  loadedSettings = nextSettings;

  if (showMessage) {
    flashStatus("Сохранено, расписание пересчитано", "ok");
  }

  return true;
}

async function resetQueue() {
  const saved = await save(false);
  if (!saved) {
    return;
  }

  await chrome.runtime.sendMessage({ type: "RESET_QUEUE" });
  flashStatus("Очередь обновлена", "ok");
}

function testSound() {
  chrome.runtime.sendMessage({
    type: "PLAY_PREVIEW",
    volume: Number(volumeEl.value) / 100,
    audioMode: audioModeEl.value,
    reminderIntroText: String(reminderIntroTextEl.value).trim(),
    reminderOutroText: String(reminderOutroTextEl.value).trim()
  });
  flashStatus("Проверяю сигнал", "", 1200);
}

volumeEl.addEventListener("input", () => {
  volumeValueEl.textContent = `${volumeEl.value}%`;
});

exercisesEl.addEventListener("input", autoResizeExercises);

saveBtn.addEventListener("click", () => {
  save(true);
});
resetQueueBtn.addEventListener("click", resetQueue);
testSoundBtn.addEventListener("click", testSound);
load();


