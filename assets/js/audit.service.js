// =============================================================
// AUDIT SERVICE — Capa Services
// -------------------------------------------------------------
// Registro de eventos relevantes (compras, comprobantes,
// bolillas cantadas, ganadores) para trazabilidad. Colección
// de solo-inserción: nunca se edita ni se borra desde la UI.
// =============================================================

import { db } from "../config/firebase-config.js";
import { COLLECTIONS } from "../config/constants.js";
import { generateId } from "../utils/format.utils.js";
import {
  doc,
  setDoc,
  collection,
  query,
  where,
  orderBy,
  limit as fsLimit,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * @param {Object} event
 * @param {string} event.bingoId
 * @param {string} event.type  purchase_created | receipt_uploaded | payment_approved | payment_rejected | ball_drawn | winner_declared | bingo_started | bingo_finished
 * @param {string} [event.detail]
 * @param {Object} [event.meta]
 */
export async function logAuditEvent({ bingoId, type, detail = "", meta = {} }) {
  try {
    const id = generateId("log");
    const ref = doc(db, COLLECTIONS.AUDIT, id);
    await setDoc(ref, {
      bingoId,
      type,
      detail,
      meta,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    // La auditoría nunca debe interrumpir el flujo principal del usuario.
    console.warn("No se pudo registrar el evento de auditoría:", err);
  }
}

/**
 * Devuelve el historial de auditoría de un bingo, más reciente primero.
 */
export async function getAuditLog(bingoId, max = 100) {
  const auditRef = collection(db, COLLECTIONS.AUDIT);
  const q = query(
    auditRef,
    where("bingoId", "==", bingoId),
    orderBy("createdAt", "desc"),
    fsLimit(max)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
