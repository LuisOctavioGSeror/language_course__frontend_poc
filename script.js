// script.js — Front separado (Vercel/Netlify/etc.) para FastAPI (/token + /chat).
// Nada de API key no cliente; só Bearer JWT.

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
  const TOKEN_PATH = localStorage.getItem("tokenPath") || "/token"; // se seu login for /auth/token, salve isso como tokenPath

  function getApiBase() {
    const base =
      (apiBaseEl && apiBaseEl.value.trim()) ||
      localStorage.getItem("apiBase") ||
      "http://localhost:8000";
    // sem barra no fim
    return base.replace(/\/$/, "");
  }
  function getProvider() {
    return (providerEl && providerEl.value.trim()) || localStorage.getItem("provider") || "";
  }
  function getModel() {
    return (modelEl && modelEl.value.trim()) || localStorage.getItem("model") || "";
  }

  // UI inicial
  if (apiBaseEl) apiBaseEl.value = localStorage.getItem("apiBase") || "https://languagecoursebackendpoc-production.up.railway.app/";
  if (providerEl) providerEl.value = localStorage.getItem("provider") || "";
  if (modelEl) modelEl.value = localStorage.getItem("model") || "";

  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      if (apiBaseEl) localStorage.setItem("apiBase", apiBaseEl.value.trim());
      if (providerEl) localStorage.setItem("provider", providerEl.value.trim());
      if (modelEl) localStorage.setItem("model", modelEl.value.trim());
      alert("Configurações salvas.");
    });
  }

  // ---------- helpers ----------
  function append(role, content) {
    if (!chatEl) return;
    const div = document.createElement("div");
    div.className = "msg " + (role === "user" ? "user" : "assistant");
    div.textContent = content;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function setLoading(b) {
    if (!sendBtn) return;
    sendBtn.disabled = b;
    sendBtn.textContent = b ? "Enviando…" : "Enviar";
  }

  function setAuthState(logged) {
    if (logoutBtn) logoutBtn.disabled = !logged;
    if (loginBtn) loginBtn.disabled = logged;
  }

  function ensureScheme(url) {
    // dica: se o usuário digitar só domínio, não funciona; precisa http(s)
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`API Base inválida: "${url}". Use http(s)://...`);
    }
  }

  // ---------- HTTP ----------
  async function request(path, { method = "GET", headers = {}, body, form = false } = {}) {
    const base = getApiBase();
    ensureScheme(base);
    const url = base + path;

    const h = { ...headers };
    if (!form) h["Content-Type"] = h["Content-Type"] || "application/json";
    if (token) h["Authorization"] = "Bearer " + token;

    const init = {
      method,
      headers: h,
      body: form ? body : body ? JSON.stringify(body) : undefined,
      // sem cookies -> sem credentials:'include'
    };

    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        const err = new Error(`${res.status} ${res.statusText}${txt ? `: ${txt}` : ""}`);
        err.status = res.status;
        throw err;
      }
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) return await res.json();
      return await res.text();
    } catch (e) {
      // CORS/URL/protocolo caem como TypeError; deixa mensagem amigável
      const msg = (e && e.message) || String(e);
      throw new Error(`Falha ao chamar ${url}. Verifique API Base/CORS/HTTPS. Detalhe: ${msg}`);
    }
  }

  // ---------- auth ----------
  async function login(email, password) {
    const body = new URLSearchParams({ username: email, password });
    const data = await request(TOKEN_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      form: true,
    });
    token = data.access_token;
    localStorage.setItem("token", token);
    setAuthState(true);
    append("assistant", "✅ Login realizado.");
  }

  function logout() {
    token = null;
    localStorage.removeItem("token");
    setAuthState(false);
    append("assistant", "👋 Você saiu.");
  }

  async function ensureLogged() {
    if (token) return true;

    if (emailEl && passwordEl && loginBtn) {
      append("assistant", "⚠️ Faça login para continuar.");
      return false;
    }
    // fallback (se não tiver UI de login)
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
      if (provider) body.provider = provider; // não enviar null
      if (model) body.model = model;

      const data = await request("/chat", { method: "POST", body });
      const answer = data.answer || (typeof data === "string" ? data : "");
      append("assistant", answer);
      messages.push({ role: "assistant", content: answer });
    } catch (e) {
      if (e.status === 401) {
        logout();
        append("assistant", "⚠️ Sessão expirada/ inválida. Faça login novamente.");
      } else {
        append("assistant", "⚠️ Erro: " + (e.message || e.toString()));
      }
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
      } catch (e) {
        append("assistant", "⚠️ Falha no login: " + (e.message || e.toString()));
      }
    });
  }
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  // ---------- bootstrap ----------
  setAuthState(!!token);
})();

