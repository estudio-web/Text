// =============================================================
// CONSTANTES DE DOMINIO
// -------------------------------------------------------------
// Nombres de colecciones y enums compartidos por todos los
// Services. Cambiar un nombre de colección se hace UNA sola vez
// acá y se propaga a todo el sistema.
// =============================================================

export const COLLECTIONS = Object.freeze({
  BINGOS: "bingos",
  CARDS: "cards",
  PURCHASES: "purchases",
  DRAWS: "draws",
  ORGANIZERS: "organizers",
  AUDIT: "audit_log"
});

export const BINGO_STATUS = Object.freeze({
  DRAFT: "draft",
  PUBLISHED: "published",
  LIVE: "live",
  FINISHED: "finished",
  CANCELLED: "cancelled"
});

export const PURCHASE_STATUS = Object.freeze({
  PENDING: "pending", // esperando comprobante
  REVIEW: "review", // comprobante subido, esperando aprobación
  APPROVED: "approved",
  REJECTED: "rejected"
});

export const WIN_TYPE = Object.freeze({
  TERNA: "terna",
  LINEA: "linea",
  BINGO: "bingo"
});

export const CARD_COLUMNS = Object.freeze(["B", "I", "N", "G", "O"]);

// Rangos numéricos clásicos por columna (formato 75 bolillas)
export const CARD_RANGES = Object.freeze({
  B: [1, 15],
  I: [16, 30],
  N: [31, 45],
  G: [46, 60],
  O: [61, 75]
});

export const TOTAL_BALLS = 75;
