import { getAdminProvider, getProgram, asPubkey } from './common';
import * as anchor from '@coral-xyz/anchor';

const QUEST = process.env.QUEST_PUBKEY || '';

(async () => {
    const provider = getAdminProvider();
    const program = getProgram(provider);

    if (!QUEST) {
        console.log('请设置 QUEST_PUBKEY 环境变量');
        return;
    }

    const PROGRAM_ID = process.env.PROGRAM_ID || '';
    const quest = asPubkey(QUEST);
    const [config] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        asPubkey(PROGRAM_ID)
    );
    try {
        await (program.methods as any)
            .pauseQuest()
            .accounts({
                admin: provider.wallet.publicKey,
                quest,
                config: config,
            } as any)
            .rpc();
        console.log('Quest paused');
    } catch (error) {
        console.error('操作失败:', error);
    }
})();


