import fs from "node:fs";
import path from "node:path";
import { Router, type Request, type Response, type NextFunction } from "express";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { getApps, initializeApp, applicationDefault, getApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { GoogleGenAI, Type } from "@google/genai";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId: firebaseConfig.projectId,
  });
}

const adminDb = firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)"
  ? getFirestore(getApp(), firebaseConfig.firestoreDatabaseId)
  : getFirestore(getApp());

const router = Router();
type Identified = Request & { orionUid?: string };
type Slot = "1" | "2";
export type PluggyStorageMode = "firestore-admin" | "server-preview-vault";

let cachedVaultMasterSecret: string | null = null;

function vaultDirPath(): string {
  const dir = process.env["ORION_PLUGGY_VAULT_DIR"] || "/var/tmp/.orion-pluggy-vault";
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  return dir;
}

function parseSlot(value: string | string[] | undefined): Slot {
  const s = Array.isArray(value) ? value[0] : value;
  if (s !== "1" && s !== "2") throw new Error("Conexão inválida");
  return s;
}

function secretKey() {
  const envSecret = process.env["ORION_INTEGRATION_ENCRYPTION_KEY"];
  if (envSecret && envSecret.length >= 32) {
    return createHash("sha256").update(envSecret).digest();
  }
  if (!cachedVaultMasterSecret) {
    const keyFile = path.join(vaultDirPath(), ".master.key");
    if (fs.existsSync(keyFile)) {
      const existing = fs.readFileSync(keyFile, "utf8").trim();
      if (existing.length >= 32) {
        cachedVaultMasterSecret = existing;
      }
    }
    if (!cachedVaultMasterSecret) {
      const generated = randomBytes(32).toString("hex");
      fs.writeFileSync(keyFile, generated, { mode: 0o600 });
      cachedVaultMasterSecret = generated;
    }
  }
  return createHash("sha256").update(cachedVaultMasterSecret).digest();
}

