const GAME_URL = "/api/game";
const SEARCH_URL = "/api/search";
const STORAGE_KEY = "catchdle_daily_game";
const MAX_ATTEMPTS = 10;

const CLUE_STATS_ATTEMPT = 4;
const CLUE_DIFFICULTY_ATTEMPT = 7;
const CLUE_BACKGROUND_ATTEMPT = 9;

const STAR_CLOSE_RANGE = 0.50;
const BPM_CLOSE_RANGE = 20;
const LENGTH_CLOSE_RANGE = 15;

let secretMap = null; // Only populated after the server marks the game finished.
let selectedMap = null;
let gameState = null;
let currentUser = null;
let messageTimeout = null;
let countdownInterval = null;

const mapInput = document.getElementById("mapInput");
const suggestions = document.getElementById("suggestions");
const guessButton = document.getElementById("guessButton");
const attemptsContainer = document.getElementById("attempts");
const attemptCount = document.getElementById("attemptCount");
const message = document.getElementById("message");
const winScreen = document.getElementById("winScreen");
const backgroundCollage = document.getElementById("backgroundCollage");

function normalize(value) {
    return String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

function escapeHTML(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getColombiaDate() {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(new Date());
}

function saveGameState() {
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(gameState)
        );
    } catch (error) {
        console.error(
            "Error guardando partida:",
            error
        );
    }
}

function createGameState(serverState = {}) {
    gameState = {
        date: serverState.date || getColombiaDate(),
        attempts: Array.isArray(serverState.attempts) ? serverState.attempts : [],
        won: Boolean(serverState.won),
        clues: serverState.clues || { stats: false, difficulty: false, background: false }
    };
    saveGameState();
    return gameState;
}

function getCover(map) {
    if (!map) {
        return "";
    }

    return (
        map.cover_url ||
        `https://assets.ppy.sh/beatmaps/${map.beatmapset_id}/covers/cover.jpg`
    );
}

function getBackground(map) {
    if (!map) {
        return "";
    }

    return (
        map.background_url ||
        map.bg_url ||
        getCover(map)
    );
}

