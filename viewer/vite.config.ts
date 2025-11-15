import os from "node:os"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { createViewerApiMiddleware } from "./vite.viewer-api"

const expandPath = (input: string | null | undefined) => {
  if (!input) return null
  const withHome = input.startsWith("~/") ? path.join(os.homedir(), input.slice(2)) : input
  return path.isAbsolute(withHome) ? withHome : path.resolve(process.cwd(), withHome)
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")
  const candidate =
    env.TUTOPANDA_VIEWER_ROOT ??
    env.VITE_TUTOPANDA_ROOT ??
    process.env.TUTOPANDA_VIEWER_ROOT ??
    process.env.VITE_TUTOPANDA_ROOT ??
    null
  const viewerRoot = expandPath(candidate)

  return {
    plugins: [
      react({
        babel: {
          plugins: [["babel-plugin-react-compiler"]],
        },
      }),
      tailwindcss(),
      {
        name: "tutopanda-viewer-api",
        apply: "serve",
        configureServer(server) {
          if (!viewerRoot) {
            console.warn("[viewer] TUTOPANDA_VIEWER_ROOT is not set. Viewer API is disabled.")
            return
          }
          server.middlewares.use("/viewer-api", createViewerApiMiddleware(viewerRoot))
        },
      },
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@client": path.resolve(__dirname, "../client/src"),
      },
    },
    server: {
      fs: {
        allow: [path.resolve(__dirname, ".."), ...(viewerRoot ? [viewerRoot] : [])],
      },
    },
  }
})
