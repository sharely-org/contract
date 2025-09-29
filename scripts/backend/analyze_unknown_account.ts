import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

interface AccountAnalysis {
    address: string;
    owner: string;
    executable: boolean;
    rentEpoch: number;
    lamports: number;
    dataLength: number;
    data: Buffer;
    discriminator?: Buffer;
    rawData: string;
    hexData: string;
    base64Data: string;
    analysis: {
        isProgramAccount: boolean;
        isSystemAccount: boolean;
        isTokenAccount: boolean;
        isAssociatedTokenAccount: boolean;
        isPDA: boolean;
        possibleTypes: string[];
        suggestions: string[];
    };
}

class UnknownAccountAnalyzer {
    private connection: Connection;

    constructor() {
        this.connection = new Connection(
            process.env.RPC_URL || 'https://api.devnet.solana.com',
            'confirmed'
        );
    }

    /**
     * 分析未知账户
     */
    async analyzeAccount(address: string): Promise<AccountAnalysis | null> {
        try {
            console.log(`🔍 分析账户: ${address}`);

            const pubkey = new PublicKey(address);
            const accountInfo = await this.connection.getAccountInfo(pubkey);

            if (!accountInfo) {
                console.log('❌ 账户不存在');
                return null;
            }

            const analysis: AccountAnalysis = {
                address: address,
                owner: accountInfo.owner.toBase58(),
                executable: accountInfo.executable,
                rentEpoch: accountInfo.rentEpoch,
                lamports: accountInfo.lamports,
                dataLength: accountInfo.data.length,
                data: accountInfo.data,
                rawData: accountInfo.data.toString('utf8'),
                hexData: accountInfo.data.toString('hex'),
                base64Data: accountInfo.data.toString('base64'),
                analysis: {
                    isProgramAccount: false,
                    isSystemAccount: false,
                    isTokenAccount: false,
                    isAssociatedTokenAccount: false,
                    isPDA: false,
                    possibleTypes: [],
                    suggestions: []
                }
            };

            // 分析账户类型
            await this.analyzeAccountType(analysis);

            // 尝试提取 discriminator
            this.extractDiscriminator(analysis);

            // 分析数据结构
            this.analyzeDataStructure(analysis);

            return analysis;

        } catch (error) {
            console.error('❌ 分析账户失败:', error);
            return null;
        }
    }

    /**
     * 分析账户类型
     */
    private async analyzeAccountType(analysis: AccountAnalysis): Promise<void> {
        const { owner, dataLength, data } = analysis;

        // 检查是否是系统程序账户
        if (owner === '11111111111111111111111111111111') {
            analysis.analysis.isSystemAccount = true;
            analysis.analysis.possibleTypes.push('System Account');
        }

        // 检查是否是程序账户
        if (analysis.executable) {
            analysis.analysis.isProgramAccount = true;
            analysis.analysis.possibleTypes.push('Program Account');
        }

        // 检查是否是 Token 账户
        if (dataLength === 165) {
            analysis.analysis.isTokenAccount = true;
            analysis.analysis.possibleTypes.push('SPL Token Account');
        }

        // 检查是否是 Associated Token Account
        if (dataLength === 165) {
            try {
                // 检查 ATA 的特征
                const mint = data.subarray(0, 32);
                const owner = data.subarray(32, 64);
                const amount = data.readBigUInt64LE(64);

                if (mint.length === 32 && owner.length === 32) {
                    analysis.analysis.isAssociatedTokenAccount = true;
                    analysis.analysis.possibleTypes.push('Associated Token Account');
                }
            } catch (error) {
                // 忽略解析错误
            }
        }

        // 检查是否是 PDA
        if (this.isPDA(analysis.address)) {
            analysis.analysis.isPDA = true;
            analysis.analysis.possibleTypes.push('Program Derived Address (PDA)');
        }

        // 根据数据长度推测类型
        this.guessAccountTypeByLength(analysis);
    }

