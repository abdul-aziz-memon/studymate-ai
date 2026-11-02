const chatEndpoint = "/api/chat";

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
  const promptChips = document.querySelectorAll("[data-prompt]");
  const conversation = [];
  let isSending = false;
  let selectedImage = null;
  const maxImageBytes = 4 * 1024 * 1024;
  const maxEncodedImageBytes = 1536 * 1024;

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
      image.className = "mb-2 max-h-56 max-w-full rounded-lg object-contain";
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
    promptChips.forEach((chip) => {
      chip.disabled = sending;
    });
    sendButton.classList.toggle("opacity-60", sending);
    sendButton.classList.toggle("cursor-wait", sending);
  }

  async function sendQuestion(question, image = null) {
    if (isSending) {
      return;
    }

    const messageText = question || (image ? "Please analyze this image." : "");
    addMessage(messageText, "user", "", false, image?.dataUrl);
    setSendingState(true);
    const thinkingMessage = addMessage("StudyMate is thinking... ⚡", "assistant", "thinking-message border-indigo-200");
    clearSelectedImage();

    try {
      const requestHistory = conversation.map((message) => {
        if (!image || !message.image) {
          return message;
        }
        const messageWithoutImage = { ...message };
        delete messageWithoutImage.image;
        return messageWithoutImage;
      });
      const response = await fetch(chatEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...requestHistory, { role: "user", content: messageText, ...(image ? { image: image.dataUrl } : {}) }],
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

      thinkingMessage.remove();
      addMessage(answer.trim(), "assistant", "", true);
      if (image) {
        conversation.forEach((message) => {
          delete message.image;
        });
      }
      conversation.push(
        { role: "user", content: messageText, ...(image ? { image: image.dataUrl } : {}) },
        { role: "assistant", content: answer.trim() }
      );
      if (conversation.length > 38) {
        conversation.splice(0, conversation.length - 38);
      }
    } catch (error) {
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
    if ((!question && !selectedImage) || isSending) {
      return;
    }
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

  promptChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      if (isSending) {
        return;
      }
      chatInput.value = chip.dataset.prompt;
      form.requestSubmit();
    });
  });
});
