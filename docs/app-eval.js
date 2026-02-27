const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const TOKEN_STORAGE_KEY = "movienavi_tmdb_token";
const EVAL_SKIPPED_IDS_KEY = "movienavi_eval_skipped_ids";

const state = {
  token: resolveToken(),
  language: resolveConfig("LANGUAGE", "ko-KR"),
  region: resolveConfig("REGION", "KR"),
  genreMap: {},
  ratings: {},
  evalQueue: [],
  evalSeenIds: new Set(),
  evalCurrent: null,
  recentTotalPages: 500,
  classicTotalPages: 500,
  isAnimating: false,
  isLoggedIn: false,
  selectedRating: 0,
  hoverRating: 0
};

const evalSlotEl = document.querySelector("#eval-slot");
const evalPosterEl = document.querySelector("#eval-poster");
const evalTitleEl = document.querySelector("#eval-title");
const evalMetaEl = document.querySelector("#eval-meta");
const evalOverviewEl = document.querySelector("#eval-overview");
const evalReviewEl = document.querySelector("#eval-review");
const evalSpoilerEl = document.querySelector("#eval-spoiler");
const evalStarsEl = document.querySelector("#eval-stars");
const evalSkipBtn = document.querySelector("#eval-skip");
const evalRateBtn = document.querySelector("#eval-rate-btn");

evalSkipBtn.addEventListener("click", async () => {
  await transitionToNextMovie();
});
evalRateBtn.addEventListener("click", async () => {
  if (!state.evalCurrent || state.isAnimating) return;
  if (state.selectedRating <= 0) return;
  const saved = await setRating(state.evalCurrent, state.selectedRating);
  if (!saved) return;
  await transitionToNextMovie();
});

bootstrap();

async function bootstrap() {
  try {
    const me = await api("/api/auth/me");
    state.isLoggedIn = Boolean(me.ok && me.data?.displayName);
    if (!state.isLoggedIn) {
      redirectToLogin();
      return;
    }

    if (!state.token || state.token.includes("PASTE_YOUR_TMDB")) {
      const entered = window.prompt("TMDB Read Access Token을 입력하세요.");
      if (!entered) return;
      state.token = entered.trim();
      localStorage.setItem(TOKEN_STORAGE_KEY, state.token);
    }
    state.evalSeenIds = loadSeenIdsFromSession();

    await Promise.all([loadRatingsFromApi(), loadGenres()]);
    renderEvaluationStars();
    await ensureEvaluationMovie();
    await renderEvaluationMovie();
    animateIn();
  } catch (error) {
    console.error(error);
  }
}

