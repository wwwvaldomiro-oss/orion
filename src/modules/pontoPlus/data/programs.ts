import {
  AirportItem,
  CabinClass,
  FlightOption,
  NearbyDatePrice,
  ProgramCatalogItem,
} from '../types';
import { addDaysISO, formatShortWeekdayDate } from '../utils/formatters';

export const PROGRAM_CATALOG: ProgramCatalogItem[] = [
  {
    id: 'latam',
    name: 'LATAM Pass',
    shortCode: 'LA',
    category: 'aerea',
    accentHex: '#B91C1C',
    marketCpm: 24.5,
    defaultCpfLimit: 24,
    supportsSale: true,
    tiers: ['Padrão', 'Clube LATAM', 'Gold', 'Platinum', 'Black'],
    description: 'Programa oficial da LATAM Airlines com tabela dinâmica e parceiros Oneworld/Delta.',
  },
  {
    id: 'smiles',
    name: 'Smiles (GOL)',
    shortCode: 'G3',
    category: 'aerea',
    accentHex: '#EA580C',
    marketCpm: 17.8,
    defaultCpfLimit: 25,
    supportsSale: true,
    tiers: ['Padrão', 'Clube Smiles', 'Prata', 'Ouro', 'Diamante'],
    description: 'Programa da GOL com ampla malha nacional e parceiras como Air France, KLM e American.',
  },
  {
    id: 'azul',
    name: 'Azul Fidelidade',
    shortCode: 'AD',
    category: 'aerea',
    accentHex: '#0369A1',
    marketCpm: 19.2,
    defaultCpfLimit: 5,
    supportsSale: true,
    tiers: ['Básico', 'Clube Azul', 'Topázio', 'Safira', 'Diamante'],
    description: 'Programa da Azul Linhas Aéreas com Portal Interline e limite de 5 CPFs gratuitos.',
  },
  {
    id: 'tap',
    name: 'TAP Miles&Go',
    shortCode: 'TP',
    category: 'aerea',
    accentHex: '#047857',
    marketCpm: 28.0,
    defaultCpfLimit: 0,
    supportsSale: true,
    tiers: ['Miles', 'Club TAP', 'Silver', 'Gold'],
    description: 'Excelente para emissões na Star Alliance e trechos diretos Brasil–Europa.',
  },
  {
    id: 'livelo',
    name: 'Livelo',
    shortCode: 'LV',
    category: 'banco',
    accentHex: '#9333EA',
    marketCpm: 32.0,
    defaultCpfLimit: 0,
    supportsSale: false,
    tiers: ['Gratuito', 'Clube Classic', 'Clube Plus', 'Clube Mega'],
    description: 'Hub de pontos Banco do Brasil e Bradesco com transferências bonificadas para aéreas.',
  },
  {
    id: 'esfera',
    name: 'Esfera Santander',
    shortCode: 'ES',
    category: 'banco',
    accentHex: '#DC2626',
    marketCpm: 31.5,
    defaultCpfLimit: 0,
    supportsSale: false,
    tiers: ['Padrão', 'Clube Esfera 1.000', 'Clube Esfera 5.000'],
    description: 'Programa de pontos do Santander com promoções frequentes de transferência até 100%.',
  },
  {
    id: 'c6',
    name: 'C6 Átomos',
    shortCode: 'C6',
    category: 'banco',
    accentHex: '#1E293B',
    marketCpm: 29.0,
    defaultCpfLimit: 0,
    supportsSale: false,
    tiers: ['C6 Padrão', 'C6 Carbon'],
    description: 'Pontos que não expiram para transferência para Livelo e companhias aéreas.',
  },
  {
    id: 'accor',
    name: 'ALL Accor',
    shortCode: 'AC',
    category: 'varejo',
    accentHex: '#1D4ED8',
    marketCpm: 58.0,
    defaultCpfLimit: 0,
    supportsSale: false,
    tiers: ['Classic', 'Silver', 'Gold', 'Platinum'],
    description: 'Programa hoteleiro com conversão fixa em euros (€ 40 a cada 2.000 pontos Reward).',
  },
  {
    id: 'stix',
    name: 'Stix (Pão de Açúcar / Raia)',
    shortCode: 'SX',
    category: 'varejo',
    accentHex: '#0F766E',
    marketCpm: 12.0,
    defaultCpfLimit: 0,
    supportsSale: false,
    tiers: ['Padrão'],
    description: 'Pontos do varejo alimentício e farmácias conversíveis em descontos ou Livelo.',
  },
  {
    id: 'kmvantagens',
    name: 'Km de Vantagens',
    shortCode: 'KM',
    category: 'varejo',
    accentHex: '#0284C7',
    marketCpm: 10.5,
    defaultCpfLimit: 0,
    supportsSale: false,
    tiers: ['Padrão', 'Abastece Aí'],
    description: 'Programa dos Postos Ipiranga com troca direta para milhas LATAM Pass e Azul.',
  },
];

