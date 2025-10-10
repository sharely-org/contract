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
        await (program.methods as any)
            .resumeQuest()
            .accounts({
                admin: provider.wallet.publicKey,
                quest,
            } as any)
            .rpc();
        console.log('Quest resumed');
    } catch (error) {
        console.error('操作失败:', error);
    }
})();


