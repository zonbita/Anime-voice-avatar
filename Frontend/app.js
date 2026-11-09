const VOICES = [
  "abyssinvoker", "alice", "ameth", "asuna", "ayaka-jp", "azusa", "bronya",
  "chisato", "doom", "echo", "eriko", "eula", "hatsune", "herta", "hina",
  "hiyori", "hoshino", "iori", "iroha", "izuna", "kafka", "karin", "keqing",
  "kokoro", "kyaru", "kyoka", "mika", "misora", "miyu", "momoi", "nahida-jp",
  "pecorine", "shiroko", "takina", "theresa", "yuni", "yuuka", "zenyatta",
];

const state = {
  lang: "ja",
  voice: "ameth",
  file: null,
};

const grid = document.getElementById("voice-grid");
const search = document.getElementById("voice-search");
const langRow = document.getElementById("lang-row");
const voiceCount = document.getElementById("voice-count");
const activeVoice = document.getElementById("active-voice");
const pitchField = document.getElementById("pitch-field");
const pitch = document.getElementById("pitch");
const pitchVal = document.getElementById("pitch-val");
const inputText = document.getElementById("input-text");
const audioFile = document.getElementById("audio-file");
const fileName = document.getElementById("file-name");
const drop = document.getElementById("drop");
const generate = document.getElementById("generate");
const player = document.getElementById("player");
const outMeta = document.getElementById("out-meta");
const download = document.getElementById("download");
const playerBox = document.querySelector(".player");
const progressWrap = document.getElementById("progress-wrap");
const progressFill = document.getElementById("progress-fill");
const progressPct = document.getElementById("progress-pct");
const progressLabel = document.getElementById("progress-label");
const progressEta = document.getElementById("progress-eta");
const progressBar = document.getElementById("progress-bar");

const STAGES = [
  { at: 0, label: "Chuẩn bị model..." },
  { at: 18, label: "Đọc input..." },
  { at: 42, label: "Sinh / chuyển giọng..." },
  { at: 78, label: "Render WAV..." },
  { at: 94, label: "Hoàn tất..." },
];

function formatEta(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s < 1) return "Sắp xong";
  return `Ước tính còn ${s}s`;
}

function setProgress(pct, label, remainingMs) {
  const n = Math.max(0, Math.min(100, Math.round(pct)));
  progressFill.style.width = `${n}%`;
  progressPct.textContent = `${n}%`;
  progressBar.setAttribute("aria-valuenow", String(n));
  if (label) progressLabel.textContent = label;
  progressEta.textContent = remainingMs == null ? "" : formatEta(remainingMs);
}

function estimateDuration() {
  const chars = (inputText.value || "").trim().length;
  const fileBoost = state.file ? 8000 : 0;
  const langBoost = state.lang === "vi" ? 4000 : 0;
  return Math.min(22000, Math.max(7000, 4500 + chars * 28 + fileBoost + langBoost));
}

function runProgress(durationMs, onTick) {
  let cancelled = false;
  let resolveFn = () => {};
  const promise = new Promise((resolve) => {
    resolveFn = resolve;
    const start = performance.now();
    function frame(now) {
      if (cancelled) {
        resolve();
        return;
      }
      const elapsed = now - start;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 1.35);
      const pct = eased * 97;
      const stage = [...STAGES].reverse().find((s) => pct >= s.at) || STAGES[0];
      onTick(pct, stage.label, durationMs - elapsed);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
  return {
    promise,
    cancel() {
      cancelled = true;
      resolveFn();
    },
  };
}

function pretty(id) {
  return id.replace(/-jp$/, " JP").replace(/\b\w/g, (c) => c.toUpperCase());
}

let exportUrl = null;
let exportName = "output.wav";

async function attachExport(url, filename) {
  if (exportUrl && exportUrl.startsWith("blob:")) {
    URL.revokeObjectURL(exportUrl);
  }
  const bust = `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`;
  const res = await fetch(bust);
  if (!res.ok) throw new Error("Không tải được file audio để phát");
  const blob = await res.blob();
  if (!blob.size) throw new Error("File audio rỗng");

  exportUrl = URL.createObjectURL(blob);
  exportName = filename;
  player.removeAttribute("src");
  player.src = exportUrl;
  player.load();

  await new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onErr = () => {
      cleanup();
      reject(new Error("Trình duyệt không phát được file WAV"));
    };
    const cleanup = () => {
      player.removeEventListener("loadedmetadata", onReady);
      player.removeEventListener("error", onErr);
    };
    player.addEventListener("loadedmetadata", onReady, { once: true });
    player.addEventListener("error", onErr, { once: true });
  });

  download.disabled = false;

  const playedByAvatar =
    window.live2dAvatar?.ready &&
    (await window.live2dAvatar.play(exportUrl));

  if (!playedByAvatar) {
    try {
      await player.play();
    } catch (_) {
      outMeta.textContent = `${filename} · bấm Play để nghe`;
    }
  }
}

