const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const IMAGE_BASE_URL = "https://image.tmdb.org/t/p/w500";
const BACKDROP_BASE_URL = "https://image.tmdb.org/t/p/original";
const TOKEN_STORAGE_KEY = "movienavi_tmdb_token";

const state = {
  token: resolveToken(),
  language: resolveConfig("LANGUAGE", "ko-KR"),
  region: resolveConfig("REGION", "KR")
};

const stageEl = document.querySelector("#detail-stage");
const searchInputEl = document.querySelector("#search-input");
document.querySelector("#search-form").addEventListener("submit", onSearchSubmit);
window.addEventListener("popstate", async () => {
  const movieId = Number(new URLSearchParams(window.location.search).get("id"));
  if (movieId) {
    await renderMovie(movieId);
  }
});

bootstrap();

async function bootstrap() {
  const movieId = Number(new URLSearchParams(window.location.search).get("id"));
  if (!movieId) {
    renderError("잘못된 접근입니다. 영화 ID가 없습니다.");
    return;
  }

  try {
    if (!state.token || state.token.includes("PASTE_YOUR_TMDB")) {
      const entered = window.prompt("TMDB Read Access Token을 입력하세요.");
      if (!entered) return;
      state.token = entered.trim();
      localStorage.setItem(TOKEN_STORAGE_KEY, state.token);
    }

    await renderMovie(movieId);
  } catch (error) {
    console.error(error);
    renderError("상세정보를 불러오지 못했습니다.");
  }
}

async function renderMovie(movieId) {
  stageEl.classList.add("is-loading");
  stageEl.innerHTML = `<div class="state-chip state-loading">상세정보 로딩 중...</div>`;

  const detailPromise = tmdb(`/movie/${movieId}`, { append_to_response: "credits" });
  const providerPromise = fetch(`/api/tmdb/movies/${movieId}/watch-providers`, {
    credentials: "include"
  })
    .then((response) => {
      if (!response.ok) throw new Error(`Provider proxy failed: ${response.status}`);
      return response.json();
    })
    .catch(() => tmdb(`/movie/${movieId}/watch/providers`));
  const reviewsPromise = api(`/api/ratings/movies/${movieId}/reviews`);

  const detail = await detailPromise;
  const genreIds = (detail.genres || []).map((genre) => genre.id);
  const recommendationsPromise = loadGenreBasedRecommendations(movieId, genreIds);
  const [providerData, reviewsRes, recommendations] = await Promise.all([
    providerPromise,
    reviewsPromise,
    recommendationsPromise
  ]);

  const providerText = formatProviders(providerData, state.region);
  const reviews = reviewsRes.ok && Array.isArray(reviewsRes.data) ? reviewsRes.data : [];
  renderDetail(detail, providerText, recommendations, reviews);
}

