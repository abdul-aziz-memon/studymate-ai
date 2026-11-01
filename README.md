# StudyMate AI 📚🤖

> A friendly study buddy for the “I have read this paragraph three times and it still looks like ancient runes” moments.

StudyMate AI is a small web app that helps students explore tricky topics with clear, encouraging explanations. Ask a question in the chat, attach an image when a diagram or problem needs explaining, and get an answer formatted for easier reading.

The project also includes a landing page introducing the app and a page about the people behind it. In short: less staring at the textbook, more “ohhh, that makes sense.” ✨

## What can it do?

- **Explain study questions:** Chat with an AI tutor configured to use simple language, friendly explanations, analogies, and a supportive tone.
- **Look at images:** Attach a PNG, JPEG, or WebP image to ask about a diagram, a written problem, or other study material.
- **Format answers:** The chat renders common Markdown elements, code blocks, tables, and mathematical notation.
- **Keep the conversation going:** Follow-up questions use recent messages from the current chat page to provide context. The conversation is kept in browser memory; it is not saved as an account or chat history.
- **Offer a few starting points:** Sample question buttons make it easy to get the first study session rolling.
- **Add a little color:** Shared theme styles provide the app’s changing accent colors and consistent page controls.
- **Deploy or run locally:** A Node.js serverless function relays chat requests to Groq on Vercel; a small local Node.js server is also included. No build step or database required.

> **A quick reality check:** AI can make mistakes, even when it sounds very confident (we all know someone like that). Check important facts, calculations, and citations against your course materials.

## Pages

| Page | What it’s for |
| --- | --- |
| [`index.html`](index.html) | The homepage: an introduction to StudyMate AI, its features, and links to the rest of the site. |
| [`chat.html`](chat.html) | The study chat: ask questions, attach images, and read formatted responses. |
| [`creators.html`](creators.html) | Information about the project’s creator and representative. |

## Get started 🚀

### You’ll need

- **Node.js 18 or later**
- **A Groq API key**
- **An internet connection** for the Groq API and the external font, styling, and math-rendering resources used by the pages

For Vercel deployment, you’ll also need a Vercel account and this repository connected to a Vercel project.

### 1. Get the project

Clone the repository or download its source, then open a terminal in the project folder.

### 2. Configure your API key

Create a file named `.env` in the project root (next to `server.js`) and add your Groq API key:

```env
GROQ_API_KEY=your_groq_api_key
```

When running locally, the server reads `GROQ_API_KEY` from this root `.env` file. On Vercel, configure the same variable in the project’s Environment Variables settings instead; Vercel does not use this local `.env` file for deployments. Keep the key private: **do not put it in HTML or browser JavaScript, commit it, or share it in screenshots or logs.**

### 3. Start StudyMate

```bash
npm start
```

This runs `node server.js`. The project has no npm runtime dependencies to install.

By default, the server prints its local address:

```text
http://127.0.0.1:3000
```

Open that address in your browser. The homepage is served at `/`; the chat and creators pages are available at `/chat.html` and `/creators.html`.

### Optional: choose another port

The server uses port `3000` unless the `PORT` environment variable is set. For example, in PowerShell:

```powershell
$env:PORT = "4000"
npm start
```

Then open `http://127.0.0.1:4000`. The server binds to `127.0.0.1`, so it is intended for use on the same computer, not as a public hosting setup.

## Deploy to Vercel ☁️

The local server intentionally accepts requests only from your own computer. Vercel needs a different setup, so this project includes a serverless function at `api/chat.js` and shared chat logic in `lib/chat-api.js`. Vercel serves the static pages and runs that function for `POST /api/chat`.

1. Push the project to a Git provider supported by Vercel, then import the repository into Vercel.
2. Select the repository root as the project root. This is a plain HTML/CSS/JavaScript project; it does not need a framework build command or output directory.
3. In **Project Settings → Environment Variables**, add:

   | Name | Value |
   | --- | --- |
   | `GROQ_API_KEY` | Your Groq API key |

   Add it to the deployment environments you intend to use (for example, Production and Preview). Do not add the key to a `VITE_`/browser variable or commit it to Git.
4. Deploy the project, or redeploy if you added the environment variable after the first deployment.
5. Open your Vercel deployment and try the chat. The browser sends messages to the same deployment’s `/api/chat` function.

`vercel.json` gives the chat function up to 60 seconds to receive a response. The Vercel plan still determines the maximum duration available to your project. The local `.env` file is ignored by Git and is only for local development.

**Usage note:** The deployed chat endpoint is public, like the rest of the website. Protect your Groq account with its available usage limits, and consider Vercel’s traffic controls if the site receives unwanted automated requests.

## How a chat request works

