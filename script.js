// Front simples: login em /auth/token (OAuth2) + POST /chat (Bearer JWT).
(function () {
  "use strict";

  // ---------- DOM ----------
  const $ = (sel) => document.querySelector(sel);

  const chatEl = $("#chat");
  const inputEl = $("#input");
  const sendBtn = $("#send");
  const clearBtn = $("#clear");

  const apiBaseEl = $("#apiBase");
  const providerEl = $("#provider");
  const modelEl = $("#model");
  const saveBtn = $("#save");

  const emailEl = $("#email");
  const passwordEl = $("#password");
  const loginBtn = $("#login");
  const logoutBtn = $("#logout");

  // ---------- state ----------
  let messages = [];
  let token = localStorage.getItem("token") || null;

  // ---------- config ----------
  function getApiBase() {
    // precisa ter http:// ou https://
    return (
      (apiBaseEl && apiBaseEl.value.trim()) ||
      localStorage.getItem("apiBase") ||
      "http://localhost:8000"
    );
  }
  function getProvider() {
    return (providerEl && providerEl.value.trim()) || localStorage.getItem("provider") || "";
  }
  function getModel() {
    return (modelEl && modelEl.value.trim()) || localStorage.getItem("model") || "";
  }

  // UI inicial
  if (apiBaseEl) apiBaseEl.value = localStorage.getItem("apiBase") || "http://localhost:8000";
  if (providerEl) providerEl.value = localStorage.getItem("provider") || "";
  if (modelEl) modelEl.value = localStorage.getItem("model") || "";

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      if (apiBaseEl) localStorage.setItem("apiBase", apiBaseEl.value.trim());
      if (providerEl) localStorage.setItem("provider", providerEl.value.trim());
      if (modelEl) localStorage.setItem("model", modelEl.value.trim());
      toast("Configurações salvas.");
    });
  }

  // ---------- UI helpers ----------
  function toast(text) {
    console.log("[toast]", text);
  }
  function append(role, content) {
    if (!chatEl) return;
    const div = document.createElement("div");
    div.className = "msg " + (role === "user" ? "user" : "assistant");
    div.textContent = content;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
  }
  function setLoading(b) {
    if (sendBtn) {
      sendBtn.disabled = b;
      sendBtn.textContent = b ? "Enviando…" : "Enviar";
    }
  }
  function setAuthState(logged) {
    if (logoutBtn) logoutBtn.disabled = !logged;
    if (loginBtn) loginBtn.disabled = logged;
  }

  // ---------- HTTP wrapper ----------
  async function request(path, { method = "GET", headers = {}, body, form = false } = {}) {
    const apiBase = getApiBase().replace(/\/$/, "");
    const url = apiBase + path;

    const h = { ...headers };
    if (!form) h["Content-Type"] = h["Content-Type"] || "application/json";
    if (token) h["Authorization"] = "Bearer " + token;

    const init = {
      method,
      headers: h,
      // importante: SEM credentials:'include' (evita CORS extra se você não usa cookies)
      body: form ? body : body ? JSON.stringify(body) : undefined,
    };

    try {
      const res = await fetch(url, init);
      // se CORS bloquear, cai no catch abaixo (TypeError: Failed to fetch)
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        const err = new Error(`${res.status} ${res.statusText}${text ? `: ${text}` : ""}`);
        err.status = res.status;
        throw err;
      }
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) return await res.json();
      return await res.text();
    } catch (e) {
      // mensagem mais útil p/ CORS/URL incorreta
      console.error("fetch error:", e);
      throw new Error(`Failed to fetch ${url}. Dica: verifique API Base, CORS e HTTPS/HTTP.`);
    }
  }

 async function login(email, password) {
  const body = new URLSearchParams({ username: email, password });
  const data = await request("/token", {              // <— aqui
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    form: true,
  });
  token = data.access_token;
  localStorage.setItem("token", token);
  setAuthState(true);
}
  function logout() {
    token = null;
    localStorage.removeItem("token");
    setAuthState(false);
  }
  async function ensureLogged() {
    if (token) return true;

    // Se existir UI de login
    if (emailEl && passwordEl && loginBtn) {
      toast("Faça login para continuar.");
      return false;
    }

    // fallback em prompt
    const email = prompt("Email:");
    const pw = prompt("Senha:");
    if (!email || !pw) return false;
    await login(email, pw);
    return true;
  }

  // ---------- chat ----------
  async function send() {
    const text = (inputEl && inputEl.value.trim()) || "";
    if (!text) return;
    if (inputEl) inputEl.value = "";

    append("user", text);
    messages.push({ role: "user", content: text });

    setLoading(true);
    try {
      if (!(await ensureLogged())) {
        setLoading(false);
        return;
      }
      const body = { messages };
      const provider = getProvider();
      const model = getModel();
      if (provider) body.provider = provider;
      if (model) body.model = model;

      const data = await request("/chat", { method: "POST", body });
      const answer = data.answer || (typeof data === "string" ? data : "");
      append("assistant", answer);
      messages.push({ role: "assistant", content: answer });
    } catch (e) {
      append("assistant", "⚠️ " + (e.message || e.toString()));
    } finally {
      setLoading(false);
      if (inputEl) inputEl.focus();
    }
  }

  // ---------- eventos ----------
  if (sendBtn) sendBtn.addEventListener("click", send);
  if (inputEl) {
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      messages = [];
      if (chatEl) chatEl.innerHTML = "";
      if (inputEl) {
        inputEl.value = "";
        inputEl.focus();
      }
    });
  }
  if (loginBtn) {
    loginBtn.addEventListener("click", async () => {
      const email = emailEl ? emailEl.value.trim() : "";
      const pw = passwordEl ? passwordEl.value.trim() : "";
      if (!email || !pw) return append("assistant", "⚠️ Preencha email e senha.");
      try {
        await login(email, pw);
        append("assistant", "✅ Login ok.");
      } catch (e) {
        append("assistant", "⚠️ Falha no login: " + (e.message || e.toString()));
      }
    });
  }
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  setAuthState(!!token);
})();
