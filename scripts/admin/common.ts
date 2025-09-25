import 'dotenv/config';
import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

// 兼容旧 Node：为 structuredClone 提供兜底
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if (typeof (globalThis as any).structuredClone !== 'function') {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const util = require('node:util');
        if (typeof util.structuredClone === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (globalThis as any).structuredClone = util.structuredClone;
        }
    } catch (_) { }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (globalThis as any).structuredClone !== 'function') (globalThis as any).structuredClone = (o: any) => JSON.parse(JSON.stringify(o));
}

function parseSecret(json: string | undefined): Uint8Array {
    if (!json) throw new Error('missing secret json');
    const arr = JSON.parse(json) as number[];
    return new Uint8Array(arr);
}

export function getAdminProvider() {
    const url = process.env.RPC_URL || 'http://127.0.0.1:8899';
    const connection = new Connection(url, 'confirmed');
    const key = parseSecret(process.env.ADMIN_SECRET_JSON);
    const wallet = new anchor.Wallet(Keypair.fromSecretKey(key));
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    anchor.setProvider(provider);
    return provider;
}

export function getUserProvider() {
    const url = process.env.RPC_URL || 'http://127.0.0.1:8899';
    const connection = new Connection(url, 'confirmed');
    const key = parseSecret(process.env.USER_SECRET_JSON);
    const wallet = new anchor.Wallet(Keypair.fromSecretKey(key));
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    anchor.setProvider(provider);
    return provider;
}

export function getProgram(provider: anchor.AnchorProvider): anchor.Program<any> {
    const pid = process.env.PROGRAM_ID;
    if (!pid) throw new Error('PROGRAM_ID missing');
    const programId = new PublicKey(pid);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const idl = require('../../target/idl/sharely_contract.json');
    return new anchor.Program(idl as anchor.Idl, provider) as unknown as anchor.Program<any>;
}

export function asPubkey(s: string): PublicKey {
    return new PublicKey(s);
}


