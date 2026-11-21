export type AngleUnit = "DEG" | "RAD";

type Token =
  | { type: "number"; value: number }
  | { type: "ident"; value: string }
  | { type: "op"; value: "+" | "-" | "*" | "/" | "^" | "%" | "!" }
  | { type: "lparen" }
  | { type: "rparen" };

function normalizeRawExpression(raw: string): string {
  return raw
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")
    .replace(/π/g, "pi")
    .replace(/√/g, "sqrt")
    .replace(/,/g, ".")
    .trim();
}

function tokenize(expr: string): Token[] {
  const s = normalizeRawExpression(expr);
  if (!s) throw new Error("Digite uma expressão.");
  const tokens: Token[] = [];
  let i = 0;

  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if ((ch >= "0" && ch <= "9") || ch === ".") {
      let numStr = "";
      let dotCount = 0;
      while (i < s.length && ((s[i]! >= "0" && s[i]! <= "9") || s[i] === ".")) {
        if (s[i] === ".") dotCount++;
        if (dotCount > 1) throw new Error("Número decimal inválido.");
        numStr += s[i];
        i++;
      }
      if (numStr === ".") throw new Error("Número decimal inválido.");
      const val = Number(numStr);
      if (!Number.isFinite(val)) throw new Error("Número inválido.");
      tokens.push({ type: "number", value: val });
      continue;
    }

    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z")) {
      let ident = "";
      while (i < s.length && ((s[i]! >= "a" && s[i]! <= "z") || (s[i]! >= "A" && s[i]! <= "Z"))) {
        ident += s[i]!.toLowerCase();
        i++;
      }
      tokens.push({ type: "ident", value: ident });
      continue;
    }

    if (ch === "+" || ch === "-" || ch === "*" || ch === "/" || ch === "^" || ch === "%" || ch === "!") {
      tokens.push({ type: "op", value: ch });
      i++;
      continue;
    }
    if (ch === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (ch === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }

    throw new Error(`Caractere não suportado: "${ch}".`);
  }

  // Insert implicit multiplication tokens where mathematically standard: 2pi, 2(3), )(, )2
  const out: Token[] = [];
  for (let idx = 0; idx < tokens.length; idx++) {
    const cur = tokens[idx]!;
    const prev = out[out.length - 1];
    if (prev) {
      const prevEndsValue =
        prev.type === "number" ||
        prev.type === "rparen" ||
        (prev.type === "ident" && (prev.value === "pi" || prev.value === "e")) ||
        (prev.type === "op" && (prev.value === "!" || prev.value === "%"));
      const curStartsValue =
        cur.type === "number" || cur.type === "lparen" || cur.type === "ident";
      if (prevEndsValue && curStartsValue) {
        out.push({ type: "op", value: "*" });
      }
    }
    out.push(cur);
  }
  return out;
}

function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error("Fatorial exige inteiro não negativo.");
  }
  if (n > 170) throw new Error("Resultado fora do limite.");
  let acc = 1;
  for (let i = 2; i <= n; i++) acc *= i;
  return acc;
}

