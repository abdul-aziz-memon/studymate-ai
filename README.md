# StudyMate AI 📚🤖

> A friendly study buddy for the “I read this paragraph three times and it still looks like ancient runes” moments.

StudyMate AI helps students explore tricky topics with clear, encouraging explanations. Ask a question, attach a study image, or generate an image from a prompt. It includes a landing page, an AI chat, and a page about the people behind the project.

**This project is deployed on Vercel.** The website is served as static files, and chat requests run through a Vercel serverless function. There is no local web server in this project.

## What it can do

- Explain study questions in a friendly, approachable style.
- Accept PNG, JPEG, and WebP images to ask about diagrams or written problems.
- Generate images from text prompts with Cloudflare Workers AI.
- Format responses with Markdown, code blocks, tables, and mathematical notation.
- Keep recent messages in the current browser session for follow-up questions.
- Provide sample questions to help start a study session.

AI can make mistakes, even when it sounds confident. Check important facts, calculations, and citations against your course materials.

## Pages

| Page | Purpose |
| --- | --- |
| [`index.html`](index.html) | Project introduction and links to the app. |
| [`chat.html`](chat.html) | Study chat, image attachment, and formatted answers. |
| [`creators.html`](creators.html) | Information about the creator. |

## Deploy on Vercel ☁️

### 1. Import the repository

In Vercel, import the Git repository containing this project. Set the **Root Directory** to the folder containing `vercel.json` and `index.html`. Use the **Other** framework preset; this is a static HTML project with a Vercel Function, not a Node server.

The pages are static files; `package.json` is used only to build Tailwind CSS. Vercel serves `index.html` and the other static assets from the project root. The generated `css/tailwind.css` is committed, so deployment does not require a build command.

To regenerate the Tailwind stylesheet after changing page markup or utility classes, install the development dependencies with `npm install` and run `npm run build:css`. During development, `npm run watch:css` rebuilds it when source files change. Commit the regenerated `css/tailwind.css` with your changes.

### 2. Add the Groq API key to Vercel

In **Project → Settings → Environment Variables**, create:

| Name | Value |
| --- | --- |
| `GROQ_API_KEY` | Your Groq API key |
| `ACCOUNT_ID` | Your Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | A Cloudflare API token with Workers AI permissions |

Select every environment you use, such as **Production**, **Preview**, and **Development**. Save the variable.

The function reads `process.env.GROQ_API_KEY`, `process.env.ACCOUNT_ID`, and `process.env.CLOUDFLARE_API_TOKEN` directly. It does not read `.env` files. These values must remain server-side Vercel environment variables; never add them to HTML or browser JavaScript.

### 3. Deploy the current commit

Push the changes to the Git branch connected to Vercel, then wait for a **new deployment of that commit** to finish. If you add or change an environment variable, redeploy afterward—existing deployments do not automatically receive updated variables.

### 4. Check the deployment

- Open the new deployment and verify the homepage loads.
- Open `/api/chat` in a browser. A `405` response saying “Use POST to send a chat message” is expected for a browser GET; it confirms Vercel routed the request to the function.
- Try a question in the chat. If the function responds that `GROQ_API_KEY` is not configured, check that the variable was saved for that deployment’s environment and redeploy.

If you still see a message saying requests are only accepted from this computer, you are not receiving this version of the code. That response came from the removed local server. In Vercel, check **Deployments** and confirm the URL points to the latest deployment built from the commit containing `api/chat.js` and `vercel.json`. Also confirm the project’s Root Directory is correct and that the deployment succeeded.

## How chat works

1. `js/chat.js` sends the current conversation or the user's image request to `POST /api/chat`.
2. Vercel routes that request to `api/chat.js`.
3. `api/chat.js` checks the HTTP method and JSON body, then routes chat and image-generation requests to `lib/chat-api.js`.
4. `lib/chat-api.js` validates messages and images. For image creation, it first asks Groq to expand the user's request into a detailed visual description, then sends that description to Cloudflare Workers AI.
5. The function returns the answer or generated image and its prepared description to the browser.

The function accepts up to 40 messages, limits each message to 4,000 characters, and validates image uploads. Images are limited to 4 MB and supported formats are PNG, JPEG, and WebP. The function is configured for a maximum duration of 60 seconds, subject to the project’s Vercel plan limits.

### Privacy and usage

The deployed chat endpoint is public. Messages and attached images are sent to Groq to generate answers. Do not send passwords, sensitive personal information, or other private material. Check your Groq account’s usage limits and Vercel traffic controls to help prevent unexpected usage.

## Project structure 🗂️

```text
studymate-ai/
├── index.html           # Landing page
├── chat.html            # Chat interface
├── creators.html        # Creator information
├── api/
│   └── chat.js          # Vercel serverless endpoint: POST /api/chat
├── lib/
│   └── chat-api.js      # Shared validation and Groq request handling
├── vercel.json          # Vercel Function configuration
├── contribute.md        # Contribution guidelines
├── LICENSE              # Project license
├── css/
│   ├── homepage.css     # Landing page styles
│   ├── chat.css         # Chat and answer styles
│   ├── creators.css     # Creators page styles
│   └── themes.css       # Shared theme styles and controls
└── js/
    ├── chat.js          # Chat UI, image preparation, and rendering
    └── themes.js        # Shared page-control behavior
```

### Main implementation files

- **`api/chat.js`** is the Vercel Function. It accepts JSON `POST` requests at `/api/chat` and returns JSON responses.
- **`lib/chat-api.js`** holds the chat validation, Groq API request, and upstream error handling shared by the function.
- **`vercel.json`** configures the chat function’s maximum duration.
- **`js/chat.js`** handles the browser chat, prompt buttons, image preparation, and response formatting.
- **`chat.html`** defines the chat form and message area.

## Technologies 🧰

- HTML, CSS, and vanilla JavaScript
- Vercel static hosting and Node.js Functions
- Groq API for AI responses
- Locally generated Tailwind CSS; KaTeX is loaded from a CDN on the chat page

## Contributing 🤝

Pull requests are welcome for review. Keep changes focused, check the affected pages and Vercel Function in a deployment preview, and never include API keys or other secrets. See [`contribute.md`](contribute.md).

## The creator behind the study buddy 👋

Created by **AbdulAziz Memon**.

- Email: [xantrailstudio@gmail.com](mailto:xantrailstudio@gmail.com)
- Discord: `@abdul_aziz_memon`

See [`LICENSE`](LICENSE) for license details.