function renderDetail(detail, providerText, recommendations, reviews) {
  stageEl.classList.remove("is-loading");
  const cast = (detail.credits?.cast || []).slice(0, 10);
  const backdropUrl = detail.backdrop_path ? `${BACKDROP_BASE_URL}${detail.backdrop_path}` : "";
  const posterUrl = detail.poster_path ? `${IMAGE_BASE_URL}${detail.poster_path}` : "";
  const releaseYear = detail.release_date ? detail.release_date.slice(0, 4) : "미정";

  stageEl.innerHTML = `
    <section class="detail-hero">
      ${
        backdropUrl
          ? `<img class="detail-backdrop" src="${backdropUrl}" alt="${escapeHtml(detail.title || "영화")} 배경 이미지" />`
          : "<div class='detail-backdrop detail-backdrop-empty'></div>"
      }
      ${
        posterUrl
          ? `<img class="detail-poster" src="${posterUrl}" alt="${escapeHtml(detail.title || "영화")} 포스터" />`
          : ""
      }
    </section>
    <section class="detail-section">
      <h1 class="detail-title">${escapeHtml(detail.title || "제목 없음")}</h1>
      <p class="detail-summary">${releaseYear} · TMDB ${Number(detail.vote_average || 0).toFixed(1)} · ${
        detail.runtime || "-"
      }분</p>
      <p class="detail-overview">${escapeHtml(detail.overview || "줄거리 정보가 없습니다.")}</p>
      <p class="detail-overview"><strong>시청 가능 플랫폼:</strong> ${escapeHtml(providerText)}</p>
      <div class="detail-cast">
        ${
          cast.length
            ? cast.map((person) => `<span class="chip">${escapeHtml(person.name)}</span>`).join("")
            : "<p class='muted'>출연 정보가 없습니다.</p>"
        }
      </div>
    </section>
    <section class="detail-section">
      <h2>추천 영화</h2>
      <div class="detail-reco-grid">
        ${
          recommendations.length
            ? recommendations
                .map(
                  (movie) => `
              <button type="button" class="detail-reco-card" data-movie-id="${movie.id}">
                <img src="${movie.poster_path ? `${IMAGE_BASE_URL}${movie.poster_path}` : ""}" alt="${escapeHtml(movie.title || "")}" />
                <span>${escapeHtml(movie.title || "제목 없음")}</span>
              </button>
            `
                )
                .join("")
            : "<p class='muted'>추천 영화 정보가 없습니다.</p>"
        }
      </div>
    </section>
    <section class="detail-section">
      <h2>유저 별점 · 한줄평</h2>
      <div class="detail-reviews">
        ${
          reviews.length
            ? reviews
                .map((review) => {
                  const spoilerClass = review.isSpoiler ? "is-spoiler" : "";
                  return `
                    <article class="review-card ${spoilerClass}">
                      <div class="review-head">
                        <strong>${escapeHtml(review.displayName || "익명")}</strong>
                        <span>${Number(review.rating || 0)}★</span>
                      </div>
                      <p class="review-text">${escapeHtml(review.reviewText || "")}</p>
                    </article>
                  `;
                })
                .join("")
            : "<p class='muted'>아직 등록된 한줄평이 없습니다.</p>"
        }
      </div>
    </section>
  `;

  stageEl.querySelectorAll(".detail-reco-card").forEach((button) => {
    button.addEventListener("click", async () => {
      const nextMovieId = Number(button.dataset.movieId);
      if (!nextMovieId) return;
      history.pushState(null, "", `./movie-detail.html?id=${nextMovieId}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
      await renderMovie(nextMovieId);
    });
  });
}

async function loadGenreBasedRecommendations(movieId, genreIds) {
  if (!genreIds.length) return [];
  const data = await tmdb("/discover/movie", {
    include_adult: false,
    sort_by: "popularity.desc",
    with_genres: genreIds.slice().sort((a, b) => a - b).join(","),
    "vote_count.gte": 80,
    page: 1
  });
  return (data.results || []).filter((movie) => movie.id !== movieId).slice(0, 10);
}

function renderError(message) {
  stageEl.classList.remove("is-loading");
  stageEl.innerHTML = `<div class="state-chip state-error">${escapeHtml(message)}</div>`;
}

function onSearchSubmit(event) {
  event.preventDefault();
  const query = searchInputEl.value.trim();
  if (!query) return;
  window.location.href = `./search.html?q=${encodeURIComponent(query)}`;
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

function formatProviders(providerData, region) {
  const results = providerData?.results || {};
  const normalizedRegion = normalizeCountryCode(region);
  const candidates = [
    normalizedRegion,
    normalizeCountryCode(state.language),
    "KR",
    "US",
    ...Object.keys(results)
  ].filter(Boolean);

  const regionData = candidates
    .map((code) => results[code])
    .find((data) => data && (data.flatrate || data.rent || data.buy || data.free || data.ads));

  if (!regionData) return "정보 없음";
  const names = [
    ...(regionData.flatrate || []),
    ...(regionData.rent || []),
    ...(regionData.buy || []),
    ...(regionData.free || []),
    ...(regionData.ads || [])
  ]
    .map((provider) => provider.provider_name)
    .filter(Boolean);
  const unique = names.filter((name, idx, arr) => arr.indexOf(name) === idx);
  return unique.length ? unique.join(", ") : "정보 없음";
}

function normalizeCountryCode(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (!text) return "";
  const country = text.includes("-") ? text.split("-").pop() : text;
  return country.toUpperCase();
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

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
