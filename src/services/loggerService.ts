import { db, auth } from '../lib/firebase';
import { collection, addDoc, getDocs, query, orderBy, limit, deleteDoc, doc } from 'firebase/firestore';

export interface AppErrorLog {
  id?: string;
  userId: string | null;
  userEmail: string | null;
  errorType: string;
  message: string;
  stack?: string;
  context: any;
  timestamp: string; // ISO string
}

/**
 * Logs an error to the Firestore errorLogs collection for admin troubleshooting.
 */
export async function logAppError(
  errorType: string,
  message: string,
  context: any = {},
  errorObject?: any
): Promise<void> {
  const user = auth.currentUser;
  const log: Omit<AppErrorLog, 'id'> = {
    userId: user ? user.uid : null,
    userEmail: user ? user.email : null,
    errorType,
    message,
    stack: errorObject instanceof Error ? errorObject.stack : (errorObject ? String(errorObject) : undefined),
    context: JSON.parse(JSON.stringify(context || {})), // Ensure cloneable structure
    timestamp: new Date().toISOString()
  };

  console.error(`[App Error - ${errorType}] ${message}`, { log });

  try {
    const logsRef = collection(db, 'errorLogs');
    await addDoc(logsRef, log);
  } catch (firestoreError) {
    console.error("Failed to write error log to Firestore:", firestoreError);
  }
}

/**
 * Retrieves the error logs from Firestore, ordered by timestamp desc.
 */
export async function getAppErrorLogs(limitCount = 100): Promise<AppErrorLog[]> {
  try {
    const logsRef = collection(db, 'errorLogs');
    const q = query(logsRef, orderBy('timestamp', 'desc'), limit(limitCount));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as AppErrorLog[];
  } catch (error) {
    console.error("Error fetching app error logs:", error);
    throw error;
  }
}

/**
 * Clears an error log.
 */
export async function deleteAppErrorLog(logId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'errorLogs', logId));
  } catch (error) {
    console.error(`Error deleting log ${logId}:`, error);
    throw error;
  }
}
