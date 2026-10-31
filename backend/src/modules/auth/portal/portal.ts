import { LOGO_SVG } from "./logo";

/**
 * The hosted sign-in portal: one self-contained page (no build step, no
 * external scripts) that drives the existing /api/auth endpoints. The desktop
 * app opens it in the user's browser at /desktop/authorize.
 */
export function portalHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sign in · CapScreen</title>
<style>
  :root { --bg:#f6f6f7; --card:#fff; --fg:#0a0a0a; --muted:#6b7280; --line:#e5e7eb; --accent:#0a0a0a; --err:#b91c1c; --ok:#047857; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#0b0b0c; --card:#151517; --fg:#f3f4f6; --muted:#9ca3af; --line:#27272a; --accent:#f3f4f6; --err:#f87171; --ok:#34d399; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:16px;
         background:var(--bg); color:var(--fg); font:15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
  main { width:100%; max-width:400px; }
  .logo { display:block; height:34px; margin:0 auto 28px; }
  .logo svg { height:100%; width:auto; display:block; margin:0 auto; }
  @media (prefers-color-scheme: dark) { .logo circle { fill: var(--fg); } .logo path:first-of-type { fill: var(--bg); } .logo path:last-of-type { fill: var(--fg); } }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:28px; }
  h1 { font: 500 24px/1.25 Georgia, "Times New Roman", serif; margin:0 0 6px; }
  p.sub { color:var(--muted); margin:0 0 20px; font-size:14px; }
  label { display:block; font-size:13px; color:var(--muted); margin:12px 0 6px; }
  input { width:100%; height:40px; border:1px solid var(--line); border-radius:8px; padding:0 12px; font:inherit; background:transparent; color:var(--fg); }
  input:focus { outline:2px solid var(--accent); outline-offset:-1px; }
  button { width:100%; height:40px; margin-top:18px; border:0; border-radius:8px; background:var(--accent); color:var(--card); font:500 15px/1 inherit; cursor:pointer; }
  button:disabled { opacity:.6; cursor:default; }
  .links { display:flex; justify-content:space-between; margin-top:16px; font-size:13px; }
  a { color:var(--fg); }
  .msg { margin-top:14px; font-size:14px; }
  .msg.err { color:var(--err); } .msg.ok { color:var(--ok); }
  .badge { display:inline-flex; gap:6px; align-items:center; font-size:12px; color:var(--muted); border:1px solid var(--line); border-radius:999px; padding:3px 10px; margin-bottom:14px; }
  .hidden { display:none !important; }
  footer { text-align:center; color:var(--muted); font-size:12px; margin-top:18px; }
</style>
</head>
<body>
<main>
  <div class="logo" aria-label="CapScreen">${LOGO_SVG}</div>
  <div class="card">
    <div id="desktopBadge" class="badge hidden">🖥  Signing in to the CapScreen desktop app</div>

    <section id="signin">
      <h1>Sign in</h1>
      <p class="sub">Use your CapScreen account.</p>
      <form id="signinForm">
        <label for="si-email">Email</label><input id="si-email" type="email" autocomplete="email" required>
        <label for="si-password">Password</label><input id="si-password" type="password" autocomplete="current-password" required>
        <button type="submit">Sign in</button>
      </form>
      <div class="links"><a href="#signup" data-view="signup">Create account</a><a href="#forgot" data-view="forgot">Forgot password?</a></div>
    </section>

    <section id="signup" class="hidden">
      <h1>Create your account</h1>
      <p class="sub">Your cap tables and screenings stay on your computer. This account only controls access.</p>
      <form id="signupForm">
        <label for="su-name">Full name</label><input id="su-name" autocomplete="name" required>
        <label for="su-org">Organisation</label><input id="su-org" autocomplete="organization">
        <label for="su-email">Work email</label><input id="su-email" type="email" autocomplete="email" required>
        <label for="su-password">Password</label><input id="su-password" type="password" autocomplete="new-password" minlength="8" required>
        <button type="submit">Create account</button>
      </form>
      <div class="links"><a href="#signin" data-view="signin">Already have an account? Sign in</a></div>
    </section>

    <section id="forgot" class="hidden">
      <h1>Reset your password</h1>
      <p class="sub">We'll email you a reset link.</p>
      <form id="forgotForm">
        <label for="fp-email">Email</label><input id="fp-email" type="email" autocomplete="email" required>
        <button type="submit">Send reset link</button>
      </form>
      <div class="links"><a href="#signin" data-view="signin">Back to sign in</a></div>
    </section>

    <section id="reset" class="hidden">
      <h1>Choose a new password</h1>
      <form id="resetForm">
        <label for="rp-password">New password</label><input id="rp-password" type="password" autocomplete="new-password" minlength="8" required>
        <button type="submit">Update password</button>
      </form>
    </section>

    <section id="done" class="hidden">
      <h1 id="doneTitle">You're signed in</h1>
      <p class="sub" id="doneText">You can close this tab and return to CapScreen.</p>
    </section>

    <div id="msg" class="msg" role="status" aria-live="polite"></div>
  </div>
  <footer>CapScreen · screening decision support, not legal advice</footer>
