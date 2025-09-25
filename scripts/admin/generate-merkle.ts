import { PublicKey } from '@solana/web3.js';
import { buildMerkle, leafHash, buf32ToHex } from '../../utils/merkle';

type Entry = { user: string; amount: string };

// 示例名单：请替换为你的后端导出
const entries: Entry[] = [
    // { user: 'YourUserPubkey1', amount: '1000000' },
];

// 固定排序（建议：按 pubkey 升序）
entries.sort((a, b) => a.user.localeCompare(b.user));

const leaves = entries.map((e, i) =>
    leafHash(BigInt(i), new PublicKey(e.user), BigInt(e.amount))
);
const tree = buildMerkle(leaves);

console.log('merkle_root(hex)=', buf32ToHex(tree.getRoot()));

entries.forEach((e, i) => {
    const leaf = leaves[i];
    const proof = tree.getProof(leaf).map(p => (p.data as Buffer).toString('hex'));
    console.log(
        JSON.stringify({ index: i, user: e.user, amount: e.amount, proof }, null, 2)
    );
});