export const AIRPORTS: AirportItem[] = [
  { code: 'GRU', city: 'São Paulo', name: 'Guarulhos Intl', region: 'nacional' },
  { code: 'CGH', city: 'São Paulo', name: 'Congonhas', region: 'nacional' },
  { code: 'VCP', city: 'Campinas', name: 'Viracopos', region: 'nacional' },
  { code: 'GIG', city: 'Rio de Janeiro', name: 'Galeão', region: 'nacional' },
  { code: 'SDU', city: 'Rio de Janeiro', name: 'Santos Dumont', region: 'nacional' },
  { code: 'BSB', city: 'Brasília', name: 'Presidente JK', region: 'nacional' },
  { code: 'CNF', city: 'Belo Horizonte', name: 'Confins', region: 'nacional' },
  { code: 'REC', city: 'Recife', name: 'Guararapes', region: 'nacional' },
  { code: 'SSA', city: 'Salvador', name: 'Dep. Luís Eduardo Magalhães', region: 'nacional' },
  { code: 'FOR', city: 'Fortaleza', name: 'Pinto Martins', region: 'nacional' },
  { code: 'FLN', city: 'Florianópolis', name: 'Hercílio Luz', region: 'nacional' },
  { code: 'POA', city: 'Porto Alegre', name: 'Salgado Filho', region: 'nacional' },
  { code: 'LIS', city: 'Lisboa', name: 'Humberto Delgado', region: 'internacional' },
  { code: 'MAD', city: 'Madri', name: 'Barajas', region: 'internacional' },
  { code: 'CDG', city: 'Paris', name: 'Charles de Gaulle', region: 'internacional' },
  { code: 'MIA', city: 'Miami', name: 'Miami Intl', region: 'internacional' },
  { code: 'MCO', city: 'Orlando', name: 'Orlando Intl', region: 'internacional' },
  { code: 'JFK', city: 'Nova York', name: 'John F. Kennedy', region: 'internacional' },
  { code: 'SCL', city: 'Santiago', name: 'Arturo Merino Benítez', region: 'internacional' },
  { code: 'EZE', city: 'Buenos Aires', name: 'Ezeiza', region: 'internacional' },
];

