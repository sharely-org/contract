import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

import { sha256 } from "@noble/hashes/sha256";
import * as borsh from "@project-serum/borsh";

dotenv.config();

interface QuestInfo {
    quest: PublicKey;
    questId: number;
    status: string;
    startAt: number;
    endAt: number;
    totalAmount: number;
    fundedAmount: number;
    claimedTotal: number;
    merchant: string;
    admin: string;
    mint: string;
    vault: string;
    merkleRoot: string;
    version: number;
}

function eventDiscriminator(name: string): Buffer {
    return Buffer.from(sha256(`event:${name}`)).subarray(0, 8);
}


// 定义所有事件的 Borsh 布局
const questCreatedLayout = borsh.struct([
    borsh.u8("status"),
    borsh.publicKey("quest"),
    borsh.u64("quest_id"),
    borsh.publicKey("merchant"),
    borsh.publicKey("mint"),
    borsh.u64("total_amount"),
]);

const vaultFundedLayout = borsh.struct([
    borsh.publicKey("funder"),
    borsh.publicKey("quest"),
    borsh.u64("amount"),
]);

const questStatusChangedLayout = borsh.struct([
    borsh.publicKey("quest"),
    borsh.u8("status"),
]);

const claimedLayout = borsh.struct([
    borsh.publicKey("quest"),
    borsh.publicKey("user"),
    borsh.u64("index"),
    borsh.u64("amount"),
    borsh.u32("version"),
]);

const bitmapInitializedLayout = borsh.struct([
    borsh.publicKey("quest"),
    borsh.u32("user_count"),
    borsh.u32("bitmap_size"),
]);

const questActivatedLayout = borsh.struct([
    borsh.u8("status"),
    borsh.publicKey("quest"),
    borsh.u32("version"),
    borsh.array(borsh.u8(), 32, "merkle_root"),
    borsh.i64("start_at"),
    borsh.i64("end_at"),
]);

const questClosedLayout = borsh.struct([
    borsh.u8("status"),
    borsh.publicKey("quest"),
    borsh.u64("remaining_transferred"),
    borsh.publicKey("recipient"),
]);

const questCancelledLayout = borsh.struct([
    borsh.u8("status"),
    borsh.publicKey("quest"),
    borsh.u64("remaining_transferred"),
    borsh.publicKey("recipient"),
]);

const globalConfigInitializedLayout = borsh.struct([
    borsh.publicKey("admin"),
    borsh.publicKey("treasury"),
]);

const treasuryUpdatedLayout = borsh.struct([
    borsh.publicKey("new_treasury"),
    borsh.publicKey("admin"),
]);

function discriminatorMatch(log: string, discriminator_name: string): boolean {
    const discriminator = eventDiscriminator(discriminator_name);
    const data = log.match(/Program data: (.+)/);

    if (!data) return false;
    const buf = Buffer.from(data[1], "base64");
    if (!buf.subarray(0, 8).equals(discriminator)) {
        return false;
    }
    return true;
}

// 解码 QuestCreated 事件
function decodeQuestCreated(base64data: string) {
    const buf = Buffer.from(base64data, "base64");

    // 校验 discriminator
    const disc = eventDiscriminator("QuestCreated");
    if (!buf.subarray(0, 8).equals(disc)) {
        throw new Error("Not a QuestCreated event");
    }

    // 解码剩余部分
    const decoded = questCreatedLayout.decode(buf.subarray(8));

    const statusMap = {
        0: 'Pending',
        1: 'Active',
        2: 'Paused',
        3: 'Closed',
        4: 'Cancelled'
    };

    return {
        type: 'QuestCreated',
        status: statusMap[decoded.status as keyof typeof statusMap] || 'Unknown',
        statusCode: decoded.status,
        quest: new PublicKey(decoded.quest).toBase58(),
        questId: Number(decoded.quest_id),
        merchant: new PublicKey(decoded.merchant).toBase58(),
        mint: new PublicKey(decoded.mint).toBase58(),
        totalAmount: Number(decoded.total_amount),
    };
}

// 解码 VaultFunded 事件
function decodeVaultFunded(base64data: string) {
    const buf = Buffer.from(base64data, "base64");

    // 校验 discriminator
    const disc = eventDiscriminator("VaultFunded");
    if (!buf.subarray(0, 8).equals(disc)) {
        throw new Error("Not a VaultFunded event");
    }

    // 解码剩余部分
    const decoded = vaultFundedLayout.decode(buf.subarray(8));
    return {
        type: 'VaultFunded',
        funder: new PublicKey(decoded.funder).toBase58(),
        quest: new PublicKey(decoded.quest).toBase58(),
        amount: Number(decoded.amount)
    };
}

// 解码 QuestStatusChanged 事件
function decodeQuestStatusChanged(base64data: string) {
    const buf = Buffer.from(base64data, "base64");

    // 校验 discriminator
    const disc = eventDiscriminator("QuestStatusChanged");
    if (!buf.subarray(0, 8).equals(disc)) {
        throw new Error("Not a QuestStatusChanged event");
    }

    // 解码剩余部分
    const decoded = questStatusChangedLayout.decode(buf.subarray(8));

    const statusMap = {
        0: 'Pending',
        1: 'Active',
        2: 'Paused',
        3: 'Closed',
        4: 'Cancelled'
    };

    return {
        type: 'QuestStatusChanged',
        quest: new PublicKey(decoded.quest).toBase58(),
        status: statusMap[decoded.status as keyof typeof statusMap] || 'Unknown',
        statusCode: decoded.status
    };
}