function redirectToLogin() {
  const next = encodeURIComponent(`${window.location.pathname}${window.location.search}`);
  window.location.href = `./login.html?next=${next}`;
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

async function loadRatingsFromApi() {
  const response = await api("/api/ratings");
  if (!response.ok || !Array.isArray(response.data)) {
    state.ratings = {};
    return;
  }
  state.ratings = response.data.reduce((acc, item) => {
    acc[item.movieId] = item;
    return acc;
  }, {});
}

async function tmdb(path, params = {}) {
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  const mergedParams = {
    language: state.language,
    region: state.region,
    ...params
  };
  Object.entries(mergedParams).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") {
      url.searchParams.set(k, v);
    }
  });

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${state.token}`,
      "Content-Type": "application/json"
    }
  });
  if (!res.ok) throw new Error(`TMDB request failed: ${res.status}`);
  return res.json();
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

function renderEvaluationStars() {
  evalStarsEl.innerHTML = "";
  evalStarsEl.innerHTML = `
    <div class="star-rating-track" role="slider" aria-label="별점 선택" aria-valuemin="0.5" aria-valuemax="5" aria-valuenow="0">
      <div class="star-rating-base">★★★★★</div>
      <div class="star-rating-fill">★★★★★</div>
    </div>
    <p class="star-rating-value">0.0★</p>
  `;

  const track = evalStarsEl.querySelector(".star-rating-track");
  const fill = evalStarsEl.querySelector(".star-rating-fill");
  const valueEl = evalStarsEl.querySelector(".star-rating-value");
  if (!track || !fill || !valueEl) return;

  track.addEventListener("mousemove", (event) => {
    if (!state.evalCurrent || state.isAnimating) return;
    state.hoverRating = resolveHalfStarRating(event, track);
    applyStarRatingUI(fill, valueEl, state.hoverRating);
  });

  track.addEventListener("mouseleave", () => {
    if (!state.evalCurrent || state.isAnimating) return;
    state.hoverRating = 0;
    applyStarRatingUI(fill, valueEl, state.selectedRating);
  });

  track.addEventListener("click", async (event) => {
    if (!state.evalCurrent || state.isAnimating) return;
    state.selectedRating = resolveHalfStarRating(event, track);
    state.hoverRating = 0;
    applyStarRatingUI(fill, valueEl, state.selectedRating);
    updateRateButtonState();
  });
}

async function renderEvaluationMovie() {
  if (!state.evalCurrent) {
    setPosterLoading(false);
    evalPosterEl.classList.remove("eval-poster-placeholder");
    evalPosterEl.removeAttribute("src");
    evalPosterEl.alt = "평가할 영화를 불러오는 중";
    evalTitleEl.textContent = "불러오는 중...";
    evalMetaEl.textContent = "";
    evalOverviewEl.textContent = "";
    state.selectedRating = 0;
    state.hoverRating = 0;
    syncSelectedStarRating();
    updateRateButtonState();
    evalReviewEl.value = "";
    evalSpoilerEl.checked = false;
    return;
  }

  const movie = state.evalCurrent;
  evalPosterEl.classList.remove("eval-poster-placeholder");
  const posterUrl = movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : "";
  if (posterUrl) {
    setPosterLoading(true);
    try {
      await preloadImage(posterUrl);
      evalPosterEl.src = posterUrl;
    } finally {
      setPosterLoading(false);
    }
  } else {
    setPosterLoading(false);
    evalPosterEl.src = "";
  }
  evalPosterEl.alt = movie.title ? `${movie.title} 포스터` : "영화 포스터";
  evalTitleEl.textContent = movie.title || "제목 없음";
  const genreText = (movie.genre_ids || [])
    .map((id) => state.genreMap[id])
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");
  const releaseYear = movie.release_date ? String(movie.release_date).slice(0, 4) : "미정";
  const tmdbScore = Number(movie.vote_average || 0).toFixed(1);
  evalMetaEl.textContent = `${genreText || "장르 미정"} · ${releaseYear} · TMDB ${tmdbScore}`;
  evalOverviewEl.textContent = (movie.overview || "줄거리 정보가 없습니다.").slice(0, 130);
  state.selectedRating = 0;
  state.hoverRating = 0;
  syncSelectedStarRating();
  updateRateButtonState();
  evalReviewEl.value = "";
  evalSpoilerEl.checked = false;
}

async function loadGenres() {
  const data = await tmdb("/genre/movie/list");
  state.genreMap = (data.genres || []).reduce((acc, genre) => {
    acc[genre.id] = genre.name;
    return acc;
  }, {});
}

async function setRating(movie, rating) {
  const reviewText = evalReviewEl.value.trim();
  const payload = {
    rating,
    title: movie.title || "제목 없음",
    posterPath: movie.poster_path || null,
    genreIds: movie.genre_ids || [],
    reviewText: reviewText || null,
    isSpoiler: reviewText ? Boolean(evalSpoilerEl.checked) : null
  };
  const response = await api(`/api/ratings/${movie.id}`, "PUT", payload);
  if (response.ok && response.data) {
    state.ratings[movie.id] = response.data;
    return true;
  }
  return false;
}

async function ensureEvaluationMovie() {
  if (state.evalCurrent) return;
  await fillEvaluationQueue(1);
  state.evalCurrent = state.evalQueue.shift() || null;
}

async function transitionToNextMovie() {
  if (state.isAnimating) return;
  state.isAnimating = true;
  evalSlotEl.classList.remove("is-entering");
  evalSlotEl.classList.add("is-leaving");
  await wait(170);
  evalSlotEl.classList.remove("is-leaving");

  markCurrentMovieAsSeen();
  state.evalCurrent = null;
  await ensureEvaluationMovie();
  await renderEvaluationMovie();
  animateIn();
  state.isAnimating = false;
}

function animateIn() {
  evalSlotEl.classList.remove("is-entering");
  void evalSlotEl.offsetWidth;
  evalSlotEl.classList.add("is-entering");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fillEvaluationQueue(minSize) {
  let guard = 0;
  while (state.evalQueue.length < minSize && guard < 25) {
    guard += 1;
    const source = pickEvalSource();
    const page = await pickRandomPageBySource(source);
    const data = await requestDiscoverBySource(source, page);
    const totalPages = Number(data.total_pages || 1);
    if (source === "recent") {
      state.recentTotalPages = Math.min(totalPages, 500);
    } else {
      state.classicTotalPages = Math.min(totalPages, 500);
    }

    const ratedIds = new Set(Object.keys(state.ratings).map((id) => Number(id)));
    const queuedIds = new Set(state.evalQueue.map((movie) => movie.id));
    const candidates = shuffle(
      (data.results || []).filter(
        (movie) =>
          movie.poster_path &&
          !state.evalSeenIds.has(movie.id) &&
          !ratedIds.has(movie.id) &&
          !queuedIds.has(movie.id)
      )
    );

    candidates.forEach((movie) => {
      state.evalQueue.push(movie);
    });
  }
}

function pickEvalSource() {
  return Math.random() < 0.72 ? "recent" : "classic";
}

async function pickRandomPageBySource(source) {
  const totalPages = source === "recent" ? state.recentTotalPages : state.classicTotalPages;
  if (!totalPages || totalPages < 2) {
    const warmup = await requestDiscoverBySource(source, 1);
    const warmedTotalPages = Math.min(Number(warmup.total_pages || 1), 500);
    if (source === "recent") {
      state.recentTotalPages = warmedTotalPages;
    } else {
      state.classicTotalPages = warmedTotalPages;
    }
    return 1;
  }
  const preferredMax = source === "recent" ? 4 : 6;
  const capped = Math.max(1, Math.min(totalPages, preferredMax));
  return 1 + Math.floor(Math.random() * capped);
}

async function requestDiscoverBySource(source, page) {
  const currentYear = new Date().getFullYear();
  if (source === "recent") {
    return tmdb("/discover/movie", {
      include_adult: false,
      sort_by: "popularity.desc",
      "primary_release_date.gte": `${currentYear - 8}-01-01`,
      "vote_count.gte": 120,
      page
    });
  }

  return tmdb("/discover/movie", {
    include_adult: false,
    sort_by: "popularity.desc",
    "primary_release_date.lte": "2005-12-31",
    "vote_average.gte": 7.8,
    "vote_count.gte": 1200,
    page
  });
}

function shuffle(list) {
  const copied = list.slice();
  for (let i = copied.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copied[i], copied[j]] = [copied[j], copied[i]];
  }
  return copied;
}

function preloadImage(src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

function setPosterLoading(isLoading) {
  evalSlotEl.classList.toggle("is-poster-loading", isLoading);
}

function resolveHalfStarRating(event, track) {
  const rect = track.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)));
  const halfStep = Math.round(ratio * 10) / 2;
  return Math.min(5, Math.max(0.5, halfStep));
}

function applyStarRatingUI(fillEl, valueEl, rating) {
  const clamped = Math.min(5, Math.max(0, Number(rating) || 0));
  fillEl.style.width = `${(clamped / 5) * 100}%`;
  valueEl.textContent = `${clamped.toFixed(1)}★`;
  const track = evalStarsEl.querySelector(".star-rating-track");
  if (track) track.setAttribute("aria-valuenow", String(clamped));
}

function syncSelectedStarRating() {
  const fill = evalStarsEl.querySelector(".star-rating-fill");
  const valueEl = evalStarsEl.querySelector(".star-rating-value");
  if (!fill || !valueEl) return;
  applyStarRatingUI(fill, valueEl, state.selectedRating);
}

function updateRateButtonState() {
  if (!evalRateBtn) return;
  evalRateBtn.disabled = !state.evalCurrent || state.isAnimating || state.selectedRating <= 0;
}

function markCurrentMovieAsSeen() {
  if (!state.evalCurrent?.id) return;
  state.evalSeenIds.add(state.evalCurrent.id);
  persistSeenIdsToSession();
}

function loadSeenIdsFromSession() {
  try {
    const raw = sessionStorage.getItem(EVAL_SKIPPED_IDS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0));
  } catch {
    return new Set();
  }
}

function persistSeenIdsToSession() {
  sessionStorage.setItem(EVAL_SKIPPED_IDS_KEY, JSON.stringify(Array.from(state.evalSeenIds)));
}

