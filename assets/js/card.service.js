// =============================================================
// CARD SERVICE — Capa Services
// -------------------------------------------------------------
// Única puerta de entrada a la colección `cards`. Genera
// cartones clásicos (5x5, columnas B-I-N-G-O, centro libre),
// garantizando que no se repitan dentro de un mismo bingo.
// =============================================================

import { db } from "../config/firebase-config.js";
import { COLLECTIONS, CARD_RANGES, CARD_COLUMNS } from "../config/constants.js";
import { generateId } from "../utils/format.utils.js";
import { logAuditEvent } from "./audit.service.js";
import {
  doc,
  setDoc,
  updateDoc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  arrayUnion,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Genera la matriz de números de un cartón clásico 5x5.
 * El centro (fila 2, columna N) queda libre (null).
 */
function generateCardNumbers() {
  const grid = [];
  CARD_COLUMNS.forEach((col, colIndex) => {
    const [min, max] = CARD_RANGES[col];
    const pool = [];
    for (let n = min; n <= max; n++) pool.push(n);
    shuffle(pool);
    const columnValues = pool.slice(0, 5);
    for (let row = 0; row < 5; row++) {
      if (!grid[row]) grid[row] = [];
      grid[row][colIndex] = col === "N" && row === 2 ? null : columnValues[row];
    }
  });
  return grid;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function hashGrid(grid) {
  return grid.map((row) => row.map((v) => (v === null ? "F" : v)).join(",")).join("|");
}

/**
 * Genera `quantity` cartones únicos para una compra aprobada.
 * @param {Object} params
 * @param {string} params.bingoId
 * @param {string} params.purchaseId
 * @param {string} params.ownerName
 * @param {string} params.ownerDni
 * @param {number} params.quantity
 * @returns {Promise<string[]>} IDs de los cartones creados
 */
export async function generateCardsForPurchase({ bingoId, purchaseId, ownerName, ownerDni, quantity }) {
  const bingoRef = doc(db, COLLECTIONS.BINGOS, bingoId);
  const bingoSnap = await getDoc(bingoRef);
  const existingHashes = new Set(bingoSnap.exists() ? bingoSnap.data().cardHashes || [] : []);

  const newCardIds = [];
  const newHashes = [];

  for (let i = 0; i < quantity; i++) {
    let grid;
    let hash;
    let attempts = 0;
    do {
      grid = generateCardNumbers();
      hash = hashGrid(grid);
      attempts++;
    } while ((existingHashes.has(hash) || newHashes.includes(hash)) && attempts < 50);

    newHashes.push(hash);
    existingHashes.add(hash);

    const cardId = generateId("card");
    const cardRef = doc(db, COLLECTIONS.CARDS, cardId);
    await setDoc(cardRef, {
      bingoId,
      purchaseId,
      ownerName,
      ownerDni,
      numbers: grid,
      markedIndexes: [[false, false, false, false, false], [false, false, false, false, false], [false, true, false, false, false], [false, false, false, false, false], [false, false, false, false, false]],
      claims: { terna: false, linea: false, bingo: false },
      createdAt: serverTimestamp()
    });
    newCardIds.push(cardId);
  }

  await updateDoc(bingoRef, { cardHashes: arrayUnion(...newHashes) });

  return newCardIds;
}

/**
 * Obtiene un cartón por ID (Sala del jugador).
 */
export async function getCardById(cardId) {
  if (!cardId) return null;
  const ref = doc(db, COLLECTIONS.CARDS, cardId);
  const snap = await getDoc(ref);
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Obtiene todos los cartones de una compra.
 */
export async function getCardsByPurchase(purchaseId) {
  const cardsRef = collection(db, COLLECTIONS.CARDS);
  const q = query(cardsRef, where("purchaseId", "==", purchaseId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Registra el reclamo de un premio hecho por el jugador desde la
 * Sala (botones Terna/Línea/Bingo). No declara ganador por sí
 * solo: queda auditado para que el organizador lo confirme
 * manualmente desde su panel.
 */
export async function claimPrize(cardId, winType) {
  const ref = doc(db, COLLECTIONS.CARDS, cardId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("El cartón no existe.");
  const card = snap.data();

  await updateDoc(ref, { [`claims.${winType}`]: true });

  await logAuditEvent({
    bingoId: card.bingoId,
    type: "claim_submitted",
    detail: `${card.ownerName} reclamó ${winType.toUpperCase()} con el cartón ${cardId}`,
    meta: { cardId, winType, ownerName: card.ownerName, ownerDni: card.ownerDni }
  });
}

/**
 * Cuenta los cartones vendidos de un bingo (Estadísticas).
 */
export async function countCardsByBingo(bingoId) {
  const cardsRef = collection(db, COLLECTIONS.CARDS);
  const q = query(cardsRef, where("bingoId", "==", bingoId));
  const snap = await getDocs(q);
  return snap.size;
}
