# bubby

v1 skeleton for the Bubby web app.

## Local development

```sh
npm install
npm run dev
```

The Vite app runs at `http://localhost:5173` and proxies `/api` requests to the Express server on `http://localhost:3001`.

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` before building the Claude chat endpoint in a later step.
