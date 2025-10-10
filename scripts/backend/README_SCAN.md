# Quest 扫描脚本使用说明

## 功能概述

Quest 扫描脚本提供了全面的 Quest事件监听功能，包括：

- 📜 查看 Quest 事件历史
```
quest id是全局唯一, 每个quest id 会生成一个唯一的 PDA 账户，每个EVENT里都有携带这个PDA账户(quest)， 后端可以根据这个来做数据处理。
quest status：
  0: 'Pending',  商户初始化quest并注资后状态为Pending
  1: 'Active',   admin设置默克尔树后为Active
  2: 'Paused',   admin可以手动暂停
  3: 'Ended'     空投到期后admin关闭quest后为Ended
用户只有在状态为1(Active)时才能领取空投
``` 
## 使用方法

### 1. 扫描所有 events

```bash
yarn backend:events

- 从后往前扫描所有交易中的event， 为了不重复扫描，后端记录上次扫描到的tx hash, 记录下来，下次拉取数据时作为参数(until)传入。

## 环境变量

| 变量名 | 说明 | 默认值 | 说明 |
|--------|------|--------|--------| 
| `RPC_URL` | Solana RPC 地址 | 本地测试时：dev: https://api.devnet.solana.com, mainnet: https://api.mainnet.solana.com ，其他环境建议从 https://dashboard.quicknode.com/ 申请 | 

## 新版扫描逻辑与断点续扫

- 全局顺序处理：先分页仅收集所有签名，再统一按“从旧到新”的全局顺序获取交易并解析事件，保证事件依赖按时间顺序被处理。
- 断点续扫：脚本会把最新处理到的交易签名保存到状态文件，下一次启动时自动从上次位置之后继续扫描，无需手动传参。

### 状态文件

- 路径：`scripts/backend/.scan_state.json`
- 字段：
  - `lastProcessedSignature`: 最近一次完成扫描时的最新交易签名
  - `updatedAt`: 状态更新时间（ISO 字符串）

示例：
```json
{
  "lastProcessedSignature": "<tx-signature>",
  "updatedAt": "2025-10-10T03:15:20.123Z"
}
```

### 运行模式

- 首次全量扫描：确保不存在 `scripts/backend/.scan_state.json`，或删除该文件再运行
```bash
rm -f scripts/backend/.scan_state.json
yarn backend:events
```

- 增量扫描（默认）：保留状态文件，直接运行即可自动从 `lastProcessedSignature` 之后继续
```bash
yarn backend:events
```

- 从指定签名继续：手动编辑 `scripts/backend/.scan_state.json` 中的 `lastProcessedSignature`，保存后运行
```bash
# 编辑 .scan_state.json 写入你希望作为“已处理到”的签名
yarn backend:events
```

### 重置与恢复

- 重置扫描进度：删除状态文件即可触发下次全量扫描
```bash
rm -f scripts/backend/.scan_state.json
```

- 备份/恢复：可将该 JSON 文件纳入你的后端持久化（例如对象存储、配置中心），或在 CI/CD 前置下发

### 注意事项（与顺序相关）

- Solana 提供的 `getSignaturesForAddress` 返回结果是倒序；本脚本先收集签名、后全局逆序处理，确保“从旧到新”的稳定顺序。
- 事件间存在依赖时（例如后续事件依赖前置事件的状态），本实现可保证语义正确。
- 你也可以将 `lastProcessedSignature` 存入数据库（如 Redis/Postgres），只需在代码中替换状态读写即可。

## 管理操作（Pause / Resume）

### 环境变量

```bash
export QUEST_PUBKEY=<quest_pubkey>
```

### 命令

```bash
# 暂停 Quest（需要管理员）
yarn ts-node scripts/admin/pause.ts

# 恢复 Quest（需要管理员）
yarn ts-node scripts/admin/resume.ts

