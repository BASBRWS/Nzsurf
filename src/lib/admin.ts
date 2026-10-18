/**
 * Wie admin is in de app. Houd dit gelijk met isAdmin() in firestore.rules —
 * de regels bepalen wat er echt mag; deze lijst alleen wat de app laat zien.
 */
export const OWNER_EMAILS = ['sebastiaan.boom@gmail.com', 'sebastiaan.boom2@gmail.com'];
export const ADMIN_EMAILS = [...OWNER_EMAILS, 'fietsventieltje@gmail.com'];

export const isAdminEmail = (email?: string | null) => !!email && ADMIN_EMAILS.includes(email.toLowerCase());
/** Eigenaar: krijgt daarnaast de dagelijkse vraag om Surfline/surfnerd op te halen. */
export const isOwnerEmail = (email?: string | null) => !!email && OWNER_EMAILS.includes(email.toLowerCase());
