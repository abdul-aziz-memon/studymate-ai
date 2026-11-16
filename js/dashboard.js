import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { auth } from "./firebase.js";
import { loadActivityRecords } from "./activity.js";

const accountName = document.getElementById("account-name");
const accountEmail = document.getElementById("account-email");
const accountAvatar = document.getElementById("account-avatar");
const welcomeName = document.getElementById("welcome-name");
const logoutButton = document.getElementById("logout-button");
const message = document.getElementById("dashboard-message");
const activityList = document.getElementById("activity-list");
const activityEmpty = document.getElementById("activity-empty");

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

if (!auth) {
  window.location.replace("login.html");
} else {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.replace("login.html");
      return;
    }

    const name = user.displayName?.trim() || "learner";
    const initial = name.charAt(0).toUpperCase() || "S";
    accountName.textContent = name;
    accountEmail.textContent = user.email || "";
    accountAvatar.textContent = initial;
    welcomeName.textContent = name;

    message.textContent = "Loading your activity...";
    try {
      renderActivity(await loadActivityRecords());
      message.textContent = "";
    } catch (error) {
      console.error("Could not load dashboard activity.", error);
      message.textContent = `Could not load activity: ${error.message}`;
    }
  }, (error) => {
    console.error("Could not check the current authentication state.", error);
    message.textContent = "Could not check your account. Please refresh the page.";
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