// 解码 Claimed 事件
function decodeClaimed(base64data: string) {
    const buf = Buffer.from(base64data, "base64");

    // 校验 discriminator
    const disc = eventDiscriminator("Claimed");
    if (!buf.subarray(0, 8).equals(disc)) {
        throw new Error("Not a Claimed event");
    }

    // 解码剩余部分
    const decoded = claimedLayout.decode(buf.subarray(8));
    return {
        type: 'Claimed',
        quest: new PublicKey(decoded.quest).toBase58(),
        user: new PublicKey(decoded.user).toBase58(),
        index: decoded.index.toString(),
        amount: decoded.amount.toString(),
        version: decoded.version,
    };
}

// 解码 QuestActivated 事件
function decodeQuestActivated(base64data: string) {
    const buf = Buffer.from(base64data, "base64");

    // 校验 discriminator
    const disc = eventDiscriminator("QuestActivated");
    if (!buf.subarray(0, 8).equals(disc)) {
        throw new Error("Not a QuestActivated event");
    }

    // 解码剩余部分
    const decoded = questActivatedLayout.decode(buf.subarray(8));

    const statusMap = {
        0: 'Pending',
        1: 'Active',
        2: 'Paused',
        3: 'Closed',
        4: 'Cancelled'
    };

    const merkleRoot = Buffer.from(decoded.merkle_root).toString('hex');

    return {
        type: 'QuestActivated',
        status: statusMap[decoded.status as keyof typeof statusMap] || 'Unknown',
        statusCode: decoded.status,
        quest: new PublicKey(decoded.quest).toBase58(),
        version: decoded.version,
        merkleRoot: merkleRoot,
        startAt: Number(decoded.start_at),
        endAt: Number(decoded.end_at),
        startAtDate: new Date(Number(decoded.start_at) * 1000).toISOString(),
        endAtDate: new Date(Number(decoded.end_at) * 1000).toISOString()
    };
}

// 解码 MerkleRootSet 事件（保留兼容性，但可能不再使用）
function decodeMerkleRootSet(base64data: string) {
    const buf = Buffer.from(base64data, "base64");

    // 校验 discriminator
    const disc = eventDiscriminator("MerkleRootSet");
    if (!buf.subarray(0, 8).equals(disc)) {
        throw new Error("Not a MerkleRootSet event");
    }

    // 手动解析数据 (因为 borsh.vec 有问题)
    let offset = 8; // 跳过 discriminator

    const quest = new PublicKey(buf.subarray(offset, offset + 32));
    offset += 32;

    const version = buf.readUInt32LE(offset);
    offset += 4;

    const merkleRoot = buf.subarray(offset, offset + 32);

    return {
        type: 'MerkleRootSet',
        quest: quest.toBase58(),
        version: version,
        merkleRoot: Buffer.from(merkleRoot).toString('hex')
    };
}

// 解码 BitmapInitialized 事件
function decodeBitmapInitialized(base64data: string) {
    const buf = Buffer.from(base64data, "base64");

    // 校验 discriminator
    const disc = eventDiscriminator("BitmapInitialized");
    if (!buf.subarray(0, 8).equals(disc)) {
        throw new Error("Not a BitmapInitialized event");
    }

    // 解码剩余部分
    const decoded = bitmapInitializedLayout.decode(buf.subarray(8));
    return {
        type: 'BitmapInitialized',
        quest: new PublicKey(decoded.quest).toBase58(),
        userCount: decoded.user_count,
        bitmapSize: decoded.bitmap_size
    };
}

// 解码 QuestClosed 事件
function decodeQuestClosed(base64data: string) {
    const buf = Buffer.from(base64data, "base64");

    // 校验 discriminator
    const disc = eventDiscriminator("QuestClosed");
    if (!buf.subarray(0, 8).equals(disc)) {
        throw new Error("Not a QuestClosed event");
    }

    // 解码剩余部分
    const decoded = questClosedLayout.decode(buf.subarray(8));

    const statusMap = {
        0: 'Pending',
        1: 'Active',
        2: 'Paused',
        3: 'Closed',
        4: 'Cancelled'
    };

    return {
        type: 'QuestClosed',
        status: statusMap[decoded.status as keyof typeof statusMap] || 'Unknown',
        statusCode: decoded.status,
        quest: new PublicKey(decoded.quest).toBase58(),
        remainingTransferred: Number(decoded.remaining_transferred),
        recipient: new PublicKey(decoded.recipient).toBase58(),
    };
}

// 解码 QuestCancelled 事件
function decodeQuestCancelled(base64data: string) {
    const buf = Buffer.from(base64data, "base64");
    const disc = eventDiscriminator("QuestCancelled");
    if (!buf.subarray(0, 8).equals(disc)) {
        throw new Error("Not a QuestCancelled event");
    }

    const decoded = questCancelledLayout.decode(buf.subarray(8));

    const statusMap = {
        0: 'Pending',
        1: 'Active',
        2: 'Paused',
        3: 'Closed',
        4: 'Cancelled'
    };

    return {
        type: 'QuestCancelled',
        status: statusMap[decoded.status as keyof typeof statusMap] || 'Unknown',
        statusCode: decoded.status,
        quest: new PublicKey(decoded.quest).toBase58(),
        remainingTransferred: Number(decoded.remaining_transferred),
        recipient: new PublicKey(decoded.recipient).toBase58(),
    };
}

