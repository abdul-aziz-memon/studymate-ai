const groqEndpoint = "https://api.groq.com/openai/v1/chat/completions";
const groqModel = "openai/gpt-oss-120b";
const visionModel = "qwen/qwen3.8-27b";
const systemPrompt = "You are StudyMate AI, a super-smart, encouraging, and friendly tutor for 9th-grade students who uses simple analogies and emojis.";
const maxImageBytes = 4 * 1024 * 1024;

function readApiKey() {
  const environmentKey = process.env.GROQ_API_KEY?.trim();
  if (!environmentKey) {
    throw new Error("GROQ_API_KEY is missing from the Vercel project environment.");
  }
  return environmentKey;
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

function getUpstreamError(data, fallback) {
  const message = data?.error?.message;
  if (typeof message !== "string" || !message.trim()) {
    return fallback;
  }
  return message.trim().slice(0, 500).replace(/gsk_[A-Za-z0-9_-]+/g, "[redacted key]");
}

function validateMessages(body) {
  if (!body || !Array.isArray(body.messages) || body.messages.length < 1 || body.messages.length > 40) {
    throw Object.assign(new Error("Chat messages are missing or exceed the conversation limit."), { statusCode: 400 });
  }

  return body.messages.map((message) => {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      message.content.length > 4000
    ) {
      throw Object.assign(new Error("A chat message is invalid or too long."), { statusCode: 400 });
    }

    let image;
    if (message.image !== undefined) {
      if (message.role !== "user" || typeof message.image !== "string") {
        throw Object.assign(new Error("Images can only be attached to user messages."), { statusCode: 400 });
      }
      const match = message.image.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!match) {
        throw Object.assign(new Error("An attached image must be a valid PNG, JPEG, or WebP image."), { statusCode: 400 });
      }
      const imageBytes = Buffer.from(match[2], "base64");
      if (imageBytes.length > maxImageBytes || imageBytes.toString("base64") !== match[2]) {
        throw Object.assign(new Error("Images must be valid and 4 MB or smaller."), { statusCode: 400 });
      }
      image = message.image;
    }

    const content = message.content.trim();
    if (!content && !image) {
      throw Object.assign(new Error("A chat message must contain text or an image."), { statusCode: 400 });
    }
    return { role: message.role, content, ...(image ? { image } : {}) };
  });
}

async function handleChatBody(body, response) {
  try {
    const messages = validateMessages(body);
    const usesVisionModel = messages.some((message) => message.image);
    const apiKey = readApiKey();
    const upstream = await fetch(groqEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: usesVisionModel ? visionModel : groqModel,
        max_completion_tokens: 2048,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((message) => {
            if (!message.image) {
              return { role: message.role, content: message.content };
            }
            const content = [];
            if (message.content) {
              content.push({ type: "text", text: message.content });
            }
            content.push({ type: "image_url", image_url: { url: message.image } });
            return { role: message.role, content };
          }),
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });

    let data;
    try {
      data = await upstream.json();
    } catch {
      if (!upstream.ok) {
        console.error(`Groq returned HTTP ${upstream.status} with an unreadable error response.`);
        sendJson(response, 502, { error: "The AI service returned an unreadable error. Please try again." });
        return;
      }
      sendJson(response, 502, { error: "The AI service returned an unreadable response. Please try again." });
      return;
    }

    if (!upstream.ok) {
      const detail = getUpstreamError(data, "No additional details were provided.");
      console.error(`Groq request failed with HTTP ${upstream.status}: ${detail}`);

      if (upstream.status === 401) {
        sendJson(response, 401, { error: "The AI service is not configured correctly. Please contact the site administrator." });
        return;
      }
      if (upstream.status === 403) {
        sendJson(response, 403, { error: "The AI service could not process this request. Please try again." });
        return;
      }
      if (upstream.status === 429) {
        sendJson(response, 429, { error: "Zylorix AI is busy or the request limit was reached. Please wait a moment and try again." });
        return;
      }
      sendJson(response, 502, { error: "Zylorix AI could not answer right now. Please try again shortly." });
      return;
    }

    const answer = data?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      sendJson(response, 502, { error: "Zylorix AI returned an empty reply. Please try again." });
      return;
    }
    sendJson(response, 200, { answer: answer.trim() });
  } catch (error) {
    if (error.statusCode) {
      sendJson(response, error.statusCode, { error: error.message });
      return;
    }
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      sendJson(response, 504, { error: "Zylorix AI took too long to respond. Please try again." });
      return;
    }
    if (error.message.includes("GROQ_API_KEY")) {
      sendJson(response, 503, { error: "The AI service is not configured. Add GROQ_API_KEY to the Vercel project environment variables, then redeploy." });
      return;
    }
    console.error("Chat request failed:", error.message);
    sendJson(response, 502, { error: "StudyMate could not reach Zylorix AI. Please try again shortly." });
  }
}

module.exports = { handleChatBody, sendJson };
