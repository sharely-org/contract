import * as anchor from '@coral-xyz/anchor';
import { getAdminProvider, getProgram, asPubkey } from './common';

const QUEST = process.env.QUEST_PUBKEY || '';
const NEW_ROOT_HEX = process.env.NEW_ROOT_HEX || '';
const USER_COUNT = Number(process.env.USER_COUNT || '1000');

function hexTo32(hex: string): number[] {
    const b = Buffer.from(hex, 'hex');
    if (b.length !== 32) throw new Error('invalid root');
    return [...b];
}

(async () => {
    const provider = getAdminProvider();
    const program = getProgram(provider);

    const admin = provider.wallet.publicKey;
    const quest = asPubkey(QUEST);

    // 计算位图大小
    const bitmap_size = Math.ceil(USER_COUNT / 8);
    console.log(`Setting Merkle root and creating bitmap for ${USER_COUNT} users (${bitmap_size} bytes)`);

    // 构建位图账户
    const [bitmapShard] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from('bitmap'), quest.toBuffer()],
        program.programId
    );

    // 设置 Merkle root 并同时创建位图
    // 避免 TS 深层类型推断问题
    await (program.methods as any)
        .setMerkleRoot(hexTo32(NEW_ROOT_HEX) as any, USER_COUNT)
        .accounts({ admin, quest, bitmapShard } as any)
        .rpc();

    console.log('Merkle root set and bitmap initialized');
    console.log('Admin =', admin.toBase58());
    console.log('User count =', USER_COUNT);
    console.log('Bitmap size =', bitmap_size, 'bytes');
})();


