import dotenv from 'dotenv';
import * as anchor from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey, Ed25519Program, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from '@solana/spl-token';

dotenv.config();

function parseSecret(json: string | undefined): Uint8Array {
    if (!json) throw new Error('missing USER_SECRET_JSON');
    return new Uint8Array(JSON.parse(json));
}

(async () => {
    const url = process.env.RPC_URL || 'http://127.0.0.1:8899';
    const connection = new Connection(url, 'confirmed');
    const merchantKp = Keypair.fromSecretKey(parseSecret(process.env.MERCHANT_SECRET_JSON));
    const adminPubkey = new PublicKey(process.env.ADMIN_PUBKEY || '');
    const programId = new PublicKey(process.env.PROGRAM_ID || '');
    const mint = new PublicKey(process.env.MINT_PUBKEY || '');

    const questId = Number(process.env.QUEST_ID || '0');
    const totalAmount = new anchor.BN(process.env.TOTAL_AMOUNT || '0');
    const startAt = Number(process.env.START_AT || '0');
    const endAt = Number(process.env.END_AT || '0');

    const message = bs58.decode(process.env.MESSAGE_BASE58 || '');
    const signature = bs58.decode(process.env.SIGNATURE_BASE58 || '');

    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(merchantKp), { commitment: 'confirmed' });
    anchor.setProvider(provider);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const idl = require('../../target/idl/sharely_contract.json');

    // 显式使用实际部署的 Program Id（避免 IDL.address 不一致）
    const program = new anchor.Program(idl as anchor.Idl, provider);

    // Derive PDAs（quest_id 使用小端 LE 字节，与 on-chain to_le_bytes 对齐）
    const questIdLe = new Uint8Array(8);
    new DataView(questIdLe.buffer).setBigUint64(0, BigInt(questId), true);
    const [quest] = PublicKey.findProgramAddressSync([
        Buffer.from('quest'),
        Buffer.from(questIdLe),
    ], program.programId);
    console.log('quest=', quest.toBase58())
    const [vaultAuthority] = PublicKey.findProgramAddressSync([
        Buffer.from('vault_auth'),
        quest.toBuffer(),
    ], program.programId);
    console.log('vaultAuthority=', vaultAuthority.toBase58())
    const vault = getAssociatedTokenAddressSync(mint, vaultAuthority, true);
    console.log('vault=', vault.toBase58())
    // Merchant source ATA
    const merchantAta = getAssociatedTokenAddressSync(mint, merchantKp.publicKey, true);
    console.log('merchantAta=', merchantAta.toBase58())


})();
