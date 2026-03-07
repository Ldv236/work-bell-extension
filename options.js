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

const startTimeEl = document.getElementById("startTime");
const endTimeEl = document.getElementById("endTime");
const intervalMinutesEl = document.getElementById("intervalMinutes");
const volumeEl = document.getElementById("volume");
const volumeValueEl = document.getElementById("volumeValue");
const exercisesEl = document.getElementById("exercises");
const statusEl = document.getElementById("status");
const saveBtn = document.getElementById("save");
const testSoundBtn = document.getElementById("testSound");

async function load() {
  const settings = await chrome.storage.sync.get({ ...DEFAULTS });
  startTimeEl.value = settings.startTime;
  endTimeEl.value = settings.endTime;
  intervalMinutesEl.value = settings.intervalMinutes;
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

  if (Number(intervalMinutesEl.value) < 5) {
    return "Интервал должен быть не меньше 5 минут.";
  }

  if (list.length === 0) {
    return "Добавьте хотя бы одно упражнение.";
  }

  return "";
}

async function save() {
  const error = validate();
  if (error) {
    statusEl.textContent = error;
    statusEl.className = "error";
    return;
  }

  const settings = {
    startTime: startTimeEl.value,
    endTime: endTimeEl.value,
    intervalMinutes: Number(intervalMinutesEl.value),
    volume: Number(volumeEl.value) / 100,
    soundFile: "sounds/bell.wav",
    exercises: parseExercises(exercisesEl.value)
  };

  await chrome.storage.sync.set(settings);
  statusEl.textContent = "Сохранено";
  statusEl.className = "ok";
  setTimeout(() => {
    statusEl.textContent = "";
    statusEl.className = "";
  }, 1400);
}

function testSound() {
  chrome.runtime.sendMessage({ type: "PLAY_PREVIEW", volume: Number(volumeEl.value) / 100 });
  statusEl.textContent = "Проверяю звук";
  statusEl.className = "";
  setTimeout(() => {
    statusEl.textContent = "";
    statusEl.className = "";
  }, 1200);
}

volumeEl.addEventListener("input", () => {
  volumeValueEl.textContent = `${volumeEl.value}%`;
});

saveBtn.addEventListener("click", save);
testSoundBtn.addEventListener("click", testSound);
load();
