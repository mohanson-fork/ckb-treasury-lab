import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowRight, ArrowUpRight, Check, ChevronRight, CircleHelp, Clock3, ExternalLink, LayoutDashboard, LoaderCircle, Plus, RefreshCw, ShieldCheck, ThumbsDown, ThumbsUp, Vote, Wallet, X } from "lucide-react";
import { ccc } from "@ckb-ccc/shell";
import { castVote, withdrawVote } from "../../sdk/src/vote";
import { createProposal, finalizeProposal, passProposal, challengeProposal } from "../../sdk/src/proposal";
import { createCountingCell } from "../../sdk/src/counting";
import { requireCellHeader, waitForTransaction } from "../../sdk/src/utils";
import { client, config, fetchSnapshot, type ProposalView } from "./chain";
import { connectWallet, WalletSigner } from "./wallet";
import "./style.css";

type Page = "overview" | "voter" | "initiator" | "challenger";
type Snapshot = Awaited<ReturnType<typeof fetchSnapshot>>;
const SHANNONS = 100_000_000n;

function ckb(amount: bigint): string {
  const whole = amount / SHANNONS;
  const decimals = (amount % SHANNONS).toString().padStart(8, "0").replace(/0+$/, "");
  return `${whole.toLocaleString("en-US")}${decimals ? `.${decimals}` : ""}`;
}

function amountFromInput(value: string): bigint {
  if (!/^\d+(\.\d{1,8})?$/.test(value)) throw new Error("请输入最多 8 位小数的有效 CKB 数量");
  const [integer, fraction = ""] = value.split(".");
  const amount = BigInt(integer) * SHANNONS + BigInt(fraction.padEnd(8, "0"));
  if (amount === 0n) throw new Error("金额必须大于 0");
  return amount;
}

function short(value: string, start = 12, end = 8) {
  return `${value.slice(0, start)}…${value.slice(-end)}`;
}

function remaining(target: bigint, tip: bigint) {
  const blocks = target > tip ? target - tip : 0n;
  return blocks ? `${blocks} 区块 · 约 ${Number(blocks) * 8} 秒` : "已到期";
}