// 解码 GlobalConfigInitialized 事件
function decodeGlobalConfigInitialized(base64data: string) {
    const buf = Buffer.from(base64data, "base64");

    // 校验 discriminator
    const disc = eventDiscriminator("GlobalConfigInitialized");
    if (!buf.subarray(0, 8).equals(disc)) {
        throw new Error("Not a GlobalConfigInitialized event");
    }

    // 解码剩余部分
    const decoded = globalConfigInitializedLayout.decode(buf.subarray(8));
    return {
        type: 'GlobalConfigInitialized',
        admin: new PublicKey(decoded.admin).toBase58(),
        treasury: new PublicKey(decoded.treasury).toBase58(),
    };
}

// 解码 TreasuryUpdated 事件
function decodeTreasuryUpdated(base64data: string) {
    const buf = Buffer.from(base64data, "base64");

    // 校验 discriminator
    const disc = eventDiscriminator("TreasuryUpdated");
    if (!buf.subarray(0, 8).equals(disc)) {
        throw new Error("Not a TreasuryUpdated event");
    }

    // 解码剩余部分
    const decoded = treasuryUpdatedLayout.decode(buf.subarray(8));
    return {
        type: 'TreasuryUpdated',
        newTreasury: new PublicKey(decoded.new_treasury).toBase58(),
        admin: new PublicKey(decoded.admin).toBase58(),
    };
}

class ReadOnlyQuestScanner {
    private connection: Connection;
    private programId: PublicKey;
    private stateFilePath: string;

    constructor() {
        // 创建只读连接，不需要私钥
        const url = process.env.RPC_URL || 'http://127.0.0.1:8899';
        this.connection = new Connection(url, 'confirmed');
        this.programId = new PublicKey(process.env.PROGRAM_ID || '');
        console.log('🔍 PROGRAM_ID:', this.programId);
        // 状态文件位于脚本同目录下的 .scan_state.json
        const scriptDir = path.dirname(__filename);
        this.stateFilePath = path.join(scriptDir, '.scan_state.json');
    }

    /**
     * 通过 program ID 直接扫描所有 Quest 账户
     */
    async scanAllQuestsByProgram(): Promise<QuestInfo[]> {
        console.log('🔍 通过 Program ID 扫描所有 Quest 账户...');

        try {
            // 使用 getProgramAccounts 获取所有相关账户
            // QuestAccount 大小: 8 (discriminator) + 8 + 32*4 + 32 + 8 + 1 + 4 + 32*2 + 8*3 + 8 = 209
            const accounts = await this.connection.getProgramAccounts(this.programId, {
                filters: [
                    {
                        dataSize: 209, // QuestAccount 的固定大小
                    }
                ]
            });

            console.log(`📊 找到 ${accounts.length} 个相关账户`);

            const quests: QuestInfo[] = [];

            for (const { pubkey, account } of accounts) {
                try {
                    // 检查是否是 Quest 账户（通过数据大小和内容判断）
                    if (account.data.length !== 209) {
                        continue;
                    }

                    const questData = this.parseQuestAccount(account.data);
                    if (!questData) {
                        continue;
                    }

                    const questInfo: QuestInfo = {
                        quest: pubkey,
                        questId: questData.questId,
                        status: this.getStatusString(questData.status),
                        startAt: questData.startAt,
                        endAt: questData.endAt,
                        totalAmount: questData.totalAmount,
                        fundedAmount: questData.fundedAmount,
                        claimedTotal: questData.claimedTotal,
                        merchant: questData.merchant.toBase58(),
                        admin: questData.admin.toBase58(),
                        mint: questData.mint.toBase58(),
                        vault: questData.vault.toBase58(),
                        merkleRoot: Buffer.from(questData.merkleRoot).toString('hex'),
                        version: questData.version,
                    };

                    quests.push(questInfo);
                    console.log(`✅ 找到 Quest ${questData.questId}: ${pubkey.toBase58()}`);

                } catch (error) {
                    console.log(`⚠️  解析账户 ${pubkey.toBase58()} 失败:`, error);
                }
            }

            console.log(`📊 总共找到 ${quests.length} 个 Quest 账户`);
            return quests;

        } catch (error) {
            console.error('❌ 扫描 Quest 账户失败:', error);
            return [];
        }
    }