#（已移除）结束 Quest：统一使用 close.ts 做最终清算
```

### 扫描端解析

- 合约针对状态变更统一触发 `QuestStatusChanged` 事件，扫描脚本 `scan_quests.ts` 已内置解析并打印：
  - Pending (0)
  - Active (1)
  - Paused (2)
  - Ended (3)

## 输出说明

### 事件历史
显示 Quest 相关的所有事件：
- QuestCreated：Quest 创建
- VaultFunded：资金注入
- QuestStatusChanged：状态变更
- Claimed：用户领取
- MerkleRootSet：设置默克尔根
- BitmapInitialized：位图初始化
- QuestClosed：Quest 关闭


## 注意事项

1. **网络连接**：确保 RPC 连接正常
2. **权限**：需要读取 Quest 账户的权限
3. **性能**：扫描大量 Quest 可能需要时间
4. **实时监听**：会持续运行直到手动停止

## 故障排除

### 常见错误

1. **"没有找到任何 Quest"**
   - 检查 RPC 连接
   - 确认 Quest 确实存在

2. **"解析 Quest 账户失败"**
   - 可能是 Quest 账户数据损坏
   - 检查 Quest 地址是否正确

3. **"扫描 Quest 事件失败"**
   - 检查网络连接
   - 确认 Quest 地址有效

### 调试技巧

2. 检查环境变量设置
3. 查看控制台错误信息
4. 确认 Quest 账户状态


sample: 
```
yarn backend:events
yarn run v1.22.22
$ yarn backend:events 


🔍 扫描模式: 所有事件
🔍 从 Program 创建开始扫描所有事件...
📄 获取第 1 页交易...
📊 第 1 页找到 7 个交易
🧾 共收集签名 7 个，开始按从旧到新处理...
💾 已更新扫描状态，lastProcessedSignature=qKxQ85PhtvqWUqJgk62wSbYetSe14kNTgJhcy4cejeynaNNd3xtagSgE8BhhcZYgv7m3o2tPF83gdCnb3p4anBx
📊 总共处理了 7 个交易
📊 找到 6 个 Quest 相关事件
📊 涉及 1 个不同的 Quest

📈 事件统计:
==================================================
事件类型分布:
  QuestCreated: 1 个
  VaultFunded: 1 个
  QuestStatusChanged: 3 个
  Claimed: 1 个
  MerkleRootSet: 1 个
  BitmapInitialized: 1 个
  QuestClosed: 1 个

📊 事件数据示例:
==================================================

QuestCreated 示例:
    Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
    Quest ID: 1
    Merchant: CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv
    Mint: DCDpBz2wzXpX4rD1F7o9jfxnzGEJ4AsP4TgDaaVi6ude
    Total Amount: 1000000000000
    Start: 2025-10-10T08:49:37.000Z
    End: 2025-10-10T09:49:37.000Z

VaultFunded 示例:
    Funder: CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv
    Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
    Amount: 1000000000000

QuestStatusChanged 示例:
    Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
    Status: Active (1)

MerkleRootSet 示例:
    Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
    Version: 2
    Merkle Root: 253fe6cdea53f52e482ad0c1eb364f2555e794c6a6c3bb0ec86b570d46e8b96b

BitmapInitialized 示例:
    Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
    User Count: 10000
    Bitmap Size: 1250 bytes

Claimed 示例:
    Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
    User: CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv
    Index: 4
    Amount: 1000000000
    Version: 2

QuestClosed 示例:
    Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
    Remaining Transferred: 999000000000
    Recipient: 9YGZyTfDhG2jFbvUaaLA9VLBZW9ZAPqDeGjka7XKUexa

时间范围: 2025-10-10T09:23:56.000Z 到 2025-10-10T09:53:51.000Z

📜 事件历史:
====================================================================================================

1. [2025-10-10T09:23:56.000Z] 签名: 51kQGs85sg72RV7HWWAFFywePDMHTgSiVJF2MuT8SCXUQYTHfGBjKTVHgK5boXFhLL6ZAeSYAu3LzLqrLAJ18NtM
   Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
   Slot: 413608625
   解析的事件:
     1. QuestCreated:
         Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
         Quest ID: 1
         Merchant: CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv
         Mint: DCDpBz2wzXpX4rD1F7o9jfxnzGEJ4AsP4TgDaaVi6ude
         Total Amount: 1000000000000
         Start: 2025-10-10T08:49:37.000Z
         End: 2025-10-10T09:49:37.000Z
     2. VaultFunded:
         Funder: CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv
         Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
         Amount: 1000000000000
   原始日志:
     1. Program log: Instruction: InitializeQuestByMerchant
     2. Program data: s1rJslpFSUMJEBeRaTiiWO24NTx7/tv7PvViNm785CqsRUQjHQvEOQEAAAAAAAAAptIzh937nkyJQk41zVmZZKfvRYFl0N53arJ5PwswOTm1LB7TPpUEt8n+q17PLljUSI/1wWm5wuc80Zsv2zm2NQAQpdToAAAAocjoaAAAAACx1uhoAAAAAA==
     3. Program data: wHf1wTffwzKm0jOH3fueTIlCTjXNWZlkp+9FgWXQ3ndqsnk/CzA5OQkQF5FpOKJY7bg1PHv+2/s+9WI2bvzkKqxFRCMdC8Q5ABCl1OgAAAA=
