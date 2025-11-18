import 'dotenv/config';
import * as anchor from '@coral-xyz/anchor';
import bs58 from 'bs58';

import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { hexTo32ByteArray } from '../../utils/merkle';

(async () => {
    const connection = new Connection(process.env.RPC_URL || 'http://127.0.0.1:8899', 'confirmed');

    // 从环境变量读取用户私钥
    var secret = new Uint8Array(JSON.parse(process.env.USER_SECRET_JSON || '[]'));
    if (secret.length === 0) {
        const privateKey = process.env.USER_PRIVATE_KEY || '';
        if (privateKey.length > 0) {
            const privateKeyBytes = bs58.decode(privateKey);
            secret = new Uint8Array(privateKeyBytes);
        }
    }
    const wallet = new anchor.Wallet(Keypair.fromSecretKey(secret));
    console.log('wallet =', wallet.publicKey.toString());
    const provider = new anchor.AnchorProvider(connection, wallet, {
        commitment: 'confirmed',
    });
    anchor.setProvider(provider);

    // 替换为你的程序ID与IDL
    const programId = new PublicKey(process.env.PROGRAM_ID || '');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const idl = require('../../target/idl/sharely_contract.json');
    const program = new anchor.Program(idl as anchor.Idl, provider);

    // 这些参数应来自你的后端
    const quest = new PublicKey(process.env.QUEST_PUBKEY || '');
    const mint = new PublicKey(process.env.MINT_PUBKEY || '');
    const index = Number(process.env.INDEX || '0');
    const amount = new anchor.BN(process.env.AMOUNT || '0');
    const proofHex: string[] = JSON.parse(process.env.PROOF_JSON || '[]');
    const proof: number[][] = proofHex.map(hexTo32ByteArray);

    const user = wallet.publicKey;

    const [bitmapShard] = PublicKey.findProgramAddressSync(
        [Buffer.from('bitmap'), quest.toBuffer()],
        program.programId
    );

    // 验证 quest 账户是否存在
    const questInfo = await connection.getAccountInfo(quest);
    if (!questInfo) {
        console.error(`Error: quest account not found at ${quest.toString()}`);
        process.exit(1);
    }
    console.log('quest account exists, owner:', questInfo.owner.toString());

    // 获取 quest 账户信息
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const questAccount = await (program.account as any)["questAccount"].fetch(quest);
    const vault = questAccount.vault;
    console.log('quest account data fetched successfully, vault:', vault.toString());

    // 检查 bitmapShard 账户是否存在（需要通过 activate_quest 初始化）
    const bitmapShardInfo = await connection.getAccountInfo(bitmapShard);
    if (!bitmapShardInfo) {
        console.error(`Error: bitmapShard account not found at ${bitmapShard.toString()}`);
        console.error('This quest may not have been activated yet. Please run activate_quest first.');
        process.exit(1);
    }
    console.log('bitmapShardInfo =', bitmapShardInfo);
    console.log('bitmapShard owner:', bitmapShardInfo.owner.toString());
    console.log('programId:', program.programId.toString());

    // 验证账户所有者
    if (!bitmapShardInfo.owner.equals(program.programId)) {
        console.error(`Error: bitmapShard owner mismatch. Expected ${program.programId.toString()}, got ${bitmapShardInfo.owner.toString()}`);
        process.exit(1);
    }

    // 1) 查询是否已领取
    try {
        const claimed = await program.methods
            .isClaimed(new anchor.BN(index))
            .accounts({ quest, bitmapShard, user })
            .view();
        console.log('isClaimed =', claimed);
        if (claimed) return;
    } catch (err: any) {
        console.error('Error calling isClaimed:', err);
        if (err.simulationResponse) {
            console.error('Simulation error:', err.simulationResponse.err);
            console.error('Simulation logs:', err.simulationResponse.logs);
        }
        throw err;
    }

    // 2) 资格验证（只读）
    const eligible = await program.methods
        .verifyEligibility(new anchor.BN(index), amount, proof)
        .accounts({ quest, user })
        .view();
    console.log('isEligible =', eligible);
    if (!eligible) return;

    // 3) 领取
    const [vaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('vault_auth'), quest.toBuffer()],
        program.programId
    );
    const userAta = await getAssociatedTokenAddress(mint, user, true);

    await program.methods
        .claim(new anchor.BN(index), amount, proof)
        .accounts({
            user,
            quest,
            vaultAuthority,
            vault,
            userAta,
            mint,
            bitmapShard,
            tokenProgram: TOKEN_PROGRAM_ID,
            associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

    console.log('claim tx sent');
})();