    /**
     * 通过 program ID 扫描所有事件（从 program 创建开始）
     */
    async scanAllEvents(): Promise<any[]> {
        console.log('🔍 从 Program 创建开始扫描所有事件...');

        try {
            const events: any[] = [];
            const questEvents = new Map<string, any>(); // 按 quest 分组
            let before: string | undefined; // 如果不提供，默认从最新一条交易开始往后扫描
            // until 使用上次保存的最新已处理签名（增量扫描断点）
            const lastProcessedSignature = this.readScanState();
            let until: string | undefined = lastProcessedSignature || undefined;
            const allSignatures: { signature: string; slot: number; blockTime: number | null }[] = [];

            let totalProcessed = 0;
            let pageCount = 0;

            // 第一步：仅分页收集所有签名（倒序返回），不立刻取交易，确保后续全局按从旧到新处理
            while (true) {
                pageCount++;
                console.log(`📄 获取第 ${pageCount} 页交易...`);

                const signatures = await this.connection.getSignaturesForAddress(this.programId, {
                    before,
                    until,
                    limit: 1000 // 每页最多1000个交易
                });

                if (signatures.length === 0) {
                    console.log('📄 没有更多交易了');
                    break;
                }

                console.log(`📊 第 ${pageCount} 页找到 ${signatures.length} 个交易`);
                allSignatures.push(...signatures.map(s => ({ signature: s.signature, slot: s.slot, blockTime: s.blockTime ?? null })));

                // 设置下一页的 before 参数
                before = signatures[signatures.length - 1].signature;

                // 如果这一页的交易少于1000个，说明已经到最后一页了
                if (signatures.length < 1000) {
                    break;
                }
            }

            console.log(`🧾 共收集签名 ${allSignatures.length} 个，开始按从旧到新处理...`);

            // 第二步：对所有签名做全局从旧到新排序处理
            for (const sig of allSignatures.reverse()) {
                try {
                    const tx = await this.connection.getTransaction(sig.signature, {
                        maxSupportedTransactionVersion: 0
                    });
                    if (tx?.meta?.logMessages) {
                        const questLogs = tx.meta.logMessages.filter(log =>
                            log.includes('InitializeQuestByMerchant') ||
                            log.includes('VaultFunded') ||
                            log.includes('QuestStatusChanged') ||
                            log.includes('Claim') ||
                            log.includes('SetMerkleRoot') ||
                            log.includes('QuestActivated') ||
                            log.includes('QuestClosed') ||
                            log.includes('QuestCreated') ||
                            log.includes('QuestCancelled') ||
                            log.includes('GlobalConfigInitialized') ||
                            log.includes('TreasuryUpdated') ||
                            log.includes('Program data:')
                        );

                        if (questLogs.length > 0) {
                            const parsedEvents = this.parseEventLogs(questLogs);
                            let questAddress = '';
                            if (parsedEvents.length > 0 && parsedEvents[0].quest) {
                                questAddress = parsedEvents[0].quest;
                            }
                            const eventData = {
                                signature: sig.signature,
                                slot: sig.slot,
                                timestamp: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : 'Unknown',
                                quest: questAddress,
                                logs: questLogs,
                                blockTime: sig.blockTime,
                                parsedEvents: parsedEvents
                            };

                            events.push(eventData);

                            if (questAddress) {
                                if (!questEvents.has(questAddress)) {
                                    questEvents.set(questAddress, []);
                                }
                                questEvents.get(questAddress)!.push(eventData);
                            }
                        }
                    }

                    totalProcessed++;
                    if (totalProcessed % 100 === 0) {
                        console.log(`⏳ 已处理 ${totalProcessed} 个交易...`);
                    }
                } catch (error) {
                    console.warn(`⚠️  解析交易 ${sig.signature} 失败:`, error);
                }
            }

            // 更新状态：写入最新处理到的签名（即这次批量中最“新”的一个）
            const newestSignature = allSignatures.length > 0 ? allSignatures[allSignatures.length - 1].signature : undefined;
            if (newestSignature) {
                this.writeScanState(newestSignature);
            }

            // 按时间排序（从早到晚）
            events.sort((a, b) => {
                if (a.blockTime && b.blockTime) {
                    return a.blockTime - b.blockTime;
                }
                return 0;
            });

            console.log(`📊 总共处理了 ${totalProcessed} 个交易`);
            console.log(`📊 找到 ${events.length} 个 Quest 相关事件`);
            console.log(`📊 涉及 ${questEvents.size} 个不同的 Quest`);

            // 显示事件统计
            this.displayEventStats(events);

            return events;

        } catch (error) {
            console.error('❌ 扫描事件失败:', error);
            return [];
        }
    }

