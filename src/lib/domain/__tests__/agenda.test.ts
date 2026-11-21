import { describe, expect, it } from "vitest";
import { createEmptyOrionState, type AgendaContact, type AgendaNote, type PersonalAgendaRecord } from "@/types/orion";
import {
  buildMonthGrid,
  buildUnifiedAgendaEvents,
  crossesMidnight,
  occursOn,
} from "@/lib/domain/agenda";
import {
  computeBirthdayAge,
  DEFAULT_CONTACT_CATEGORIES,
  DEFAULT_CONTACT_SUBCATEGORIES,
  isValidEmail,
  resolveBirthdayDateInYear,
  splitContactsForTabs,
} from "@/lib/domain/agendaContacts";
import {
  computeItemTotalCents,
  computeShoppingNoteTotals,
  parseBrlCurrencyToCents,
} from "@/lib/domain/agendaNotes";
import {
  evaluateMathExpression,
  formatCalculatorResult,
  isTypingInFormControl,
} from "@/lib/domain/calculator";

describe("Agenda — Calendário e Escala 12x36", () => {
  it("Novembro/2026 tem exatamente 30 dias no mês e fecha semanas completas sem dia 31", () => {
    const cells = buildMonthGrid("2026-11");
    const inMonthDays = cells.filter((c) => c.inMonth).map((c) => c.date);
    expect(inMonthDays).toHaveLength(30);
    expect(inMonthDays[0]).toBe("2026-11-01");
    expect(inMonthDays[inMonthDays.length - 1]).toBe("2026-11-30");
    expect(inMonthDays).not.toContain("2026-11-31");
    expect(cells.length % 7).toBe(0);
    expect(cells).toHaveLength(35); // 5 semanas completas (Dom 01/11 .. Sáb 05/12)
  });

  it("Escala 12x36 mantém fase exata a cada 2 dias na virada de novembro/2026 -> dezembro/2026 -> janeiro/2027", () => {
    const shift: PersonalAgendaRecord = {
      id: "work-1",
      kind: "work",
      title: "Plantão Diurno",
      company: "Unidade Central",
      startDate: "2026-11-19",
      time: "07:00",
      endTime: "19:00",
      breakRule: "1h almoço",
      description: "Escala fixa",
      recurrence: "12x36",
      favorite: false,
      reminder: false,
      items: [],
    };

    const novDays = ["2026-11-19", "2026-11-21", "2026-11-23", "2026-11-25", "2026-11-27", "2026-11-29"];
    for (const d of novDays) {
      expect(occursOn(shift, d)).toBe(true);
    }
    expect(occursOn(shift, "2026-11-20")).toBe(false);
    expect(occursOn(shift, "2026-11-30")).toBe(false);

    // Continua em 01/12/2026 sem reiniciar contagem!
    expect(occursOn(shift, "2026-12-01")).toBe(true);
    expect(occursOn(shift, "2026-12-02")).toBe(false);
    expect(occursOn(shift, "2026-12-31")).toBe(true); // 31 dez trabalha -> 01 jan descansa -> 02 jan trabalha
    expect(occursOn(shift, "2027-01-01")).toBe(false);
    expect(occursOn(shift, "2027-01-02")).toBe(true);
  });

  it("Detecta corretamente jornada atravessando meia-noite e escala Outros personalizada", () => {
    expect(crossesMidnight("22:00", "06:00")).toBe(true);
    expect(crossesMidnight("07:00", "19:00")).toBe(false);

    const customWork: PersonalAgendaRecord = {
      id: "work-custom",
      kind: "work",
      title: "Escala Especial",
      startDate: "2026-11-05",
      time: "22:00",
      endTime: "06:00",
      description: "",
      recurrence: "custom",
      customDates: ["2026-11-05", "2026-11-12", "2026-12-03"],
      favorite: false,
      reminder: false,
      items: [],
    };
    expect(occursOn(customWork, "2026-11-05")).toBe(true);
    expect(occursOn(customWork, "2026-11-06")).toBe(false);
    expect(occursOn(customWork, "2026-12-03")).toBe(true);
  });

  it("Exceção pontual em 12x36 altera/oculta apenas o dia escolhido preservando a série", () => {
    const state = createEmptyOrionState();
    state.personalAgenda = [
      {
        id: "work-1",
        kind: "work",
        title: "Plantão",
        company: "Hospital A",
        startDate: "2026-11-19",
        time: "07:00",
        endTime: "19:00",
        breakRule: "1h intervalo",
        description: "",
        recurrence: "12x36",
        favorite: false,
        reminder: false,
        items: [],
      },
    ];
    state.agendaOverrides = [
      {
        id: "ov-swap",
        sourceType: "personal",
        sourceId: "work-1",
        occurrenceDate: "2026-11-23",
        action: "modified",
        overrideCompany: "Hospital B (Troca)",
        overrideTime: "19:00",
        overrideEndTime: "07:00",
        updatedAtIso: "2026-11-20T10:00:00.000Z",
      },
    ];

    const events = buildUnifiedAgendaEvents({
      rangeStart: "2026-11-19",
      rangeEnd: "2026-11-27",
      state,
      today: "2026-11-21",
    }).filter((e) => e.sourceType === "personal");

    const day21 = events.find((e) => e.displayDate === "2026-11-21");
    const day23 = events.find((e) => e.displayDate === "2026-11-23");
    const day25 = events.find((e) => e.displayDate === "2026-11-25");

    expect(day21?.company).toBe("Hospital A");
    expect(day21?.startTime).toBe("07:00");
    expect(day23?.company).toBe("Hospital B (Troca)");
    expect(day23?.spansNextDay).toBe(true);
    expect(day25?.company).toBe("Hospital A");
    expect(day25?.startTime).toBe("07:00");
  });
});

