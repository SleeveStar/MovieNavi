document.querySelector("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    email: document.querySelector("#login-email").value.trim(),
    password: document.querySelector("#login-password").value
  };
  const data = await request("/api/auth/login", "POST", payload);
  if (data.ok) {
    setTimeout(() => {
      window.location.href = "./index.html";
    }, 400);
    return;
  }
  window.alert(data.message || "로그인에 실패했습니다. 이메일과 비밀번호를 확인해 주세요.");
});

request("/api/auth/me", "GET").then((data) => {
  if (data.ok) {
    window.location.href = "./index.html";
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