    /**
     * 显示事件统计信息
     */
    private displayEventStats(events: any[]): void {
        console.log('\n📈 事件统计:');
        console.log('='.repeat(50));

        const eventCounts = events.reduce((acc, event) => {
            if (event.parsedEvents && event.parsedEvents.length > 0) {
                event.parsedEvents.forEach((parsedEvent: any) => {
                    acc[parsedEvent.type] = (acc[parsedEvent.type] || 0) + 1;
                });
            } else {
                // 如果没有解析的事件，从原始日志中统计
                event.logs.forEach((log: string) => {
                    if (log.includes('QuestCreated')) acc.QuestCreated++;
                    else if (log.includes('VaultFunded')) acc.VaultFunded++;
                    else if (log.includes('QuestStatusChanged')) acc.QuestStatusChanged++;
                    else if (log.includes('Claimed')) acc.Claimed++;
                    else if (log.includes('QuestActivated')) acc.QuestActivated++;
                    else if (log.includes('MerkleRootSet')) acc.MerkleRootSet++;
                    else if (log.includes('BitmapInitialized')) acc.BitmapInitialized++;
                    else if (log.includes('QuestClosed')) acc.QuestClosed++;
                    else if (log.includes('QuestCancelled')) acc.QuestCancelled++;
                    else if (log.includes('GlobalConfigInitialized')) acc.GlobalConfigInitialized++;
                    else if (log.includes('TreasuryUpdated')) acc.TreasuryUpdated++;
                });
            }
            return acc;
        }, {
            QuestCreated: 0,
            VaultFunded: 0,
            QuestStatusChanged: 0,
            Claimed: 0,
            QuestActivated: 0,
            MerkleRootSet: 0,
            BitmapInitialized: 0,
            QuestClosed: 0,
            QuestCancelled: 0,
            GlobalConfigInitialized: 0,
            TreasuryUpdated: 0,
        });

        console.log('事件类型分布:');
        Object.entries(eventCounts).forEach(([eventType, count]) => {
            if (Number(count) > 0) {
                console.log(`  ${eventType}: ${count} 个`);
            }
        });

        // 显示详细的事件数据示例
        this.displayEventDataExamples(events);

        // 时间范围
        const timestamps = events
            .map(e => e.blockTime)
            .filter(t => t)
            .sort((a, b) => a - b);

        if (timestamps.length > 0) {
            const firstEvent = new Date(timestamps[0] * 1000).toISOString();
            const lastEvent = new Date(timestamps[timestamps.length - 1] * 1000).toISOString();
            console.log(`\n时间范围: ${firstEvent} 到 ${lastEvent}`);
        }
    }

    /**
     * 显示事件数据示例
     */
    private displayEventDataExamples(events: any[]): void {
        console.log('\n📊 事件数据示例:');
        console.log('='.repeat(50));

        // 按事件类型分组，每种类型显示一个示例
        const eventExamples = new Map<string, any>();

        events.forEach(event => {
            if (event.parsedEvents && event.parsedEvents.length > 0) {
                event.parsedEvents.forEach((parsedEvent: any) => {
                    if (!eventExamples.has(parsedEvent.type)) {
                        eventExamples.set(parsedEvent.type, parsedEvent);
                    }
                });
            }
        });

        // 显示每种事件类型的示例
        eventExamples.forEach((example, eventType) => {
            console.log(`\n${eventType} 示例:`);
            this.displayParsedEvent(example, '  ');
        });
    }

    /**
     * 解析事件日志数据
     */
    private parseEventLogs(logs: string[]): any[] {
        const parsedEvents: any[] = [];

        for (const log of logs) {
            try {
                // 解析 QuestCreated 事件
                if (discriminatorMatch(log, 'QuestCreated')) {
                    const event = this.parseQuestCreatedEvent(log);
                    if (event) parsedEvents.push(event);
                }
                // 解析 VaultFunded 事件
                else if (discriminatorMatch(log, 'VaultFunded')) {
                    const event = this.parseVaultFundedEvent(log);
                    if (event) parsedEvents.push(event);
                }
                // 解析 QuestStatusChanged 事件
                else if (discriminatorMatch(log, 'QuestStatusChanged')) {
                    const event = this.parseQuestStatusChangedEvent(log);
                    if (event) parsedEvents.push(event);
                }
                // 解析 Claimed 事件
                else if (discriminatorMatch(log, 'Claimed')) {
                    const event = this.parseClaimedEvent(log);
                    if (event) parsedEvents.push(event);
                }
                // 解析 QuestActivated 事件
                else if (discriminatorMatch(log, 'QuestActivated')) {
                    const event = this.parseQuestActivatedEvent(log);
                    if (event) parsedEvents.push(event);
                }
                // 解析 MerkleRootSet 事件（保留兼容性）
                else if (discriminatorMatch(log, 'MerkleRootSet')) {
                    const event = this.parseMerkleRootSetEvent(log);
                    if (event) parsedEvents.push(event);
                }
                // 解析 BitmapInitialized 事件
                else if (discriminatorMatch(log, 'BitmapInitialized')) {
                    const event = this.parseBitmapInitializedEvent(log);
                    if (event) parsedEvents.push(event);
                }
                // 解析 QuestClosed 事件
                else if (discriminatorMatch(log, 'QuestClosed')) {
                    const event = this.parseQuestClosedEvent(log);
                    if (event) parsedEvents.push(event);
                }
                // 解析 QuestCancelled 事件
                else if (discriminatorMatch(log, 'QuestCancelled')) {
                    const event = this.parseQuestCancelledEvent(log);
                    if (event) parsedEvents.push(event);
                }
                // 解析 GlobalConfigInitialized 事件
                else if (discriminatorMatch(log, 'GlobalConfigInitialized')) {
                    const event = this.parseGlobalConfigInitializedEvent(log);
                    if (event) parsedEvents.push(event);
                }
                // 解析 TreasuryUpdated 事件
                else if (discriminatorMatch(log, 'TreasuryUpdated')) {
                    const event = this.parseTreasuryUpdatedEvent(log);
                    if (event) parsedEvents.push(event);
                }
            } catch (error) {
                console.warn(`⚠️  解析事件日志失败: ${log}`, error);
            }
        }

        return parsedEvents;
    }

    /**
     * 解析 QuestCreated 事件
     */
    private parseQuestCreatedEvent(log: string): any | null {
        try {
            const dataMatch = log.match(/Program data: (.+)/);
            if (!dataMatch) return null;

            const decoded = decodeQuestCreated(dataMatch[1]);
            return decoded;
        } catch (error) {
            console.warn('解析 QuestCreated 事件失败:', error);
            return null;
        }
    }

