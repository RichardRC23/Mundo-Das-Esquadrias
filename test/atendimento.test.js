const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { createApp } = require("../server");
const { localAnswer, messages, outputText } = require("../lib/atendimento");

const ORIGIN = "http://localhost:3000";

test("atendimento valida mensagens e responde dúvidas conhecidas sem inventar condições", () => {
  assert.equal(messages({ mensagem: "  Qual o prazo?  " }).question, "Qual o prazo?");
  assert.equal(messages({ mensagem: "x".repeat(501) }), null);
  assert.match(localAnswer("Quanto custa uma janela?").answer, /valores variam/i);
  assert.match(localAnswer("Qual o prazo de instalação?").answer, /não quero inventar/i);
  assert.equal(outputText({ output: [{ content: [{ text: "Resposta segura" }] }] }), "Resposta segura");
});

test("assistente usa a IA somente pelo servidor com limites de privacidade", async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), "mde-atendimento-test-"));
  const requests = [];
  const transport = async (url, options) => {
    requests.push({ url, options, body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ output: [{ content: [{ text: "Posso ajudar com seu orçamento." }] }] }) };
  };
  const instance = await createApp({
    dataDir, origin: ORIGIN, sessionSecret: "segredo-de-teste-do-atendimento",
    atendimentoConfig: { OPENAI_API_KEY: "chave-falsa-de-teste", OPENAI_SUPPORT_MODEL: "modelo-de-teste" },
    atendimentoTransport: transport,
  });
  const server = instance.app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await instance.close();
    assert.equal(path.dirname(dataDir), os.tmpdir());
    await fs.rm(dataDir, { recursive: true, force: true });
  });
  const csrfResponse = await fetch(`${base}/api/csrf`, { headers: { Origin: ORIGIN } });
  cookie = csrfResponse.headers.getSetCookie()[0].split(";")[0];
  const token = (await csrfResponse.json()).token;
  const response = await fetch(`${base}/api/atendimento`, {
    method: "POST",
    headers: { Origin: ORIGIN, Cookie: cookie, "Content-Type": "application/json", "X-CSRF-Token": token },
    body: JSON.stringify({ mensagem: "Como peço um orçamento?", historico: [] }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { resposta: "Posso ajudar com seu orçamento.", sugestoes: ["Como tirar as medidas?", "Quais serviços vocês fazem?"], modo: "ia" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://api.openai.com/v1/responses");
  assert.equal(requests[0].options.headers.Authorization, "Bearer chave-falsa-de-teste");
  assert.equal(requests[0].body.store, false);
  assert.equal(requests[0].body.max_output_tokens, 260);
  assert.equal(requests[0].body.model, "modelo-de-teste");
  assert.match(requests[0].body.safety_identifier, /^[a-f0-9]{32}$/);
});
