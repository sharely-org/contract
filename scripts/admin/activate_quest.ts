import * as anchor from '@coral-xyz/anchor';
import { getAdminProvider, getProgram, asPubkey } from './common';
import dotenv from 'dotenv';
import { Connection, Keypair } from '@solana/web3.js';

dotenv.config();

const MERKLE_ROOT_HEX = process.env.MERKLE_ROOT_HEX || '';
const USER_COUNT = Number(process.env.USER_COUNT || '1000');

function hexTo32(hex: string): number[] {
    const b = Buffer.from(hex, 'hex');
    if (b.length !== 32) throw new Error('invalid root');
    return [...b];
}

function parseSecret(json: string | undefined): Uint8Array {
    if (!json) throw new Error('missing USER_SECRET_JSON');
    return new Uint8Array(JSON.parse(json));
}


(async () => {
    // const provider = getAdminProvider();
    const url = process.env.RPC_URL || 'http://127.0.0.1:8899';
    const connection = new Connection(url, 'confirmed');
    console.log('ADMIN_SECRET_JSON=', process.env.ADMIN_SECRET_JSON);
    const adminKp = Keypair.fromSecretKey(parseSecret(process.env.ADMIN_SECRET_JSON));

    const admin = adminKp.publicKey;
    const questId = Number(process.env.QUEST_ID || '0');


    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(adminKp), { commitment: 'confirmed' });
    anchor.setProvider(provider);
    const idl = require('../../target/idl/sharely_contract.json');

    const program = new anchor.Program(idl as anchor.Idl, provider);

    // 派生 quest 账户（与合约保持一致）
    const questIdLe = new Uint8Array(8);
    new DataView(questIdLe.buffer).setBigUint64(0, BigInt(questId), true);
    const [quest] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('quest'), Buffer.from(questIdLe)],
        program.programId
    );

    console.log('USER_COUNT=', USER_COUNT, typeof USER_COUNT);
    // 计算位图大小
    const bitmap_size = Math.ceil(USER_COUNT / 8);
    console.log(`Setting Merkle root and creating bitmap for ${USER_COUNT} users (${bitmap_size} bytes)`);


    // 构建位图账户（使用 quest pubkey 作为 seed）
    const [bitmapShard, bitmapBump] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('bitmap'), quest.toBytes()],
        program.programId
    );

    // 设置 Merkle root 并同时创建位图
    // 避免 TS 深层类型推断问题
    console.log('quest =', quest.toBase58());
    console.log('bitmapShard =', bitmapShard.toBase58());
    console.log('USER_COUNT before send:', USER_COUNT, 'type:', typeof USER_COUNT);
    console.log('MERKLE_ROOT_HEX:', MERKLE_ROOT_HEX, 'length:', MERKLE_ROOT_HEX.length);

    if (!MERKLE_ROOT_HEX || MERKLE_ROOT_HEX.length !== 64) {
        console.error('MERKLE_ROOT_HEX must be 64 hex characters (32 bytes)');
        process.exit(1);
    }

    const start_at = Math.floor(Date.now() / 1000);
    const end_at = start_at + 3600 * 24 * 1;
    const fee_amount = 10000000;
    console.log('start_at =', start_at);
    console.log('end_at =', end_at);
    console.log('fee_amount =', fee_amount);
    const tx = await program.methods
        .activateQuest(
            hexTo32(MERKLE_ROOT_HEX),
            USER_COUNT,
            new anchor.BN(start_at),
            new anchor.BN(end_at),
            new anchor.BN(fee_amount)
        )
        .accounts({ admin, quest, bitmapShard, systemProgram: anchor.web3.SystemProgram.programId })
        .rpc();

    console.log('Quest activated');
    console.log('Admin =', admin.toBase58());
})();


