const STORAGE_KEY = "epsTournamentV5";

const state = {
  tournamentName: "Tournoi EPS",
  sportType: "Badminton",
  participantCount: 8,
  bracketSize: 8,
  finalQualifiers: 2,
  tournamentMode: "double",
  activeTab: "main",
  players: [],
  principal: [],
  secondary: [],
  repechage: [],
  finalPhase: [],
  epsMode: false,
  timer: { seconds: 0, running: false, intervalId: null }
};

const dom = {
  tournamentName: document.getElementById("tournamentName"),
  sportType: document.getElementById("sportType"),
  participantCount: document.getElementById("participantCount"),
  bracketSizeSelect: document.getElementById("bracketSizeSelect"),
  finalQualifiers: document.getElementById("finalQualifiers"),
  tournamentMode: document.getElementById("tournamentMode"),
  bulkPlayers: document.getElementById("bulkPlayers"),
  playersContainer: document.getElementById("playersContainer"),
  bracketTitle: document.getElementById("bracketTitle"),
  bracketWrapper: document.getElementById("bracketWrapper"),
  consolationWrapper: document.getElementById("consolationWrapper"),
  classementWrapper: document.getElementById("classementWrapper"),
  finalBracketWrapper: document.getElementById("finalBracketWrapper"),
  rankingWrapper: document.getElementById("rankingWrapper"),
  statusText: document.getElementById("statusText"),
  timerDisplay: document.getElementById("timerDisplay"),
  tabMainBtn: document.getElementById("tabMainBtn"),
  tabConsolanteBtn: document.getElementById("tabConsolanteBtn"),
  tabClassementBtn: document.getElementById("tabClassementBtn"),
  tabFinalBtn: document.getElementById("tabFinalBtn"),
  tabRankingBtn: document.getElementById("tabRankingBtn")
};

init();

function init() {
  restoreTournament();
  bindEvents();
  syncForm();
  ensurePlayerFields(state.participantCount);
  renderPlayersInputs();
  renderAll();
  updateTimerDisplay();
}

function bindEvents() {
  dom.tournamentName.addEventListener("input", () => { state.tournamentName = dom.tournamentName.value.trim() || "Tournoi EPS"; saveTournament(); renderHeader(); });
  dom.sportType.addEventListener("change", () => { state.sportType = dom.sportType.value; saveTournament(); renderHeader(); });
  dom.participantCount.addEventListener("input", () => {
    state.participantCount = clamp(parseInt(dom.participantCount.value, 10) || 3, 3, 32);
    ensurePlayerFields(state.participantCount);
    renderPlayersInputs();
    saveTournament();
  });
  dom.bracketSizeSelect.addEventListener("change", () => { state.bracketSize = Number(dom.bracketSizeSelect.value); saveTournament(); renderHeader(); });
  dom.finalQualifiers.addEventListener("change", () => { state.finalQualifiers = Number(dom.finalQualifiers.value); recomputeFinalPhase(); saveTournament(); renderAll(); });
  dom.tournamentMode.addEventListener("change", () => {
    state.tournamentMode = dom.tournamentMode.value;
    if (state.tournamentMode === "single") {
      state.secondary = [];
      state.repechage = [];
      state.finalPhase = [];
      if (state.activeTab !== "main" && state.activeTab !== "ranking") state.activeTab = "main";
    } else if (state.principal.length) {
      rebuildSecondaryFromPrincipalLosers();
      rebuildRepechageFromSecondaryLosers();
      recomputeFinalPhase();
    }
    saveTournament();
    renderAll();
  });

  document.getElementById("addPlayerFieldBtn").addEventListener("click", () => {
    if (state.players.length >= 32) return;
    state.players.push("");
    state.participantCount = state.players.length;
    renderPlayersInputs();
    saveTournament();
  });
  document.getElementById("loadExampleBtn").addEventListener("click", loadExample);
  document.getElementById("generateBtn").addEventListener("click", () => {
    collectPlayers();
    generateTournament();
    saveTournament();
    renderAll();
  });
  document.getElementById("resetBtn").addEventListener("click", () => { localStorage.removeItem(STORAGE_KEY); location.reload(); });
  document.getElementById("clearAllBtn").addEventListener("click", clearAllData);

  dom.tabMainBtn.addEventListener("click", () => switchTab("main"));
  dom.tabConsolanteBtn.addEventListener("click", () => switchTab("secondary"));
  dom.tabClassementBtn.addEventListener("click", () => switchTab("repechage"));
  dom.tabFinalBtn.addEventListener("click", () => switchTab("final"));
  dom.tabRankingBtn.addEventListener("click", () => switchTab("ranking"));

  document.getElementById("exportPngBtn").addEventListener("click", exportPNG);
  document.getElementById("exportPdfBtn").addEventListener("click", exportPDF);
  document.getElementById("printBtn").addEventListener("click", () => window.print());
  document.getElementById("epsModeBtn").addEventListener("click", toggleEPSMode);
  document.getElementById("fullscreenBtn").addEventListener("click", toggleFullscreen);
  document.getElementById("timerStartPauseBtn").addEventListener("click", toggleTimer);
  document.getElementById("timerResetBtn").addEventListener("click", resetTimer);
}

