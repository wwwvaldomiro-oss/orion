import { describe, expect, it } from 'vitest';
import { PROGRAM_CATALOG, getProgramById } from './data/programs';
import {
  addDaysISO,
  daysUntilDate,
  formatCurrency,
  formatDateBR,
  formatPoints,
  sanitizeId,
} from './utils/formatters';

describe('Ponto Plus — Catálogo e Formatadores', () => {
  it('formata pontos sem casas decimais no padrão pt-BR', () => {
    expect(formatPoints(125400)).toBe('125.400');
    expect(formatPoints(999.6)).toBe('1.000');
  });

  it('formata valores em BRL corretamente', () => {
    const formatted = formatCurrency(2450.5);
    expect(formatted).toContain('R$');
    expect(formatted).toContain('2.450,50');
  });

  it('formata datas ISO e calcula adição de dias com segurança', () => {
    expect(formatDateBR('2026-11-20')).toBe('20/11/2026');
    expect(formatDateBR('')).toBe('Sem vencimento');
    expect(addDaysISO('2026-11-20', 10)).toBe('2026-11-30');
    expect(daysUntilDate('')).toBeNull();
  });

  it('sanitiza identificadores para uso seguro no Firestore', () => {
    expect(sanitizeId('latam / #123')).toBe('latam123');
    expect(sanitizeId('user_abc-1')).toBe('user_abc-1');
    expect(sanitizeId('!!!')).toBe('id');
  });

  it('expõe catálogo completo de programas e retorna fallback válido', () => {
    expect(PROGRAM_CATALOG.length).toBeGreaterThanOrEqual(8);
    expect(getProgramById('latam').name).toBe('LATAM Pass');
    expect(getProgramById('smiles').category).toBe('aerea');
    expect(getProgramById('livelo').category).toBe('banco');
    const fallback = getProgramById('desconhecido');
    expect(fallback.id).toBe('desconhecido');
    expect(fallback.shortCode).toBe('DE');
    expect(fallback.category).toBe('aerea');
  });
});
