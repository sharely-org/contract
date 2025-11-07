use anchor_lang::prelude::*;
use anchor_lang::solana_program::ed25519_program;
use anchor_lang::solana_program::hash::hashv;
use anchor_lang::solana_program::sysvar::instructions::load_instruction_at_checked;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("51QFasYaoDzvJuTv7Bbfn1GkV8H1aKUD7iwx1W6SETpj");

#[program]
pub mod sharely_contract {
    use super::*;

    // 初始化全局配置（仅管理员可调用，只需调用一次）
    pub fn initialize(ctx: Context<Initialize>, admin: Pubkey, treasury: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.treasury = treasury;
        config.admin = admin;
        emit!(Initialized {
            admin: ctx.accounts.admin.key(),
            treasury: treasury,
        });
        Ok(())
    }

    pub fn change_admin(ctx: Context<ChangeAdmin>, new_admin: Pubkey) -> Result<()> {
        let config = &mut ctx.accounts.config;

        require_keys_eq!(
            ctx.accounts.signer.key(),
            config.admin,
            SharelyError::Unauthorized
        );

        config.admin = new_admin;
        emit!(AdminChanged {
            old_admin: config.admin,
            new_admin: new_admin
        });
        Ok(())
    }

    // 商户初始化：admin 离线签名 + ed25519 验证
    pub fn initialize_quest_by_merchant(
        ctx: Context<InitializeQuestByMerchant>,
        quest_id: u64,
        total_amount: u64,
        approval_bytes: Vec<u8>,
    ) -> Result<()> {
        require!(total_amount > 0, SharelyError::InvalidAmount);
        // 校验 end_at 是否大于当前时间

        let config = &mut ctx.accounts.config;
        // 校验 ed25519 签名，并核对消息体
        verify_ed25519_signature(&ctx.accounts.instructions, &config.admin, &approval_bytes)?;
        verify_approval_message(
            &approval_bytes,
            &config.admin,
            &ctx.accounts.merchant.key(),
            &ctx.accounts.mint.key(),
            &quest_id,
            &total_amount,
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

        let quest = &mut ctx.accounts.quest;
        quest.quest_id = quest_id;
        quest.mint = ctx.accounts.mint.key();
        quest.vault = ctx.accounts.vault.key();
        quest.vault_authority = ctx.accounts.vault_authority.key();
        quest.merchant = ctx.accounts.merchant.key();
        quest.admin = config.admin;
        quest.merkle_root = [0u8; 32];
        quest.claimed_total = 0;
        quest.status = Status::Pending; // 未启动
        quest.version = 1;
        quest.start_at = 0;
        quest.end_at = 0;
        quest.total_amount = total_amount;
        quest.funded_amount = 0;
        quest.funded_amount = total_amount;

        emit!(QuestCreated {
            status: quest.status,
            quest: quest.key(),
            quest_id,
            merchant: ctx.accounts.merchant.key(),
            mint: ctx.accounts.mint.key(),
            total_amount
        });

        emit!(VaultFunded {
            funder: ctx.accounts.merchant.key(),
            quest: quest.key(),
            quest_id: quest.quest_id,
            amount: total_amount
        });
        Ok(())
    }

    pub fn activate_quest(
        ctx: Context<ActivateQuest>,
        merkle_root: [u8; 32],
        user_count: u32,
        start_at: i64,
        end_at: i64,
        fee_amount: u64,
    ) -> Result<()> {
        // 仅管理员可设置 root 并启动
        require!(
            ctx.accounts.admin.key() == ctx.accounts.quest.admin,
            SharelyError::Unauthorized
        );
        require!(end_at > start_at, SharelyError::InvalidArgument);
        // 校验 end_at 是否大于当前时间
        require!(
            end_at > Clock::get()?.unix_timestamp,
            SharelyError::InvalidArgument
        );
        let quest = &mut ctx.accounts.quest;
        // 设置 root（允许在未启动或暂停时，且未发生任何领取）
        require!(quest.claimed_total == 0, SharelyError::InvalidArgument);
        require!(user_count > 0, SharelyError::InvalidArgument);
        require!(user_count <= 1000000, SharelyError::InvalidArgument); // 限制最大 100 万用户
                                                                        // fee amount must be greater than 0 and less than total_amount
        require!(
            fee_amount >= 0 && fee_amount <= quest.total_amount,
            SharelyError::InvalidFeeAmount
        );

        // 扣除 fee_amount 到 admin 账户
        quest.merkle_root = merkle_root;
        quest.version = quest.version.checked_add(1).ok_or(SharelyError::Overflow)?;
        quest.fee_amount = fee_amount;
        // 位图由 init_if_needed 自动创建，这里只需要更新数据
        let bitmap_size = (user_count + 7) / 8; // 向上取整到字节
        let required_space = 8 + 32 + 2 + 4 + 4 + 4 + bitmap_size as usize;

        // 检查空间是否足够，如果不够则重新分配
        let account_info = ctx.accounts.bitmap_shard.to_account_info();
        let current_space = account_info.data_len();
        if required_space > current_space {
            account_info.resize(required_space)?;
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

        quest.start_at = start_at;
        quest.end_at = end_at;
        // 启动 quest
        quest.status = Status::Active;

        let shard = &mut ctx.accounts.bitmap_shard;
        shard.user_count = user_count;
        shard.shard_id = 0;
        shard.quest = quest.key();
        shard.bits = vec![0; bitmap_size as usize];

        emit!(QuestActivated {
            status: quest.status,
            quest: quest.key(),
            quest_id: quest.quest_id,
            version: quest.version,
            merkle_root: quest.merkle_root,
            start_at,
            end_at,
            fee_amount
        });

        emit!(BitmapInitialized {
            quest: quest.key(),
            quest_id: quest.quest_id,
            user_count,
            bitmap_size,
        });

        Ok(())
    }

    pub fn pause_quest(ctx: Context<AdminOnQuest>) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.config.admin,
            SharelyError::Unauthorized
        );
        require!(
            ctx.accounts.quest.status == Status::Active,
            SharelyError::InvalidStatus
        );
        ctx.accounts.quest.status = Status::Paused;
        emit!(QuestStatusChanged {
            quest: ctx.accounts.quest.key(),
            quest_id: ctx.accounts.quest.quest_id,
            status: ctx.accounts.quest.status
        });
        Ok(())
    }

