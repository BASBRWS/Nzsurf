// Account verwijderen (eis van Google Play: in de app én via een webpagina).
// Wist alles wat aan de gebruiker hangt en daarna het Firebase-account zelf.
//   users/{uid}                     profiel, boards, voorkeuren
//   spotReports  (userId == uid)    meldingen
//   sharedSpots  (creatorId == uid) gedeelde spots
//   communityPosts (userId == uid)  berichten (met hun reacties)
//   communityPosts/*/comments (userId == uid)  eigen reacties bij anderen
// Firebase eist een recente login voor het verwijderen van het account; zo nodig
// vragen we de gebruiker opnieuw in te loggen en proberen het nog één keer.

import { collection, deleteDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { deleteUser } from 'firebase/auth';
import { auth, db, signInWithGoogleSmart } from '../lib/firebase';

async function deleteWhere(path: string, field: string, uid: string): Promise<number> {
  const snap = await getDocs(query(collection(db, path), where(field, '==', uid)));
  await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
  return snap.size;
}

export async function deleteMyAccount(onStep?: (s: string) => void): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Niet ingelogd');
  const uid = user.uid;

  onStep?.('Reacties verwijderen…');
  const posts = await getDocs(collection(db, 'communityPosts'));
  for (const p of posts.docs) {
    await deleteWhere(`communityPosts/${p.id}/comments`, 'userId', uid);
  }
  onStep?.('Berichten verwijderen…');
  for (const p of posts.docs.filter(p => p.data().userId === uid)) {
    // Reacties van anderen onder een eigen bericht mag alleen een admin wissen; zonder
    // het bericht zijn ze nergens meer te zien.
    await deleteDoc(p.ref);
  }
  onStep?.('Meldingen en spots verwijderen…');
  await deleteWhere('spotReports', 'userId', uid);
  await deleteWhere('sharedSpots', 'creatorId', uid);
  onStep?.('Profiel verwijderen…');
  await deleteDoc(doc(db, 'users', uid));

  onStep?.('Account verwijderen…');
  try {
    await deleteUser(user);
  } catch (e) {
    if ((e as { code?: string })?.code !== 'auth/requires-recent-login') throw e;
    onStep?.('Even opnieuw inloggen ter bevestiging…');
    await signInWithGoogleSmart();
    if (!auth.currentUser || auth.currentUser.uid !== uid) throw new Error('Opnieuw inloggen met een ander account; niets verwijderd van het account zelf.');
    await deleteUser(auth.currentUser);
  }
  // Lokale gegevens van deze gebruiker (o.a. API-sleutel, caches) ook weg.
  try { localStorage.clear(); } catch { /* geen opslag */ }
}