    /**
     * 检查是否是 PDA
     */
    private isPDA(address: string): boolean {
        try {
            const pubkey = new PublicKey(address);
            // PDA 通常以特定模式结尾
            const bytes = pubkey.toBytes();
            return bytes[31] >= 128; // PDA 的最后一个字节通常 >= 128
        } catch {
            return false;
        }
    }

    /**
     * 根据数据长度推测账户类型
     */
    private guessAccountTypeByLength(analysis: AccountAnalysis): void {
        const { dataLength } = analysis;

        switch (dataLength) {
            case 0:
                analysis.analysis.possibleTypes.push('Empty Account');
                break;
            case 1:
                analysis.analysis.possibleTypes.push('Boolean Account');
                break;
            case 4:
                analysis.analysis.possibleTypes.push('U32 Account');
                break;
            case 8:
                analysis.analysis.possibleTypes.push('U64 Account');
                break;
            case 32:
                analysis.analysis.possibleTypes.push('PublicKey Account');
                break;
            case 64:
                analysis.analysis.possibleTypes.push('Keypair Account');
                break;
            case 128:
                analysis.analysis.possibleTypes.push('Small Struct Account');
                break;
            case 256:
                analysis.analysis.possibleTypes.push('Medium Struct Account');
                break;
            case 512:
                analysis.analysis.possibleTypes.push('Large Struct Account');
                break;
            case 1024:
                analysis.analysis.possibleTypes.push('Very Large Struct Account');
                break;
            default:
                if (dataLength < 100) {
                    analysis.analysis.possibleTypes.push('Small Data Account');
                } else if (dataLength < 1000) {
                    analysis.analysis.possibleTypes.push('Medium Data Account');
                } else {
                    analysis.analysis.possibleTypes.push('Large Data Account');
                }
        }
    }

    /**
     * 提取 discriminator
     */
    private extractDiscriminator(analysis: AccountAnalysis): void {
        if (analysis.dataLength >= 8) {
            analysis.discriminator = analysis.data.subarray(0, 8);
        }
    }

    /**
     * 分析数据结构
     */
    private analyzeDataStructure(analysis: AccountAnalysis): void {
        const { data, dataLength } = analysis;

        // 分析数据模式
        const patterns = this.analyzeDataPatterns(data);

        // 尝试解析常见的数据类型
        const parsedData = this.tryParseCommonTypes(data);

        // 生成建议
        this.generateSuggestions(analysis, patterns, parsedData);
    }

    /**
     * 分析数据模式
     */
    private analyzeDataPatterns(data: Buffer): any {
        const patterns = {
            hasNullBytes: false,
            hasPrintableChars: false,
            hasRepeatingPatterns: false,
            isLittleEndian: false,
            isBigEndian: false,
            hasPublicKeys: false,
            hasNumbers: false
        };

        // 检查空字节
        patterns.hasNullBytes = data.includes(0);

        // 检查可打印字符
        patterns.hasPrintableChars = Array.from(data).some(byte =>
            byte >= 32 && byte <= 126
        );

        // 检查重复模式
        patterns.hasRepeatingPatterns = this.hasRepeatingPatterns(data);

        // 检查字节序
        if (data.length >= 4) {
            const firstFour = data.readUInt32LE(0);
            const lastFour = data.readUInt32LE(data.length - 4);
            patterns.isLittleEndian = firstFour < lastFour;
            patterns.isBigEndian = firstFour > lastFour;
        }

        // 检查是否包含 PublicKey
        patterns.hasPublicKeys = this.containsPublicKeys(data);

        // 检查是否包含数字
        patterns.hasNumbers = this.containsNumbers(data);

        return patterns;
    }

