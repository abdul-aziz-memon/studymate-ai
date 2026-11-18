import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "./firebase.js";
import {
  loadActivityRecords,
  loadCoveredTopics,
  loadLeaderboardEntries,
  updateLeaderboardEntry
} from "./activity.js";
import { getUserProfile, isCompleteUserProfile } from "./user-profile.js";

const accountName = document.getElementById("account-name");
const accountEmail = document.getElementById("account-email");
const accountAvatar = document.getElementById("account-avatar");
const welcomeName = document.getElementById("welcome-name");
const logoutButton = document.getElementById("logout-button");
const message = document.getElementById("dashboard-message");
const statsGrid = document.querySelector(".stats-grid");
const statsLoading = document.querySelector(".stats-loading");
const statItems = document.querySelectorAll(".stat-item");
const activityList = document.getElementById("activity-list");
const activityEmpty = document.getElementById("activity-empty");
const topicsList = document.getElementById("topics-list");
const topicsEmpty = document.getElementById("topics-empty");
const topicsMessage = document.getElementById("topics-message");
const leaderboardMessage = document.getElementById("leaderboard-message");
const gamesLeaderboard = document.getElementById("games-leaderboard");
const gamesLeaderboardEmpty = document.getElementById("games-leaderboard-empty");
const topicsLeaderboard = document.getElementById("topics-leaderboard");
const topicsLeaderboardEmpty = document.getElementById("topics-leaderboard-empty");
const sampleLeaderboardEntries = [
  { id: "sample-liam-carter", displayName: "Liam Carter", gameWins: 17, topicCount: 8 },
  { id: "sample-noah-bennett", displayName: "Noah Bennett", gameWins: 12, topicCount: 16 },
  { id: "sample-ethan-brooks", displayName: "Ethan Brooks", gameWins: 8, topicCount: 14 },
  { id: "sample-mateo-rivera", displayName: "Mateo Rivera", gameWins: 19, topicCount: 11 },
  { id: "sample-aiden-foster", displayName: "Aiden Foster", gameWins: 10, topicCount: 20 },
  { id: "sample-arjun-shah", displayName: "Arjun Shah", gameWins: 15, topicCount: 7 },
  { id: "sample-caleb-turner", displayName: "Caleb Turner", gameWins: 5, topicCount: 13 },
  { id: "sample-owen-parker", displayName: "Owen Parker", gameWins: 13, topicCount: 4 },
  { id: "sample-emma-hayes", displayName: "Emma Hayes", gameWins: 18, topicCount: 17 },
  { id: "sample-ava-patel", displayName: "Ava Patel", gameWins: 9, topicCount: 12 },
  { id: "sample-mia-cooper", displayName: "Mia Cooper", gameWins: 7, topicCount: 19 },
  { id: "sample-sofia-reed", displayName: "Sofia Reed", gameWins: 14, topicCount: 6 },
  { id: "sample-layla-khan", displayName: "Layla Khan", gameWins: 11, topicCount: 15 },
  { id: "sample-zoe-morgan", displayName: "Zoe Morgan", gameWins: 20, topicCount: 10 },
  { id: "sample-isla-bennett", displayName: "Isla Bennett", gameWins: 6, topicCount: 18 }
];

document.addEventListener("studymate:profile-updated", (event) => {
  const name = event.detail?.displayName;
  if (!name) {
    return;
  }
  accountName.textContent = name;
  accountAvatar.textContent = name.charAt(0).toUpperCase() || "S";
  welcomeName.textContent = name;
});

function formatDate(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return "Date unavailable";
  }
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(timestamp);
}

