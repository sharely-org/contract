import { Keypair, PublicKey } from '@solana/web3.js';
import { keccak_256, sha3_256 } from '@noble/hashes/sha3';
import { sha256 } from '@noble/hashes/sha2';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

function parseSecret(json: string | undefined): Uint8Array {
    if (!json) throw new Error('missing ADMIN_SECRET_JSON');
    return new Uint8Array(JSON.parse(json));
}

function u64ToLeBytes(n: bigint): Uint8Array {
    const buf = new Uint8Array(8);
    const view = new DataView(buf.buffer);
    view.setBigUint64(0, n, true);
    return buf;
}

function i64ToLeBytes(n: bigint): Uint8Array {
    const buf = new Uint8Array(8);
    const view = new DataView(buf.buffer);
    view.setBigInt64(0, n, true);
    return buf;
}

(async () => {
    const adminSecret = parseSecret(process.env.ADMIN_SECRET_JSON);
    const admin = Keypair.fromSecretKey(adminSecret);

    const programId = new PublicKey(process.env.PROGRAM_ID || '');
    const merchant = new PublicKey(process.env.MERCHANT_PUBKEY || '');
    const mint = new PublicKey(process.env.MINT_PUBKEY || '');

    const questId = BigInt(process.env.QUEST_ID || '0');
    const totalAmount = BigInt(process.env.TOTAL_AMOUNT || '0');
    const startAt = BigInt(process.env.START_AT || '0');
    const endAt = BigInt(process.env.END_AT || '0');
    const domain = sha256(new TextEncoder().encode('sharely:v1'));
    const message = new Uint8Array([
        ...domain,
        ...admin.publicKey.toBytes(),
        ...merchant.toBytes(),
        ...mint.toBytes(),
        ...u64ToLeBytes(questId),
        ...u64ToLeBytes(totalAmount),
        ...i64ToLeBytes(startAt),
        ...i64ToLeBytes(endAt),
    ]);

    const nacl = await import('tweetnacl');
    const sig = nacl.default.sign.detached(message, admin.secretKey);
    const ok = nacl.default.sign.detached.verify(message, sig, admin.publicKey.toBytes());
    console.log('ok=', ok);

    console.log('ADMIN_PUBKEY=', admin.publicKey.toBase58());
    console.log('MESSAGE_BASE58=', bs58.encode(message));
    console.log('SIGNATURE_BASE58=', bs58.encode(sig));
    console.log('SIGNATURE=', sig);
})();
