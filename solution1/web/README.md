# CKB Treasury Web

基于现有投票 SDK 的 Bun + React 页面，当前仅支持 ckb-tw 钱包和本地 develop 网络。部署脚本与 Config Cell 来自 `../deployment/devnet.json`。

## 启动

1. 启动本地 CKB 节点及索引器，并确保配置中的 `rpcUrl` 可访问；Config Cell 和各合约脚本应已部署到同一条链。
2. 在 ckb-tw 扩展中切换到 devnet，填入同一个 RPC 地址，解锁 secp256k1 账户。钱包需要支付手续费；投票前需要持有比提案更早创建的 DAO 存款。
3. 在本目录运行：

   ```sh
   bun install --registry https://registry.npmjs.org
   bun run dev
   ```

打开 http://localhost:5173/。Vite 会把同源 `/rpc` 请求代理到部署配置里的 `rpcUrl`，避免浏览器跨域。`bun run build` 验证类型并生成静态页面；自行部署静态文件时也需要把 `/rpc` 代理到同一个 develop RPC。不要将页面暴露给不可信网络：本地 RPC 只供开发使用。

投票与计票使用 SDK 的完整哈希区间和默认 DAO 存款选择。页面按最新链上单元显示进度，操作在钱包确认并上链后刷新；未启动 RPC 或未安装钱包时会提示错误。挑战奖励发送至创建反对票计票单元的账户。钱包签名交易需要其自身 RPC 能访问并识别相同的链，本页面无法通过钱包接口自动核对该网络。
