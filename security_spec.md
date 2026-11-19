# Security Specification — Órion Workspace

## 1. Data Invariants
1. **Strict Ownership & Email Verification**: Every document in `/users/{userId}` and all subcollections (`/banks`, `/cards`, `/cardMonthSnapshots`, `/transactions`, `/revenueSources`, `/revenueContracts`, `/revenueEntries`, `/revenueEvents`, `/annualYears`, `/annualExpenses`, `/monthlyBills`, `/payableContracts`, `/payableInstallments`, `/personalAgenda`, `/agendaChecks`, `/shoppingList`, `/vehicles`, `/garageDrivers`, `/garageFuelings`, `/garageMaintenances`, `/garageExpenses`, `/garageFines`, `/garageDocuments`, `/garageChecklists`, `/garageRoutes`, `/garageReminders`, `/fuelLogs`, `/trips`) requires `request.auth != null && request.auth.token.email_verified == true && request.auth.uid == userId && incoming().ownerId == request.auth.uid`.
2. **Master Gate Parent Binding**: Every subcollection `get`, `create`, `update`, and `delete` verifies parent ownership via `get(/databases/$(database)/documents/users/$(userId)).data.ownerId == request.auth.uid`. Every `allow list` restricts reads via `resource.data.ownerId == request.auth.uid` without issuing parent `get()` calls inside list rules.
3. **Immutable Identity & Creation Timestamps**: `ownerId` and `createdAt` cannot change after document creation (`incoming().ownerId == existing().ownerId && incoming().createdAt == existing().createdAt`). `createdAt` must equal `request.time` on create; `updatedAt` must equal `request.time` on create and update.
4. **Relational Integrity**: On creation of `FuelLog`, `GarageFueling`, `GarageMaintenance`, `GarageExpense`, `GarageFine`, `GarageDocument`, `GarageChecklist`, `GarageRoute`, and `GarageReminder`, `vehicleId` must reference an existing vehicle document under `/users/$(userId)/vehicles/$(incoming().vehicleId)`. On creation of `PayableInstallment`, `contractId` must reference an existing payable contract under `/users/$(userId)/payableContracts/$(incoming().contractId)`.
5. **Bounded Arrays & Strict Types**: `watchlistTickers` is capped at 50 items; `PersonalAgendaRecord.items` is capped at 30 items; `CardMonthSnapshot.transactions` is capped at 200 items; `GarageDriver.allowedVehicleIds` is capped at 30 items; `GarageChecklist.items` is capped at 25 items; every string has explicit `.size()` bounds; every document enforces exact `hasAll` / `hasOnly` field sets on create and action-scoped `affectedKeys().hasOnly(...)` on update.

## 2. The "Dirty Dozen" Adversarial Payloads (All MUST fail with PERMISSION_DENIED)
1. **Unauthenticated Read/Write**: Read or write `/users/uid1` with `auth == null`.
2. **Unverified Email Write**: Write `/users/uid1` with `auth.uid == 'uid1'` and `token.email_verified == false`.
3. **Cross-User Ownership Spoof**: User `uid2` attempts `create` or `update` under `/users/uid1/banks/b1` or `/users/uid1/garageMaintenances/m1` even with `ownerId: 'uid2'`.
4. **Ghost / Shadow Field Injection**: Authenticated owner `uid1` creates `/users/uid1` or `/users/uid1/garageFines/f1` with extra `isAdmin: true` or `role: 'superuser'`.
5. **ID Poisoning Attack**: Create `/users/uid1/vehicles/${'x'.repeat(200)}` (exceeds 128 chars or invalid regex).
6. **Client Timestamp Forgery**: Create `/users/uid1/garageDocuments/d1` with backdated `createdAt` instead of `request.time`.
7. **Immutable Field Tampering**: Update `/users/uid1/garageMaintenances/m1` attempting to alter `ownerId`, `vehicleId`, or `createdAt`.
8. **Type / Bounds Poisoning**: Update `/users/uid1/vehicles/v1` with `fuelType: 'NUCLEAR'` or 1MB string in `notes`.
9. **Unbounded Array Injection**: Create `/users/uid1/garageChecklists/c1` with `items` having 40 entries (`> 25`) or `/users/uid1/garageDrivers/d1` with 50 `allowedVehicleIds` (`> 30`).
10. **PII Cross-User Read**: User `uid2` attempts `get` on `/users/uid1` or `/users/uid1/garageDrivers/d1` (which store email, Pix key, CNH number, phone).
11. **Orphan Vehicle Subrecord Write**: Create `/users/uid1/garageFuelings/gf1` or `/users/uid1/garageFines/fn1` pointing to a non-existent `vehicleId`.
12. **Blanket List Query**: User `uid2` attempts `list` on `/users/uid1/garageExpenses` without matching `resource.data.ownerId`.
