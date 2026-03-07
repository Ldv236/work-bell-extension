let audio = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type !== "OFFSCREEN_PLAY_SOUND") return;
  const { soundFile, volume } = msg;
  if (!audio) audio = new Audio();
  audio.src = chrome.runtime.getURL(soundFile);
  audio.volume = Math.max(0, Math.min(1, Number(volume ?? 0.7)));
  audio.play().catch((e) => console.warn("audio.play failed", e));
});
