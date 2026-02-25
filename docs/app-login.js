const outputEl = document.querySelector("#auth-result");

document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    email: document.querySelector("#login-email").value.trim(),
    password: document.querySelector("#login-password").value
  };
  const data = await request("/api/auth/login", "POST", payload);
  printResult(data);
  if (data.ok) {
    setTimeout(() => {
      window.location.href = "./mypage.html";
    }, 400);
  }
});

request("/api/auth/me", "GET").then((data) => {
  if (data.ok) {
    printResult(data);
  }
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

function printResult(data) {
  outputEl.textContent = JSON.stringify(data, null, 2);
}
