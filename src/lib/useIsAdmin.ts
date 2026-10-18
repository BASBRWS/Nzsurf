import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';
import { isOwnerEmail } from './admin';

/** Is de ingelogde gebruiker admin (eigenaar of rol 'admin' in zijn users-document)? */
export function useIsAdmin(): boolean {
  const [admin, setAdmin] = useState(() => isOwnerEmail(auth.currentUser?.email));
  useEffect(() => {
    let unsubDoc: (() => void) | undefined;
    const unsubAuth = onAuthStateChanged(auth, u => {
      unsubDoc?.(); unsubDoc = undefined;
      if (!u) { setAdmin(false); return; }
      if (isOwnerEmail(u.email)) { setAdmin(true); return; }
      unsubDoc = onSnapshot(doc(db, 'users', u.uid), s => setAdmin(s.data()?.role === 'admin'), () => setAdmin(false));
    });
    return () => { unsubAuth(); unsubDoc?.(); };
  }, []);
  return admin;
}
