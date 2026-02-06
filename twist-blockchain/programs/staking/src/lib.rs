use anchor_lang::prelude::*;

declare_id!("GZctHpWXmsZC1YHACTGGcHhYxjdRqQvTpYkb9LMvxDib");

#[program]
pub mod twist_staking {
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