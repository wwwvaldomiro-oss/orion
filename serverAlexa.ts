import { Router, type Request, type Response } from "express";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getApps, initializeApp, applicationDefault, getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import firebaseConfig from "./firebase-applet-config.json";

// All Alexa records are isolated from Orion's existing financial collections.
if (!getApps().length) initializeApp({ credential: applicationDefault() });
const db = getFirestore(getApp(), firebaseConfig.firestoreDatabaseId);
const router = Router();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const randomToken = () => randomBytes(32).toString("base64url");
const minutes = (n: number) => Date.now() + n * 60_000;
const clientId = () => process.env.ALEXA_OAUTH_CLIENT_ID || "";
const clientSecret = () => process.env.ALEXA_OAUTH_CLIENT_SECRET || "";
const allowedRedirects = () => (process.env.ALEXA_ALLOWED_REDIRECT_URIS || "").split(",").map(v => v.trim()).filter(Boolean);
const enabled = () => process.env.ALEXA_INTEGRATION_ENABLED === "true" && !!clientId() && !!clientSecret() && allowedRedirects().length > 0;
const error = (res: Response, status: number, code: string) => res.status(status).json({ error: code });
const text = (v: unknown, max = 120) => typeof v === "string" ? v.trim().slice(0, max) : "";
const tokenRef = (token: string) => db.collection("alexaOAuthTokens").doc(hash(token));
const codeRef = (code: string) => db.collection("alexaOAuthCodes").doc(hash(code));
const settingRef = (uid: string) => db.doc(`users/${uid}/alexaSettings/connection`);
function same(a: string, b: string) {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
async function userId(req: Request): Promise<string> {
  const match = /^Bearer (.+)$/i.exec(req.headers.authorization || "");
  if (!match) throw new Error("unauthenticated");
  const decoded = await getAuth().verifyIdToken(match[1]!);
  if (!decoded.email_verified) throw new Error("unverified");
  return decoded.uid;
}
async function accessUser(req: Request): Promise<string | null> {
  const match = /^Bearer (.+)$/i.exec(req.headers.authorization || "");
  if (!match) return null;
  const snap = await tokenRef(match[1]!).get();
  const record = snap.data();
  if (!record || record.type !== "access" || record.expiresAt < Date.now()) return null;
  const settings = (await settingRef(record.uid).get()).data();
  return settings?.enabled === true && settings?.version === record.version ? record.uid : null;
}
router.use((req, res, next) => {
  if (!enabled()) return error(res, 503, "alexa_not_configured");
  next();
});
// Alexa Console OAuth authorization URL: https://YOUR_HOST/api/alexa/oauth/authorize
router.get("/oauth/authorize", (req, res) => {
  const redirect = text(req.query.redirect_uri, 1000);
  const state = text(req.query.state, 1000);
  const challenge = text(req.query.code_challenge, 256);
  if (req.query.client_id !== clientId() || req.query.response_type !== "code"
    || !allowedRedirects().includes(redirect) || req.query.code_challenge_method !== "S256"
    || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge) || !state) {
    return error(res, 400, "invalid_authorization_request");
  }
  // Require an explicit signed-in user confirmation on the Orion frontend.
  const params = new URLSearchParams({ client_id: clientId(), redirect_uri: redirect, state, code_challenge: challenge });
  return res.redirect(302, `/alexa/autorizar?${params}`);
});
router.post("/oauth/consent", async (req, res) => {
  try {
    const uid = await userId(req);
    const { client_id, redirect_uri, state, code_challenge, approve } = req.body || {};
    if (client_id !== clientId() || !allowedRedirects().includes(redirect_uri)
      || typeof state !== "string" || !state || state.length > 1000
      || typeof code_challenge !== "string" || !/^[A-Za-z0-9_-]{43,128}$/.test(code_challenge)
      || approve !== true) return error(res, 400, "invalid_request");
    const code = randomToken();
    await codeRef(code).create({ uid, challenge: code_challenge, redirect: redirect_uri, expiresAt: minutes(5), createdAt: FieldValue.serverTimestamp() });
    const url = new URL(redirect_uri);
    url.searchParams.set("code", code);
    url.searchParams.set("state", state);
    return res.json({ redirect: url.toString() });
  } catch { return error(res, 401, "unauthorized"); }
});
router.post("/oauth/token", async (req, res) => {
  try {
    const basic = /^Basic (.+)$/i.exec(req.headers.authorization || "");
    let id = text(req.body?.client_id, 300);
    let secret = text(req.body?.client_secret, 500);
    if (basic) {
      const raw = Buffer.from(basic[1]!, "base64").toString("utf8");
      const pos = raw.indexOf(":");
      if (pos >= 0) { id = raw.slice(0, pos); secret = raw.slice(pos + 1); }
    }
    if (id !== clientId() || !same(secret, clientSecret())) return error(res, 401, "invalid_client");
    const grant = req.body?.grant_type;
    let uid = ""; let version = 0;
    if (grant === "authorization_code") {
      const code = text(req.body?.code, 256);
      const ref = codeRef(code);
      const snap = await ref.get();
      const d = snap.data();
      const verifier = text(req.body?.code_verifier, 256);
      if (!d || d.expiresAt < Date.now() || d.redirect !== req.body?.redirect_uri
        || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)
        || hashPKCE(verifier) !== d.challenge) return error(res, 400, "invalid_grant");
      // Claim code exactly once, even under concurrent requests.
      await db.runTransaction(async tx => {
        const current = await tx.get(ref);
        if (!current.exists) throw new Error("used_code");
        tx.delete(ref);
      });
      uid = d.uid;
      const settings = await settingRef(uid).get();
      version = Number(settings.data()?.version || 1);
      await settingRef(uid).set({ enabled: true, version, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    } else if (grant === "refresh_token") {
      const old = tokenRef(text(req.body?.refresh_token, 256));
      const d = (await old.get()).data();
      if (!d || d.type !== "refresh" || d.expiresAt < Date.now()) return error(res, 400, "invalid_grant");
      const settings = (await settingRef(d.uid).get()).data();
      if (!settings?.enabled || settings.version !== d.version) return error(res, 400, "invalid_grant");
      await db.runTransaction(async tx => { if (!(await tx.get(old)).exists) throw new Error("used_token"); tx.delete(old); });
      uid = d.uid; version = d.version;
    } else return error(res, 400, "unsupported_grant_type");
    const access = randomToken(), refresh = randomToken();
    await Promise.all([
      tokenRef(access).create({ uid, version, type: "access", expiresAt: minutes(60) }),
      tokenRef(refresh).create({ uid, version, type: "refresh", expiresAt: minutes(60 * 24 * 30) })
    ]);
    res.setHeader("Cache-Control", "no-store");
    return res.json({ access_token: access, refresh_token: refresh, token_type: "Bearer", expires_in: 3600 });
  } catch { return error(res, 400, "invalid_grant"); }
});
function hashPKCE(verifier: string) { return createHash("sha256").update(verifier).digest("base64url"); }
router.get("/status", async (req, res) => {
  try {
    const uid = await userId(req);
    const data = (await settingRef(uid).get()).data();
    return res.json({ configured: enabled(), linked: !!data?.enabled, version: data?.version || null });
  } catch { return error(res, 401, "unauthorized"); }
});
router.post("/disconnect", async (req, res) => {
  try {
    const uid = await userId(req);
    const old = (await settingRef(uid).get()).data();
    await settingRef(uid).set({ enabled: false, version: Number(old?.version || 0) + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return res.json({ ok: true });
  } catch { return error(res, 401, "unauthorized"); }
});
// Called only by the Alexa skill backend with an OAuth access token. No payment or transfer endpoints.
router.post("/voice", async (req, res) => {
  try {
    const uid = await accessUser(req);
    if (!uid) return error(res, 401, "invalid_token");
    const action = text(req.body?.action, 60);
    
    if (action === "shopping.list") {
      const docs = await db.collection(`users/${uid}/shoppingList`).limit(50).get();
      const names = docs.docs.filter(d => !d.data().checked).map(d => text(d.data().name, 60)).filter(Boolean);
      return res.json({ speech: names.length ? `Na sua lista: ${names.slice(0, 8).join(", ")}.` : "Sua lista de compras está vazia." });
    }
    if (action === "shopping.add") {
      const name = text(req.body?.name, 80);
      if (!name || !/^[\p{L}\p{N} ,.'-]+$/u.test(name)) return error(res, 400, "invalid_item");
      const list = db.collection(`users/${uid}/shoppingList`);
      await list.add({ ownerId: uid, name, category: "Outros", quantity: 1, unitPriceCents: 0, checked: false, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
      return res.json({ speech: `Adicionei ${name} à sua lista de compras.` });
    }
    if (action === "agenda.today") {
      const docs = await db.collection(`users/${uid}/personalAgenda`).limit(100).get();
      const tz = "America/Sao_Paulo";
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const tasks = docs.docs.map(d => d.data()).filter(d => d.startDate === today && d.recurrence === "none");
      return res.json({ speech: tasks.length ? `Você tem: ${tasks.slice(0, 5).map(t => text(t.title, 60)).join(", ")}.` : "Não encontrei compromissos únicos cadastrados para hoje. Eventos recorrentes ainda não estão incluídos." });
    }
    if (action === "bills.due") {
      const now = new Date();
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
      const items = await db.collection(`users/${uid}/monthlyBills`).where("dueDate", ">=", today).orderBy("dueDate").limit(40).get();
      const bills = items.docs.map(d => d.data()).filter(d => !d.isSettled).slice(0, 5);
      return res.json({ speech: bills.length ? `Próximas contas: ${bills.map(b => `${text(b.creditor, 50)}, dia ${text(b.dueDate, 10).slice(8)}`).join("; ")}.` : "Não encontrei contas pendentes nas próximas datas consultadas." });
    }
    return error(res, 400, "unknown_action");
  } catch { return error(res, 500, "internal_error"); }
});
export default router;
