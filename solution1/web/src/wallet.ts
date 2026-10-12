import { ccc } from "@ckb-ccc/shell";
import { currentLanguage, translate } from "./i18n";

type Provider = {
  isCkbWallet: boolean;
  request(input: { method: string; params?: unknown[] }): Promise<unknown>;
};

declare global {
  interface Window {
    ckb?: Provider;
  }
}

export function walletProvider(): Provider {
  if (!window.ckb?.isCkbWallet) {
    throw new Error(translate(currentLanguage(), "walletMissing"));
  }
  return window.ckb;
}

export async function connectWallet(): Promise<string> {
  const accounts = await walletProvider().request({ method: "ckb_requestAccounts" });
  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
    throw new Error(translate(currentLanguage(), "addressMissing"));
  }
  return accounts[0];
}

export class WalletSigner extends ccc.SignerCkbScriptReadonly {
  constructor(client: ccc.Client, readonly address: string, lock: ccc.Script) {
    super(client, lock);
  }

  async assertAccount(): Promise<void> {
    if (await connectWallet() !== this.address) {
      throw new Error(translate(currentLanguage(), "walletAccountChanged"));
    }
  }

  async prepareTransaction(txLike: ccc.TransactionLike): Promise<ccc.Transaction> {
    const tx = ccc.Transaction.from(txLike);
    const lock = this.scripts[0];
    await tx.prepareSighashAllWitness(lock, 65, this.client);
    await tx.addCellDepInfos(this.client, (await this.client.getKnownScript(ccc.KnownScript.Secp256k1Blake160)).cellDeps);
    return tx;
  }

  async signOnlyTransaction(txLike: ccc.TransactionLike): Promise<ccc.Transaction> {
    await this.assertAccount();
    const tx = ccc.Transaction.from(txLike);
    const signed = await walletProvider().request({
      method: "ckb_signTransaction",
      params: [JSON.parse(tx.stringify())],
    });
    return ccc.Transaction.from(signed as ccc.TransactionLike);
  }
}
