import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const rulesText = fs.readFileSync(path.resolve("firestore.rules"), "utf8");
const blueprint = JSON.parse(fs.readFileSync(path.resolve("firebase-blueprint.json"), "utf8")) as {
  entities: Record<string, unknown>;
  firestore: Record<string, unknown>;
};

describe("Órion Firestore Security Rules & Blueprint Integrity", () => {
  it("enforces default-deny global rule and email verification", () => {
    expect(rulesText).toContain("allow read, write: if false;");
    expect(rulesText).toContain("request.auth.token.email_verified == true");
    expect(rulesText).toContain("isValidId(id)");
  });

  it("defines match blocks for every blueprint Firestore collection", () => {
    const paths = Object.keys(blueprint.firestore);
    expect(paths.length).toBe(42);
    expect(rulesText).toContain("match /users/{userId}");
    for (const sub of [
      "fiscalReceipts",
      "banks",
      "cards",
      "cardMonthSnapshots",
      "transactions",
      "revenueSources",
      "revenueContracts",
      "revenueEntries",
      "revenueEvents",
      "annualYears",
      "annualExpenses",
      "monthlyBills",
      "paymentEvents",
      "payableContracts",
      "payableInstallments",
      "personalAgenda",
      "agendaChecks",
      "agendaOverrides",
      "contactCategories",
      "contactSubcategories",
      "agendaContacts",
      "agendaAlarms",
      "agendaNotes",
      "calculatorHistory",
      "agendaSettings",
      "shoppingList",
      "vehicles",
      "garageDrivers",
      "garageFuelings",
      "garageMaintenances",
      "garageExpenses",
      "garageFines",
      "garageDocuments",
      "garageChecklists",
      "garageRoutes",
      "garageReminders",
      "fuelLogs",
      "trips",
      "loyaltyHolders",
      "loyaltyAccounts",
      "pointTransactions",
    ]) {
      expect(rulesText).toContain(`match /${sub}/`);
    }
  });

  it("guards against the Dirty Dozen payload flaws in rule primitives", () => {
    // No blanket signed-in reads or client-delegated list rules
    expect(rulesText).not.toMatch(/allow\s+(read|list):\s*if\s+isSignedIn\(\)\s*;/);
    // Strict keys & request.time timestamp checks
    expect(rulesText).toContain("data.createdAt == request.time");
    expect(rulesText).toContain("data.updatedAt == request.time");
    expect(rulesText).toContain("incoming().ownerId == existing().ownerId");
    // Bounded array limits
    expect(rulesText).toContain("data.watchlistTickers.size() <= 50");
    expect(rulesText).toContain("data.items.size() <= 30");
    expect(rulesText).toContain("data.transactions.size() <= 200");
    expect(rulesText).toContain("data.allowedVehicleIds.size() <= 30");
    expect(rulesText).toContain("data.items.size() >= 1 && data.items.size() <= 25");
    expect(rulesText).toContain("data.attachments.size() <= 20");
    expect(rulesText).toContain("data.stores is list && data.stores.size() <= 30");
    expect(rulesText).toContain("data.phones is list && data.phones.size() <= 10");
    // Referential integrity on vehicle and payableContract subcollections
    expect(rulesText).toContain(
      "exists(/databases/$(database)/documents/users/$(userId)/vehicles/$(incoming().vehicleId))",
    );
    expect(rulesText).toContain(
      "exists(/databases/$(database)/documents/users/$(userId)/payableContracts/$(incoming().contractId))",
    );
  });

  it("enforces fiscalReceipts allowlists, enum guards, and bounds", () => {
    expect(rulesText).toContain("data.docType in ['nfce_65', 'nfe_55', 'nfse', 'recibo']");
    expect(rulesText).toContain("data.processingStatus in ['complete', 'partial', 'pending', 'error']");
    expect(rulesText).toContain("data.sourceOrigin in ['manual', 'qr', 'url', 'xml', 'ocr', 'import']");
    expect(rulesText).toContain("data.items is list && data.items.size() <= 150");
    expect(rulesText).toContain("data.lowConfidenceFields is list && data.lowConfidenceFields.size() <= 20");
    expect(rulesText).toContain("data.warranty is map");
    expect(rulesText).toContain("'fileHash'");
    expect(rulesText).toContain("'storagePath'");
    expect(rulesText).toContain("'categoryTotalsCents'");
    expect(rulesText).toContain("'monthlyCategoryCents'");
  });

  it("enforces paymentEvents schema and append-only audit constraints", () => {
    expect(rulesText).toContain("function isValidPaymentEvent(data, userId)");
    expect(rulesText).toContain(
      "data.kind in ['pagamento', 'parcial', 'quitacao_antecipada', 'correcao', 'estorno']",
    );
    expect(rulesText).toContain(
      "incoming().diff(existing()).affectedKeys().hasOnly(['attachments', 'updatedAt'])",
    );
  });

  it("enforces Agenda reformulation validators and bounds", () => {
    expect(rulesText).toContain("function isValidAgendaOverride(data, userId)");
    expect(rulesText).toContain("function isValidAgendaContact(data, userId)");
    expect(rulesText).toContain("function isValidAgendaAlarm(data, userId)");
    expect(rulesText).toContain("function isValidAgendaNote(data, userId)");
    expect(rulesText).toContain("function isValidCalculatorHistoryEntry(data, userId)");
    expect(rulesText).toContain("function isValidAgendaSettings(data, userId)");
    expect(rulesText).toContain("data.recurrence in ['none', 'daily', '12x36', 'weekly', 'monthly', 'yearly', 'custom']");
    expect(rulesText).toContain("data.leapYearBirthdayRule in ['feb28', 'mar01']");
  });

  it("isolates server-only pluggySettings credentials from client access", () => {
    expect(rulesText).toContain("match /pluggySettings/{slotId}");
    expect(rulesText).toMatch(/match \/pluggySettings\/\{slotId\}[\s\S]*?allow read, write: if false;/);
  });
});

