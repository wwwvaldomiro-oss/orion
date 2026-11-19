export type ReceiptKind = 'mercado' | 'aquisicoes' | 'geral';
export type ReceiptItem = { description: string; quantity: number; unit: string; unitPriceCents: number; totalCents: number };
export type FiscalReceipt = { id: string; kind: ReceiptKind; store: string; cnpj: string; issuedAt: string; accessKey: string; number: string; series: string; paymentMethod: string; totalCents: number; items: ReceiptItem[]; documentUrl?: string; sourceUrl?: string; linkedTransactionId?: string; createdAt?: unknown; updatedAt?: unknown; ownerId?: string };
export function cleanName(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim(); }
export function receiptReport(receipts: FiscalReceipt[]) {
  const products = new Map<string,{name:string; quantity:number; totalCents:number; count:number; minCents:number; maxCents:number; stores:Set<string>}>();
  const stores = new Map<string,{name:string; totalCents:number; visits:number}>();
  for(const r of receipts.filter(x=>x.kind==='mercado')) { const storeKey=cleanName(r.store); const s=stores.get(storeKey)??{name:r.store,totalCents:0,visits:0}; s.totalCents+=r.totalCents;s.visits++;stores.set(storeKey,s); for(const item of r.items) { const k=cleanName(item.description);const p=products.get(k)??{name:item.description,quantity:0,totalCents:0,count:0,minCents:Infinity,maxCents:0,stores:new Set<string>()}; p.quantity+=item.quantity;p.totalCents+=item.totalCents;p.count++;p.minCents=Math.min(p.minCents,item.unitPriceCents);p.maxCents=Math.max(p.maxCents,item.unitPriceCents);p.stores.add(r.store);products.set(k,p); } }
  return { products:[...products.values()].map(p=>({...p,averageCents:p.quantity>0?Math.round(p.totalCents/p.quantity):0,stores:[...p.stores]})).sort((a,b)=>b.count-a.count), stores:[...stores.values()].sort((a,b)=>b.totalCents-a.totalCents) };
}
export function extractAccessKey(value:string){const match=value.match(/(?:\d[\s.]*){44}/);return match?match[0].replace(/\D/g,''):'';}
export function suggestReceiptKind(store:string):ReceiptKind {return /SUPERMERCADO|ATACAD|MERCADO|HIPERMERCADO|ASSAI|CARREFOUR|ATACAREJO|DIA A DIA|HORTIFRUTI|CEASA|SACOLAO/i.test(cleanName(store))?'mercado':'geral';}
