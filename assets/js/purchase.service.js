// =============================================================
// PURCHASE SERVICE — Capa Services
// -------------------------------------------------------------
// Única puerta de entrada a la colección `purchases`. Cubre el
// ciclo: reserva → carga de comprobante → aprobación/rechazo.
// =============================================================

import { db } from "../config/firebase-config.js";
import { COLLECTIONS, PURCHASE_STATUS } from "../config/constants.js";
import { generateId } from "../utils/format.utils.js";
import { getBingoById, reserveCards } from "./bingo.service.js";
import { logAuditEvent } from "./audit.service.js";
import { generateCardsForPurchase } from "./card.service.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  onSnapshot,
  serverTimestamp,
  increment
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Crea una compra en estado "pending" y reserva los cartones
 * correspondientes en el bingo. Se llama desde la página de
 * Compra, antes de redirigir a Pago.
 *
 * @param {Object} params
 * @param {string} params.bingoId
 * @param {string} params.fullName
 * @param {string} params.dni
 * @param {number} params.quantity
 * @returns {Promise<{purchaseId:string, purchase:Object}>}
 */
export async function createPurchase({ bingoId, fullName, dni, quantity }) {
  const bingo = await getBingoById(bingoId);
  if (!bingo) throw new Error("El bingo no existe o fue eliminado.");

  const qty = Math.max(1, Number(quantity) || 1);
  const unitPrice = Number(bingo.cardPrice) || 0;
  const amount = qty * unitPrice;
  const purchaseId = generateId("purchase");

  const purchase = {
    bingoId,
    bingoName: bingo.name,
    organizerId: bingo.organizerId,
    fullName: fullName.trim(),
    dni: dni.trim(),
    quantity: qty,
    unitPrice,
    amount,
    receiptUrl: null,
    status: PURCHASE_STATUS.PENDING,
    cardIds: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  const ref = doc(db, COLLECTIONS.PURCHASES, purchaseId);
  await setDoc(ref, purchase);
  await reserveCards(bingoId, qty);
  await logAuditEvent({
    bingoId,
    type: "purchase_created",
    detail: `${fullName.trim()} reservó ${qty} cartón(es) por ${amount}`
  });

  return { purchaseId, purchase };
}

/**
 * Obtiene una compra por ID (usado en la página de Pago).
 */
export async function getPurchaseById(purchaseId) {
  if (!purchaseId) return null;
  const ref = doc(db, COLLECTIONS.PURCHASES, purchaseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

/**
 * Suscripción en tiempo real a una compra (para reflejar en
 * Pago el momento en que el organizador aprueba/rechaza).
 */
export function subscribeToPurchase(purchaseId, callback) {
  const ref = doc(db, COLLECTIONS.PURCHASES, purchaseId);
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

/**
 * Adjunta el comprobante subido a ImgBB y pasa la compra a
 * revisión por parte del organizador.
 */
export async function attachReceipt(purchaseId, { receiptUrl, fullName, dni }) {
  const ref = doc(db, COLLECTIONS.PURCHASES, purchaseId);
  await updateDoc(ref, {
    receiptUrl,
    fullName: fullName.trim(),
    dni: dni.trim(),
    status: PURCHASE_STATUS.REVIEW,
    updatedAt: serverTimestamp()
  });
}

/**
 * Lista las compras de un bingo (Panel del organizador →
 * Ver jugadores / Ver comprobantes).
 */
export async function getPurchasesByBingo(bingoId) {
  const purchasesRef = collection(db, COLLECTIONS.PURCHASES);
  const q = query(purchasesRef, where("bingoId", "==", bingoId), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Suscripción en tiempo real a todas las compras de un bingo
 * (usado en el panel del organizador).
 */
export function subscribeToBingoPurchases(bingoId, callback) {
  const purchasesRef = collection(db, COLLECTIONS.PURCHASES);
  const q = query(purchasesRef, where("bingoId", "==", bingoId), orderBy("createdAt", "desc"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/**
 * Aprueba un pago: genera los cartones únicos del jugador, pasa
 * el stock de "reservado" a "vendido" y marca la compra como
 * aprobada. Llamado desde el panel del organizador.
 */
export async function approvePurchase(purchaseId) {
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) throw new Error("La compra no existe.");
  if (purchase.status === PURCHASE_STATUS.APPROVED) return purchase;

  const cardIds = await generateCardsForPurchase({
    bingoId: purchase.bingoId,
    purchaseId,
    ownerName: purchase.fullName,
    ownerDni: purchase.dni,
    quantity: purchase.quantity
  });

  const purchaseRef = doc(db, COLLECTIONS.PURCHASES, purchaseId);
  await updateDoc(purchaseRef, {
    status: PURCHASE_STATUS.APPROVED,
    cardIds,
    updatedAt: serverTimestamp()
  });

  const bingoRef = doc(db, COLLECTIONS.BINGOS, purchase.bingoId);
  await updateDoc(bingoRef, {
    soldCards: increment(purchase.quantity),
    reservedCards: increment(-purchase.quantity),
    updatedAt: serverTimestamp()
  });

  await logAuditEvent({
    bingoId: purchase.bingoId,
    type: "payment_approved",
    detail: `Pago aprobado de ${purchase.fullName} (${purchase.quantity} cartón/es)`
  });

  return { ...purchase, status: PURCHASE_STATUS.APPROVED, cardIds };
}

/**
 * Rechaza un pago: libera el stock reservado y marca la compra
 * como rechazada. No genera cartones.
 */
export async function rejectPurchase(purchaseId, reason = "") {
  const purchase = await getPurchaseById(purchaseId);
  if (!purchase) throw new Error("La compra no existe.");
  if (purchase.status === PURCHASE_STATUS.REJECTED) return purchase;

  const purchaseRef = doc(db, COLLECTIONS.PURCHASES, purchaseId);
  await updateDoc(purchaseRef, {
    status: PURCHASE_STATUS.REJECTED,
    rejectionReason: reason,
    updatedAt: serverTimestamp()
  });

  const bingoRef = doc(db, COLLECTIONS.BINGOS, purchase.bingoId);
  await updateDoc(bingoRef, {
    reservedCards: increment(-purchase.quantity),
    updatedAt: serverTimestamp()
  });

  await logAuditEvent({
    bingoId: purchase.bingoId,
    type: "payment_rejected",
    detail: `Pago rechazado de ${purchase.fullName}${reason ? `: ${reason}` : ""}`
  });

  return { ...purchase, status: PURCHASE_STATUS.REJECTED };
}
