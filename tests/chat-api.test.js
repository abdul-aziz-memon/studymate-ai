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
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              answer: "Here is more detail.",
              suggestions: ["Show another example?", "Can we try a practice problem?", "How does this work in real life?"],
              topic: "Linear equations"
            })
          }
        }]
      })
    };
  };

  const response = createResponse();
  await handleChatBody({
    messages: [
      { role: "user", content: "Explain linear equations." },
      { role: "assistant", content: "x".repeat(5000) },
      { role: "user", content: "Can you explain that another way?" }
    ],
    existingTopics: ["Linear equations", "Fractions"],
    studentProfile: { displayName: "Alex", grade: "Grade 9" }
  }, response);

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.data, {
    answer: "Here is more detail.",
    suggestions: ["Show another example?", "Can we try a practice problem?", "How does this work in real life?"],
    topic: "Linear equations"
  });
  assert.equal(upstreamBody.response_format.type, "json_object");
  assert.ok(upstreamBody.messages.some((message) => message.content.includes(JSON.stringify(["Linear equations", "Fractions"]))));
  assert.equal(upstreamBody.messages.find((message) => message.role === "assistant").content.length, 5000);
  assert.match(upstreamBody.messages[1].content, /Alex/);
  assert.match(upstreamBody.messages[1].content, /Grade 9/);
});

test("keeps the user-message length limit with a specific error", async () => {
  const response = createResponse();
  await handleChatBody({
    messages: [{ role: "user", content: "x".repeat(4001) }]
  }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.data, { error: "A user message must be 4,000 characters or fewer." });
});

test("rejects unsupported student profile grades", async () => {
  const response = createResponse();
  await handleChatBody({
    messages: [{ role: "user", content: "Help me study." }],
    studentProfile: { displayName: "Alex", grade: "University" }
  }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.data, { error: "The student profile is invalid. Add a display name and a grade from 1 to 12." });
});

test("rejects invalid existing-topic context", async () => {
  const response = createResponse();
  await handleChatBody({
    messages: [{ role: "user", content: "Explain fractions." }],
    existingTopics: ["x".repeat(101)]
  }, response);

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.data, { error: "The existing topic list is invalid." });
});

test("returns a null topic for a response without a clear learning topic", async (t) => {
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
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            answer: "You're welcome!",
            suggestions: ["Can I help with something else?", "Want to review a topic?", "Ready for another question?"],
            topic: null
          })
        }
      }]
    })
  });

  const response = createResponse();
  await handleChatBody({
    messages: [{ role: "user", content: "Thanks!" }],
    existingTopics: []
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.data.topic, null);
});

test("rejects AI replies without three valid follow-up suggestions", async (t) => {
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
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({ answer: "Here's an explanation.", suggestions: ["Try an example?"], topic: null })
        }
      }]
    })
  });

  const response = createResponse();
  await handleChatBody({
    messages: [{ role: "user", content: "Explain fractions." }]
  }, response);

  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.data, { error: "The AI service returned an invalid response. Please try again." });
});
