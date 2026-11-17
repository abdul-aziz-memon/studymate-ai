const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const stylesheets = ["css/tailwind.css", "css/themes.css", "css/homepage.css"];
const bundle = stylesheets
  .map((stylesheet) => fs.readFileSync(path.join(root, stylesheet), "utf8").trimEnd())
  .join("\n\n");

fs.writeFileSync(path.join(root, "css/homepage.bundle.css"), `${bundle}\n`);
