import * as anchor from '@coral-xyz/anchor';
import { getAdminProvider, getProgram, asPubkey } from '../admin/common';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from '@solana/spl-token';

const QUEST = process.env.QUEST_PUBKEY || '';
const DESTINATION_ATA = process.env.DESTINATION_ATA || '';

(async () => {
    const provider = getAdminProvider();
    const program = getProgram(provider);

    const quest = asPubkey(QUEST);

    // 获取 quest 账户信息以确定 vault 和 mint
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const questAccount = await (program.account as any)["questAccount"].fetch(quest);
    const vault = questAccount.vault;
    const mint = questAccount.mint;

    // 如果未指定目标 ATA，则使用管理员钱包的 ATA
    const MERCHANT_PUBKEY = process.env.MERCHANT_PUBKEY || '';
    const merchant = asPubkey(MERCHANT_PUBKEY);
    let destinationAta = await getAssociatedTokenAddress(mint, merchant, true);
    console.log('destinationAta=', destinationAta.toBase58());


    // 取消 Quest 并把剩余资金转走（需要是 quest 的管理员）
    // merchant_ata 从 quest 账户中获取 merchant 地址计算
    await (program.methods as any)
        .cancelQuest()
        .accounts({
            admin: provider.wallet.publicKey, // 管理员签名
            quest,
            vaultAuthority: questAccount.vaultAuthority,
            vault,
            merchantAta: destinationAta,
            tokenProgram: TOKEN_PROGRAM_ID,
        } as any)
        .rpc();
    console.log('Quest cancelled');
    console.log('Remaining funds transferred to:', destinationAta.toBase58());
})();