function formatDuration(seconds) {
    const total =
        Math.max(
            0,
            Math.round(Number(seconds) || 0)
        );

    const minutes =
        Math.floor(total / 60);

    const secs =
        total % 60;

    return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function getDuration(map) {
    return map
        ? Number(map.duration) || 0
        : 0;
}

function getStars(map) {
    return Number(map?.stars ?? 0);
}

function getBPM(map) {
    return Number(map?.bpm ?? 0);
}

function getLength(map) {
    return getDuration(map);
}

function compareText(a, b) {
    return normalize(a) === normalize(b)
        ? "correct"
        : "wrong";
}

function compareNumber(
    value,
    correct,
    closeRange
) {
    const guess = Number(value);

    if (
        Math.abs(guess - correct) < 0.001
    ) {
        return {
            status: "correct",
            arrow: ""
        };
    }

    if (
        Math.abs(guess - correct) <= closeRange
    ) {
        return {
            status: "close",
            arrow:
                guess < correct
                    ? "↑"
                    : "↓"
        };
    }

    return {
        status: "wrong",
        arrow:
            guess < correct
                ? "↑"
                : "↓"
    };
}

function createCell(
    value,
    status,
    arrow = ""
) {
    const cell =
        document.createElement("div");

    cell.className =
        `result-cell ${status}`;

    cell.innerHTML =
        `<span>${escapeHTML(value)}</span>` +
        (
            arrow
                ? `<span class="arrow">${arrow}</span>`
                : ""
        );

    return cell;
}
function renderAttempt(attempt) {
    const map = attempt?.map;
    if (!map || !attemptsContainer) return;
    const comparison = attempt.comparison || {};
    const row = document.createElement("div");
    row.className = "attempt-row";

    const mapCell = document.createElement("div");
    mapCell.className = "attempt-map";
    const image = document.createElement("img");
    image.className = "attempt-cover";
    image.src = getCover(map);
    image.alt = map.title || "Beatmap";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.onerror = function () { this.style.display = "none"; };

    const mapInfo = document.createElement("div");
    mapInfo.className = "attempt-map-info";
    const title = document.createElement("div");
    title.className = "attempt-title";
    title.textContent = map.title || "Unknown";
    const mapper = document.createElement("div");
    mapper.className = "attempt-map-mapper";
    mapper.textContent = map.mapper || "Unknown";
    mapInfo.append(title, mapper);
    mapCell.append(image, mapInfo);
    row.appendChild(mapCell);

    row.appendChild(createCell(map.artist || "-", comparison.artist || "wrong"));
    row.appendChild(createCell(map.mapper || "-", comparison.mapper || "wrong"));
    row.appendChild(createCell(Number(map.stars || 0).toFixed(2), comparison.stars?.status || "wrong", comparison.stars?.arrow || ""));
    row.appendChild(createCell(Number(map.bpm || 0).toFixed(2), comparison.bpm?.status || "wrong", comparison.bpm?.arrow || ""));
    row.appendChild(createCell(formatDuration(map.duration), comparison.length?.status || "wrong", comparison.length?.arrow || ""));
    attemptsContainer.prepend(row);
}

function renderHistory() {

    if (!attemptsContainer) {
        return;
    }

    attemptsContainer.innerHTML = "";


    if (!gameState) {
        return;
    }


    if (!Array.isArray(gameState.attempts)) {

        gameState.attempts = [];

        saveGameState();

    }


    gameState.attempts.forEach(
        attempt => {

            if (
                attempt &&
                attempt.map
            ) {

                renderAttempt(attempt);

            }

        }
    );

}


/* =========================================================
   CLUE BUTTONS
   ========================================================= */

function updateClueButtons() {

    if (!gameState) {
        return;
    }


    const attempts =
        Array.isArray(
            gameState.attempts
        )
            ? gameState.attempts.length
            : 0;


    const statsButton =
        document.getElementById(
            "clueStats"
        );

    const statsStatus =
        document.getElementById(
            "clueStatsStatus"
        );


    if (statsButton) {

        if (
            attempts >=
            CLUE_STATS_ATTEMPT
        ) {

            statsButton.disabled =
                gameState.clues.stats;

            statsButton.classList.remove(
                "locked"
            );

            statsButton.classList.toggle(
                "available",
                !gameState.clues.stats
            );

            statsButton.classList.toggle(
                "revealed",
                gameState.clues.stats
            );

            if (statsStatus) {

                statsStatus.textContent =
                    gameState.clues.stats
                        ? "✓ REVEALED"
                        : "AVAILABLE";

            }

        } else {

            statsButton.disabled =
                true;

            statsButton.classList.add(
                "locked"
            );

            statsButton.classList.remove(
                "available"
            );

            if (statsStatus) {

                statsStatus.textContent =
                    `🔒 ${CLUE_STATS_ATTEMPT} ATTEMPTS`;

            }

        }

    }


    const difficultyButton =
        document.getElementById(
            "clueDifficulty"
        );

    const difficultyStatus =
        document.getElementById(
            "clueDifficultyStatus"
        );


    if (difficultyButton) {

        if (
            attempts >=
            CLUE_DIFFICULTY_ATTEMPT
        ) {

            difficultyButton.disabled =
                gameState.clues.difficulty;

            difficultyButton.classList.remove(
                "locked"
            );

            difficultyButton.classList.toggle(
                "available",
                !gameState.clues.difficulty
            );

            difficultyButton.classList.toggle(
                "revealed",
                gameState.clues.difficulty
            );

            if (difficultyStatus) {

                difficultyStatus.textContent =
                    gameState.clues.difficulty
                        ? "✓ REVEALED"
                        : "AVAILABLE";

            }

        } else {

            difficultyButton.disabled =
                true;

            difficultyButton.classList.add(
                "locked"
            );

            difficultyButton.classList.remove(
                "available"
            );

            if (difficultyStatus) {

                difficultyStatus.textContent =
                    `🔒 ${CLUE_DIFFICULTY_ATTEMPT} ATTEMPTS`;

            }

        }

    }


    const backgroundButton =
        document.getElementById(
            "clueBackground"
        );

    const backgroundStatus =
        document.getElementById(
            "clueBackgroundStatus"
        );


    if (backgroundButton) {

        if (
            attempts >=
            CLUE_BACKGROUND_ATTEMPT
        ) {

            backgroundButton.disabled =
                gameState.clues.background;

            backgroundButton.classList.remove(
                "locked"
            );

            backgroundButton.classList.toggle(
                "available",
                !gameState.clues.background
            );

            backgroundButton.classList.toggle(
                "revealed",
                gameState.clues.background
            );

            if (backgroundStatus) {

                backgroundStatus.textContent =
                    gameState.clues.background
                        ? "✓ REVEALED"
                        : "AVAILABLE";

            }

        } else {

            backgroundButton.disabled =
                true;

            backgroundButton.classList.add(
                "locked"
            );

            backgroundButton.classList.remove(
                "available"
            );

            if (backgroundStatus) {

                backgroundStatus.textContent =
                    `🔒 ${CLUE_BACKGROUND_ATTEMPT} ATTEMPTS`;

            }

        }

    }

}


/* =========================================================
   AUTO REVEAL CLUES
   ========================================================= */

function applyServerClues(clueData = {}, clues = {}) {
    const stats = document.getElementById("statsClue");
    const difficulty = document.getElementById("difficultyClue");
    const background = document.getElementById("backgroundClue");
    if (clues.stats) {
        [["clueCS", clueData.cs], ["clueAR", clueData.ar], ["clueOD", clueData.od], ["clueHP", clueData.hp]].forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el && value !== undefined) el.textContent = Number(value).toFixed(2);
        });
        stats?.classList.remove("hidden");
    }
    if (clues.difficulty && clueData.difficulty_name !== undefined) {
        const el = document.getElementById("clueDifficultyValue");
        if (el) el.textContent = clueData.difficulty_name || "Unknown";
        difficulty?.classList.remove("hidden");
    }
    if (clues.background && clueData.background_url) {
        const el = document.getElementById("clueBackgroundImage");
        if (el) el.src = clueData.background_url;
        background?.classList.remove("hidden");
    }
}

