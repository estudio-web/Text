// =============================================================
// BINGO DETALLE PAGE (Organizador) — Capa UI
// -------------------------------------------------------------
// Combina: Resumen/Estadísticas, control del Motor del bingo,
// revisión de Comprobantes, listado de Jugadores y Edición.
// Cada acción del panel (crear, editar, ver jugadores, ver
// comprobantes, aprobar, rechazar, iniciar, sacar bolillas,
// finalizar) está implementada de punta a punta.
// =============================================================

import { onAuthChanged, logoutOrganizer } from "../../services/auth.service.js";
import { subscribeToBingo, updateBingo } from "../../services/bingo.service.js";
import {
  subscribeToBingoPurchases,
  approvePurchase,
  rejectPurchase
} from "../../services/purchase.service.js";
import { startBingo, drawNextBall, finishBingo, declareWinner, getBallLetter } from "../../services/draw.service.js";
import { computeBingoStats } from "../../utils/stats.utils.js";
import { formatCurrency, formatDate, formatDateTimeLocalInput } from "../../utils/format.utils.js";
import { showToast } from "../../ui/toast.ui.js";
import { BINGO_STATUS, PURCHASE_STATUS } from "../../config/constants.js";

const els = {
  loading: document.getElementById("loading-state"),
  empty: document.getElementById("empty-state"),
  detail: document.getElementById("bingo-detail"),
  userName: document.getElementById("user-name"),
  userInitial: document.getElementById("user-initial"),
  btnLogout: document.getElementById("btn-logout"),

  status: document.getElementById("detail-status"),
  name: document.getElementById("detail-name"),
  shareLink: document.getElementById("detail-share-link"),
  btnCopyLink: document.getElementById("btn-copy-link"),
  btnVerLanding: document.getElementById("btn-ver-landing"),

  statSold: document.getElementById("stat-sold"),
  statAvailable: document.getElementById("stat-available"),
  statRevenue: document.getElementById("stat-revenue"),
  statPlayers: document.getElementById("stat-players"),
  badgeReview: document.getElementById("badge-review"),

  tabs: document.querySelectorAll(".org-tab"),
  panels: document.querySelectorAll(".tab-panel"),

  drawCurrentBall: document.getElementById("draw-current-ball"),
  drawCountLabel: document.getElementById("draw-count-label"),
  drawStatusText: document.getElementById("draw-status-text"),
  btnStartBingo: document.getElementById("btn-start-bingo"),
  btnDrawBall: document.getElementById("btn-draw-ball"),
  btnFinishBingo: document.getElementById("btn-finish-bingo"),
  drawHistory: document.getElementById("draw-history"),

  winnerName: document.getElementById("winner-name"),
  winnerDni: document.getElementById("winner-dni"),
  winnerType: document.getElementById("winner-type"),
  btnDeclareWinner: document.getElementById("btn-declare-winner"),
  winnersSummary: document.getElementById("winners-summary"),

  receiptsBody: document.getElementById("receipts-table-body"),
  receiptsEmpty: document.getElementById("receipts-empty"),
  playersBody: document.getElementById("players-table-body"),
  playersEmpty: document.getElementById("players-empty"),

  editForm: document.getElementById("edit-form"),
  btnSaveEdit: document.getElementById("btn-save-edit"),
  eName: document.getElementById("e-name"),
  eDescription: document.getElementById("e-description"),
  ePrizes: document.getElementById("e-prizes"),
  eDate: document.getElementById("e-date"),
  eYoutube: document.getElementById("e-youtube"),
  ePrice: document.getElementById("e-price"),
  eTotal: document.getElementById("e-total"),
  eLogo: document.getElementById("e-logo"),
  eOrganizerName: document.getElementById("e-organizer-name"),
  eAlias: document.getElementById("e-alias"),
  eCbu: document.getElementById("e-cbu")
};

let currentUser = null;
let currentBingo = null;
let currentPurchases = [];
let editFormInitialized = false;

function getBingoIdFromUrl() {
  return new URLSearchParams(window.location.search).get("id");
}

function showState(state) {
  els.loading.hidden = state !== "loading";
  els.empty.hidden = state !== "empty";
  els.detail.hidden = state !== "detail";
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------------- Tabs ----------------
function setupTabs() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      els.tabs.forEach((t) => t.classList.remove("is-active"));
      els.panels.forEach((p) => p.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("is-active");
    });
  });
}

