# Sharely Contract (Quest 全局唯一 + 后台离线签名)

# 环境
- node: v20.18.1
- solana-cli 3.0.8 (src:b4d1c774; feat:3604001754, client:Agave)
- rustc 1.81.0 
- anchor-cli 0.31.1


注意事项：
rpc 选择：
测试阶段可以用官方提供的免费的(dev: https://api.devnet.solana.com, mainnet: https://api.mainnet.solana.com )，但是官方的rpc获取交易详情时，不会返回超过一定时间以上(大概一周)的log, 会导致无法解析event, 上线时采用第三方服务的rpc(https://dashboard.quicknode.com/), 创建一个solana endpoints 即可。


# 构建
- 执行: cargo update
- 执行：cargo clean
- 替换programs/sharely-contract/src/lib.rs 中的 AUTHORIZED_ADMIN，替换为上线后实际的admin地址
- anchor keys list -> programID, 
  - 替换所有的programId
    - Anchor.toml中[programs.devnet]sharely_contract = {programId} 、[programs.localnet]sharely_contract =  {programId}、[programs.mainnet]sharely_contract =  {programId}
    - .env 中 PROGRAM_ID
    - programs/sharely-contract/src/lib.rs 中 declare_id!("")处;
- 执行：anchor build
- 执行：anchor deploy,到这里，如果没有报错，程序已经部署成功

# 说明：
操作时生产的管理员秘钥不要在这里使用。这里的管理员秘钥仅供测试

## 角色
- 管理员 admin（离线签名批准 Quest 参数）
- 商户 merchant（提交初始化并注资、关闭并回收）
- 用户 user（领取）

## 流程（简）
1) 初始化全局配置：admin 调用 initialize 设置 admin 和 treasury 地址（仅需执行一次）
2) 后台（admin）生成签名：对 {program_id, merchant, mint, quest_id, total_amount, start_at, end_at, nonce} 进行 Ed25519 签名
3) 商户上链：先附加 ed25519 校验指令，再调用 initialize_quest_by_merchant 完成 quest 创建与注资
4) 管理员激活 quest：调用 activate_quest 设置 merkle root、用户数量、开始/结束时间、手续费并启动 quest
5) 用户在时间窗内 claim
6) 结束后商户 close_quest 回收未领取

## PDA 与账户
- config: seeds=["config"] - 全局配置账户，存储 admin 和 treasury
- quest: seeds=["quest", quest_id_le] - Quest 账户
- vault_authority: seeds=["vault_auth", quest] - Vault 权限账户
- vault: ATA(mint, vault_authority) - Token 金库账户
- bitmap: seeds=["bitmap", quest] - 领取位图账户

## 指令摘要
- initialize(admin, treasury) [仅 admin，仅需执行一次]
  - 初始化全局配置账户，设置 admin 和 treasury 地址
- initialize_quest_by_merchant(quest_id, total_amount, approval_bytes)
  - 校验 ed25519 签名（从 sysvar instructions）与消息体
  - 创建 quest，写入 {merchant, admin, 总额度}
  - 从商户 ATA 注资 total_amount 到 vault
  - status=Pending
- activate_quest(merkle_root, user_count, start_at, end_at, fee_amount) [仅 admin]
  - 设置 merkle root、用户数量、开始/结束时间、手续费
  - 创建或更新位图账户
  - status=Active（未发生领取）
- claim(index, amount, proof) [用户]
  - 时间窗 + merkle 校验，从 vault 转至用户 ATA
  - 更新位图标记已领取
- pause_quest() / resume_quest() [仅 admin]
  - 暂停/恢复 quest
- cancel_quest() [仅 admin]
  - 取消 quest，将 vault 中的 token 转回商户 ATA
- close_quest_by_merchant() [仅 merchant，需 now > end_at]
  - 关闭 quest，将手续费转至 treasury，剩余转回商户 ATA
- change_admin(new_admin) [仅 admin]
  - 更改管理员地址
- update_treasury(new_treasury) [仅 admin]
  - 更改 treasury 地址

## 脚本

### 初始化脚本
- scripts/admin/init_global_config.ts：初始化全局配置
  - 环境：
    - ADMIN_SECRET_JSON
    - TREASURY_PUBKEY - Treasury 地址
    - RPC_URL
  - 命令：`npm run admin:init:config`

### 管理脚本
- scripts/admin/generate-merkle.ts：生成默克尔树
  - 提前准备好用户的空投和数量，参考脚本
  - 生成的 MERKLE_ROOT_HEX 放到 .env
  - 命令：`npm run admin:gen-merkle`

