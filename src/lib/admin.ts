/**
 * Rechten in de app.
 * - Eigenaar: vast in de code (en in firestore.rules). Alleen de eigenaar kan rechten toekennen.
 * - Admin: toegekend per gebruiker (users/{uid}.role = 'admin') via Admin → Gebruikers.
 * De Firestore-regels bepalen wat er echt mag; dit bepaalt alleen wat de app laat zien.
 */
export const OWNER_EMAILS = ['sebastiaan.boom@gmail.com', 'sebastiaan.boom2@gmail.com'];

export type UserRole = 'user' | 'admin';
export const ROLE_LABELS: Record<UserRole, string> = { user: 'Gebruiker', admin: 'Admin' };

export const isOwnerEmail = (email?: string | null) => !!email && OWNER_EMAILS.includes(email.toLowerCase());
/** Admin = eigenaar of iemand met de rol admin. */
export const isAdminUser = (email?: string | null, role?: string | null) => isOwnerEmail(email) || role === 'admin';