1. You enter a question (or attach an image) in `chat.html`.
2. `js/chat.js` builds the recent conversation context and sends it to `POST /api/chat`.
3. Locally, `server.js` receives the request. On Vercel, `api/chat.js` receives it instead. Both use `lib/chat-api.js` to validate the request, read the API key from the appropriate configuration, and send the conversation to Groq.
4. The server returns the AI’s answer to the browser, where it is rendered in the chat.

Text-only requests and requests containing an image use separate model configurations in `lib/chat-api.js`. Images are resized in the browser where possible and validated by the server; supported formats are PNG, JPEG, and WebP, with a 4 MB upload limit. The server also applies request-size, message-count, and message-length limits.

**Privacy note:** The app backend runs on your computer during local development and on Vercel after deployment, but the content you submit—including an attached image—is sent to Groq to generate a response. Avoid sharing passwords, private personal information, or anything you would not want processed by the AI service. Review Groq’s current terms and privacy information before using the service.

## Project structure 🗂️

```text
studymate-ai/
├── index.html           # Landing page
├── chat.html            # AI study chat interface
├── creators.html        # Creator and representative information
├── server.js            # Local HTTP server and Groq API proxy
├── api/
│   └── chat.js           # Vercel serverless endpoint for POST /api/chat
├── lib/
│   └── chat-api.js       # Shared validation and Groq request handling
├── vercel.json           # Vercel function configuration
├── package.json         # Project metadata and npm start command
├── README.md            # You are here; no map required
├── contribute.md        # Contribution guidelines
├── LICENSE              # Project license
├── .gitignore           # Files Git should leave alone
├── css/
│   ├── homepage.css     # Homepage-specific styles
│   ├── chat.css         # Chat page and formatted answer styles
│   ├── creators.css     # Creators page styles
│   └── themes.css       # Shared theme colors and page controls
└── js/
    ├── chat.js          # Chat UI, image preparation, and response rendering
    └── themes.js        # Shared page-control behavior
```

### A closer look at the important files

- **`server.js`** serves an explicit list of site files and accepts local chat requests. It is for local development; Vercel runs the separate serverless endpoint instead.
- **`api/chat.js`** adapts Vercel’s parsed HTTP request to the shared chat handler.
- **`lib/chat-api.js`** validates messages and image data, reads the API key from the environment (or the local `.env` fallback), and forwards requests to Groq. It also handles upstream errors and timeouts.
- **`vercel.json`** configures the chat function’s maximum duration.
- **`chat.html`** contains the chat form, message area, image picker, sample prompts, and icon definitions. It loads the chat styles and browser-side chat logic.
- **`js/chat.js`** manages the chat experience: conversation context, prompt buttons, image selection and resizing, request states, and safe rendering of formatted answers.
- **`css/themes.css`** contains the shared theme variables and styles used across the pages. The page-specific CSS files handle their respective layouts and components.
- **`package.json`** defines the `npm start` script. There is no compile or bundling step.

## Tech stack 🧰

- **HTML** for the pages and their accessible structure
- **CSS** for custom page styling and shared themes
- **Vanilla JavaScript** for browser interactions—no frontend framework required
- **Node.js built-in modules** for the local HTTP server and Vercel function
- **Groq API** for AI responses
- **External CDN resources** for Tailwind CSS, Google Fonts, and KaTeX math rendering

Because some frontend resources are loaded from CDNs, the pages may look or format differently if those services are unavailable. The chat needs both the local server and a working Groq API configuration.

## Troubleshooting 🔧

### “The AI service is not configured”

- Locally, check that `.env` is in the project root and contains a non-empty `GROQ_API_KEY=...` entry.
- On Vercel, check that `GROQ_API_KEY` is configured in the project’s Environment Variables settings for the environment you deployed.
- Restart the local server or redeploy after changing the key.
- Never paste the key into a chat message or commit it to the repository.

### The browser can’t connect to StudyMate

- Start the app with `npm start`.
- Open the address printed by the server (usually `http://127.0.0.1:3000`).
- If you changed `PORT`, use that port in the browser too.
- If the port is already in use, choose another `PORT`.

### The chat returns an API error or times out

Check your internet connection and Groq API account/configuration, then try again. The server has a request timeout; a slow or unavailable upstream service can prevent a reply.

### An image won’t attach

Use a PNG, JPEG, or WebP image under 4 MB. If the browser cannot decode or resize the selected image, try exporting a smaller copy and attaching that instead.

## Contributing 🤝

Contributions and pull requests are welcome for review. Please keep changes focused, test the affected pages locally with `npm start`, and **do not include API keys, `.env` files, or other secrets**.

See [`contribute.md`](contribute.md) for the project’s contribution guidelines.

## The humans behind the study buddy 👋

StudyMate AI was created by **AbdulAziz Memon** and is represented by **Syed Saifullah**.

- Email: [xantrailstudio@gmail.com](mailto:xantrailstudio@gmail.com)
- Discord: `@abdul_aziz_memon`

## License

See [`LICENSE`](LICENSE) for license details.
