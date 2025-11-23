# Remotion Browser Setup (CLI/Exporter)

Remotion needs a runnable headless Chrome/Chromium. Set `REMOTION_BROWSER_EXECUTABLE` (or `CHROME_PATH`) to a Linux/macOS browser binary so Remotion does **not** download its own shell.

## WSL (Windows Subsystem for Linux)
1. Install Chromium inside WSL:
   ```bash
   sudo apt-get update
   sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium
   ```
2. Export the path (use whichever exists):
   ```bash
   export REMOTION_BROWSER_EXECUTABLE="$(which chromium-browser || which chromium)"
   ```
3. Run the exporter/CLI in the same shell.

> Do **not** point to the Windows Chrome executable; use the Linux Chromium installed above.

## macOS
1. Use the installed Chrome binary:
   ```bash
   export REMOTION_BROWSER_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
   ```
2. Run the exporter/CLI in the same shell.

## Linux (native)
1. Install Chromium (Debian/Ubuntu example):
   ```bash
   sudo apt-get update
   sudo apt-get install -y chromium-browser || sudo apt-get install -y chromium
   ```
2. Export the path:
   ```bash
   export REMOTION_BROWSER_EXECUTABLE="$(which chromium-browser || which chromium)"
   ```
3. Run the exporter/CLI in the same shell.

## Docker alternative (lean image)
If host browser setup is painful (e.g., WSL), build the provided lean Docker image (Remotion + compositions only) and run the exporter inside it:
```bash
docker build -f Dockerfile.remotion -t tutopanda-remotion-export .
# Render by running the exporter container and mounting your builds root:
docker run --rm -v /home/keremk/tuto2:/data tutopanda-remotion-export \
  node /app/render.mjs --movieId=<movieId> --root=/data --basePath=builds
```
This uses the Remotion headless shell and deps inside the image.
