const groqEndpoint = "https://api.groq.com/openai/v1/chat/completions";
const groqModel = "openai/gpt-oss-120b";
const visionModel = "qwen/qwen3.8-27b";
const cloudflareImageModel = "@cf/black-forest-labs/flux-1-schnell";
const systemPrompt = `You are StudyMate AI, an encouraging, friendly tutor that helps students learn more easily. Explain ideas clearly, use simple analogies when helpful, and adapt your explanations to the student's level.

Project background: StudyMate AI was created by AbdulAziz Memon, a 9th-class student from Pakistan, to help students learn more easily. StudyMate AI was trained and fine-tuned by Xantrail Studio, whose CEO is AbdulAziz Memon. AbdulAziz Memon is the sole creator of StudyMate AI. Share these details when someone asks about the project or its creator; otherwise, stay focused on the student's learning question.`;
const maxImageBytes = 4 * 1024 * 1024;
const maxImageBase64Length = 4 * Math.ceil(maxImageBytes / 3);

function readApiKey() {
  const environmentKey = process.env.GROQ_API_KEY?.trim();
  if (!environmentKey) {
    throw new Error("GROQ_API_KEY is missing from the Vercel project environment.");
  }
  return environmentKey;
}

function readCloudflareCredentials() {
  const accountId = process.env.ACCOUNT_ID?.trim();
  const apiToken = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !/^[a-f0-9]{32}$/i.test(accountId) || !apiToken) {
    throw Object.assign(new Error("Cloudflare image generation is not configured. Add ACCOUNT_ID and CLOUDFLARE_API_TOKEN to the server environment."), { statusCode: 503 });
  }
  return { accountId, apiToken };
}

function sendJson(response, statusCode, data) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(data));
}

async function handleImageGenerationBody(body, response) {
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || prompt.length > 2048) {
    sendJson(response, 400, { error: "Enter an image description up to 2,048 characters." });
    return;
  }

  try {
    const { accountId, apiToken } = readCloudflareCredentials();
    const upstream = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${cloudflareImageModel}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ prompt }),
        signal: AbortSignal.timeout(55000),
      }
    );

    let data;
    try {
      data = await upstream.json();
    } catch {
      console.error(`Cloudflare image request returned an unreadable response with HTTP ${upstream.status}.`);
      sendJson(response, 502, { error: "The image service returned an unreadable response. Please try again." });
      return;
    }

    if (!upstream.ok || data?.success === false) {
      console.error(`Cloudflare image request failed with HTTP ${upstream.status}.`);
      if (upstream.status === 401) {
        sendJson(response, 503, { error: "Cloudflare image generation is not configured correctly. Check the server API token." });
        return;
      }
      if (upstream.status === 403) {
        sendJson(response, 403, { error: "Cloudflare could not authorize image generation. Check the token permissions and account." });
        return;
      }
      if (upstream.status === 429) {
        sendJson(response, 429, { error: "Image generation is busy. Please wait a moment and try again." });
        return;
      }
      sendJson(response, 502, { error: "Cloudflare could not create the image right now. Please try again shortly." });
      return;
    }

    const imageBase64 = data?.result?.image;
    if (
      typeof imageBase64 !== "string"
      || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)
      || imageBase64.length > maxImageBase64Length
    ) {
      sendJson(response, 502, { error: "The image service returned an invalid or oversized image. Please try again." });
      return;
    }
    const imageBytes = Buffer.from(imageBase64, "base64");
    if (!imageBytes.length || imageBytes.length > maxImageBytes || imageBytes.toString("base64") !== imageBase64) {
      sendJson(response, 502, { error: "The image service returned an invalid or oversized image. Please try again." });
      return;
    }

    sendJson(response, 200, { image: `data:image/jpeg;base64,${imageBase64}` });
  } catch (error) {
    if (error.statusCode) {
      sendJson(response, error.statusCode, { error: error.message });
      return;
    }
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      sendJson(response, 504, { error: "Image generation took too long. Please try again." });
      return;
    }
    console.error("Cloudflare image generation failed:", error.message);
    sendJson(response, 502, { error: "StudyMate could not reach the image service. Please try again shortly." });
  }
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

module.exports = { handleChatBody, handleImageGenerationBody, sendJson };
