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

    const message = bs58.decode(process.env.MESSAGE_BASE58 || '');
    const signature = bs58.decode(process.env.SIGNATURE_BASE58 || '');

    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(merchantKp), { commitment: 'confirmed' });
    anchor.setProvider(provider);
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const idl = require('../../target/idl/sharely_contract.json');

    // 显式使用实际部署的 Program Id（避免 IDL.address 不一致）
    const program = new anchor.Program(idl as anchor.Idl, provider);

    console.log('program.programId=', program.programId.toBase58());
    console.log('programId=', programId);
    console.log('merchantKp.publicKey=', merchantKp.publicKey.toBase58());
    console.log('adminPubkey=', adminPubkey.toBase58());
    console.log('mint=', mint.toBase58());
    console.log('questId=', questId);
    console.log('totalAmount=', totalAmount.toString());
    console.log('message=', message);
    console.log('signature=', signature);
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
    const vault = getAssociatedTokenAddressSync(mint, vaultAuthority, true);

    // Merchant source ATA
    const merchantAta = getAssociatedTokenAddressSync(mint, merchantKp.publicKey, true);

    // 1) ed25519 verify instruction
    const ed25519Ix = Ed25519Program.createInstructionWithPublicKey({
        publicKey: adminPubkey.toBytes(),
        message,
        signature,
    });
    const PROGRAM_ID = process.env.PROGRAM_ID || '';
    console.log('PROGRAM_ID=', PROGRAM_ID);
    const [config] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        new anchor.web3.PublicKey(PROGRAM_ID)
    );

    // 2) program instruction
    const ix2 = await program.methods
        .initializeQuestByMerchant(new anchor.BN(questId), totalAmount, Buffer.from(message))
        .accounts({
            merchant: merchantKp.publicKey,
            merchantSourceAta: merchantAta,
            quest,
            mint,
            vaultAuthority,
            vault,
            instructions: anchor.web3.SYSVAR_INSTRUCTIONS_PUBKEY,
            systemProgram: anchor.web3.SystemProgram.programId,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
            config: config,
        })
        .instruction();

    const tx = new Transaction().add(ed25519Ix, ix2);
    tx.feePayer = merchantKp.publicKey;
    tx.recentBlockhash = (await connection.getLatestBlockhash('confirmed')).blockhash;
    tx.sign(merchantKp);
    console.log('tx =', tx);
    try {
        const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
        console.log('tx =', sig);
    } catch (error) {
        console.error('error =', error);
    }
})();
