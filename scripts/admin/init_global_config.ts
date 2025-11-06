import * as anchor from '@coral-xyz/anchor';
import { getAdminProvider, getProgram, asPubkey } from './common';

const TREASURY = process.env.TREASURY_PUBKEY || '';

(async () => {
    const provider = getAdminProvider();
    const program = getProgram(provider);

    if (!TREASURY) {
        console.error('请设置 TREASURY_PUBKEY 环境变量');
        console.error('示例: TREASURY_PUBKEY=YourTreasuryPublicKeyHere');
        process.exit(1);
    }

    const treasury = asPubkey(TREASURY);

    // 派生 global_config PDA
    const [globalConfig] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('global_config')],
        program.programId
    );

    console.log('初始化全局配置...');
    console.log('Admin:', provider.wallet.publicKey.toBase58());
    console.log('Treasury:', treasury.toBase58());
    console.log('Global Config PDA:', globalConfig.toBase58());

    try {
        const tx = await (program.methods as any)
            .initializeGlobalConfig(treasury)
            .accounts({
                admin: provider.wallet.publicKey,
                globalConfig,
                systemProgram: anchor.web3.SystemProgram.programId,
            } as any)
            .rpc();

        console.log('✅ 全局配置初始化成功!');
        console.log('交易签名:', tx);
        console.log('Global Config 地址:', globalConfig.toBase58());
    } catch (error) {
        console.error('❌ 初始化失败:', error);
        if ((error as any).logs) {
            console.error('错误日志:', (error as any).logs);
        }
        process.exit(1);
    }
})();
