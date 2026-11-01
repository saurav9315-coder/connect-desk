import http from "http";
import { app } from "./app";
import { ENV } from "./config/env";
import { initSocketServer } from "./socket";

const httpServer = http.createServer(app);
const io = initSocketServer(httpServer);

if (process.env.NODE_ENV !== "test") {
  const tryListen = (port: number, attemptsLeft = 10) => {
    httpServer.removeAllListeners("error");

    httpServer.once("error", (err: any) => {
      if ((err.code === "EADDRINUSE" || err.code === "EACCES") && attemptsLeft > 0) {
        console.warn(`⚠️ Port ${port} is unavailable (${err.code}). Automatically trying port ${port + 1}...`);
        tryListen(port + 1, attemptsLeft - 1);
      } else {
        console.error("❌ Fatal server error:", err);
        process.exit(1);
      }
    });

    httpServer.listen(port, () => {
      console.log(`===============================================`);
      console.log(` Chat App Backend Server running on port ${port}`);
      console.log(` Health Check:    http://localhost:${port}/api/health`);
      console.log(` DB Health Check: http://localhost:${port}/api/health/db`);
      console.log(` Frontend URL:    ${ENV.FRONTEND_URL}`);
      console.log(`===============================================`);
    });
  };

  tryListen(ENV.PORT);
}

export { httpServer, app, io };
