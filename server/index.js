import { createApp } from "./app.js";
import { createServer } from "node:http";

const dev = process.argv.includes("--dev");
try {
  const server = createServer();
  const { app, close } = await createApp({
    dev,
    useVite: dev,
    httpServer: server,
  });
  const port = Number(process.env.PORT ?? 5173);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be a number between 1 and 65535.");
  const host = dev ? "127.0.0.1" : "0.0.0.0";
  server.on("request", app);
  server.listen(port, host, () => {
    console.log(
      `Portfolio is ready at http://${dev ? "localhost" : "0.0.0.0"}:${port}`,
    );
    if (dev && !process.env.ADMIN_PASSWORD)
      console.log(
        "Local studio is unlocked. Production requires ADMIN_PASSWORD and APP_ORIGIN.",
      );
  });
  server.on("error", (error) => {
    console.error(`Unable to start portfolio: ${error.code ?? "server error"}`);
    process.exitCode = 1;
    void close();
  });
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await close();
    server.close();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
