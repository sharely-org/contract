# Quest 详细信息获取工具

## 功能描述

`fetch_quest.ts` 是一个用于获取 Quest 详细信息的工具，可以获取 Quest 账户的完整状态信息，包括：

- Quest 基本信息（ID、状态、时间等）
- 资金信息（总金额、已注入、已领取）
- 相关账户（商户、管理员、代币、金库）
- Merkle Root 和位图信息
- 时间状态和领取进度

## 使用方法

### 1. 设置环境变量

```bash
# 设置 Quest 地址
export QUEST_PUBKEY="你的Quest地址"

# 可选：设置 RPC URL（默认使用 Devnet）
export RPC_URL="https://api.devnet.solana.com"

# 可选：设置 Program ID（默认使用已部署的 ID）
export PROGRAM_ID="7NYmJvQBjgw2tYirzSEFeDzDGZgq4XBRhyaEDU7NJfoA"
```

### 2. 运行脚本

```bash
# 使用 yarn 运行
yarn backend:fetch:quest

# 或者直接使用 ts-node
ts-node scripts/backend/fetch_quest.ts

# 或者设置环境变量后运行
QUEST_PUBKEY="你的Quest地址" yarn backend:fetch:quest
```

## 功能特性

### 1. 完整信息获取
- **Quest 基本信息**：ID、状态、时间范围
- **资金状态**：总金额、已注入、已领取、剩余
- **账户信息**：商户、管理员、代币、金库地址
- **技术信息**：Merkle Root、版本、时间戳

### 2. 智能状态分析
- **时间状态**：自动判断是否已开始、进行中、已结束
- **领取进度**：计算已领取金额的百分比
- **剩余时间**：显示距离开始/结束的时间

### 3. 相关数据获取
- **Vault 余额**：实时获取金库余额
- **位图信息**：获取 ClaimBitmapShard 的详细信息
- **Merkle Root**：获取 MerkleRoot 账户信息

### 4. 错误处理
- **账户验证**：检查 Quest 账户是否存在
- **数据解析**：验证账户数据格式
- **网络错误**：处理 RPC 连接问题

## 技术实现

### 1. 数据解析
- 手动解析 Quest 账户的二进制数据
- 支持所有 Quest 字段的完整解析
- 处理大端序/小端序转换

### 2. PDA 计算
- 自动计算 ClaimBitmapShard PDA
- 自动计算 MerkleRoot PDA
- 使用正确的 seeds 和 bump

### 3. 类型安全
- 完整的 TypeScript 类型定义
- 接口化的数据结构
- 类型安全的错误处理

## 环境变量

| 变量名 | 必需 | 默认值 | 描述 |
|--------|------|--------|------|
| `QUEST_PUBKEY` | ✅ | - | Quest 账户地址 |
| `RPC_URL` | ❌ | `https://api.devnet.solana.com` | Solana RPC 端点 |
| `PROGRAM_ID` | ❌ | `4iVesyfBbYHSwKKZKcNzRs1xqe1TnRJdCAcVrRwwpBbo` | 程序 ID |

## 错误处理

脚本会处理以下错误情况：
- Quest 账户不存在
- 账户数据格式错误
- RPC 连接失败
- PDA 计算错误
- 数据解析失败

## 扩展功能

可以通过以下方式扩展功能：
- 添加更多 Quest 相关账户的查询
- 集成事件历史查询
- 添加批量 Quest 查询
- 支持不同网络（Mainnet、Testnet）


sample:
================================================================================
Quest ID: 3
Quest 地址: 7zWFVegJUExcAUDeKrXJUAbvgV9kieMXPdYUHGEXMCFR
状态: Active
是否已开始: 是
开始时间: 1/1/1970, 10:46:40 AM
结束时间: Invalid Date
总金额: 100000000000000
已注入金额: 100000000000000
已领取金额: 1000000000
剩余金额: 99999000000000
商户地址: CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv
管理员地址: CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv
代币地址: DCDpBz2wzXpX4rD1F7o9jfxnzGEJ4AsP4TgDaaVi6ude
金库地址: 4o2wNyjs9oG39DjRqygspjx5G88WwQqPMiGshGKFBvpV
金库权限: BnyZmXMVmuM7VuGMcqH6skA6A7CqzLkWiDDF6EtawHHu
Merkle Root: 253fe6cdea53f52e482ad0c1eb364f2555e794c6a6c3bb0ec86b570d46e8b96b
版本: 2
⏰ 状态: 进行中 (还有 27777289136 小时结束)
📊 领取进度: 0.00% (1000000000/100000000000000)