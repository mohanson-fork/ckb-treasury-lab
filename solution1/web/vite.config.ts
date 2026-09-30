import { defineConfig } from "vite";
import deployment from "../deployment/devnet.json";

export default defineConfig({
  server: {
    proxy: {
      "/rpc": { target: deployment.rpcUrl, changeOrigin: true, rewrite: () => "/" },
    },
  },
});