function restoreClues() {
    if (gameState) updateClueButtons();
}

function autoRevealClues() {
    if (gameState) updateClueButtons();
}

async function revealStats() { await refreshGameState(); }
async function revealDifficulty() { await refreshGameState(); }
async function revealBackground() { await refreshGameState(); }

/* =========================================================
   SEARCH MAPS
   ========================================================= */

let searchTimer = null;

function searchMaps(query) {
    const normalized = normalize(query);
    if (searchTimer) clearTimeout(searchTimer);
    if (normalized.length < 2) {
        if (suggestions) { suggestions.innerHTML = ""; suggestions.classList.add("hidden"); }
        return;
    }
    searchTimer = setTimeout(async () => {
        try {
            const response = await fetch(`${SEARCH_URL}?q=${encodeURIComponent(normalized)}`, { credentials: "include", cache: "no-store" });
            const data = await response.json();
            if (!response.ok || !data.success) throw new Error(data.error || "Search failed");
            if (!suggestions) return;
            suggestions.replaceChildren();
            const results = Array.isArray(data.results) ? data.results : [];
            if (!results.length) { suggestions.classList.add("hidden"); return; }
            results.forEach(map => {
                const item = document.createElement("button");
                item.type = "button";
                item.className = "suggestion";
                const img = document.createElement("img");
                img.className = "suggestion-cover";
                img.src = getCover(map);
                img.alt = "";
                img.loading = "lazy";
                img.referrerPolicy = "no-referrer";
                const info = document.createElement("div");
                info.className = "suggestion-info";
                const title = document.createElement("div");
                title.className = "suggestion-title";
                title.textContent = map.title || "-";
                const details = document.createElement("div");
                details.className = "suggestion-details";
                details.textContent = `${map.artist || "-"} · ${map.mapper || "-"}`;
                info.append(title, details);
                item.append(img, info);
                item.addEventListener("click", () => selectMap(map));
                suggestions.appendChild(item);
            });
            suggestions.classList.remove("hidden");
        } catch (error) {
            console.error("Search error:", error);
            suggestions?.classList.add("hidden");
        }
    }, 180);
}

/* =========================================================
   SELECT MAP
   ========================================================= */

function selectMap(map) {

    selectedMap =
        map;


    if (mapInput) {

        mapInput.value =
            `${map.title} — ${map.artist}`;

    }


    if (suggestions) {

        suggestions.innerHTML =
            "";

        suggestions.classList.add(
            "hidden"
        );

    }


    if (guessButton) {

        guessButton.disabled =
            false;

    }

}
/* =========================================================
   MAKE GUESS
   ========================================================= */

async function makeGuess() {
    if (!selectedMap || !gameState || gameState.won || gameState.attempts.length >= MAX_ATTEMPTS) return;
    const guessedMap = selectedMap;
    guessButton.disabled = true;
    mapInput.disabled = true;
    try {
        const response = await fetch("/api/guess", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ beatmapset_id: guessedMap.beatmapset_id })
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || "Could not process guess.");
        if (data.attempt) gameState.attempts.push(data.attempt);
        gameState.clues = data.clues || gameState.clues;
        gameState.won = Boolean(data.won);
        if (data.answer) secretMap = data.answer;
        saveGameState();
        if (data.attempt) renderAttempt(data.attempt);
        updateAttemptCounter();
        updateClueButtons();
        applyServerClues(data.clue_data || {}, gameState.clues);
        if (data.correct) showWinScreen();
        else if (data.finished || data.attempts >= MAX_ATTEMPTS) showLoseScreen();
        else showMessage("Incorrect guess.", "normal");
    } catch (error) {
        console.error("Error processing guess:", error);
        showMessage(error.message || "Could not process guess.", "error");
    } finally {
        selectedMap = null;
        mapInput.disabled = false;
        mapInput.value = "";
        suggestions?.replaceChildren();
        suggestions?.classList.add("hidden");
        guessButton.disabled = false;
    }
}

