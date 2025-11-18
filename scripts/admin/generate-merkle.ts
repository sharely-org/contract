import { PublicKey } from '@solana/web3.js';
import { buildMerkle, leafHash, buf32ToHex } from '../../utils/merkle';

type Entry = { user: string; amount: string; index: number };

// 示例名单：请替换为你的后端导出
const entries: Entry[] = [
    { user: '9rawhixqxFmBvD5pMwEonxYxKXSRpUVcDVnCqb71e2YF', amount: '389260000000', index: 0 },
    { user: '4joBhqhv6YMvCBeQ8Lr5ESePXkmmZVKG8CohBS9TMFHs', amount: '211840000000', index: 0 },
];

// 固定排序（建议：按 pubkey 升序）
entries.sort((a, b) => a.user.localeCompare(b.user));

// 给entry加上index
entries.forEach((e, i) => {
    e.index = i;
});

console.log('entries=', entries);

const leaves = entries.map((e, i) =>
    leafHash(BigInt(e.index), new PublicKey(e.user), BigInt(e.amount))
);
const tree = buildMerkle(leaves);

// 打印所有叶子节点 index, user, amount, proof

for (let i = 0; i < leaves.length; i++) {
    const leaf = leaves[i];
    const proof = tree.getProof(leaf).map(p => (p.data as Buffer).toString('hex'));
    console.log(
        JSON.stringify({ index: i, user: entries[i].user, amount: entries[i].amount, proof }, null, 2)
    );
}


console.log('merkle_root(hex)=', buf32ToHex(tree.getRoot()));



