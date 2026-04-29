"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeFirebaseAdmin = initializeFirebaseAdmin;
exports.requireFirebaseAdmin = requireFirebaseAdmin;
exports.getFirestoreDocument = getFirestoreDocument;
exports.setFirestoreDocument = setFirestoreDocument;
exports.deleteFirestoreDocument = deleteFirestoreDocument;
exports.listFirestoreDocuments = listFirestoreDocuments;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
function getFirebaseConfig(env) {
    return {
        projectId: env.FIREBASE_PROJECT_ID ?? process.env.GCLOUD_PROJECT,
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
    };
}
function ensureFirebaseApp(env) {
    if ((0, app_1.getApps)().length > 0) {
        return (0, app_1.getApps)()[0];
    }
    const projectId = env.FIREBASE_PROJECT_ID;
    const privateKey = env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
    const clientEmail = env.FIREBASE_CLIENT_EMAIL;
    if (projectId && privateKey && clientEmail) {
        return (0, app_1.initializeApp)({
            credential: (0, app_1.cert)({
                projectId,
                privateKey,
                clientEmail,
            }),
        });
    }
    return (0, app_1.initializeApp)();
}
function collectionPath(segments) {
    return segments.map((segment) => segment.trim()).filter(Boolean).join('/');
}
function documentPath(segments) {
    return collectionPath(segments);
}
function initializeFirebaseAdmin(env) {
    try {
        const app = ensureFirebaseApp(env);
        const config = getFirebaseConfig(env);
        return {
            isConfigured: true,
            config: {
                projectId: config.projectId ?? app.options.projectId,
                clientEmail: config.clientEmail,
            },
        };
    }
    catch (error) {
        return {
            isConfigured: false,
            error: error instanceof Error ? error.message : 'Firebase Admin initialization failed.',
        };
    }
}
function requireFirebaseAdmin(env) {
    const admin = initializeFirebaseAdmin(env);
    if (!admin.isConfigured) {
        throw new Error(admin.error);
    }
}
async function getFirestoreDocument(env, segments) {
    ensureFirebaseApp(env);
    const db = (0, firestore_1.getFirestore)();
    const path = documentPath(segments);
    const snapshot = await db.doc(path).get();
    if (!snapshot.exists)
        return null;
    return snapshot.data();
}
async function setFirestoreDocument(env, segments, payload) {
    ensureFirebaseApp(env);
    const db = (0, firestore_1.getFirestore)();
    const path = documentPath(segments);
    await db.doc(path).set(payload);
}
async function deleteFirestoreDocument(env, segments) {
    ensureFirebaseApp(env);
    const db = (0, firestore_1.getFirestore)();
    const path = documentPath(segments);
    await db.doc(path).delete();
}
async function listFirestoreDocuments(env, segments) {
    ensureFirebaseApp(env);
    const db = (0, firestore_1.getFirestore)();
    const path = collectionPath(segments);
    const snapshot = await db.collection(path).get();
    return snapshot.docs.map((doc) => ({
        id: doc.id,
        data: doc.data(),
    }));
}
