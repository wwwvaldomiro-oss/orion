export type ProgramCategory = 'aerea' | 'banco' | 'varejo';

export type HolderRelationship = 'Titular' | 'Cônjuge' | 'Familiar' | 'Amigo';

export type TransactionType =
  | 'acumulo'
  | 'transferencia_entrada'
  | 'transferencia_saida'
  | 'resgate'
  | 'venda'
  | 'ajuste';

export type CabinClass = 'economica' | 'executiva';

export type AlertStatus = 'ativo' | 'atingido' | 'pausado';

export type PayoutSpeed = 'programado_30d' | 'expresso_1d';

export type SaleStatus = 'em_analise' | 'aprovada' | 'paga' | 'cancelada';

export type AppSection =
  | 'dashboard'
  | 'programs'
  | 'family'
  | 'ledger';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  defaultValuationCpm: number;
}

export interface FamilyHolder {
  id: string;
  ownerId: string;
  name: string;
  relationship: HolderRelationship;
  cpfMasked: string;
  notes: string;
}

export interface LoyaltyAccount {
  id: string;
  ownerId: string;
  holderId: string;
  holderName: string;
  programId: string;
  programName: string;
  category: ProgramCategory;
  accountNumber: string;
  tier: string;
  balance: number;
  expiringPoints: number;
  expirationDate: string;
  avgCpm: number;
  cpfsUsed: number;
  cpfLimit: number;
}

export interface PointTransaction {
  id: string;
  ownerId: string;
  accountId: string;
  programName: string;
  holderName: string;
  type: TransactionType;
  points: number;
  description: string;
  date: string;
  cpm: number;
  totalBrl: number;
}

export interface FlightAlert {
  id: string;
  ownerId: string;
  origin: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  cabin: CabinClass;
  maxMiles: number;
  maxCashBrl: number;
  preferredProgram: string;
  status: AlertStatus;
}

export interface SaleQuote {
  id: string;
  ownerId: string;
  accountId: string;
  programName: string;
  holderName: string;
  milesAmount: number;
  ratePerThousand: number;
  totalBrl: number;
  payoutSpeed: PayoutSpeed;
  partnerName: string;
  status: SaleStatus;
  payoutDate: string;
}

export interface ProgramCatalogItem {
  id: string;
  name: string;
  shortCode: string;
  category: ProgramCategory;
  accentHex: string;
  marketCpm: number;
  defaultCpfLimit: number;
  supportsSale: boolean;
  tiers: string[];
  description: string;
}

export interface AirportItem {
  code: string;
  city: string;
  name: string;
  region: 'nacional' | 'internacional';
}

export interface FlightOption {
  id: string;
  programId: string;
  programName: string;
  airline: string;
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  stops: number;
  cashPriceBrl: number;
  taxesBrl: number;
  milesRequired: number;
  seatsLeft: number;
}

export interface NearbyDatePrice {
  date: string;
  label: string;
  minMiles: number;
  minCashBrl: number;
  bestProgram: string;
}
