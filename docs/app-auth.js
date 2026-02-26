const outputEl = document.querySelector("#auth-result");
const PASSWORD_POLICY_REGEX = /^(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,20}$/;
const PASSWORD_POLICY_MESSAGE = "비밀번호는 8~20자, 영문 대문자 1개 이상 + 특수문자 1개 이상을 포함해야 합니다.";

document.querySelector("#signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const password = document.querySelector("#signup-password").value;
  if (!PASSWORD_POLICY_REGEX.test(password)) {
    printResult({ ok: false, message: PASSWORD_POLICY_MESSAGE });
    return;
  }

  const payload = {
    email: document.querySelector("#signup-email").value.trim(),
    password,
    displayName: document.querySelector("#signup-name").value.trim()
  };
  const data = await request("/api/auth/signup/request", "POST", payload);
  printResult(data);
});

document.querySelector("#verify-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    email: document.querySelector("#verify-email").value.trim(),
    code: document.querySelector("#verify-code").value.trim()
  };
  const data = await request("/api/auth/signup/verify", "POST", payload);
  printResult(data);
});

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    email: document.querySelector("#login-email").value.trim(),
    password: document.querySelector("#login-password").value
  };
  const data = await request("/api/auth/login", "POST", payload);
  printResult(data);
});

document.querySelector("#logout-btn").addEventListener("click", async () => {
  const data = await request("/api/auth/logout", "POST");
  printResult(data);
});

request("/api/auth/me", "GET").then(printResult);

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

function printResult(data) {
  outputEl.textContent = JSON.stringify(data, null, 2);
}
