import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

interface QuestDetails {
    quest: string;
    questId: number;
    status: string;
    isStarted: boolean;
    startAt: number;
    endAt: number;
    totalAmount: number;
    fundedAmount: number;
    claimedTotal: number;
    merchant: string;
    admin: string;
    mint: string;
    vault: string;
    vaultAuthority: string;
    merkleRoot: string;
    version: number;
    createdAt: number;
    updatedAt: number;
}

class QuestFetcher {
    private connection: Connection;
    private programId: PublicKey;

    constructor() {
        this.connection = new Connection(
            process.env.RPC_URL || 'https://api.devnet.solana.com',
            'confirmed'
        );
        this.programId = new PublicKey(process.env.PROGRAM_ID || '4iVesyfBbYHSwKKZKcNzRs1xqe1TnRJdCAcVrRwwpBbo');
    }

    /**
     * 获取 Quest 详细信息
     */
    async fetchQuestDetails(questPubkey: PublicKey): Promise<QuestDetails | null> {
        try {
            console.log(`🔍 获取 Quest 详细信息: ${questPubkey.toBase58()}`);

            // 获取 Quest 账户数据
            const accountInfo = await this.connection.getAccountInfo(questPubkey);
            if (!accountInfo) {
                console.log('❌ Quest 账户不存在');
                return null;
            }

            // 解析 Quest 账户数据
            const questData = this.parseQuestAccount(accountInfo.data);
            if (!questData) {
                console.log('❌ 解析 Quest 账户数据失败');
                return null;
            }

            // 获取 ClaimBitmapShard 信息
            const bitmapInfo = await this.getBitmapInfo(questPubkey);

            // 获取 Merkle Root 信息
            const merkleInfo = await this.getMerkleInfo(questPubkey);

            const questDetails: QuestDetails = {
                quest: questPubkey.toBase58(),
                questId: questData.questId,
                status: this.getStatusString(questData.status),
                isStarted: questData.isStarted,
                startAt: questData.startAt,
                endAt: questData.endAt,
                totalAmount: questData.totalAmount,
                fundedAmount: questData.fundedAmount, // 使用 QuestAccount 中的 fundedAmount
                claimedTotal: questData.claimedTotal,
                merchant: questData.merchant,
                admin: questData.admin,
                mint: questData.mint,
                vault: questData.vault,
                vaultAuthority: questData.vaultAuthority,
                merkleRoot: questData.merkleRoot, // 使用 QuestAccount 中的 merkleRoot
                version: questData.version,
                createdAt: questData.createdAt,
                updatedAt: questData.updatedAt
            };

            return questDetails;

        } catch (error) {
            console.error('❌ 获取 Quest 详细信息失败:', error);
            return null;
        }
    }