describe("Contatos, Categorias Comerciais e Aniversários Recorrentes", () => {
  it("Separa Comercial da lista Contatos e unifica tudo na aba Aniversários", () => {
    const contacts: AgendaContact[] = [
      {
        id: "c-1",
        name: "Fabrícia",
        birthDay: 29,
        birthMonth: 2,
        birthYear: null,
        phones: [{ label: "Celular", number: "(61) 99999-0001", isWhatsApp: true }],
        emails: [],
        categoryId: "cat-familia",
        subcategoryId: "sub-esposa",
        birthdayReminderEnabled: true,
        birthdayReminderDaysBefore: 1,
        notificationsEnabled: true,
      },
      {
        id: "c-2",
        name: "Carlos",
        birthDay: 15,
        birthMonth: 6,
        birthYear: 1985,
        phones: [{ label: "Comercial", number: "(61) 98888-0002", isWhatsApp: true }],
        emails: ["carlos@eletrica.com.br"],
        categoryId: "cat-comercio",
        subcategoryId: "sub-eletricista",
        company: "Carlos Elétrica",
        profession: "Eletricista",
        birthdayReminderEnabled: false,
        birthdayReminderDaysBefore: 0,
        notificationsEnabled: true,
      },
    ];

    const split = splitContactsForTabs(
      contacts,
      DEFAULT_CONTACT_CATEGORIES,
      DEFAULT_CONTACT_SUBCATEGORIES,
      "2026-11-21",
      "feb28",
    );

    expect(split.personal.map((c) => c.name)).toEqual(["Fabrícia"]);
    expect(split.commercial.map((c) => c.name)).toEqual(["Carlos"]);
    expect(split.birthdays.map((b) => b.contact.name).sort()).toEqual(["Carlos", "Fabrícia"]);
    expect(split.birthdays.find((b) => b.contact.name === "Fabrícia")?.nextAge).toBeNull();
    expect(computeBirthdayAge(null, 2026)).toBeNull();
    expect(computeBirthdayAge(1985, 2026)).toBe(41);
  });

  it("Recorrência anual de 29/02 funciona em 2026, 2027 e 2028 conforme regra escolhida", () => {
    expect(resolveBirthdayDateInYear(2, 29, 2026, "feb28")).toBe("2026-02-28");
    expect(resolveBirthdayDateInYear(2, 29, 2027, "feb28")).toBe("2027-02-28");
    expect(resolveBirthdayDateInYear(2, 29, 2026, "mar01")).toBe("2026-03-01");
    expect(resolveBirthdayDateInYear(2, 29, 2028, "feb28")).toBe("2028-02-29");
    expect(resolveBirthdayDateInYear(2, 29, 2028, "mar01")).toBe("2028-02-29");
    expect(isValidEmail("valido@orion.com.br")).toBe(true);
    expect(isValidEmail("invalido@")).toBe(false);
  });
});