function syncForm() {
  dom.tournamentName.value = state.tournamentName;
  dom.sportType.value = state.sportType;
  dom.participantCount.value = state.participantCount;
  dom.bracketSizeSelect.value = String(state.bracketSize);
  dom.finalQualifiers.value = String(state.finalQualifiers);
  dom.tournamentMode.value = state.tournamentMode;
  renderHeader();
}

function renderHeader() {
  dom.bracketTitle.textContent = `${state.tournamentName} - Format tournoi EPS`;
  dom.statusText.textContent = state.tournamentMode === "single"
    ? `${state.sportType} - Mode sans rattrapage`
    : `${state.sportType} - Principal / Secondaire / Rattrapage + phase finale`;
}

function ensurePlayerFields(count) {
  if (state.players.length < count) while (state.players.length < count) state.players.push("");
  else if (state.players.length > count) state.players = state.players.slice(0, count);
}

function renderPlayersInputs() {
  dom.playersContainer.innerHTML = "";
  state.players.forEach((name, i) => {
    const row = document.createElement("div");
    row.className = "player-input";
    row.innerHTML = `<div class="seed-pill">#${i + 1}</div><input type="text" data-player-index="${i}" value="${escapeHtml(name)}" placeholder="Joueur ${i + 1}">`;
    dom.playersContainer.appendChild(row);
  });
  dom.playersContainer.querySelectorAll("input").forEach((input) => {
    input.addEventListener("input", (e) => { state.players[Number(e.target.dataset.playerIndex)] = e.target.value; saveTournament(); });
  });
}

function collectPlayers() {
  const bulk = dom.bulkPlayers.value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (bulk.length) state.players = bulk.slice(0, 32);
  else state.players = Array.from(dom.playersContainer.querySelectorAll("input")).map((i) => i.value.trim()).filter(Boolean).slice(0, 32);
  if (state.players.length < 3) throw new Error("Au moins 3 joueurs.");
  state.participantCount = state.players.length;
}

function generateTournament() {
  const entrants = state.players.slice(0, 32).map((name, i) => mkPlayer(name, i + 1));
  // Le tournoi prend toujours tous les eleves saisis.
  const slots = [...entrants];
  state.principal = createBracket(slots, "principal", "p");
  state.secondary = [];
  state.repechage = [];
  state.finalPhase = [];
  autoAdvanceByes(state.principal);
  if (state.tournamentMode !== "single") {
    rebuildSecondaryFromPrincipalLosers();
    rebuildRepechageFromSecondaryLosers();
    recomputeFinalPhase();
  }
}

function mkPlayer(name, seed) {
  return { id: `pl-${seed}`, name, seed, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0 };
}

