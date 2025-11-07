import * as anchor from '@coral-xyz/anchor';
import { getMerchantProvider, getProgram, asPubkey } from '../admin/common';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';

const QUEST = process.env.QUEST_PUBKEY || '';
const DESTINATION_ATA = process.env.DESTINATION_ATA || '';

(async () => {
    const provider = getMerchantProvider();
    const program = getProgram(provider);

    if (!QUEST) {
        console.error('请设置 QUEST_PUBKEY 环境变量');
        process.exit(1);
    }

    const quest = asPubkey(QUEST);

    // 获取 quest 账户信息以确定 vault 和 mint
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const questAccount = await (program.account as any)["questAccount"].fetch(quest);
    const vault = questAccount.vault;
    const mint = questAccount.mint;

    // 派生 global_config PDA
    const [globalConfig] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        program.programId
    );

    // 读取全局配置获取 treasury 地址
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globalConfigAccount = await (program.account as any).config.fetch(globalConfig);
    const treasury = globalConfigAccount.treasury;

    // 计算 treasury_ata (treasury 的 ATA)
    const treasuryAta = await getAssociatedTokenAddress(mint, treasury, true);

    // 如果未指定目标 ATA，则使用商户钱包的 ATA
    let destinationAta;
    if (DESTINATION_ATA) {
        destinationAta = asPubkey(DESTINATION_ATA);
    } else {
        console.log('Using merchant ATA as destination ATA');
        const MERCHANT_PUBKEY = process.env.MERCHANT_PUBKEY || '';
        const merchant = asPubkey(MERCHANT_PUBKEY);
        destinationAta = await getAssociatedTokenAddress(mint, merchant, true);
    }

    console.log('关闭 Quest 信息:');
    console.log('Quest:', quest.toBase58());
    console.log('Merchant:', provider.wallet.publicKey.toBase58());
    console.log('Treasury:', treasury.toBase58());
    console.log('Treasury ATA:', treasuryAta.toBase58());
    console.log('Destination ATA:', destinationAta.toBase58());

    // 关闭 Quest 并把剩余资金转走（需要是 quest 的商户）
    try {
        const tx = await (program.methods as any)
            .closeQuestByMerchant()
            .accounts({
                merchant: provider.wallet.publicKey, // merchant签名
                quest,
                vaultAuthority: questAccount.vaultAuthority,
                vault,
                destinationAta,
                globalConfig,
                treasuryAta,
                treasuryAuthority: treasury,
                tokenProgram: TOKEN_PROGRAM_ID,
            } as any)
            .rpc();

        console.log('✅ Quest closed successfully');
        console.log('交易签名:', tx);
        console.log('Remaining funds transferred to:', destinationAta.toBase58());
    } catch (error) {
        console.error('❌ 关闭 Quest 失败:', error);
        if ((error as any).logs) {
            console.error('错误日志:', (error as any).logs);
        }
        process.exit(1);
    }
})();


