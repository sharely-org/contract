# Quest 扫描脚本使用说明

## 功能概述

Quest 扫描脚本提供了全面的 Quest事件监听功能，包括：

- 📜 查看 Quest 事件历史

## 使用方法

### 1. 扫描所有 Quest

```bash
# 扫描前 50 个 Quest ID（默认）
yarn backend:events


## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `MAX_QUEST_ID` | 扫描的最大 Quest ID | 50 |
| `RPC_URL` | Solana RPC 地址 | http://127.0.0.1:8899 |

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
$ ts-node scripts/backend/scan_quests.ts

🔍 扫描模式: 所有事件
🔍 从 Program 创建开始扫描所有事件...
📄 获取第 1 页交易...
📊 第 1 页找到 5 个交易
📊 总共处理了 5 个交易
📊 找到 3 个 Quest 相关事件
📊 涉及 1 个不同的 Quest

📈 事件统计:
==================================================
事件类型分布:
  QuestCreated: 1 个
  VaultFunded: 1 个
  QuestStatusChanged: 1 个
  Claimed: 1 个
  MerkleRootSet: 1 个
  BitmapInitialized: 1 个

📊 事件数据示例:
==================================================

QuestCreated 示例:
    Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
    Quest ID: 1
    Merchant: CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv
    Mint: DCDpBz2wzXpX4rD1F7o9jfxnzGEJ4AsP4TgDaaVi6ude
    Total Amount: 100000000000000
    Start: 2025-09-29T02:56:44.000Z
    End: 2025-09-29T03:56:44.000Z

VaultFunded 示例:
    Signature: CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv
    Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
    Amount: 100000000000000

QuestStatusChanged 示例:
    Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
    Status: Active (1)

MerkleRootSet 示例:
    Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
    Version: 2
    Merkle Root: 253fe6cdea53f52e482ad0c1eb364f2555e794c6a6c3bb0ec86b570d46e8b96b

BitmapInitialized 示例:
    Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
    User Count: 10000
    Bitmap Size: 1250 bytes

Claimed 示例:
    Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
    User: CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv
    Index: 4
    Amount: 1000000000
    Version: 2

时间范围: 2025-09-29T02:59:39.000Z 到 2025-09-29T03:00:42.000Z

📜 事件历史:
====================================================================================================

1. [2025-09-29T02:59:39.000Z] 签名: 2uCZEvU4Ddiy5GEr1juJNLX9RnkfSLCQbxKjLDkbPiQzYKKUgEkDVqRdBwR4DE53bebCAaqhc5taEgQdJVXUkYY4
   Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
   Slot: 411065910
   解析的事件:
     1. QuestCreated:
         Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
         Quest ID: 1
         Merchant: CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv
         Mint: DCDpBz2wzXpX4rD1F7o9jfxnzGEJ4AsP4TgDaaVi6ude
         Total Amount: 100000000000000
         Start: 2025-09-29T02:56:44.000Z
         End: 2025-09-29T03:56:44.000Z
     2. VaultFunded:
         Signature: CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv
         Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
         Amount: 100000000000000
   原始日志:
     1. Program log: Instruction: InitializeQuestByMerchant
     2. Program data: s1rJslpFSUNJwXB20I+zZfRFfyYrH0a7hpyN35PkaVWiCblXkWExJwEAAAAAAAAAptIzh937nkyJQk41zVmZZKfvRYFl0N53arJ5PwswOTm1LB7TPpUEt8n+q17PLljUSI/1wWm5wuc80Zsv2zm2NQBAehDzWgAAbPXZaAAAAAB8A9poAAAAAA==
     3. Program data: wHf1wTffwzKm0jOH3fueTIlCTjXNWZlkp+9FgWXQ3ndqsnk/CzA5OUnBcHbQj7Nl9EV/JisfRruGnI3fk+RpVaIJuVeRYTEnAEB6EPNaAAA=
----------------------------------------------------------------------------------------------------

2. [2025-09-29T03:00:32.000Z] 签名: 2Yb1pS26jXdBXgWV9aiyLaGFSCo7oyYcbvbWHsyUkpW99T45HVBN4vk2nNTkJLUhFEv3UFNmRKKti9fYghgwXPm5
   Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
   Slot: 411066048
   解析的事件:
     1. QuestStatusChanged:
         Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
         Status: Active (1)
     2. MerkleRootSet:
         Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
         Version: 2
         Merkle Root: 253fe6cdea53f52e482ad0c1eb364f2555e794c6a6c3bb0ec86b570d46e8b96b
     3. BitmapInitialized:
         Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
         User Count: 10000
         Bitmap Size: 1250 bytes
   原始日志:
     1. Program log: Instruction: SetMerkleRoot
     2. Program data: NNtiCMaE8JRJwXB20I+zZfRFfyYrH0a7hpyN35PkaVWiCblXkWExJwE=
     3. Program data: R1nXF3sLhxBJwXB20I+zZfRFfyYrH0a7hpyN35PkaVWiCblXkWExJwIAAAAlP+bN6lP1Lkgq0MHrNk8lVeeUxqbDuw7Ia1cNRui5aw==
     4. Program data: kVmUyuDtxhNJwXB20I+zZfRFfyYrH0a7hpyN35PkaVWiCblXkWExJxAnAADiBAAA
----------------------------------------------------------------------------------------------------

3. [2025-09-29T03:00:42.000Z] 签名: hjKECEoPkESAtHApZGKbVNu7FAksCSbKtXyCApbatJfa7ErTfZWytU7hKayyjk5vU1abAnofEdJN3Buq8XSxgpw
   Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
   Slot: 411066073
   解析的事件:
     1. Claimed:
         Quest: 5xuqkw3KQ18hcwec5XwctoXNf3h2irSKucYk5osvHxbg
         User: CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv
         Index: 4
         Amount: 1000000000
         Version: 2
   原始日志:
     1. Program log: Instruction: Claim
     2. Program data: 2cB7SGyW+CFJwXB20I+zZfRFfyYrH0a7hpyN35PkaVWiCblXkWExJ6bSM4fd+55MiUJONc1ZmWSn70WBZdDed2qyeT8LMDk5BAAAAAAAAAAAypo7AAAAAAIAAAA=
----------------------------------------------------------------------------------------------------
✨  Done in 3.09s.
```