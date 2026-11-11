# AGENTS.md — Word & Capsule Animation

## First
This project belongs to Hamzeh's AI OS.
Read `~/Desktop/AI/ai-os/AGENTS.md` and follow its session routine.
If you cannot reach that path, ask Hamzeh to also connect the `ai-os` folder.
Project summary lives in: `~/Desktop/AI/ai-os/10_context/projects/word-capsule-animation.md`

## This project
- What it is: Browser tool — type a word, add photos, export a looping GIF where a capsule opens inside the word. 5 languages: English, Persian, Arabic, Chinese, Hindi. Experiment.
- Tech stack: Vite 8, vanilla HTML/CSS/JS, Canvas 2D, gifenc. Code in `src/` (main.js = logic, i18n.js = UI text, styles.css = styles). Images in `public/img/`.
- How to run it: `npm install` then `npm run dev` → http://localhost:5173 (Node 20.19+).
- How to deploy it: push to `main` on GitHub → Vercel builds and publishes automatically to https://word-capsule-animation.vercel.app.
- Rules specific to this project:
  - Portfolio link: the published page must show a visible link to `https://hamzeh.framer.ai/?utm_source=word-capsule-animation&utm_medium=referral`. Check it is there before every deploy.
  - Keep it vanilla JS — no React or other frameworks.
  - Every UI string goes in `src/i18n.js` for all five languages (en, fa, ar, zh, hi). Check RTL layout (fa, ar) after UI changes.
  - Fonts live in `word-capsule-fonts/` (separate Vercel site, not in git). Never commit font files to this repo.
  - Do not commit `exports/`, `dist/` or `.vercel/`.

## Session end (in addition to the AI OS routine)
- Commit and push this project's changes to its own repo.
- Update the project page in ai-os/10_context/projects/word-capsule-animation.md directly: state, decisions, next actions.