    /**
     * 检查重复模式
     */
    private hasRepeatingPatterns(data: Buffer): boolean {
        if (data.length < 8) return false;

        // 检查 4 字节重复模式
        for (let i = 0; i < data.length - 8; i += 4) {
            const pattern = data.subarray(i, i + 4);
            const nextPattern = data.subarray(i + 4, i + 8);
            if (pattern.equals(nextPattern)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 检查是否包含 PublicKey
     */
    private containsPublicKeys(data: Buffer): boolean {
        if (data.length < 32) return false;

        for (let i = 0; i <= data.length - 32; i += 4) {
            try {
                const keyBytes = data.subarray(i, i + 32);
                new PublicKey(keyBytes);
                return true;
            } catch {
                // 继续检查
            }
        }
        return false;
    }

    /**
     * 检查是否包含数字
     */
    private containsNumbers(data: Buffer): boolean {
        return Array.from(data).some(byte => byte >= 48 && byte <= 57);
    }

    /**
     * 尝试解析常见数据类型
     */
    private tryParseCommonTypes(data: Buffer): any {
        const parsed = {
            u8: [] as number[],
            u16: [] as number[],
            u32: [] as number[],
            u64: [] as string[],
            i64: [] as string[],
            publicKeys: [] as string[],
            strings: [] as string[]
        };

        // 解析 u8
        for (let i = 0; i < data.length; i++) {
            parsed.u8.push(data.readUInt8(i));
        }

        // 解析 u16
        for (let i = 0; i < data.length - 1; i += 2) {
            parsed.u16.push(data.readUInt16LE(i));
        }

        // 解析 u32
        for (let i = 0; i < data.length - 3; i += 4) {
            parsed.u32.push(data.readUInt32LE(i));
        }

        // 解析 u64
        for (let i = 0; i < data.length - 7; i += 8) {
            parsed.u64.push(data.readBigUInt64LE(i).toString());
        }

        // 解析 i64
        for (let i = 0; i < data.length - 7; i += 8) {
            parsed.i64.push(data.readBigInt64LE(i).toString());
        }

        // 解析 PublicKey
        for (let i = 0; i <= data.length - 32; i += 4) {
            try {
                const keyBytes = data.subarray(i, i + 32);
                const pubkey = new PublicKey(keyBytes);
                parsed.publicKeys.push(pubkey.toBase58());
            } catch {
                // 忽略无效的 PublicKey
            }
        }

        // 解析字符串
        let currentString = '';
        for (let i = 0; i < data.length; i++) {
            const byte = data[i];
            if (byte >= 32 && byte <= 126) {
                currentString += String.fromCharCode(byte);
            } else {
                if (currentString.length > 2) {
                    parsed.strings.push(currentString);
                }
                currentString = '';
            }
        }

        return parsed;
    }

    /**
     * 生成建议
     */
    private generateSuggestions(analysis: AccountAnalysis, patterns: any, parsedData: any): void {
        const suggestions = analysis.analysis.suggestions;

        // 基于 discriminator 的建议
        if (analysis.discriminator) {
            suggestions.push(`Discriminator: ${analysis.discriminator.toString('hex')}`);
            suggestions.push('这可能是 Anchor 程序账户，discriminator 用于标识账户类型');
        }

        // 基于数据长度的建议
        if (analysis.dataLength === 0) {
            suggestions.push('空账户，可能未初始化');
        } else if (analysis.dataLength < 100) {
            suggestions.push('小数据账户，可能包含简单的状态信息');
        } else if (analysis.dataLength > 1000) {
            suggestions.push('大数据账户，可能包含复杂的数据结构');
        }

        // 基于模式的分析
        if (patterns.hasPublicKeys) {
            suggestions.push('包含 PublicKey，可能是账户关联信息');
        }

        if (patterns.hasNumbers) {
            suggestions.push('包含数字数据，可能是金额、计数或时间戳');
        }

        if (patterns.hasRepeatingPatterns) {
            suggestions.push('包含重复模式，可能是数组或列表数据');
        }

        // 基于解析数据的建议
        if (parsedData.publicKeys.length > 0) {
            suggestions.push(`发现 ${parsedData.publicKeys.length} 个可能的 PublicKey`);
        }

        if (parsedData.strings.length > 0) {
            suggestions.push(`发现 ${parsedData.strings.length} 个可能的字符串`);
        }

        // 基于账户类型的建议
        if (analysis.analysis.isPDA) {
            suggestions.push('这是 PDA，需要知道 seeds 才能完全解析');
        }

        if (analysis.analysis.isTokenAccount) {
            suggestions.push('这是 Token 账户，可以使用 SPL Token 库解析');
        }
    }

    /**
     * 显示分析结果
     */
    displayAnalysis(analysis: AccountAnalysis): void {
        console.log('\n📋 账户分析结果:');
        console.log('='.repeat(80));

        console.log(`账户地址: ${analysis.address}`);
        console.log(`所有者: ${analysis.owner}`);
        console.log(`可执行: ${analysis.executable ? '是' : '否'}`);
        console.log(`租金周期: ${analysis.rentEpoch}`);
        console.log(`余额: ${analysis.lamports} lamports`);
        console.log(`数据长度: ${analysis.dataLength} bytes`);

        if (analysis.discriminator) {
            console.log(`Discriminator: ${analysis.discriminator.toString('hex')}`);
        }

        console.log('\n🔍 账户类型分析:');
        console.log('-'.repeat(40));
        console.log(`系统账户: ${analysis.analysis.isSystemAccount ? '是' : '否'}`);
        console.log(`程序账户: ${analysis.analysis.isProgramAccount ? '是' : '否'}`);
        console.log(`Token 账户: ${analysis.analysis.isTokenAccount ? '是' : '否'}`);
        console.log(`ATA 账户: ${analysis.analysis.isAssociatedTokenAccount ? '是' : '否'}`);
        console.log(`PDA 账户: ${analysis.analysis.isPDA ? '是' : '否'}`);

        console.log('\n📊 可能的账户类型:');
        analysis.analysis.possibleTypes.forEach((type, index) => {
            console.log(`  ${index + 1}. ${type}`);
        });

        console.log('\n💡 分析建议:');
        analysis.analysis.suggestions.forEach((suggestion, index) => {
            console.log(`  ${index + 1}. ${suggestion}`);
        });

        console.log('\n📄 数据预览:');
        console.log('-'.repeat(40));
        console.log(`Hex: ${analysis.hexData.substring(0, 64)}${analysis.hexData.length > 64 ? '...' : ''}`);
        console.log(`Base64: ${analysis.base64Data.substring(0, 32)}${analysis.base64Data.length > 32 ? '...' : ''}`);

        if (analysis.dataLength <= 200) {
            console.log('\n🔍 完整数据解析:');
            console.log('-'.repeat(40));
            this.displayParsedData(analysis);
        }
    }

    /**
     * 显示解析的数据
     */
    private displayParsedData(analysis: AccountAnalysis): void {
        const data = analysis.data;

        console.log('\n字节级分析:');
        for (let i = 0; i < Math.min(data.length, 100); i += 16) {
            const chunk = data.subarray(i, i + 16);
            const hex = chunk.toString('hex').match(/.{1,2}/g)?.join(' ') || '';
            const ascii = Array.from(chunk).map(b =>
                b >= 32 && b <= 126 ? String.fromCharCode(b) : '.'
            ).join('');
            console.log(`${i.toString().padStart(4, '0')}: ${hex.padEnd(48)} |${ascii}|`);
        }

        if (data.length > 100) {
            console.log(`... (还有 ${data.length - 100} 字节)`);
        }
    }
}

// 主函数
async function main() {
    const address = process.argv[2];
    if (!address) {
        console.error('❌ 请提供账户地址');
        console.log('用法: ts-node analyze_unknown_account.ts <账户地址>');
        process.exit(1);
    }

    try {
        const analyzer = new UnknownAccountAnalyzer();
        const analysis = await analyzer.analyzeAccount(address);

        if (analysis) {
            analyzer.displayAnalysis(analysis);
        } else {
            console.log('❌ 无法分析账户');
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

export { UnknownAccountAnalyzer, AccountAnalysis };