    pub fn resume_quest(ctx: Context<AdminOnQuest>) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.config.admin,
            SharelyError::Unauthorized
        );
        require!(
            ctx.accounts.quest.status == Status::Paused,
            SharelyError::InvalidStatus
        );
        ctx.accounts.quest.status = Status::Active;
        emit!(QuestStatusChanged {
            quest: ctx.accounts.quest.key(),
            quest_id: ctx.accounts.quest.quest_id,
            status: ctx.accounts.quest.status,
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
            quest_id: quest.quest_id,
            user: ctx.accounts.user.key(),
            index,
            amount,
            version: quest.version
        });
        Ok(())
    }

    pub fn close_quest_by_merchant(ctx: Context<CloseQuestByMerchant>) -> Result<()> {
        require!(
            ctx.accounts.merchant.key() == ctx.accounts.quest.merchant,
            SharelyError::Unauthorized
        );

        let now_ts = Clock::get()?.unix_timestamp;
        require!(
            now_ts > ctx.accounts.quest.end_at,
            SharelyError::InvalidStatus
        );

        // transfer fee amount to treasury, the left amount will be transferred to merchant
        let fee_amount = ctx.accounts.quest.fee_amount;
        if fee_amount > 0 {
            // 使用 vault_authority 作为签名者从 vault 转账到 treasury_ata
            let bump = ctx.bumps.vault_authority;
            let quest_key = ctx.accounts.quest.key();
            let signer_seeds: &[&[u8]] = &[b"vault_auth", quest_key.as_ref(), &[bump]];
            let signer = [signer_seeds];
            let cpi_ctx = CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.treasury_ata.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                &signer,
            );
            token::transfer(cpi_ctx, fee_amount)?;
            emit!(FeeTransferred {
                quest: ctx.accounts.quest.key(),
                quest_id: ctx.accounts.quest.quest_id,
                fee_amount,
                recipient: ctx.accounts.treasury_ata.key(),
            });
        }

        if ctx.accounts.vault.amount > fee_amount {
            let amount = ctx.accounts.vault.amount - fee_amount;
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

            emit!(QuestClosed {
                status: ctx.accounts.quest.status,
                quest: ctx.accounts.quest.key(),
                quest_id: ctx.accounts.quest.quest_id,
                remaining_transferred: amount,
                recipient: ctx.accounts.destination_ata.key(),
            });
        }
        ctx.accounts.quest.status = Status::Closed;

        Ok(())
    }

    // only admin can cancel quest
    pub fn cancel_quest(ctx: Context<CancelQuest>) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.config.admin,
            SharelyError::Unauthorized
        );
        require!(
            ctx.accounts.quest.status == Status::Pending,
            SharelyError::InvalidStatus
        );
        ctx.accounts.quest.status = Status::Cancelled;
        // transfer vault amount to merchant

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
                    to: ctx.accounts.merchant_ata.to_account_info(),
                    authority: ctx.accounts.vault_authority.to_account_info(),
                },
                &signer,
            );
            token::transfer(cpi_ctx, amount)?;

            emit!(QuestCancelled {
                status: ctx.accounts.quest.status,
                quest: ctx.accounts.quest.key(),
                quest_id: ctx.accounts.quest.quest_id,
                remaining_transferred: amount,
                recipient: ctx.accounts.quest.merchant,
            });
        }

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

    // 更新 treasury 地址（仅管理员可调用）
    pub fn update_treasury(ctx: Context<UpdateTreasury>, new_treasury: Pubkey) -> Result<()> {
        require!(
            ctx.accounts.admin.key() == ctx.accounts.config.admin,
            SharelyError::Unauthorized
        );
        ctx.accounts.config.treasury = new_treasury;
        emit!(TreasuryUpdated {
            new_treasury,
            admin: ctx.accounts.admin.key(),
        });
        Ok(())
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
    pub fee_amount: u64,
}

