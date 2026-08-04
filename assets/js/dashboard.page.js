// =============================================================
// DASHBOARD PAGE (Organizador) — Capa UI
// =============================================================

import { onAuthChanged, logoutOrganizer } from "../../services/auth.service.js";
import { getBingosByOrganizer } from "../../services/bingo.service.js";
import { getPurchasesByBingo } from "../../services/purchase.service.js";
import { computeBingoStats } from "../../utils/stats.utils.js";
import { formatCurrency, formatDate } from "../../utils/format.utils.js";
import { showToast } from "../../ui/toast.ui.js";
import { BINGO_STATUS } from "../../config/constants.js";

const els = {
  loading: document.getElementById("loading-state"),
  empty: document.getElementById("empty-state"),
  grid: document.getElementById("bingo-grid"),
  userName: document.getElementById("user-name"),
  userInitial: document.getElementById("user-initial"),
  btnLogout: document.getElementById("btn-logout")
};

const STATUS_LABEL = {
  [BINGO_STATUS.DRAFT]: { text: "Borrador", cls: "badge-soon" },
  [BINGO_STATUS.PUBLISHED]: { text: "Publicado", cls: "badge-soon" },
  [BINGO_STATUS.LIVE]: { text: "En vivo", cls: "badge-live" },
  [BINGO_STATUS.FINISHED]: { text: "Finalizado", cls: "badge-closed" },
  [BINGO_STATUS.CANCELLED]: { text: "Cancelado", cls: "badge-closed" }
};

function showState(state) {
  els.loading.hidden = state !== "loading";
  els.empty.hidden = state !== "empty";
  els.grid.hidden = state !== "grid";
}

function renderBingoCard(bingo, stats) {
  const status = STATUS_LABEL[bingo.status] || STATUS_LABEL[BINGO_STATUS.PUBLISHED];
  const el = document.createElement("article");
  el.className = "paper-card bingo-card";
  el.innerHTML = `
    <div class="bingo-card__top">
      <h3>${escapeHtml(bingo.name)}</h3>
      <span class="badge ${status.cls}">${status.text}</span>
    </div>
    <p class="bingo-card__meta">${formatDate(bingo.eventDate)}</p>
    <div class="bingo-card__stats">
      <div>Vendidos<strong>${stats.soldCards}/${stats.totalCards}</strong></div>
      <div>Recaudado<strong>${formatCurrency(stats.revenue)}</strong></div>
      <div>Jugadores<strong>${stats.players}</strong></div>
    </div>
    <a class="btn btn-ghost btn-block" href="bingo.html?id=${encodeURIComponent(bingo.id)}">Gestionar bingo →</a>
  `;
  return el;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

async function loadBingos(uid) {
  showState("loading");
  const bingos = await getBingosByOrganizer(uid);

  if (bingos.length === 0) {
    showState("empty");
    return;
  }

  els.grid.innerHTML = "";

  const statsPromises = bingos.map(async (bingo) => {
    const purchases = await getPurchasesByBingo(bingo.id);
    return { bingo, stats: computeBingoStats(bingo, purchases) };
  });

  const results = await Promise.all(statsPromises);
  results.forEach(({ bingo, stats }) => {
    els.grid.appendChild(renderBingoCard(bingo, stats));
  });

  showState("grid");
}

function init() {
  els.btnLogout.addEventListener("click", async () => {
    await logoutOrganizer();
    window.location.href = "login.html";
  });

  onAuthChanged((user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    els.userName.textContent = user.displayName || user.email;
    els.userInitial.textContent = (user.displayName || user.email || "?").charAt(0).toUpperCase();

    loadBingos(user.uid).catch((err) => {
      console.error(err);
      showToast("No pudimos cargar tus bingos.", { type: "error" });
      showState("empty");
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