// ---------------- Resumen ----------------
const STATUS_LABEL = {
  [BINGO_STATUS.DRAFT]: { text: "Borrador", cls: "badge-soon" },
  [BINGO_STATUS.PUBLISHED]: { text: "Publicado", cls: "badge-soon" },
  [BINGO_STATUS.LIVE]: { text: "En vivo", cls: "badge-live" },
  [BINGO_STATUS.FINISHED]: { text: "Finalizado", cls: "badge-closed" },
  [BINGO_STATUS.CANCELLED]: { text: "Cancelado", cls: "badge-closed" }
};

function renderHeader(bingo) {
  const status = STATUS_LABEL[bingo.status] || STATUS_LABEL[BINGO_STATUS.PUBLISHED];
  els.status.className = `badge ${status.cls}`;
  els.status.textContent = status.text;
  els.name.textContent = bingo.name;

  const basePath = window.location.pathname.replace("pages/organizador/bingo.html", "");
  const shareUrl = `${window.location.origin}${basePath}index.html?bingo=${bingo.id}`;
  els.shareLink.textContent = shareUrl;
  els.btnVerLanding.href = shareUrl;
}

function renderStats(bingo, purchases) {
  const stats = computeBingoStats(bingo, purchases);
  els.statSold.textContent = stats.soldCards;
  els.statAvailable.textContent = stats.availableCards;
  els.statRevenue.textContent = formatCurrency(stats.revenue);
  els.statPlayers.textContent = stats.players;
  els.badgeReview.textContent = stats.pendingReview > 0 ? `(${stats.pendingReview})` : "";
}

// ---------------- Sorteo ----------------
function renderDraw(bingo) {
  const calledBalls = bingo.calledBalls || [];
  const isLive = bingo.status === BINGO_STATUS.LIVE;
  const isFinished = bingo.status === BINGO_STATUS.FINISHED;

  els.drawCurrentBall.textContent = bingo.currentBall ? `${getBallLetter(bingo.currentBall)}${bingo.currentBall}` : "--";
  els.drawCountLabel.textContent = `${calledBalls.length} de 75 bolillas cantadas`;

  els.btnStartBingo.hidden = isLive || isFinished;
  els.btnDrawBall.hidden = !isLive;
  els.btnFinishBingo.hidden = !isLive;
  els.btnDrawBall.disabled = calledBalls.length >= 75;

  if (isFinished) {
    els.drawStatusText.textContent = "Este bingo ya finalizó.";
  } else if (isLive) {
    els.drawStatusText.textContent = "El bingo está en vivo. Sacá bolillas cuando quieras.";
  } else {
    els.drawStatusText.textContent = "El bingo todavía no comenzó. Iniciá para habilitar la sala de jugadores.";
  }

  els.drawHistory.innerHTML = [...calledBalls]
    .sort((a, b) => b - a)
    .map((n) => `<span class="draw-chip">${getBallLetter(n)}${n}</span>`)
    .join("");

  renderWinners(bingo);
}

function renderWinners(bingo) {
  const winners = bingo.winners || { terna: [], linea: [], bingo: [] };
  const sections = ["terna", "linea", "bingo"]
    .map((type) => {
      const list = winners[type] || [];
      if (list.length === 0) return "";
      const items = list
        .map((w) => `<li>${escapeHtml(w.ownerName)} — DNI ${escapeHtml(w.ownerDni)}</li>`)
        .join("");
      return `<p style="font-weight:600; margin-top:10px; text-transform:capitalize;">${type}</p><ul style="margin:4px 0 0 18px; color:#4a4636;">${items}</ul>`;
    })
    .join("");
  els.winnersSummary.innerHTML = sections || "<p style='color:#6b664f;'>Todavía no hay ganadores registrados.</p>";
}

async function handleStartBingo() {
  els.btnStartBingo.disabled = true;
  try {
    await startBingo(currentBingo.id);
    showToast("¡Bingo iniciado! La sala de jugadores ya está habilitada.");
  } catch (err) {
    console.error(err);
    showToast("No pudimos iniciar el bingo.", { type: "error" });
  } finally {
    els.btnStartBingo.disabled = false;
  }
}

