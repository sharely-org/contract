import * as anchor from '@coral-xyz/anchor';
import { getAdminProvider, getProgram, asPubkey } from './common';

const NEW_ADMIN = process.env.NEW_ADMIN_PUBKEY || '';

(async () => {
    const provider = getAdminProvider();
    const program = getProgram(provider);

    if (!NEW_ADMIN) {
        console.error('请设置 NEW_ADMIN_PUBKEY 环境变量');
        console.error('示例: NEW_ADMIN_PUBKEY=YourNewAdminPublicKeyHere');
        process.exit(1);
    }

    const newAdmin = asPubkey(NEW_ADMIN);

    // 派生 config PDA
    const [config] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('config')],
        program.programId
    );

    // 先读取当前配置（可选，用于显示对比）
    try {
        const currentConfig = await (program.account as any).config.fetch(config);
        console.log('当前 Admin 地址:', currentConfig.admin.toBase58());
    } catch (error) {
        console.warn('⚠️  无法读取当前配置，可能尚未初始化');
        console.warn('请先运行 init_global_config.ts 初始化全局配置');
    }

    console.log('更改 Admin 地址...');
    console.log('当前 Signer:', provider.wallet.publicKey.toBase58());
    console.log('新 Admin:', newAdmin.toBase58());
    console.log('Config PDA:', config.toBase58());

    try {
        const tx = await (program.methods as any)
            .changeAdmin(newAdmin)
            .accounts({
                signer: provider.wallet.publicKey,
                config: config,
            } as any)
            .rpc();

        console.log('✅ Admin 地址更改成功!');
        console.log('交易签名:', tx);
        console.log('新 Admin 地址:', newAdmin.toBase58());

        // 验证更新后的配置
        const updatedConfig = await (program.account as any).config.fetch(config);
        console.log('验证: 更新后的 Admin 地址:', updatedConfig.admin.toBase58());
    } catch (error) {
        console.error('❌ 更改失败:', error);
        if ((error as any).logs) {
            console.error('错误日志:', (error as any).logs);
        }
        process.exit(1);
    }
})();

