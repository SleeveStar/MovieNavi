(() => {
const CONSOLE_EASTER_EGG_KEY = "movienavi_console_easter_egg_shown";
const CONSOLE_EASTER_EGG_RUNTIME_KEY = "__movienavi_console_easter_egg_printed__";
const AUTH_CACHE_KEY = "__movienavi_auth_me_promise__";
const DEVTOOLS_OPEN_GAP = 160;
const accountLinkEl = document.querySelector("#account-link");
const topbarEl = document.querySelector(".topbar");
const topActionsEl = document.querySelector(".top-actions");
const searchToggleEl = document.querySelector("#header-search-toggle");
const searchFormEl = document.querySelector("#search-form");
const searchInputEl = document.querySelector("#search-input");
const topLeftEl = document.querySelector(".top-left");
const topMenuEl = document.querySelector(".top-menu");
const protectedMenuLinks = collectProtectedMenuLinks();
const floatingSideEl = createFloatingSide();

showConsoleEasterEgg();

if (accountLinkEl) {
  initAccountLink();
}
if (topbarEl) {
  initTopbarAutoHide();
}
if (topbarEl && topLeftEl && topMenuEl) {
  initMobileMenuToggle();
}
if (searchToggleEl && searchFormEl && searchInputEl) {
  initHeaderSearch();
}
if (floatingSideEl) {
  initFloatingSide(floatingSideEl);
}
setProtectedMenuVisibility(false);

function showConsoleEasterEgg() {
  // Print immediately if console is already open, and also arm a detector
  // so opening DevTools later still reveals the easter egg.
  armDevtoolsEasterEggWatcher();
  if (!isDevtoolsLikelyOpen()) return;
  printConsoleEasterEggOnce();
}

function armDevtoolsEasterEggWatcher() {
  if (window.__movienavi_devtools_watcher_started__) return;
  window.__movienavi_devtools_watcher_started__ = true;

  const tryPrint = () => {
    if (isDevtoolsLikelyOpen()) {
      printConsoleEasterEggOnce();
    }
  };

  window.addEventListener("resize", tryPrint, { passive: true });
  window.addEventListener("focus", tryPrint, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) tryPrint();
  });
  window.setInterval(tryPrint, 1200);
}

function isDevtoolsLikelyOpen() {
  const widthGap = Math.abs(window.outerWidth - window.innerWidth);
  const heightGap = Math.abs(window.outerHeight - window.innerHeight);
  return widthGap > DEVTOOLS_OPEN_GAP || heightGap > DEVTOOLS_OPEN_GAP;
}

function printConsoleEasterEggOnce() {
  if (window[CONSOLE_EASTER_EGG_RUNTIME_KEY]) return;

  try {
    if (sessionStorage.getItem(CONSOLE_EASTER_EGG_KEY) === "1") return;
    sessionStorage.setItem(CONSOLE_EASTER_EGG_KEY, "1");
  } catch {
    // no-op: runtime flag below still prevents duplicate prints in this tab.
  }
  window[CONSOLE_EASTER_EGG_RUNTIME_KEY] = true;

  console.log(
    "%c  🎬 MOVIENAVI END CREDITS 🍿  ",
    "background:#000;color:#fff;padding:7px 11px;border:1px solid #fff;font-weight:700;letter-spacing:0.08em;"
  );
  console.log("%c🎟️ Thanks for staying after the credits.", "background:#000;color:#fff;padding:3px 11px;font-size:12px;");
  console.log("%c🍿 Hidden reel unlocked: 당신의 취향 데이터는 좋은 영화로 보답됩니다. 🎞️", "background:#000;color:#fff;padding:3px 11px;font-size:12px;");
  console.log("%c🪑 조용히 착석 완료. 다음 장면도 함께 즐겨주세요. ✨", "background:#000;color:#fff;padding:3px 11px;font-size:12px;");
}

async function initAccountLink() {
  try {
    const auth = await getAuthState();
    if (auth.ok && auth.data?.displayName) {
      accountLinkEl.textContent = "마이페이지";
      accountLinkEl.href = "./mypage.html";
      accountLinkEl.classList.add("is-logged-in");
      accountLinkEl.title = `${auth.data.displayName}님`;
      setProtectedMenuVisibility(true);
      ensureLogoutButton();
      return;
    }
  } catch (error) {
    // keep fallback for unauthenticated or network error
  }
  accountLinkEl.textContent = "로그인/회원가입";
  accountLinkEl.href = "./login.html";
  accountLinkEl.classList.remove("is-logged-in");
  setProtectedMenuVisibility(false);
  removeLogoutButton();
}

function getAuthState() {
  if (window[AUTH_CACHE_KEY]) {
    return window[AUTH_CACHE_KEY];
  }

  window[AUTH_CACHE_KEY] = fetch("/api/auth/me", {
    credentials: "include"
  })
    .then(async (response) => {
      const data = await response.json().catch(() => null);
      return { ok: response.ok, status: response.status, data };
    })
    .catch(() => ({ ok: false, status: 0, data: null }));

  return window[AUTH_CACHE_KEY];
}

window.getMovienaviAuthState = getAuthState;

