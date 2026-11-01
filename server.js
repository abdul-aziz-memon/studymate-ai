const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = __dirname;
const port = Number.parseInt(process.env.PORT || "3000", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid port number.");
}
const host = "127.0.0.1";
const groqEndpoint = "https://api.groq.com/openai/v1/chat/completions";
const groqModel = "openai/gpt-oss-120b";
const visionModel = "qwen/qwen3.8-27b";
const systemPrompt = "You are StudyMate AI, a super-smart, encouraging, and friendly tutor for 9th-grade students who uses simple analogies and emojis.";
const maxRequestBytes = 8 * 1024 * 1024;
const maxImageBytes = 4 * 1024 * 1024;
const publicFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/chat.html", ["chat.html", "text/html; charset=utf-8"]],
  ["/creators.html", ["creators.html", "text/html; charset=utf-8"]],
  ["/css/homepage.css", ["css/homepage.css", "text/css; charset=utf-8"]],
  ["/css/chat.css", ["css/chat.css", "text/css; charset=utf-8"]],
  ["/css/creators.css", ["css/creators.css", "text/css; charset=utf-8"]],
  ["/css/themes.css", ["css/themes.css", "text/css; charset=utf-8"]],
  ["/js/themes.js", ["js/themes.js", "text/javascript; charset=utf-8"]],
  ["/js/chat.js", ["js/chat.js", "text/javascript; charset=utf-8"]],
]);

function readApiKey() {
  const envPath = path.join(root, ".env");
  let contents;
  try {
    contents = fs.readFileSync(envPath, "utf8");
  } catch {
    throw new Error("Could not read the .env file.");
  }

  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?GROQ_API_KEY\s*=\s*(.*?)\s*$/);
    if (!match) {
      continue;
    }

    let value = match[1].trim();
    const quotedValue = value.match(/^"([^"]*)"\s*;?(?:\s+#.*)?$/) || value.match(/^'([^']*)'\s*;?(?:\s+#.*)?$/);
    if (quotedValue) {
      value = quotedValue[1];
    } else {
      value = value.replace(/\s+#.*$/, "").replace(/;\s*$/, "").trim();
    }
    if (value) {
      return value;
    }
  }

  throw new Error("GROQ_API_KEY is missing from .env.");
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

function isAllowedHost(request) {
  const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  if (!allowedHosts.has(request.headers.host)) {
    return false;
  }

  const origin = request.headers.origin;
  if (!origin) {
    return true;
  }

  try {
    return allowedHosts.has(new URL(origin).host);
  } catch {
    return false;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxRequestBytes) {
      const error = new Error("Request is too large.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request must contain valid JSON.");
    error.statusCode = 400;
    throw error;
  }
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

async function handleChat(request, response) {
  try {
    const body = await readJsonBody(request);
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
    if (error.message.includes("GROQ_API_KEY") || error.message.includes(".env")) {
      sendJson(response, 503, { error: "The AI service is not configured yet. Please contact the site administrator." });
      return;
    }
    console.error("Chat request failed:", error.message);
    sendJson(response, 502, { error: "StudyMate could not reach Zylorix AI. Please try again shortly." });
  }
}

const server = http.createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "same-origin");

  if (!isAllowedHost(request)) {
    sendJson(response, 403, { error: "This local StudyMate server only accepts requests from this computer." });
    return;
  }

  let url;
  try {
    url = new URL(request.url, `http://${request.headers.host}`);
  } catch {
    sendJson(response, 400, { error: "Request URL is invalid." });
    return;
  }
  if (url.pathname === "/api/chat") {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      sendJson(response, 405, { error: "Use POST to send a chat message." });
      return;
    }
    if (!request.headers["content-type"]?.startsWith("application/json")) {
      sendJson(response, 415, { error: "Chat requests must use JSON." });
      return;
    }
    await handleChat(request, response);
    return;
  }

  const file = publicFiles.get(url.pathname);
  if (!file || (request.method !== "GET" && request.method !== "HEAD")) {
    sendJson(response, 404, { error: "Page not found." });
    return;
  }

  try {
    const content = await fs.promises.readFile(path.join(root, file[0]));
    response.writeHead(200, {
      "Content-Type": file[1],
      "Cache-Control": "no-cache",
      "Content-Length": content.length,
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch (error) {
    console.error("Could not serve a public site file:", error.message);
    sendJson(response, 500, { error: "Could not load the requested page." });
  }
});

server.listen(port, host, () => {
  console.log(`StudyMate is running at http://${host}:${port}`);
});

server.on("error", (error) => {
  console.error("StudyMate server failed to start:", error.message);
  process.exitCode = 1;
});