function createBracket(players, type, prefix) {
  if (!players.length) return [];
  const rounds = [];
  const sorted = players.slice().sort((a, b) => (a.seed || 999) - (b.seed || 999));
  const base = highestPow2LE(sorted.length);
  const playInMatches = sorted.length - base;

  if (playInMatches > 0) {
    const qualifiedCount = sorted.length - playInMatches * 2;
    const qualified = sorted.slice(0, qualifiedCount);
    const playInPlayers = sorted.slice(qualifiedCount);
    const qualifiers = [];
    const prelimRound = [];

    for (let i = 0; i < playInMatches; i += 1) {
      const p1 = playInPlayers[i * 2];
      const p2 = playInPlayers[i * 2 + 1];
      const q = { id: `${prefix}-qual-${i + 1}`, name: `Vainqueur barrage ${i + 1}`, isQualifier: true, seed: 999 };
      qualifiers.push(q);
      const m = newMatch(type, `${prefix}0-m${i}`, p1, p2);
      m.qualifierTargetId = q.id;
      prelimRound.push(m);
    }
    rounds.push(prelimRound);

    const seededMain = seedSlotsExact([...qualified, ...qualifiers], base);
    rounds.push(buildRoundFromSlots(seededMain, type, `${prefix}1`));
  } else {
    const seeded = seedSlotsExact(sorted, base);
    rounds.push(buildRoundFromSlots(seeded, type, `${prefix}1`));
  }

  while (rounds.at(-1).length > 1) {
    rounds.push(buildEmptyRound(rounds.at(-1).length / 2, type, `${prefix}${rounds.length}`));
  }
  return rounds;
}

function seedSlotsExact(players, size) {
  const clipped = players.slice(0, size);
  const order = getSeedOrder(size);
  const slots = Array(size).fill(null);
  clipped.forEach((p, i) => { slots[order[i] - 1] = p; });
  for (let i = 0; i < size; i += 1) if (!slots[i]) slots[i] = { id: `bye-s${i}`, name: "BYE", isBye: true, seed: 999 };
  return slots;
}

function buildRoundFromSlots(slots, type, idPrefix) {
  const out = [];
  for (let i = 0; i < slots.length; i += 2) out.push(newMatch(type, `${idPrefix}-m${i / 2}`, slots[i], slots[i + 1]));
  return out;
}

function buildEmptyRound(count, type, idPrefix) {
  const out = [];
  for (let i = 0; i < count; i += 1) out.push(newMatch(type, `${idPrefix}-m${i}`, null, null));
  return out;
}

function newMatch(type, id, p1, p2) {
  return { id, type, player1: p1, player2: p2, score1: "", score2: "", winnerId: null, error: "", auto: false };
}

function validateMatch(type, rIdx, mIdx) {
  const bracket = bracketByType(type);
  const match = bracket[rIdx][mIdx];
  const s1 = Number(match.score1);
  const s2 = Number(match.score2);
  if (Number.isNaN(s1) || Number.isNaN(s2)) { match.error = "Saisir les 2 scores."; return renderAll(); }
  if (s1 === s2) { match.error = "Egalite interdite."; return renderAll(); }
  match.error = "";
  const winner = s1 > s2 ? match.player1 : match.player2;
  const loser = s1 > s2 ? match.player2 : match.player1;
  match.winnerId = winner.id;
  updateStats(match.player1, s1, s2, s1 > s2);
  updateStats(match.player2, s2, s1, s2 > s1);
  propagateWinner(bracket, rIdx, mIdx, winner);
  routeLoser(type, loser);
  if (state.tournamentMode !== "single") {
    if (type === "principal") rebuildSecondaryFromPrincipalLosers();
    if (type === "secondary") rebuildRepechageFromSecondaryLosers();
    recomputeFinalPhase();
  }
  saveTournament();
  renderAll();
}

function routeLoser(type, loser) {
  if (!loser || loser.isBye) return;
  loser.losses += 1;
  if (state.tournamentMode === "single") return;
  if (type === "principal") addPlayerToBracket(state.secondary, loser, "secondary", "s");
  if (type === "secondary") addPlayerToBracket(state.repechage, loser, "repechage", "r");
}

