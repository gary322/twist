use anchor_lang::prelude::*;

declare_id!("EkCkB7RWBSb9VbVd1NHrcdZCnJkpBb9rX7qiGawPjeTr");

#[program]
pub mod twist_vesting {
    use super::*;

    pub fn initialize(_ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}