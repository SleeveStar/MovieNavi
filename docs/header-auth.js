(() => {
const accountLinkEl = document.querySelector("#account-link");
const topbarEl = document.querySelector(".topbar");
const mypageMenuLinks = Array.from(document.querySelectorAll('a[data-menu="mypage"]'));
const searchToggleEl = document.querySelector("#header-search-toggle");
const searchFormEl = document.querySelector("#search-form");
const searchInputEl = document.querySelector("#search-input");
const topLeftEl = document.querySelector(".top-left");
const topMenuEl = document.querySelector(".top-menu");
const floatingSideEl = createFloatingSide();

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
      setMyPageMenuVisibility(true);
      return;
    }
  } catch (error) {
    // keep fallback for unauthenticated or network error
  }
  accountLinkEl.textContent = "로그인/회원가입";
  accountLinkEl.href = "./login.html";
  accountLinkEl.classList.remove("is-logged-in");
  setMyPageMenuVisibility(false);
}

function initTopbarAutoHide() {
  let lastScrollY = window.scrollY;
  let ticking = false;

  const onScroll = () => {
    const currentScrollY = window.scrollY;

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
}

function setMyPageMenuVisibility(isVisible) {
  mypageMenuLinks.forEach((link) => {
    link.style.display = isVisible ? "" : "none";
  });
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
  if (!document.body) return null;
  const aside = document.createElement("aside");
  aside.className = "floating-side";
  aside.innerHTML = `
    <button type="button" class="floating-top-btn" aria-label="맨 위로 이동" title="맨 위로">
      TOP
    </button>
  `;
  document.body.appendChild(aside);
  return aside;
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
