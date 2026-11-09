/**
 * Live2D MotionSync + idle / expression / tap
 * adapted from https://github.com/liyao1520/live2d-motionSync
 */
import renderer from "./vendor/live2d-motionsync/live2d-motionsync.bundle.js";

const MODEL_CANDIDATES = [
  "./live2d/ganyu/ganyu.model3.json",
  "./live2d/kei_vowels_pro/kei_vowels_pro.model3.json",
];

/** Per-model animation presets (id = expression Name in model3.json) */
const PRESETS = {
  ganyu: {
    label: "Ganyu",
    idleGroup: "Idle",
    expressions: [
      // Model uses 0–30 param scale (same as idle motion), not 0–1
      { id: "blush", label: "脸红", params: { Param43: 30 } },
      { id: "angry", label: "生气", params: { Param54: 30, ParamBrowLForm: -1 } },
      { id: "star", label: "星星", params: { Param44: 30 } },
    ],
  },
  kei: {
    label: "Kei",
    idleGroup: "",
    expressions: [],
  },
};

const EXPR_PARAM_IDS = ["Param43", "Param44", "Param54", "ParamBrowLForm"];

const canvas = document.getElementById("live2d-canvas");
const statusEl = document.getElementById("live2d-status");
const stopBtn = document.getElementById("live2d-stop");
const idleBtn = document.getElementById("live2d-idle");
const exprRow = document.getElementById("live2d-expr-row");

let avatar = null;
let ready = false;
let speaking = false;
let resizeObserver = null;
let idleTimer = null;
let exprHoldUntil = 0;
let activePreset = PRESETS.ganyu;
let modelKind = "ganyu";
let activeExprId = null;

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function getModel() {
  return avatar?.model || null;
}

function getCoreModel() {
  return getModel()?.internalModel?.coreModel || null;
}

function getExprManager() {
  return getModel()?.internalModel?.motionManager?.expressionManager || null;
}

function centerModel() {
  if (!avatar?.app || !avatar?.model) return;
  const { app, model } = avatar;
  const dpr = app.renderer.resolution || 1;
  const ratio = model.width / Math.max(model.height, 1);
  model.height = app.view.height / dpr;
  model.width = model.height * ratio;
  model.x = app.view.width / dpr / 2 - model.width / 2;
  model.y = 0;
}

function bindAutoResize() {
  if (!canvas?.parentElement || resizeObserver) return;
  resizeObserver = new ResizeObserver(() => centerModel());
  resizeObserver.observe(canvas.parentElement);
}

function pick(arr) {
  if (!arr?.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function resetExprParams() {
  const core = getCoreModel();
  if (!core) return;
  for (const id of EXPR_PARAM_IDS) {
    try {
      if (typeof core.setParameterValueById === "function") {
        core.setParameterValueById(id, 0);
      }
    } catch (_) {
      /* ignore missing params */
    }
  }
}

function applyExprParams(params) {
  const core = getCoreModel();
  if (!core || !params) return false;
  let ok = false;
  for (const [id, value] of Object.entries(params)) {
    try {
      if (typeof core.setParameterValueById === "function") {
        core.setParameterValueById(id, value);
        ok = true;
      }
    } catch (err) {
      console.warn("[live2d] setParam", id, err);
    }
  }
  return ok;
}

function playIdle() {
  const model = getModel();
  if (!model || speaking) return;
  // Don't overwrite a freshly applied expression
  if (Date.now() < exprHoldUntil) return;
  try {
    if (modelKind === "ganyu") {
      model.motion(activePreset.idleGroup);
    } else {
      model.motion("", 0);
    }
  } catch (err) {
    console.warn("[live2d] idle", err);
  }
}

function scheduleIdle(delayMs = 400) {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!speaking) playIdle();
  }, delayMs);
}

function findExpr(nameOrIndex) {
  const list = activePreset.expressions || [];
  if (typeof nameOrIndex === "number") return list[nameOrIndex] || null;
  return (
    list.find((e) => e.id === nameOrIndex || e.label === nameOrIndex) || null
  );
}

function setExpression(nameOrIndex) {
  const model = getModel();
  const expr = findExpr(nameOrIndex);
  if (!model) return false;

  const id = expr?.id ?? nameOrIndex;
  const index =
    typeof nameOrIndex === "number"
      ? nameOrIndex
      : (activePreset.expressions || []).findIndex(
          (e) => e.id === id || e.label === id
        );

  let ok = false;

  // 1) Official expression API (by name then index)
  try {
    const mgr = getExprManager();
    if (mgr && typeof model.expression === "function") {
      if (expr?.id) {
        model.expression(expr.id);
        ok = true;
      } else if (index >= 0) {
        model.expression(index);
        ok = true;
      }
    }
  } catch (err) {
    console.warn("[live2d] expression api", err);
  }

  // 2) Fallback: drive params directly (works even if .exp3 failed to load)
  if (expr?.params) {
    resetExprParams();
    if (applyExprParams(expr.params)) ok = true;
  }

  if (ok) {
    activeExprId = expr?.id || String(id);
    exprHoldUntil = Date.now() + 4000;
  }
  return ok;
}

function clearExpression() {
  activeExprId = null;
  exprHoldUntil = 0;
  try {
    const mgr = getExprManager();
    if (mgr?.resetExpression) mgr.resetExpression();
    else if (typeof getModel()?.expression === "function") getModel().expression();
  } catch (_) {
    /* ignore */
  }
  resetExprParams();
}