- scripts/admin/admin_sign.ts：生成离线消息与签名
  - 环境：
    - ADMIN_SECRET_JSON
    - PROGRAM_ID (anchor keys list 获取)
    - MERCHANT_PUBKEY - 商户地址
    - MINT_PUBKEY - USDT 或 USDC token 地址
    - QUEST_ID
    - TOTAL_AMOUNT
    - START_AT - 时间戳
    - END_AT - 时间戳
  - 输出：ADMIN_PUBKEY, MESSAGE_BASE58, SIGNATURE_BASE58
  - 命令：`npm run admin:sign`

- scripts/admin/activate_quest.ts：激活 quest（设置 merkle root 并启动）
  - 环境：
    - ADMIN_SECRET_JSON
    - QUEST_ID
    - MERKLE_ROOT_HEX - 64 位十六进制字符串（32 字节）
    - USER_COUNT - 空投人数，必须大于或等于实际空投人数
    - RPC_URL
  - 注意：脚本会自动计算 start_at（当前时间+600秒）和 end_at（start_at+7天），fee_amount 为固定值
  - 如需自定义时间，需要修改脚本
  - 命令：`npm run admin:activate:quest`

- scripts/admin/pause.ts：暂停 quest
  - 环境：
    - ADMIN_SECRET_JSON
    - QUEST_PUBKEY
    - RPC_URL
  - 命令：`npm run admin:pause`

- scripts/admin/resume.ts：恢复 quest
  - 环境：
    - ADMIN_SECRET_JSON
    - QUEST_PUBKEY
    - RPC_URL
  - 命令：`npm run admin:resume`

- scripts/admin/change_admin.ts：更改管理员地址
  - 环境：
    - ADMIN_SECRET_JSON（当前管理员）
    - NEW_ADMIN_PUBKEY - 新管理员地址
    - RPC_URL
  - 命令：`npm run admin:change:admin`

- scripts/admin/change_treasury.ts：更改 Treasury 地址
  - 环境：
    - ADMIN_SECRET_JSON
    - NEW_TREASURY_PUBKEY - 新 Treasury 地址
    - RPC_URL
  - 命令：`npm run admin:change:treasury`

- scripts/admin/close.ts：关闭 quest 并取回未领取空投
  - 环境：
    - ADMIN_SECRET_JSON
    - QUEST_PUBKEY
    - DESTINATION_ATA 或 MERCHANT_PUBKEY - 接受 ATA 地址或钱包地址（二选一）
  - 注意：关闭 quest 必须在 quest 结束后才能执行
  - 命令：`npm run admin:close`

### 商户脚本
- scripts/merchant/merchant_init.ts：组装 ed25519 指令并调用 initialize_quest_by_merchant
  - 环境：
    - MERCHANT_SECRET_JSON - 商户私钥
    - ADMIN_PUBKEY
    - PROGRAM_ID
    - MINT_PUBKEY
    - QUEST_ID
    - TOTAL_AMOUNT
    - MESSAGE_BASE58 - admin_sign.ts 生成
    - SIGNATURE_BASE58 - admin_sign.ts 生成
    - RPC_URL
  - 命令：`npm run merchant:init`

- scripts/merchant/close.ts：商户关闭 quest（仅商户可调用）
  - 环境：
    - MERCHANT_SECRET_JSON
    - QUEST_PUBKEY
    - RPC_URL
  - 注意：必须在 quest 结束后才能执行

### 用户脚本
- scripts/user/claim.ts：用户领取空投
  - 环境：
    - USER_SECRET_JSON
    - QUEST_PUBKEY
    - MINT_PUBKEY
    - INDEX - 生成默克尔树时的 user index
    - AMOUNT - 生成默克尔树时的 user amount
    - PROOF_JSON - 默克尔树 user 对应的 proof
    - RPC_URL
  - 命令：`npm run user:claim`

## 事件说明
所有事件现在都包含 `quest_id` 字段，方便后端直接获取 questId 而无需通过 questAddress 查询数据库：
- QuestCreated - 包含 quest_id
- VaultFunded - 包含 quest_id
- QuestActivated - 包含 quest_id, start_at, end_at, fee_amount
- Claimed - 包含 quest_id
- QuestStatusChanged - 包含 quest_id
- QuestClosed - 包含 quest_id
- QuestCancelled - 包含 quest_id
- BitmapInitialized - 包含 quest_id

## 部署成功后正常流程
需要自行替换每一步生成的参数到环境变量：

1. 初始化全局配置（仅需执行一次）：
   ```bash
   npm run admin:init:config
   ```

2. 生成管理员签名：
   ```bash
   npm run admin:sign
   ```

3. 商户初始化 quest：
   ```bash
   npm run merchant:init
   ```

4. 管理员激活 quest（设置 merkle root 并启动）：
   ```bash
   npm run admin:activate:quest
   ```

5. 用户领取：
   ```bash
   npm run user:claim
   ```

6. 关闭 quest（商户或管理员）：
   ```bash
   npm run admin:close
   # 或
   npm run merchant:close
   ```