function App() {
  const [page, setPage] = useState<Page>("overview");
  const [address, setAddress] = useState("");
  const [signer, setSigner] = useState<WalletSigner | null>(null);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [voteChoice, setVoteChoice] = useState<"yes" | "no">("yes");

  async function refresh(showLoading = true) {
    if (showLoading) setLoading(true);
    try {
      setSnapshot(await fetchSnapshot());
      setNotice((current) => current?.error ? null : current);
    } catch (error) {
      setNotice({ text: `链上数据读取失败：${String(error)}`, error: true });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => { void refresh(false); }, 12000);
    return () => clearInterval(timer);
  }, []);

  async function connect(destination?: Page) {
    try {
      const account = await connectWallet();
      if (!account.startsWith("ckt")) throw new Error("请将 ckb-tw 钱包切换到本地 develop 网络");
      const { script } = await ccc.Address.fromString(account, client);
      const secp = await ccc.Script.fromKnownScript(client, ccc.KnownScript.Secp256k1Blake160, script.args);
      if (!script.eq(secp)) throw new Error("目前只支持 ckb-tw 的 secp256k1 账户");
      setAddress(account);
      setSigner(new WalletSigner(client, account, script));
      setNotice(null);
      if (destination) setPage(destination);
    } catch (error) {
      setNotice({ text: String(error), error: true });
    }
  }

  function navigate(destination: Page) {
    if (destination !== "overview" && destination !== "challenger" && !signer) {
      setNotice({ text: "请先连接 ckb-tw 钱包", error: true });
      void connect(destination);
      return;
    }
    setPage(destination);
    setNotice(null);
  }

  async function execute(key: string, label: string, action: (active: WalletSigner) => Promise<string>) {
    if (!signer) return void connect();
    setBusy(key);
    setNotice({ text: `${label}：请在钱包中确认交易…`, error: false });
    try {
      const result = await action(signer);
      setNotice({ text: `${label}成功。交易 ${short(result, 16, 10)}`, error: false });
      await waitForTransaction(client, result);
      await refresh(false);
    } catch (error) {
      setNotice({ text: `${label}失败：${String(error)}`, error: true });
    } finally {
      setBusy("");
    }
  }

  function owned(proposal: ProposalView) {
    return signer?.scripts[0].eq(proposal.owner) ?? false;
  }

  const settings = snapshot?.settings.data;
  const tip = snapshot?.tip ?? 0n;
  const proposals = snapshot?.proposals ?? [];
  const active = proposals.filter((p) => p.data.status === 0 && settings && tip < p.origin + settings.voteWindow);
  const mine = proposals.filter(owned);
  const finalized = proposals.filter((p) => p.data.status === 1);

  function actionButton(label: string, key: string, action: (active: WalletSigner) => Promise<string>, disabled = false, className = "button-secondary") {
    return <button className={className} disabled={!!busy || disabled} onClick={() => void execute(key, label, action)}>{busy === key ? <LoaderCircle className="spin" size={16} /> : null}{label}</button>;
  }

  function proposalCard(proposal: ProposalView, mode: Page) {
    const { cell, data, origin, votes, counting } = proposal;
    const key = cell.outPoint.txHash;
    const myVote = votes.find((vote) => signer?.scripts[0].eq(vote.cell.cellOutput.lock));
    const myCounting = counting.filter((entry) => signer?.scripts[0].eq(entry.cell.cellOutput.lock));
    const direction = mode === "challenger" ? 0 : 1;
    const matching = myCounting.filter((entry) => entry.data.direction === direction);
    const counted = matching.reduce((sum, entry) => sum + entry.data.voteAmount, 0n);
    const end = origin + (settings?.voteDuration ?? 0n) + 1n;
    const windowEnd = origin + (settings?.voteWindow ?? 0n);
    const challengeEnd = challengeBlocks[key] === undefined ? null : challengeBlocks[key] + (settings?.challengeTime ?? 0n) + 1n;
    const canCount = mode === "challenger" ? tip > origin + (settings?.voteDuration ?? 0n) : tip >= end;
    const voteOpen = data.status === 0 && tip < windowEnd;
    return <article className="proposal" key={`${key}:${cell.outPoint.index}`}>
      <div className="proposal-top"><span className={`tag tag-${data.status}`}>{["投票中", "挑战期", "已通过"][data.status] ?? "未知"}</span><span className="mono muted" title={proposal.id}>{short(proposal.id)}</span></div>
      <h3>{data.description || "未命名提案"}</h3>
      <div className="proposal-details">
        <div><span>申请金额</span><strong>{ckb(data.requestedAmount)} <small>CKB</small></strong></div>
        <div><span>接收方锁哈希</span><code title={data.recipientLockHash}>{short(data.recipientLockHash, 14, 8)}</code></div>
        <div><span>赞成票</span><strong className="yes">{ckb(proposal.yes)} <small>CKB</small></strong></div>
        <div><span>反对票</span><strong className="no">{ckb(proposal.no)} <small>CKB</small></strong></div>
      </div>
      {data.status !== 2 && <div className="countdown"><Clock3 size={16}/><span>{data.status === 0 ? mode === "voter" ? "投票窗口" : "可计票" : "挑战期限"}</span><strong>{data.status === 1 && challengeEnd === null ? "读取区块头…" : remaining(data.status === 0 ? mode === "voter" ? windowEnd : end : challengeEnd!, tip)}</strong></div>}
      {mode === "voter" && myVote && <div className="vote-record"><Check size={16}/><span>已投 {myVote.data.direction === 1 ? "赞成" : "反对"} · {ckb(myVote.data.voteAmount)} CKB</span><span className="muted">区块 {voteBlocks[`${myVote.cell.outPoint.txHash}:${myVote.cell.outPoint.index}`] ?? "读取中"}</span></div>}
      {(mode === "initiator" || mode === "challenger") && matching.length > 0 && <div className="vote-record"><Check size={16}/><span>{matching.length} 个计票单元 · {ckb(counted)} CKB</span></div>}
      <div className="proposal-actions">
        {mode === "voter" && voteOpen && (myVote
          ? actionButton("撤回投票", `${key}-withdraw`, (s) => withdrawVote(s, config, { voteOutPoint: myVote.cell.outPoint }))
          : <div className="vote-controls"><div className="segmented"><button className={voteChoice === "yes" ? "selected" : ""} onClick={() => setVoteChoice("yes")}><ThumbsUp size={15}/> 赞成</button><button className={voteChoice === "no" ? "selected" : ""} onClick={() => setVoteChoice("no")}><ThumbsDown size={15}/> 反对</button></div>{actionButton("投票", `${key}-vote`, async (s) => (await castVote(s, config, { proposalOutPoint: cell.outPoint, direction: voteChoice })).txHash, false, "button-primary")}</div>)}
        {mode === "initiator" && data.status === 0 && <>
          <button className="button-secondary" onClick={() => setNotice({ text: proposal.yes >= (settings?.yesThreshold ?? 0n) ? `当前赞成票 ${ckb(proposal.yes)} CKB 已达到门槛；最终仍须在计票后确认。` : `当前赞成票 ${ckb(proposal.yes)} CKB，尚未达到 ${ckb(settings?.yesThreshold ?? 0n)} CKB 门槛。`, error: false })}>检查能否通过</button>
          {actionButton("统计赞成票（生成 1 个计票单元）", `${key}-count-yes`, async (s) => (await createCountingCell(s, config, { proposalOutPoint: cell.outPoint, direction: "yes", startHash: 0, endHash: 65535 })).txHash, !canCount || matching.length > 0)}
          {actionButton("完成计票并最终确认", `${key}-finalize`, (s) => finalizeProposal(s, config, { proposalOutPoint: cell.outPoint, countingOutPoints: matching.map((entry) => entry.cell.outPoint) }), !canCount || counted < (settings?.yesThreshold ?? 0n))}
        </>}
        {mode === "initiator" && data.status === 1 && actionButton("通过提案", `${key}-pass`, (s) => passProposal(s, config, { proposalOutPoint: cell.outPoint }), challengeEnd === null || tip < challengeEnd)}
        {mode === "challenger" && <>
          <button className="button-secondary" onClick={() => setNotice({ text: proposal.no >= data.totalYes ? `反对票 ${ckb(proposal.no)} CKB 达到已确认的 ${ckb(data.totalYes)} CKB 赞成票；仍须生成计票单元。` : `反对票 ${ckb(proposal.no)} CKB，未达到 ${ckb(data.totalYes)} CKB。`, error: false })}>检查挑战条件</button>
          {actionButton("统计反对票（生成 1 个计票单元）", `${key}-count-no`, async (s) => (await createCountingCell(s, config, { proposalOutPoint: cell.outPoint, direction: "no", startHash: 0, endHash: 65535 })).txHash, !canCount || matching.length > 0 || challengeEnd === null || tip >= challengeEnd)}
          {actionButton("发起挑战", `${key}-challenge`, (s) => challengeProposal(s, config, { proposalOutPoint: cell.outPoint, countingOutPoints: matching.map((entry) => entry.cell.outPoint) }), !matching.length || counted < data.totalYes || challengeEnd === null || tip >= challengeEnd, "button-danger")}
        </>}
      </div>
    </article>;
  }

  const [voteBlocks, setVoteBlocks] = useState<Record<string, string>>({});
  const [challengeBlocks, setChallengeBlocks] = useState<Record<string, bigint>>({});
  useEffect(() => {
    if (!snapshot) return;
    const allVotes = snapshot.proposals.flatMap((p) => p.votes);
    let cancelled = false;
    void Promise.all([
      Promise.all(allVotes.map(async (vote) => [ `${vote.cell.outPoint.txHash}:${vote.cell.outPoint.index}`, String((await requireCellHeader(client, vote.cell.outPoint)).number)] as const)),
      Promise.all(snapshot.proposals.filter((p) => p.data.status === 1).map(async (p) => [p.cell.outPoint.txHash, (await requireCellHeader(client, p.cell.outPoint)).number] as const)),
    ]).then(([voteEntries, challengeEntries]) => {
      if (!cancelled) { setVoteBlocks(Object.fromEntries(voteEntries)); setChallengeBlocks(Object.fromEntries(challengeEntries)); }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [snapshot]);

  async function submitProposal(event: React.FormEvent) {
    event.preventDefault();
    await execute("create", "创建提案", async (active) => {
      const recipientAddress = await ccc.Address.fromString(recipient, client);
      const result = await createProposal(active, config, { description: description.trim(), requestedAmount: amountFromInput(amount), recipient: recipientAddress.script });
      setDescription(""); setAmount(""); setRecipient("");
      return result.txHash;
    });
  }

  return <div className="app">
    <aside className="sidebar">
      <button className="brand" onClick={() => navigate("overview")}><span className="brand-mark">✳</span><span>CKB <b>Treasury</b><small>社区治理平台</small></span></button>
      <div className="sidebar-label">工作台</div>
      <nav aria-label="主导航">
        <button className={page === "overview" ? "active" : ""} onClick={() => navigate("overview")}><LayoutDashboard size={18}/> 概览</button>
        <button className={page === "voter" ? "active" : ""} onClick={() => navigate("voter")}><Vote size={18}/> 参与投票</button>
        <button className={page === "initiator" ? "active" : ""} onClick={() => navigate("initiator")}><Plus size={18}/> 发起提案</button>
        <button className={page === "challenger" ? "active" : ""} onClick={() => navigate("challenger")}><ShieldCheck size={18}/> 发起挑战</button>
      </nav>
      <div className="sidebar-bottom"><span className="network-dot"/> DEVELOP NET <span className="mono">:8114</span><p>仅连接本地开发网络</p></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><div className="breadcrumb">CKB Treasury <ChevronRight size={14}/> {({ overview: "概览", voter: "参与投票", initiator: "发起提案", challenger: "发起挑战" })[page]}</div><div className="top-actions"><span className="top-network"><span className="network-dot"/> Develop</span><button className="icon-button" title="刷新链上数据" aria-label="刷新链上数据" onClick={() => void refresh()}><RefreshCw size={17} className={loading ? "spin" : ""}/></button><button className="wallet-button" title={address || "连接 ckb-tw 钱包"} onClick={() => void connect()}><Wallet size={16}/>{address ? short(address, 9, 5) : "连接钱包"}</button></div></header>
      <main>
        {notice && <div className={`notice ${notice.error ? "error" : ""}`} role="status"><span>{notice.text}</span><button title="关闭提示" aria-label="关闭提示" onClick={() => setNotice(null)}><X size={16}/></button></div>}
        {page === "overview" && <>
          <div className="page-heading"><div><div className="eyebrow">GOVERNANCE / DEVELOP NETWORK</div><h1>让每一票，都有去处<span className="accent">.</span></h1><p>从提案到执行，一起决定社区资金的流向。</p></div><div className="block-indicator"><span className="network-dot"/> 链上高度 <strong>#{tip.toString()}</strong></div></div>
          <section className="stats" aria-label="治理概况"><div><span>进行中的提案</span><strong>{active.length.toString().padStart(2, "0")}</strong><small>等待社区表态</small></div><div><span>挑战期提案</span><strong>{finalized.length.toString().padStart(2, "0")}</strong><small>可复核计票结果</small></div><div><span>已通过提案</span><strong>{proposals.filter((p) => p.data.status === 2).length.toString().padStart(2, "0")}</strong><small>已完成治理决议</small></div></section>
          <div className="section-heading"><div><span className="eyebrow">GET STARTED</span><h2>你想从哪里开始？</h2></div></div>
          <div className="entry-grid"><button onClick={() => navigate("initiator")} className="entry entry-dark"><span className="entry-icon"><ArrowUpRight size={23}/></span><span className="entry-title">发起提案</span><span className="entry-copy">提交资金申请，统计赞成票并推动提案通过。</span><span className="entry-link">进入发起人工作台 <ArrowRight size={17}/></span></button><button onClick={() => navigate("voter")} className="entry entry-light"><span className="entry-icon"><Vote size={23}/></span><span className="entry-title">参与投票</span><span className="entry-copy">使用 DAO 存款为开放中的提案投票。</span><span className="entry-link">浏览可投提案 <ArrowRight size={17}/></span></button></div>
          <div className="section-heading config-head"><div><span className="eyebrow">ON-CHAIN PARAMETERS</span><h2>当前治理规则</h2></div><span className="muted">读取自 Config Cell</span></div>
          <section className="config-grid">{settings ? <><div><span>赞成票门槛</span><strong>{ckb(settings.yesThreshold)} CKB</strong></div><div><span>最小提案抵押</span><strong>{ckb(settings.minimalProposalCapacity)} CKB</strong></div><div><span>最小投票额</span><strong>{ckb(settings.minimalVoteAmount)} CKB</strong></div><div><span>投票持续时间</span><strong>{settings.voteDuration.toString()} 区块</strong></div><div><span>投票窗口</span><strong>{settings.voteWindow.toString()} 区块</strong></div><div><span>挑战期</span><strong>{settings.challengeTime.toString()} 区块</strong></div><div><span>紧急暂停</span><strong>{settings.emergentHalt ? "已启用" : "未启用"}</strong></div><div><span>否决锁哈希</span><code>{settings.vetoLockScriptHash}</code></div></> : <p className="muted">{loading ? "正在读取链上配置…" : "无法读取配置，请检查本地节点与索引器。"}</p>}</section>
          {settings && <div className="config-technical"><div><span>投票脚本 · hash type {settings.voteHashType}</span><code>{settings.voteCodeHash}</code></div><div><span>计票脚本 · hash type {settings.countingHashType}</span><code>{settings.countingCodeHash}</code></div><div><span>无条件解锁脚本 · hash type {settings.alwaysSuccessHashType}</span><code>{settings.alwaysSuccessCodeHash}</code></div></div>}
          <button className="challenge-link" onClick={() => navigate("challenger")}><ShieldCheck size={19}/> 查看可挑战的提案 <ArrowRight size={17}/></button>
        </>}
        {page === "voter" && <><div className="page-heading inner"><div><div className="eyebrow">YOUR VOICE MATTERS</div><h1>参与投票<span className="accent">.</span></h1><p>选择立场，以该地址在提案前存入的全部 DAO 资产为票数。</p></div><div className="block-indicator">{active.length} 个开放提案</div></div><div className="section-heading"><h2>投票窗口内</h2><span className="muted">每区块约 8 秒</span></div><div className="list">{active.length ? active.map((p) => proposalCard(p, "voter")) : <div className="empty">当前没有可投票的提案。</div>}</div></>}
        {page === "initiator" && <><div className="page-heading inner"><div><div className="eyebrow">PROPOSAL WORKSPACE</div><h1>发起提案<span className="accent">.</span></h1><p>提出资金申请，统计选票，推进决议。</p></div><div className="block-indicator">{mine.length} 个我的提案</div></div><section className="create-panel"><div><span className="eyebrow">NEW PROPOSAL</span><h2>创建新提案</h2><p>提案将由当前钱包地址持有；接收地址用于确定链上的接收方锁哈希。</p></div><form onSubmit={(event) => void submitProposal(event)}><label>提案描述<textarea required maxLength={500} placeholder="简要说明资金用途" value={description} onChange={(event) => setDescription(event.target.value)} /></label><div className="form-row"><label>申请金额 <span>CKB</span><input required inputMode="decimal" placeholder="例如 150" value={amount} onChange={(event) => setAmount(event.target.value)}/></label><label>接收方 CKB 地址 <span title="将计算为 recipient_lock_hash"><CircleHelp size={14}/></span><input required placeholder="ckt1..." value={recipient} onChange={(event) => setRecipient(event.target.value)}/></label></div><button className="button-primary" disabled={!!busy || !signer}>{busy === "create" ? <LoaderCircle className="spin" size={16}/> : <Plus size={17}/>} 创建提案</button></form></section><div className="section-heading"><h2>我的提案</h2><span className="muted">{mine.length} 个链上单元</span></div><div className="list">{mine.length ? mine.map((p) => proposalCard(p, "initiator")) : <div className="empty">这个地址还没有发起提案。</div>}</div></>}
        {page === "challenger" && <><div className="page-heading inner"><div><div className="eyebrow">KEEP GOVERNANCE HONEST</div><h1>发起挑战<span className="accent">.</span></h1><p>查看最终确认的提案，以反对票计票单元发起复核。</p></div><div className="block-indicator">{finalized.length} 个待复核提案</div></div><div className="section-heading"><h2>挑战期提案</h2><span className="muted">奖励发送至计票者的钱包地址</span></div><div className="list">{finalized.length ? finalized.map((p) => proposalCard(p, "challenger")) : <div className="empty">当前没有处于挑战期的提案。</div>}</div></>}
        <footer><span>CKB Treasury · Local develop</span><span>由链上数据驱动 <ExternalLink size={13}/></span></footer>
      </main>
    </div>
  </div>;
}

createRoot(document.getElementById("root")!).render(<App />);
