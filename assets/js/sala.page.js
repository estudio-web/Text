// =============================================================
// SALA PAGE — Capa UI
// -------------------------------------------------------------
// Sin acceso directo a Firestore: usa purchase.service,
// bingo.service y card.service exclusivamente.
// =============================================================

import { getPurchaseById } from "../services/purchase.service.js";
import { getBingoById, subscribeToBingo } from "../services/bingo.service.js";
import { getCardsByPurchase, claimPrize } from "../services/card.service.js";
import { showToast } from "../ui/toast.ui.js";
import { BINGO_STATUS, PURCHASE_STATUS, CARD_COLUMNS } from "../config/constants.js";

const els = {
  loading: document.getElementById("loading-state"),
  empty: document.getElementById("empty-state"),
  content: document.getElementById("sala-content"),
  headerStatus: document.getElementById("header-status"),
  bingoName: document.getElementById("sala-bingo-name"),
  waitingBanner: document.getElementById("waiting-banner"),
  finishedBanner: document.getElementById("finished-banner"),
  videoWrap: document.getElementById("video-wrap"),
  currentBallValue: document.getElementById("current-ball-value"),
  historyTrack: document.getElementById("history-track"),
  cardSwitcher: document.getElementById("card-switcher"),
  bingoGrid: document.getElementById("bingo-grid"),
  cardOwnerInfo: document.getElementById("card-owner-info"),
  claimButtons: {
    terna: document.getElementById("btn-claim-terna"),
    linea: document.getElementById("btn-claim-linea"),
    bingo: document.getElementById("btn-claim-bingo")
  }
};

let cards = [];
let activeCardIndex = 0;
let currentBingo = null;
let videoRendered = false;

function getPurchaseIdFromUrl() {
  return new URLSearchParams(window.location.search).get("purchase");
}

function showState(state) {
  els.loading.hidden = state !== "loading";
  els.empty.hidden = state !== "empty";
  els.content.hidden = state !== "content";
}

function getBallLetter(number) {
  return CARD_COLUMNS.find((col, idx) => {
    const ranges = [[1, 15], [16, 30], [31, 45], [46, 60], [61, 75]];
    return number >= ranges[idx][0] && number <= ranges[idx][1];
  });
}

function extractYoutubeId(url) {
  if (!url) return null;
  const patterns = [/youtu\.be\/([\w-]{6,})/, /v=([\w-]{6,})/, /embed\/([\w-]{6,})/, /live\/([\w-]{6,})/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function renderVideo(bingo) {
  if (videoRendered) return;
  const videoId = extractYoutubeId(bingo.youtubeUrl);
  if (!videoId) return;
  els.videoWrap.innerHTML = `<iframe src="https://www.youtube.com/embed/${videoId}?autoplay=0" title="Transmisión en vivo del bingo" allow="autoplay; encrypted-media" allowfullscreen></iframe>`;
  videoRendered = true;
}

function renderHeaderStatus(bingo) {
  els.bingoName.textContent = bingo.name;
  document.title = `Sala — ${bingo.name}`;

  if (bingo.status === BINGO_STATUS.LIVE) {
    els.headerStatus.className = "badge badge-live";
    els.headerStatus.textContent = "En vivo";
    els.waitingBanner.hidden = true;
    els.finishedBanner.hidden = true;
  } else if (bingo.status === BINGO_STATUS.FINISHED) {
    els.headerStatus.className = "badge badge-closed";
    els.headerStatus.textContent = "Finalizado";
    els.waitingBanner.hidden = true;
    els.finishedBanner.hidden = false;
  } else {
    els.headerStatus.className = "badge badge-soon";
    els.headerStatus.textContent = "Esperando inicio";
    els.waitingBanner.hidden = false;
    els.finishedBanner.hidden = true;
  }
}

function renderBallState(bingo) {
  const calledBalls = bingo.calledBalls || [];
  els.currentBallValue.textContent = bingo.currentBall ? `${getBallLetter(bingo.currentBall)}${bingo.currentBall}` : "--";

  const sorted = [...calledBalls].sort((a, b) => b - a);
  els.historyTrack.innerHTML = sorted
    .map((n, idx) => `<span class="history-chip ${idx === 0 ? "is-recent" : ""}">${getBallLetter(n)}${n}</span>`)
    .join("");
}

function renderCardSwitcher() {
  if (cards.length <= 1) {
    els.cardSwitcher.hidden = true;
    return;
  }
  els.cardSwitcher.hidden = false;
  els.cardSwitcher.innerHTML = cards
    .map((_, idx) => `<button data-idx="${idx}" class="${idx === activeCardIndex ? "is-active" : ""}">Cartón ${idx + 1}</button>`)
    .join("");
  els.cardSwitcher.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCardIndex = Number(btn.dataset.idx);
      renderActiveCard();
    });
  });
}

