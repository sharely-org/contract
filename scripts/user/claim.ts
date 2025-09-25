import 'dotenv/config';
import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Connection, Keypair } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';
import { hexTo32ByteArray } from '../../utils/merkle';

(async () => {
    const connection = new Connection(process.env.RPC_URL || 'http://127.0.0.1:8899', 'confirmed');

    // 从环境变量读取用户私钥
    const secret = new Uint8Array(JSON.parse(process.env.USER_SECRET_JSON || '[]'));
    const wallet = new anchor.Wallet(Keypair.fromSecretKey(secret));
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

    // 获取 quest 账户信息
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const questAccount = await (program.account as any)["questAccount"].fetch(quest);
    const vault = questAccount.vault;

    // 1) 查询是否已领取
    const claimed = await program.methods
        .isClaimed(new anchor.BN(index))
        .accounts({ quest, bitmapShard, user })
        .view();
    console.log('isClaimed =', claimed);
    if (claimed) return;

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
            bitmapShard,
            tokenProgram: TOKEN_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        })
        .rpc();

    console.log('claim tx sent');
})();


