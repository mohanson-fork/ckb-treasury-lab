import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "vite";

const network = process.env.CKB_VOTE_NETWORK ?? "devnet";
if (network !== "devnet" && network !== "testnet") {
  throw new Error("CKB_VOTE_NETWORK must be devnet or testnet");
}
const configPath = new URL(`../deployment/${network}.json`, import.meta.url);
if (!existsSync(configPath)) {
  throw new Error(`Missing deployment/${network}.json; deploy the contracts and config cell first`);
}
const deployment = JSON.parse(readFileSync(configPath, "utf8")) as {
  rpcUrl: string;
  scripts?: unknown;
  configCell?: unknown;
};
if (!deployment.rpcUrl || !deployment.scripts || !deployment.configCell) {
  throw new Error(`deployment/${network}.json must contain rpcUrl, scripts and configCell`);
}

export default defineConfig({
  define: {
    __CKB_VOTE_DEPLOYMENT__: JSON.stringify(deployment),
    __CKB_VOTE_NETWORK__: JSON.stringify(network),
  },
  server: {
    proxy: {
      "/rpc": { target: deployment.rpcUrl, changeOrigin: true, rewrite: () => "/" },
    },
  },
});
