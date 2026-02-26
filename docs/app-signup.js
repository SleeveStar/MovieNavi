const signupEmailEl = document.querySelector("#signup-email");
const verifyEmailHiddenEl = document.querySelector("#verify-email-hidden");
const signupStatusEl = document.querySelector("#signup-status");
const verifyCodeTimerEl = document.querySelector("#verify-code-timer");
const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,20}$/;
const PASSWORD_POLICY_MESSAGE = "비밀번호는 8~20자, 영문 대문자 1개 이상 + 특수문자 1개 이상을 포함해야 합니다.";
const VERIFY_CODE_TTL_MS = 5 * 60 * 1000;
const VERIFY_EXPIRES_AT_KEY = "movienavi_verify_expires_at";
let verifyTimer = null;

localStorage.removeItem(VERIFY_EXPIRES_AT_KEY);
restoreVerifyTimer();

document.querySelector("#signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  renderStatus("", "");
  const password = document.querySelector("#signup-password").value;
  if (!PASSWORD_POLICY_REGEX.test(password)) {
    renderStatus("error", PASSWORD_POLICY_MESSAGE);
    return;
  }

  const payload = {
    email: signupEmailEl.value.trim(),
    password,
    displayName: document.querySelector("#signup-name").value.trim()
  };
  const data = await request("/api/auth/signup/request", "POST", payload);
  if (data.ok && verifyEmailHiddenEl) {
    verifyEmailHiddenEl.value = payload.email;
    startVerifyTimer(Date.now() + VERIFY_CODE_TTL_MS);
    renderStatus("ok", "인증 코드를 이메일로 발송했습니다. 5분 이내에 인증 코드를 입력해 주세요.");
    return;
  }
  const fieldMessage = data.errors?.password || data.errors?.email || data.errors?.displayName;
  renderStatus("error", fieldMessage || data.message || "인증 코드 발급에 실패했습니다. 잠시 후 다시 시도해 주세요.");
});

document.querySelector("#verify-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  renderStatus("", "");
  const email = (verifyEmailHiddenEl?.value || signupEmailEl.value || "").trim();
  const payload = {
    email,
    code: document.querySelector("#verify-code").value.trim()
  };
  const data = await request("/api/auth/signup/verify", "POST", payload);
  if (data.ok) {
    clearVerifyTimer();
    sessionStorage.removeItem(VERIFY_EXPIRES_AT_KEY);
    hideVerifyTimer();
    renderStatus("ok", "회원가입이 완료되었습니다. 잠시 후 로그인 페이지로 이동합니다.");
    setTimeout(() => {
      window.location.href = "./login.html";
    }, 900);
    return;
  }
  renderStatus("error", data.message || "인증 코드 확인에 실패했습니다. 코드를 다시 확인해 주세요.");
});

async function request(url, method, body) {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, status: response.status, ...json };
  }
  return { ok: true, status: response.status, ...json };
}

function renderStatus(type, message) {
  if (!signupStatusEl) return;
  signupStatusEl.className = "form-status";
  if (!message) {
    signupStatusEl.textContent = "";
    return;
  }
  signupStatusEl.classList.add(type === "ok" ? "is-ok" : "is-error");
  signupStatusEl.textContent = message;
}

function restoreVerifyTimer() {
  const stored = Number(sessionStorage.getItem(VERIFY_EXPIRES_AT_KEY));
  if (!stored || Number.isNaN(stored)) {
    hideVerifyTimer();
    return;
  }
  startVerifyTimer(stored);
}

function startVerifyTimer(expiresAt) {
  sessionStorage.setItem(VERIFY_EXPIRES_AT_KEY, String(expiresAt));
  clearVerifyTimer();
  showVerifyTimer();
  tickVerifyTimer(expiresAt);
  verifyTimer = window.setInterval(() => tickVerifyTimer(expiresAt), 1000);
}

function tickVerifyTimer(expiresAt) {
  const remainMs = Math.max(0, expiresAt - Date.now());
  renderVerifyTimer(remainMs);
  if (remainMs <= 0) {
    clearVerifyTimer();
    sessionStorage.removeItem(VERIFY_EXPIRES_AT_KEY);
    renderStatus("error", "인증 코드가 만료되었습니다. 인증 코드를 다시 발급해 주세요.");
  }
}

function renderVerifyTimer(remainMs) {
  if (!verifyCodeTimerEl) return;
  const totalSec = Math.ceil(remainMs / 1000);
  const mm = Math.floor(totalSec / 60);
  const ss = totalSec % 60;
  verifyCodeTimerEl.textContent = `${mm}:${String(ss).padStart(2, "0")}`;
}

function clearVerifyTimer() {
  if (!verifyTimer) return;
  clearInterval(verifyTimer);
  verifyTimer = null;
}

function showVerifyTimer() {
  if (!verifyCodeTimerEl) return;
  verifyCodeTimerEl.hidden = false;
}

function hideVerifyTimer() {
  if (!verifyCodeTimerEl) return;
  verifyCodeTimerEl.hidden = true;
}