#[account]
pub struct ClaimBitmapShard {
    pub quest: Pubkey,
    pub shard_id: u16,   // 固定为 0，保持兼容性
    pub user_count: u32, // 实际用户数量
    pub bits: Vec<u8>,   // 动态大小的位图
}

#[account]
pub struct Config {
    pub admin: Pubkey,
    pub treasury: Pubkey,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Pending,
    Active,
    Paused,
    Closed,
    Cancelled,
}

// =========================
// Contexts
// =========================

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: 全局配置账户，使用固定种子
    #[account(
        init,
        payer = admin,
        space = 8 + 32 + 32, // discriminator + admin + treasury
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ChangeAdmin<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(mut, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
}

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
    #[account(init, payer = merchant, space = 8 + 8 + 32 + 32 + 32 + 32 + 8 + 1 + 4 + 32 + 32 + 8 + 8 + 8 + 8 + 8, seeds = [b"quest".as_ref(), &quest_id.to_le_bytes()], bump)]
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
    #[account(mut, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
pub struct AdminOnQuest<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut)]
    pub quest: Account<'info, QuestAccount>,
    #[account(mut, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
}

#[derive(Accounts)]
#[instruction(user_count: u32)]
pub struct ActivateQuest<'info> {
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
pub struct CloseQuestByMerchant<'info> {
    #[account(mut)]
    pub merchant: Signer<'info>,
    #[account(mut, has_one = merchant)]
    pub quest: Account<'info, QuestAccount>,
    /// CHECK: PDA authority
    #[account(seeds = [b"vault_auth", quest.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, address = quest.vault)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub destination_ata: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    /// CHECK: 验证 treasury_ata 是否为授权 treasury 地址的 ATA
    #[account(
        mut,
        constraint = treasury_ata.mint == quest.mint @ SharelyError::AccountMismatch,
        constraint = treasury_ata.owner == config.treasury @ SharelyError::Unauthorized
    )]
    pub treasury_ata: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelQuest<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(mut, has_one = admin)]
    pub quest: Account<'info, QuestAccount>,
    /// CHECK: PDA authority
    #[account(seeds = [b"vault_auth", quest.key().as_ref()], bump)]
    pub vault_authority: UncheckedAccount<'info>,
    #[account(mut, address = quest.vault)]
    pub vault: Account<'info, TokenAccount>,
    /// CHECK: Merchant ATA，验证地址是否正确
    #[account(
        mut,
        constraint = merchant_ata.mint == vault.mint @ SharelyError::AccountMismatch,
        constraint = merchant_ata.owner == quest.merchant @ SharelyError::AccountMismatch
    )]
    pub merchant_ata: Account<'info, TokenAccount>,
    #[account(mut, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateTreasury<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    /// CHECK: 全局配置账户
    #[account(
        mut,
        has_one = admin,
        seeds = [b"config"],
        bump
    )]
    pub config: Account<'info, Config>,
}

// =========================
// Events
// =========================

#[event]
pub struct Initialized {
    pub admin: Pubkey,
    pub treasury: Pubkey,
}

#[event]
pub struct AdminChanged {
    pub old_admin: Pubkey,
    pub new_admin: Pubkey,
}

#[event]
pub struct QuestCreated {
    pub status: Status,
    pub quest: Pubkey,
    pub quest_id: u64,
    pub merchant: Pubkey,
    pub mint: Pubkey,
    pub total_amount: u64,
}

#[event]
pub struct QuestStatusChanged {
    pub quest: Pubkey,
    pub quest_id: u64,
    pub status: Status,
}

#[event]
pub struct VaultFunded {
    pub funder: Pubkey,
    pub quest: Pubkey,
    pub quest_id: u64,
    pub amount: u64,
}

#[event]
pub struct QuestActivated {
    pub status: Status,
    pub quest: Pubkey,
    pub quest_id: u64,
    pub version: u32,
    pub merkle_root: [u8; 32],
    pub start_at: i64,
    pub end_at: i64,
    pub fee_amount: u64,
}

#[event]
pub struct Claimed {
    pub quest: Pubkey,
    pub quest_id: u64,
    pub user: Pubkey,
    pub index: u64,
    pub amount: u64,
    pub version: u32,
}

#[event]
pub struct QuestClosed {
    pub status: Status,
    pub quest: Pubkey,
    pub quest_id: u64,
    pub remaining_transferred: u64,
    pub recipient: Pubkey,
}

#[event]
pub struct QuestCancelled {
    pub status: Status,
    pub quest: Pubkey,
    pub quest_id: u64,
    pub remaining_transferred: u64,
    pub recipient: Pubkey,
}

#[event]
pub struct BitmapInitialized {
    pub quest: Pubkey,
    pub quest_id: u64,
    pub user_count: u32,
    pub bitmap_size: u32,
}

#[event]
pub struct TreasuryUpdated {
    pub new_treasury: Pubkey,
    pub admin: Pubkey,
}

#[event]
pub struct FeeTransferred {
    pub quest: Pubkey,
    pub quest_id: u64,
    pub fee_amount: u64,
    pub recipient: Pubkey,
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
    #[msg("Invalid fee amount")]
    InvalidFeeAmount,
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
