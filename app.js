import { quickSortCardEvents } from "./quicksortCards.js";
import {
  cardFromMediaFile,
  DEFAULT_MEDIA_CROMO_FILES,
  sortFilenamesByJugNumber,
} from "./mediaCards.js";

const shuffleBtn = document.getElementById("shuffleBtn");
const quickSortBtn = document.getElementById("quickSortBtn");
const stepBtn = document.getElementById("stepBtn");
const manualPivotToggle = document.getElementById("manualPivotToggle");
const speedRange = document.getElementById("speedRange");
const speedLabel = document.getElementById("speedLabel");
const statusEl = document.getElementById("status");

const deckEl = document.getElementById("deck");
const pileLeftEl = document.getElementById("pileLeft");
const pilePivotEl = document.getElementById("pilePivot");
const pileRightEl = document.getElementById("pileRight");
const subdeckEl = document.getElementById("subdeck");
const subdeckWrapEl = document.getElementById("subdeckWrap");
const treeEl = document.getElementById("tree");

const pivotOverlay = document.getElementById("pivotOverlay");
const pivotOverlayCard = document.getElementById("pivotOverlayCard");

const goalOverlay = document.getElementById("goalOverlay");
const goalBall = document.getElementById("goalBall");
const goalText = document.getElementById("goalText");
const goalSubtext = document.getElementById("goalSubtext");
const goalConfetti = document.getElementById("goalConfetti");
const goalNet = goalOverlay?.querySelector(".goalOverlay__net");

const treeSnapshotEl = document.getElementById("treeSnapshot");
const treeSnapshotContentEl = document.getElementById("treeSnapshotContent");
const snapshotTitleEl = document.getElementById("snapshotTitle");
const snapshotDescEl = document.getElementById("snapshotDesc");
const snapshotCardsEl = document.getElementById("snapshotCards");

const MEDIA_BASE = "Media_cromo";
const MANIFEST_URL = `${MEDIA_BASE}/manifest.json`;

const PIVOT_ZOOM_W = 260;
const PIVOT_ZOOM_H = 364;
const PIVOT_ZOOM_MS = 1600;
const PIVOT_HOLD_MS = 1200;
const PIVOT_LAND_MS = 1100;

const GOAL_CELEBRATION_MS = 2800;
const GOAL_CELEBRATION_FINAL_MS = 4200;
let goalCelebrating = false;

/** @type {Array<{id:string,value:number,imageUrl:string,filename:string}>} */
let deckCards = [];

/** @type {Map<string, any>} */
let cardById = new Map();

let gen = null;
let genDone = true;
let mode = "idle";

/** @type {Array<{callId:string,depth:number,allIds:string[],pivotId:string|null,leftIds:string[],rightIds:string[],movedIds:Set<string>,highlightId:string|null}>} */
let frames = [];

/** @type {Map<string, object>} */
let treeData = new Map();
let treeRootCallId = null;
let activeTreeCallId = null;
let pendingRootCallId = null;

let pivotAnimating = false;
let waitingForPivotPick = false;
/** @type {((id: string) => void)|null} */
let pivotPickResolver = null;
/** @type {string|null} */
let pendingPivotPickCallId = null;

function isManualPivotMode() {
  return manualPivotToggle?.checked ?? false;
}

function createEmptyTreeNode(callId, { parentCallId = null, depth = 0 } = {}) {
  return {
    callId,
    parentCallId,
    depth,
    initialIds: [],
    initialValues: [],
    pivotId: null,
    pivotValue: null,
    leftIds: [],
    leftValues: [],
    rightIds: [],
    rightValues: [],
    resultIds: [],
    resultValues: [],
    leftChild: null,
    rightChild: null,
    status: "ready",
  };
}

