# 🏋️ LiftLog — Progressive Overload Tracker

Track your lifts, monitor progressive overload, and sync data between devices via CSV export/import.

## Features

- Log sets with weight, sets, reps, and notes
- Add / remove custom exercises
- Progress charts with PR tracking
- CSV export & import to sync between devices

---

## 🚀 Deploy to Railway

### Option 1 — Railway CLI (fastest)

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Create a new project and deploy
railway init
railway up
```

### Option 2 — GitHub + Railway Dashboard

1. Push this folder to a GitHub repo
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
3. Select your repo — Railway will auto-detect the config from `railway.toml`
4. Your app will be live at the generated `.railway.app` URL

### Option 3 — Deploy Button

Once your repo is on GitHub, you can add a one-click deploy button to your README:

```
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/YOUR_USERNAME/YOUR_REPO)
```

---

## 🖥 Run Locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## 🏗 Build for Production

```bash
npm run build
npm run start   # serves the built dist/ folder
```

---

## 📁 Project Structure

```
liftlog/
├── public/
│   └── favicon.svg
├── src/
│   ├── main.jsx          # React entry point
│   └── LiftTracker.jsx   # Main app component
├── index.html
├── vite.config.js
├── package.json
├── railway.toml          # Railway deployment config
└── .gitignore
```

## 📦 Tech Stack

- **React 18** — UI
- **Vite 5** — Build tool & dev server
- **localStorage** — Client-side data persistence
- **CSV** — Portable data export/import format