function addPlayerToBracket(bracket, player, type, prefix) {
  const all = bracketParticipants(bracket);
  if (all.some((p) => p.id === player.id)) return;
  all.push(player);
  const rebuilt = createBracket(all, type, prefix);
  preserveResults(bracket, rebuilt);
  if (type === "secondary") state.secondary = rebuilt;
  if (type === "repechage") state.repechage = rebuilt;
}

function rebuildSecondaryFromPrincipalLosers() {
  const losers = collectDistinctLosers(state.principal);
  const rebuilt = createBracket(losers, "secondary", "s");
  preserveResults(state.secondary, rebuilt);
  state.secondary = rebuilt;
  autoAdvanceByes(state.secondary);
}

function rebuildRepechageFromSecondaryLosers() {
  const losers = collectDistinctLosers(state.secondary);
  const rebuilt = createBracket(losers, "repechage", "r");
  preserveResults(state.repechage, rebuilt);
  state.repechage = rebuilt;
  autoAdvanceByes(state.repechage);
}

function recomputeFinalPhase() {
  if (state.tournamentMode === "single") {
    state.finalPhase = [];
    return;
  }
  const topPrincipal = topPlayersFromBracket(state.principal, state.finalQualifiers);
  const topSecondary = topPlayersFromBracket(state.secondary, state.finalQualifiers);
  const merged = interleave(topPrincipal, topSecondary);
  const rebuilt = createBracket(merged, "final", "f");
  preserveResults(state.finalPhase, rebuilt);
  state.finalPhase = rebuilt;
  autoAdvanceByes(state.finalPhase);
}

function preserveResults(oldB, newB) {
  const snap = {};
  oldB.forEach((r) => r.forEach((m) => { snap[m.id] = { p1: m.player1?.id, p2: m.player2?.id, score1: m.score1, score2: m.score2, winnerId: m.winnerId }; }));
  newB.forEach((r, rIdx) => r.forEach((m, mIdx) => {
    const old = oldB[rIdx]?.[mIdx];
    if (!old) return;
    const same = old.player1?.id === m.player1?.id && old.player2?.id === m.player2?.id;
    if (same) {
      m.score1 = old.score1;
      m.score2 = old.score2;
      m.winnerId = old.winnerId;
      if (m.winnerId) propagateWinner(newB, rIdx, mIdx, m.winnerId === m.player1?.id ? m.player1 : m.player2);
    }
  }));
}

function autoAdvanceByes(bracket) {
  if (!bracket.length) return;
  let changed = true;
  while (changed) {
    changed = false;
    bracket.forEach((round, rIdx) => round.forEach((m, mIdx) => {
      if (m.winnerId || !m.player1 || !m.player2) return;
      const b1 = !!m.player1.isBye;
      const b2 = !!m.player2.isBye;
      if (b1 === b2) return;
      const winner = b1 ? m.player2 : m.player1;
      m.winnerId = winner.id;
      m.auto = true;
      propagateWinner(bracket, rIdx, mIdx, winner);
      changed = true;
    }));
  }
}

function propagateWinner(bracket, rIdx, mIdx, winner) {
  const current = bracket[rIdx][mIdx];
  if (current.qualifierTargetId) {
    const nextRound = bracket[rIdx + 1] || [];
    nextRound.forEach((m) => {
      if (m.player1 && m.player1.id === current.qualifierTargetId) m.player1 = winner;
      if (m.player2 && m.player2.id === current.qualifierTargetId) m.player2 = winner;
    });
    return;
  }
  if (rIdx >= bracket.length - 1) return;
  const next = bracket[rIdx + 1][Math.floor(mIdx / 2)];
  const slot = mIdx % 2 === 0 ? "player1" : "player2";
  next[slot] = winner;
  next.winnerId = null;
  next.score1 = "";
  next.score2 = "";
  next.error = "";
}

function collectDistinctLosers(bracket) {
  const map = new Map();
  bracket.forEach((r) => r.forEach((m) => {
    if (!m.winnerId || !m.player1 || !m.player2) return;
    const loser = m.winnerId === m.player1.id ? m.player2 : m.player1;
    if (!loser || loser.isBye) return;
    map.set(loser.id, loser);
  }));
  return [...map.values()];
}