async function handleDrawBall() {
  els.btnDrawBall.disabled = true;
  try {
    const ball = await drawNextBall(currentBingo);
    if (ball === null) {
      showToast("Ya se cantaron las 75 bolillas.", { type: "error" });
    }
  } catch (err) {
    console.error(err);
    showToast("No pudimos sortear la bolilla.", { type: "error" });
  } finally {
    els.btnDrawBall.disabled = false;
  }
}

async function handleFinishBingo() {
  if (!confirm("¿Seguro que querés finalizar este bingo? No se podrán cantar más bolillas.")) return;
  els.btnFinishBingo.disabled = true;
  try {
    await finishBingo(currentBingo.id);
    showToast("Bingo finalizado.");
  } catch (err) {
    console.error(err);
    showToast("No pudimos finalizar el bingo.", { type: "error" });
  } finally {
    els.btnFinishBingo.disabled = false;
  }
}

async function handleDeclareWinner() {
  const ownerName = els.winnerName.value.trim();
  const ownerDni = els.winnerDni.value.trim();
  const winType = els.winnerType.value;

  if (ownerName.length < 3 || ownerDni.length < 6) {
    showToast("Completá nombre y DNI del ganador.", { type: "error" });
    return;
  }

  els.btnDeclareWinner.disabled = true;
  try {
    await declareWinner(currentBingo.id, winType, { ownerName, ownerDni, declaredAt: new Date().toISOString() });
    showToast("¡Ganador registrado!");
    els.winnerName.value = "";
    els.winnerDni.value = "";
  } catch (err) {
    console.error(err);
    showToast("No pudimos registrar el ganador.", { type: "error" });
  } finally {
    els.btnDeclareWinner.disabled = false;
  }
}

// ---------------- Comprobantes ----------------
function renderReceipts(purchases) {
  const pending = purchases.filter(
    (p) => p.status === PURCHASE_STATUS.PENDING || p.status === PURCHASE_STATUS.REVIEW
  );

  els.receiptsEmpty.hidden = pending.length > 0;
  els.receiptsBody.innerHTML = pending
    .map((p) => {
      const statusCls = p.status === PURCHASE_STATUS.REVIEW ? "review" : "pending";
      const statusText = p.status === PURCHASE_STATUS.REVIEW ? "A revisar" : "Esperando comprobante";
      const receiptCell = p.receiptUrl
        ? `<a class="link-receipt" href="${p.receiptUrl}" target="_blank" rel="noopener">Ver imagen</a>`
        : "—";
      const actions =
        p.status === PURCHASE_STATUS.REVIEW
          ? `<button class="btn btn-primary btn-small" data-action="approve" data-id="${p.id}">Aprobar</button>
             <button class="btn btn-danger btn-small" data-action="reject" data-id="${p.id}">Rechazar</button>`
          : `<span style="color:#6b664f; font-size:0.82rem;">Sin acción</span>`;

      return `
        <tr>
          <td>${escapeHtml(p.fullName)}</td>
          <td class="mono">${escapeHtml(p.dni)}</td>
          <td>${p.quantity}</td>
          <td class="mono">${formatCurrency(p.amount)}</td>
          <td>${receiptCell}</td>
          <td><span class="status-pill ${statusCls}">${statusText}</span></td>
          <td class="table-actions">${actions}</td>
        </tr>`;
    })
    .join("");

  els.receiptsBody.querySelectorAll("[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => handleReceiptAction(btn.dataset.action, btn.dataset.id));
  });
}

async function handleReceiptAction(action, purchaseId) {
  if (action === "reject") {
    const reason = prompt("Motivo del rechazo (opcional):") || "";
    try {
      await rejectPurchase(purchaseId, reason);
      showToast("Pago rechazado. El stock fue liberado.");
    } catch (err) {
      console.error(err);
      showToast("No pudimos rechazar el pago.", { type: "error" });
    }
    return;
  }

  try {
    await approvePurchase(purchaseId);
    showToast("Pago aprobado. Se generaron los cartones del jugador.");
  } catch (err) {
    console.error(err);
    showToast("No pudimos aprobar el pago.", { type: "error" });
  }
}

