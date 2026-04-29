"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSession = getSession;
exports.getToken = getToken;
exports.setCookie = setCookie;
exports.clearCookie = clearCookie;
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
function getAdminAuth() {
    if ((0, app_1.getApps)().length === 0) {
        const projectId = process.env.FIREBASE_PROJECT_ID;
        const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');
        const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
        if (projectId && privateKey && clientEmail) {
            (0, app_1.initializeApp)({
                credential: (0, app_1.cert)({
                    projectId,
                    privateKey,
                    clientEmail,
                }),
            });
        }
        else {
            (0, app_1.initializeApp)();
        }
    }
    return (0, auth_1.getAuth)();
}
async function getSession(token) {
    try {
        const decoded = await getAdminAuth().verifyIdToken(token);
        return {
            user_id: decoded.uid,
            email: typeof decoded.email === 'string' ? decoded.email : undefined,
        };
    }
    catch {
        return null;
    }
}
function getToken(req) {
    const authHeader = req.headers.get('Authorization') ?? req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice('Bearer '.length).trim();
        if (token)
            return token;
    }
    const match = (req.headers.get('Cookie') ?? '').match(/session=([^;]+)/);
    return match?.[1] ?? null;
}
function setCookie(token, expires) {
    return `session=${token}; Path=/; HttpOnly; SameSite=Strict; Expires=${expires.toUTCString()}`;
}
function clearCookie() {
    return 'session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0';
}
