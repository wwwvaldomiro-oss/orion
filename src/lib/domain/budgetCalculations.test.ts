import { describe, expect, it } from "vitest";
import { additionalForecastByMonth, annualCommitmentsByMonth, annualSettlementByMonth, budgetBalance } from "./budgetCalculations";

const annual = [{
  id: "energia", months: {
    "01": { expectedCents: 20000, paidCents: 5000, isSettled: false },
    "02": { expectedCents: 15000, paidCents: 15000, isSettled: true },
  },
}];

describe("planejamento orçamentário familiar", () => {
  it("não soma duas vezes uma obrigação anual vinculada", () => {
    const forecast = additionalForecastByMonth([{ id: "luz", sourceAnnualId: "energia", months: [20000,15000,...Array(10).fill(null)] }], annual);
    expect(annualCommitmentsByMonth(annual).slice(0,2)).toEqual([20000,15000]);
    expect(forecast.values.slice(0,2)).toEqual([0,0]);
  });
  it("somente o excedente da previsão entra como provisão adicional", () => {
    const forecast = additionalForecastByMonth([{ id:"luz", sourceAnnualId:"energia",months:[30000,null,...Array(10).fill(null)] }],annual);
    expect(forecast.values[0]).toBe(10000);
  });
  it("meses vazios não geram previsão e metas não modificam dívidas", () => {
    const forecast = additionalForecastByMonth([{id:"lazer",sourceAnnualId:null,months:[10000,null,...Array(10).fill(null)]}],annual);
    expect(forecast.values.slice(0,2)).toEqual([10000,0]);
    expect(budgetBalance([50000,...Array(11).fill(0)],[20000,...Array(11).fill(0)],forecast.values,[5000,...Array(11).fill(0)])[0]).toBe(15000);
  });
  it("separa pago do pendente sem duplicar desembolso", () => {
    const settled = annualSettlementByMonth(annual);
    expect(settled[0]).toEqual({committedCents:20000,paidCents:5000,pendingCents:15000});
    expect(settled[1]).toEqual({committedCents:15000,paidCents:15000,pendingCents:0});
  });
  it("alerta vínculos inválidos e repetidos", () => {
    const result = additionalForecastByMonth([
      {id:"a",sourceAnnualId:"energia",months:Array(12).fill(null)},
      {id:"b",sourceAnnualId:"energia",months:Array(12).fill(null)},
      {id:"c",sourceAnnualId:"nao-existe",months:Array(12).fill(null)},
    ],annual);
    expect(result.invalidLinks).toEqual(["c"]);
    expect(result.repeatedLinks).toEqual(["energia"]);
  });
});