function topPlayersFromBracket(bracket, count) {
  const map = new Map();
  bracket.forEach((r, rIdx) => r.forEach((m) => {
    [m.player1, m.player2].forEach((p) => { if (p && !p.isBye && !map.has(p.id)) map.set(p.id, { ...p, bracketPts: 0 }); });
    if (!m.winnerId) return;
    const w = m.winnerId === m.player1?.id ? m.player1 : m.player2;
    if (w && !w.isBye) map.get(w.id).bracketPts += 10 + rIdx;
  }));
  return [...map.values()].sort((a, b) => (b.bracketPts - a.bracketPts) || (a.seed - b.seed)).slice(0, count);
}

function interleave(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

function bracketParticipants(bracket) {
  const map = new Map();
  bracket.forEach((r) => r.forEach((m) => {
    [m.player1, m.player2].forEach((p) => { if (p && !p.isBye) map.set(p.id, p); });
  }));
  return [...map.values()];
}

function bracketByType(type) {
  if (type === "principal") return state.principal;
  if (type === "secondary") return state.secondary;
  if (type === "repechage") return state.repechage;
  return state.finalPhase;
}

function updateStats(player, scored, conceded, won) {
  if (!player || player.isBye) return;
  player.played = (player.played || 0) + 1;
  player.pointsFor = (player.pointsFor || 0) + scored;
  player.pointsAgainst = (player.pointsAgainst || 0) + conceded;
  if (won) player.wins = (player.wins || 0) + 1;
}

function renderAll() {
  renderHeader();
  dom.bracketWrapper.innerHTML = "";
  dom.consolationWrapper.innerHTML = "";
  dom.classementWrapper.innerHTML = "";
  dom.finalBracketWrapper.innerHTML = "";
  dom.rankingWrapper.innerHTML = "";

  dom.bracketWrapper.appendChild(renderBracket("Tournoi principal", state.principal, "principal"));
  if (state.tournamentMode !== "single") {
    dom.consolationWrapper.appendChild(renderBracket("Tournoi secondaire (1 defaite)", state.secondary, "secondary"));
    dom.classementWrapper.appendChild(renderBracket("Tournoi rattrapage", state.repechage, "repechage"));
    dom.finalBracketWrapper.appendChild(renderBracket(`Phase finale (${state.finalQualifiers}+${state.finalQualifiers})`, state.finalPhase, "final"));
  }
  dom.rankingWrapper.appendChild(renderRanking());
  updateTabVisibility();
}

function renderBracket(title, bracket, type) {
  const host = document.createElement("div");
  const tag = document.createElement("div");
  tag.className = "section-tag";
  tag.textContent = title;
  host.appendChild(tag);
  if (!bracket.length) {
    const p = document.createElement("p");
    p.className = "hint";
    p.textContent = "En attente de matchs.";
    host.appendChild(p);
    return host;
  }
  const grid = document.createElement("div");
  grid.className = "bracket-grid";
  grid.style.gridTemplateColumns = `repeat(${bracket.length}, minmax(240px, 1fr))`;
  bracket.forEach((round, rIdx) => {
    const col = document.createElement("div");
    col.className = "round-col";
    col.innerHTML = `<h3>${roundTitle(bracket, rIdx)}</h3>`;
    round.forEach((m, mIdx) => col.appendChild(renderMatchCard(type, rIdx, mIdx, m)));
    grid.appendChild(col);
  });
  host.appendChild(grid);
  return host;
}

function roundTitle(bracket, roundIndex) {
  const hasPrelim = !!(bracket[0] && bracket[0].some((m) => !!m.qualifierTargetId));
  if (hasPrelim && roundIndex === 0) return "Barrage";
  if (hasPrelim) return `Tour ${roundIndex}`;
  return `Tour ${roundIndex + 1}`;
}

function renderMatchCard(type, rIdx, mIdx, m) {
  const p1 = m.player1 || { name: "En attente" };
  const p2 = m.player2 || { name: "En attente" };
  const can = !m.winnerId && !m.auto && m.player1 && m.player2 && !m.player1.isBye && !m.player2.isBye;
  const card = document.createElement("article");
  card.className = "match-card";
  card.innerHTML = `
    <div class="player-row ${m.winnerId === p1.id ? "winner-row" : ""}">
      <div class="player-name ${p1.isBye ? "bye" : ""}">${formatPlayer(p1)}</div>
      <input class="score" type="number" min="0" value="${m.score1}" ${can ? "" : "disabled"} data-s="1">
    </div>
    <div class="player-row ${m.winnerId === p2.id ? "winner-row" : ""}">
      <div class="player-name ${p2.isBye ? "bye" : ""}">${formatPlayer(p2)}</div>
      <input class="score" type="number" min="0" value="${m.score2}" ${can ? "" : "disabled"} data-s="2">
    </div>
    <div class="match-actions"><button class="mini-btn validate" ${can ? "" : "disabled"}>${m.auto ? "BYE auto" : "Valider"}</button></div>
    <div class="error-text">${m.error || ""}</div>
  `;
  const s1 = card.querySelector('[data-s="1"]');
  const s2 = card.querySelector('[data-s="2"]');
  s1?.addEventListener("input", () => { m.score1 = s1.value; });
  s2?.addEventListener("input", () => { m.score2 = s2.value; });
  card.querySelector(".validate").addEventListener("click", () => validateMatch(type, rIdx, mIdx));
  return card;
}

function renderRanking() {
  const host = document.createElement("div");
  const tag = document.createElement("div");
  tag.className = "section-tag";
  tag.textContent = "Classement RG";
  host.appendChild(tag);
  const players = mergedPlayers().sort((a, b) =>
    (b.wins - a.wins) ||
    (a.losses - b.losses) ||
    ((b.pointsFor - b.pointsAgainst) - (a.pointsFor - a.pointsAgainst)) ||
    (b.played - a.played) ||
    (a.seed - b.seed)
  );
  const table = document.createElement("table");
  table.className = "ranking-table";
  table.innerHTML = `
    <thead><tr><th>#</th><th>Joueur</th><th>J</th><th>V</th><th>D</th><th>Ratio</th><th>Pts +</th><th>Pts -</th><th>Diff</th></tr></thead>
    <tbody>${players.map((p, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(p.name)}</td><td>${p.played || 0}</td><td>${p.wins || 0}</td><td>${p.losses || 0}</td><td>${p.played ? Math.round(((p.wins || 0) / p.played) * 100) : 0}%</td><td>${p.pointsFor || 0}</td><td>${p.pointsAgainst || 0}</td><td>${(p.pointsFor || 0) - (p.pointsAgainst || 0)}</td></tr>`).join("")}</tbody>
  `;
  host.appendChild(table);
  return host;
}

function mergedPlayers() {
  const map = new Map();
  [state.principal, state.secondary, state.repechage, state.finalPhase].forEach((b) => {
    b.forEach((r) => r.forEach((m) => {
      [m.player1, m.player2].forEach((p) => { if (p && !p.isBye) map.set(p.id, p); });
    }));
  });
  return [...map.values()];
}

function switchTab(tab) {
  state.activeTab = tab;
  updateTabVisibility();
  saveTournament();
}

function updateTabVisibility() {
  const single = state.tournamentMode === "single";
  if (single && (state.activeTab === "secondary" || state.activeTab === "repechage" || state.activeTab === "final")) {
    state.activeTab = "main";
  }
  dom.bracketWrapper.classList.toggle("is-hidden", state.activeTab !== "main");
  dom.consolationWrapper.classList.toggle("is-hidden", state.activeTab !== "secondary" || single);
  dom.classementWrapper.classList.toggle("is-hidden", state.activeTab !== "repechage" || single);
  dom.finalBracketWrapper.classList.toggle("is-hidden", state.activeTab !== "final" || single);
  dom.rankingWrapper.classList.toggle("is-hidden", state.activeTab !== "ranking");
  dom.tabMainBtn.classList.toggle("active", state.activeTab === "main");
  dom.tabConsolanteBtn.classList.toggle("active", state.activeTab === "secondary");
  dom.tabClassementBtn.classList.toggle("active", state.activeTab === "repechage");
  dom.tabFinalBtn.classList.toggle("active", state.activeTab === "final");
  dom.tabRankingBtn.classList.toggle("active", state.activeTab === "ranking");
  dom.tabConsolanteBtn.classList.toggle("is-hidden", single);
  dom.tabClassementBtn.classList.toggle("is-hidden", single);
  dom.tabFinalBtn.classList.toggle("is-hidden", single);
}

function saveTournament() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function restoreTournament() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const p = JSON.parse(raw);
    Object.assign(state, p);
    if (state.epsMode) document.body.classList.add("eps-mode");
  } catch (_) {}
}

function loadExample() {
  state.tournamentName = "Interclasses Badminton";
  state.sportType = "Badminton";
  state.players = ["Alice", "Benoit", "Chloe", "Dylan", "Emma", "Farid", "Giulia", "Hugo", "Ines", "Jules", "Kenza", "Leo"];
  state.participantCount = state.players.length;
  state.bracketSize = state.players.length;
  dom.bulkPlayers.value = state.players.join("\n");
  syncForm();
  renderPlayersInputs();
  generateTournament();
  saveTournament();
  renderAll();
}

function clearAllData() {
  localStorage.removeItem(STORAGE_KEY);
  state.players = [];
  state.participantCount = 3;
  state.bracketSize = 8;
  state.principal = [];
  state.secondary = [];
  state.repechage = [];
  state.finalPhase = [];
  state.activeTab = "main";
  state.timer.seconds = 0;
  state.timer.running = false;
  clearInterval(state.timer.intervalId);
  dom.bulkPlayers.value = "";
  syncForm();
  ensurePlayerFields(state.participantCount);
  renderPlayersInputs();
  renderAll();
  updateTimerDisplay();
}

function exportPNG() {
  if (!window.html2canvas) return;
  html2canvas(document.querySelector(".bracket-panel"), { backgroundColor: "#fff", scale: 2 }).then((canvas) => {
    const a = document.createElement("a");
    a.download = `${state.tournamentName.replace(/\s+/g, "_")}.png`;
    a.href = canvas.toDataURL("image/png");
    a.click();
  });
}

function exportPDF() {
  if (!window.html2canvas || !window.jspdf) return;
  html2canvas(document.querySelector(".bracket-panel"), { backgroundColor: "#fff", scale: 2 }).then((canvas) => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const width = 297;
    const height = (canvas.height * width) / canvas.width;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, width, Math.min(height, 210));
    pdf.save(`${state.tournamentName.replace(/\s+/g, "_")}.pdf`);
  });
}

function toggleEPSMode() { state.epsMode = !state.epsMode; document.body.classList.toggle("eps-mode", state.epsMode); saveTournament(); }
function toggleFullscreen() { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); else document.exitFullscreen().catch(() => {}); }
function toggleTimer() {
  if (state.timer.running) { clearInterval(state.timer.intervalId); state.timer.running = false; return; }
  state.timer.running = true;
  state.timer.intervalId = setInterval(() => { state.timer.seconds += 1; updateTimerDisplay(); }, 1000);
}
function resetTimer() { clearInterval(state.timer.intervalId); state.timer.seconds = 0; state.timer.running = false; updateTimerDisplay(); }
function updateTimerDisplay() { const m = String(Math.floor(state.timer.seconds / 60)).padStart(2, "0"); const s = String(state.timer.seconds % 60).padStart(2, "0"); dom.timerDisplay.textContent = `${m}:${s}`; }

function highestPow2LE(n) { let p = 1; while (p * 2 <= n) p *= 2; return p; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function formatPlayer(p) { if (!p) return "En attente"; if (p.isBye) return "BYE"; return p.seed ? `#${p.seed} ${p.name}` : p.name; }
function getSeedOrder(size) { if (size === 1) return [1]; const prev = getSeedOrder(size / 2); const o = []; prev.forEach((s) => o.push(s, size + 1 - s)); return o; }
function escapeHtml(t) { return String(t).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;"); }