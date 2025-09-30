use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::hash::hashv;
use anchor_lang::solana_program::sysvar::instructions::load_instruction_at_checked;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("3DdyZ9jSBb1HWVZ1K4mZB6EZV8EURQZY4XhAoUMTU2Wx");

const AUTHORIZED_ADMIN: Pubkey = pubkey!("CECahCnakNKuoUrYkG6qc65wJjyq8yfMfmu9DTWng6uv");

#[program]
pub mod sharely_contract {
    use super::*;

    // 商户初始化：admin 离线签名 + ed25519 验证
    pub fn initialize_quest_by_merchant(
        ctx: Context<InitializeQuestByMerchant>,
        quest_id: u64,
        total_amount: u64,
        start_at: i64,
        end_at: i64,
        approval_bytes: Vec<u8>,
    ) -> Result<()> {
        require!(total_amount > 0, SharelyError::InvalidAmount);
        require!(end_at > start_at, SharelyError::InvalidArgument);
        // 校验 ed25519 签名，并核对消息体
        verify_ed25519_signature(
            &ctx.accounts.instructions,
            &AUTHORIZED_ADMIN,
            &approval_bytes,
        )?;
        verify_approval_message(
            &approval_bytes,
            &AUTHORIZED_ADMIN,
            &ctx.accounts.merchant.key(),
            &ctx.accounts.mint.key(),
            &quest_id,
            &total_amount,
            &start_at,
            &end_at,
        )?;

        // 手动创建 vault ATA
        let quest_key = ctx.accounts.quest.key();
        let vault_seeds = &[
            b"vault_auth",
            quest_key.as_ref(),
            &[ctx.bumps.vault_authority],
        ];
        let vault_signer = &[&vault_seeds[..]];

        let create_ata_ctx = CpiContext::new_with_signer(
            ctx.accounts.associated_token_program.to_account_info(),
            anchor_spl::associated_token::Create {
                payer: ctx.accounts.merchant.to_account_info(),
                associated_token: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
            },
            vault_signer,
        );
        anchor_spl::associated_token::create(create_ata_ctx)?;

        let quest = &mut ctx.accounts.quest;
        quest.quest_id = quest_id;
        quest.mint = ctx.accounts.mint.key();
        quest.vault = ctx.accounts.vault.key();
        quest.vault_authority = ctx.accounts.vault_authority.key();
        quest.merchant = ctx.accounts.merchant.key();
        quest.admin = AUTHORIZED_ADMIN;
        quest.merkle_root = [0u8; 32];
        quest.claimed_total = 0;
        quest.status = Status::Pending; // 未启动
        quest.version = 1;
        quest.start_at = start_at;
        quest.end_at = end_at;
        quest.total_amount = total_amount;
        quest.funded_amount = 0;

        // 商户注资 total_amount 到 vault
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.merchant_source_ata.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.merchant.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, total_amount)?;
        quest.funded_amount = total_amount;

        emit!(QuestCreated {
            quest: quest.key(),
            quest_id,
            merchant: ctx.accounts.merchant.key(),
            mint: ctx.accounts.mint.key(),
            total_amount,
            start_at,
            end_at,
        });

