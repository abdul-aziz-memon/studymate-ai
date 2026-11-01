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
- **Run locally:** A small Node.js server serves the site and relays chat requests to Groq. No build step or database required.

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

### 1. Get the project

Clone the repository or download its source, then open a terminal in the project folder.

### 2. Configure your API key

Create a file named `.env` in the project root (next to `server.js`) and add your Groq API key:

```env
GROQ_API_KEY=your_groq_api_key
```

The server reads `GROQ_API_KEY` from this root `.env` file when a chat request is made. Keep the key private: **do not put it in HTML or browser JavaScript, commit it, or share it in screenshots or logs.**

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

## How a chat request works

1. You enter a question (or attach an image) in `chat.html`.
2. `js/chat.js` builds the recent conversation context and sends it to the local server’s `POST /api/chat` endpoint.
3. `server.js` validates the request, reads the API key from `.env`, and sends the conversation to Groq.
4. The server returns the AI’s answer to the browser, where it is rendered in the chat.

Text-only requests and requests containing an image use separate model configurations in `server.js`. Images are resized in the browser where possible and validated by the server; supported formats are PNG, JPEG, and WebP, with a 4 MB upload limit. The server also applies request-size, message-count, and message-length limits.

**Privacy note:** The app server runs locally, but the content you submit—including an attached image—is sent to Groq to generate a response. Avoid sharing passwords, private personal information, or anything you would not want processed by the AI service. Review Groq’s current terms and privacy information before using the service.

## Project structure 🗂️

```text
studymate-ai/
├── index.html           # Landing page
├── chat.html            # AI study chat interface
├── creators.html        # Creator and representative information
├── server.js            # Local HTTP server and Groq API proxy
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

- **`server.js`** serves an explicit list of site files, accepts chat requests at `/api/chat`, validates messages and image data, and forwards requests to Groq. It also handles upstream errors and timeouts.
- **`chat.html`** contains the chat form, message area, image picker, sample prompts, and icon definitions. It loads the chat styles and browser-side chat logic.
- **`js/chat.js`** manages the chat experience: conversation context, prompt buttons, image selection and resizing, request states, and safe rendering of formatted answers.
- **`css/themes.css`** contains the shared theme variables and styles used across the pages. The page-specific CSS files handle their respective layouts and components.
- **`package.json`** defines the `npm start` script. There is no compile or bundling step.

## Tech stack 🧰

- **HTML** for the pages and their accessible structure
- **CSS** for custom page styling and shared themes
- **Vanilla JavaScript** for browser interactions—no frontend framework required
- **Node.js built-in modules** for the local HTTP server
- **Groq API** for AI responses
- **External CDN resources** for Tailwind CSS, Google Fonts, and KaTeX math rendering

Because some frontend resources are loaded from CDNs, the pages may look or format differently if those services are unavailable. The chat needs both the local server and a working Groq API configuration.

## Troubleshooting 🔧

### “The AI service is not configured”

- Check that `.env` is in the same folder as `server.js`.
- Confirm it contains a non-empty `GROQ_API_KEY=...` entry.
- Restart the server after changing the key.
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