function collectProtectedMenuLinks() {
  if (!topMenuEl) return [];
  return Array.from(topMenuEl.querySelectorAll("a")).filter((link) => {
    const href = link.getAttribute("href") || "";
    return href.endsWith("evaluate.html") || href.endsWith("ratings.html");
  });
}

function setProtectedMenuVisibility(isLoggedIn) {
  protectedMenuLinks.forEach((link) => {
    link.hidden = !isLoggedIn;
    if (isLoggedIn) {
      link.removeAttribute("aria-hidden");
    } else {
      link.setAttribute("aria-hidden", "true");
    }
  });
}

function initTopbarAutoHide() {
  let lastScrollY = window.scrollY;
  let ticking = false;

  const onScroll = () => {
    const currentScrollY = window.scrollY;
    document.body.classList.toggle("page-scrolled", currentScrollY > 36);

    if (currentScrollY <= 20) {
      topbarEl.classList.remove("topbar-hidden");
    } else if (currentScrollY > lastScrollY + 8 && currentScrollY > 110) {
      topbarEl.classList.add("topbar-hidden");
    } else if (currentScrollY < lastScrollY - 8) {
      topbarEl.classList.remove("topbar-hidden");
    }

    lastScrollY = currentScrollY;
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      window.requestAnimationFrame(onScroll);
      ticking = true;
    },
    { passive: true }
  );
  document.body.classList.toggle("page-scrolled", window.scrollY > 36);
}

function ensureLogoutButton() {
  if (!topActionsEl) return;
  if (topActionsEl.querySelector("#logout-btn")) return;

  const logoutBtn = document.createElement("button");
  logoutBtn.id = "logout-btn";
  logoutBtn.type = "button";
  logoutBtn.className = "account-pill logout-pill";
  logoutBtn.textContent = "로그아웃";
  logoutBtn.addEventListener("click", async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include"
      });
    } finally {
      window.location.href = "./index.html";
    }
  });
  topActionsEl.appendChild(logoutBtn);
}

function removeLogoutButton() {
  const logoutBtn = document.querySelector("#logout-btn");
  if (logoutBtn) {
    logoutBtn.remove();
  }
}

function initMobileMenuToggle() {
  const toggleBtn = document.createElement("button");
  toggleBtn.type = "button";
  toggleBtn.className = "mobile-menu-toggle";
  toggleBtn.setAttribute("aria-label", "메뉴 열기");
  toggleBtn.setAttribute("aria-expanded", "false");
  toggleBtn.innerHTML = `
    <span></span>
    <span></span>
    <span></span>
  `;
  topLeftEl.insertBefore(toggleBtn, topMenuEl);

  const closeMenu = () => {
    topbarEl.classList.remove("mobile-menu-open");
    toggleBtn.setAttribute("aria-expanded", "false");
  };

  const toggleMenu = () => {
    const willOpen = !topbarEl.classList.contains("mobile-menu-open");
    topbarEl.classList.toggle("mobile-menu-open", willOpen);
    toggleBtn.setAttribute("aria-expanded", willOpen ? "true" : "false");
  };

  toggleBtn.addEventListener("click", toggleMenu);

  topMenuEl.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  document.addEventListener("click", (event) => {
    if (!topbarEl.classList.contains("mobile-menu-open")) return;
    if (toggleBtn.contains(event.target) || topMenuEl.contains(event.target)) return;
    closeMenu();
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeMenu();
  });
}

function initHeaderSearch() {
  const isSearchPage = window.location.pathname.endsWith("/search.html") || window.location.pathname.endsWith("search.html");

  const openSearch = () => {
    searchFormEl.hidden = false;
    searchToggleEl.setAttribute("aria-expanded", "true");
    window.setTimeout(() => searchInputEl.focus(), 0);
  };

  const closeSearch = () => {
    searchFormEl.hidden = true;
    searchToggleEl.setAttribute("aria-expanded", "false");
  };

  window.openHeaderSearch = openSearch;

  searchToggleEl.addEventListener("click", () => {
    const isOpen = !searchFormEl.hidden;
    if (isOpen) {
      closeSearch();
      return;
    }
    openSearch();
  });

  searchFormEl.addEventListener("submit", (event) => {
    const query = searchInputEl.value.trim();
    if (!query) {
      event.preventDefault();
      closeSearch();
      return;
    }
    if (!isSearchPage) {
      event.preventDefault();
      window.location.href = `./search.html?q=${encodeURIComponent(query)}`;
    }
  });

  document.addEventListener("click", (event) => {
    if (searchFormEl.hidden) return;
    if (searchFormEl.contains(event.target) || searchToggleEl.contains(event.target)) return;
    closeSearch();
  });
}

function createFloatingSide() {
  return null;
}

function initFloatingSide(aside) {
  const topBtn = aside.querySelector(".floating-top-btn");
  if (!topBtn) return;

  topBtn.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  let ticking = false;
  const toggleVisibility = () => {
    aside.classList.toggle("is-visible", window.scrollY > 180);
    ticking = false;
  };

  window.addEventListener(
    "scroll",
    () => {
      if (ticking) return;
      window.requestAnimationFrame(toggleVisibility);
      ticking = true;
    },
    { passive: true }
  );

  toggleVisibility();
}
})();
