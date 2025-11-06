import * as anchor from '@coral-xyz/anchor';
import { getAdminProvider, getProgram, asPubkey } from './common';

const TREASURY = process.env.TREASURY_PUBKEY || '';

(async () => {
    const provider = getAdminProvider();
    const program = getProgram(provider);

    if (!TREASURY) {
        console.error('请设置 TREASURY_PUBKEY 环境变量');
        console.error('示例: TREASURY_PUBKEY=YourNewTreasuryPublicKeyHere');
        process.exit(1);
    }

    const newTreasury = asPubkey(TREASURY);

    // 派生 global_config PDA
    const [globalConfig] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('global_config')],
        program.programId
    );

    // 先读取当前配置（可选，用于显示对比）
    try {
        const currentConfig = await (program.account as any).globalConfig.fetch(globalConfig);
        console.log('当前 Treasury 地址:', currentConfig.treasury.toBase58());
    } catch (error) {
        console.warn('⚠️  无法读取当前配置，可能尚未初始化');
        console.warn('请先运行 init_global_config.ts 初始化全局配置');
    }

    console.log('更新 Treasury 地址...');
    console.log('Admin:', provider.wallet.publicKey.toBase58());
    console.log('新 Treasury:', newTreasury.toBase58());
    console.log('Global Config PDA:', globalConfig.toBase58());

    try {
        const tx = await (program.methods as any)
            .updateTreasury(newTreasury)
            .accounts({
                admin: provider.wallet.publicKey,
                globalConfig,
            } as any)
            .rpc();

        console.log('✅ Treasury 地址更新成功!');
        console.log('交易签名:', tx);
        console.log('新 Treasury 地址:', newTreasury.toBase58());

        // 验证更新后的配置
        const updatedConfig = await (program.account as any).globalConfig.fetch(globalConfig);
        console.log('验证: 更新后的 Treasury 地址:', updatedConfig.treasury.toBase58());
    } catch (error) {
        console.error('❌ 更新失败:', error);
        if ((error as any).logs) {
            console.error('错误日志:', (error as any).logs);
        }
        process.exit(1);
    }
})();