export function evaluateMathExpression(rawExpression: string, angleUnit: AngleUnit = "DEG"): number {
  const tokens = tokenize(rawExpression);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const consume = (): Token | undefined => tokens[pos++];

  const toRad = (v: number) => (angleUnit === "DEG" ? (v * Math.PI) / 180 : v);
  const fromRad = (v: number) => (angleUnit === "DEG" ? (v * 180) / Math.PI : v);

  function parseExpression(): number {
    let left = parseTerm();
    while (true) {
      const t = peek();
      if (t?.type === "op" && (t.value === "+" || t.value === "-")) {
        consume();
        const right = parseTerm();
        left = t.value === "+" ? left + right : left - right;
      } else {
        break;
      }
    }
    return left;
  }

  function parseTerm(): number {
    let left = parsePower();
    while (true) {
      const t = peek();
      if (t?.type === "op" && (t.value === "*" || t.value === "/")) {
        consume();
        const right = parsePower();
        if (t.value === "/") {
          if (right === 0) throw new Error("Divisão por zero.");
          left = left / right;
        } else {
          left = left * right;
        }
      } else {
        break;
      }
    }
    return left;
  }

  function parsePower(): number {
    const base = parseUnary();
    const t = peek();
    if (t?.type === "op" && t.value === "^") {
      consume();
      const exp = parsePower(); // right-associative
      const res = Math.pow(base, exp);
      if (!Number.isFinite(res)) throw new Error("Potência inválida ou fora do limite.");
      return res;
    }
    return base;
  }

  function parseUnary(): number {
    const t = peek();
    if (t?.type === "op" && (t.value === "+" || t.value === "-")) {
      consume();
      const val = parseUnary();
      return t.value === "-" ? -val : val;
    }
    return parsePostfix();
  }

  function parsePostfix(): number {
    let val = parsePrimary();
    while (true) {
      const t = peek();
      if (t?.type === "op" && t.value === "%") {
        consume();
        val = val / 100;
      } else if (t?.type === "op" && t.value === "!") {
        consume();
        val = factorial(val);
      } else {
        break;
      }
    }
    return val;
  }

  function parsePrimary(): number {
    const t = consume();
    if (!t) throw new Error("Expressão incompleta.");

    if (t.type === "number") return t.value;

    if (t.type === "lparen") {
      const val = parseExpression();
      const close = consume();
      if (close?.type !== "rparen") throw new Error("Parênteses desbalanceados.");
      return val;
    }

    if (t.type === "ident") {
      if (t.value === "pi") return Math.PI;
      if (t.value === "e") return Math.E;

      const next = peek();
      if (next?.type !== "lparen") {
        throw new Error(`Função desconhecida ou sem parênteses: "${t.value}".`);
      }
      consume(); // lparen
      const arg = parseExpression();
      const close = consume();
      if (close?.type !== "rparen") throw new Error("Parênteses desbalanceados na função.");

      switch (t.value) {
        case "sqrt":
          if (arg < 0) throw new Error("Raiz inválida para número negativo.");
          return Math.sqrt(arg);
        case "cbrt":
          return Math.cbrt(arg);
        case "abs":
          return Math.abs(arg);
        case "exp":
          return Math.exp(arg);
        case "ln":
          if (arg <= 0) throw new Error("Logaritmo natural exige valor positivo.");
          return Math.log(arg);
        case "log":
          if (arg <= 0) throw new Error("Logaritmo exige valor positivo.");
          return Math.log10(arg);
        case "sin":
          return Math.sin(toRad(arg));
        case "cos":
          return Math.cos(toRad(arg));
        case "tan": {
          const rad = toRad(arg);
          if (Math.abs(Math.cos(rad)) < 1e-12) throw new Error("Tangente indefinida neste ângulo.");
          return Math.tan(rad);
        }
        case "asin":
          if (arg < -1 || arg > 1) throw new Error("Arco seno exige valor entre -1 e 1.");
          return fromRad(Math.asin(arg));
        case "acos":
          if (arg < -1 || arg > 1) throw new Error("Arco cosseno exige valor entre -1 e 1.");
          return fromRad(Math.acos(arg));
        case "atan":
          return fromRad(Math.atan(arg));
        default:
          throw new Error(`Função desconhecida: "${t.value}".`);
      }
    }

    throw new Error("Expressão inválida.");
  }

  const result = parseExpression();
  if (pos < tokens.length) {
    throw new Error("Expressão matemática inválida.");
  }
  if (!Number.isFinite(result)) {
    throw new Error("Resultado fora do limite.");
  }
  return Math.abs(result) < 1e-14 ? 0 : Number(result.toPrecision(12));
}

export function formatCalculatorResult(value: number): string {
  if (!Number.isFinite(value)) return "Erro";
  const rounded = Math.abs(value) < 1e-14 ? 0 : Number(value.toPrecision(12));
  return String(rounded).replace(".", ",");
}

export function isTypingInFormControl(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = (el.tagName || "").toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (el.isContentEditable) return true;
  return false;
}