function idsKey(ids) {
  return ids.join("|");
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function compareByValue(a, b) {
  return a.value - b.value;
}

function isSortRunning() {
  return gen && !genDone;
}

function refreshActionButtons() {
  const running = isSortRunning();
  const picking = waitingForPivotPick;
  shuffleBtn.disabled = running || pivotAnimating || picking;
  quickSortBtn.disabled = running || pivotAnimating || picking;
  stepBtn.disabled = (running && mode === "auto") || pivotAnimating || picking;
  if (manualPivotToggle) {
    manualPivotToggle.disabled = running || pivotAnimating || picking;
  }
}

function disableAllActions(disabled) {
  shuffleBtn.disabled = disabled;
  quickSortBtn.disabled = disabled;
  stepBtn.disabled = disabled;
  if (manualPivotToggle) manualPivotToggle.disabled = disabled && !waitingForPivotPick;
}

function cancelPivotPick() {
  waitingForPivotPick = false;
  pendingPivotPickCallId = null;
  pivotPickResolver = null;
  subdeckWrapEl?.classList.remove("subdeckWrap--picking");
}

function resetTreeState() {
  treeData = new Map();
  treeRootCallId = null;
  activeTreeCallId = null;
  pendingRootCallId = null;
  treeEl.innerHTML = "";
  resetSnapshotPanel();
}

function resetSnapshotPanel() {
  treeSnapshotEl.classList.add("treeSnapshot--empty");
  if (treeSnapshotContentEl) treeSnapshotContentEl.hidden = true;
  snapshotTitleEl.textContent = "";
  snapshotDescEl.textContent = "";
  snapshotCardsEl.innerHTML = "";
}

/** Raíz con el arreglo revuelto actual (antes de ordenar). */
function initTreeRootFromDeck() {
  resetTreeState();
  pendingRootCallId = "root_pending";
  const node = createEmptyTreeNode(pendingRootCallId);
  node.initialIds = deckCards.map((c) => c.id);
  node.initialValues = deckCards.map((c) => c.value);
  node.status = "ready";
  node.depth = 0;
  treeData.set(pendingRootCallId, node);
  treeRootCallId = pendingRootCallId;
  renderTree();
}

function clearSortUI() {
  cancelPivotPick();
  pileLeftEl.innerHTML = "";
  pilePivotEl.innerHTML = "";
  pileRightEl.innerHTML = "";
  subdeckEl.innerHTML = "";
  frames = [];
}

function clearGameUI() {
  clearSortUI();
  resetTreeState();
  setStatus("Listo. Revuelve las cartas y usa QuickSort o Paso a paso.");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function renderCardBase(card, { overlayClass = "", cardId = null } = {}) {
  const wrap = document.createElement("div");
  wrap.className = "card";
  if (cardId) wrap.dataset.cardId = cardId;

  const overlay = document.createElement("div");
  overlay.className = "card__value " + overlayClass;
  overlay.textContent = card.value;
  wrap.appendChild(overlay);

  if (card.imageUrl) {
    const img = document.createElement("img");
    img.src = card.imageUrl;
    img.alt = `Valor ${card.value}`;
    wrap.appendChild(img);
  } else {
    const fallback = document.createElement("div");
    fallback.className = "card__fallback";
    fallback.textContent = "?";
    wrap.appendChild(fallback);
  }

  return wrap;
}

function renderDeck() {
  deckEl.innerHTML = "";
  for (const card of deckCards) {
    const cardWrap = document.createElement("div");
    cardWrap.className = "cardWrap";
    cardWrap.appendChild(renderCardBase(card, { cardId: card.id }));

    const nameEl = document.createElement("div");
    nameEl.className = "cardWrap__name";
    nameEl.title = card.filename;
    nameEl.textContent = card.filename.replace(/\.[^.]+$/, "");
    cardWrap.appendChild(nameEl);

    deckEl.appendChild(cardWrap);
  }
}

function cardByIdOrNull(id) {
  return cardById.get(id) || null;
}

function renderSubdeck(frame, { selectable = false, onPick = null, hoverId = null } = {}) {
  const ids = frame.allIds.filter((id) => !frame.movedIds.has(id));
  subdeckEl.innerHTML = "";

  for (const id of ids) {
    const card = cardByIdOrNull(id);
    if (!card) continue;

    let overlayClass = "";
    if (frame.pivotId === id) overlayClass = "card__value--pivot";
    else if (frame.highlightId === id) overlayClass = "card__value--compare";

    const cardEl = renderCardBase(card, { overlayClass, cardId: card.id });

    if (selectable) {
      cardEl.classList.add("card--selectable", "card--pick-hint");
      cardEl.title = "Clic para elegir como pivote";
      cardEl.addEventListener("click", () => onPick?.(id));
      cardEl.addEventListener("mouseenter", () => {
        subdeckEl.querySelectorAll(".card--pick-selected").forEach((el) => {
          el.classList.remove("card--pick-selected");
        });
        cardEl.classList.add("card--pick-selected");
      });
      if (hoverId === id) cardEl.classList.add("card--pick-selected");
    }

    subdeckEl.appendChild(cardEl);
  }
}

function renderPiles(frame) {
  pileLeftEl.innerHTML = "";
  pilePivotEl.innerHTML = "";
  pileRightEl.innerHTML = "";

  for (const id of frame.leftIds) {
    const card = cardByIdOrNull(id);
    if (!card) continue;
    pileLeftEl.appendChild(renderCardBase(card, { overlayClass: "card__value--move", cardId: card.id }));
  }

  if (frame.pivotId) {
    const pivotCard = cardByIdOrNull(frame.pivotId);
    if (pivotCard) {
      const el = renderCardBase(pivotCard, { overlayClass: "card__value--pivot", cardId: pivotCard.id });
      el.classList.add("card--pivot-slot");
      pilePivotEl.appendChild(el);
    }
  }

  for (const id of frame.rightIds) {
    const card = cardByIdOrNull(id);
    if (!card) continue;
    pileRightEl.appendChild(renderCardBase(card, { overlayClass: "card__value--move", cardId: card.id }));
  }
}

/* ── Pivot zoom animation ── */

async function animatePivotSelection(card, sourceCardEl) {
  if (!card) return;

  pivotAnimating = true;
  refreshActionButtons();

  const cardInner = renderCardBase(card, { overlayClass: "card__value--pivot" });
  cardInner.style.width = "100%";
  cardInner.style.height = "100%";
  pivotOverlayCard.innerHTML = "";
  pivotOverlayCard.appendChild(cardInner);

  const srcRect = sourceCardEl
    ? sourceCardEl.getBoundingClientRect()
    : { left: window.innerWidth / 2 - 46, top: window.innerHeight / 2 - 64, width: 92, height: 128 };

  const centerX = window.innerWidth / 2 - PIVOT_ZOOM_W / 2;
  const centerY = window.innerHeight / 2 - PIVOT_ZOOM_H / 2;

  pivotOverlayCard.style.transition = "none";
  pivotOverlayCard.style.left = `${srcRect.left}px`;
  pivotOverlayCard.style.top = `${srcRect.top}px`;
  pivotOverlayCard.style.width = `${srcRect.width}px`;
  pivotOverlayCard.style.height = `${srcRect.height}px`;
  pivotOverlayCard.style.transform = "scale(1) rotate(0deg)";
  pivotOverlayCard.classList.remove("is-zoomed", "is-landing");

  pivotOverlay.hidden = false;
  requestAnimationFrame(() => pivotOverlay.classList.add("is-visible"));

  await sleep(60);
  pivotOverlayCard.style.transition = "";

  pivotOverlayCard.classList.add("is-zoomed");
  pivotOverlayCard.style.left = `${centerX}px`;
  pivotOverlayCard.style.top = `${centerY}px`;
  pivotOverlayCard.style.width = `${PIVOT_ZOOM_W}px`;
  pivotOverlayCard.style.height = `${PIVOT_ZOOM_H}px`;
  pivotOverlayCard.style.transform = "scale(1.06) rotate(-2deg)";

  await sleep(PIVOT_ZOOM_MS);
  await sleep(PIVOT_HOLD_MS);

  renderPiles(frames[frames.length - 1]);
  await sleep(100);

  const targetCard = pilePivotEl.querySelector(".card");
  const targetRect = targetCard
    ? targetCard.getBoundingClientRect()
    : pilePivotEl.getBoundingClientRect();

  pivotOverlayCard.classList.remove("is-zoomed");
  pivotOverlayCard.classList.add("is-landing");
  pivotOverlayCard.style.left = `${targetRect.left}px`;
  pivotOverlayCard.style.top = `${targetRect.top}px`;
  pivotOverlayCard.style.width = `${targetRect.width || 92}px`;
  pivotOverlayCard.style.height = `${targetRect.height || 128}px`;
  pivotOverlayCard.style.transform = "scale(1) rotate(0deg)";

  await sleep(PIVOT_LAND_MS);

  pivotOverlay.classList.remove("is-visible");
  await sleep(400);
  pivotOverlay.hidden = true;
  pivotOverlayCard.innerHTML = "";
  pivotOverlayCard.classList.remove("is-zoomed", "is-landing");

  pivotAnimating = false;
  refreshActionButtons();
}

/* ── Goal celebration animation ── */

function createConfetti(container, count) {
  const colors = [
    "#fbbf24", "#10b981", "#22d3ee", "#ffffff",
    "#f59e0b", "#34d399", "#06b6d4", "#a7f3d0",
    "#fde68a", "#6ee7b7",
  ];
  const shapes = ["circle", "rect", "triangle"];

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.className = "confetti";

    const color = colors[Math.floor(Math.random() * colors.length)];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    const size = 6 + Math.random() * 10;

    piece.style.width = `${size}px`;
    piece.style.height = shape === "rect" ? `${size * 0.6}px` : `${size}px`;
    piece.style.backgroundColor = color;
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.top = `-${10 + Math.random() * 30}px`;

    if (shape === "circle") {
      piece.style.borderRadius = "50%";
    } else if (shape === "triangle") {
      piece.style.backgroundColor = "transparent";
      piece.style.width = "0";
      piece.style.height = "0";
      piece.style.borderLeft = `${size / 2}px solid transparent`;
      piece.style.borderRight = `${size / 2}px solid transparent`;
      piece.style.borderBottom = `${size}px solid ${color}`;
    }

    // Randomize animation variables
    const fallDuration = 2 + Math.random() * 2;
    const fallDelay = Math.random() * 1.2;
    const driftX = -80 + Math.random() * 160;
    const spin = 360 + Math.random() * 720;
    const startY = -(10 + Math.random() * 40);

    piece.style.setProperty("--fall-duration", `${fallDuration}s`);
    piece.style.setProperty("--fall-delay", `${fallDelay}s`);
    piece.style.setProperty("--drift-x", `${driftX}px`);
    piece.style.setProperty("--spin", `${spin}deg`);
    piece.style.setProperty("--start-y", `${startY}px`);

    container.appendChild(piece);
  }
}

async function playGoalCelebration({ text = "¡GOOOL!", subtext = "", isFinal = false, durationMs = GOAL_CELEBRATION_MS } = {}) {
  if (!goalOverlay || goalCelebrating) return;

  goalCelebrating = true;

  // Reset state
  goalOverlay.classList.remove("is-visible", "goalOverlay--final");
  goalNet?.classList.remove("is-shaking");
  goalConfetti.innerHTML = "";
  goalText.textContent = text;
  goalSubtext.textContent = subtext;

  if (isFinal) {
    goalOverlay.classList.add("goalOverlay--final");
  }

  // Show overlay
  goalOverlay.hidden = false;
  // Force reflow before adding animations
  void goalOverlay.offsetWidth;
  goalOverlay.classList.add("is-visible");

  // Create confetti
  const confettiCount = isFinal ? 80 : 35;
  createConfetti(goalConfetti, confettiCount);

  // After ball reaches the net (~700ms), shake it
  await sleep(700);
  goalNet?.classList.add("is-shaking");

  // Hold the celebration
  await sleep(durationMs - 700);

  // Fade out
  goalOverlay.classList.remove("is-visible");
  await sleep(500);

  // Clean up
  goalOverlay.hidden = true;
  goalOverlay.classList.remove("goalOverlay--final");
  goalNet?.classList.remove("is-shaking");
  goalConfetti.innerHTML = "";

  goalCelebrating = false;
}

/* ── Recursion tree ── */

function adoptPendingRoot(event) {
  if (pendingRootCallId && treeData.has(pendingRootCallId)) {
    const pending = treeData.get(pendingRootCallId);
    treeData.delete(pendingRootCallId);
    pending.callId = event.callId;
    pending.parentCallId = null;
    pending.depth = event.depth;
    pending.initialIds = [...event.cardIds];
    pending.initialValues = [...event.cardValues];
    pending.status = event.cardValues.length <= 1 ? "base" : "active";
    treeData.set(event.callId, pending);
    treeRootCallId = event.callId;
    pendingRootCallId = null;
    return pending;
  }
  return null;
}

function ensureTreeNode(event) {
  if (treeData.has(event.callId)) return treeData.get(event.callId);

  if (event.type === "callStart" && !event.parentCallId) {
    const adopted = adoptPendingRoot(event);
    if (adopted) return adopted;
  }

  const node = createEmptyTreeNode(event.callId, {
    parentCallId: event.parentCallId ?? null,
    depth: event.depth ?? 0,
  });

  if (event.cardIds) {
    node.initialIds = [...event.cardIds];
    node.initialValues = [...event.cardValues];
  }

  treeData.set(event.callId, node);

  if (
    event.parentCallId &&
    treeData.has(event.parentCallId) &&
    event.cardIds?.length > 0
  ) {
    const parent = treeData.get(event.parentCallId);
    const key = idsKey(event.cardIds);

    if (parent.leftIds.length && idsKey(parent.leftIds) === key) {
      parent.leftChild = event.callId;
    } else if (parent.rightIds.length && idsKey(parent.rightIds) === key) {
      parent.rightChild = event.callId;
    }
  } else if (!event.parentCallId && !pendingRootCallId) {
    treeRootCallId = event.callId;
  }

  return node;
}

function nodeIsVisible(node) {
  return node.initialValues.length > 0;
}

function updateTreeFromEvent(event) {
  const node = ensureTreeNode(event);

  if (event.type === "callStart") {
    node.initialIds = [...event.cardIds];
    node.initialValues = [...event.cardValues];
    node.depth = event.depth;
    if (node.status === "ready") {
      node.status = event.cardValues.length <= 1 ? "base" : "active";
    } else if (event.cardValues.length <= 1) {
      node.status = "base";
    } else {
      node.status = "active";
    }
  } else if (event.type === "pivotSelected") {
    node.pivotId = event.pivotId;
    node.pivotValue = event.pivotValue;
    node.status = "pivot";
  } else if (event.type === "partitionDone") {
    node.leftIds = [...event.leftIds];
    node.leftValues = [...event.leftValues];
    node.rightIds = [...event.rightIds];
    node.rightValues = [...event.rightValues];
    node.status = "partitioned";
  } else if (event.type === "callBase") {
    node.initialIds = [...event.cardIds];
    node.initialValues = [...event.cardValues];
    node.resultIds = [...event.cardIds];
    node.resultValues = [...event.cardValues];
    node.status = "base";
  } else if (event.type === "callComplete") {
    node.resultIds = [...event.resultIds];
    node.resultValues = [...event.resultValues];
    node.status = "done";
  }

  renderTree();
  if (activeTreeCallId === event.callId) {
    showTreeSnapshot(node);
  }
}

function getNodeStatusLabel(node) {
  switch (node.status) {
    case "ready":
      return "Arreglo revuelto";
    case "active":
      return "Subarreglo";
    case "pivot":
      return "Eligiendo pivote";
    case "partitioned":
      return "Dividido izq / der";
    case "base":
      return "Caso base";
    case "done":
      return "Ordenado aquí";
    default:
      return "";
  }
}

function getSnapshotMeta(node) {
  const ids = node.initialIds;
  const values = node.initialValues;

  if (node.status === "ready") {
    return {
      title: "Raíz — arreglo revuelto",
      desc: `Estado inicial antes de QuickSort: [${values.join(", ")}]`,
      ids,
      pivotId: null,
      leftIds: [],
      rightIds: [],
    };
  }

  if (node.status === "partitioned" || node.status === "done") {
    const leftV = node.leftValues.join(", ") || "∅";
    const rightV = node.rightValues.join(", ") || "∅";
    return {
      title: node.status === "done" ? "Subarreglo ordenado" : "Partición según pivote",
      desc: `Entrada [${values.join(", ")}] → menores [${leftV}] · pivote ${node.pivotValue} · mayores [${rightV}]`,
      ids,
      pivotId: node.pivotId,
      leftIds: node.leftIds,
      rightIds: node.rightIds,
    };
  }

  if (node.pivotValue != null) {
    return {
      title: "Pivote seleccionado",
      desc: `Subarreglo [${values.join(", ")}] · pivote = ${node.pivotValue}`,
      ids,
      pivotId: node.pivotId,
      leftIds: [],
      rightIds: [],
    };
  }

  return {
    title: "Subarreglo en este nodo",
    desc: `[${values.join(", ")}]`,
    ids,
    pivotId: null,
    leftIds: [],
    rightIds: [],
  };
}

function showTreeSnapshot(node) {
  activeTreeCallId = node.callId;
  renderTree();

  const meta = getSnapshotMeta(node);
  treeSnapshotEl.classList.remove("treeSnapshot--empty");
  if (treeSnapshotContentEl) treeSnapshotContentEl.hidden = false;
  snapshotTitleEl.textContent = meta.title;
  snapshotDescEl.textContent = meta.desc;

  snapshotCardsEl.innerHTML = "";

  for (const id of meta.ids) {
    const card = cardById.get(id);
    if (!card) continue;

    const chip = document.createElement("div");
    chip.className = "snapshotChip";

    if (card.imageUrl) {
      const img = document.createElement("img");
      img.className = "snapshotChip__img";
      if (id === meta.pivotId) img.classList.add("snapshotChip__img--pivot");
      img.src = card.imageUrl;
      img.alt = String(card.value);
      chip.appendChild(img);
    }

    const valEl = document.createElement("span");
    valEl.className = "snapshotChip__val";
    valEl.textContent = card.value;
    chip.appendChild(valEl);

    snapshotCardsEl.appendChild(chip);
  }

  if (meta.leftIds.length || meta.rightIds.length) {
    const split = document.createElement("div");
    split.className = "snapshotSplit";
    split.innerHTML = `
      <div class="snapshotSplit__col snapshotSplit__col--left">
        <span class="snapshotSplit__label">← Menores</span>
        <span class="snapshotSplit__vals">[${node.leftValues.join(", ") || "∅"}]</span>
      </div>
      <div class="snapshotSplit__col snapshotSplit__col--pivot">
        <span class="snapshotSplit__label">Pivote</span>
        <span class="snapshotSplit__vals">${node.pivotValue ?? "—"}</span>
      </div>
      <div class="snapshotSplit__col snapshotSplit__col--right">
        <span class="snapshotSplit__label">Mayores →</span>
        <span class="snapshotSplit__vals">[${node.rightValues.join(", ") || "∅"}]</span>
      </div>
    `;
    snapshotCardsEl.appendChild(split);
  }
}

function buildTreeBranch(callId) {
  const node = treeData.get(callId);
  if (!node || !nodeIsVisible(node)) return null;

  const li = document.createElement("li");
  li.className = "treeNode";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "treeNodeBtn";
  if (node.status === "ready") btn.classList.add("is-root");
  if (node.status === "base") btn.classList.add("is-base");
  if (node.status === "done") btn.classList.add("is-done");
  if (node.status === "partitioned") btn.classList.add("is-partitioned");
  if (activeTreeCallId === callId) btn.classList.add("is-active");

  const pivotLine =
    node.pivotValue != null
      ? `<span class="treeNodeBtn__pivot">Pivote ${node.pivotValue}</span>`
      : node.status === "ready"
        ? `<span class="treeNodeBtn__pivot treeNodeBtn__pivot--root">Raíz revuelta</span>`
        : "";

  let splitLine = "";
  if (node.status === "partitioned" || node.status === "done") {
    splitLine = `<span class="treeNodeBtn__split">← [${node.leftValues.join(", ") || "∅"}] | [${node.rightValues.join(", ") || "∅"}] →</span>`;
  }

  btn.innerHTML = `
    ${pivotLine}
    <span class="treeNodeBtn__array">[${node.initialValues.join(", ")}]</span>
    ${splitLine}
    <span class="treeNodeBtn__status">${escapeHtml(getNodeStatusLabel(node))}</span>
  `;

  btn.addEventListener("click", () => showTreeSnapshot(node));
  li.appendChild(btn);

  const hasLeft = node.leftChild && treeData.has(node.leftChild) && nodeIsVisible(treeData.get(node.leftChild));
  const hasRight = node.rightChild && treeData.has(node.rightChild) && nodeIsVisible(treeData.get(node.rightChild));

  if (hasLeft || hasRight) {
    const childUl = document.createElement("ul");
    childUl.className = "treeChildren";

    if (hasLeft) {
      const leftWrap = document.createElement("li");
      leftWrap.className = "treeBranch treeBranch--left";
      const label = document.createElement("span");
      label.className = "treeBranch__label";
      label.textContent = `← menores que ${node.pivotValue ?? "pivote"}`;
      leftWrap.appendChild(label);
      const innerUl = document.createElement("ul");
      innerUl.className = "treeSub";
      const childLi = buildTreeBranch(node.leftChild);
      if (childLi) {
        innerUl.appendChild(childLi);
        leftWrap.appendChild(innerUl);
        childUl.appendChild(leftWrap);
      }
    }

    if (hasRight) {
      const rightWrap = document.createElement("li");
      rightWrap.className = "treeBranch treeBranch--right";
      const label = document.createElement("span");
      label.className = "treeBranch__label";
      label.textContent = `≥ ${node.pivotValue ?? "pivote"} →`;
      rightWrap.appendChild(label);
      const innerUl = document.createElement("ul");
      innerUl.className = "treeSub";
      const childLi = buildTreeBranch(node.rightChild);
      if (childLi) {
        innerUl.appendChild(childLi);
        rightWrap.appendChild(innerUl);
        childUl.appendChild(rightWrap);
      }
    }

    if (childUl.children.length) li.appendChild(childUl);
  }

  return li;
}

function renderTree() {
  treeEl.innerHTML = "";
  if (!treeRootCallId) return;

  const rootLi = buildTreeBranch(treeRootCallId);
  if (rootLi) treeEl.appendChild(rootLi);
}

/* ── Manual pivot pick ── */

function waitForPivotPick(event) {
  return new Promise((resolve) => {
    waitingForPivotPick = true;
    pendingPivotPickCallId = event.callId;
    pivotPickResolver = resolve;

    subdeckWrapEl?.classList.add("subdeckWrap--picking");

    const frame = frames.find((f) => f.callId === event.callId) ?? frames[frames.length - 1];
    const pickFrame = frame ?? {
      allIds: event.cardIds,
      movedIds: new Set(),
      pivotId: null,
      highlightId: null,
    };

    renderSubdeck(pickFrame, {
      selectable: true,
      onPick: confirmPivotPick,
    });

    setStatus(
      `Nivel ${event.depth}: haz clic en una carta del subarreglo [${event.cardValues.join(", ")}] para elegir el pivote.`
    );
    refreshActionButtons();
  });
}

function confirmPivotPick(cardId) {
  if (!waitingForPivotPick || !pivotPickResolver) return;

  const card = cardByIdOrNull(cardId);
  if (!card) return;

  const resolve = pivotPickResolver;
  cancelPivotPick();
  setStatus(`Pivote elegido: ${card.value}. Particionando…`);
  resolve(cardId);
}


/* ── Event application ── */

async function applyEvent(event) {
  if (!event) return;

  if (event.type === "callStart") {
    const frame = {
      callId: event.callId,
      depth: event.depth,
      allIds: event.cardIds.slice(),
      pivotId: null,
      leftIds: [],
      rightIds: [],
      movedIds: new Set(),
      highlightId: null,
    };
    frames.push(frame);
    updateTreeFromEvent(event);

    renderSubdeck(frame);
    pileLeftEl.innerHTML = "";
    pilePivotEl.innerHTML = "";
    pileRightEl.innerHTML = "";

    setStatus(`Nivel ${event.depth}: subarreglo [${event.cardValues.join(", ")}]`);
    return;
  }

  const frame = frames[frames.length - 1];
  if (!frame) return;

  if (event.type === "pivotSelected") {
    frame.pivotId = event.pivotId;
    frame.movedIds.clear();
    frame.leftIds = [];
    frame.rightIds = [];
    frame.highlightId = null;

    updateTreeFromEvent(event);
    renderSubdeck(frame);

    const pivotCard = cardByIdOrNull(event.pivotId);
    const sourceEl = subdeckEl.querySelector(`[data-card-id="${event.pivotId}"]`);
    if (sourceEl) sourceEl.style.visibility = "hidden";

    await animatePivotSelection(pivotCard, sourceEl);
    if (sourceEl) sourceEl.style.visibility = "";

    renderPiles(frame);
    setStatus(`Pivote seleccionado: ${event.pivotValue}${event.manual ? " (elegido por ti)" : ""}`);
    return;
  }

  if (event.type === "compare") {
    frame.highlightId = event.currentId;
    renderSubdeck(frame);
    setStatus(`Comparando ${event.currentValue} con pivote ${event.pivotValue}`);
    return;
  }

  if (event.type === "move") {
    frame.highlightId = null;
    frame.movedIds.add(event.cardId);
    if (event.to === "left") frame.leftIds.push(event.cardId);
    else frame.rightIds.push(event.cardId);

    renderSubdeck(frame);
    renderPiles(frame);
    setStatus(`${event.cardValue} → ${event.to === "left" ? "menores" : "mayores o iguales"}`);
    return;
  }

  if (event.type === "partitionDone") {
    updateTreeFromEvent(event);
    renderSubdeck(frame);
    renderPiles(frame);
    setStatus("Partición completa. Ordenando sublistas…");
    return;
  }

  if (event.type === "callBase") {
    updateTreeFromEvent(event);
    subdeckEl.innerHTML = "";
    for (const id of event.cardIds) {
      const card = cardByIdOrNull(id);
      if (!card) continue;
      subdeckEl.appendChild(renderCardBase(card, { cardId: card.id }));
    }
    pileLeftEl.innerHTML = "";
    pilePivotEl.innerHTML = "";
    pileRightEl.innerHTML = "";
    setStatus("Caso base: una sola carta (o vacío).");
    if (frames.length && frames[frames.length - 1].callId === event.callId) {
      frames.pop();
    }
    return;
  }

  if (event.type === "callComplete") {
    updateTreeFromEvent(event);

    const pivotId = frame.pivotId;
    const resultIds = event.resultIds.slice();
    const pivotIndex = pivotId ? resultIds.indexOf(pivotId) : -1;
    frame.leftIds = pivotIndex >= 0 ? resultIds.slice(0, pivotIndex) : [];
    frame.rightIds = pivotIndex >= 0 ? resultIds.slice(pivotIndex + 1) : resultIds;
    frame.highlightId = null;

    subdeckEl.innerHTML = "";
    for (const id of resultIds) {
      const card = cardByIdOrNull(id);
      if (!card) continue;
      const overlayClass = id === pivotId ? "card__value--pivot" : "";
      subdeckEl.appendChild(renderCardBase(card, { overlayClass, cardId: card.id }));
    }

    renderPiles(frame);
    setStatus(`Ordenado en este nivel: [${event.resultValues.join(", ")}]`);
    if (frames.length && frames[frames.length - 1].callId === event.callId) {
      frames.pop();
    }

    // Goal celebration for completed subarray (non-blocking)
    if (event.resultValues.length > 1) {
      playGoalCelebration({
        text: "¡GOOOL!",
        subtext: `Subarreglo ordenado: [${event.resultValues.join(", ")}]`,
        isFinal: false,
        durationMs: GOAL_CELEBRATION_MS,
      });
    }
    return;
  }

  if (event.type === "rootComplete") {
    setStatus(`QuickSort terminado: [${event.cardValues.join(", ")}]`);

    // Grand finale goal celebration
    playGoalCelebration({
      text: "🏆 ¡CAMPEÓN!",
      subtext: `Ordenamiento completo: [${event.cardValues.join(", ")}]`,
      isFinal: true,
      durationMs: GOAL_CELEBRATION_FINAL_MS,
    });
  }
}

function getCurrentSpeedMs() {
  return Number(speedRange.value);
}

function finishSort(sorted) {
  genDone = true;
  gen = null;
  mode = "idle";
  cancelPivotPick();
  deckCards = sorted;
  rebuildMapsFromDeck();
  renderDeck();
  setStatus("Ordenación terminada. Explora el árbol o revuelve de nuevo.");
  disableAllActions(false);
  refreshActionButtons();
}

async function runAutoFromCurrent() {
  if (!gen) return;
  mode = "auto";
  disableAllActions(true);
  stepBtn.disabled = true;
  setStatus(
    isManualPivotMode()
      ? "QuickSort: elige el pivote en cada subarreglo cuando se te pida."
      : "Ejecutando QuickSort…"
  );

  let pivotResume = undefined;

  while (true) {
    const result = gen.next(pivotResume);
    pivotResume = undefined;

    if (result.done) {
      finishSort(result.value);
      break;
    }

    const event = result.value;

    if (event.type === "pickPivotRequest") {
      pivotResume = await waitForPivotPick(event);
      continue;
    }

    await applyEvent(event);
    if (event.type !== "pivotSelected") {
      await sleep(getCurrentSpeedMs());
    }
  }
}

async function advanceOneEvent() {
  if (!gen || genDone) return;

  const result = gen.next();
  if (result.done) {
    finishSort(result.value);
    return;
  }

  const event = result.value;

  if (event.type === "pickPivotRequest") {
    const pivotId = await waitForPivotPick(event);
    const afterPick = gen.next(pivotId);
    if (afterPick.done) {
      finishSort(afterPick.value);
      return;
    }
    await applyEvent(afterPick.value);
    return;
  }

  await applyEvent(event);
}

function rebuildMapsFromDeck() {
  cardById = new Map(deckCards.map((c) => [c.id, c]));
}

function fisherYatesShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shuffleDeck() {
  gen = null;
  genDone = true;
  mode = "idle";
  deckCards = fisherYatesShuffle(deckCards);
  rebuildMapsFromDeck();
  renderDeck();
  clearSortUI();
  initTreeRootFromDeck();
  setStatus("Cartas revueltas. La raíz del árbol muestra el arreglo actual.");
  refreshActionButtons();
}

async function loadFilenames() {
  try {
    const res = await fetch(MANIFEST_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    if (data?.files?.length) {
      return data.files.map((f) => String(f).trim()).filter(Boolean);
    }
  } catch {
    /* fallback */
  }
  return DEFAULT_MEDIA_CROMO_FILES.slice();
}

function buildInitialDeckFromFiles(filenames) {
  const sorted = filenames.slice().sort(sortFilenamesByJugNumber);
  return sorted.map((fn) => cardFromMediaFile(fn, MEDIA_BASE));
}

async function initDeckFromMedia() {
  disableAllActions(true);
  setStatus("Cargando cartas desde Media_cromo…");

  const files = await loadFilenames();
  deckCards = buildInitialDeckFromFiles(files);
  rebuildMapsFromDeck();
  renderDeck();
  deckCards = fisherYatesShuffle(deckCards);
  rebuildMapsFromDeck();
  renderDeck();
  clearSortUI();
  initTreeRootFromDeck();

  disableAllActions(false);
  setStatus(`${deckCards.length} cartas listas (revueltas). Usa QuickSort o Paso a paso.`);
}

function startNewGenerator({ manual }) {
  if (deckCards.length < 2) {
    setStatus("Se necesitan al menos 2 cartas.");
    return false;
  }

  if (!treeRootCallId) initTreeRootFromDeck();
  clearSortUI();
  rebuildMapsFromDeck();

  gen = quickSortCardEvents(deckCards.slice(), compareByValue, {
    manualPivot: isManualPivotMode(),
  });
  genDone = false;
  mode = manual ? "manual" : "auto";

  if (manual) {
    setStatus(
      isManualPivotMode()
        ? "Paso a paso + pivote manual: avanza y elige carta cuando corresponda."
        : "Paso a paso: cada clic avanza un paso."
    );
    disableAllActions(true);
    stepBtn.disabled = false;
  } else {
    setStatus(
      isManualPivotMode()
        ? "QuickSort: elige el pivote en cada subarreglo."
        : "QuickSort en curso…"
    );
    disableAllActions(true);
    stepBtn.disabled = true;
  }

  return true;
}

speedRange.addEventListener("input", () => {
  speedLabel.textContent = `${speedRange.value} ms`;
});

shuffleBtn.addEventListener("click", () => {
  if (isSortRunning() || pivotAnimating) return;
  shuffleDeck();
});

quickSortBtn.addEventListener("click", async () => {
  if (isSortRunning() || pivotAnimating) return;
  const ok = startNewGenerator({ manual: false });
  if (!ok) return;
  await runAutoFromCurrent();
});

stepBtn.addEventListener("click", async () => {
  if ((mode === "auto" && isSortRunning()) || pivotAnimating) return;

  if (!gen || genDone) {
    const ok = startNewGenerator({ manual: true });
    if (!ok) return;
  }

  disableAllActions(true);
  stepBtn.disabled = false;
  await advanceOneEvent();
  if (!genDone) stepBtn.disabled = false;
  else disableAllActions(false);
  refreshActionButtons();
});

speedLabel.textContent = `${speedRange.value} ms`;
initDeckFromMedia();
