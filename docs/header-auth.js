const accountLinkEl = document.querySelector("#account-link");

if (accountLinkEl) {
  initAccountLink();
}

async function initAccountLink() {
  try {
    const response = await fetch("/api/auth/me", {
      credentials: "include"
    });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.displayName) {
      accountLinkEl.textContent = "마이페이지";
      accountLinkEl.href = "./mypage.html";
      accountLinkEl.classList.add("is-logged-in");
      accountLinkEl.title = `${data.displayName}님`;
      return;
    }
  } catch (error) {
    // keep fallback for unauthenticated or network error
  }
  accountLinkEl.textContent = "로그인/회원가입";
  accountLinkEl.href = "./login.html";
  accountLinkEl.classList.remove("is-logged-in");
}