    /**
     * 解析 VaultFunded 事件
     */
    private parseVaultFundedEvent(log: string): any | null {
        try {
            const dataMatch = log.match(/Program data: (.+)/);
            if (!dataMatch) return null;

            const decoded = decodeVaultFunded(dataMatch[1]);
            return decoded;
        } catch (error) {
            console.warn('解析 VaultFunded 事件失败:', error);
            return null;
        }
    }

    /**
     * 解析 QuestStatusChanged 事件
     */
    private parseQuestStatusChangedEvent(log: string): any | null {
        try {
            const dataMatch = log.match(/Program data: (.+)/);
            if (!dataMatch) return null;

            const decoded = decodeQuestStatusChanged(dataMatch[1]);
            return decoded;
        } catch (error) {
            console.warn('解析 QuestStatusChanged 事件失败:', error);
            return null;
        }
    }

    /**
     * 解析 Claimed 事件
     */
    private parseClaimedEvent(log: string): any | null {
        try {
            const dataMatch = log.match(/Program data: (.+)/);
            if (!dataMatch) return null;
            const decoded = decodeClaimed(dataMatch[1]);
            return decoded;
        } catch (error) {
            console.warn('解析 Claimed 事件失败:', error);
            return null;
        }
    }


    /**
     * 解析 QuestActivated 事件
     */
    private parseQuestActivatedEvent(log: string): any | null {
        try {
            const dataMatch = log.match(/Program data: (.+)/);
            if (!dataMatch) return null;

            const decoded = decodeQuestActivated(dataMatch[1]);
            return decoded;
        } catch (error) {
            console.warn('解析 QuestActivated 事件失败:', error);
            return null;
        }
    }

    /**
     * 解析 MerkleRootSet 事件（保留兼容性）
     */
    private parseMerkleRootSetEvent(log: string): any | null {
        try {
            const dataMatch = log.match(/Program data: (.+)/);
            if (!dataMatch) return null;

            const decoded = decodeMerkleRootSet(dataMatch[1]);
            return decoded;
        } catch (error) {
            console.warn('解析 MerkleRootSet 事件失败:', error);
            return null;
        }
    }

    /**
     * 解析 BitmapInitialized 事件
     */
    private parseBitmapInitializedEvent(log: string): any | null {
        try {
            const dataMatch = log.match(/Program data: (.+)/);
            if (!dataMatch) return null;

            const decoded = decodeBitmapInitialized(dataMatch[1]);
            return decoded;
        } catch (error) {
            console.warn('解析 BitmapInitialized 事件失败:', error);
            return null;
        }
    }

    /**
     * 解析 QuestClosed 事件
     */
    private parseQuestClosedEvent(log: string): any | null {
        try {
            const dataMatch = log.match(/Program data: (.+)/);
            if (!dataMatch) return null;

            const decoded = decodeQuestClosed(dataMatch[1]);
            return decoded;
        } catch (error) {
            console.warn('解析 QuestClosed 事件失败:', error);
            return null;
        }
    }

    /**
     * 解析 QuestCancelled 事件
     */
    private parseQuestCancelledEvent(log: string): any | null {
        try {
            const dataMatch = log.match(/Program data: (.+)/);
            if (!dataMatch) return null;

            const decoded = decodeQuestCancelled(dataMatch[1]);
            return decoded;
        } catch (error) {
            console.warn('解析 QuestCancelled 事件失败:', error);
            return null;
        }
    }

    /**
     * 解析 GlobalConfigInitialized 事件
     */
    private parseGlobalConfigInitializedEvent(log: string): any | null {
        try {
            const dataMatch = log.match(/Program data: (.+)/);
            if (!dataMatch) return null;

            const decoded = decodeGlobalConfigInitialized(dataMatch[1]);
            return decoded;
        } catch (error) {
            console.warn('解析 GlobalConfigInitialized 事件失败:', error);
            return null;
        }
    }

    /**
     * 解析 TreasuryUpdated 事件
     */
    private parseTreasuryUpdatedEvent(log: string): any | null {
        try {
            const dataMatch = log.match(/Program data: (.+)/);
            if (!dataMatch) return null;

            const decoded = decodeTreasuryUpdated(dataMatch[1]);
            return decoded;
        } catch (error) {
            console.warn('解析 TreasuryUpdated 事件失败:', error);
            return null;
        }
    }

