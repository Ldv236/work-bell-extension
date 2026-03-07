const OFFSCREEN_START_LOOP = "OFFSCREEN_START_LOOP";
const OFFSCREEN_STOP_LOOP = "OFFSCREEN_STOP_LOOP";
const OFFSCREEN_PLAY_PREVIEW = "OFFSCREEN_PLAY_PREVIEW";

let loopTimer = null;
let loopConfig = null;
let fallbackAudio = null;

function hasSpeechSupport() {
  return "speechSynthesis" in globalThis && typeof SpeechSynthesisUtterance !== "undefined";
}

function clearLoopTimer() {
  if (loopTimer) {
    clearTimeout(loopTimer);
    loopTimer = null;
  }
}

function stopEverything() {
  clearLoopTimer();

  if (hasSpeechSupport()) {
    speechSynthesis.cancel();
  }

  if (fallbackAudio) {
    fallbackAudio.pause();
    fallbackAudio.currentTime = 0;
  }
}

function pickVoice() {
  if (!hasSpeechSupport()) {
    return null;
  }

  const voices = speechSynthesis.getVoices();
  if (!voices.length) {
    return null;
  }

  return voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith("ru"))
    || voices.find((voice) => voice.lang && voice.lang.toLowerCase().startsWith("en"))
    || voices[0];
}

function playFallback(soundFile, volume) {
  if (!fallbackAudio) {
    fallbackAudio = new Audio();
  }

  fallbackAudio.src = chrome.runtime.getURL(soundFile);
  fallbackAudio.volume = Math.max(0, Math.min(1, Number(volume ?? 0.7)));
  fallbackAudio.play().catch((error) => console.warn("fallback audio failed", error));
}

function speakOnce(text, soundFile, volume) {
  return new Promise((resolve) => {
    if (!text) {
      resolve();
      return;
    }

    if (!hasSpeechSupport()) {
      playFallback(soundFile, volume);
      resolve();
      return;
    }

    speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ru-RU";
    utterance.volume = Math.max(0, Math.min(1, Number(volume ?? 0.7)));
    utterance.rate = 1;
    utterance.pitch = 1;

    const voice = pickVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || utterance.lang;
    }

    let resolved = false;
    const finish = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    utterance.onend = finish;
    utterance.onerror = () => {
      playFallback(soundFile, volume);
      finish();
    };

    try {
      speechSynthesis.speak(utterance);
      setTimeout(finish, 12000);
    } catch (error) {
      console.warn("speech failed", error);
      playFallback(soundFile, volume);
      finish();
    }
  });
}

async function startLoop(reminderId, introText, repeatText, soundFile, volume, repeatMs) {
  if (loopConfig && loopConfig.reminderId === reminderId) {
    return;
  }

  stopEverything();

  loopConfig = {
    reminderId,
    introText,
    repeatText,
    soundFile,
    volume: Math.max(0, Math.min(1, Number(volume ?? 0.7))),
    repeatMs: Math.max(3000, Number(repeatMs || 20000))
  };

  const firstConfig = loopConfig;
  await speakOnce(firstConfig.introText, firstConfig.soundFile, firstConfig.volume);

  if (!loopConfig || loopConfig !== firstConfig) {
    return;
  }

  const playRepeat = async () => {
    if (!loopConfig) {
      return;
    }

    const currentConfig = loopConfig;
    await speakOnce(currentConfig.repeatText, currentConfig.soundFile, currentConfig.volume);
    if (!loopConfig || loopConfig !== currentConfig) {
      return;
    }

    clearLoopTimer();
    loopTimer = setTimeout(playRepeat, currentConfig.repeatMs);
  };

  clearLoopTimer();
  loopTimer = setTimeout(playRepeat, firstConfig.repeatMs);
}

async function playPreview(introText, soundFile, volume) {
  stopEverything();
  await speakOnce(introText, soundFile, volume);
}

if (hasSpeechSupport()) {
  speechSynthesis.onvoiceschanged = () => {
    speechSynthesis.getVoices();
  };
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === OFFSCREEN_START_LOOP) {
    startLoop(
      message.reminderId,
      message.introText,
      message.repeatText,
      message.soundFile,
      message.volume,
      message.repeatMs
    );
    return;
  }

  if (message?.type === OFFSCREEN_STOP_LOOP) {
    loopConfig = null;
    stopEverything();
    return;
  }

  if (message?.type === OFFSCREEN_PLAY_PREVIEW) {
    playPreview(message.introText, message.soundFile, message.volume);
  }
});