/* =========================================================
   BACKGROUND COLLAGE
   ========================================================= */

function createBackgroundCollage(backgrounds = []) {
    if (!backgroundCollage) return;
    backgroundCollage.replaceChildren();
    (Array.isArray(backgrounds) ? backgrounds : []).slice(0, 30).forEach((url, index) => {
        if (typeof url !== "string" || !/^https:\/\/(assets\.ppy\.sh|osu\.ppy\.sh)\//.test(url)) return;
        const tile = document.createElement("div");
        tile.className = "background-tile";
        tile.style.setProperty("--tile-index", index);
        const image = document.createElement("img");
        image.src = url;
        image.alt = "";
        image.loading = "lazy";
        image.draggable = false;
        image.referrerPolicy = "no-referrer";
        image.onerror = function () { this.style.display = "none"; };
        tile.appendChild(image);
        backgroundCollage.appendChild(tile);
    });
}

/* =========================================================
   LOAD CURRENT USER
   ========================================================= */

async function loadCurrentUser() {

    const userArea =
        document.getElementById(
            "userArea"
        );


    const loginButton =
        document.getElementById(
            "loginButton"
        );


    if (!userArea) {

        console.error(
            "❌ No existe #userArea"
        );

        return;
    }


    if (loginButton) {

        loginButton.classList.remove(
            "hidden"
        );

    }


    try {

        const response =
            await fetch(
                "/api/me",
                {
                    credentials:
                        "include",

                    cache:
                        "no-store"
                }
            );


        if (!response.ok) {

            throw new Error(
                `HTTP ${response.status}`
            );

        }


        const data =
            await response.json();


        console.log(
            "👤 Usuario:",
            data
        );


        if (
            !data.logged_in ||
            !data.user
        ) {

            currentUser =
                null;


            if (loginButton) {

                loginButton.classList.remove(
                    "hidden"
                );

            }


            const oldUser =
                document.getElementById(
                    "loggedUser"
                );


            if (oldUser) {

                oldUser.remove();

            }


            console.log(
                "ℹ️ No hay sesión de osu!"
            );


            return;
        }


        currentUser =
            data.user;


        if (loginButton) {

            loginButton.classList.add(
                "hidden"
            );

        }


        let loggedUser =
            document.getElementById(
                "loggedUser"
            );


        if (!loggedUser) {

            loggedUser =
                document.createElement(
                    "div"
                );


            loggedUser.id =
                "loggedUser";


            loggedUser.className =
                "logged-user";


            loggedUser.innerHTML = `
                <button
                    id="profileButton"
                    class="profile-button"
                    type="button"
                    title="My Statistics"
                >
                    <img
                        id="userAvatar"
                        class="user-avatar"
                        src=""
                        alt="Avatar"
                    >

                    <span
                        id="username"
                        class="username"
                    ></span>
                </button>

                <a
                    class="logout-button"
                    href="/auth/logout"
                >
                    LOGOUT
                </a>
            `;


            userArea.appendChild(
                loggedUser
            );

        }


        loggedUser.classList.remove(
            "hidden"
        );


        const userAvatar =
            document.getElementById(
                "userAvatar"
            );


        if (userAvatar) {
            userAvatar.onerror = () => {
                userAvatar.onerror = null;
                userAvatar.src = "https://osu.ppy.sh/images/layout/avatar-guest.png";
            };
            userAvatar.src = data.user.avatar_url || "https://osu.ppy.sh/images/layout/avatar-guest.png";
            userAvatar.alt = data.user.username || "Avatar";
        }


        const username =
            document.getElementById(
                "username"
            );


        if (username) {

            username.textContent =
                data.user.username ||
                "User";

        }


        console.log(
            "✅ Sesión activa:",
            data.user.username
        );


        setupProfileButton();

    } catch (error) {

        console.error(
            "❌ Error cargando usuario:",
            error
        );


        currentUser =
            null;


        if (loginButton) {

            loginButton.classList.remove(
                "hidden"
            );

        }


        const oldUser =
            document.getElementById(
                "loggedUser"
            );


        if (oldUser) {

            oldUser.remove();

        }

    }

}


/* =========================================================
   LEADERBOARD
   ========================================================= */

async function loadLeaderboard() {

    const body =
        document.getElementById(
            "leaderboardBody"
        );


    if (!body) {
        return;
    }


    body.innerHTML = `
        <tr>
            <td
                colspan="6"
                class="leaderboard-loading"
            >
                Loading leaderboard...
            </td>
        </tr>
    `;


    try {

        const response =
            await fetch(
                "/api/leaderboard",
                {
                    credentials:
                        "include",

                    cache:
                        "no-store"
                }
            );


        const data =
            await response.json();


        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.detail ||
                "Could not load leaderboard."
            );

        }


        const leaderboard =
            Array.isArray(
                data.leaderboard
            )
                ? data.leaderboard
                : [];


        if (
            leaderboard.length === 0
        ) {

            body.innerHTML = `
                <tr>
                    <td
                        colspan="6"
                        class="leaderboard-empty"
                    >
                        No players yet.
                    </td>
                </tr>
            `;

            return;

        }


        body.innerHTML =
            leaderboard
                .map(
                    player => {

                        const rank =
                            Number(
                                player.rank
                            ) || 0;


                        const rankClass =
                            rank <= 3
                                ? `rank-${rank}`
                                : "";


                        const avatar =
                            escapeHTML(
                                player.avatar_url ||
                                "https://osu.ppy.sh/images/layout/avatar-guest.png"
                            );


                        const username =
                            escapeHTML(
                                player.username ||
                                "Unknown"
                            );


                        const country =
                            escapeHTML(
                                player.country ||
                                ""
                            );


                        const points =
                            Number(
                                player.total_points
                            ) || 0;


                        const wins =
                            Number(
                                player.wins
                            ) || 0;


                        const games =
                            Number(
                                player.games
                            ) || 0;


                        const winRate =
                            Number(
                                player.win_rate
                            ) || 0;


                        return `
                            <tr>

                                <td
                                    class="rank-cell ${rankClass}"
                                >
                                    ${rank}
                                </td>

                                <td>

                                    <div
                                        class="player-cell"
                                    >

                                        <img
                                            class="player-avatar"
                                            src="${avatar}"
                                            alt=""
                                        >

                                        <div
                                            class="player-info"
                                        >

                                            <div
                                                class="player-name"
                                            >
                                                ${username}
                                            </div>

                                            <div
                                                class="player-country"
                                            >
                                                ${country}
                                            </div>

                                        </div>

                                    </div>

                                </td>

                                <td
                                    class="points-cell"
                                >
                                    ${points}
                                </td>

                                <td>
                                    ${wins}
                                </td>

                                <td>
                                    ${games}
                                </td>

                                <td>
                                    ${winRate.toFixed(1)}%
                                </td>

                            </tr>
                        `;

                    }
                )
                .join("");


    } catch (error) {

        console.error(
            "Error loading leaderboard:",
            error
        );


        body.innerHTML = `
            <tr>
                <td
                    colspan="6"
                    class="leaderboard-error"
                >
                    Could not load leaderboard.
                </td>
            </tr>
        `;

    }

}
/* =========================================================
   OPEN / CLOSE LEADERBOARD
   ========================================================= */

