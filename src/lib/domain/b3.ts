export const B3_STOCKS: { symbol: string; name: string; sector: string }[] = [
  { symbol: "PETR4", name: "Petrobras PN", sector: "Energia" },
  { symbol: "VALE3", name: "Vale ON", sector: "Mineração" },
  { symbol: "ITUB4", name: "Itaú Unibanco PN", sector: "Bancos" },
  { symbol: "BPAC11", name: "BTG Pactual Units", sector: "Bancos" },
  { symbol: "PETR3", name: "Petrobras ON", sector: "Energia" },
  { symbol: "BBDC4", name: "Bradesco PN", sector: "Bancos" },
  { symbol: "BBAS3", name: "Banco do Brasil ON", sector: "Bancos" },
  { symbol: "B3SA3", name: "B3 ON", sector: "Serviços Financeiros" },
  { symbol: "ITSA4", name: "Itaúsa PN", sector: "Holding" },
  { symbol: "ABEV3", name: "Ambev ON", sector: "Bebidas" },
  { symbol: "WEGE3", name: "WEG ON", sector: "Bens Industriais" },
  { symbol: "RENT3", name: "Localiza ON", sector: "Locação" },
  { symbol: "SUZB3", name: "Suzano ON", sector: "Papel e Celulose" },
  { symbol: "GGBR4", name: "Gerdau PN", sector: "Siderurgia" },
  { symbol: "PRIO3", name: "PRIO ON", sector: "Energia" },
  { symbol: "RADL3", name: "Raia Drogasil ON", sector: "Varejo Saúde" },
  { symbol: "LREN3", name: "Lojas Renner ON", sector: "Varejo" },
  { symbol: "MGLU3", name: "Magazine Luiza ON", sector: "Varejo" },
  { symbol: "BBSE3", name: "BB Seguridade ON", sector: "Seguros" },
  { symbol: "SANB11", name: "Santander Brasil Units", sector: "Bancos" },
  { symbol: "RDOR3", name: "Rede D'Or ON", sector: "Saúde" },
  { symbol: "CSNA3", name: "CSN ON", sector: "Siderurgia" },
  { symbol: "USIM5", name: "Usiminas PNA", sector: "Siderurgia" },
  { symbol: "EMBJ3", name: "Embraer ON", sector: "Aviação" },
  { symbol: "VIVT3", name: "Telefônica Brasil ON", sector: "Telecom" },
  { symbol: "TIMS3", name: "TIM ON", sector: "Telecom" },
  { symbol: "CMIG4", name: "Cemig PN", sector: "Utilidade Pública" },
  { symbol: "SBSP3", name: "Sabesp ON", sector: "Saneamento" },
  { symbol: "HAPV3", name: "Hapvida ON", sector: "Saúde" },
  { symbol: "RAIL3", name: "Rumo ON", sector: "Logística" },
  { symbol: "CSAN3", name: "Cosan ON", sector: "Energia" },
  { symbol: "UGPA3", name: "Ultrapar ON", sector: "Energia" },
  { symbol: "TOTS3", name: "Totvs ON", sector: "Tecnologia" },
  { symbol: "KLBN11", name: "Klabin Units", sector: "Papel e Celulose" },
  { symbol: "CPLE3", name: "Copel ON", sector: "Utilidade Pública" },
  { symbol: "CYRE3", name: "Cyrela ON", sector: "Construção" },
  { symbol: "VBBR3", name: "Vibra Energia ON", sector: "Energia" },
  { symbol: "COGN3", name: "Cogna ON", sector: "Educação" },
  { symbol: "NATU3", name: "Natura ON", sector: "Consumo" },
  { symbol: "MBRF3", name: "MBRF Global Foods ON", sector: "Alimentos" },
];

export function stockName(symbol: string): string {
  return B3_STOCKS.find((x) => x.symbol === symbol)?.name ?? symbol;
}

export function suggestStocks(q: string, limit = 8) {
  const t = q.trim().toUpperCase();
  if (!t) return [];
  return B3_STOCKS.filter(
    (s) => s.symbol.startsWith(t) || s.name.toUpperCase().includes(t),
  ).slice(0, limit);
}
