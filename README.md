# Stage Snapper v5.1 🎬

A professional projection mapping tool for stage design. Slice, map, and output JSON configuration for media servers.

## Features ✨

*   **Drag & Drop Import**: Drag images directly onto the canvas.
*   **Auto Edge Detection**: "Grandmaster Scan" algorithm automatically finds lines and shapes.
*   **Projector Settings**: Customizable resolution (WUXGA, 4K, Custom) with aspect ratio locking.
*   **Slicing Tools**: Create, move, resize, and rotate slices with snapping.
*   **Visual Feedback**: Blue Master Frame, glowing active Slices, and toggleable Scan Lines.
*   **Output**: Export mapping data to JSON.

## 🚀 How to Deploy (GitHub + Cloudflare Pages)

This project is built with **Vite + React** and is ready for static hosting.

### Step 1: Push to GitHub

1.  Create a new repository on GitHub (e.g., `stage-mapper`).
2.  Run the following commands in your terminal (VS Code):

```bash
# Link your local repo to GitHub (replace URL with your new repo URL)
git remote add origin https://github.com/YOUR_USERNAME/stage-mapper.git

# Push the code
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Cloudflare Pages

1.  Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages**.
2.  Click **Create Application** > **Connect to Git**.
3.  Select the `stage-mapper` repository you just created.
4.  Configure the build settings:
    *   **Framework Preset**: `Vite`
    *   **Build Command**: `npm run build`
    *   **Output Directory**: `dist`
5.  Click **Save and Deploy**.

Cloudflare will build your site and give you a public URL (e.g., `https://stage-mapper.pages.dev`).

## 🛠️ Local Development

```bash
npm install
npm run dev
```
