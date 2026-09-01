import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithCredential, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { 
  getFirestore, 
  doc, 
  getDoc,
  setDoc, 
  onSnapshot, 
  getDocFromServer,
  collection,
  addDoc,
  query,
  limit,
  orderBy,
  where,
  deleteDoc,
  updateDoc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = firebaseConfig.firestoreDatabaseId ? getFirestore(app, firebaseConfig.firestoreDatabaseId) : getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Slimme Google-login: op web de popup, op native (APK) de Google-Auth-plugin.
// In een WebView-APK werkt signInWithPopup niet (Google blokkeert OAuth in
// embedded webviews), daarom doet de plugin de sign-in native en loggen we met
// het idToken in via de Firebase JS-SDK.
let googleAuthInitialized = false;
const WEB_CLIENT_ID = '112380081133-48eq7joafhkficgm60023vmqno0o787j.apps.googleusercontent.com';

export async function signInWithGoogleSmart(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    if (!googleAuthInitialized) {
      GoogleAuth.initialize({ clientId: WEB_CLIENT_ID, scopes: ['profile', 'email'], grantOfflineAccess: false });
      googleAuthInitialized = true;
    }
    const result = await GoogleAuth.signIn();
    const idToken = result?.authentication?.idToken;
    if (!idToken) throw new Error('Geen idToken ontvangen van Google');
    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);
  } else {
    await signInWithPopup(auth, googleProvider);
  }
}

// Storage helper
export const uploadImageToStorage = async (file: File, path: string): Promise<string> => {
  const timestamp = new Date().getTime();
  const fileExtension = file.name.split('.').pop();
  const fileName = `${timestamp}_${Math.random().toString(36).substring(7)}.${fileExtension}`;
  const storageRef = ref(storage, `${path}/${fileName}`);
  
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
};

// Error handling for Firestore
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}



export { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  doc, 
  getDoc,
  setDoc, 
  onSnapshot,
  collection,
  addDoc,
  query,
  limit,
  orderBy,
  where,
  deleteDoc,
  updateDoc,
  arrayUnion,
  arrayRemove
};
export type { User };
