import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  signOut 
} from 'firebase/auth';
import { getFirestore, initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import localAppletConfig from '../../firebase-applet-config.json';

// Support both Netlify/Vercel/Production Environment Variables and local applet config
const env = import.meta.env || {};

export const resolvedFirebaseConfig = {
  projectId: env.VITE_FIREBASE_PROJECT_ID || localAppletConfig?.projectId || '',
  appId: env.VITE_FIREBASE_APP_ID || localAppletConfig?.appId || '',
  apiKey: env.VITE_FIREBASE_API_KEY || localAppletConfig?.apiKey || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || localAppletConfig?.authDomain || '',
  firestoreDatabaseId: env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || env.VITE_FIREBASE_DATABASE_ID || localAppletConfig?.firestoreDatabaseId || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || localAppletConfig?.storageBucket || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || localAppletConfig?.messagingSenderId || '',
  oAuthClientId: env.VITE_GOOGLE_CLIENT_ID || (localAppletConfig as any)?.oAuthClientId || '',
};

const app = getApps().length === 0 ? initializeApp(resolvedFirebaseConfig) : getApp();

// Use specific firestore database ID with autoDetectLongPolling to avoid WebChannel stream stalls in iframes & proxies
let firestoreInstance;
try {
  firestoreInstance = (resolvedFirebaseConfig.firestoreDatabaseId && resolvedFirebaseConfig.firestoreDatabaseId !== '(default)')
    ? initializeFirestore(app, { experimentalAutoDetectLongPolling: true }, resolvedFirebaseConfig.firestoreDatabaseId)
    : initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
} catch {
  firestoreInstance = (resolvedFirebaseConfig.firestoreDatabaseId && resolvedFirebaseConfig.firestoreDatabaseId !== '(default)')
    ? getFirestore(app, resolvedFirebaseConfig.firestoreDatabaseId)
    : getFirestore(app);
}

export const db = firestoreInstance;
export const auth = getAuth(app);

// Helper for verifying authorized instructor accounts (BU domain + runtime project owner)
export function isAllowedInstructorEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.toLowerCase().trim();
  return normalized.endsWith('@bu.ac.th') || normalized === 'w.peanchi@gmail.com';
}

// Google Auth Provider setup with BU domain hint and select_account prompt
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
  hd: 'bu.ac.th',
});

// Human-friendly error translation for common Netlify / OAuth error codes
export function getAuthErrorMessage(error: any): string {
  if (!error) return 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
  const code = error.code || '';
  const message = error.message || '';

  switch (code) {
    case 'auth/unauthorized-domain': {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'โดเมนของคุณ';
      return `โดเมน "${hostname}" ยังไม่ได้รับอนุญาตใน Firebase Authentication (Authorized Domains) กรุณานำ URL หรือชื่อโดเมนนี้ไปเพิ่มใน Firebase Console > Authentication > Settings > Authorized domains เพื่อให้เข้าสู่ระบบผ่าน Netlify ได้`;
    }
    case 'auth/popup-blocked':
      return 'เบราว์เซอร์บล็อกหน้าต่างป็อปอัป (Popup Blocked) แนะนำให้ใช้ปุ่ม "เข้าสู่ระบบด้วย Redirect Mode" หรือเปิดอนุญาตป็อปอัปในเบราว์เซอร์';
    case 'auth/popup-closed-by-user':
      return 'หน้าต่างเข้าสู่ระบบถูกปิดก่อนทำรายการสำเร็จ กรุณากดเข้าสู่ระบบใหม่อีกครั้ง';
    case 'auth/cancelled-popup-request':
      return 'มีการเปิดหน้าต่างเข้าสู่ระบบซ้ำ กรุณารอสักครู่แล้วลองใหม่อีกครั้ง';
    case 'auth/operation-not-allowed':
      return 'Google Sign-in ยังไม่ถูกเปิดใช้งานใน Firebase Console กรุณาไปที่ Firebase Console > Authentication > Sign-in method แล้วเปิดใช้งาน Google Provider';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return 'Firebase API Key ไม่ถูกต้อง กรุณาตรวจสอบ Environment Variables (VITE_FIREBASE_API_KEY) บน Netlify Site Configuration';
    case 'auth/network-request-failed':
      return 'การเชื่อมต่อเครือข่ายขัดข้อง กรุณาตรวจสอบสัญญาณอินเทอร์เน็ต';
    case 'auth/user-disabled':
      return 'บัญชีผู้ใช้นี้ถูกปิดการใช้งานในระบบ Firebase';
    default:
      return `ไม่สามารถเข้าสู่ระบบได้: ${message || code}`;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
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
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
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

// Boot test connection
export async function testConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline or network unavailable.');
    }
    return false;
  }
}

testConnection();

export { signInWithPopup, signInWithRedirect, getRedirectResult, signOut };
