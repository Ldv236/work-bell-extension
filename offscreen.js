const OFFSCREEN_PLAY = "OFFSCREEN_PLAY";
const OFFSCREEN_PLAY_PREVIEW = "OFFSCREEN_PLAY_PREVIEW";
const OFFSCREEN_STOP = "OFFSCREEN_STOP";
const AUDIO_MODE_VOICE = "voice";
const AUDIO_MODE_BEEP = "beep";
let fallbackAudio = null;

function hasSpeechSupport() {
  return "speechSynthesis" in globalThis && typeof SpeechSynthesisUtterance !== "undefined";
}

function stopEverything() {
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
  return fallbackAudio.play().catch((error) => console.warn("fallback audio failed", error));
}

function speakOnce(text, soundFile, volume, audioMode) {
  return new Promise((resolve) => {
    if (audioMode === AUDIO_MODE_BEEP) {
      playFallback(soundFile, volume);
      resolve();
      return;
    }

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

if (hasSpeechSupport()) {
  speechSynthesis.onvoiceschanged = () => {
    speechSynthesis.getVoices();
  };
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === OFFSCREEN_STOP) {
    stopEverything();
    return;
  }

  if (message?.type === OFFSCREEN_PLAY || message?.type === OFFSCREEN_PLAY_PREVIEW) {
    stopEverything();
    const audioMode = message.audioMode === AUDIO_MODE_BEEP ? AUDIO_MODE_BEEP : AUDIO_MODE_VOICE;
    speakOnce(message.text, message.soundFile, message.volume, audioMode);
  }
});