function formatDuration(seconds) {
  const duration = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${duration} ${duration === 1 ? "second" : "seconds"}`;
}

function createDetail(text) {
  const detail = document.createElement("p");
  detail.className = "activity-entry-details";
  detail.textContent = text;
  return detail;
}

function getActivityDescription(record) {
  if (record.type === "chat") {
    const messagesSent = Number(record.messagesSent) || 0;
    const messagesAnswered = Number(record.messagesAnswered) || 0;
    const messagesFailed = Number(record.messagesFailed) || 0;
    return {
      title: "Study chat",
      summary: `${messagesSent} ${messagesSent === 1 ? "message" : "messages"} sent · ${formatDuration(record.durationSeconds)}`,
      details: `${messagesAnswered} answered · ${messagesFailed} failed`
    };
  }

  const gameNames = {
    "tic-tac-toe": "Tic-tac-toe",
    memory: "Memory Match",
    "quick-math": "Quick Math"
  };
  const outcomes = {
    win: "Win",
    loss: "Loss",
    draw: "Draw",
    completed: "Completed",
    abandoned: "Left early"
  };
  const title = gameNames[record.game] || "Game";
  const details = record.details || {};
  const parts = [`Result: ${outcomes[record.outcome] || "In progress"}`];
  if (record.difficulty) {
    parts.push(`Difficulty: ${record.difficulty}`);
  }
  parts.push(`Duration: ${formatDuration(record.durationSeconds)}`);

  if (record.game === "tic-tac-toe" && Array.isArray(details.moves)) {
    parts.push(`Moves: ${details.moves.map(({ mark, cell, player }) => `${player === "ai" ? "AI" : "You"} ${mark} at ${Number(cell) + 1}`).join(", ") || "none"}`);
  } else if (record.game === "memory") {
    parts.push(`${Number(details.pairsFound) || 0} pairs found · ${Number(details.attempts) || 0} attempts · ${Number(details.flips) || 0} card flips`);
    if (Array.isArray(details.moves) && details.moves.length) {
      parts.push(`Card picks: ${details.moves.map(({ card, face }) => `${Number(card) + 1} (${face})`).join(", ")}`);
    }
  } else if (record.game === "quick-math") {
    parts.push(`${Number(details.correct) || 0} correct · ${Number(details.incorrect) || 0} incorrect`);
    if (Array.isArray(details.rounds) && details.rounds.length) {
      parts.push(`Answers: ${details.rounds.map(({ question, selected, answer, correct }) => `${question} = ${selected}${correct ? " ✓" : ` (answer: ${answer})`}`).join("; ")}`);
    }
  }

  return {
    title,
    summary: outcomes[record.outcome] || "In progress",
    details: parts.join(" · ")
  };
}

function renderActivity(records) {
  const games = records.filter((record) => record.type === "game");
  const chats = records.filter((record) => record.type === "chat");
  const wins = games.filter((record) => record.outcome === "win").length;
  const losses = games.filter((record) => record.outcome === "loss").length;
  const draws = games.filter((record) => record.outcome === "draw").length;
  const gameSeconds = Math.floor(games.reduce((total, record) => total + (
    Number.isFinite(record.durationMs) ? record.durationMs : (Number(record.durationSeconds) || 0) * 1000
  ), 0) / 1000);
  const chatSeconds = Math.floor(chats.reduce((total, record) => total + (
    Number.isFinite(record.durationMs) ? record.durationMs : (Number(record.durationSeconds) || 0) * 1000
  ), 0) / 1000);
  const messagesSent = chats.reduce((total, record) => total + (Number(record.messagesSent) || 0), 0);
  const conversationIds = new Set(chats.flatMap((record) => (
    Array.isArray(record.conversationIds)
      ? record.conversationIds
      : record.conversationId
        ? [record.conversationId]
        : []
  )));

  document.getElementById("games-played").textContent = String(games.length);
  document.getElementById("games-won").textContent = String(wins);
  document.getElementById("games-results-note").textContent = `${losses} ${losses === 1 ? "loss" : "losses"} · ${draws} ${draws === 1 ? "draw" : "draws"}`;
  document.getElementById("game-time").textContent = `${gameSeconds} sec`;
  document.getElementById("chat-messages-count").textContent = String(messagesSent);
  document.getElementById("chat-time").textContent = `${chatSeconds} sec`;
  document.getElementById("chat-sessions").textContent = String(conversationIds.size);

  const sortedRecords = [...records].sort((first, second) => (second.startedAtMs || 0) - (first.startedAtMs || 0));
  activityList.replaceChildren();
  activityEmpty.hidden = sortedRecords.length > 0;

  sortedRecords.forEach((record) => {
    const description = getActivityDescription(record);
    const item = document.createElement("li");
    item.className = "activity-entry";
    const heading = document.createElement("div");
    heading.className = "activity-entry-heading";
    const title = document.createElement("h3");
    title.className = "activity-entry-title";
    title.textContent = description.title;
    const date = document.createElement("time");
    date.className = "activity-entry-date";
    if (Number.isFinite(record.startedAtMs)) {
      date.dateTime = new Date(record.startedAtMs).toISOString();
    }
    date.textContent = formatDate(record.startedAtMs);
    heading.append(title, date);
    const summary = document.createElement("p");
    summary.className = "activity-entry-summary";
    summary.textContent = description.summary;
    item.append(heading, summary, createDetail(description.details));
    activityList.append(item);
  });
}

function finishStatsLoading() {
  statsGrid.setAttribute("aria-busy", "false");
  statsLoading.hidden = true;
  statItems.forEach((item) => {
    item.hidden = false;
  });
}

function renderCoveredTopics(topics) {
  topicsList.replaceChildren();
  topicsEmpty.hidden = topics.length > 0;

  topics.forEach((topic, index) => {
    const row = document.createElement("li");
    row.className = "topic-row";
    const mark = document.createElement("span");
    mark.className = `topic-mark topic-mark-${["blue", "rose", "gold"][index % 3]}`;
    mark.setAttribute("aria-hidden", "true");
    mark.textContent = topic.title.split(/\s+/).slice(0, 2).map((word) => word.charAt(0)).join("").toUpperCase();

    const copy = document.createElement("span");
    copy.className = "topic-copy";
    const title = document.createElement("strong");
    title.textContent = topic.title;
    const date = document.createElement("small");
    date.textContent = `Covered ${formatDate(topic.coveredAtMs)}`;
    copy.append(title, date);
    row.append(mark, copy);
    topicsList.append(row);
  });
}

function renderLeaderboardList(list, emptyMessage, entries, scoreKey, singularScoreLabel, pluralScoreLabel, currentUserId) {
  const rankedEntries = entries
    .filter((entry) => entry[scoreKey] > 0 || entry.id === currentUserId)
    .sort((first, second) => (
      second[scoreKey] - first[scoreKey]
      || first.displayName.localeCompare(second.displayName)
    ));

  list.replaceChildren();
  emptyMessage.hidden = rankedEntries.length > 0;
  rankedEntries.forEach((entry, index) => {
    const row = document.createElement("li");
    const isCurrentUser = entry.id === currentUserId;
    row.className = `leaderboard-entry${isCurrentUser ? " leaderboard-entry-current" : ""}`;

    const rank = document.createElement("span");
    rank.className = "leaderboard-rank";
    if (index < 3) {
      rank.classList.add(`leaderboard-rank-${index + 1}`);
    }
    rank.textContent = String(index + 1);
    rank.setAttribute("aria-label", `Rank ${index + 1}`);

    const identity = document.createElement("span");
    identity.className = "leaderboard-identity";
    const name = document.createElement("strong");
    name.className = "leaderboard-name";
    name.textContent = entry.displayName;
    identity.append(name);

    if (isCurrentUser) {
      const badge = document.createElement("span");
      badge.className = "leaderboard-badge leaderboard-badge-current";
      badge.textContent = "YOU";
      identity.append(badge);
    }

    const score = document.createElement("span");
    score.className = "leaderboard-score";
    score.textContent = `${entry[scoreKey]} ${entry[scoreKey] === 1 ? singularScoreLabel : pluralScoreLabel}`;

    row.append(rank, identity, score);
    list.append(row);
  });
}

function renderLeaderboards(entries, currentUserEntry) {
  const leaderboardEntries = [
    ...sampleLeaderboardEntries,
    ...entries.filter((entry) => entry.id !== currentUserEntry.id),
    currentUserEntry
  ];
  renderLeaderboardList(gamesLeaderboard, gamesLeaderboardEmpty, leaderboardEntries, "gameWins", "win", "wins", currentUserEntry.id);
  renderLeaderboardList(topicsLeaderboard, topicsLeaderboardEmpty, leaderboardEntries, "topicCount", "topic", "topics", currentUserEntry.id);
}

if (!auth) {
  window.location.replace("login.html");
} else {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.replace("login.html");
      return;
    }

    let profile;
    try {
      profile = await getUserProfile(user);
    } catch (error) {
      console.error("Could not load the current user's study profile.", error);
      message.textContent = `Could not load your profile: ${error.message}`;
      finishStatsLoading();
      return;
    }
    if (!isCompleteUserProfile(profile)) {
      window.location.replace("/account");
      return;
    }

    const name = profile.displayName;
    const initial = name.charAt(0).toUpperCase() || "S";
    accountName.textContent = name;
    accountEmail.textContent = user.email || "";
    accountAvatar.textContent = initial;
    welcomeName.textContent = name;

    const [activityResult, topicsResult] = await Promise.allSettled([
      loadActivityRecords(),
      loadCoveredTopics()
    ]);
    if (activityResult.status === "fulfilled") {
      renderActivity(activityResult.value);
      message.textContent = "";
    } else {
      console.error("Could not load dashboard activity.", activityResult.reason);
      message.textContent = `Could not load activity: ${activityResult.reason.message}`;
    }
    finishStatsLoading();
    if (topicsResult.status === "fulfilled") {
      renderCoveredTopics(topicsResult.value);
      topicsMessage.textContent = "";
    } else {
      console.error("Could not load covered topics.", topicsResult.reason);
      topicsMessage.textContent = `Could not load topics: ${topicsResult.reason.message}`;
    }

    let updateError = null;
    if (activityResult.status === "fulfilled" && topicsResult.status === "fulfilled") {
      try {
        await updateLeaderboardEntry(name, activityResult.value, topicsResult.value);
      } catch (error) {
        console.error("Could not update your leaderboard scores.", error);
        updateError = error;
      }
    } else {
      updateError = new Error("Your activity data could not be loaded.");
    }

    const currentUserEntry = {
      id: user.uid,
      displayName: name,
      gameWins: activityResult.status === "fulfilled"
        ? activityResult.value.filter((record) => record.type === "game" && record.outcome === "win").length
        : 0,
      topicCount: topicsResult.status === "fulfilled" ? topicsResult.value.length : 0
    };

    try {
      renderLeaderboards(await loadLeaderboardEntries(), currentUserEntry);
      leaderboardMessage.textContent = updateError
        ? `Your ranking may be out of date: ${updateError.message}`
        : "";
    } catch (error) {
      console.error("Could not load leaderboards.", error);
      renderLeaderboards([], currentUserEntry);
      leaderboardMessage.textContent = `Could not load leaderboards: ${error.message}`;
    }
  }, (error) => {
    console.error("Could not check the current authentication state.", error);
    message.textContent = "Could not check your account. Please refresh the page.";
    finishStatsLoading();
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    message.textContent = "";

    try {
      await signOut(auth);
      window.location.replace("login.html");
    } catch {
      message.textContent = "Could not log out. Please try again.";
      logoutButton.disabled = false;
    }
  });
}