        emit!(VaultFunded {
            funder: ctx.accounts.merchant.key(),
            quest: quest.key(),
            amount: total_amount
        });
        Ok(())
    }

    pub fn set_merkle_root(
        ctx: Context<SetMerkleRootWithBitmap>,
        new_merkle_root: [u8; 32],
        user_count: u32,
    ) -> Result<()> {
        // 仅管理员可设置 root 并启动
        require!(
            ctx.accounts.admin.key() == ctx.accounts.quest.admin,
            SharelyError::Unauthorized
        );
        let quest = &mut ctx.accounts.quest;
        // 设置 root（允许在未启动或暂停时，且未发生任何领取）
        require!(quest.claimed_total == 0, SharelyError::InvalidArgument);
        require!(user_count > 0, SharelyError::InvalidArgument);
        require!(user_count <= 1000000, SharelyError::InvalidArgument); // 限制最大 100 万用户

        quest.merkle_root = new_merkle_root;
        quest.version = quest.version.checked_add(1).ok_or(SharelyError::Overflow)?;

        // 位图由 init_if_needed 自动创建，这里只需要更新数据
        let bitmap_size = (user_count + 7) / 8; // 向上取整到字节
        let required_space = 8 + 32 + 2 + 4 + 4 + 4 + bitmap_size as usize;

        // 检查空间是否足够，如果不够则重新分配
        let account_info = ctx.accounts.bitmap_shard.to_account_info();
        let current_space = account_info.data_len();
        if required_space > current_space {
            account_info.realloc(required_space, false)?;
            let additional_lamports = Rent::get()?.minimum_balance(required_space)
                - Rent::get()?.minimum_balance(current_space);
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.admin.to_account_info(),
                        to: account_info,
                    },
                ),
                additional_lamports,
            )?;
        }
        let shard = &mut ctx.accounts.bitmap_shard;
        shard.user_count = user_count;
        shard.shard_id = 0;
        shard.quest = quest.key();
        shard.bits = vec![0; bitmap_size as usize];

        // 启动 quest
        quest.status = Status::Active;

        emit!(QuestStatusChanged {
            quest: quest.key(),
            status: quest.status
        });

        emit!(MerkleRootSet {
            quest: quest.key(),
            version: quest.version,
            merkle_root: quest.merkle_root
        });

        emit!(BitmapInitialized {
            quest: quest.key(),
            user_count,
            bitmap_size,
        });

        Ok(())
    }

    pub fn pause_quest(ctx: Context<AdminOnQuest>) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.quest.admin,
            SharelyError::Unauthorized
        );
        require!(
            ctx.accounts.quest.status == Status::Active,
            SharelyError::InvalidStatus
        );
        ctx.accounts.quest.status = Status::Paused;
        emit!(QuestStatusChanged {
            quest: ctx.accounts.quest.key(),
            status: ctx.accounts.quest.status
        });
        Ok(())
    }

    pub fn resume_quest(ctx: Context<AdminOnQuest>) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.quest.admin,
            SharelyError::Unauthorized
        );
        require!(
            ctx.accounts.quest.status == Status::Paused,
            SharelyError::InvalidStatus
        );
        ctx.accounts.quest.status = Status::Active;
        emit!(QuestStatusChanged {
            quest: ctx.accounts.quest.key(),
            status: ctx.accounts.quest.status
        });
        Ok(())
    }

    pub fn end_quest(ctx: Context<AdminOnQuest>) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.quest.admin,
            SharelyError::Unauthorized
        );
        require!(
            ctx.accounts.quest.status != Status::Ended,
            SharelyError::InvalidStatus
        );
        ctx.accounts.quest.status = Status::Ended;
        emit!(QuestStatusChanged {
            quest: ctx.accounts.quest.key(),
            status: ctx.accounts.quest.status
        });
        Ok(())
    }

    pub fn claim(ctx: Context<Claim>, index: u64, amount: u64, proof: Vec<[u8; 32]>) -> Result<()> {
        let quest = &mut ctx.accounts.quest;
        require!(quest.status == Status::Active, SharelyError::QuestNotActive);
        let now_ts = Clock::get()?.unix_timestamp;
        require!(now_ts >= quest.start_at, SharelyError::InvalidStatus);
        require!(now_ts <= quest.end_at, SharelyError::InvalidStatus);
        require!(amount > 0, SharelyError::InvalidAmount);
        require!(
            proof.len() as u8 <= MAX_PROOF_NODES,
            SharelyError::ProofTooLong
        );
        require!(
            ctx.accounts.user_ata.mint == quest.mint,
            SharelyError::AccountMismatch
        );
        let leaf = leaf_hash(index, ctx.accounts.user.key(), amount);
        let computed_root = compute_merkle_root_sorted(leaf, &proof);
        require!(
            computed_root == quest.merkle_root,
            SharelyError::InvalidProof
        );
        // 检查索引是否在有效范围内
        require!(
            index < ctx.accounts.bitmap_shard.user_count as u64,
            SharelyError::BitmapIndexOutOfRange
        );

        // 计算位图位置
        let byte_index = (index / 8) as usize;
        let bit_offset = (index % 8) as u8;
        let bit_mask = 1u8 << bit_offset;

        // 检查是否已领取
        let shard = &mut ctx.accounts.bitmap_shard;
        let byte = shard.bits.get(byte_index).copied().unwrap_or(0);
        require!((byte & bit_mask) == 0, SharelyError::AlreadyClaimed);
        let mut_byte = &mut shard.bits[byte_index];
        *mut_byte |= bit_mask;
        let bump = ctx.bumps.vault_authority;
        let quest_key = quest.key();
        let signer_seeds: &[&[u8]] = &[b"vault_auth", quest_key.as_ref(), &[bump]];
        let signer = [signer_seeds];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.vault.to_account_info(),
                to: ctx.accounts.user_ata.to_account_info(),
                authority: ctx.accounts.vault_authority.to_account_info(),
            },
            &signer,
        );
        token::transfer(cpi_ctx, amount)?;
        quest.claimed_total = quest
            .claimed_total
            .checked_add(amount)
            .ok_or(SharelyError::Overflow)?;
        emit!(Claimed {
            quest: quest.key(),
            user: ctx.accounts.user.key(),
            index,
            amount,
            version: quest.version
        });
        Ok(())
    }

    pub fn close_quest(ctx: Context<CloseQuest>) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.quest.admin,
            SharelyError::Unauthorized
        );

        let now_ts = Clock::get()?.unix_timestamp;
        require!(
            now_ts > ctx.accounts.quest.end_at,
            SharelyError::InvalidStatus
        );
        let amount = ctx.accounts.vault.amount;
        if amount > 0 {
            let bump = ctx.bumps.vault_authority;
            let quest_key = ctx.accounts.quest.key();
            let signer_seeds: &[&[u8]] = &[b"vault_auth", quest_key.as_ref(), &[bump]];
            let signer = [signer_seeds];
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.destination_ata.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                &signer,
            );
            token::transfer(cpi_ctx, amount)?;
        }
        emit!(QuestClosed {
            quest: ctx.accounts.quest.key(),
            remaining_transferred: amount
        });
        Ok(())
    }

    // =========================
    // Query Instructions
    // =========================

    pub fn is_claimed(ctx: Context<IsClaimed>, index: u64) -> Result<bool> {
        let bitmap_shard = &ctx.accounts.bitmap_shard;

        // 检查索引是否在有效范围内
        require!(
            index < bitmap_shard.user_count as u64,
            SharelyError::BitmapIndexOutOfRange
        );

        let byte_index = (index / 8) as usize;
        let bit_offset = (index % 8) as u8;
        let mask = 1u8 << bit_offset;

        require!(
            byte_index < bitmap_shard.bits.len(),
            SharelyError::BitmapIndexOutOfRange
        );

        let is_claimed = (bitmap_shard.bits[byte_index] & mask) != 0;

        Ok(is_claimed)
    }

    pub fn verify_eligibility(
        ctx: Context<VerifyEligibility>,
        index: u64,
        amount: u64,
        proof: Vec<[u8; 32]>,
    ) -> Result<bool> {
        let quest = &ctx.accounts.quest;

        require!(quest.status == Status::Active, SharelyError::QuestNotActive);

        let leaf = leaf_hash(index, ctx.accounts.user.key(), amount);
        let computed_root = compute_merkle_root_sorted(leaf, &proof);

        let is_valid = computed_root == quest.merkle_root;

        Ok(is_valid)
    }
}

