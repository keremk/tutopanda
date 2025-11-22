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

## Troubleshooting
- If Remotion still downloads `chrome-headless-shell`, your browser path was not picked up or is not executable. Re-check `REMOTION_BROWSER_EXECUTABLE`.
- If the downloaded shell runs instead and fails on missing libs (e.g., `libnss3`), install a native Chromium as above rather than relying on the shell.
