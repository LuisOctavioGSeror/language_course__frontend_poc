// script.js — Front simples para /auth/token + /chat (sem API key no cliente)
(function () {
  "use strict";

  // -------- helpers DOM --------
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

  // -------- estado --------
  let messages = [];
  let token = localStorage.getItem("token") || null;

  // -------- persistência de config --------
  function getApiBase() {
    return (apiBaseEl && apiBaseEl.value.trim()) || localStorage.getItem("apiBase") || "http://localhost:8000";
  }
  function getProvider() {
    return (providerEl && providerEl.value.trim()) || localStorage.getItem("provider") || "";
  }
  function getModel() {
    return (modelEl && modelEl.value.trim()) || localStorage.getItem("model") || "";
  }

  // Carrega UI inicial
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

  // -------- UI utils --------
  function toast(text) {
    console.log("[toast]", text);
    // simples: usa alert, se quiser algo melhor troque aqui
    // alert(text);
  }

  function append(role, content) {
    if (!chatEl) return;
    const div = document.createElement("div");
    div.className = "msg " + (role === "user" ? "user" : "assistant");
    div.textContent = content;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function setLoading(isLoading) {
    if (sendBtn) {
      sendBtn.disabled = isLoading;
      sendBtn.textContent = isLoading ? "Enviando…" : "Enviar";
    }
  }

  function setAuthState(logged) {
    // Habilite/desabilite controles se quiser
    if (logged) {
      toast("Logado.");
      if (logoutBtn) logoutBtn.disabled = false;
      if (loginBtn) loginBtn.disabled = true;
    } else {
      toast("Não autenticado.");
      if (logoutBtn) logoutBtn.disabled = true;
      if (loginBtn) loginBtn.disabled = false;
    }
  }

  // -------- HTTP wrapper --------
  async function request(path, { method = "GET", headers = {}, body, form = false } = {}) {
    const apiBase = getApiBase().replace(/\/$/, "");
    const url = apiBase + path;

    const h = { ...headers };
    if (!form) h["Content-Type"] = h["Content-Type"] || "application/json";
    if (token) h["Authorization"] = "Bearer " + token;

    const init = {
      method,
      headers: h,
      body: form ? body : body ? JSON.stringify(body) : undefined,
      credentials: "include", // útil se usar cookies no futuro
    };

    const res = await fetch(url, init);
    if (!res.ok) {
      let errText;
      try {
        errText = await res.text();
      } catch {
        errText = `${res.status} ${res.statusText}`;
      }
      const e = new Error(errText);
      e.status = res.status;
      throw e;
    }
    // Tenta JSON; se falhar, devolve texto
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) return await res.json();
    return await res.text();
  }

  // -------- auth --------
  async function login(email, password) {
    const body = new URLSearchParams({ username: email, password });
    // OAuth2PasswordRequestForm exige form-encoded
    const data = await request("/auth/token", {
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

    // Se existir UI de login, espera o clique do usuário
    if (emailEl && passwordEl && loginBtn) {
      toast("Faça login para continuar.");
      return false;
    }

    // fallback: prompt
    const email = prompt("Email:");
    const pw = prompt("Senha:");
    if (!email || !pw) return false;
    try {
      await login(email, pw);
      return true;
    } catch (e) {
      append("assistant", "⚠️ Falha no login: " + (e.message || e.toString()));
      return false;
    }
  }

  // -------- chat --------
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
      if (provider) body.provider = provider; // não envia null
      if (model) body.model = model;

      const data = await request("/chat", {
        method: "POST",
        body,
      });

      const answer = data.answer || (typeof data === "string" ? data : "");
      append("assistant", answer);
      messages.push({ role: "assistant", content: answer });
    } catch (e) {
      if (e.status === 401) {
        // token inválido/expirado: limpa e tenta de novo
        logout();
        append("assistant", "⚠️ Sessão expirada. Faça login novamente.");
      } else {
        append("assistant", "⚠️ Erro: " + (e.message || e.toString()));
      }
    } finally {
      setLoading(false);
      if (inputEl) inputEl.focus();
    }
  }

  // -------- eventos UI --------
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
      if (!email || !pw) {
        toast("Preencha email e senha.");
        return;
      }
      try {
        await login(email, pw);
      } catch (e) {
        append("assistant", "⚠️ Falha no login: " + (e.message || e.toString()));
      }
    });
  }
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  // -------- bootstrap --------
  setAuthState(!!token);
})();