// =========================
// Accounts
// =========================

#[account]
pub struct QuestAccount {
    pub quest_id: u64,
    pub mint: Pubkey,
    pub vault: Pubkey,
    pub vault_authority: Pubkey,
    pub merkle_root: [u8; 32],
    pub claimed_total: u64,
    pub status: Status,
    pub version: u32,
    pub merchant: Pubkey,
    pub admin: Pubkey,
    pub start_at: i64,
    pub end_at: i64,
    pub total_amount: u64,
    pub funded_amount: u64,
}

#[account]
pub struct ClaimBitmapShard {
    pub quest: Pubkey,
    pub shard_id: u16,   // 固定为 0，保持兼容性
    pub user_count: u32, // 实际用户数量
    pub bits: Vec<u8>,   // 动态大小的位图
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Pending,
    Active,
    Paused,
    Ended,
}

// =========================
// Contexts
// =========================

#[derive(Accounts)]
#[instruction(quest_id: u64)]
pub struct InitializeQuestByMerchant<'info> {
    // 移除 admin 账户，因为使用固定公钥验证
    #[account(mut)]
    pub merchant: Signer<'info>,
    #[account(mut)]
    pub merchant_source_ata: Account<'info, TokenAccount>,
    // space 计算：
    // 8 (discriminator)
    // + 8 (quest_id)
    // + 32 (mint)
    // + 32 (vault)
    // + 32 (vault_authority)
    // + 32 (merkle_root)
    // + 8 (claimed_total)
    // + 1 (status)
    // + 4 (version)
    // + 32 (merchant)
    // + 32 (admin)
    // + 8 (start_at)
    // + 8 (end_at)
    // + 8 (total_amount)
    // + 8 (funded_amount)
    #[account(init, payer = merchant, space = 8 + 8 + 32 + 32 + 32 + 32 + 8 + 1 + 4 + 32 + 32 + 8 + 8 + 8 + 8, seeds = [b"quest".as_ref(), &quest_id.to_le_bytes()], bump)]
    pub quest: Account<'info, QuestAccount>,
    pub mint: Account<'info, Mint>,
    /// CHECK: PDA authority derived by program
    #[account(seeds = [b"vault_auth", quest.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    /// CHECK: ATA will be created manually
    #[account(mut)]
    pub vault: UncheckedAccount<'info>,
    /// CHECK: instructions sysvar for ed25519 verification
    #[account(address = anchor_lang::solana_program::sysvar::instructions::id())]
    pub instructions: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AdminOnQuest<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub quest: Account<'info, QuestAccount>,
}