    /**
     * 手动解析 QuestAccount 数据
     */
    private parseQuestAccount(data: Buffer): any | null {
        try {
            // QuestAccount 结构（根据 lib.rs）：
            // discriminator (8) + quest_id (8) + mint (32) + vault (32) + 
            // vault_authority (32) + merkle_root (32) + claimed_total (8) + 
            // status (1) + version (4) + merchant (32) + admin (32) + 
            // start_at (8) + end_at (8) + total_amount (8) + funded_amount (8)

            if (data.length < 200) {
                console.warn(`Quest 账户数据长度不足: ${data.length} < 200`);
                return null;
            }

            let offset = 8; // 跳过 discriminator

            const questId = data.readBigUInt64LE(offset);
            offset += 8;

            const mint = new PublicKey(data.subarray(offset, offset + 32));
            offset += 32;

            const vault = new PublicKey(data.subarray(offset, offset + 32));
            offset += 32;

            const vaultAuthority = new PublicKey(data.subarray(offset, offset + 32));
            offset += 32;

            const merkleRoot = data.subarray(offset, offset + 32);
            offset += 32;

            const claimedTotal = data.readBigUInt64LE(offset);
            offset += 8;

            const status = data.readUInt8(offset);
            offset += 1;

            const version = data.readUInt32LE(offset);
            offset += 4;

            const merchant = new PublicKey(data.subarray(offset, offset + 32));
            offset += 32;

            const admin = new PublicKey(data.subarray(offset, offset + 32));
            offset += 32;

            const startAt = data.readBigInt64LE(offset);
            offset += 8;

            const endAt = data.readBigInt64LE(offset);
            offset += 8;

            const totalAmount = data.readBigUInt64LE(offset);
            offset += 8;

            const fundedAmount = data.readBigUInt64LE(offset);

            // 计算是否已开始（基于当前时间）
            const now = Math.floor(Date.now() / 1000);
            const isStarted = now >= Number(startAt);

            return {
                questId: Number(questId),
                status,
                isStarted,
                startAt: Number(startAt),
                endAt: Number(endAt),
                totalAmount: Number(totalAmount),
                fundedAmount: Number(fundedAmount),
                claimedTotal: Number(claimedTotal),
                merchant: merchant.toBase58(),
                admin: admin.toBase58(),
                mint: mint.toBase58(),
                vault: vault.toBase58(),
                vaultAuthority: vaultAuthority.toBase58(),
                merkleRoot: Buffer.from(merkleRoot).toString('hex'),
                version,
                createdAt: 0, // 这个字段在 QuestAccount 中不存在
                updatedAt: 0  // 这个字段在 QuestAccount 中不存在
            };

        } catch (error) {
            console.error('解析 Quest 账户数据失败:', error);
            return null;
        }
    }

    /**
     * 获取 Vault 余额
     */
    private async getVaultBalance(vaultPubkey: string): Promise<number> {
        try {
            const vault = new PublicKey(vaultPubkey);
            const accountInfo = await this.connection.getAccountInfo(vault);
            if (!accountInfo) {
                return 0;
            }
            return accountInfo.lamports;
        } catch (error) {
            console.warn('获取 Vault 余额失败:', error);
            return 0;
        }
    }

    /**
     * 获取位图信息
     */
    private async getBitmapInfo(questPubkey: PublicKey): Promise<any | null> {
        try {
            // 计算 ClaimBitmapShard PDA
            const [bitmapShard] = PublicKey.findProgramAddressSync(
                [Buffer.from('bitmap'), questPubkey.toBuffer()],
                this.programId
            );

            const accountInfo = await this.connection.getAccountInfo(bitmapShard);
            if (!accountInfo) {
                return null;
            }

            // 解析位图数据
            const data = accountInfo.data;
            let offset = 8; // 跳过 discriminator

            const quest = new PublicKey(data.subarray(offset, offset + 32));
            offset += 32;

            const version = data.readUInt32LE(offset);
            offset += 4;

            const userCount = data.readUInt32LE(offset);
            offset += 4;

            const bitmapSize = data.readUInt32LE(offset);
            offset += 4;

            const bits = data.subarray(offset, offset + bitmapSize);

            return {
                quest: quest.toBase58(),
                version,
                userCount,
                bitmapSize,
                bits: Buffer.from(bits).toString('hex')
            };

        } catch (error) {
            console.warn('获取位图信息失败:', error);
            return null;
        }
    }

    /**
     * 获取 Merkle Root 信息
     */
    private async getMerkleInfo(questPubkey: PublicKey): Promise<any | null> {
        try {
            // 计算 MerkleRoot PDA
            const [merkleRoot] = PublicKey.findProgramAddressSync(
                [Buffer.from('merkle_root'), questPubkey.toBuffer()],
                this.programId
            );

            const accountInfo = await this.connection.getAccountInfo(merkleRoot);
            if (!accountInfo) {
                return null;
            }

            // 解析 Merkle Root 数据
            const data = accountInfo.data;
            let offset = 8; // 跳过 discriminator

            const quest = new PublicKey(data.subarray(offset, offset + 32));
            offset += 32;

            const version = data.readUInt32LE(offset);
            offset += 4;

            const merkleRootBytes = data.subarray(offset, offset + 32);

            return {
                quest: quest.toBase58(),
                version,
                merkleRoot: Buffer.from(merkleRootBytes).toString('hex')
            };

        } catch (error) {
            console.warn('获取 Merkle Root 信息失败:', error);
            return null;
        }
    }

