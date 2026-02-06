use anchor_lang::prelude::*;

declare_id!("4ZkS7ZZkxfsC3GtvvsHP3DFcUeByU9zzZELS4r8HCELo");

#[program]
pub mod twist_bridge {
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