const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { handleChatBody, sendJson } = require("./lib/chat-api");

const root = __dirname;
const port = Number.parseInt(process.env.PORT || "3000", 10);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be a valid port number.");
}
const host = "127.0.0.1";
const maxRequestBytes = 8 * 1024 * 1024;
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

async function handleChat(request, response) {
  try {
    const body = await readJsonBody(request);
    await handleChatBody(body, response);
  } catch (error) {
    if (error.statusCode) {
      sendJson(response, error.statusCode, { error: error.message });
      return;
    }
    console.error("Chat request failed:", error.message);
    sendJson(response, 400, { error: "Could not read the chat request." });
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
