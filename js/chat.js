import { isCompleteUserProfile, loadCurrentUserProfile } from "./user-profile.js";

const chatEndpoint = "/api/chat";
const chatHistoryStorageKey = "studymate-chat-history-v1";
const activityApiPromise = import("./activity.js").then(
  (activity) => ({ activity }),
  (error) => ({ error })
);

function normalizePromptSuggestions(suggestions) {
  if (!Array.isArray(suggestions)) {
    return [];
  }

  const normalized = suggestions
    .filter((suggestion) => typeof suggestion === "string")
    .map((suggestion) => suggestion
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim())
    .filter((suggestion) => suggestion.length > 0 && suggestion.length <= 120)
    .filter((suggestion, index, list) => (
      list.findIndex((other) => other.toLocaleLowerCase() === suggestion.toLocaleLowerCase()) === index
    ));

  return normalized.slice(0, 3);
}

function createActivityId() {
  return crypto.randomUUID();
}

function normalizeTopicTitle(title) {
  return title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
}

async function saveActivityRecord(activityId, record) {
  const { activity, error } = await activityApiPromise;
  if (error) {
    throw new Error("Activity tracking could not load from Firebase. Refresh the page to try again.");
  }
  return activity.saveActivityRecord(activityId, record);
}

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("chat-form");
  const chatInput = document.getElementById("chat-input");
  const imageInput = document.getElementById("image-input");
  const imageButton = document.getElementById("image-button");
  const imagePreview = document.getElementById("image-preview");
  const imagePreviewThumbnail = document.getElementById("image-preview-thumbnail");
  const imagePreviewName = document.getElementById("image-preview-name");
  const removeImageButton = document.getElementById("remove-image-button");
  const sendButton = document.getElementById("send-button");
  const chatMessages = document.getElementById("chat-messages");
  const chatEmptyState = document.getElementById("chat-empty-state");
  const promptSuggestions = document.getElementById("prompt-suggestions");
  const workspace = document.querySelector(".chat-workspace");
  const sidebarToggleButton = document.getElementById("sidebar-toggle-button");
  const sidebarCloseButton = document.getElementById("sidebar-close-button");
  const sidebarBackdrop = document.getElementById("sidebar-backdrop");
  const newChatButton = document.getElementById("new-chat-button");
  const chatHistoryList = document.getElementById("chat-history-list");
  const chatHistoryEmpty = document.getElementById("chat-history-empty");
  const chatHistoryStatus = document.getElementById("chat-history-status");
  const activitySaveStatus = document.getElementById("activity-save-status");
  const topicTrackingStatus = document.getElementById("topic-tracking-status");
  let studentProfile = null;
  const profileReady = loadCurrentUserProfile().then((account) => {
    if (account && !isCompleteUserProfile(account.profile)) {
      window.location.replace("/account");
      return false;
    }
    studentProfile = account?.profile || null;
    return true;
  }).catch((error) => {
    console.error("Could not load the current user's study profile.", error);
    activitySaveStatus.textContent = `Could not load your profile: ${error.message}`;
    return false;
  });
  window.addEventListener("studymate-profile-updated", (event) => {
    if (isCompleteUserProfile(event.detail)) {
      studentProfile = event.detail;
    }
  });
  let conversation = [];
  let chatSessions = [];
  let activeChatId = null;
  let savedActiveChatId = null;
  let hasSavedActiveChatId = false;
  let isSending = false;
  let isDeletingChat = false;
  let selectedImage = null;
  let activityTrackingEnabled = true;
  let activityView = "chat";
  let activityStartedAtMs = Date.now();
  let activityElapsedMs = 0;
  let activityLastTick = performance.now();
  let activityActive = document.visibilityState === "visible";
  let activitySessionId = createActivityId();
  let activityConversationId = null;
  const activityConversationIds = new Set();
  let messagesSent = 0;
  let messagesAnswered = 0;
  let messagesFailed = 0;
  let activityWriteQueue = Promise.resolve();
  let topicWriteQueue = Promise.resolve();
  let coveredTopics = null;
  let coveredTopicsUserId = null;
  let topicContextLoadError = null;
  let topicStatusTimer = null;
  let lastActivitySnapshot = "";
  const maxImageBytes = 4 * 1024 * 1024;
  const maxEncodedImageBytes = 1536 * 1024;

  function updateActivityClock() {
    const now = performance.now();
    if (activityActive) {
      activityElapsedMs += now - activityLastTick;
    }
    activityLastTick = now;
  }

  function saveChatActivity() {
    updateActivityClock();
    if (!activityTrackingEnabled) {
      return;
    }
    const record = {
      type: "chat",
      conversationId: activityConversationId,
      conversationIds: [...activityConversationIds],
      startedAtMs: activityStartedAtMs,
      durationMs: Math.floor(activityElapsedMs),
      durationSeconds: Math.floor(activityElapsedMs / 1000),
      messagesSent,
      messagesAnswered,
      messagesFailed
    };
    const snapshot = JSON.stringify(record);
    if (snapshot === lastActivitySnapshot) {
      return;
    }
    lastActivitySnapshot = snapshot;
    activityWriteQueue = activityWriteQueue.catch(() => {}).then(() => saveActivityRecord(activitySessionId, record));
    activityWriteQueue.then(() => {
      activitySaveStatus.textContent = "";
    }, (error) => {
      activityTrackingEnabled = false;
      console.error("Could not save chat activity.", error);
      activitySaveStatus.textContent = error.message || "Could not save chat activity to your dashboard.";
    });
  }

  function setTopicTrackingStatus(message, clearAfterMs = 0) {
    window.clearTimeout(topicStatusTimer);
    topicTrackingStatus.textContent = message;
    if (clearAfterMs) {
      topicStatusTimer = window.setTimeout(() => {
        topicTrackingStatus.textContent = "";
      }, clearAfterMs);
    }
  }

  async function getCoveredTopicContext() {
    const { activity, error } = await activityApiPromise;
    if (error) {
      throw new Error("Topic tracking could not load from Firebase. Refresh the page to try again.");
    }

    const user = await activity.getCurrentUser();
    if (!user) {
      coveredTopics = null;
      coveredTopicsUserId = null;
      topicContextLoadError = null;
      return { activity, user: null, topics: [] };
    }

    if (coveredTopicsUserId !== user.uid || !Array.isArray(coveredTopics)) {
      const topics = await activity.loadCoveredTopics();
      const currentUser = await activity.getCurrentUser();
      if (!currentUser || currentUser.uid !== user.uid) {
        throw new Error("Your account changed while loading covered topics. Try again.");
      }
      coveredTopics = topics;
      coveredTopicsUserId = user.uid;
    }

    topicContextLoadError = null;
    return { activity, user, topics: coveredTopics };
  }

  function saveCoveredTopicFromResponse(topicTitle) {
    if (!topicTitle) {
      if (!topicContextLoadError) {
        setTopicTrackingStatus("");
      }
      return;
    }

    topicWriteQueue = topicWriteQueue.catch(() => {}).then(async () => {
      const { activity, user, topics } = await getCoveredTopicContext();
      if (!user) {
        setTopicTrackingStatus("");
        return;
      }

      const title = topicTitle.trim().replace(/\s+/g, " ");
      if (!title || topics.some((topic) => normalizeTopicTitle(topic.title) === normalizeTopicTitle(title))) {
        setTopicTrackingStatus("");
        return;
      }

      setTopicTrackingStatus("Updating Topics covered...");
      await activity.saveCoveredTopic(title, user.uid);
      topics.unshift({ title, coveredAtMs: Date.now() });
      setTopicTrackingStatus(`Added "${title}" to Topics covered.`, 4000);
    }).catch((error) => {
      console.error("Could not save a covered topic.", error);
      setTopicTrackingStatus(error.message || "Could not update Topics covered.");
    });
  }

  const coveredTopicsReady = profileReady.then(async (ready) => {
    if (!ready) {
      return [];
    }
    try {
      const { topics } = await getCoveredTopicContext();
      return topics;
    } catch (error) {
      topicContextLoadError = error;
      return [];
    }
  });

  async function getTopicsForChatRequest() {
    await coveredTopicsReady;
    try {
      const { topics } = await getCoveredTopicContext();
      return topics;
    } catch (error) {
      topicContextLoadError = error;
      console.error("Could not load existing covered topics.", error);
      return [];
    }
  }

  function updateChatActivityState() {
    updateActivityClock();
    activityActive = activityView === "chat" && document.visibilityState === "visible";
    activityLastTick = performance.now();
    saveChatActivity();
  }

  function setActivityConversation(conversationId) {
    activityConversationId = conversationId;
    if (conversationId) {
      activityConversationIds.add(conversationId);
    }
    saveChatActivity();
  }

  function scrollToLatestMessage() {
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: "smooth" });
  }

  function appendInlineMarkdown(container, text) {
    const inlinePattern = /<[bB][rR]\s*\/?>|\\([\\`*_{}#+.!|>-])|(`+)(.*?)\2|\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)|(\*\*|__)(.+?)\7|~~(.+?)~~|(\*|_)(.+?)\10|(\$\$([\s\S]+?)\$\$)|(\$([^$\n]+?)\$)|(\\\[([\s\S]+?)\\\])|(\\\(([\s\S]+?)\\\))|(\[([^\]]*\\[a-zA-Z]+[^\]]*)\])/g;
    let position = 0;
    let match;

    while ((match = inlinePattern.exec(text))) {
      container.append(document.createTextNode(text.slice(position, match.index)));

      if (/^<br\s*\/?>$/i.test(match[0])) {
        container.append(document.createElement("br"));
      } else if (match[1]) {
        container.append(document.createTextNode(match[1]));
      } else if (match[2]) {
        const code = document.createElement("code");
        code.textContent = match[3];
        container.append(code);
      } else if (match[4]) {
        let url;
        try {
          url = new URL(match[5], window.location.href);
        } catch {
          url = null;
        }

        if (url && ["http:", "https:", "mailto:"].includes(url.protocol)) {
          const link = document.createElement("a");
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.title = match[6] || "";
          appendInlineMarkdown(link, match[4]);
          container.append(link);
        } else {
          container.append(document.createTextNode(match[4]));
        }
      } else if (match[7]) {
        const strong = document.createElement("strong");
        appendInlineMarkdown(strong, match[8]);
        container.append(strong);
      } else if (match[9]) {
        const deleted = document.createElement("del");
        appendInlineMarkdown(deleted, match[9]);
        container.append(deleted);
      } else if (match[10]) {
        const emphasis = document.createElement("em");
        appendInlineMarkdown(emphasis, match[11]);
        container.append(emphasis);
      } else if (match[12] || match[14] || match[16] || match[18] || match[20]) {
        const mathSource = match[13] || match[15] || match[17] || match[19] || match[21];
        const displayMode = Boolean(match[12] || match[16] || match[20]);
        if (window.katex) {
          const math = document.createElement(displayMode ? "div" : "span");
          math.className = "markdown-math";
          window.katex.render(mathSource, math, { displayMode, throwOnError: false, trust: false });
          container.append(math);
        } else {
          container.append(document.createTextNode(match[0]));
        }
      }

      position = inlinePattern.lastIndex;
    }

    container.append(document.createTextNode(text.slice(position)));
  }

  function appendMarkdownBlocks(container, text) {
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    let index = 0;
    const isBlockStart = (line) => /^(?:#{1,6}\s|```|>\s?|[-*_]{3,}\s*$|\s*[-+*]\s+|\s*\d+[.)]\s+)/.test(line);

    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim()) {
        index += 1;
        continue;
      }

      const fence = line.match(/^\s*```([^\s`]*)\s*$/);
      if (fence) {
        index += 1;
        const codeLines = [];
        while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
          codeLines.push(lines[index]);
          index += 1;
        }
        if (index < lines.length) {
          index += 1;
        }
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        if (fence[1]) {
          code.className = `language-${fence[1].replace(/[^a-zA-Z0-9_-]/g, "")}`;
        }
        code.textContent = codeLines.join("\n");
        pre.append(code);
        container.append(pre);
        continue;
      }

      const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
      if (heading) {
        const element = document.createElement(`h${heading[1].length}`);
        appendInlineMarkdown(element, heading[2]);
        container.append(element);
        index += 1;
        continue;
      }

      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        const rule = document.createElement("hr");
        container.append(rule);
        index += 1;
        continue;
      }

      if (/^\s*>/.test(line)) {
        const quoteLines = [];
        while (index < lines.length && /^\s*>/.test(lines[index])) {
          quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
          index += 1;
        }
        const quote = document.createElement("blockquote");
        appendMarkdownBlocks(quote, quoteLines.join("\n"));
        container.append(quote);
        continue;
      }

      const listMatch = line.match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
      if (listMatch) {
        const ordered = Boolean(listMatch[2]);
        const list = document.createElement(ordered ? "ol" : "ul");
        while (index < lines.length) {
          const itemMatch = lines[index].match(/^\s*(?:([-+*])|(\d+)[.)])\s+(.+)$/);
          if (!itemMatch || Boolean(itemMatch[2]) !== ordered) {
            break;
          }
          const item = document.createElement("li");
          appendInlineMarkdown(item, itemMatch[3]);
          list.append(item);
          index += 1;
        }
        container.append(list);
        continue;
      }

      const nextLine = lines[index + 1] || "";
      if (line.includes("|") && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(nextLine)) {
        const parseCells = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
        const headers = parseCells(line);
        const tableWrap = document.createElement("div");
        tableWrap.className = "markdown-table-wrap";
        const table = document.createElement("table");
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        headers.forEach((value) => {
          const cell = document.createElement("th");
          appendInlineMarkdown(cell, value);
          headerRow.append(cell);
        });
        thead.append(headerRow);
        table.append(thead);
        index += 2;
        const tbody = document.createElement("tbody");
        while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
          const row = document.createElement("tr");
          parseCells(lines[index]).forEach((value) => {
            const cell = document.createElement("td");
            appendInlineMarkdown(cell, value);
            row.append(cell);
          });
          tbody.append(row);
          index += 1;
        }
        table.append(tbody);
        tableWrap.append(table);
        container.append(tableWrap);
        continue;
      }

      const paragraphLines = [line];
      index += 1;
      while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
        paragraphLines.push(lines[index]);
        index += 1;
      }
      const paragraph = document.createElement("p");
      appendInlineMarkdown(paragraph, paragraphLines.join(" "));
      container.append(paragraph);
    }
  }

  function addMessage(text, role, extraClass = "", markdown = false, imageUrl = null) {
    const row = document.createElement("div");
    const bubble = document.createElement("div");
    if (imageUrl) {
      const image = document.createElement("img");
      image.className = "mb-2 max-h-96 max-w-full rounded-lg object-contain";
      image.src = imageUrl;
      image.alt = "Image attached to this message";
      bubble.append(image);
    }
    if (markdown) {
      appendMarkdownBlocks(bubble, text);
    } else if (text) {
      const messageText = document.createElement("span");
      messageText.textContent = text;
      bubble.append(messageText);
    } else if (!imageUrl) {
      bubble.textContent = text;
    }
    bubble.className = `max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${extraClass}`;
    if (markdown) {
      bubble.classList.add("markdown-content");
    }

    if (role === "user") {
      row.className = "flex justify-end";
      bubble.classList.add("rounded-br-md", "bg-indigo-600", "text-white");
    } else {
      row.className = "flex items-end gap-2.5";
      bubble.classList.add("rounded-bl-md", "border", "border-slate-200", "bg-white", "text-slate-700");
      const avatar = document.createElement("span");
      avatar.className = "grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-100 text-indigo-700";
      avatar.setAttribute("aria-hidden", "true");
      avatar.innerHTML = '<svg class="h-4 w-4" viewBox="0 0 24 24"><use href="#icon-bot"></use></svg>';
      row.append(avatar);
    }

    row.append(bubble);
    chatMessages.append(row);
    scrollToLatestMessage();
    return row;
  }

  function getActiveChat() {
    return chatSessions.find((chat) => chat.id === activeChatId) || null;
  }

  function createChatId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function createChatTitle(text) {
    const title = text.trim().replace(/\s+/g, " ");
    if (!title) {
      return "Image question";
    }
    return title.length > 42 ? `${title.slice(0, 39).trimEnd()}...` : title;
  }

  function loadChatSessions() {
    try {
      const saved = localStorage.getItem(chatHistoryStorageKey);
      if (!saved) {
        return [];
      }

      const parsed = JSON.parse(saved);
      const savedChats = Array.isArray(parsed) ? parsed : parsed?.chats;
      if (!Array.isArray(savedChats)) {
        throw new Error("Saved chat history has an invalid format.");
      }
      if (!Array.isArray(parsed) && Object.prototype.hasOwnProperty.call(parsed, "activeChatId")) {
        savedActiveChatId = parsed.activeChatId;
        hasSavedActiveChatId = true;
      }

      const validChats = savedChats.filter((chat) => (
        chat
        && typeof chat.id === "string"
        && typeof chat.title === "string"
        && Number.isFinite(chat.updatedAt)
        && Array.isArray(chat.messages)
      )).map((chat) => ({
        id: chat.id,
        title: chat.title.slice(0, 80),
        updatedAt: chat.updatedAt,
        messages: chat.messages
          .filter((message) => (
            message
            && ["user", "assistant"].includes(message.role)
            && typeof message.content === "string"
          ))
          .slice(-38)
          .map(({ role, content, suggestions }) => {
            const message = { role, content };
            const normalizedSuggestions = role === "assistant"
              ? normalizePromptSuggestions(suggestions)
              : [];
            if (normalizedSuggestions.length === 3) {
              message.suggestions = normalizedSuggestions;
            }
            return message;
          }),
      }));

      if (validChats.length !== savedChats.length) {
        chatHistoryStatus.textContent = "Some saved conversations could not be loaded.";
      }
      return validChats;
    } catch {
      chatHistoryStatus.textContent = "Chat history couldn't be read from this browser.";
      return [];
    }
  }

  function saveChatSessions() {
    try {
      const savedChats = chatSessions.map((chat) => ({
        id: chat.id,
        title: chat.title,
        updatedAt: chat.updatedAt,
        messages: chat.messages.map(({ role, content, suggestions }) => {
          const message = { role, content };
          const normalizedSuggestions = role === "assistant"
            ? normalizePromptSuggestions(suggestions)
            : [];
          if (normalizedSuggestions.length === 3) {
            message.suggestions = normalizedSuggestions;
          }
          return message;
        }),
      }));
      localStorage.setItem(chatHistoryStorageKey, JSON.stringify({ activeChatId, chats: savedChats }));
      chatHistoryStatus.textContent = "";
    } catch {
      chatHistoryStatus.textContent = "Chat history couldn't be saved in this browser.";
    }
  }

  function renderChatHistory() {
    const sortedChats = [...chatSessions].sort((first, second) => second.updatedAt - first.updatedAt);
    chatHistoryList.replaceChildren();
    chatHistoryEmpty.hidden = sortedChats.length > 0;

    sortedChats.forEach((chat) => {
      const entry = document.createElement("div");
      entry.className = "sidebar-chat-entry";

      const button = document.createElement("button");
      button.className = "sidebar-chat";
      button.type = "button";
      button.disabled = isSending || isDeletingChat;
      button.setAttribute("aria-current", String(chat.id === activeChatId));
      button.title = chat.title;
      button.dataset.chatId = chat.id;

      const title = document.createElement("span");
      title.className = "sidebar-chat-title";
      title.textContent = chat.title;
      const date = document.createElement("span");
      date.className = "sidebar-chat-date";
      date.textContent = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(chat.updatedAt);

      button.append(title, date);
      const actions = document.createElement("div");
      actions.className = "sidebar-chat-actions";

      [["rename", "Rename chat"], ["delete", "Delete chat"]].forEach(([action, label]) => {
        const actionButton = document.createElement("button");
        actionButton.className = `sidebar-chat-action sidebar-chat-action-${action}`;
        actionButton.type = "button";
        actionButton.disabled = isSending || isDeletingChat;
        actionButton.dataset.chatId = chat.id;
        actionButton.dataset.chatAction = action;
        actionButton.setAttribute("aria-label", `${label}: ${chat.title}`);
        actionButton.textContent = action === "rename" ? "Rename" : "Delete";
        actions.append(actionButton);
      });

      entry.append(button, actions);
      chatHistoryList.append(entry);
    });
  }

  function renderConversation() {
    chatMessages.replaceChildren();
    if (!conversation.length) {
      chatEmptyState.hidden = false;
      chatMessages.append(chatEmptyState);
      renderPromptSuggestions([]);
      return;
    }

    chatEmptyState.hidden = true;
    conversation.forEach((message) => {
      addMessage(message.content, message.role, "", message.role === "assistant", message.image || null);
    });
    const lastMessage = conversation[conversation.length - 1];
    renderPromptSuggestions(lastMessage.role === "assistant" ? lastMessage.suggestions : []);
  }

  function renderPromptSuggestions(suggestions) {
    const normalizedSuggestions = normalizePromptSuggestions(suggestions);
    promptSuggestions.replaceChildren();
    promptSuggestions.hidden = normalizedSuggestions.length !== 3;
    if (promptSuggestions.hidden) {
      return;
    }

    normalizedSuggestions.forEach((suggestion) => {
      const chip = document.createElement("button");
      chip.className = "prompt-chip";
      chip.type = "button";
      chip.dataset.prompt = suggestion;
      chip.textContent = suggestion;
      promptSuggestions.append(chip);
    });
  }

  function setSidebarOpen(isOpen) {
    workspace.classList.toggle("sidebar-closed", !isOpen);
    sidebarToggleButton.setAttribute("aria-expanded", String(isOpen));
    sidebarToggleButton.setAttribute("aria-label", isOpen ? "Close chat sidebar" : "Open chat sidebar");
  }

  function closeSidebarOnMobile() {
    if (window.matchMedia("(max-width: 700px)").matches) {
      setSidebarOpen(false);
    }
  }

  function openChat(chatId) {
    if (isSending || isDeletingChat) {
      return;
    }
    const chat = chatSessions.find((session) => session.id === chatId);
    if (!chat) {
      return;
    }
    activeChatId = chat.id;
    setActivityConversation(chat.id);
    conversation = chat.messages;
    clearSelectedImage();
    chatInput.value = "";
    renderChatHistory();
    renderConversation();
    saveChatSessions();
    closeSidebarOnMobile();
  }

  function createNewChat() {
    if (isSending || isDeletingChat) {
      return;
    }
    activeChatId = null;
    activityConversationId = null;
    conversation = [];
    clearSelectedImage();
    chatInput.value = "";
    renderChatHistory();
    renderConversation();
    saveChatSessions();
    closeSidebarOnMobile();
    chatInput.focus();
  }

  function renameChat(chatId) {
    const chat = chatSessions.find((session) => session.id === chatId);
    if (!chat || isSending || isDeletingChat) {
      return;
    }

    const title = window.prompt("Enter a new name for this chat:", chat.title);
    if (title === null) {
      return;
    }
    const trimmedTitle = title.trim().replace(/\s+/g, " ");
    if (!trimmedTitle || trimmedTitle.length > 80) {
      chatHistoryStatus.textContent = "Chat names must be between 1 and 80 characters.";
      return;
    }

    chat.title = trimmedTitle;
    saveChatSessions();
    renderChatHistory();
  }

  async function deleteChat(chatId) {
    const chat = chatSessions.find((session) => session.id === chatId);
    if (!chat || isSending || isDeletingChat) {
      return;
    }
    if (!window.confirm(`Delete "${chat.title}"? This permanently removes the conversation.`)) {
      return;
    }

    isDeletingChat = true;
    newChatButton.disabled = true;
    renderChatHistory();
    chatHistoryStatus.textContent = "";
    try {
      await activityWriteQueue.catch((error) => {
        console.error("Could not finish saving chat activity before deletion.", error);
      });
      const { activity, error } = await activityApiPromise;
      if (error) {
        throw new Error("Chat activity could not load from Firebase. Refresh the page and try again.");
      }
      await activity.deleteChatActivity(chatId);

      chatSessions = chatSessions.filter((session) => session.id !== chatId);
      if (activeChatId === chatId) {
        const nextChat = [...chatSessions].sort((first, second) => second.updatedAt - first.updatedAt)[0];
        activeChatId = nextChat?.id || null;
        conversation = nextChat?.messages || [];
        clearSelectedImage();
        chatInput.value = "";
      }

      activitySessionId = createActivityId();
      activityConversationId = null;
      activityConversationIds.clear();
      messagesSent = 0;
      messagesAnswered = 0;
      messagesFailed = 0;
      activityStartedAtMs = Date.now();
      activityElapsedMs = 0;
      activityLastTick = performance.now();
      lastActivitySnapshot = "";
      saveChatSessions();
      renderChatHistory();
      renderConversation();
      if (activeChatId) {
        setActivityConversation(activeChatId);
      } else {
        saveChatActivity();
      }
    } catch (error) {
      console.error("Could not delete the chat and its activity data.", error);
      chatHistoryStatus.textContent = `Could not delete this chat: ${error.message}`;
    } finally {
      isDeletingChat = false;
      newChatButton.disabled = isSending;
      renderChatHistory();
    }
  }

  function saveActiveConversation(firstQuestion) {
    let activeChat = getActiveChat();
    if (!activeChat) {
      activeChat = {
        id: createChatId(),
        title: createChatTitle(firstQuestion),
        updatedAt: Date.now(),
        messages: conversation,
      };
      chatSessions.unshift(activeChat);
      activeChatId = activeChat.id;
    } else if (activeChat.title === "New chat") {
      activeChat.title = createChatTitle(firstQuestion);
    }

    activeChat.messages = conversation;
    activeChat.updatedAt = Date.now();
    saveChatSessions();
    renderChatHistory();
  }

  function clearSelectedImage() {
    selectedImage = null;
    imageInput.value = "";
    imagePreviewThumbnail.removeAttribute("src");
    imagePreviewName.textContent = "";
    imagePreview.classList.add("hidden");
    imagePreview.classList.remove("flex");
  }

  function setSelectedImage(file) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw new Error("Please choose a PNG, JPEG, or WebP image.");
    }
    if (file.size > maxImageBytes) {
      throw new Error("Images must be 4 MB or smaller.");
    }

    return createImageBitmap(file).then(async (bitmap) => {
      try {
        const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
        let output;
        for (let attempt = 0; attempt < 6; attempt += 1) {
          const resize = scale * Math.pow(0.82, attempt);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(bitmap.width * resize));
          canvas.height = Math.max(1, Math.round(bitmap.height * resize));
          const context = canvas.getContext("2d");
          if (!context) {
            throw new Error("StudyMate could not prepare that image. Please try another file.");
          }
          context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const quality = Math.max(0.5, 0.84 - attempt * 0.08);
          output = await new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) {
                resolve(blob);
              } else {
                reject(new Error("StudyMate could not prepare that image. Please try another file."));
              }
            }, "image/jpeg", quality);
          });
          if (output.size <= maxEncodedImageBytes) {
            break;
          }
        }

        if (!output || output.size > maxEncodedImageBytes) {
          throw new Error("StudyMate could not reduce this image enough to upload. Please choose a smaller image.");
        }

        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.addEventListener("load", () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
            } else {
              reject(new Error("StudyMate could not read that image. Please try another file."));
            }
          });
          reader.addEventListener("error", () => {
            reject(new Error("StudyMate could not read that image. Please try another file."));
          });
          reader.readAsDataURL(output);
        });

        selectedImage = { dataUrl, name: file.name };
        imagePreviewThumbnail.src = dataUrl;
        imagePreviewName.textContent = file.name;
        imagePreview.classList.remove("hidden");
        imagePreview.classList.add("flex");
      } finally {
        bitmap.close();
      }
    }).catch((error) => {
      if (error instanceof Error && error.message.startsWith("StudyMate")) {
        throw error;
      }
      throw new Error("StudyMate could not read that image. Please try another file.");
    });
  }

  function setSendingState(sending) {
    isSending = sending;
    chatInput.disabled = sending;
    imageInput.disabled = sending;
    imageButton.disabled = sending;
    removeImageButton.disabled = sending;
    sendButton.disabled = sending;
    promptSuggestions.querySelectorAll("button[data-prompt]").forEach((chip) => {
      chip.disabled = sending;
    });
    newChatButton.disabled = sending || isDeletingChat;
    chatHistoryList.querySelectorAll("button").forEach((button) => {
      button.disabled = sending;
    });
    sendButton.classList.toggle("opacity-60", sending);
    sendButton.classList.toggle("cursor-wait", sending);
  }

  async function sendQuestion(question, image = null) {
    if (!await profileReady) {
      return;
    }
    if (isSending) {
      return;
    }

    const messageText = question || (image ? "Please analyze this image." : "");
    chatEmptyState.hidden = true;
    renderPromptSuggestions([]);
    addMessage(messageText, "user", "", false, image?.dataUrl);
    setSendingState(true);
    const thinkingMessage = addMessage("StudyMate is thinking... ⚡", "assistant", "thinking-message border-indigo-200");
    clearSelectedImage();

    try {
      const knownTopics = await getTopicsForChatRequest();
      if (topicContextLoadError) {
        setTopicTrackingStatus(`Could not load existing topics: ${topicContextLoadError.message}`);
      }
      const requestHistory = conversation.map(({ role, content, image: messageImage }) => {
        const requestMessage = { role, content };
        if (messageImage) {
          requestMessage.image = messageImage;
        }
        return requestMessage;
      });
      if (image) {
        requestHistory.forEach((message) => {
          delete message.image;
        });
      }
      const response = await fetch(chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...requestHistory, { role: "user", content: messageText, ...(image ? { image: image.dataUrl } : {}) }],
          existingTopics: knownTopics.slice(0, 100).map(({ title }) => title),
          ...(studentProfile ? { studentProfile } : {})
        }),
      });

      let data;
      try {
        data = await response.json();
      } catch {
        throw new Error("StudyMate server returned an unreadable response. Please try again.");
      }

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error(data?.error || "Zylorix AI is busy or the request limit was reached. Please wait a moment and try again.");
        }
        throw new Error(data?.error || "StudyMate could not answer right now. Please try again shortly.");
      }

      const answer = data && data.answer;
      if (typeof answer !== "string" || !answer.trim()) {
        throw new Error("StudyMate received an empty reply. Please try asking another way.");
      }
      const suggestions = normalizePromptSuggestions(data.suggestions);
      if (suggestions.length !== 3) {
        throw new Error("StudyMate couldn't prepare follow-up questions. Please try again.");
      }
      if (data.topic !== null && typeof data.topic !== "string") {
        throw new Error("StudyMate couldn't update your covered topics. Please try again.");
      }

      thinkingMessage.remove();
      addMessage(answer.trim(), "assistant", "", true);
      if (image) {
        conversation.forEach((message) => {
          delete message.image;
        });
      }
      conversation.push(
        { role: "user", content: messageText, ...(image ? { image: image.dataUrl } : {}) },
        { role: "assistant", content: answer.trim(), suggestions }
      );
      renderPromptSuggestions(suggestions);
      if (conversation.length > 38) {
        conversation.splice(0, conversation.length - 38);
      }
      saveActiveConversation(messageText);
      messagesAnswered += 1;
      setActivityConversation(activeChatId);
      saveCoveredTopicFromResponse(data.topic);
    } catch (error) {
      messagesFailed += 1;
      saveChatActivity();
      thinkingMessage.remove();
      const message = error instanceof TypeError
        ? "Could not connect to the StudyMate service. Please check your internet connection and try again."
        : error.message;
      addMessage(message || "Something went wrong. Please try again.", "assistant", "border-amber-200 bg-amber-50 text-amber-900");
    } finally {
      setSendingState(false);
      if (!chatInput.disabled) {
        chatInput.focus();
      }
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const question = chatInput.value.trim();
    if (isSending) {
      return;
    }
    if (!question && !selectedImage) {
      return;
    }
    messagesSent += 1;
    saveChatActivity();
    chatInput.value = "";
    sendQuestion(question, selectedImage);
  });

  imageButton.addEventListener("click", () => {
    if (!isSending) {
      imageInput.click();
    }
  });

  imageInput.addEventListener("change", async () => {
    const file = imageInput.files?.[0];
    if (!file) {
      return;
    }
    try {
      await setSelectedImage(file);
    } catch (error) {
      clearSelectedImage();
      addMessage(error.message || "Could not attach that image.", "assistant", "border-amber-200 bg-amber-50 text-amber-900");
    }
  });

  removeImageButton.addEventListener("click", clearSelectedImage);

  newChatButton.addEventListener("click", createNewChat);

  sidebarToggleButton.addEventListener("click", () => {
    setSidebarOpen(workspace.classList.contains("sidebar-closed"));
  });
  sidebarCloseButton.addEventListener("click", () => setSidebarOpen(false));
  sidebarBackdrop.addEventListener("click", () => setSidebarOpen(false));
  document.getElementById("settings-button").addEventListener("click", closeSidebarOnMobile);

  chatHistoryList.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const actionButton = target?.closest("button[data-chat-action]");
    if (actionButton) {
      if (actionButton.dataset.chatAction === "rename") {
        renameChat(actionButton.dataset.chatId);
      } else if (actionButton.dataset.chatAction === "delete") {
        deleteChat(actionButton.dataset.chatId);
      }
      return;
    }
    const button = target?.closest("button[data-chat-id]");
    if (button) {
      openChat(button.dataset.chatId);
    }
  });

  document.addEventListener("studymate:show-view", (event) => {
    activityView = event.detail;
    updateChatActivityState();
  });
  document.addEventListener("visibilitychange", updateChatActivityState);
  window.addEventListener("beforeunload", saveChatActivity);
  window.setInterval(saveChatActivity, 10000);

  promptSuggestions.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("button[data-prompt]") : null;
    if (!target || !promptSuggestions.contains(target) || isSending) {
      return;
    }
    chatInput.value = target.dataset.prompt;
    form.requestSubmit();
  });

  chatSessions = loadChatSessions();
  chatSessions.sort((first, second) => second.updatedAt - first.updatedAt);
  if (chatSessions.length && (!hasSavedActiveChatId || savedActiveChatId !== null)) {
    activeChatId = chatSessions.some((chat) => chat.id === savedActiveChatId)
      ? savedActiveChatId
      : chatSessions[0].id;
    if (activeChatId) {
      setActivityConversation(activeChatId);
      conversation = getActiveChat().messages;
    }
  }
  if (window.matchMedia("(max-width: 700px)").matches) {
    setSidebarOpen(false);
  } else {
    setSidebarOpen(true);
  }
  renderChatHistory();
  renderConversation();
  saveChatActivity();
});
