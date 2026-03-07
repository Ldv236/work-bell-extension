const DEFAULTS = {
  startTime: "09:00",
  endTime: "22:00",
  intervalMinutes: 60,
  repeatReminderMinutes: 3,
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

const startTimeEl = document.getElementById("startTime");
const endTimeEl = document.getElementById("endTime");
const intervalMinutesEl = document.getElementById("intervalMinutes");
const repeatReminderMinutesEl = document.getElementById("repeatReminderMinutes");
const volumeEl = document.getElementById("volume");
const volumeValueEl = document.getElementById("volumeValue");
const exercisesEl = document.getElementById("exercises");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("save");
const resetQueueBtn = document.getElementById("resetQueue");
const testSoundBtn = document.getElementById("testSound");

async function load() {
  const settings = await chrome.storage.sync.get({ ...DEFAULTS });
  startTimeEl.value = settings.startTime;
  endTimeEl.value = settings.endTime;
  intervalMinutesEl.value = settings.intervalMinutes;
  repeatReminderMinutesEl.value = settings.repeatReminderMinutes;
  volumeEl.value = Math.round(Number(settings.volume || DEFAULTS.volume) * 100);
  volumeValueEl.textContent = `${volumeEl.value}%`;
  exercisesEl.value = (settings.exercises || []).join("\n");
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

  if (Number(intervalMinutesEl.value) < 1) {
    return "Основной интервал должен быть не меньше 1 минуты.";
  }

  if (Number(repeatReminderMinutesEl.value) < 1) {
    return "Повтор сигнала должен быть не меньше 1 минуты.";
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
    intervalMinutes: Number(intervalMinutesEl.value),
    repeatReminderMinutes: Number(repeatReminderMinutesEl.value),
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

  await chrome.storage.sync.set(collectSettings());
  await chrome.runtime.sendMessage({ type: "SETTINGS_UPDATED" });

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
    volume: Number(volumeEl.value) / 100
  });
  flashStatus("Проверяю голосовой сигнал", "", 1200);
}

volumeEl.addEventListener("input", () => {
  volumeValueEl.textContent = `${volumeEl.value}%`;
});

saveBtn.addEventListener("click", () => {
  save(true);
});
resetQueueBtn.addEventListener("click", resetQueue);
testSoundBtn.addEventListener("click", testSound);
load();
