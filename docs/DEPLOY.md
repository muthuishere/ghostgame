# Deploying to GitHub Pages

This project is plain HTML/CSS/JS with no build step, so deploy is one click.

## Option A: GitHub Pages from `main` (recommended)

1. Push the branch to GitHub and merge into `main`.
2. Go to **Settings → Pages**.
3. Under **Source**, choose **Deploy from a branch**.
4. Pick branch `main`, folder `/ (root)`. Save.
5. Wait ~30 seconds; the URL appears at the top of the Pages settings page.

## Option B: GitHub Actions workflow

If you prefer auto-deploy on every push, create
`.github/workflows/pages.yml` in the repo with this content (it can’t be
pushed by the bot user because of OAuth scope, so add it via the GitHub
web UI — *Add file → Create new file*):

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

Then in **Settings → Pages**, set **Source → GitHub Actions**.

## Local testing

Any static file server works. With Python:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Or with Node:

```sh
npx serve .
```

The game must be served over `http://` (not `file://`) because ES module
imports and pointer-lock both require it.
