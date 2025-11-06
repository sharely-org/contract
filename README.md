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
- 执行: carge update
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
1) 后台（admin）生成签名：对 {program_id, merchant, mint, quest_id, total_amount, start_at, end_at, nonce} 进行 Ed25519 签名
2) 商户上链：先附加 ed25519 校验指令，再调用 initialize_quest_by_merchant 完成 quest 创建与注资
3) 管理员设置 merkle root 并启动：set_merkle_root
4) 用户在时间窗内 claim
5) 结束后商户 close_quest 回收未领取

## PDA 与账户
- quest: seeds=["quest", quest_id_le]
- vault_authority: seeds=["vault_auth", quest]
- vault: ATA(mint, vault_authority)

## 指令摘要
- initialize_quest_by_merchant(admin_pubkey, approval_bytes, nonce)
  - 校验 ed25519 签名（从 sysvar instructions）与消息体
  - 创建 quest，写入 {merchant, admin, 时间窗，总额度}
  - 从商户 ATA 注资 total_amount 到 vault
  - status=Pending
- set_merkle_root(new_root) [仅 admin]
  - 写入 root，status=Active（未发生领取）
- claim(...) [用户]
  - 时间窗 + merkle 校验，从 vault 转至用户 ATA
- end_quest [仅 admin]
- close_quest(destination_ata) [仅 admin，需 now > end_at]
  - 未领取空投转回商户ATA账户

## 脚本
- scripts/admin/generate-merkle.ts 生成默克尔树
  - 提前准备好用户的空投和数量，参考脚本
  - 生成的MERKLE_ROOT_HEX放到.env
- scripts/admin/admin_sign.ts：生成离线消息与签名
  - 环境：
    - ADMIN_SECRET_JSON, 
    - PROGRAM_ID, anchor keys list 获取
    - MERCHANT_PUBKEY, 商户地址
    - MINT_PUBKEY, usdt或者usdc token地址
    - QUEST_ID, 
    - TOTAL_AMOUNT, 
    - START_AT, 时间戳
    - END_AT 时间戳
  - 输出：ADMIN_PUBKEY, MESSAGE_BASE58, SIGNATURE_BASE58
- scripts/admin/set-merkle-root.ts
  - 环境：
    - ADMIN_SECRET_JSON
    - MERKLE_ROOT_HEX, 
    - USER_COUNT 空投人数，一定要大于或等于实际空投人数，多一些没有关系
- scripts/merchant/merchant_init.ts：组装 ed25519 指令并调用 initialize_quest_by_merchant
  - 环境：
    - MERCHANT_SECRET_JSON(商户), 
    - ADMIN_PUBKEY, 
    - PROGRAM_ID, 
    - MINT_PUBKEY, 
    - QUEST_ID, 
    - TOTAL_AMOUNT, 
    - START_AT, 
    - END_AT, 
    - MESSAGE_BASE58, admin_sign.ts生成
    - SIGNATURE_BASE58, admin_sign.ts生成
    - RPC_URL
- scripts/user/claims.ts
  - 环境：USER_SECRET_JSON, QUEST_PUBKEY, MINT_PUBKEY,  
    - proof相关：index, AMOUNT, PROOF_JSON
      - index 生成默克尔树时的user index
      - AMOUNT 生成默克尔树时的user amount
      - PROOF_JSON 默克尔树user对应的proof
- scripts/admin/close.ts 关闭quest并取回未领取空投，未领取空投转回地址需要指定，可以是管理员的ATA，也可以是商户的ATA， 关闭quest一定要quest结束才能关闭
 - 环境
   - ADMIN_SECRET_JSON
   - QUEST_PUBKEY
   - DESTINATION_ATA 或者 MERCHANT_PUBKEY， 接受ATA地址或者钱包地址，二选一，如果只提供MERCHANT_PUBKEY， 会根据MERCHANT_PUBKEY自动查找ATA地址

# 部署成功后正常流程如下，需要自行替换每一步生成的参数到环境变量
 yarn admin:sign -> yarn merchant:init -> yarn admin:set:root -> yarn user:claim -> yarn admin:close