</main>
<script>
(() => {
  const $ = (id) => document.getElementById(id);
  const views = ["signin", "signup", "forgot", "reset", "done"];
  const params = new URLSearchParams(location.search);
  const STORE = "capscreen.desktopAuth";

  // Desktop authorization request: keep it across signup / email verification.
  if (location.pathname === "/desktop/authorize" && params.get("redirect_uri")) {
    sessionStorage.setItem(STORE, JSON.stringify({
      redirect_uri: params.get("redirect_uri"),
      state: params.get("state"),
      code_challenge: params.get("code_challenge"),
      code_challenge_method: params.get("code_challenge_method"),
    }));
  }
  const pending = () => { try { return JSON.parse(sessionStorage.getItem(STORE) || "null"); } catch { return null; } };
  if (pending()) $("desktopBadge").classList.remove("hidden");

  function show(view, message, kind) {
    views.forEach((v) => $(v).classList.toggle("hidden", v !== view));
    say(message || "", kind);
    const first = $(view).querySelector("input"); if (first) first.focus();
  }
  function say(text, kind) { const m = $("msg"); m.textContent = text; m.className = "msg" + (kind ? " " + kind : ""); }
  async function api(path, body, token) {
    const r = await fetch("/api/auth" + path, {
      method: "POST", credentials: "include",
      headers: Object.assign({ "Content-Type": "application/json" }, token ? { Authorization: "Bearer " + token } : {}),
      body: JSON.stringify(body || {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.detail || "Something went wrong"); e.data = data; e.status = r.status; throw e; }
    return data;
  }
  function busy(form, on) { form.querySelectorAll("button,input").forEach((el) => (el.disabled = on)); }

  async function finishSignedIn(accessToken, user) {
    const req = pending();
    if (!req) {
      show("done");
      $("doneTitle").textContent = "Signed in as " + (user.displayName || user.email);
      $("doneText").textContent = "Open the CapScreen desktop app and choose Sign in to continue.";
      return;
    }
    const { redirect } = await api("/desktop/authorize-code", req, accessToken);
    // The app now holds its own session; end the portal's browser session.
    await api("/signout", {}, accessToken).catch(() => {});
    sessionStorage.removeItem(STORE);
    show("done");
    location.replace(redirect); // the desktop app's loopback page takes over
  }

  document.querySelectorAll("[data-view]").forEach((a) => a.addEventListener("click", (e) => { e.preventDefault(); show(a.dataset.view); }));

  $("signinForm").addEventListener("submit", async (e) => {
    e.preventDefault(); busy(e.target, true); say("Signing in…");
    try {
      const data = await api("/signin", { email: $("si-email").value, password: $("si-password").value });
      await finishSignedIn(data.tokens.accessToken.token, data.user);
    } catch (err) { say(err.message, "err"); } finally { busy(e.target, false); }
  });

  $("signupForm").addEventListener("submit", async (e) => {
    e.preventDefault(); busy(e.target, true); say("Creating your account…");
    try {
      const data = await api("/signup", { displayName: $("su-name").value, organisation: $("su-org").value, email: $("su-email").value, password: $("su-password").value });
      if (data.emailVerificationRequired) show("signin", "Check your inbox to verify your email, then sign in here.", "ok");
      else await finishSignedIn(data.tokens.accessToken.token, data.user);
    } catch (err) { say(err.message, "err"); } finally { busy(e.target, false); }
  });

  $("forgotForm").addEventListener("submit", async (e) => {
    e.preventDefault(); busy(e.target, true);
    try { const d = await api("/forgot-password", { email: $("fp-email").value }); say(d.message, "ok"); }
    catch (err) { say(err.message, "err"); } finally { busy(e.target, false); }
  });

  $("resetForm").addEventListener("submit", async (e) => {
    e.preventDefault(); busy(e.target, true);
    try { const d = await api("/reset-password", { token: params.get("token"), password: $("rp-password").value }); show("signin", d.message, "ok"); }
    catch (err) { say(err.message, "err"); } finally { busy(e.target, false); }
  });

  // Entry points from email links.
  if (location.pathname === "/verify-email" && params.get("token")) {
    api("/verify-email", { token: params.get("token") })
      .then((d) => show("signin", d.message, "ok"))
      .catch((err) => show("signin", err.message, "err"));
  } else if (location.pathname === "/reset-password" && params.get("token")) {
    show("reset");
  } else {
    show(location.hash === "#signup" ? "signup" : "signin");
  }
})();
</script>
</body>
</html>`;
}

