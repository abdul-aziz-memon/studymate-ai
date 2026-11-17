const test = require("node:test");
const assert = require("node:assert/strict");
const { handleChatBody } = require("../lib/chat-api");

function createResponse() {
  return {
    statusCode: null,
    data: null,
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(data) {
      this.data = JSON.parse(data);
    }
  };
}

test("accepts assistant history longer than the user-message limit", async (t) => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.GROQ_API_KEY;
  t.after(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) {
      delete process.env.GROQ_API_KEY;
    } else {
      process.env.GROQ_API_KEY = originalApiKey;
    }
  });
  process.env.GROQ_API_KEY = "test-key";

  let upstreamBody;
  global.fetch = async (_url, options) => {
    upstreamBody = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "Here is more detail." } }] })
    };
  };

  const response = createResponse();
  await handleChatBody({
    messages: [
      { role: "user", content: "Explain linear equations." },
      { role: "assistant", content: "x".repeat(5000) },
      { role: "user", content: "Can you explain that another way?" }
    ]
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(upstreamBody.messages[2].content.length, 5000);
});

test("keeps the user-message length limit with a specific error", async () => {
  const response = createResponse();
  await handleChatBody({
    messages: [{ role: "user", content: "x".repeat(4001) }]
  }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.data, { error: "A user message must be 4,000 characters or fewer." });
});