function playTapReaction() {
  if (!ready || speaking) return;
  const list = activePreset.expressions || [];
  if (list.length) {
    const expr = pick(list);
    if (setExpression(expr.id)) {
      setStatus(`Biểu cảm: ${expr.label}`);
      highlightExprBtn(expr.id);
      scheduleIdle(4200);
      return;
    }
  }
  playIdle();
  setStatus("Idle motion");
  scheduleIdle(2500);
}

function highlightExprBtn(id) {
  if (!exprRow) return;
  exprRow.querySelectorAll(".live2d-expr-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.exprId === id);
  });
}

function buildExprButtons() {
  if (!exprRow) return;
  exprRow.innerHTML = "";
  const list = activePreset.expressions || [];
  if (!list.length) {
    exprRow.hidden = true;
    return;
  }
  exprRow.hidden = false;
  list.forEach((expr) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mini live2d-expr-btn";
    btn.dataset.exprId = expr.id;
    btn.textContent = expr.label;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!ready) {
        setStatus("Live2D chưa sẵn sàng.");
        return;
      }
      if (speaking) {
        setStatus("Đang nói — đợi xong rồi đổi biểu cảm.");
        return;
      }
      const ok = setExpression(expr.id);
      if (ok) {
        highlightExprBtn(expr.id);
        setStatus(`Biểu cảm: ${expr.label}`);
        scheduleIdle(4200);
      } else {
        setStatus(`Không áp được biểu cảm: ${expr.label}`);
      }
    });
    exprRow.appendChild(btn);
  });
}

function bindInteractions() {
  const model = getModel();
  if (!model) return;

  const stage = canvas?.parentElement;
  if (stage && !stage.dataset.live2dTap) {
    stage.dataset.live2dTap = "1";
    stage.style.cursor = "pointer";
    stage.addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      playTapReaction();
    });
  }

  try {
    model.on?.("hit", () => {
      if (!speaking) playTapReaction();
    });
  } catch (_) {
    /* ignore */
  }
}

async function pickModelUrl() {
  for (const url of MODEL_CANDIDATES) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) return url;
    } catch (_) {
      /* try next */
    }
  }
  return MODEL_CANDIDATES[MODEL_CANDIDATES.length - 1];
}

async function initLive2d() {
  if (!canvas) return;
  try {
    setStatus("Đang tải model Live2D...");
    const modelURL = await pickModelUrl();
    modelKind = modelURL.includes("/ganyu/") ? "ganyu" : "kei";
    activePreset = PRESETS[modelKind];

    avatar = await renderer.render(canvas, {
      modelURL,
      backgroundAlpha: 0,
      autoInteract: true,
    });

    if (!avatar?.motionSync) {
      throw new Error("Renderer không trả motionSync");
    }

    bindAutoResize();
    centerModel();
    bindInteractions();
    buildExprButtons();
    ready = true;

    // Re-apply expression each frame AFTER motion (param scale 0–30)
    const model = getModel();
    if (model?.internalModel && !model.__exprHooked) {
      model.__exprHooked = true;
      model.internalModel.on("afterMotionUpdate", () => {
        if (activeExprId && Date.now() < exprHoldUntil) {
          const expr = findExpr(activeExprId);
          if (expr?.params) applyExprParams(expr.params);
        }
      });
      // Also after expression manager slot — beforeModelUpdate is last chance before draw
      model.internalModel.on("beforeModelUpdate", () => {
        if (activeExprId && Date.now() < exprHoldUntil) {
          const expr = findExpr(activeExprId);
          if (expr?.params) applyExprParams(expr.params);
        }
      });
    }

    playIdle();
    setStatus(`Sẵn sàng — ${activePreset.label}. Bấm 脸红 / 生气 / 星星 để đổi mặt.`);
    if (stopBtn) stopBtn.disabled = false;
    if (idleBtn) idleBtn.disabled = false;
  } catch (err) {
    console.error("[live2d]", err);
    setStatus(`Lỗi tải Live2D: ${err.message || err}`);
  }
}

async function playAudio(url) {
  if (!ready || !avatar?.motionSync) {
    setStatus("Live2D chưa sẵn sàng.");
    return false;
  }
  try {
    speaking = true;
    clearTimeout(idleTimer);

    setStatus("Avatar đang nói...");
    await avatar.motionSync.play(url);

    speaking = false;
    if (activePreset.expressions?.length) {
      const expr = pick(activePreset.expressions);
      setExpression(expr.id);
      highlightExprBtn(expr.id);
    }
    scheduleIdle(1200);
    setStatus("Xong — bấm nút biểu cảm hoặc click avatar.");
    return true;
  } catch (err) {
    speaking = false;
    console.error("[live2d] play", err);
    setStatus(`Lip-sync lỗi: ${err.message || err}`);
    scheduleIdle(500);
    return false;
  }
}

function stopAudio() {
  speaking = false;
  avatar?.motionSync?.stop?.();
  clearExpression();
  highlightExprBtn(null);
  scheduleIdle(200);
  setStatus("Đã dừng — quay idle.");
}

if (stopBtn) {
  stopBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    stopAudio();
  });
}
if (idleBtn) {
  idleBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!ready || speaking) return;
    clearExpression();
    highlightExprBtn(null);
    playIdle();
    setStatus("Idle motion");
  });
}

window.live2dAvatar = {
  get ready() {
    return ready;
  },
  play: playAudio,
  stop: stopAudio,
  idle: playIdle,
  expression: setExpression,
};

initLive2d();