function isCellMarked(value, calledSet) {
  return value === null || calledSet.has(value);
}

function renderActiveCard() {
  const card = cards[activeCardIndex];
  if (!card || !currentBingo) return;

  const calledSet = new Set(currentBingo.calledBalls || []);

  els.bingoGrid.innerHTML = card.numbers
    .map((row) =>
      row
        .map((value) => {
          const marked = isCellMarked(value, calledSet);
          const isFree = value === null;
          return `<div class="bingo-cell ${marked ? "is-marked" : ""} ${isFree ? "is-free" : ""}">${isFree ? "Libre" : value}</div>`;
        })
        .join("")
    )
    .join("");

  els.cardOwnerInfo.textContent = `${card.ownerName} · DNI ${card.ownerDni}`;

  renderCardSwitcher();
  renderClaimButtons(card, calledSet);
}

function checkWinCondition(card, calledSet, type) {
  const grid = card.numbers;
  const markedGrid = grid.map((row) => row.map((v) => isCellMarked(v, calledSet)));

  if (type === "linea") {
    return markedGrid.some((row) => row.every(Boolean));
  }
  if (type === "terna") {
    return markedGrid.some((row) => row.filter(Boolean).length >= 3);
  }
  if (type === "bingo") {
    return markedGrid.every((row) => row.every(Boolean));
  }
  return false;
}

function renderClaimButtons(card, calledSet) {
  ["terna", "linea", "bingo"].forEach((type) => {
    const btn = els.claimButtons[type];
    const alreadyClaimed = card.claims?.[type];
    btn.classList.toggle("is-claimed", Boolean(alreadyClaimed));
    btn.textContent = alreadyClaimed
      ? `${labelFor(type)} ✓ enviado`
      : labelFor(type);
    btn.disabled = Boolean(alreadyClaimed) || currentBingo.status !== BINGO_STATUS.LIVE;
  });
}

function labelFor(type) {
  return { terna: "Terna", linea: "Línea", bingo: "¡Bingo!" }[type];
}

async function handleClaim(type) {
  const card = cards[activeCardIndex];
  if (!card || !currentBingo) return;

  const calledSet = new Set(currentBingo.calledBalls || []);
  if (!checkWinCondition(card, calledSet, type)) {
    showToast("Todavía no completaste esta jugada con las bolillas cantadas.", { type: "error" });
    return;
  }

  try {
    await claimPrize(card.id, type);
    card.claims = { ...(card.claims || {}), [type]: true };
    showToast("¡Reclamo enviado! El organizador lo va a validar en vivo.");
    renderActiveCard();
  } catch (err) {
    console.error(err);
    showToast("No pudimos enviar tu reclamo. Probá de nuevo.", { type: "error" });
  }
}

async function init() {
  const purchaseId = getPurchaseIdFromUrl();
  if (!purchaseId) {
    showState("empty");
    return;
  }

  showState("loading");

  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) {
    showState("empty");
    return;
  }

  if (purchase.status !== PURCHASE_STATUS.APPROVED) {
    els.empty.querySelector("h2").textContent = "Tu pago todavía no fue aprobado";
    els.empty.querySelector("p").textContent =
      "En cuanto el organizador confirme tu comprobante vas a poder entrar a la sala de juego.";
    showState("empty");
    return;
  }

  const bingo = await getBingoById(purchase.bingoId);
  if (!bingo) {
    showState("empty");
    return;
  }

  cards = await getCardsByPurchase(purchaseId);
  if (cards.length === 0) {
    showState("empty");
    return;
  }

  Object.entries(els.claimButtons).forEach(([type, btn]) => {
    btn.addEventListener("click", () => handleClaim(type));
  });

  subscribeToBingo(bingo.id, (updatedBingo) => {
    if (!updatedBingo) return;
    currentBingo = updatedBingo;
    renderHeaderStatus(updatedBingo);
    renderVideo(updatedBingo);
    renderBallState(updatedBingo);
    renderActiveCard();
    showState("content");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  init().catch((err) => {
    console.error(err);
    showToast("Ocurrió un error al cargar la sala.", { type: "error" });
    showState("empty");
  });
});
