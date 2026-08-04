// =============================================================
// DRAW SERVICE — Capa Services (Motor del bingo)
// -------------------------------------------------------------
// Controla el sorteo de bolillas sobre el propio documento del
// bingo (calledBalls, currentBall). Firestore onSnapshot se
// encarga de propagar cada bolilla en tiempo real tanto al
// panel del organizador como a la sala del jugador.
// =============================================================

import { db } from "../config/firebase-config.js";
import { COLLECTIONS, BINGO_STATUS, TOTAL_BALLS, CARD_RANGES } from "../config/constants.js";
import { logAuditEvent } from "./audit.service.js";
import {
  doc,
  updateDoc,
  arrayUnion,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/**
 * Convierte un número de bolilla (1-75) a su letra de columna clásica.
 */
export function getBallLetter(number) {
  const entry = Object.entries(CARD_RANGES).find(([, [min, max]] = []) => number >= min && number <= max);
  return entry ? entry[0] : "";
}

/**
 * Pone el bingo en vivo (habilita la sala del jugador y el sorteo).
 */
export async function startBingo(bingoId) {
  const ref = doc(db, COLLECTIONS.BINGOS, bingoId);
  await updateDoc(ref, { status: BINGO_STATUS.LIVE, updatedAt: serverTimestamp() });
  await logAuditEvent({ bingoId, type: "bingo_started", detail: "El organizador inició el bingo." });
}

/**
 * Sortea la siguiente bolilla sin repetir números ya cantados.
 * @param {Object} bingo  documento actual del bingo (con calledBalls)
 * @returns {Promise<number|null>} la bolilla sorteada, o null si ya se cantaron las 75
 */
export async function drawNextBall(bingo) {
  const called = new Set(bingo.calledBalls || []);
  if (called.size >= TOTAL_BALLS) return null;

  let ball;
  do {
    ball = Math.floor(Math.random() * TOTAL_BALLS) + 1;
  } while (called.has(ball));

  const ref = doc(db, COLLECTIONS.BINGOS, bingo.id);
  await updateDoc(ref, {
    calledBalls: arrayUnion(ball),
    currentBall: ball,
    updatedAt: serverTimestamp()
  });

  await logAuditEvent({
    bingoId: bingo.id,
    type: "ball_drawn",
    detail: `Se cantó la bolilla ${getBallLetter(ball)}-${ball}`,
    meta: { ball }
  });

  return ball;
}

/**
 * Registra un ganador declarado por el organizador (terna, línea o bingo).
 */
export async function declareWinner(bingoId, winType, winnerInfo) {
  const ref = doc(db, COLLECTIONS.BINGOS, bingoId);
  await updateDoc(ref, {
    [`winners.${winType}`]: arrayUnion(winnerInfo),
    updatedAt: serverTimestamp()
  });
  await logAuditEvent({
    bingoId,
    type: "winner_declared",
    detail: `${winnerInfo.ownerName} ganó ${winType.toUpperCase()}`,
    meta: winnerInfo
  });
}

/**
 * Finaliza el bingo: no se pueden cantar más bolillas ni comprar cartones.
 */
export async function finishBingo(bingoId) {
  const ref = doc(db, COLLECTIONS.BINGOS, bingoId);
  await updateDoc(ref, { status: BINGO_STATUS.FINISHED, updatedAt: serverTimestamp() });
  await logAuditEvent({ bingoId, type: "bingo_finished", detail: "El organizador finalizó el bingo." });
}
