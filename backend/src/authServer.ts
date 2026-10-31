import "./loadEnv";
import { createAuthApp } from "./authApp";

// Local run of the cloud auth service: pnpm --filter vc-screener-backend auth:dev
const port = Number(process.env.AUTH_PORT ?? 4100);
createAuthApp().listen(port, "127.0.0.1", () => console.log(`Auth service on http://127.0.0.1:${port}`));