function openLeaderboard() {

    const modal =
        document.getElementById(
            "leaderboardModal"
        );


    if (!modal) {
        return;
    }


    modal.classList.remove(
        "hidden"
    );


    loadLeaderboard();

}


function closeLeaderboard() {

    const modal =
        document.getElementById(
            "leaderboardModal"
        );


    if (!modal) {
        return;
    }


    modal.classList.add(
        "hidden"
    );

}


/* =========================================================
   PROFILE / STATISTICS
   ========================================================= */

async function loadStats() {

    const statsMessage =
        document.getElementById(
            "statsMessage"
        );


    if (!currentUser) {

        if (statsMessage) {

            statsMessage.textContent =
                "You must be logged in.";

        }

        return;

    }


    try {

        const response =
            await fetch(
                "/api/stats",
                {
                    credentials:
                        "include",

                    cache:
                        "no-store"
                }
            );


        const data =
            await response.json();


        if (
            !response.ok ||
            !data.success
        ) {

            throw new Error(
                data.detail ||
                data.error ||
                "Could not load statistics."
            );

        }


        const user =
            data.user || {};


        const stats =
            data.stats || {};


        const statsAvatar =
            document.getElementById(
                "statsAvatar"
            );


        const statsUsername =
            document.getElementById(
                "statsUsername"
            );


        const statPoints =
            document.getElementById(
                "statPoints"
            );


        const statWins =
            document.getElementById(
                "statWins"
            );


        const statGames =
            document.getElementById(
                "statGames"
            );


        const statWinRate =
            document.getElementById(
                "statWinRate"
            );


        const statAverageAttempts =
            document.getElementById(
                "statAverageAttempts"
            );


        const statLosses =
            document.getElementById(
                "statLosses"
            );


        const statCurrentStreak =
            document.getElementById(
                "statCurrentStreak"
            );


        const statBestStreak =
            document.getElementById(
                "statBestStreak"
            );


        if (statsAvatar) {
            statsAvatar.onerror = () => {
                statsAvatar.onerror = null;
                statsAvatar.src = "https://osu.ppy.sh/images/layout/avatar-guest.png";
            };
            statsAvatar.src = user.avatar_url || currentUser.avatar_url || "https://osu.ppy.sh/images/layout/avatar-guest.png";
        }


        if (statsUsername) {

            statsUsername.textContent =
                user.username ||
                currentUser.username ||
                "Player";

        }


        if (statPoints) {

            statPoints.textContent =
                Number(
                    stats.total_points
                ) || 0;

        }


        if (statWins) {

            statWins.textContent =
                Number(
                    stats.wins
                ) || 0;

        }


        if (statGames) {

            statGames.textContent =
                Number(
                    stats.games
                ) || 0;

        }


        if (statWinRate) {

            statWinRate.textContent =
                `${(
                    Number(
                        stats.win_rate
                    ) || 0
                ).toFixed(1)}%`;

        }


        if (statAverageAttempts) {

            statAverageAttempts.textContent =
                (
                    Number(
                        stats.average_attempts
                    ) || 0
                ).toFixed(2);

        }


        if (statLosses) {

            statLosses.textContent =
                Number(
                    stats.losses
                ) || 0;

        }


        if (statCurrentStreak) {

            statCurrentStreak.textContent =
                Number(
                    stats.current_streak
                ) || 0;

        }


        if (statBestStreak) {

            statBestStreak.textContent =
                Number(
                    stats.best_streak
                ) || 0;

        }


        if (statsMessage) {

            statsMessage.textContent =
                "";

        }


    } catch (error) {

        console.error(
            "Error loading statistics:",
            error
        );


        if (statsMessage) {

            statsMessage.textContent =
                "Could not load statistics.";

        }

    }

}


