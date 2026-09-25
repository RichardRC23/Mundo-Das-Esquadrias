(() => {
  // Live Server uses a different port but must keep the same host for cookies.
  const local = ["localhost", "127.0.0.1"].includes(location.hostname);
  const base = local && location.port === "5500" ? `${location.protocol}//${location.hostname}:3000` : location.origin;
  let csrfPromise;
  const url = (path) => new URL(path, base).href;
  async function parse(response) {
    if (!response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("Não foi possível conectar ao servidor. Confirme se node server.js está rodando.");
    }
    return response.json();
  }
  async function csrf() {
    if (!csrfPromise) csrfPromise = fetch(url("/api/csrf"), { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        const data = await parse(response);
        if (!response.ok || !data.token) throw new Error(data.erro || "Não foi possível iniciar sua sessão.");
        return data.token;
      }).catch((error) => { csrfPromise = null; throw error; });
    return csrfPromise;
  }
  async function request(path, options = {}, retry = true) {
    const method = (options.method || "GET").toUpperCase();
    const headers = new Headers(options.headers);
    let body = options.body;
    const mutation = !["GET", "HEAD"].includes(method);
    if (body && !(body instanceof FormData) && typeof body !== "string") {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(body);
    }
    if (mutation) headers.set("X-CSRF-Token", await csrf());
    let response;
    try {
      response = await fetch(url(path), { ...options, method, headers, body, credentials: "include", cache: "no-store" });
    } catch {
      throw new Error("Não foi possível conectar. Verifique sua conexão e se o servidor está aberto.");
    }
    const data = await parse(response);
    if (!response.ok) {
      // A CSRF failure happens before mutation, so this one retry is safe.
      if (data.codigo === "CSRF_INVALIDO" && retry) {
        csrfPromise = null;
        return request(path, options, false);
      }
      const error = new Error(data.erro || "Não foi possível concluir. Tente novamente.");
      error.status = response.status;
      throw error;
    }
    if (["/api/login", "/api/cadastro", "/api/sair"].includes(path)) csrfPromise = null;
    return data;
  }
  window.ContaAPI = { request, url };
})();
