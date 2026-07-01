import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, projectRoot, "");
  const apiTarget = env.VITE_PATIENT_API_PROXY_TARGET || "http://127.0.0.1:3000";
  const cognitoRegion = env.VITE_COGNITO_REGION || env.NEXT_PUBLIC_COGNITO_REGION || "";
  const userPoolId = env.VITE_COGNITO_USER_POOL_ID || env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "";
  const userPoolClientId = env.VITE_COGNITO_USER_POOL_CLIENT_ID ||
    env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID ||
    "";

  return {
    root: __dirname,
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(projectRoot, "src"),
        "server-only": path.resolve(projectRoot, "src/test/mocks/server-only.ts"),
      },
    },
    define: {
      "process.env.NEXT_PUBLIC_COGNITO_REGION": JSON.stringify(cognitoRegion),
      "process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID": JSON.stringify(userPoolId),
      "process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID": JSON.stringify(userPoolClientId),
    },
    build: {
      assetsDir: "patient-assets",
      outDir: path.resolve(projectRoot, "dist/patient-app"),
      emptyOutDir: true,
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      port: 4173,
    },
  };
});