    /**
     * 扫描特定 quest 的事件历史
     */
    async scanQuestEvents(questPubkey: PublicKey, limit: number = 20): Promise<any[]> {
        console.log(`🔍 扫描 Quest ${questPubkey.toBase58()} 的事件历史...`);

        try {
            const signatures = await this.connection.getSignaturesForAddress(questPubkey, {
                before: "66b4XtGDD5grDbTGHbN7MnC5wHhtXSZtn8Bhtwn1mvvuJ6AKr3yjDeGj7teZtBQ3re56Kox76MNagSXjVdkx4V6i"
            });

            const events: any[] = [];

            for (const sig of signatures) {
                try {
                    const tx = await this.connection.getTransaction(sig.signature, {
                        maxSupportedTransactionVersion: 0
                    });

                    if (tx?.meta?.logMessages) {
                        const questLogs = tx.meta.logMessages.filter(log =>
                            log.includes('QuestCreated') ||
                            log.includes('VaultFunded') ||
                            log.includes('QuestStatusChanged') ||
                            log.includes('Claimed') ||
                            log.includes('QuestActivated') ||
                            log.includes('MerkleRootSet') ||
                            log.includes('BitmapInitialized') ||
                            log.includes('QuestClosed') ||
                            log.includes('QuestCancelled') ||
                            log.includes('GlobalConfigInitialized') ||
                            log.includes('TreasuryUpdated')
                        );

                        if (questLogs.length > 0) {
                            events.push({
                                signature: sig.signature,
                                slot: sig.slot,
                                timestamp: sig.blockTime ? new Date(sig.blockTime * 1000).toISOString() : 'Unknown',
                                logs: questLogs
                            });
                        }
                    }
                } catch (error) {
                    console.warn(`⚠️  解析交易 ${sig.signature} 失败:`, error);
                }
            }

            return events;
        } catch (error) {
            console.error('❌ 扫描 Quest 事件失败:', error);
            return [];
        }
    }
    /**
     * 显示 quest 统计信息
     */
    displayQuestStats(quests: QuestInfo[]): void {
        console.log('\n📈 Quest 统计信息:');
        console.log('='.repeat(50));

        const statusCounts = quests.reduce((acc, quest) => {
            acc[quest.status] = (acc[quest.status] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        console.log('状态分布:');
        Object.entries(statusCounts).forEach(([status, count]) => {
            console.log(`  ${status}: ${count} 个`);
        });

        const totalAmount = quests.reduce((sum, quest) => sum + quest.totalAmount, 0);
        const totalFunded = quests.reduce((sum, quest) => sum + quest.fundedAmount, 0);
        const totalClaimed = quests.reduce((sum, quest) => sum + quest.claimedTotal, 0);

        console.log('\n资金统计:');
        console.log(`  总金额: ${totalAmount}`);
        console.log(`  已注资: ${totalFunded}`);
        console.log(`  已领取: ${totalClaimed}`);
        console.log(`  剩余: ${totalFunded - totalClaimed}`);
    }

    /**
     * 显示 quest 列表
     */
    displayQuests(quests: QuestInfo[]): void {
        console.log('\n📋 Quest 列表:');
        console.log('='.repeat(150));
        console.log('Quest ID'.padEnd(8) + 'Status'.padEnd(10) + 'Started'.padEnd(8) + 'Amount'.padEnd(15) + 'Claimed'.padEnd(15) + 'Merchant'.padEnd(44) + 'Quest Address'.padEnd(44));
        console.log('-'.repeat(150));

        quests.forEach(quest => {
            const questId = quest.questId.toString().padEnd(8);
            const status = quest.status.padEnd(10);
            const amount = quest.totalAmount.toString().padEnd(15);
            const claimed = quest.claimedTotal.toString().padEnd(15);
            const merchant = quest.merchant.substring(0, 8) + '...' + quest.merchant.substring(quest.merchant.length - 8);
            const questAddr = quest.quest.toBase58();

            console.log(`${questId}${status}${amount}${claimed}${merchant}${questAddr}`);
        });
    }

    /**
     * 显示事件历史
     */
    displayEvents(events: any[]): void {
        console.log('\n📜 事件历史:');
        console.log('='.repeat(100));

        events.forEach((event, index) => {
            console.log(`\n${index + 1}. [${event.timestamp}] 签名: ${event.signature}`);
            console.log(`   Quest: ${event.quest || 'Unknown'}`);
            console.log(`   Slot: ${event.slot}`);

            // 显示解析后的事件数据
            if (event.parsedEvents && event.parsedEvents.length > 0) {
                console.log(`   解析的事件:`);
                event.parsedEvents.forEach((parsedEvent: any, eventIndex: number) => {
                    console.log(`     ${eventIndex + 1}. ${parsedEvent.type}:`);
                    this.displayParsedEvent(parsedEvent, '       ');
                });
            }

            console.log(`   原始日志:`);
            event.logs.forEach((log: string, logIndex: number) => {
                console.log(`     ${logIndex + 1}. ${log}`);
            });
            console.log('-'.repeat(100));
        });
    }

    /**
     * 显示解析后的事件数据
     */
    private displayParsedEvent(event: any, indent: string = ''): void {
        switch (event.type) {
            case 'QuestCreated':
                console.log(`${indent}  Status: ${event.status || 'Unknown'}`);
                console.log(`${indent}  Quest: ${event.quest}`);
                console.log(`${indent}  Quest ID: ${event.questId}`);
                console.log(`${indent}  Merchant: ${event.merchant}`);
                console.log(`${indent}  Mint: ${event.mint}`);
                console.log(`${indent}  Total Amount: ${event.totalAmount}`);
                break;

            case 'QuestActivated':
                console.log(`${indent}  Status: ${event.status || 'Unknown'}`);
                console.log(`${indent}  Quest: ${event.quest}`);
                console.log(`${indent}  Version: ${event.version}`);
                console.log(`${indent}  Merkle Root: ${event.merkleRoot}`);
                console.log(`${indent}  Start: ${event.startAtDate}`);
                console.log(`${indent}  End: ${event.endAtDate}`);
                break;

            case 'VaultFunded':
                console.log(`${indent}  Funder: ${event.funder}`);
                console.log(`${indent}  Quest: ${event.quest}`);
                console.log(`${indent}  Amount: ${event.amount}`);
                break;

            case 'QuestStatusChanged':
                console.log(`${indent}  Quest: ${event.quest}`);
                console.log(`${indent}  Status: ${event.status} (${event.statusCode})`);
                break;

            case 'Claimed':
                console.log(`${indent}  Quest: ${event.quest}`);
                console.log(`${indent}  User: ${event.user}`);
                console.log(`${indent}  Index: ${event.index}`);
                console.log(`${indent}  Amount: ${event.amount}`);
                console.log(`${indent}  Version: ${event.version}`);
                break;

            case 'MerkleRootSet':
                console.log(`${indent}  Quest: ${event.quest}`);
                console.log(`${indent}  Version: ${event.version}`);
                console.log(`${indent}  Merkle Root: ${event.merkleRoot}`);
                break;

            case 'BitmapInitialized':
                console.log(`${indent}  Quest: ${event.quest}`);
                console.log(`${indent}  User Count: ${event.userCount}`);
                console.log(`${indent}  Bitmap Size: ${event.bitmapSize} bytes`);
                break;

            case 'QuestClosed':
                console.log(`${indent}  Status: ${event.status || 'Unknown'}`);
                console.log(`${indent}  Quest: ${event.quest}`);
                console.log(`${indent}  Remaining Transferred: ${event.remainingTransferred}`);
                if (event.recipient) {
                    console.log(`${indent}  Recipient: ${event.recipient}`);
                }
                break;
            case 'QuestCancelled':
                console.log(`${indent}  Status: ${event.status || 'Unknown'}`);
                console.log(`${indent}  Quest: ${event.quest}`);
                console.log(`${indent}  Remaining Transferred: ${event.remainingTransferred}`);
                if (event.recipient) {
                    console.log(`${indent}  Recipient: ${event.recipient}`);
                }
                break;

            case 'GlobalConfigInitialized':
                console.log(`${indent}  Admin: ${event.admin}`);
                console.log(`${indent}  Treasury: ${event.treasury}`);
                break;

            case 'TreasuryUpdated':
                console.log(`${indent}  New Treasury: ${event.newTreasury}`);
                console.log(`${indent}  Admin: ${event.admin}`);
                break;

            default:
                console.log(`${indent}  Unknown event type: ${event.type}`);
        }
    }

    // 扫描状态读写
    private readScanState(): string | null {
        try {
            if (!fs.existsSync(this.stateFilePath)) return null;
            const raw = fs.readFileSync(this.stateFilePath, 'utf-8');
            const data = JSON.parse(raw);
            return typeof data?.lastProcessedSignature === 'string' ? data.lastProcessedSignature : null;
        } catch (e) {
            console.warn('读取扫描状态失败，忽略为全量扫描:', e);
            return null;
        }
    }

    private writeScanState(signature: string): void {
        try {
            const data = { lastProcessedSignature: signature, updatedAt: new Date().toISOString() };
            fs.writeFileSync(this.stateFilePath, JSON.stringify(data, null, 2), 'utf-8');
            console.log(`💾 已更新扫描状态，lastProcessedSignature=${signature}`);
        } catch (e) {
            console.warn('写入扫描状态失败：', e);
        }
    }

    // 私有辅助方法
    private getStatusString(status: number): string {
        const statusMap = {
            0: 'Pending',
            1: 'Active',
            2: 'Paused',
            3: 'Closed',
            4: 'Cancelled'
        };
        return statusMap[status as keyof typeof statusMap] || 'Unknown';
    }

    /**
     * 手动解析 QuestAccount 数据
     */
    private parseQuestAccount(data: Buffer): any | null {
        try {
            // QuestAccount 结构：
            // 8 (discriminator) + 8 (quest_id) + 32 (mint) + 32 (vault) + 32 (vault_authority) + 32 (merkle_root) + 8 (claimed_total) + 1 (status) + 4 (version) + 32 (merchant) + 32 (admin) + 8 (start_at) + 8 (end_at) + 8 (total_amount) + 8 (funded_amount) + 8 (fee_amount)

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
            offset += 8;

            const feeAmount = data.readBigUInt64LE(offset);
            offset += 8;

            return {
                questId: Number(questId),
                mint,
                vault,
                vaultAuthority,
                merkleRoot,
                claimedTotal: Number(claimedTotal),
                status,
                version,
                merchant,
                admin,
                startAt: Number(startAt),
                endAt: Number(endAt),
                totalAmount: Number(totalAmount),
                fundedAmount: Number(fundedAmount),
                feeAmount: Number(feeAmount),
            };
        } catch (error) {
            console.error('解析 QuestAccount 失败:', error);
            return null;
        }
    }
}

// 主函数
async function main() {
    const scanner = new ReadOnlyQuestScanner();

    console.log('\n🔍 扫描模式: 所有事件');

    // 通过 program ID 扫描所有事件（从 program 创建开始）
    const events = await scanner.scanAllEvents();

    if (events.length === 0) {
        console.log('❌ 没有找到任何事件');
    } else {
        scanner.displayEvents(events);
    }

}

// 运行脚本
main().catch(console.error);
