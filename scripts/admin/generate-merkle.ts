import { PublicKey } from '@solana/web3.js';
import { buildMerkle, leafHash, buf32ToHex } from '../../utils/merkle';

type Entry = { user: string; amount: string; index: number };

// 示例名单：请替换为你的后端导出
const entries: Entry[] = [
    { user: 'EtLsnz8fRqQ8C54CVWx5gUBfDjKfXACVoHq9Cu3z6Z9n', amount: '2000000000', index: 0 },
    { user: 'CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv', amount: '1000000000', index: 0 },
    { user: 'GUZGH3UpGEB3nZjTwof1hBF7vvHyhynph4eK8cZapxeY', amount: '3000000000', index: 0 },
    { user: '4Pip7ZdygfL5USc4m7Dm3aZMTHRAU5ESHt5JRny9fLmp', amount: '8000000000', index: 0 },
    { user: 'HZv4acqsNcUBjkDkfaPjHVqudqXpWmvNeR6BoL9kM7ss', amount: '6000000000', index: 0 },
    { user: '9W7dkPYMiYYdNwyABkoYCfFN5Tc2hJE23yVrHzpyQZ5N', amount: '1000000000', index: 0 },
    { user: '2TVLhadCawcrfhdAUXxq5vEaZe6ckAsPcSZb38JWaFNT', amount: '2000000000', index: 0 },
    { user: '5y9hEPFLKLodMArJQnLfwzCJyWZQ5uT2p3rd4tqmMCMZ', amount: '5000000000', index: 0 },
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



