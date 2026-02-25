const outputEl = document.querySelector("#auth-result");

document.querySelector("#signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    email: document.querySelector("#signup-email").value.trim(),
    password: document.querySelector("#signup-password").value,
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
