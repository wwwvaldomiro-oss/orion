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
    expect(paths.length).toBe(29);
    expect(rulesText).toContain("match /users/{userId}");
    for (const sub of [
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
      "payableContracts",
      "payableInstallments",
      "personalAgenda",
      "agendaChecks",
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
    // Referential integrity on vehicle and payableContract subcollections
    expect(rulesText).toContain(
      "exists(/databases/$(database)/documents/users/$(userId)/vehicles/$(incoming().vehicleId))",
    );
    expect(rulesText).toContain(
      "exists(/databases/$(database)/documents/users/$(userId)/payableContracts/$(incoming().contractId))",
    );
  });
});