describe("Integração Financeira/Veicular Somente Leitura e Deduplicação", () => {
  it("Deduplica despesa anual/contrato espelhada e nunca quita obrigação via AgendaEventOverride", () => {
    const state = createEmptyOrionState();
    state.annualExpenses = [
      {
        id: "ann-1",
        year: 2026,
        creditor: "Energia Elétrica",
        category: "Moradia",
        expenseKind: "consumption",
        dueDay: 15,
        months: {
          "11": { expectedCents: 25000, paidCents: null, paidDate: null, isSettled: false },
        },
      },
    ];
    state.monthlyBills = [
      {
        id: "bill-1",
        period: "2026-11",
        creditor: "Energia Elétrica",
        category: "Moradia",
        dueDate: "2026-11-15",
        expectedCents: 25000,
        paidCents: null,
        paidDate: null,
        isSettled: false,
        sourceAnnualId: "ann-1",
      },
    ];
    state.agendaOverrides = [
      {
        id: "ov-bill",
        sourceType: "bill",
        sourceId: "bill-1",
        occurrenceDate: "2026-11-15",
        action: "completed",
        updatedAtIso: "2026-11-15T12:00:00.000Z",
      },
    ];

    const events = buildUnifiedAgendaEvents({
      rangeStart: "2026-11-01",
      rangeEnd: "2026-11-30",
      state,
      today: "2026-11-21",
    }).filter((e) => e.category === "finance_expense");

    // Não duplicou ann-1 com bill-1!
    expect(events).toHaveLength(1);
    expect(events[0]!.canSettleOrigin).toBe(false);
    expect(events[0]!.originSettled).toBe(false);
    expect(events[0]!.status).toBe("overdue"); // Continua em aberto na origem!
    expect(state.monthlyBills[0]!.isSettled).toBe(false);
  });
});

describe("Lista de Compras Multiloja (Centavos Inteiros)", () => {
  it("Calcula corretamente exemplo Tatico R$ 60,00 + Assaí R$ 1,00 = Total R$ 61,00", () => {
    const note: AgendaNote = {
      id: "n-shop",
      type: "shopping",
      title: "Mercado",
      color: "#ffffff",
      content: "",
      checklistItems: [],
      stores: [
        {
          id: "s-tatico",
          name: "Tatico",
          items: [
            {
              id: "p-leite",
              description: "Leite",
              quantity: 12,
              unitPriceCents: parseBrlCurrencyToCents("5,00"),
              purchased: false,
            },
          ],
        },
        {
          id: "s-assai",
          name: "Assaí",
          items: [
            {
              id: "p-sabao",
              description: "Sabão",
              quantity: 1,
              unitPriceCents: parseBrlCurrencyToCents("1,00"),
              purchased: true,
            },
          ],
        },
      ],
      updatedAtIso: "2026-11-21T00:00:00.000Z",
    };

    expect(computeItemTotalCents(12, 500)).toBe(6000);
    const t1 = computeShoppingNoteTotals(note.stores);
    expect(t1.expectedCents).toBe(6100);
    expect(t1.purchasedCents).toBe(100);
    expect(t1.remainingCents).toBe(6000);

    // Marcar Leite como comprado -> R$ 61,00
    note.stores[0]!.items[0]!.purchased = true;
    const t2 = computeShoppingNoteTotals(note.stores);
    expect(t2.purchasedCents).toBe(6100);
    expect(t2.remainingCents).toBe(0);

    // Desmarcar Leite -> volta para R$ 1,00
    note.stores[0]!.items[0]!.purchased = false;
    const t3 = computeShoppingNoteTotals(note.stores);
    expect(t3.purchasedCents).toBe(100);
  });
});

describe("Calculadora Científica Segura e Proteção de Formulário", () => {
  it("Avalia expressões normais e científicas com vírgula decimal, DEG/RAD e precedência", () => {
    expect(evaluateMathExpression("2 + 3 * 4")).toBe(14);
    expect(evaluateMathExpression("12,5 + 2,5")).toBe(15);
    expect(evaluateMathExpression("200 * 10%")).toBe(20);
    expect(evaluateMathExpression("sqrt(81) + 5!")).toBe(129);
    expect(evaluateMathExpression("sin(30)", "DEG")).toBe(0.5);
    expect(evaluateMathExpression("sin(pi/6)", "RAD")).toBe(0.5);
    expect(formatCalculatorResult(15.5)).toBe("15,5");
  });

  it("Rejeita divisão por zero, raiz negativa e nunca sequestra teclas de INPUT/TEXTAREA", () => {
    expect(() => evaluateMathExpression("10 / 0")).toThrow(/Divisão por zero/);
    expect(() => evaluateMathExpression("sqrt(-4)")).toThrow(/Raiz inválida/);
    expect(isTypingInFormControl({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingInFormControl({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isTypingInFormControl({ tagName: "DIV" } as unknown as EventTarget)).toBe(false);
  });
});