// ---------------- Jugadores ----------------
function renderPlayers(purchases) {
  const approved = purchases.filter((p) => p.status === PURCHASE_STATUS.APPROVED);
  els.playersEmpty.hidden = approved.length > 0;
  els.playersBody.innerHTML = approved
    .map(
      (p) => `
      <tr>
        <td>${escapeHtml(p.fullName)}</td>
        <td class="mono">${escapeHtml(p.dni)}</td>
        <td>${p.quantity}</td>
        <td class="mono">${formatCurrency(p.amount)}</td>
        <td>${formatDate(p.createdAt)}</td>
      </tr>`
    )
    .join("");
}

// ---------------- Editar ----------------
function fillEditForm(bingo) {
  if (editFormInitialized) return; // no pisar lo que el organizador está tipeando
  els.eName.value = bingo.name || "";
  els.eDescription.value = bingo.description || "";
  els.ePrizes.value = bingo.prizes || "";
  els.eDate.value = formatDateTimeLocalInput(bingo.eventDate);
  els.eYoutube.value = bingo.youtubeUrl || "";
  els.ePrice.value = bingo.cardPrice || 0;
  els.eTotal.value = bingo.totalCards || 0;
  els.eLogo.value = bingo.logoUrl || "";
  els.eOrganizerName.value = bingo.organizerName || "";
  els.eAlias.value = bingo.alias || "";
  els.eCbu.value = bingo.cbu || "";
  editFormInitialized = true;
}

async function handleEditSubmit(event) {
  event.preventDefault();
  if (!currentBingo) return;

  els.btnSaveEdit.disabled = true;
  els.btnSaveEdit.textContent = "Guardando...";

  try {
    await updateBingo(currentBingo.id, {
      name: els.eName.value.trim(),
      description: els.eDescription.value.trim(),
      prizes: els.ePrizes.value.trim(),
      eventDate: new Date(els.eDate.value).toISOString(),
      youtubeUrl: els.eYoutube.value.trim(),
      cardPrice: Number(els.ePrice.value),
      totalCards: Number(els.eTotal.value),
      logoUrl: els.eLogo.value.trim(),
      organizerName: els.eOrganizerName.value.trim(),
      alias: els.eAlias.value.trim(),
      cbu: els.eCbu.value.trim()
    });
    showToast("Cambios guardados.");
  } catch (err) {
    console.error(err);
    showToast("No pudimos guardar los cambios.", { type: "error" });
  } finally {
    els.btnSaveEdit.disabled = false;
    els.btnSaveEdit.textContent = "Guardar cambios";
  }
}

// ---------------- Init ----------------
function renderAll(bingo, purchases) {
  currentBingo = bingo;
  currentPurchases = purchases;
  renderHeader(bingo);
  renderStats(bingo, purchases);
  renderDraw(bingo);
  renderReceipts(purchases);
  renderPlayers(purchases);
  fillEditForm(bingo);
  showState("detail");
}

function init() {
  const bingoId = getBingoIdFromUrl();
  if (!bingoId) {
    showState("empty");
    return;
  }

  showState("loading");

  els.btnLogout.addEventListener("click", async () => {
    await logoutOrganizer();
    window.location.href = "login.html";
  });

  setupTabs();

  els.btnCopyLink.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(els.shareLink.textContent);
      showToast("Enlace copiado.");
    } catch {
      showToast("No pudimos copiar el enlace.", { type: "error" });
    }
  });

  els.btnStartBingo.addEventListener("click", handleStartBingo);
  els.btnDrawBall.addEventListener("click", handleDrawBall);
  els.btnFinishBingo.addEventListener("click", handleFinishBingo);
  els.btnDeclareWinner.addEventListener("click", handleDeclareWinner);
  els.editForm.addEventListener("submit", handleEditSubmit);

  onAuthChanged((user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    currentUser = user;
    els.userName.textContent = user.displayName || user.email;
    els.userInitial.textContent = (user.displayName || user.email || "?").charAt(0).toUpperCase();

    let purchasesUnsub = null;
    let lastBingo = null;

    subscribeToBingo(bingoId, (bingo) => {
      if (!bingo || bingo.organizerId !== currentUser.uid) {
        showState("empty");
        return;
      }

      lastBingo = bingo;

      if (!purchasesUnsub) {
        purchasesUnsub = subscribeToBingoPurchases(bingoId, (purchases) => {
          renderAll(lastBingo, purchases);
        });
      } else {
        renderAll(lastBingo, currentPurchases);
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
