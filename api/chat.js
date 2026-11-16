const { handleChatBody, sendJson } = require("../lib/chat-api");

const maxRequestBytes = 8 * 1024 * 1024;

function getRequestBody(request) {
  const body = request.body;
  if (typeof body === "string") {
    if (Buffer.byteLength(body) > maxRequestBytes) {
      throw Object.assign(new Error("Request is too large."), { statusCode: 413 });
    }
    try {
      return JSON.parse(body);
    } catch {
      throw Object.assign(new Error("Request must contain valid JSON."), { statusCode: 400 });
    }
  }

  if (body && typeof body === "object") {
    if (Buffer.byteLength(JSON.stringify(body)) > maxRequestBytes) {
      throw Object.assign(new Error("Request is too large."), { statusCode: 413 });
    }
    return body;
  }

  throw Object.assign(new Error("Request must contain valid JSON."), { statusCode: 400 });
}

async function handler(request, response) {
  response.setHeader("X-Content-Type-Options", "nosniff");

  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    sendJson(response, 405, { error: "Use POST to send a chat message." });
    return;
  }
  if (!request.headers["content-type"]?.startsWith("application/json")) {
    sendJson(response, 415, { error: "Chat requests must use JSON." });
    return;
  }

  try {
    const body = await getRequestBody(request);
    await handleChatBody(body, response);
  } catch (error) {
    if (error.statusCode) {
      sendJson(response, error.statusCode, { error: error.message });
      return;
    }
    console.error("Could not read a chat request:", error.message);
    sendJson(response, 400, { error: "Could not read the chat request." });
  }
}

module.exports = handler;
