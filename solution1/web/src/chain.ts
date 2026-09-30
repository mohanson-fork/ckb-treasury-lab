import { ccc } from "@ckb-ccc/shell";
import { buildClient } from "../../sdk/src/client";
import type { DeploymentConfig } from "../../sdk/src/config";
import { findCountingCells, findProposalCells, findVoteCells, loadConfigCell } from "../../sdk/src/query";
import { requireCellHeader, scriptId } from "../../sdk/src/utils";
import type { ConfigCellInfo, CountingCellInfo, ProposalCellInfo, VoteCellInfo } from "../../sdk/src/query";
import deployment from "../../deployment/devnet.json";
import { currentLanguage, translate } from "./i18n";

export const config = { ...deployment, rpcUrl: `${location.origin}/rpc` } as DeploymentConfig;
export const client = buildClient(config);

export type ProposalView = ProposalCellInfo & {
  id: ccc.Hex;
  origin: bigint;
  owner: ccc.Script;
  votes: VoteCellInfo[];
  counting: CountingCellInfo[];
  yes: bigint;
  no: bigint;
};

async function originalOwner(proposal: ProposalCellInfo): Promise<ccc.Script> {
  if (proposal.data.status === 0) return proposal.cell.cellOutput.lock;
  let current = proposal.cell.outPoint.txHash;
  for (let step = 0; step < proposal.data.status; step++) {
    const created = await client.getTransaction(current);
    const previous = created?.transaction.inputs[0]?.previousOutput;
    if (!previous) throw new Error(translate(currentLanguage(), "previousTransactionMissing"));
    current = previous.txHash;
  }
  const original = await client.getTransaction(current);
  const lock = original?.transaction.outputs[0]?.lock;
  if (!lock) throw new Error(translate(currentLanguage(), "proposalOwnerMissing"));
  return lock;
}

export async function fetchSnapshot(): Promise<{ settings: ConfigCellInfo; tip: bigint; proposals: ProposalView[] }> {
  const [settings, tip] = await Promise.all([loadConfigCell(client, config), client.getTip()]);
  const [proposals, votes, counting] = await Promise.all([
    Array.fromAsync(findProposalCells(client, config)),
    Array.fromAsync(findVoteCells(client, config)),
    Array.fromAsync(findCountingCells(client, config)),
  ]);
  const views = await Promise.all(proposals.map(async (proposal) => {
    const id = scriptId(proposal.typeScript);
    const relatedVotes = votes.filter((vote) => vote.typeScript.args === id);
    const relatedCounting = counting.filter((entry) => entry.typeScript.args === id);
    const origin = proposal.data.status === 0
      ? (await requireCellHeader(client, proposal.cell.outPoint)).number
      : proposal.data.originBlockNumber;
    const owner = await originalOwner(proposal);
    const total = (direction: number) => {
      const byOwner = new Map<string, bigint>();
      for (const vote of relatedVotes.filter((entry) => entry.data.direction === direction)) {
        const key = vote.cell.cellOutput.lock.hash();
        if (vote.data.voteAmount > (byOwner.get(key) ?? 0n)) byOwner.set(key, vote.data.voteAmount);
      }
      return [...byOwner.values()].reduce((sum, amount) => sum + amount, 0n);
    };
    return {
      ...proposal, id, owner, origin, votes: relatedVotes, counting: relatedCounting,
      yes: total(1), no: total(0),
    };
  }));
  return { settings, tip, proposals: views };
}
