import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword as firebaseCreateUser,
  signInWithEmailAndPassword as firebaseSignIn,
  signOut as firebaseSignOut,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail as firebaseSendPasswordReset,
} from 'firebase/auth';
import {
  getFirestore,
  collection as firestoreCollection,
  addDoc as firestoreAddDoc,
  getDocs as firestoreGetDocs,
  updateDoc as firestoreUpdateDoc,
  deleteDoc as firestoreDeleteDoc,
  doc as firestoreDoc,
  query as firestoreQuery,
  where as firestoreWhere,
  orderBy as firestoreOrderBy,
  serverTimestamp as firestoreServerTimestamp,
  onSnapshot as firestoreOnSnapshot,
  setDoc as firestoreSetDoc,
  getDoc as firestoreGetDoc,
  runTransaction as firestoreRunTransaction,
  writeBatch as firestoreWriteBatch,
} from 'firebase/firestore';
import * as demo from './demoBackend';
import { ADMIN_LOGIN_EMAIL, normalizeLoginPassword } from './adminAuth';

const firebaseEnvKeys = [
  'REACT_APP_FIREBASE_API_KEY',
  'REACT_APP_FIREBASE_AUTH_DOMAIN',
  'REACT_APP_FIREBASE_PROJECT_ID',
  'REACT_APP_FIREBASE_STORAGE_BUCKET',
  'REACT_APP_FIREBASE_MESSAGING_SENDER_ID',
  'REACT_APP_FIREBASE_APP_ID',
];

function envValue(key) {
  const raw = process.env[key];
  if (raw == null) return '';
  return String(raw).trim();
}

const missingFirebaseEnv = firebaseEnvKeys.filter((key) => !envValue(key));
export const isFirebaseConfigured = missingFirebaseEnv.length === 0;

/** Demo فقط عند REACT_APP_DEMO_MODE=true — لا fallback تلقائي عند نقص المفاتيح */
const forceDemo = envValue('REACT_APP_DEMO_MODE').toLowerCase() === 'true';
export const isDemoMode = forceDemo;

/** إنتاج: مفاتيح ناقصة وبدون demo صريح → شاشة إعداد (لا localStorage) */
export const isCloudUnavailable = !isFirebaseConfigured && !isDemoMode;

export const firebaseConnectionInfo = {
  isDemoMode,
  isFirebaseConfigured,
  isCloudUnavailable,
  forceDemo,
  missingKeys: missingFirebaseEnv,
};

let auth;
let db;

if (isDemoMode) {
  demo.runFullDataWipe();
  auth = demo.demoAuth;
  db = demo.demoDb;
} else if (isFirebaseConfigured) {
  const firebaseConfig = {
    apiKey: envValue('REACT_APP_FIREBASE_API_KEY'),
    authDomain: envValue('REACT_APP_FIREBASE_AUTH_DOMAIN'),
    projectId: envValue('REACT_APP_FIREBASE_PROJECT_ID'),
    storageBucket: envValue('REACT_APP_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: envValue('REACT_APP_FIREBASE_MESSAGING_SENDER_ID'),
    appId: envValue('REACT_APP_FIREBASE_APP_ID'),
  };
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} else {
  auth = null;
  db = null;
}

export { auth, db };

export const enterLocalDemo = demo.enterLocalDemo;

const bind = (demoFn, realFn) => (isDemoMode ? demoFn : realFn);

export const collection = bind(demo.collection, firestoreCollection);
export const doc = bind(demo.doc, firestoreDoc);
export const addDoc = bind(demo.addDoc, firestoreAddDoc);
export const getDocs = bind(demo.getDocs, firestoreGetDocs);
export const updateDoc = bind(demo.updateDoc, firestoreUpdateDoc);
export const deleteDoc = bind(demo.deleteDoc, firestoreDeleteDoc);
export const query = bind(demo.query, firestoreQuery);
export const where = bind(demo.where, firestoreWhere);
export const orderBy = bind(demo.orderBy, firestoreOrderBy);
export const serverTimestamp = bind(demo.serverTimestamp, firestoreServerTimestamp);
export const onSnapshot = bind(demo.onSnapshot, firestoreOnSnapshot);
export const setDoc = bind(demo.setDoc, firestoreSetDoc);
export const getDoc = bind(demo.getDoc, firestoreGetDoc);
export const runTransaction = bind(demo.runTransaction, firestoreRunTransaction);
export const writeBatch = bind(demo.writeBatch, firestoreWriteBatch);
export const onAuthStateChanged = bind(demo.onAuthStateChanged, firebaseOnAuthStateChanged);
export const createUserWithEmailAndPassword = bind(demo.createUserWithEmailAndPassword, firebaseCreateUser);
export const signInWithEmailAndPassword = bind(demo.signInWithEmailAndPassword, firebaseSignIn);
export const signOut = bind(demo.signOut, firebaseSignOut);
export const sendPasswordResetEmail = bind(demo.sendPasswordResetEmail, firebaseSendPasswordReset);

export async function signInWithAdminPassword(authInstance, password) {
  const normalized = normalizeLoginPassword(password);
  if (!normalized) {
    throw new Error('يرجى إدخال كلمة المرور');
  }
  if (isDemoMode) {
    return demo.signInWithAdminPassword(authInstance, normalized);
  }
  if (!authInstance || !isFirebaseConfigured) {
    throw new Error('النظام غير مربوط بالسحابة. راجع إعدادات الخادم.');
  }
  return firebaseSignIn(authInstance, ADMIN_LOGIN_EMAIL, normalized);
}