/* =========================================================
   OPEN / CLOSE STATISTICS
   ========================================================= */

async function openStats() {

    const modal =
        document.getElementById(
            "statsModal"
        );


    if (!modal) {
        return;
    }


    modal.classList.remove(
        "hidden"
    );


    await loadStats();

}


function closeStats() {

    const modal =
        document.getElementById(
            "statsModal"
        );


    if (!modal) {
        return;
    }


    modal.classList.add(
        "hidden"
    );

}


/* =========================================================
   PROFILE BUTTON
   ========================================================= */

function setupProfileButton() {

    const profileButton =
        document.getElementById(
            "profileButton"
        );


    if (!profileButton) {
        return;
    }


    if (
        profileButton.dataset.statsReady ===
        "true"
    ) {
        return;
    }


    profileButton.dataset.statsReady =
        "true";


    profileButton.addEventListener(
        "click",
        openStats
    );

}


/* =========================================================
   STATISTICS CLOSE BUTTONS
   ========================================================= */

const profileButton =
    document.getElementById(
        "profileButton"
    );


const closeStatsButton =
    document.getElementById(
        "closeStats"
    );


const closeStatsBottom =
    document.getElementById(
        "closeStatsBottom"
    );


const statsModal =
    document.getElementById(
        "statsModal"
    );


if (profileButton) {

    profileButton.addEventListener(
        "click",
        openStats
    );

}


if (closeStatsButton) {

    closeStatsButton.addEventListener(
        "click",
        closeStats
    );

}


if (closeStatsBottom) {

    closeStatsBottom.addEventListener(
        "click",
        closeStats
    );

}


if (statsModal) {

    statsModal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                statsModal
            ) {

                closeStats();

            }

        }
    );

}


/* =========================================================
   GAME UI HELPERS
   ========================================================= */

function updateAttemptCounter() {
    const current = Array.isArray(gameState?.attempts)
        ? gameState.attempts.length
        : 0;
    if (attemptCount) attemptCount.textContent = current;
    autoRevealClues();
}

function showMessage(text, type = "normal") {
    if (!message) return;
    message.textContent = String(text ?? "");
    message.className = "message";
    if (type) message.classList.add(type);
    message.classList.remove("hidden");
    clearTimeout(messageTimeout);
    messageTimeout = setTimeout(() => message.classList.add("hidden"), 2500);
}

function endGameUI() {
    if (guessButton) guessButton.disabled = true;
    if (mapInput) mapInput.disabled = true;
    if (suggestions) {
        suggestions.replaceChildren();
        suggestions.classList.add("hidden");
    }
    selectedMap = null;
}

function getFinishedAnswer() {
    return secretMap || null;
}

