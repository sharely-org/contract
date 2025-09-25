# Sharely Contract (Quest 全局唯一 + 后台离线签名)

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
- approval_used: seeds=["approval", admin, merchant, quest_id_le]

## 指令摘要
- initialize_quest_by_merchant(admin_pubkey, approval_bytes, nonce)
  - 校验 ed25519 签名（从 sysvar instructions）与消息体
  - 创建 quest，写入 {merchant, admin, 时间窗，总额度}
  - 从商户 ATA 注资 total_amount 到 vault
- set_merkle_root(new_root) [仅 admin]
  - 写入 root，置 is_started=true，status=Active（未发生领取）
- claim(...) [用户]
  - 时间窗 + merkle 校验，从 vault 转至用户 ATA
- end_quest [仅 admin]
- close_quest(destination_ata) [仅 merchant，需 now > end_at 且 status=Ended]

## 脚本
- scripts/admin/admin_sign.ts：生成离线消息与签名
  - 环境：ADMIN_SECRET_JSON, PROGRAM_ID, MERCHANT_PUBKEY, MINT_PUBKEY, QUEST_ID, TOTAL_AMOUNT, START_AT, END_AT, NONCE
  - 输出：ADMIN_PUBKEY, MESSAGE_BASE58, SIGNATURE_BASE58
- scripts/admin/merchant_init.ts：组装 ed25519 指令并调用 initialize_quest_by_merchant
  - 环境：USER_SECRET_JSON(商户), ADMIN_PUBKEY, PROGRAM_ID, MINT_PUBKEY, QUEST_ID, TOTAL_AMOUNT, START_AT, END_AT, NONCE, MESSAGE_BASE58, SIGNATURE_BASE58, RPC_URL

## 兼容性
- 已移除 campaign 依赖（保留空壳以兼容旧脚本）
