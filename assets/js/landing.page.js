// =============================================================
// LANDING PAGE — Capa UI
// -------------------------------------------------------------
// Esta página NUNCA importa Firestore. Toda la data llega a
// través de bingo.service.js.
// =============================================================

import { subscribeToBingo, getAvailableCards } from "../services/bingo.service.js";
import { formatCurrency, formatDate, formatTime, getCountdownParts, pad2 } from "../utils/format.utils.js";
import { showToast } from "../ui/toast.ui.js";
import { BINGO_STATUS } from "../config/constants.js";

const els = {
  loading: document.getElementById("loading-state"),
  empty: document.getElementById("empty-state"),
  content: document.getElementById("bingo-content"),
  heroLogo: document.getElementById("hero-logo"),
  statusBadge: document.getElementById("status-badge"),
  name: document.getElementById("bingo-name"),
  desc: document.getElementById("bingo-desc"),
  fullDesc: document.getElementById("full-desc"),
  fullPrizes: document.getElementById("full-prizes"),
  metaDate: document.getElementById("meta-date"),
  metaTime: document.getElementById("meta-time"),
  metaPrice: document.getElementById("meta-price"),
  metaStock: document.getElementById("meta-stock"),
  buyPrice: document.getElementById("buy-price"),
  buyStock: document.getElementById("buy-stock"),
  buyTotal: document.getElementById("buy-total"),
  stockFill: document.getElementById("stock-fill"),
  ballCountdown: document.getElementById("ball-countdown"),
  cdDays: document.getElementById("cd-days"),
  cdHours: document.getElementById("cd-hours"),
  cdMin: document.getElementById("cd-min"),
  cdSec: document.getElementById("cd-sec"),
  ticker: document.getElementById("prize-ticker-track"),
  btnComprar: document.getElementById("btn-comprar")
};

let currentBingo = null;
let countdownInterval = null;
let tickerBuilt = false;

function getBingoIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("bingo");
}

function showState(state) {
  els.loading.hidden = state !== "loading";
  els.empty.hidden = state !== "empty";
  els.content.hidden = state !== "content";
}

function renderStatusBadge(bingo) {
  const parts = getCountdownParts(bingo.eventDate);
  if (bingo.status === BINGO_STATUS.LIVE) {
    els.statusBadge.className = "badge badge-live";
    els.statusBadge.textContent = "En vivo";
  } else if (bingo.status === BINGO_STATUS.FINISHED) {
    els.statusBadge.className = "badge badge-closed";
    els.statusBadge.textContent = "Finalizado";
  } else if (parts && parts.expired) {
    els.statusBadge.className = "badge badge-closed";
    els.statusBadge.textContent = "Cerrado";
  } else {
    els.statusBadge.className = "badge badge-soon";
    els.statusBadge.textContent = "Próximamente";
  }
}

function renderPrizeTicker(prizesText) {
  if (tickerBuilt || !prizesText) return;
  const lines = prizesText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return;

  const buildChips = () =>
    lines
      .map(
        (line, idx) => `
        <span class="prize-chip">
          <span class="prize-chip__num">${pad2(idx + 1)}</span>
          ${escapeHtml(line)}
        </span>`
      )
      .join("");

  // Se duplica el contenido para lograr un loop continuo del ticker.
  els.ticker.innerHTML = buildChips() + buildChips();
  tickerBuilt = true;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderBingo(bingo) {
  currentBingo = bingo;

  document.title = `${bingo.name} — BingoLive`;

  if (bingo.logoUrl) {
    els.heroLogo.src = bingo.logoUrl;
    els.heroLogo.hidden = false;
  }

  els.name.textContent = bingo.name;
  els.desc.textContent = bingo.description || "Un bingo online con sorteo en vivo.";
  els.fullDesc.textContent = bingo.description || "Este organizador todavía no agregó una descripción.";
  els.fullPrizes.textContent = bingo.prizes || "El organizador anunciará los premios próximamente.";

  els.metaDate.textContent = formatDate(bingo.eventDate);
  els.metaTime.textContent = formatTime(bingo.eventDate);
  els.metaPrice.textContent = formatCurrency(bingo.cardPrice);

  const available = getAvailableCards(bingo);
  const total = Number(bingo.totalCards) || 0;
  const pct = total > 0 ? Math.round((available / total) * 100) : 0;

  els.metaStock.textContent = available;
  els.buyPrice.textContent = formatCurrency(bingo.cardPrice);
  els.buyStock.textContent = available;
  els.buyTotal.textContent = total;
  els.stockFill.style.width = `${pct}%`;

  const soldOut = available <= 0;
  const notSellable = bingo.status === BINGO_STATUS.FINISHED || bingo.status === BINGO_STATUS.CANCELLED;
  els.btnComprar.disabled = soldOut || notSellable;
  els.btnComprar.textContent = soldOut
    ? "Cartones agotados"
    : notSellable
    ? "Venta cerrada"
    : "Comprar cartones";

  renderStatusBadge(bingo);
  renderPrizeTicker(bingo.prizes);
  startCountdown(bingo.eventDate);

  showState("content");
}

function startCountdown(eventDate) {
  clearInterval(countdownInterval);

  const tick = () => {
    const parts = getCountdownParts(eventDate);
    if (!parts || parts.expired) {
      els.ballCountdown.textContent = "¡Ya!";
      els.cdDays.textContent = els.cdHours.textContent = els.cdMin.textContent = els.cdSec.textContent = "00";
      clearInterval(countdownInterval);
      return;
    }
    els.ballCountdown.textContent = parts.days > 0 ? `${parts.days}d` : `${pad2(parts.hours)}:${pad2(parts.minutes)}`;
    els.cdDays.textContent = pad2(parts.days);
    els.cdHours.textContent = pad2(parts.hours);
    els.cdMin.textContent = pad2(parts.minutes);
    els.cdSec.textContent = pad2(parts.seconds);
  };

  tick();
  countdownInterval = setInterval(tick, 1000);
}

function goToPurchase() {
  if (!currentBingo) return;
  window.location.href = `pages/compra.html?bingo=${encodeURIComponent(currentBingo.id)}`;
}

function init() {
  const bingoId = getBingoIdFromUrl();

  if (!bingoId) {
    showState("empty");
    return;
  }

  showState("loading");

  subscribeToBingo(bingoId, (bingo) => {
    if (!bingo) {
      showState("empty");
      return;
    }
    renderBingo(bingo);
  });

  els.btnComprar.addEventListener("click", goToPurchase);
}

window.addEventListener("beforeunload", () => clearInterval(countdownInterval));

document.addEventListener("DOMContentLoaded", () => {
  try {
    init();
  } catch (err) {
    console.error(err);
    showToast("Ocurrió un error al cargar el bingo", { type: "error" });
    showState("empty");
  }
});