function showWinScreen() {
    endGameUI();
    const screen = document.getElementById("winScreen");
    const answer = getFinishedAnswer();
    if (!screen || !answer) return;

    const cover = document.getElementById("winCover");
    const title = document.getElementById("winMapTitle");
    const artist = document.getElementById("winArtist");
    const mapper = document.getElementById("winMapper");
    const attempts = document.getElementById("winAttempts");
    const osuLink = document.getElementById("winOsuLink");

    if (cover) {
        cover.src = getCover(answer);
        cover.alt = answer.title || "Beatmap cover";
    }
    if (title) title.textContent = answer.title || "-";
    if (artist) artist.textContent = answer.artist || "-";
    if (mapper) mapper.textContent = `Mapped by ${answer.mapper || "-"}`;
    if (attempts) attempts.textContent = String(gameState?.attempts?.length || 0);
    if (osuLink) {
        osuLink.href = answer.url || (answer.beatmapset_id
            ? `https://osu.ppy.sh/beatmapsets/${answer.beatmapset_id}`
            : "#");
    }

    const heading = screen.querySelector(".win-title");
    const subtitle = screen.querySelector(".win-subtitle");
    const attemptsText = screen.querySelector(".win-attempts");
    if (heading) heading.textContent = "🎉 Correct!";
    if (subtitle) subtitle.textContent = "You found today's Catchdle!";
    if (attemptsText) attemptsText.innerHTML = `Solved in <strong>${gameState?.attempts?.length || 0}</strong> attempts.`;

    screen.classList.remove("hidden");
    startCountdown();
}

function showLoseScreen() {
    endGameUI();
    const screen = document.getElementById("winScreen");
    const answer = getFinishedAnswer();
    if (!screen || !answer) return;

    const cover = document.getElementById("winCover");
    const title = document.getElementById("winMapTitle");
    const artist = document.getElementById("winArtist");
    const mapper = document.getElementById("winMapper");
    const attempts = document.getElementById("winAttempts");
    const osuLink = document.getElementById("winOsuLink");

    if (cover) {
        cover.src = getCover(answer);
        cover.alt = answer.title || "Beatmap cover";
    }
    if (title) title.textContent = answer.title || "-";
    if (artist) artist.textContent = answer.artist || "-";
    if (mapper) mapper.textContent = `Mapped by ${answer.mapper || "-"}`;
    if (attempts) attempts.textContent = String(gameState?.attempts?.length || 0);
    if (osuLink) {
        osuLink.href = answer.url || (answer.beatmapset_id
            ? `https://osu.ppy.sh/beatmapsets/${answer.beatmapset_id}`
            : "#");
    }

    const heading = screen.querySelector(".win-title");
    const subtitle = screen.querySelector(".win-subtitle");
    const attemptsText = screen.querySelector(".win-attempts");
    if (heading) heading.textContent = "💀 Better luck tomorrow!";
    if (subtitle) subtitle.textContent = "You ran out of attempts.";
    if (attemptsText) attemptsText.innerHTML = `The answer was <strong>${escapeHTML(answer.title || "Unknown")}</strong>.`;

    screen.classList.remove("hidden");
    startCountdown();
}

/* =========================================================
   COUNTDOWN
   ========================================================= */

function getNextMidnight() {

    const now =
        new Date();


    const next =
        new Date(
            now
        );


    next.setHours(
        24,
        0,
        0,
        0
    );


    return next;

}


function updateCountdown() {

    const element =
        document.getElementById(
            "winCountdown"
        );


    if (!element) {
        return;
    }


    const now =
        new Date();


    const next =
        getNextMidnight();


    let difference =
        next.getTime() -
        now.getTime();


    if (
        difference < 0
    ) {

        difference =
            0;

    }


    const totalSeconds =
        Math.floor(
            difference / 1000
        );


    const hours =
        Math.floor(
            totalSeconds / 3600
        );


    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );


    const seconds =
        totalSeconds % 60;


    element.textContent =
        [
            hours,
            minutes,
            seconds
        ]
            .map(
                value =>
                    String(
                        value
                    ).padStart(
                        2,
                        "0"
                    )
            )
            .join(":");

}


function startCountdown() {

    clearInterval(
        countdownInterval
    );


    updateCountdown();


    countdownInterval =
        setInterval(
            updateCountdown,
            1000
        );

}


/* =========================================================
   SEARCH EVENTS
   ========================================================= */

if (mapInput) {

    mapInput.addEventListener(
        "input",
        event => {

            searchMaps(
                event.target.value
            );

        }
    );


    mapInput.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Enter"
            ) {

                event.preventDefault();


                if (
                    selectedMap
                ) {

                    makeGuess();

                }

            }

        }
    );

}


/* =========================================================
   GUESS BUTTON
   ========================================================= */

if (guessButton) {

    guessButton.addEventListener(
        "click",
        makeGuess
    );

}


/* =========================================================
   CLOSE SUGGESTIONS
   ========================================================= */

document.addEventListener(
    "click",
    event => {

        if (
            !mapInput ||
            !suggestions
        ) {
            return;
        }


        const searchArea =
            mapInput.closest(
                ".search-area"
            );


        if (
            searchArea &&
            !searchArea.contains(
                event.target
            )
        ) {

            suggestions.classList.add(
                "hidden"
            );

        }

    }
);


