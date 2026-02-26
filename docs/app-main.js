const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE_URL = "https://image.tmdb.org/t/p/original";
const TOKEN_STORAGE_KEY = "movienavi_tmdb_token";

const state = {
  token: resolveToken(),
  language: resolveConfig("LANGUAGE", "ko-KR"),
  region: resolveConfig("REGION", "KR"),
  ratings: {},
  userName: "회원님",
  isLoggedIn: false,
  heroSlides: [],
  heroSlideIndex: 0,
  heroTimer: null
};

const heroEl = document.querySelector("#hero");
const heroBgAEl = document.querySelector(".hero-bg-a");
const heroBgBEl = document.querySelector(".hero-bg-b");
const trendingEl = document.querySelector("#trending");
const popularEl = document.querySelector("#popular");
const topRatedEl = document.querySelector("#top-rated");
const personalizedEl = document.querySelector("#personalized");
const personalTitleEl = document.querySelector("#personal-title");
const personalHintEl = document.querySelector("#personalized-hint");
const searchInputEl = document.querySelector("#search-input");

document.querySelector("#search-form").addEventListener("submit", onSearchSubmit);
document.querySelector("#hero-search-focus").addEventListener("click", () => {
  if (typeof window.openHeaderSearch === "function") {
    window.openHeaderSearch();
    return;
  }
  searchInputEl.focus();
});
document.querySelectorAll(".carousel-nav").forEach((btn) => {
  btn.addEventListener("click", () => scrollCarousel(btn.dataset.target, btn.dataset.dir));
});

bootstrap();

async function bootstrap() {
  try {
    if (!state.token || state.token.includes("PASTE_YOUR_TMDB")) {
      const entered = window.prompt("TMDB Read Access Token을 입력하세요.");
      if (!entered) return;
      state.token = entered.trim();
      localStorage.setItem(TOKEN_STORAGE_KEY, state.token);
    }

    renderSkeleton(trendingEl, 8);
    renderSkeleton(popularEl, 8);
    renderSkeleton(topRatedEl, 8);
    renderSkeleton(personalizedEl, 8);
    renderState(personalHintEl, "loading", "개인화 추천 준비 중...");

    await loadProfileAndRatings();
    await Promise.all([loadTrending(), loadPopular(), loadTopRated(), loadPersonalized()]);
  } catch (error) {
    console.error(error);
    renderState(personalHintEl, "error", "메인 데이터를 불러오지 못했습니다.");
  }
}

function resolveConfig(key, fallback) {
  if (window.MOVIENAVI_CONFIG && window.MOVIENAVI_CONFIG[key]) return window.MOVIENAVI_CONFIG[key];
  return fallback;
}