#[derive(Accounts)]
#[instruction(user_count: u32)]
pub struct SetMerkleRootWithBitmap<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub quest: Account<'info, QuestAccount>,
    /// CHECK: 动态大小的位图
    #[account(init_if_needed, payer = admin, space = 8 + 32 + 2 + 4 + 4 + 4 + 1, seeds = [b"bitmap", quest.key().as_ref()], bump)]
    pub bitmap_shard: Account<'info, ClaimBitmapShard>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Claim<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(mut)]
    pub quest: Account<'info, QuestAccount>,
    /// CHECK: PDA authority
    #[account(seeds = [b"vault_auth", quest.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, address = quest.vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user_ata: Account<'info, TokenAccount>,
    /// 动态位图
    #[account(mut, seeds = [b"bitmap", quest.key().as_ref()], bump)]
    pub bitmap_shard: Account<'info, ClaimBitmapShard>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct IsClaimed<'info> {
    pub quest: Account<'info, QuestAccount>,
    #[account(seeds = [b"bitmap", quest.key().as_ref()], bump)]
    pub bitmap_shard: Account<'info, ClaimBitmapShard>,
    /// CHECK: user
    pub user: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct VerifyEligibility<'info> {
    pub quest: Account<'info, QuestAccount>,
    /// CHECK: 仅用于身份标识，不读取数据
    pub user: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CloseQuest<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut, has_one = admin)]
    pub quest: Account<'info, QuestAccount>,
    /// CHECK: PDA authority
    #[account(seeds = [b"vault_auth", quest.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, address = quest.vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub destination_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

// =========================
// Events
// =========================

#[event]
pub struct QuestCreated {
    pub quest: Pubkey,
    pub quest_id: u64,
    pub merchant: Pubkey,
    pub mint: Pubkey,
    pub total_amount: u64,
    pub start_at: i64,
    pub end_at: i64,
}

#[event]
pub struct QuestStatusChanged {
    pub quest: Pubkey,
    pub status: Status,
}

#[event]
pub struct VaultFunded {
    pub funder: Pubkey,
    pub quest: Pubkey,
    pub amount: u64,
}

#[event]
pub struct MerkleRootSet {
    pub quest: Pubkey,
    pub version: u32,
    pub merkle_root: [u8; 32],
}
#[event]
pub struct Claimed {
    pub quest: Pubkey,
    pub user: Pubkey,
    pub index: u64,
    pub amount: u64,
    pub version: u32,
}
#[event]
pub struct QuestClosed {
    pub quest: Pubkey,
    pub remaining_transferred: u64,
}

