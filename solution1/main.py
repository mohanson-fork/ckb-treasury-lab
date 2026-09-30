import contextlib
import json
import os
import subprocess
import sys
import time
import typing

import pyckb


def bash(cmd: str) -> subprocess.CompletedProcess[bytes]:
    print(f'$ {cmd}')
    return subprocess.run(cmd, shell=True, check=True)


def bash_output(cmd: str) -> subprocess.CompletedProcess[bytes]:
    print(f'$ {cmd}')
    return subprocess.run(cmd, shell=True, check=True, capture_output=True)


@contextlib.contextmanager
def cd(dst: str) -> typing.Generator[None, typing.Any, None]:
    # Context manager to temporarily change the current working directory.
    cwd = os.getcwd()
    os.chdir(dst)
    yield
    os.chdir(cwd)


def init():
    subprocess.run('pm k ckbm ckbr', shell=True)
    with cd('/home/ubuntu/src/ckb-treasury-lab/solution1/devnet'):
        bash('rm -rf data ckb ckb-cli pk1 pk2')
    with cd('/home/ubuntu/.ckb-cli/keystore'):
        bash('rm -rf UTC*')
    with cd('/home/ubuntu/src/ckb-treasury-lab/solution1/devnet'):
        bash('ln -s ~/app/ckb/bin/ckb .')
        bash('ln -s ~/app/ckb/bin/ckb-cli .')
        bash('echo 0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc > pk1')
        bash('echo 0x63d86723e08f0f813a36ce6aa123bb2289d90680ae1e99d4de8cdb334553f24d > pk2')
        bash('./ckb-cli account import --privkey-path pk1')
        bash('./ckb-cli account import --privkey-path pk2')
        bash('PMNAME=ckbm pm c ./ckb run --indexer')
        bash('PMNAME=ckbr pm c ./ckb miner')


def main():
    pyckb.config.upgrade(pyckb.config.develop.rpc.url)
    pyckb.config.current = pyckb.config.develop
    user = [
        pyckb.wallet.Wallet(0),
        pyckb.wallet.Wallet(1),
        pyckb.wallet.Wallet(2),
        pyckb.wallet.Wallet(0xd00c06bfd800d27397002dca6fb0993d5ba6399b4238b2f29ee9deb97593d2bc),
        pyckb.wallet.Wallet(0x63d86723e08f0f813a36ce6aa123bb2289d90680ae1e99d4de8cdb334553f24d),
    ]
    user[3].transfer(user[1].script, user[3].capacity() // 2)
    user[4].transfer(user[2].script, user[4].capacity() // 2)
    time.sleep(15)
    for i in range(1, 5):
        user[i].dao_deposit(1000 * pyckb.denomination.ckbytes)
    time.sleep(15)
    with cd('/home/ubuntu/src/ckb-treasury-lab/solution1/sdk'):
        bash('bun run src/cli/index.ts devnet-scripts --out ../deployment/devnet.json')
        bash(' '.join([
            'bun run src/cli/index.ts deploy',
            '--config ../deployment/devnet.json',
            '--private-key-file ../devnet/pk1',
            '--out ../deployment/devnet.json',
        ]))
        time.sleep(15)
        bash(' '.join([
            'bun run src/cli/index.ts create-config',
            '--config ../deployment/devnet.json',
            '--write ../deployment/devnet.json',
            '--private-key-file ../devnet/pk1',
            '--minimal-proposal-capacity 200',
            '--yes-threshold 100',
            '--minimal-vote-amount 100',
            '--vote-duration 5',
            '--vote-window 1000',
            '--challenge-time 5',
        ]))
        time.sleep(15)
        proposal = bash_output(' '.join([
            'bun run src/cli/index.ts create-proposal',
            '--config ../deployment/devnet.json',
            '--private-key-file ../devnet/pk1',
            '--description "Fund the docs"',
            '--requested-amount 150',
            '--json',
        ])).stdout
        proposal_txid = json.loads(proposal)['proposalCell']['txHash']
        time.sleep(15)
        bash(' '.join([
            'bun run src/cli/index.ts vote',
            '--config ../deployment/devnet.json',
            '--private-key-file ../devnet/pk1',
            f'--proposal {proposal_txid}:0',
            '--direction yes',
        ]))
        time.sleep(15)
        counting = bash_output(' '.join([
            'bun run src/cli/index.ts create-counting',
            '--config ../deployment/devnet.json',
            '--private-key-file ../devnet/pk1',
            f'--proposal {proposal_txid}:0',
            '--direction yes',
            '--start-hash 0',
            '--end-hash 65535',
            '--wait',
            '--json',
        ])).stdout
        counting_txid = json.loads(counting)['countingCell']['txHash']
        time.sleep(15)
        finalize = bash_output(' '.join([
            'bun run src/cli/index.ts finalize-proposal',
            '--config ../deployment/devnet.json',
            '--private-key-file ../devnet/pk1',
            f'--proposal {proposal_txid}:0',
            f'--counting {counting_txid}:0',
            '--wait',
            '--json',
        ])).stdout
        finalize_txid = json.loads(finalize)['txHash']
        time.sleep(15)
        passpass = bash_output(' '.join([
            'bun run src/cli/index.ts pass-proposal',
            '--config ../deployment/devnet.json',
            '--private-key-file ../devnet/pk1',
            f'--proposal {finalize_txid}',
            '--wait',
            '--json',
        ])).stdout
        passpass_txid = json.loads(passpass)['txHash']
        time.sleep(15)
        bash(' '.join([
            'bun run src/cli/index.ts receive-grant',
            '--config ../deployment/devnet.json',
            '--private-key-file ../devnet/pk1',
            f'--proposal {passpass_txid}',
            '--json',
        ]))


if __name__ == '__main__':
    eval(f'{sys.argv[1]}()')