function resolveToken() {
  if (window.MOVIENAVI_CONFIG && window.MOVIENAVI_CONFIG.TMDB_ACCESS_TOKEN) {
    return window.MOVIENAVI_CONFIG.TMDB_ACCESS_TOKEN;
  }
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

async function tmdb(path, params = {}) {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  const mergedParams = { language: state.language, region: state.region, ...params };
  Object.entries(mergedParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${state.token}`,
      "Content-Type": "application/json"
    }
  });
  if (!response.ok) throw new Error(`TMDB request failed: ${response.status}`);
  return response.json();
}

async function api(url, method = "GET", body) {
  const response = await fetch(url, {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}

async function loadProfileAndRatings() {
  const me = await api("/api/auth/me");
  if (me.ok && me.data?.displayName) {
    state.isLoggedIn = true;
    state.userName = me.data.displayName;
  }
  personalTitleEl.textContent = state.isLoggedIn
    ? `${state.userName}님이 좋아하실만한 영화`
    : "회원님이 좋아하실만한 영화";

  const ratings = await api("/api/ratings");
  if (ratings.ok && Array.isArray(ratings.data)) {
    state.ratings = ratings.data.reduce((acc, item) => {
      acc[item.movieId] = item;
      return acc;
    }, {});
  }
}

async function loadTrending() {
  const data = await tmdb("/trending/movie/week");
  const movies = data.results?.slice(0, 20) || [];
  renderCarousel(trendingEl, movies);
  setupHeroSlides(movies);
}

async function loadPopular() {
  const data = await tmdb("/movie/popular", { page: 1 });
  renderCarousel(popularEl, data.results?.slice(0, 20) || []);
}

async function loadTopRated() {
  const data = await tmdb("/movie/top_rated", { page: 1 });
  renderCarousel(topRatedEl, data.results?.slice(0, 20) || []);
}

async function loadPersonalized() {
  const ratedItems = Object.values(state.ratings);
  if (!ratedItems.length) {
    const fallback = await tmdb("/movie/popular", { page: 2 });
    renderCarousel(personalizedEl, fallback.results?.slice(0, 20) || []);
    renderState(
      personalHintEl,
      "empty",
      state.isLoggedIn
        ? "평가 페이지에서 별점을 남기면 더 정확한 추천을 제공합니다."
        : "로그인 후 평가를 남기면 개인화 추천이 적용됩니다."
    );
    return;
  }

  const topRated = ratedItems
    .slice()
    .sort((a, b) => (b.rating || 0) - (a.rating || 0))
    .slice(0, 3);

  const feeds = await Promise.all(topRated.map((item) => tmdb(`/movie/${item.movieId}/recommendations`, { page: 1 })));
  const ratedIds = new Set(ratedItems.map((item) => Number(item.movieId)));
  const merged = dedupeMovies(feeds.flatMap((feed) => feed.results || [])).filter((movie) => !ratedIds.has(movie.id));

  if (!merged.length) {
    const fallback = await tmdb("/movie/popular", { page: 3 });
    renderCarousel(personalizedEl, fallback.results?.slice(0, 20) || []);
    renderState(personalHintEl, "empty", "추천 후보가 부족해 인기 영화를 보여드립니다.");
    return;
  }

  renderCarousel(personalizedEl, merged.slice(0, 20));
  renderState(personalHintEl, "ok", `${state.userName}님의 평가를 반영한 추천`);
}

function onSearchSubmit(event) {
  event.preventDefault();
  const query = searchInputEl.value.trim();
  if (!query) return;
  window.location.href = `./search.html?q=${encodeURIComponent(query)}`;
}

function setupHeroSlides(movies) {
  const slides = movies
    .filter((movie) => movie.backdrop_path)
    .slice(0, 5)
    .map((movie) => `${BACKDROP_BASE_URL}${movie.backdrop_path}`);
  if (!slides.length) return;

  state.heroSlides = slides;
  state.heroSlideIndex = 0;
  heroBgAEl.style.backgroundImage = `url(${slides[0]})`;
  heroBgAEl.classList.add("active");
  heroBgBEl.classList.remove("active");
  heroBgBEl.style.backgroundImage = "";

  if (state.heroTimer) {
    clearInterval(state.heroTimer);
    state.heroTimer = null;
  }
  if (slides.length > 1) {
    state.heroTimer = setInterval(nextHeroSlide, 5000);
  }
}

function nextHeroSlide() {
  if (!state.heroSlides.length) return;
  const nextIndex = (state.heroSlideIndex + 1) % state.heroSlides.length;
  const nextUrl = state.heroSlides[nextIndex];

  const active = heroBgAEl.classList.contains("active") ? heroBgAEl : heroBgBEl;
  const idle = active === heroBgAEl ? heroBgBEl : heroBgAEl;

  idle.style.backgroundImage = `url(${nextUrl})`;
  idle.classList.remove("exit");
  idle.classList.add("enter");
  void idle.offsetWidth;

  active.classList.remove("active");
  active.classList.add("exit");
  idle.classList.remove("enter");
  idle.classList.add("active");

  window.setTimeout(() => {
    active.classList.remove("exit");
  }, 720);

  state.heroSlideIndex = nextIndex;
}

function renderCarousel(container, movies) {
  if (!movies.length) {
    renderState(container, "empty", "데이터가 없습니다.");
    return;
  }
  container.innerHTML = "";
  movies.forEach((movie) => container.appendChild(createMovieCard(movie)));
}

function createMovieCard(movie) {
  const card = document.createElement("article");
  card.className = "movie-card movie-card-carousel";
  const userRating = state.ratings[movie.id]?.rating || 0;
  const year = movie.release_date ? movie.release_date.slice(0, 4) : "미정";
  card.innerHTML = `
    <img src="${movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : ""}" alt="${escapeHtml(movie.title || "")}" />
    <div class="movie-meta">
      <h3 class="movie-title">${escapeHtml(movie.title || "제목 없음")}</h3>
      <p class="movie-sub">${year} · TMDB ${Number(movie.vote_average || 0).toFixed(1)}</p>
      <p class="movie-sub">내 평가 ${userRating ? `${userRating}★` : "없음"}</p>
      <button class="detail-btn" type="button">상세 보기</button>
    </div>
  `;
  card.querySelector(".detail-btn").addEventListener("click", () => {
    window.location.href = `./movie-detail.html?id=${movie.id}`;
  });
  return card;
}

function renderSkeleton(container, count) {
  container.innerHTML = "";
  for (let i = 0; i < count; i += 1) {
    const skeleton = document.createElement("article");
    skeleton.className = "movie-card movie-card-carousel skeleton-card";
    skeleton.innerHTML = `
      <div class="skeleton-poster"></div>
      <div class="movie-meta">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
    `;
    container.appendChild(skeleton);
  }
}

function renderState(target, type, message) {
  target.innerHTML = `<div class="state-chip state-${type}">${escapeHtml(message)}</div>`;
}

function scrollCarousel(targetSelector, dir) {
  const el = document.querySelector(targetSelector);
  if (!el) return;
  const amount = Math.max(280, Math.floor(el.clientWidth * 0.7));
  el.scrollBy({ left: dir === "next" ? amount : -amount, behavior: "smooth" });
}

function dedupeMovies(movies) {
  return movies.filter((movie, idx, arr) => arr.findIndex((t) => t.id === movie.id) === idx);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