#[event]
pub struct BitmapInitialized {
    pub quest: Pubkey,
    pub user_count: u32,
    pub bitmap_size: u32,
}

// =========================
// Errors
// =========================
#[error_code]
pub enum SharelyError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid status")]
    InvalidStatus,
    #[msg("Invalid mint or account mismatch")]
    AccountMismatch,
    #[msg("Invalid amount")]
    InvalidAmount,
    #[msg("Invalid proof")]
    InvalidProof,
    #[msg("Already claimed")]
    AlreadyClaimed,
    #[msg("Vault insufficient")]
    VaultInsufficient,
    #[msg("Proof too long")]
    ProofTooLong,
    #[msg("Bitmap index out of range")]
    BitmapIndexOutOfRange,
    #[msg("Quest not active")]
    QuestNotActive,
    #[msg("Overflow")]
    Overflow,
    #[msg("Invalid argument")]
    InvalidArgument,
    #[msg("Invalid ed25519 signature")]
    InvalidSignature,
}

// =========================
// Helpers
// =========================

fn leaf_hash(index: u64, user: Pubkey, amount: u64) -> [u8; 32] {
    let idx_le = index.to_le_bytes();
    let amt_le = amount.to_le_bytes();
    let data: Vec<&[u8]> = vec![&idx_le, user.as_ref(), &amt_le];
    let h = hashv(&data);
    h.to_bytes()
}

fn hash_pair_sorted(a: [u8; 32], b: [u8; 32]) -> [u8; 32] {
    if a <= b {
        hashv(&[&a, &b]).to_bytes()
    } else {
        hashv(&[&b, &a]).to_bytes()
    }
}

fn compute_merkle_root_sorted(leaf: [u8; 32], proof: &Vec<[u8; 32]>) -> [u8; 32] {
    let mut acc = leaf;
    for p in proof.iter() {
        acc = hash_pair_sorted(acc, *p);
    }
    acc
}

fn verify_ed25519_signature(
    instructions_sysvar: &AccountInfo,
    admin_pubkey: &Pubkey,
    message: &[u8],
) -> Result<()> {
    let mut found = false;
    let mut idx: usize = 0;
    loop {
        let loaded = load_instruction_at_checked(idx, instructions_sysvar);
        if loaded.is_err() {
            break;
        }
        let ix = loaded.unwrap();
        if ix.program_id == ed25519_program::id() {
            // 验证 ed25519 指令中的公钥和消息
            if ix.data.len() >= 16 + 64 + 32 {
                let pubkey_bytes = &ix.data[16..48];
                let _signature_bytes = &ix.data[48..112];
                let message_bytes = &ix.data[112..];

                // 检查公钥是否匹配
                if pubkey_bytes == admin_pubkey.as_ref() && message_bytes == message {
                    // 这里应该验证签名，但 Solana 的 ed25519 程序已经验证过了
                    // 我们只需要确保指令存在且参数正确
                    found = true;
                    break;
                }
            }
        }
        idx += 1;
    }
    require!(found, SharelyError::InvalidSignature);
    Ok(())
}

fn verify_approval_message(
    approval_bytes: &[u8],
    admin_pubkey: &Pubkey,
    merchant: &Pubkey,
    mint: &Pubkey,
    quest_id: &u64,
    total_amount: &u64,
    start_at: &i64,
    end_at: &i64,
) -> Result<()> {
    // 构建期望的消息内容
    let domain = hashv(&[b"sharely:v1"]);
    let expected_message = [
        domain.as_ref(),
        admin_pubkey.as_ref(),
        merchant.as_ref(),
        mint.as_ref(),
        &quest_id.to_le_bytes(),
        &total_amount.to_le_bytes(),
        &start_at.to_le_bytes(),
        &end_at.to_le_bytes(),
    ];
    let expected_bytes = expected_message.concat();

    // 验证消息内容匹配
    require!(
        approval_bytes == expected_bytes,
        SharelyError::InvalidSignature
    );
    Ok(())
}

// =========================
// Constants
// =========================

pub const MAX_PROOF_NODES: u8 = 32;