    /**
     * 获取状态字符串
     */
    private getStatusString(status: number): string {
        const statusMap = {
            0: 'Active',
            1: 'Paused',
            2: 'Ended'
        };
        return statusMap[status as keyof typeof statusMap] || 'Unknown';
    }

    /**
     * 显示 Quest 详细信息
     */
    displayQuestDetails(details: QuestDetails): void {
        console.log('\n📋 Quest 详细信息:');
        console.log('='.repeat(80));

        console.log(`Quest ID: ${details.questId}`);
        console.log(`Quest 地址: ${details.quest}`);
        console.log(`状态: ${details.status}`);
        console.log(`是否已开始: ${details.isStarted ? '是' : '否'}`);
        console.log(`开始时间: ${new Date(details.startAt * 1000).toLocaleString()}`);
        console.log(`结束时间: ${new Date(details.endAt * 1000).toLocaleString()}`);
        console.log(`总金额: ${details.totalAmount}`);
        console.log(`已注入金额: ${details.fundedAmount}`);
        console.log(`已领取金额: ${details.claimedTotal}`);
        console.log(`剩余金额: ${details.fundedAmount - details.claimedTotal}`);
        console.log(`商户地址: ${details.merchant}`);
        console.log(`管理员地址: ${details.admin}`);
        console.log(`代币地址: ${details.mint}`);
        console.log(`金库地址: ${details.vault}`);
        console.log(`金库权限: ${details.vaultAuthority}`);
        console.log(`Merkle Root: ${details.merkleRoot}`);
        console.log(`版本: ${details.version}`);
        if (details.createdAt > 0) {
            console.log(`创建时间: ${new Date(details.createdAt * 1000).toLocaleString()}`);
        }
        if (details.updatedAt > 0) {
            console.log(`更新时间: ${new Date(details.updatedAt * 1000).toLocaleString()}`);
        }

        // 计算时间状态
        const now = Math.floor(Date.now() / 1000);
        if (now < details.startAt) {
            console.log(`⏰ 状态: 未开始 (还有 ${Math.floor((details.startAt - now) / 3600)} 小时开始)`);
        } else if (now > details.endAt) {
            console.log(`⏰ 状态: 已结束 (已结束 ${Math.floor((now - details.endAt) / 3600)} 小时)`);
        } else {
            console.log(`⏰ 状态: 进行中 (还有 ${Math.floor((details.endAt - now) / 3600)} 小时结束)`);
        }

        // 计算领取进度
        if (details.totalAmount > 0) {
            const claimedPercentage = (details.claimedTotal / details.totalAmount) * 100;
            console.log(`📊 领取进度: ${claimedPercentage.toFixed(2)}% (${details.claimedTotal}/${details.totalAmount})`);
        }
    }
}

// 主函数
async function main() {
    const questPubkey = process.env.QUEST_PUBKEY;
    if (!questPubkey) {
        console.error('❌ 请设置 QUEST_PUBKEY 环境变量');
        process.exit(1);
    }

    try {
        const quest = new PublicKey(questPubkey);
        const fetcher = new QuestFetcher();

        const details = await fetcher.fetchQuestDetails(quest);
        if (details) {
            fetcher.displayQuestDetails(details);
        } else {
            console.log('❌ 无法获取 Quest 详细信息');
        }
    } catch (error) {
        console.error('❌ 程序执行失败:', error);
        process.exit(1);
    }
}

// 如果直接运行此文件
if (require.main === module) {
    main();
}

export { QuestFetcher, QuestDetails };