function encrypt(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decrypt(value: string) {
  const [i, t, data] = value.split(":");
  if (!i || !t || !data) throw new Error("Credencial inválida");
  const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(i, "base64"));
  decipher.setAuthTag(Buffer.from(t, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

async function verifyUser(req: Identified, res: Response, next: NextFunction) {
  try {
    const bearer = req.headers.authorization || "";
    if (!bearer.startsWith("Bearer ")) {
      res.status(401).json({ error: "Sessão necessária" });
      return;
    }
    const decoded = await getAuth().verifyIdToken(bearer.slice(7));
    if (!decoded.email_verified) {
      res.status(401).json({ error: "E-mail não verificado" });
      return;
    }
    req.orionUid = decoded.uid;
    next();
  } catch {
    res.status(401).json({ error: "Sessão inválida" });
  }
}

router.get("/pluggy/health", (_req, res) => {
  const envConfigured =
    typeof process.env["ORION_INTEGRATION_ENCRYPTION_KEY"] === "string" &&
    process.env["ORION_INTEGRATION_ENCRYPTION_KEY"].length >= 32;
  res.json({
    ok: true,
    routesRegistered: true,
    encryptionConfigured: true,
    envEncryptionConfigured: envConfigured,
    timestamp: new Date().toISOString(),
  });
});

router.use(["/pluggy", "/fiscal"], verifyUser);

function settings(uid: string, s: Slot) {
  return adminDb.doc(`users/${uid}/pluggySettings/pluggy${s}`);
}

interface VaultSlotRecord {
  ownerUid: string;
  slot: Slot;
  clientId: string;
  clientSecret: string;
  itemIds: string[];
  createdAt: string;
  updatedAt: string;
}

function vaultSlotPath(uid: string, s: Slot): string {
  const digest = createHash("sha256").update(`${uid}:${s}`).digest("hex");
  return path.join(vaultDirPath(), `slot_${digest}.json`);
}

function readVaultSlot(uid: string, s: Slot): VaultSlotRecord | null {
  const file = vaultSlotPath(uid, s);
  if (!fs.existsSync(file)) return null;
  try {
    const raw = fs.readFileSync(file, "utf8");
    const parsed = JSON.parse(raw) as Partial<VaultSlotRecord>;
    if (parsed.ownerUid !== uid || parsed.slot !== s) return null;
    if (typeof parsed.clientId !== "string" || typeof parsed.clientSecret !== "string") return null;
    return {
      ownerUid: uid,
      slot: s,
      clientId: parsed.clientId,
      clientSecret: parsed.clientSecret,
      itemIds: Array.isArray(parsed.itemIds) ? parsed.itemIds.map(String) : [],
      createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function writeVaultSlot(record: VaultSlotRecord): void {
  const file = vaultSlotPath(record.ownerUid, record.slot);
  fs.writeFileSync(file, JSON.stringify(record), { mode: 0o600 });
}

async function getConfig(uid: string, s: Slot) {
  try {
    const snapshot = await settings(uid, s).get();
    if (snapshot.exists) {
      const data = snapshot.data()!;
      return {
        clientId: decrypt(String(data["clientId"])),
        clientSecret: decrypt(String(data["clientSecret"])),
        itemIds: Array.isArray(data["itemIds"]) ? data["itemIds"].map(String) : [],
        storageMode: "firestore-admin" as PluggyStorageMode,
      };
    }
  } catch (err) {
    if (!isPermissionDeniedError(err)) throw err;
  }

  const vault = readVaultSlot(uid, s);
  if (!vault) {
    throw new Error(`Configure Meu Pluggy ${s} antes de conectar`);
  }
  return {
    clientId: decrypt(vault.clientId),
    clientSecret: decrypt(vault.clientSecret),
    itemIds: vault.itemIds,
    storageMode: "server-preview-vault" as PluggyStorageMode,
  };
}

export async function parseExternalPluggyJson(
  response: globalThis.Response,
  endpointLabel: string,
): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();
  const trimmed = raw.trimStart().toLowerCase();
  if (
    contentType.toLowerCase().includes("text/html") ||
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html")
  ) {
    console.warn("[Órion Pluggy] Resposta HTML recebida da API externa", {
      endpoint: endpointLabel,
      status: response.status,
      contentType: contentType || "desconhecido",
      redirected: response.redirected,
    });
    throw new Error(
      `Pluggy retornou HTML (HTTP ${response.status}) em ${endpointLabel} em vez de JSON.`,
    );
  }

  let json: Record<string, unknown> = {};
  if (raw.trim().length > 0) {
    try {
      json = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      throw new Error(
        `Pluggy retornou resposta inválida não-JSON (HTTP ${response.status}) em ${endpointLabel}.`,
      );
    }
  }

  if (!response.ok) {
    throw new Error(
      `Pluggy HTTP ${response.status}: ${String(json["message"] || json["error"] || "Falha na API").slice(0, 200)}`,
    );
  }
  return json;
}

const PLUGGY_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizePluggyCredentialInput(raw: string): string {
  return raw.trim().replace(/^["'`]+|["'`]+$/g, "").trim();
}

export function validatePluggyCredentialsFormat(
  rawClientId: string,
  rawClientSecret: string,
): { ok: true; clientId: string; clientSecret: string } | { ok: false; error: string } {
  const clientId = normalizePluggyCredentialInput(rawClientId);
  const clientSecret = normalizePluggyCredentialInput(rawClientSecret);

  if (!clientId || !clientSecret || clientId.length > 250 || clientSecret.length > 500) {
    return { ok: false, error: "Informe Client ID e Client Secret válidos." };
  }
  if (!PLUGGY_UUID_REGEX.test(clientId)) {
    if (PLUGGY_UUID_REGEX.test(clientSecret)) {
      return {
        ok: false,
        error:
          "O Client ID informado não é um UUID válido e parece estar invertido com o Client Secret. No painel Meu Pluggy, o Client ID tem formato UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).",
      };
    }
    return {
      ok: false,
      error:
        "Client ID inválido: no painel Meu Pluggy, o Client ID deve ser um UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx). Confira se não copiou outro campo, rótulo ou espaços extras.",
    };
  }
  return { ok: true, clientId, clientSecret };
}

function translatePluggyAuthMessage(msg: string): string {
  if (/clientId must be a UUID/i.test(msg)) {
    return "O Client ID salvo não é um UUID válido para a Pluggy. Informe o Client ID (UUID) e o Client Secret corretos no formulário e clique em Atualizar.";
  }
  return msg;
}

async function pluggyJson(path: string, apiKey: string, init?: RequestInit) {
  const response = await fetch(`https://api.pluggy.ai${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
      ...init?.headers,
    },
    signal: AbortSignal.timeout(25000),
  });
  return parseExternalPluggyJson(response, path);
}

async function keyFor(uid: string, s: Slot) {
  const config = await getConfig(uid, s);
  const response = await fetch("https://api.pluggy.ai/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    }),
    signal: AbortSignal.timeout(25000),
  });
  const body = (await parseExternalPluggyJson(response, "/auth")) as { apiKey?: string };
  if (!body.apiKey) throw new Error("Pluggy não retornou API Key");
  return { key: body.apiKey, config };
}

function isPermissionDeniedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const record = err as { code?: unknown; message?: unknown };
  if (record.code === 7 || record.code === "PERMISSION_DENIED") return true;
  const msg = typeof record.message === "string" ? record.message : "";
  return msg.includes("PERMISSION_DENIED") || msg.includes("Missing or insufficient permissions");
}

function formatAdminError(err: unknown): { status: number; message: string } {
  if (isPermissionDeniedError(err)) {
    return {
      status: 401,
      message:
        "7 PERMISSION_DENIED: A conta de serviço do servidor não possui permissão IAM no Firestore (roles/datastore.user) ou o projeto está no nível inicial (Starter Tier).",
    };
  }
  const msg = translatePluggyAuthMessage(err instanceof Error ? err.message : String(err));
  if (msg.includes("ORION_INTEGRATION_ENCRYPTION_KEY")) {
    return { status: 422, message: msg };
  }
  if (
    msg.includes("Configure Meu Pluggy") ||
    msg.includes("Conexão inválida") ||
    msg.includes("UUID inválido")
  ) {
    return { status: 422, message: msg };
  }
  return { status: 424, message: msg };
}

router.get("/pluggy/status", async (req: Identified, res) => {
  try {
    let storageMode: PluggyStorageMode = "firestore-admin";
    const slots = await Promise.all(
      (["1", "2"] as Slot[]).map(async (s) => {
        try {
          const snap = await settings(req.orionUid!, s).get();
          const d = snap.data();
          return {
            slot: s,
            configured: Boolean(d?.["clientId"]),
            itemIds: Array.isArray(d?.["itemIds"]) ? d["itemIds"] : [],
            updatedAt:
              (d?.["updatedAt"] as { toDate?: () => Date } | undefined)?.toDate?.()?.toISOString() ||
              null,
          };
        } catch (err) {
          if (!isPermissionDeniedError(err)) throw err;
          storageMode = "server-preview-vault";
          const vault = readVaultSlot(req.orionUid!, s);
          return {
            slot: s,
            configured: Boolean(vault?.clientId),
            itemIds: vault?.itemIds ?? [],
            updatedAt: vault?.updatedAt ?? null,
          };
        }
      }),
    );
    res.json({ slots, storageMode });
  } catch (e) {
    const formatted = formatAdminError(e);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

router.post("/pluggy/:slot/config", async (req: Identified, res) => {
  try {
    const s = parseSlot(req.params["slot"]);
    const body = (req.body || {}) as { clientId?: unknown; clientSecret?: unknown };
    const { clientId, clientSecret } = body;
    if (typeof clientId !== "string" || typeof clientSecret !== "string") {
      res.status(400).json({ error: "Informe Client ID e Client Secret válidos" });
      return;
    }
    const validation = validatePluggyCredentialsFormat(clientId, clientSecret);
    if (!validation.ok) {
      res.status(400).json({ error: validation.error });
      return;
    }

    // Verify credentials live against Pluggy /auth before persisting
    const verifyResp = await fetch("https://api.pluggy.ai/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: validation.clientId,
        clientSecret: validation.clientSecret,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const verifyBody = (await parseExternalPluggyJson(verifyResp, "/auth").catch((err) => {
      throw new Error(
        `A Pluggy recusou estas credenciais (${err instanceof Error ? err.message : String(err)}). Confira Client ID e Client Secret no painel Meu Pluggy.`,
      );
    })) as { apiKey?: string };
    if (!verifyBody.apiKey) {
      res.status(422).json({
        error: "A Pluggy não retornou uma chave de sessão válida para estas credenciais.",
      });
      return;
    }

    const encryptedClientId = encrypt(validation.clientId);
    const encryptedClientSecret = encrypt(validation.clientSecret);
    const uid = req.orionUid!;

    try {
      const ref = settings(uid, s);
      const snap = await ref.get();
      const prev = snap.data();
      await ref.set(
        {
          ownerId: uid,
          clientId: encryptedClientId,
          clientSecret: encryptedClientSecret,
          itemIds: Array.isArray(prev?.["itemIds"]) ? prev["itemIds"] : [],
          ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      res.json({ ok: true, storageMode: "firestore-admin" satisfies PluggyStorageMode });
      return;
    } catch (err) {
      if (!isPermissionDeniedError(err)) throw err;
      const existingVault = readVaultSlot(uid, s);
      const now = new Date().toISOString();
      writeVaultSlot({
        ownerUid: uid,
        slot: s,
        clientId: encryptedClientId,
        clientSecret: encryptedClientSecret,
        itemIds: existingVault?.itemIds ?? [],
        createdAt: existingVault?.createdAt ?? now,
        updatedAt: now,
      });
      res.json({ ok: true, storageMode: "server-preview-vault" satisfies PluggyStorageMode });
    }
  } catch (e) {
    const formatted = formatAdminError(e);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

router.post("/pluggy/:slot/connect-token", async (req: Identified, res) => {
  try {
    const s = parseSlot(req.params["slot"]);
    const { key } = await keyFor(req.orionUid!, s);
    const result = await pluggyJson("/connect_token", key, {
      method: "POST",
      body: JSON.stringify({
        options: { clientUserId: `orion:${req.orionUid}:${s}`, avoidDuplicates: true },
      }),
    });
    res.json({ connectToken: result["accessToken"] });
  } catch (e) {
    const formatted = formatAdminError(e);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

router.post("/pluggy/:slot/item", async (req: Identified, res) => {
  try {
    const s = parseSlot(req.params["slot"]);
    const uid = req.orionUid!;
    const itemId = String((req.body as { itemId?: unknown } | undefined)?.itemId || "");
    if (!/^[a-zA-Z0-9-]{6,90}$/.test(itemId)) {
      res.status(400).json({ error: "Item inválido" });
      return;
    }
    const { key } = await keyFor(uid, s);
    const item = await pluggyJson(`/items/${encodeURIComponent(itemId)}`, key);
    if (item["clientUserId"] !== `orion:${uid}:${s}`) {
      res.status(401).json({ error: "Item não pertence a este usuário e conexão" });
      return;
    }

    try {
      const ref = settings(uid, s);
      const data = (await ref.get()).data() || {};
      const ids = [
        ...new Set([
          ...(Array.isArray(data["itemIds"]) ? (data["itemIds"] as string[]) : []),
          itemId,
        ]),
      ];
      await ref.update({ itemIds: ids, updatedAt: FieldValue.serverTimestamp() });
      res.json({ ok: true, storageMode: "firestore-admin" satisfies PluggyStorageMode });
      return;
    } catch (err) {
      if (!isPermissionDeniedError(err)) throw err;
      const existingVault = readVaultSlot(uid, s);
      if (!existingVault) {
        throw new Error(`Configure Meu Pluggy ${s} antes de vincular instituição`);
      }
      const ids = [...new Set([...existingVault.itemIds, itemId])];
      writeVaultSlot({
        ...existingVault,
        itemIds: ids,
        updatedAt: new Date().toISOString(),
      });
      res.json({ ok: true, storageMode: "server-preview-vault" satisfies PluggyStorageMode });
    }
  } catch (e) {
    const formatted = formatAdminError(e);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

interface PluggyApiAccount {
  id?: string;
  type?: string;
  subtype?: string;
  name?: string;
  marketingName?: string;
  number?: string;
  balance?: number;
  institution?: { name?: string };
  creditData?: {
    brand?: string;
    creditLimit?: number;
    availableCreditLimit?: number;
    balanceCloseDate?: string;
    balanceDueDate?: string;
  };
}

interface PluggyApiTransaction {
  id?: string;
  description?: string;
  amount?: number;
  date?: string;
  category?: string;
}

interface SyncedBankDto {
  id: string;
  institution: string;
  name: string;
  accountType: "CHECKING" | "SAVINGS";
  number: string;
  balanceCents: number;
  color: string;
  sourceRecordId: string;
}

interface SyncedCardDto {
  id: string;
  institution: string;
  name: string;
  brand: "VISA" | "MASTERCARD" | "ELO" | "AMEX" | "HIPERCARD" | "OTHER";
  number: string;
  creditLimitCents: number;
  availableCents: number;
  closingDay: number;
  dueDay: number;
  sourceRecordId: string;
}

interface SyncedTxDto {
  id: string;
  accountId: string;
  accountType: "BANK" | "CREDIT";
  accountName: string;
  institution: string;
  description: string;
  amountCents: number;
  date: string;
  category: string;
}

router.post("/pluggy/:slot/sync", async (req: Identified, res) => {
  try {
    const s = parseSlot(req.params["slot"]);
    const uid = req.orionUid!;
    const { key, config } = await keyFor(uid, s);
    let accounts = 0;
    let transactions = 0;
    let adminWritable = config.storageMode === "firestore-admin";

    const syncedBanks: SyncedBankDto[] = [];
    const syncedCards: SyncedCardDto[] = [];
    const syncedTransactions = new Map<string, SyncedTxDto>();

    for (const itemId of config.itemIds) {
      const item = await pluggyJson(`/items/${encodeURIComponent(itemId)}`, key);
      if (item["status"] === "LOGIN_ERROR") continue;
      const response = await pluggyJson(
        `/accounts?itemId=${encodeURIComponent(itemId)}&pageSize=500`,
        key,
      );
      const accountRows = Array.isArray(response["results"])
        ? (response["results"] as PluggyApiAccount[])
        : [];

      for (const a of accountRows) {
        if (!a.id || (a.type !== "BANK" && a.type !== "CREDIT")) continue;
        const accountId = `pluggy_${s}_${String(a.id).replace(/[^\w-]/g, "_")}`.slice(0, 128);
        const institution = String(a.institution?.name || a.name || "Banco conectado").slice(0, 80);
        const name = String(a.name || a.marketingName || "Conta Pluggy").slice(0, 80);
        const rawNumber = String(a.number || "").trim() || "0000";
        const sourceRecordId = `pluggy:${s}:${a.id}`.slice(0, 128);

        if (a.type === "BANK") {
          const bankDto: SyncedBankDto = {
            id: accountId,
            institution,
            name,
            accountType: a.subtype === "SAVINGS_ACCOUNT" ? "SAVINGS" : "CHECKING",
            number: rawNumber.slice(0, 20),
            balanceCents: Math.round(Number(a.balance || 0) * 100),
            color: "#173d4a",
            sourceRecordId,
          };
          syncedBanks.push(bankDto);
          if (adminWritable) {
            try {
              const bankRef = adminDb.doc(`users/${uid}/banks/${accountId}`);
              const prev = await bankRef.get();
              await bankRef.set(
                {
                  ownerId: uid,
                  institution: bankDto.institution,
                  name: bankDto.name,
                  number: bankDto.number,
                  sourceRecordId: bankDto.sourceRecordId,
                  accountType: bankDto.accountType,
                  balanceCents: bankDto.balanceCents,
                  color: bankDto.color,
                  updatedAt: FieldValue.serverTimestamp(),
                  ...(prev.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
                },
                { merge: true },
              );
            } catch (err) {
              if (!isPermissionDeniedError(err)) throw err;
              adminWritable = false;
            }
          }
        } else {
          const credit = a.creditData || {};
          const limit = Math.max(0, Math.round(Number(credit.creditLimit || 0) * 100));
          const brand: SyncedCardDto["brand"] =
            credit.brand &&
            ["VISA", "MASTERCARD", "ELO", "AMEX", "HIPERCARD"].includes(credit.brand)
              ? (credit.brand as SyncedCardDto["brand"])
              : "OTHER";
          const rawCloseDay = Number(String(credit.balanceCloseDate || "").slice(-2));
          const rawDueDay = Number(String(credit.balanceDueDate || "").slice(-2));
          const cardDto: SyncedCardDto = {
            id: accountId,
            institution,
            name,
            brand,
            number: rawNumber.slice(-10) || "0000",
            creditLimitCents: limit,
            availableCents: Math.round(Number(credit.availableCreditLimit || 0) * 100),
            closingDay:
              Number.isInteger(rawCloseDay) && rawCloseDay >= 1 && rawCloseDay <= 31
                ? rawCloseDay
                : 15,
            dueDay:
              Number.isInteger(rawDueDay) && rawDueDay >= 1 && rawDueDay <= 31
                ? rawDueDay
                : 25,
            sourceRecordId,
          };
          syncedCards.push(cardDto);
          if (adminWritable) {
            try {
              const ref = adminDb.doc(`users/${uid}/cards/${accountId}`);
              const prev = await ref.get();
              await ref.set(
                {
                  ownerId: uid,
                  institution: cardDto.institution,
                  name: cardDto.name,
                  number: cardDto.number,
                  sourceRecordId: cardDto.sourceRecordId,
                  brand: cardDto.brand,
                  creditLimitCents: cardDto.creditLimitCents,
                  availableCents: cardDto.availableCents,
                  closingDay: cardDto.closingDay,
                  dueDay: cardDto.dueDay,
                  updatedAt: FieldValue.serverTimestamp(),
                  ...(prev.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
                },
                { merge: true },
              );
            } catch (err) {
              if (!isPermissionDeniedError(err)) throw err;
              adminWritable = false;
            }
          }
        }
        accounts++;

        let next = `?accountId=${encodeURIComponent(String(a.id))}&dateFrom=${new Date(Date.now() - 95 * 86400000).toISOString().slice(0, 10)}`;
        const fallbackIso = new Date().toISOString().slice(0, 10);
        for (let page = 0; page < 5 && next; page++) {
          const tx = await pluggyJson(`/v2/transactions${next}`, key);
          const rows = Array.isArray(tx["results"]) ? (tx["results"] as PluggyApiTransaction[]) : [];
          const txDtos: SyncedTxDto[] = [];
          for (const t of rows) {
            if (!t.id || !Number.isFinite(Number(t.amount))) continue;
            const id = `pluggy_${s}_${String(t.id).replace(/[^\w-]/g, "_")}`.slice(0, 128);
            const rawDate = String(t.date || "").slice(0, 10);
            const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : fallbackIso;
            const safeDesc = String(t.description || "Movimentação").trim().slice(0, 160) || "Movimentação";
            const dto: SyncedTxDto = {
              id,
              accountId,
              accountType: a.type as "BANK" | "CREDIT",
              accountName: name.slice(0, 100),
              institution,
              description: safeDesc,
              amountCents: Math.round(Number(t.amount) * 100),
              date: safeDate,
              category: String(t.category || "Sem categoria").slice(0, 60),
            };
            txDtos.push(dto);
            syncedTransactions.set(id, dto);
            transactions++;
          }

          if (adminWritable) {
            for (let x = 0; x < txDtos.length && adminWritable; x += 250) {
              try {
                const batch = adminDb.batch();
                for (const dto of txDtos.slice(x, x + 250)) {
                  const ref = adminDb.doc(`users/${uid}/transactions/${dto.id}`);
                  const existingTx = await ref.get();
                  batch.set(
                    ref,
                    {
                      ownerId: uid,
                      accountId: dto.accountId,
                      accountType: dto.accountType,
                      accountName: dto.accountName,
                      institution: dto.institution,
                      description: dto.description,
                      amountCents: dto.amountCents,
                      date: dto.date,
                      category: dto.category,
                      updatedAt: FieldValue.serverTimestamp(),
                      ...(existingTx.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
                    },
                    { merge: true },
                  );
                }
                await batch.commit();
              } catch (err) {
                if (!isPermissionDeniedError(err)) throw err;
                adminWritable = false;
              }
            }
          }

          next =
            typeof tx["next"] === "string" && tx["next"].startsWith("?") ? tx["next"] : "";
        }
      }
    }

    res.json({
      ok: true,
      accounts,
      transactions,
      persistedOnServer: adminWritable,
      storageMode: config.storageMode,
      ...(adminWritable
        ? {}
        : {
            syncedPayload: {
              banks: syncedBanks,
              cards: syncedCards,
              transactions: [...syncedTransactions.values()],
            },
          }),
    });
  } catch (e) {
    const formatted = formatAdminError(e);
    res.status(formatted.status).json({ error: formatted.message });
  }
});

function isAllowedFiscalGovUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "https:") return null;
    const host = parsed.hostname.toLowerCase();
    if (!host.endsWith(".gov.br")) return null;
    return parsed;
  } catch {
    return null;
  }
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseBrDecimalToCents(raw: string): number {
  const match = raw.replace(/\./g, "").match(/(\d+),(\d{2})/);
  if (!match) return 0;
  return Number(match[1]) * 100 + Number(match[2]);
}

function extractPublicNfceHtml(html: string) {
  const lower = html.toLowerCase();
  const hasCaptcha =
    lower.includes("g-recaptcha") ||
    lower.includes("hcaptcha") ||
    lower.includes("cf-turnstile") ||
    lower.includes("captcha") ||
    lower.includes("gov.br/oauth2") ||
    lower.includes("acesso negado");

  if (hasCaptcha) {
    return { requiresHumanAction: true as const };
  }

  const storeMatch =
    html.match(/id=["']u20["'][^>]*>([^<]+)</i) ||
    html.match(/class=["'][^"']*txtTopo[^"']*["'][^>]*>([^<]+)</i);
  const store = storeMatch?.[1] ? decodeHtmlEntities(storeMatch[1]) : "";

  const cnpjMatch = html.match(/CNPJ:\s*([\d./-]{14,20})/i);
  const cnpj = cnpjMatch?.[1]?.trim() ?? "";

  const dateMatch = html.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}:\d{2})?/);
  const issuedAt = dateMatch?.[3] && dateMatch[2] && dateMatch[1]
    ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`
    : "";
  const issuedTime = dateMatch?.[4] ?? "";

  const totalMatch =
    html.match(/Valor\s+a\s+pagar[\s\S]{0,180}?R\$\s*([\d.,]+)/i) ||
    html.match(/Valor\s+total[\s\S]{0,180}?R\$\s*([\d.,]+)/i);
  const totalCents = totalMatch?.[1] ? parseBrDecimalToCents(totalMatch[1]) : 0;

  const items: Array<{
    description: string;
    quantity: number;
    unit: string;
    unitPriceCents: number;
    totalCents: number;
  }> = [];

  const rowRegex = /<tr[^>]*id=["']Item\s*\+\s*\d+["'][^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;
  while ((rowMatch = rowRegex.exec(html)) !== null && items.length < 150) {
    const rowHtml = rowMatch[1] ?? "";
    if (!rowHtml) continue;
    const titleMatch = rowHtml.match(/class=["'][^"']*txtTit[^"']*["'][^>]*>([^<]+)</i);
    const qtyMatch = rowHtml.match(/Qtde\.?:?\s*<\/strong>\s*([\d.,]+)/i);
    const unitMatch = rowHtml.match(/UN:?\s*<\/strong>\s*([a-zA-Z0-9]+)/i);
    const unitPriceMatch = rowHtml.match(/Vl\.\s*Unit\.?:?\s*<\/strong>\s*([\d.,]+)/i);
    const totalItemMatch = rowHtml.match(/class=["'][^"']*valor[^"']*["'][^>]*>([^<]+)</i);

    const description = titleMatch?.[1] ? decodeHtmlEntities(titleMatch[1]).slice(0, 250) : "";
    if (!description) continue;
    const quantity = qtyMatch?.[1] ? Number(qtyMatch[1].replace(/\./g, "").replace(",", ".")) || 1 : 1;
    const unit = unitMatch?.[1] ? unitMatch[1].trim().slice(0, 12) : "un";
    const unitPriceCents = unitPriceMatch?.[1] ? parseBrDecimalToCents(unitPriceMatch[1]) : 0;
    const itemTotalCents = totalItemMatch?.[1]
      ? parseBrDecimalToCents(totalItemMatch[1])
      : Math.round(quantity * unitPriceCents);
    items.push({
      description,
      quantity,
      unit,
      unitPriceCents: unitPriceCents || (quantity > 0 ? Math.round(itemTotalCents / quantity) : 0),
      totalCents: itemTotalCents,
    });
  }

  return {
    requiresHumanAction: false as const,
    store,
    cnpj,
    issuedAt,
    issuedTime,
    totalCents,
    items,
  };
}

router.post("/fiscal/lookup", async (req: Identified, res) => {
  try {
    const rawUrl = String((req.body as { url?: unknown } | undefined)?.url || "").trim();
    const safeUrl = isAllowedFiscalGovUrl(rawUrl);
    if (!safeUrl) {
      res.status(400).json({
        error: "Informe uma URL HTTPS oficial de portal fiscal (*.gov.br).",
      });
      return;
    }

    const upstream = await fetch(safeUrl.toString(), {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; OrionFiscalConsulta/1.0)",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });

    const finalUrl = upstream.url || safeUrl.toString();
    const contentType = upstream.headers.get("content-type") || "";
    const text = await upstream.text();

    if (!upstream.ok) {
      res.json({
        status: "requires_human_action",
        portalUrl: finalUrl,
        message: `O portal estadual respondeu HTTP ${upstream.status}. Consulte manualmente no portal oficial e importe o XML, PDF ou foto.`,
      });
      return;
    }

    if (contentType.includes("xml") || text.trim().startsWith("<?xml") || text.includes("<infNFe")) {
      res.json({
        status: "xml",
        portalUrl: finalUrl,
        xml: text.slice(0, 1_500_000),
      });
      return;
    }

    const extracted = extractPublicNfceHtml(text);
    if (extracted.requiresHumanAction) {
      res.json({
        status: "requires_human_action",
        portalUrl: finalUrl,
        message:
          "O portal estadual exige validação humana (CAPTCHA ou login). Abra o portal oficial e importe o XML, PDF ou foto da nota.",
      });
      return;
    }

    if (!extracted.store && extracted.items.length === 0 && extracted.totalCents === 0) {
      res.json({
        status: "partial",
        portalUrl: finalUrl,
        message:
          "Documento identificado, mas os produtos ainda não puderam ser extraídos automaticamente desse layout de portal.",
      });
      return;
    }

    res.json({
      status: extracted.items.length > 0 ? "extracted" : "partial",
      portalUrl: finalUrl,
      receipt: {
        store: extracted.store,
        cnpj: extracted.cnpj,
        issuedAt: extracted.issuedAt,
        issuedTime: extracted.issuedTime,
        totalCents: extracted.totalCents,
        items: extracted.items,
      },
    });
  } catch (e) {
    res.json({
      status: "requires_human_action",
      portalUrl: String((req.body as { url?: unknown } | undefined)?.url || ""),
      message:
        e instanceof Error
          ? `Não foi possível consultar o portal automaticamente (${e.message}). Consulte manualmente e anexe o XML, PDF ou foto.`
          : "Consulta automática indisponível no momento.",
    });
  }
});

router.post("/fiscal/ocr", async (req: Identified, res) => {
  try {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) {
      res
        .status(422)
        .json({ error: "Configure GEMINI_API_KEY no servidor para habilitar OCR" });
      return;
    }
    const body = (req.body || {}) as { mimeType?: unknown; base64?: unknown };
    const { mimeType, base64 } = body;
    if (
      typeof mimeType !== "string" ||
      !["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(mimeType) ||
      typeof base64 !== "string" ||
      base64.length > 11_000_000
    ) {
      res.status(400).json({ error: "Anexe foto ou PDF até 8 MB" });
      return;
    }

    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });

    const response = await ai.models.generateContent({
      model: "gemini-4-hydrogen",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64,
            },
          },
          {
            text: "Extraia os dados reais desta nota fiscal brasileira (NFC-e, NF-e, DANFE, NFS-e ou cupom). Retorne SOMENTE campos legíveis no documento, com totalCents, discountCents e unitPriceCents em inteiros de centavos, issuedAt em YYYY-MM-DD, issuedTime em HH:MM e accessKey com 44 dígitos. Não invente dados ausentes ou ilegíveis; liste quaisquer campos incertos em lowConfidenceFields.",
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            docType: { type: Type.STRING },
            store: { type: Type.STRING },
            cnpj: { type: Type.STRING },
            emitterAddress: { type: Type.STRING },
            issuedAt: { type: Type.STRING },
            issuedTime: { type: Type.STRING },
            accessKey: { type: Type.STRING },
            number: { type: Type.STRING },
            series: { type: Type.STRING },
            paymentMethod: { type: Type.STRING },
            discountCents: { type: Type.INTEGER },
            totalCents: { type: Type.INTEGER },
            lowConfidenceFields: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  code: { type: Type.STRING },
                  ean: { type: Type.STRING },
                  description: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unit: { type: Type.STRING },
                  unitPriceCents: { type: Type.INTEGER },
                  discountCents: { type: Type.INTEGER },
                  totalCents: { type: Type.INTEGER },
                },
              },
            },
          },
        },
      },
    });

    const output = response.text?.trim();
    if (!output) {
      throw new Error("OCR não retornou dados");
    }
    res.json({ receipt: JSON.parse(output) });
  } catch (e) {
    res.status(424).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

router.use("/pluggy", (req, res) => {
  res.status(404).json({
    error: `Endpoint Pluggy não encontrado (${req.method} /api/pluggy${req.path}).`,
  });
});

export default router;