export function getProgramById(programId: string): ProgramCatalogItem {
  return (
    PROGRAM_CATALOG.find((p) => p.id === programId) || {
      id: programId,
      name: programId,
      shortCode: programId.slice(0, 2).toUpperCase(),
      category: 'aerea',
      accentHex: '#334155',
      marketCpm: 20,
      defaultCpfLimit: 25,
      supportsSale: false,
      tiers: ['Padrão'],
      description: 'Programa de fidelidade personalizado.',
    }
  );
}

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function searchFlightsDeterministic(params: {
  origin: string;
  destination: string;
  departureDate: string;
  passengers: number;
  cabin: CabinClass;
}): { options: FlightOption[]; nearbyDates: NearbyDatePrice[] } {
  const { origin, destination, departureDate, passengers, cabin } = params;
  const destAirport = AIRPORTS.find((a) => a.code === destination);
  const origAirport = AIRPORTS.find((a) => a.code === origin);
  const isIntl =
    destAirport?.region === 'internacional' || origAirport?.region === 'internacional';

  const baseCash = isIntl
    ? cabin === 'executiva'
      ? 11400
      : 3850
    : cabin === 'executiva'
      ? 2450
      : 780;

  const baseMiles = isIntl
    ? cabin === 'executiva'
      ? 168000
      : 68000
    : cabin === 'executiva'
      ? 42000
      : 16500;

  const taxes = isIntl ? 495 : 88;

  const templates = [
    {
      programId: 'latam',
      programName: 'LATAM Pass',
      airline: 'LATAM Airlines',
      prefix: 'LA',
      dep: '08:15',
      arr: isIntl ? '20:40' : '10:35',
      dur: isIntl ? '10h 25m' : '2h 20m',
      stops: 0,
      cashFactor: 1.0,
      milesFactor: 0.94,
    },
    {
      programId: 'smiles',
      programName: 'Smiles (GOL)',
      airline: 'GOL Linhas Aéreas',
      prefix: 'G3',
      dep: '11:30',
      arr: isIntl ? '23:55' : '13:55',
      dur: isIntl ? '12h 25m' : '2h 25m',
      stops: isIntl ? 1 : 0,
      cashFactor: 0.91,
      milesFactor: 1.12,
    },
    {
      programId: 'azul',
      programName: 'Azul Fidelidade',
      airline: 'Azul Linhas Aéreas',
      prefix: 'AD',
      dep: '14:45',
      arr: isIntl ? '06:10' : '17:20',
      dur: isIntl ? '11h 25m' : '2h 35m',
      stops: origin === 'VCP' ? 0 : 1,
      cashFactor: 0.97,
      milesFactor: 1.02,
    },
    {
      programId: 'tap',
      programName: 'TAP Miles&Go',
      airline: 'TAP Air Portugal',
      prefix: 'TP',
      dep: '21:10',
      arr: isIntl ? '10:45' : '23:55',
      dur: isIntl ? '9h 35m' : '2h 45m',
      stops: isIntl && (destination === 'LIS' || destination === 'CDG' || destination === 'MAD') ? 0 : 1,
      cashFactor: 1.15,
      milesFactor: 0.88,
    },
  ];

  const filteredTemplates = isIntl ? templates : templates.slice(0, 3);

  const options: FlightOption[] = filteredTemplates.map((tpl, idx) => {
    const seed = hashSeed(`${origin}-${destination}-${departureDate}-${cabin}-${tpl.programId}`);
    const jitterCash = 0.86 + ((seed % 32) / 100);
    const jitterMiles = 0.84 + (((seed >> 4) % 36) / 100);

    const cashPerPax = Math.round(baseCash * tpl.cashFactor * jitterCash);
    const rawMiles = Math.round((baseMiles * tpl.milesFactor * jitterMiles) / 500) * 500;

    return {
      id: `${tpl.programId}-${departureDate}-${idx}`,
      programId: tpl.programId,
      programName: tpl.programName,
      airline: tpl.airline,
      flightNumber: `${tpl.prefix} ${3100 + (seed % 899)}`,
      departureTime: tpl.dep,
      arrivalTime: tpl.arr,
      duration: tpl.dur,
      stops: tpl.stops,
      cashPriceBrl: cashPerPax * passengers,
      taxesBrl: taxes * passengers,
      milesRequired: rawMiles * passengers,
      seatsLeft: 2 + (seed % 7),
    };
  });

  const nearbyDates: NearbyDatePrice[] = [-3, -2, -1, 0, 1, 2, 3].map((offset) => {
    const date = addDaysISO(departureDate, offset);
    const seed = hashSeed(`${origin}-${destination}-${date}-${cabin}`);
    const dayFactor = 0.82 + ((seed % 34) / 100);
    const minMiles = Math.round((baseMiles * 0.85 * dayFactor) / 500) * 500 * passengers;
    const minCashBrl = Math.round(baseCash * 0.88 * dayFactor) * passengers;
    const progs = isIntl
      ? ['LATAM Pass', 'TAP Miles&Go', 'Azul Fidelidade', 'Smiles']
      : ['LATAM Pass', 'Smiles', 'Azul Fidelidade'];
    return {
      date,
      label: formatShortWeekdayDate(date),
      minMiles,
      minCashBrl,
      bestProgram: progs[seed % progs.length] ?? 'LATAM Pass',
    };
  });

  return { options, nearbyDates };
}