download.addEventListener("click", () => {
  if (!exportUrl) return;
  const a = document.createElement("a");
  a.href = exportUrl;
  a.download = exportName;
  document.body.appendChild(a);
  a.click();
  a.remove();
});

function renderVoices() {
  const q = search.value.trim().toLowerCase();
  const list = VOICES.filter((v) => v.includes(q));
  voiceCount.textContent = `${list.length} giọng`;
  grid.innerHTML = "";
  list.forEach((id) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "voice" + (id === state.voice ? " selected" : "");
    btn.innerHTML = `<b>${pretty(id)}</b><small>${state.lang === "ja" ? "TTS Nhật" : "TTS Việt + anime"}</small>`;
    btn.addEventListener("click", () => {
      state.voice = id;
      activeVoice.textContent = pretty(id);
      renderVoices();
    });
    grid.appendChild(btn);
  });
}

function syncLangUi() {
  pitchField.hidden = state.lang === "ja";
}

player.addEventListener("play", async () => {
  if (!exportUrl || !window.live2dAvatar?.ready) return;
  player.pause();
  await window.live2dAvatar.play(exportUrl);
});

langRow.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-lang]");
  if (!btn) return;
  state.lang = btn.dataset.lang;
  langRow.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c === btn));
  if (state.lang === "ja") {
    inputText.value = "こんにちは。何かお手伝いできることはありますか?";
  } else {
    inputText.value = "Xin chào, mình đã sửa cách phát âm thanh. Bạn chỉ cần bấm F5 lại trang rồi thử lại nhé.";
  }
  syncLangUi();
  renderVoices();
});

search.addEventListener("input", renderVoices);
pitch.addEventListener("input", () => {
  const n = Number(pitch.value);
  pitchVal.textContent = (n >= 0 ? "+" : "") + n;
});

audioFile.addEventListener("change", () => {
  state.file = audioFile.files[0] || null;
  fileName.textContent = state.file ? state.file.name : "Text → TTS Việt → giọng anime. Hoặc thả file audio có sẵn";
});

drop.addEventListener("dragover", (e) => {
  e.preventDefault();
});
drop.addEventListener("drop", (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (!f) return;
  state.file = f;
  fileName.textContent = f.name;
});

generate.addEventListener("click", async () => {
  generate.disabled = true;
  generate.textContent = "Đang tạo...";
  playerBox.classList.remove("ready");
  download.disabled = true;
  progressWrap.hidden = false;
  progressWrap.classList.add("running");
  setProgress(0, "Bắt đầu tạo giọng...", estimateDuration());
  outMeta.textContent = "Đang tạo... theo dõi thanh progress.";

  const duration = estimateDuration();
  const progress = runProgress(duration, (pct, label, remain) => {
    setProgress(Math.min(pct, 90), label, remain);
  });

  try {
    const form = new FormData();
    form.append("lang", state.lang);
    form.append("voice", state.voice);
    form.append("text", inputText.value);
    form.append("pitch", state.lang === "ja" ? "0" : pitch.value);
    if (state.file) form.append("audio", state.file, state.file.name);

    const res = await fetch("/api/generate", { method: "POST", body: form });
    progress.cancel();

    if (!res.ok) {
      let msg = `Lỗi ${res.status}`;
      try {
        const err = await res.json();
        msg = err.error || msg;
      } catch (_) {
        msg = await res.text();
      }
      throw new Error(msg);
    }

    const payload = await res.json();
    if (!payload.url) throw new Error("Server không trả file WAV");
    await attachExport(payload.url, payload.filename || `anime_${state.voice}.wav`);
    setProgress(100, "Xong — đang phát / có thể Export WAV", 0);
    progressWrap.classList.remove("running");
    outMeta.textContent = `Sẵn sàng: ${payload.filename}`;
    playerBox.classList.add("ready");
  } catch (err) {
    progress.cancel();
    progressWrap.classList.remove("running");
    setProgress(0, "Thất bại", 0);
    outMeta.textContent = String(err.message || err);
  } finally {
    generate.disabled = false;
    generate.textContent = "Tạo giọng nói";
  }
});

activeVoice.textContent = pretty(state.voice);
syncLangUi();
renderVoices();