----------------------------------------------------------------------------------------------------

2. [2025-10-10T09:24:08.000Z] 签名: 3h6QtH9HWMWYDLpyXCVnRopGyrJv5gnQ32CdXsgh2WRBduLgS4ksEjCTziX1uRQNX1qqRW7AfYQgUKe2v8Xbpyax
   Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
   Slot: 413608656
   解析的事件:
     1. QuestStatusChanged:
         Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
         Status: Active (1)
     2. MerkleRootSet:
         Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
         Version: 2
         Merkle Root: 253fe6cdea53f52e482ad0c1eb364f2555e794c6a6c3bb0ec86b570d46e8b96b
     3. BitmapInitialized:
         Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
         User Count: 10000
         Bitmap Size: 1250 bytes
   原始日志:
     1. Program log: Instruction: SetMerkleRoot
     2. Program data: NNtiCMaE8JQJEBeRaTiiWO24NTx7/tv7PvViNm785CqsRUQjHQvEOQE=
     3. Program data: R1nXF3sLhxAJEBeRaTiiWO24NTx7/tv7PvViNm785CqsRUQjHQvEOQIAAAAlP+bN6lP1Lkgq0MHrNk8lVeeUxqbDuw7Ia1cNRui5aw==
     4. Program data: kVmUyuDtxhMJEBeRaTiiWO24NTx7/tv7PvViNm785CqsRUQjHQvEORAnAADiBAAA
----------------------------------------------------------------------------------------------------

3. [2025-10-10T09:25:08.000Z] 签名: 4Ck3EnDecDq5TASaVQ1Pcei5MPkdWM677Dh4ZF9hDAbX4UQaKYms4wL1kHoM3Jz9jshtGk5wRNeGnRhkuEHEZeyT
   Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
   Slot: 413608814
   解析的事件:
     1. Claimed:
         Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
         User: CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv
         Index: 4
         Amount: 1000000000
         Version: 2
   原始日志:
     1. Program log: Instruction: Claim
     2. Program data: 2cB7SGyW+CEJEBeRaTiiWO24NTx7/tv7PvViNm785CqsRUQjHQvEOabSM4fd+55MiUJONc1ZmWSn70WBZdDed2qyeT8LMDk5BAAAAAAAAAAAypo7AAAAAAIAAAA=
----------------------------------------------------------------------------------------------------

4. [2025-10-10T09:25:21.000Z] 签名: DFchrYYtbrb4nYpm7usWAmoGxBGC68mjaEdeiLRDXmN5Z7JA7tX5shejmnw4RUfjuhhD4R4acGYVyMd8kn7fwbE
   Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
   Slot: 413608848
   解析的事件:
     1. QuestStatusChanged:
         Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
         Status: Paused (2)
   原始日志:
     1. Program data: NNtiCMaE8JQJEBeRaTiiWO24NTx7/tv7PvViNm785CqsRUQjHQvEOQI=
----------------------------------------------------------------------------------------------------

5. [2025-10-10T09:25:33.000Z] 签名: JWGKbrKL6GFFSwwJTKvfnJF2kTmXDfH9yTQDJkoNZ5Pi2G2U7W5mPJSrW8KtjPzWckUdGdFCbbB454bXP9QEiUm
   Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
   Slot: 413608880
   解析的事件:
     1. QuestStatusChanged:
         Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
         Status: Active (1)
   原始日志:
     1. Program data: NNtiCMaE8JQJEBeRaTiiWO24NTx7/tv7PvViNm785CqsRUQjHQvEOQE=
----------------------------------------------------------------------------------------------------

6. [2025-10-10T09:53:51.000Z] 签名: qKxQ85PhtvqWUqJgk62wSbYetSe14kNTgJhcy4cejeynaNNd3xtagSgE8BhhcZYgv7m3o2tPF83gdCnb3p4anBx
   Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
   Slot: 413613327
   解析的事件:
     1. QuestClosed:
         Quest: cNuGaLLTCKQD58WHfRkPNLQdWx86eevGLgP66reaMGk
         Remaining Transferred: 999000000000
         Recipient: 9YGZyTfDhG2jFbvUaaLA9VLBZW9ZAPqDeGjka7XKUexa
   原始日志:
     1. Program data: xOPaiJyyQzQJEBeRaTiiWO24NTx7/tv7PvViNm785CqsRUQjHQvEOQBGCpnoAAAAfuAalo7ZKi8YdDlhCvldDs90dfcYaVcnuCodfNfY2+M=
----------------------------------------------------------------------------------------------------
✨  Done in 5.64s.
```