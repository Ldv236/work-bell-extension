const OFFSCREEN_START_LOOP = "OFFSCREEN_START_LOOP";
const OFFSCREEN_STOP_LOOP = "OFFSCREEN_STOP_LOOP";
const OFFSCREEN_PLAY_ONCE = "OFFSCREEN_PLAY_ONCE";

let loopAudio = null;
let replayTimer = null;
let loopConfig = null;

function clearReplayTimer() {
  if (replayTimer) {
    clearTimeout(replayTimer);
    replayTimer = null;
  }
}

function stopLoop() {
  clearReplayTimer();

  if (loopAudio) {
    loopAudio.pause();
    loopAudio.currentTime = 0;
    loopAudio.onended = null;
  }
}

function startLoop(soundFile, volume, repeatMs) {
  stopLoop();

  loopConfig = {
    soundFile,
    volume: Math.max(0, Math.min(1, Number(volume ?? 0.7))),
    repeatMs: Math.max(3000, Number(repeatMs || 20000))
  };

  if (!loopAudio) {
    loopAudio = new Audio();
  }

  loopAudio.src = chrome.runtime.getURL(loopConfig.soundFile);
  loopAudio.volume = loopConfig.volume;
  loopAudio.onended = () => {
    clearReplayTimer();
    replayTimer = setTimeout(() => {
      if (!loopConfig) {
        return;
      }

      loopAudio.currentTime = 0;
      loopAudio.play().catch((error) => console.warn("loop replay failed", error));
    }, loopConfig.repeatMs);
  };

  loopAudio.play().catch((error) => console.warn("loop play failed", error));
}

function playOnce(soundFile, volume) {
  const previewAudio = new Audio(chrome.runtime.getURL(soundFile));
  previewAudio.volume = Math.max(0, Math.min(1, Number(volume ?? 0.7)));
  previewAudio.play().catch((error) => console.warn("preview play failed", error));
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === OFFSCREEN_START_LOOP) {
    startLoop(message.soundFile, message.volume, message.repeatMs);
    return;
  }

  if (message?.type === OFFSCREEN_STOP_LOOP) {
    loopConfig = null;
    stopLoop();
    return;
  }

  if (message?.type === OFFSCREEN_PLAY_ONCE) {
    playOnce(message.soundFile, message.volume);
  }
});
