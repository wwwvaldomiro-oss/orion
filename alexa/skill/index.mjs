// AWS Lambda entrypoint for a private Alexa Custom Skill.
// Configure an Alexa Skills Kit Lambda trigger restricted to your Skill ID.
// Alexa -> Lambda invocation authentication is enforced by AWS; never expose
// this handler as an unauthenticated public HTTP route.
const EXPECTED_SKILL_ID = process.env.ALEXA_SKILL_ID;
const ORION_API_URL = process.env.ORION_API_URL;

function respond(speech, end = true, reprompt) {
  return { version: "1.0", response: {
    outputSpeech: { type: "PlainText", text: speech },
    shouldEndSession: end,
    ...(reprompt ? { reprompt: { outputSpeech: { type: "PlainText", text: reprompt } } } : {})
  }};
}
function slotValue(intent, name) {
  return intent?.slots?.[name]?.resolutions?.resolutionsPerAuthority?.[0]?.values?.[0]?.value?.name
    || intent?.slots?.[name]?.value || "";
}
export async function handler(event) {
  if (!EXPECTED_SKILL_ID || !ORION_API_URL || event?.session?.application?.applicationId !== EXPECTED_SKILL_ID) {
    throw new Error("Alexa skill not configured or invalid skill ID");
  }
  const kind = event?.request?.type;
  const intent = event?.request?.intent;
  if (kind === "SessionEndedRequest") return { version: "1.0", response: {} };
  if (intent?.name === "AMAZON.StopIntent" || intent?.name === "AMAZON.CancelIntent") return respond("Até mais!");
  if (intent?.name === "AMAZON.HelpIntent" || kind === "LaunchRequest") return respond(
    "Bem-vindo ao Órion. Você pode pedir sua lista de compras, adicionar produtos, consultar compromissos de hoje ou suas próximas contas.", false,
    "O que deseja consultar no Órion?"
  );
  const token = event?.context?.System?.user?.accessToken;
  if (!token) return { version: "1.0", response: {
    outputSpeech: { type: "PlainText", text: "Conecte sua conta Órion no aplicativo Alexa para continuar." },
    card: { type: "LinkAccount" }, shouldEndSession: true
  }};
  const actions = {
    "ShoppingListIntent": { action: "shopping.list" },
    "AddShoppingItemIntent": { action: "shopping.add", name: slotValue(intent, "item") },
    "TodayAgendaIntent": { action: "agenda.today" },
    "UpcomingBillsIntent": { action: "bills.due" }
  };
  const payload = actions[intent?.name];
  if (!payload) return respond("Não entendi o comando. Peça ajuda ao Órion.");
  try {
    const response = await fetch(new URL("/api/alexa/voice", ORION_API_URL), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(7000)
    });
    if (response.status === 401) return { version: "1.0", response: {
      outputSpeech: { type: "PlainText", text: "Sua conexão expirou. Vincule novamente sua conta Órion." },
      card: { type: "LinkAccount" }, shouldEndSession: true
    }};
    if (!response.ok) return respond("Não consegui consultar o Órion agora. Tente novamente.");
    const json = await response.json();
    return respond(String(json.speech || "Não encontrei informações.").slice(0, 700));
  } catch { return respond("O Órion está indisponível neste momento. Tente novamente."); }
}
