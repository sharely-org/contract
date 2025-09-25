import { sha256 } from '@noble/hashes/sha256';
import { MerkleTree } from 'merkletreejs';
import { PublicKey } from '@solana/web3.js';

export function u64ToLeBytes(x: bigint): Uint8Array {
    const out = new Uint8Array(8);
    let v = x;
    for (let i = 0; i < 8; i++) {
        out[i] = Number(v & 0xffn);
        v >>= 8n;
    }
    return out;
}

export function leafHash(index: bigint, user: PublicKey, amount: bigint): Buffer {
    const idx = u64ToLeBytes(index);
    const amt = u64ToLeBytes(amount);
    const data = Buffer.concat([Buffer.from(idx), Buffer.from(user.toBytes()), Buffer.from(amt)]);
    return Buffer.from(sha256(data));
}

export function hashPairSorted(a: Buffer, b: Buffer): Buffer {
    const [x, y] = Buffer.compare(a, b) <= 0 ? [a, b] : [b, a];
    return Buffer.from(sha256(Buffer.concat([x, y])));
}

export function buildMerkle(leaves: Buffer[]): MerkleTree {
    const hashFn = (data: Buffer) => {
        const half = data.length / 2;
        return hashPairSorted(data.subarray(0, half), data.subarray(half));
    };
    return new MerkleTree(leaves, hashFn, { isBitcoinTree: false, sortPairs: false });
}

export function buf32ToHex(b: Buffer): string {
    if (b.length !== 32) throw new Error('expected 32-byte buffer');
    return b.toString('hex');
}

export function hexTo32ByteArray(hex: string): number[] {
    const buf = Buffer.from(hex, 'hex');
    if (buf.length !== 32) throw new Error('invalid node length');
    return [...buf];
}