/* =========================================================
   CLUE EVENTS
   ========================================================= */

const statsClueButton =
    document.getElementById(
        "clueStats"
    );


const difficultyClueButton =
    document.getElementById(
        "clueDifficulty"
    );


const backgroundClueButton =
    document.getElementById(
        "clueBackground"
    );


if (statsClueButton) {

    statsClueButton.addEventListener(
        "click",
        revealStats
    );

}


if (difficultyClueButton) {

    difficultyClueButton.addEventListener(
        "click",
        revealDifficulty
    );

}


if (backgroundClueButton) {

    backgroundClueButton.addEventListener(
        "click",
        revealBackground
    );

}


/* =========================================================
   LEADERBOARD EVENTS
   ========================================================= */

const leaderboardButton =
    document.getElementById(
        "leaderboardButton"
    );


const closeLeaderboardButton =
    document.getElementById(
        "closeLeaderboard"
    );


const closeLeaderboardBottom =
    document.getElementById(
        "closeLeaderboardBottom"
    );


const leaderboardModal =
    document.getElementById(
        "leaderboardModal"
    );


if (leaderboardButton) {

    leaderboardButton.addEventListener(
        "click",
        openLeaderboard
    );

}


if (closeLeaderboardButton) {

    closeLeaderboardButton.addEventListener(
        "click",
        closeLeaderboard
    );

}


if (closeLeaderboardBottom) {

    closeLeaderboardBottom.addEventListener(
        "click",
        closeLeaderboard
    );

}


if (leaderboardModal) {

    leaderboardModal.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                leaderboardModal
            ) {

                closeLeaderboard();

            }

        }
    );

}


/* =========================================================
   ESCAPE KEY
   ========================================================= */

document.addEventListener(
    "keydown",
    event => {

        if (
            event.key ===
            "Escape"
        ) {

            closeLeaderboard();

            closeStats();

        }

    }
);


/* =========================================================
   INITIALIZATION
   ========================================================= */

async function refreshGameState() {
    const response = await fetch(GAME_URL, { credentials: "include", cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.error || `HTTP ${response.status}`);
    gameState = createGameState(data);
    secretMap = data.answer || null;
    applyServerClues(data.clue_data || {}, gameState.clues);
    renderHistory();
    updateAttemptCounter();
    updateClueButtons();
    if (Array.isArray(data.backgrounds)) createBackgroundCollage(data.backgrounds);
    if (data.finished) {
        if (gameState.won) showWinScreen();
        else showLoseScreen();
    }
    return data;
}

async function loadBackgrounds() {
    if (!backgroundCollage) return;
    try {
        const cacheBust = Date.now().toString(36) + Math.random().toString(36).slice(2);
        const response = await fetch(`/api/backgrounds?v=${cacheBust}`, {
            cache: "no-store",
            credentials: "omit"
        });
        const data = await response.json();
        if (!response.ok || !data.success) throw new Error(data.error || `HTTP ${response.status}`);
        if (Array.isArray(data.backgrounds)) createBackgroundCollage(data.backgrounds);
    } catch (error) {
        console.error("Background loading error:", error);
    }
}

async function init() {
    try {
        // The decorative background is public and must not depend on osu! login.
        await loadBackgrounds();
        await loadCurrentUser();
        if (!currentUser) return;
        await refreshGameState();
        setupProfileButton();
        console.log("Catchdle initialized securely.");
    } catch (error) {
        console.error("Error initializing Catchdle:", error);
        showMessage(error.message || "Could not load Catchdle. Check the server.", "error");
    }
}

init();

/* =========================================================
   START
   ========================================================= */



/* =========================================================
   CREDITS MODAL
   ========================================================= */

(function setupCredits() {
    const creditsButton = document.getElementById("creditsButton");
    const creditsModal = document.getElementById("creditsModal");
    const closeCreditsButton = document.getElementById("closeCredits");
    const closeCreditsBottom = document.getElementById("closeCreditsBottom");

    if (!creditsButton || !creditsModal) {
        return;
    }

    function openCredits() {
        creditsModal.classList.remove("hidden");
    }

    function closeCredits() {
        creditsModal.classList.add("hidden");
    }

    creditsButton.addEventListener("click", openCredits);

    if (closeCreditsButton) {
        closeCreditsButton.addEventListener("click", closeCredits);
    }

    if (closeCreditsBottom) {
        closeCreditsBottom.addEventListener("click", closeCredits);
    }

    creditsModal.addEventListener("click", event => {
        if (event.target === creditsModal) {
            closeCredits();
        }
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && !creditsModal.classList.contains("hidden")) {
            closeCredits();
        }
    });
})();
