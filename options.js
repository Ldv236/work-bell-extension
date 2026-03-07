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
    "10 отжиманий"
  ]
};

async function load() {
  const s = await chrome.storage.sync.get({ ...DEFAULTS });
  startTime.value = s.startTime;
  endTime.value = s.endTime;
  intervalMinutes.value = s.intervalMinutes;
  volume.value = s.volume;
  requireInteraction.checked = !!s.requireInteraction;
  quietMode.checked = !!s.quietMode;
  lateAfterMinutes.value = s.lateAfterMinutes;
  exercises.value = (s.exercises || []).join("\n");
}

function parseExercises(text) {
  return text.split("\n").map(x => x.trim()).filter(Boolean).slice(0, 200);
}

async function save() {
  const s = {
    startTime: startTime.value,
    endTime: endTime.value,
    intervalMinutes: Number(intervalMinutes.value),
    volume: Number(volume.value),
    soundFile: "sounds/bell.wav",
    requireInteraction: !!requireInteraction.checked,
    quietMode: !!quietMode.checked,
    lateAfterMinutes: Number(lateAfterMinutes.value),
    exercises: parseExercises(exercises.value)
  };
  await chrome.storage.sync.set(s);
  status.textContent = "Сохранено ✅";
  status.className = "ok";
  setTimeout(() => (status.textContent = ""), 1200);
}

function testSound() {
  chrome.runtime.sendMessage({ type: "PLAY_SOUND", soundFile: "sounds/bell.wav", volume: Number(volume.value) });
  status.textContent = "Пробую воспроизвести звук…";
  setTimeout(() => (status.textContent = ""), 1200);
}

function replaySoundNow() {
  chrome.runtime.sendMessage({ type: "REPLAY_SOUND" }, (resp) => {
    if (resp?.reason === "QUIET_MODE") {
      status.textContent = "Тихий режим включён";
    } else {
      status.textContent = "Текущий сигнал повторён";
    }
    setTimeout(() => (status.textContent = ""), 1200);
  });
}

document.getElementById("save").addEventListener("click", save);
document.getElementById("testSound").addEventListener("click", testSound);
document.getElementById("replaySound").addEventListener("click", replaySoundNow);
load();
