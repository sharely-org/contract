import * as anchor from '@coral-xyz/anchor';
import { getAdminProvider, getProgram, asPubkey } from './common';

const QUEST = process.env.QUEST_PUBKEY || '';

(async () => {
    const provider = getAdminProvider();
    const program = getProgram(provider);

    if (!QUEST) {
        console.log('请设置 QUEST_PUBKEY 环境变量');
        return;
    }

    const quest = asPubkey(QUEST);

    try {
        // 获取 quest 状态（使用中括号访问以绕过 TS 对动态键的限制）
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const questAccount = await (program.account as any)["questAccount"].fetch(quest);
        console.log('Quest 状态:', {
            questId: questAccount.questId.toString(),
            status: questAccount.status,
            startAt: new Date(questAccount.startAt.toNumber() * 1000).toISOString(),
            endAt: new Date(questAccount.endAt.toNumber() * 1000).toISOString(),
            totalAmount: questAccount.totalAmount.toString(),
            fundedAmount: questAccount.fundedAmount.toString(),
            claimedTotal: questAccount.claimedTotal.toString(),
            merchant: questAccount.merchant.toBase58(),
            admin: questAccount.admin.toBase58(),
        });

    } catch (error) {
        console.error('操作失败:', error);
    }
})();



