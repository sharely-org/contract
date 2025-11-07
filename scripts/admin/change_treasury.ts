import * as anchor from '@coral-xyz/anchor';
import { getAdminProvider, getProgram, asPubkey } from './common';

const NEW_TREASURY = process.env.NEW_TREASURY_PUBKEY || '';

(async () => {
    const provider = getAdminProvider();
    const program = getProgram(provider);

    if (!NEW_TREASURY) {
        console.error('请设置 NEW_TREASURY_PUBKEY 环境变量');
        console.error('示例: NEW_TREASURY_PUBKEY=YourNewTreasuryPublicKeyHere');
        process.exit(1);
    }

    const newTreasury = asPubkey(NEW_TREASURY);

    // 派生 config PDA
    const [config] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        program.programId
    );

    // 先读取当前配置（可选，用于显示对比）
    try {
        const currentConfig = await (program.account as any).config.fetch(config);
        console.log('当前 Treasury 地址:', currentConfig.treasury.toBase58());
    } catch (error) {
        console.warn('⚠️  无法读取当前配置，可能尚未初始化');
        console.warn('请先运行 init_global_config.ts 初始化全局配置');
    }

    console.log('更改 Treasury 地址...');
    console.log('Admin:', provider.wallet.publicKey.toBase58());
    console.log('新 Treasury:', newTreasury.toBase58());
    console.log('Config PDA:', config.toBase58());

    try {
        const tx = await (program.methods as any)
            .updateTreasury(newTreasury)
            .accounts({
                admin: provider.wallet.publicKey,
                config: config,
            } as any)
            .rpc();

        console.log('✅ Treasury 地址更改成功!');
        console.log('交易签名:', tx);
        console.log('新 Treasury 地址:', newTreasury.toBase58());

        // 验证更新后的配置
        const updatedConfig = await (program.account as any).config.fetch(config);
        console.log('验证: 更新后的 Treasury 地址:', updatedConfig.treasury.toBase58());
    } catch (error) {
        console.error('❌ 更改失败:', error);
        if ((error as any).logs) {
            console.error('错误日志:', (error as any).logs);
        }
        process.exit(1);
    }
})();

