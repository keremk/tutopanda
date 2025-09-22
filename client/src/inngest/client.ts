import { Inngest } from "inngest";
import { realtimeMiddleware } from "@inngest/realtime/middleware";

let app: Inngest | undefined;

export const getInngestApp = () => {
  return (app ??= new Inngest({
    id: typeof window !== "undefined" ? "client" : "server",
    middleware: [realtimeMiddleware()],
  }));
};

export const inngest = getInngestApp();
