const signupEmailEl = document.querySelector("#signup-email");
const verifyEmailHiddenEl = document.querySelector("#verify-email-hidden");

document.querySelector("#signup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    email: signupEmailEl.value.trim(),
    password: document.querySelector("#signup-password").value,
    displayName: document.querySelector("#signup-name").value.trim()
  };
  const data = await request("/api/auth/signup/request", "POST", payload);
  if (data.ok && verifyEmailHiddenEl) {
    verifyEmailHiddenEl.value = payload.email;
    window.alert("인증 코드를 이메일로 발송했습니다. 메일함에서 코드를 확인해 주세요.");
    return;
  }
  window.alert(data.message || "인증 코드 발급에 실패했습니다. 잠시 후 다시 시도해 주세요.");
});

document.querySelector("#verify-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = (verifyEmailHiddenEl?.value || signupEmailEl.value || "").trim();
  const payload = {
    email,
    code: document.querySelector("#verify-code").value.trim()
  };
  const data = await request("/api/auth/signup/verify", "POST", payload);
  if (data.ok) {
    window.alert("회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.");
    setTimeout(() => {
      window.location.href = "./login.html";
    }, 500);
    return;
  }
  window.alert(data.message || "인증 코드 확인에 실패했습니다. 코드를 다시 확인해 주세요.");
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
