import "server-only";

export function renderWebsiteChatEmbedScript() {
  return String.raw`
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var widgetId = script.getAttribute("data-widget-id") || "";
  if (!/^[0-9a-fA-F-]{36}$/.test(widgetId)) return;

  var base;
  try { base = new URL(script.src).origin; } catch (_) { return; }

  var storageKey = "codeedge_chat_" + widgetId;
  var token = null;
  try { token = localStorage.getItem(storageKey); } catch (_) {}

  var host = document.createElement("div");
  host.setAttribute("data-codeedge-chat", widgetId);
  document.body.appendChild(host);
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var style = document.createElement("style");
  style.textContent =
    ":host{--ce-accent:#23BDF0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}" +
    "*{box-sizing:border-box}.ce-launch{position:fixed;z-index:2147483000;right:22px;bottom:22px;border:0;border-radius:999px;background:#0b2034;color:#fff;box-shadow:0 12px 38px rgba(0,0,0,.32);padding:14px 18px;font:700 14px/1 system-ui;cursor:pointer;display:flex;align-items:center;gap:9px}" +
    ".ce-launch:focus-visible,.ce-close:focus-visible,.ce-send:focus-visible,.ce-save:focus-visible,textarea:focus-visible,input:focus-visible{outline:3px solid var(--ce-accent);outline-offset:2px}.ce-dot{width:9px;height:9px;border-radius:50%;background:var(--ce-accent);box-shadow:0 0 0 4px rgba(35,189,240,.12)}" +
    ".ce-badge{display:none;min-width:19px;height:19px;padding:0 5px;border-radius:999px;background:#fff;color:#071523;font:800 11px/19px system-ui;text-align:center}.ce-badge[data-show=true]{display:inline-block}" +
    ".ce-panel{position:fixed;z-index:2147483000;right:22px;bottom:82px;width:min(390px,calc(100vw - 24px));height:min(650px,calc(100vh - 110px));background:#071523;color:#edf6ff;border:1px solid #173b59;border-radius:20px;box-shadow:0 22px 70px rgba(0,0,0,.42);display:none;overflow:hidden}.ce-panel[data-open=true]{display:grid;grid-template-rows:auto 1fr auto}" +
    ".ce-head{padding:16px 17px;background:linear-gradient(135deg,#0a2034,#0d2f4c);border-bottom:1px solid #173b59;display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.ce-title{font:800 16px/1.2 system-ui}.ce-status{margin-top:5px;color:#91e7b2;font:600 12px/1.2 system-ui}.ce-close{border:0;background:transparent;color:#b8d2e5;font:700 20px/1 system-ui;cursor:pointer;padding:2px 4px}" +
    ".ce-body{overflow:auto;padding:15px;display:flex;flex-direction:column;gap:10px}.ce-welcome{margin:0 0 2px;padding:11px 12px;border-radius:12px;background:#0a2030;color:#b9ccda;font:500 13px/1.5 system-ui}.ce-msg{max-width:84%;padding:10px 12px;border-radius:14px;font:500 14px/1.45 system-ui;white-space:pre-wrap;overflow-wrap:anywhere}.ce-visitor{align-self:flex-end;background:var(--ce-accent);color:#06111a;border-bottom-right-radius:5px}.ce-team,.ce-ai,.ce-system{align-self:flex-start;background:#102b46;color:#edf6ff;border-bottom-left-radius:5px}.ce-time{display:block;margin-top:5px;font:500 10px/1.2 system-ui;opacity:.65}" +
    ".ce-error{padding:9px 11px;border-radius:10px;background:#2a1417;color:#ffb4ae;font:600 12px/1.4 system-ui}.ce-contact{border-top:1px solid #17344e;margin-top:5px;padding-top:10px}.ce-contact summary{cursor:pointer;color:#9fe2ff;font:700 12px/1.4 system-ui}.ce-fields{display:grid;gap:8px;margin-top:9px}.ce-fields input{width:100%;border:1px solid #234560;background:#081825;color:#fff;border-radius:9px;padding:9px 10px;font:500 13px/1.3 system-ui}.ce-save{border:0;border-radius:9px;background:#163c5d;color:#fff;padding:9px 11px;font:700 12px/1 system-ui;cursor:pointer}.ce-saved{color:#91e7b2;font:600 12px/1.4 system-ui}" +
    ".ce-foot{padding:12px;border-top:1px solid #173b59;background:#081825}.ce-compose{display:flex;gap:8px;align-items:flex-end}.ce-compose textarea{flex:1;min-height:44px;max-height:110px;resize:vertical;border:1px solid #234560;background:#071523;color:#fff;border-radius:12px;padding:10px 11px;font:500 14px/1.35 system-ui}.ce-send{width:44px;height:44px;border:0;border-radius:12px;background:var(--ce-accent);color:#06111a;font:900 17px/1 system-ui;cursor:pointer}.ce-send:disabled,.ce-save:disabled{opacity:.55;cursor:not-allowed}.ce-powered{text-align:center;color:#6f879b;font:600 10px/1.2 system-ui;margin-top:7px}" +
    "@media(max-width:520px){.ce-launch{right:12px;bottom:12px}.ce-panel{right:12px;bottom:70px;width:calc(100vw - 24px);height:calc(100vh - 88px);border-radius:16px}}";
  root.appendChild(style);

  var launcher = document.createElement("button");
  launcher.className = "ce-launch";
  launcher.type = "button";
  launcher.setAttribute("aria-expanded", "false");
  launcher.innerHTML = '<span class="ce-dot" aria-hidden="true"></span><span class="ce-label">Chat with us</span><span class="ce-badge" data-show="false">0</span>';
  root.appendChild(launcher);

  var panel = document.createElement("section");
  panel.className = "ce-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Website chat");
  panel.setAttribute("data-open", "false");
  panel.innerHTML =
    '<div class="ce-head"><div><div class="ce-title">Chat with us</div><div class="ce-status">Secure Codeedge chat</div></div><button class="ce-close" type="button" aria-label="Close chat">×</button></div>' +
    '<div class="ce-body"><p class="ce-welcome">Welcome. Send us a message and our team will reply here.</p><div class="ce-messages" role="log" aria-live="polite"></div><div class="ce-error" hidden></div><details class="ce-contact" hidden><summary>Leave your contact details</summary><form class="ce-fields"><input name="contact_name" maxlength="120" required placeholder="Your name" autocomplete="name"><input name="phone" maxlength="40" placeholder="Phone" autocomplete="tel"><input name="email" maxlength="254" type="email" placeholder="Email" autocomplete="email"><button class="ce-save" type="submit">Save contact</button></form></details><div class="ce-saved" hidden>Contact details saved.</div></div>' +
    '<div class="ce-foot"><form class="ce-compose"><textarea maxlength="2000" required aria-label="Your message" placeholder="Write a message..."></textarea><button class="ce-send" type="submit" aria-label="Send message">➤</button></form><div class="ce-powered">Codeedge secure website chat</div></div>';
  root.appendChild(panel);

  var label = root.querySelector(".ce-label");
  var title = root.querySelector(".ce-title");
  var status = root.querySelector(".ce-status");
  var welcome = root.querySelector(".ce-welcome");
  var messagesEl = root.querySelector(".ce-messages");
  var errorEl = root.querySelector(".ce-error");
  var contact = root.querySelector(".ce-contact");
  var saved = root.querySelector(".ce-saved");
  var compose = root.querySelector(".ce-compose");
  var textarea = root.querySelector("textarea");
  var badge = root.querySelector(".ce-badge");
  var open = false;
  var ready = false;
  var busy = false;
  var leadCapture = false;
  var contactSaved = false;
  var messageSignature = "";
  var unread = 0;
  var pollTimer = null;

  function setError(message) {
    if (!message) { errorEl.hidden = true; errorEl.textContent = ""; return; }
    errorEl.textContent = message;
    errorEl.hidden = false;
  }

  function setToken(value) {
    token = value || null;
    try {
      if (token) localStorage.setItem(storageKey, token);
      else localStorage.removeItem(storageKey);
    } catch (_) {}
  }

  function applyConfig(config) {
    if (!config) return;
    root.host && root.host.style && root.host.style.setProperty("--ce-accent", config.accentColor || "#23BDF0");
    if (root.style && root.style.setProperty) root.style.setProperty("--ce-accent", config.accentColor || "#23BDF0");
    label.textContent = config.launcherLabel || "Chat with us";
    title.textContent = config.widgetName || "Chat with us";
    welcome.textContent = config.available ? (config.welcomeMessage || config.greetingText) : config.offlineMessage;
    status.textContent = config.available ? (config.greetingText || "Online") : "Unavailable";
    status.style.color = config.available ? "#91e7b2" : "#ffb4ae";
    leadCapture = !!config.leadCaptureEnabled;
    ready = !!config.available;
    textarea.disabled = !ready;
    root.querySelector(".ce-send").disabled = !ready;
    updateContact();
  }

  function updateContact() {
    contact.hidden = !leadCapture || contactSaved;
    saved.hidden = !contactSaved;
  }

  function signature(messages) {
    if (!messages || !messages.length) return "0";
    var last = messages[messages.length - 1];
    return messages.length + "|" + last.created_at + "|" + last.sender + "|" + last.body;
  }

  function renderMessages(messages, countUnread) {
    messages = Array.isArray(messages) ? messages : [];
    var nextSignature = signature(messages);
    if (countUnread && !open && messageSignature && nextSignature !== messageSignature) {
      var last = messages[messages.length - 1];
      if (last && last.sender !== "visitor") unread += 1;
    }
    messageSignature = nextSignature;
    messagesEl.textContent = "";
    messages.forEach(function (message) {
      var bubble = document.createElement("div");
      bubble.className = "ce-msg ce-" + message.sender;
      bubble.textContent = message.body;
      var time = document.createElement("span");
      time.className = "ce-time";
      try { time.textContent = new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch (_) { time.textContent = ""; }
      bubble.appendChild(time);
      messagesEl.appendChild(bubble);
    });
    badge.textContent = String(unread);
    badge.setAttribute("data-show", unread > 0 ? "true" : "false");
    if (open) messagesEl.scrollIntoView ? null : null;
    var body = root.querySelector(".ce-body");
    if (open && body) body.scrollTop = body.scrollHeight;
  }

  async function api(action, payload) {
    var headers = { "Content-Type": "application/json" };
    if (token) headers["X-Codeedge-Chat-Session"] = token;
    var response = await fetch(base + "/api/website-chat/" + encodeURIComponent(widgetId), {
      method: "POST",
      mode: "cors",
      headers: headers,
      body: JSON.stringify(Object.assign({ action: action }, payload || {}))
    });
    var data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data.error || "Chat unavailable.");
    if (data.sessionToken) setToken(data.sessionToken);
    return data;
  }

  async function start() {
    if (busy) return;
    busy = true;
    setError("");
    try {
      var state = await api("start");
      applyConfig(state.config);
      contactSaved = !!state.contactSaved;
      updateContact();
      renderMessages(state.messages, false);
      if (ready) beginPolling();
    } catch (_) {
      ready = false;
      setError("Chat is temporarily unavailable.");
      textarea.disabled = true;
      root.querySelector(".ce-send").disabled = true;
    } finally {
      busy = false;
    }
  }

  async function refresh(countUnread) {
    if (!token || !ready) return;
    try {
      var state = await api("history");
      contactSaved = !!state.contactSaved;
      updateContact();
      renderMessages(state.messages, countUnread);
      setError("");
    } catch (_) {
      ready = false;
      setToken(null);
      stopPolling();
      setError("Session expired. Reopen chat to start a new secure session.");
    }
  }

  function beginPolling() {
    stopPolling();
    pollTimer = setInterval(function () { refresh(true); }, open ? 3000 : 7000);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  function setOpen(next) {
    open = next;
    panel.setAttribute("data-open", open ? "true" : "false");
    launcher.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      unread = 0;
      badge.setAttribute("data-show", "false");
      if (!ready) start(); else refresh(false);
      setTimeout(function () { if (!textarea.disabled) textarea.focus(); }, 0);
    }
    if (ready) beginPolling();
  }

  launcher.addEventListener("click", function () { setOpen(!open); });
  root.querySelector(".ce-close").addEventListener("click", function () { setOpen(false); launcher.focus(); });
  panel.addEventListener("keydown", function (event) {
    if (event.key === "Escape") { setOpen(false); launcher.focus(); }
  });

  compose.addEventListener("submit", async function (event) {
    event.preventDefault();
    var body = textarea.value.trim();
    if (!body || busy || !ready) return;
    busy = true;
    setError("");
    var requestId = (crypto && crypto.randomUUID) ? crypto.randomUUID() : "";
    if (!requestId) { busy = false; setError("This browser cannot send secure chat messages."); return; }
    try {
      var state = await api("send", { requestId: requestId, body: body });
      textarea.value = "";
      renderMessages(state.messages, false);
    } catch (_) {
      setError("Message not sent. Please wait a moment and try again.");
    } finally {
      busy = false;
    }
  });

  root.querySelector(".ce-fields").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (busy || !ready) return;
    var form = event.currentTarget;
    var data = new FormData(form);
    busy = true;
    setError("");
    try {
      var state = await api("contact", {
        contact_name: String(data.get("contact_name") || ""),
        phone: String(data.get("phone") || ""),
        email: String(data.get("email") || "")
      });
      contactSaved = !!state.contactSaved;
      updateContact();
      renderMessages(state.messages, false);
    } catch (_) {
      setError("Contact details could not be saved. Add a phone number or email and try again.");
    } finally {
      busy = false;
    }
  });

  if (token) start();
})();
`;
}
