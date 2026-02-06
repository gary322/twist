use anchor_lang::prelude::*;

#[account]
pub struct PIDControllerState {
    pub authority: Pubkey,
    
    // PID gains
    pub kp: i64, // Proportional gain (basis points)
    pub ki: i64, // Integral gain (basis points)
    pub kd: i64, // Derivative gain (basis points)
    
    // Controller state
    pub integral: i128,
    pub previous_error: i64,
    pub last_update_timestamp: i64,
    
    // Limits
    pub integral_min: i128,
    pub integral_max: i128,
    pub output_min: i64, // Min supply adjustment per period (basis points)
    pub output_max: i64, // Max supply adjustment per period (basis points)
    
    // Target parameters
    pub target_price: u64, // Target price in 6 decimals
    pub price_tolerance_bps: u64, // Dead band to prevent oscillation
    
    // Supply control parameters
    pub max_mint_rate_bps: u64, // Max % of supply that can be minted daily
    pub max_burn_rate_bps: u64, // Max % of supply that can be burned daily
    pub last_adjustment_timestamp: i64,
    pub adjustment_cooldown: i64, // Minimum time between adjustments
    
    // History tracking
    pub total_minted: u128,
    pub total_burned: u128,
    pub adjustment_count: u64,
    pub last_adjustment_amount: i64,
    pub last_adjustment_type: AdjustmentType,
    
    pub bump: u8,
}

impl PIDControllerState {
    pub const LEN: usize = 8 + // discriminator
        32 + // authority
        8 + 8 + 8 + // PID gains
        16 + 8 + 8 + // Controller state
        16 + 16 + 8 + 8 + // Limits
        8 + 8 + // Target parameters
        8 + 8 + 8 + 8 + // Supply control parameters
        16 + 16 + 8 + 8 + 1 + // History tracking
        1; // bump
    
    pub fn calculate_adjustment(
        &mut self,
        current_price: u64,
        current_supply: u128,
        current_timestamp: i64,
    ) -> Result<SupplyAdjustment> {
        // Check cooldown
        require!(
            current_timestamp - self.last_adjustment_timestamp >= self.adjustment_cooldown,
            crate::errors::TwistError::AdjustmentTooSoon
        );
        
        // Calculate error (positive = price too low, need to reduce supply)
        let error = (self.target_price as i64) - (current_price as i64);
        
        // Apply dead band to prevent oscillation
        if error.abs() < (self.target_price as i64 * self.price_tolerance_bps as i64 / 10000) {
            return Ok(SupplyAdjustment {
                adjustment_type: AdjustmentType::None,
                amount: 0,
                reason: "Price within tolerance".to_string(),
            });
        }
        
        // Calculate time delta
        let dt = (current_timestamp - self.last_update_timestamp).max(1);
        
        // Update integral with anti-windup
        self.integral = self.integral.saturating_add((error as i128) * (dt as i128));
        self.integral = self.integral.clamp(self.integral_min, self.integral_max);
        
        // Calculate derivative
        let derivative = if self.last_update_timestamp > 0 {
            ((error - self.previous_error) as i128 * 1000) / (dt as i128) // Scale by 1000 for precision
        } else {
            0
        };
        
        // PID output (in basis points)
        let output = (self.kp as i128 * error as i128) / 10000
            + (self.ki as i128 * self.integral) / 10000
            + (self.kd as i128 * derivative) / 10000;
        
        // Clamp output to limits
        let output_bps = output.clamp(self.output_min as i128, self.output_max as i128) as i64;
        
        // Convert to supply adjustment
        let (adjustment_type, max_rate_bps) = if output_bps > 0 {
            // Positive output = burn tokens (reduce supply)
            (AdjustmentType::Burn, self.max_burn_rate_bps as i64)
        } else {
            // Negative output = mint tokens (increase supply)
            (AdjustmentType::Mint, -(self.max_mint_rate_bps as i64))
        };
        
        // Calculate actual adjustment amount
        let adjustment_bps = output_bps.clamp(-max_rate_bps.abs(), max_rate_bps.abs());
        let adjustment_amount = ((current_supply as i128 * adjustment_bps.abs() as i128) / 10000) as u64;
        
        // Update state for next iteration
        self.previous_error = error;
        self.last_update_timestamp = current_timestamp;
        self.last_adjustment_timestamp = current_timestamp;
        self.last_adjustment_amount = adjustment_amount as i64;
        self.last_adjustment_type = adjustment_type.clone();
        self.adjustment_count += 1;
        
        // Update totals
        match adjustment_type {
            AdjustmentType::Mint => self.total_minted += adjustment_amount as u128,
            AdjustmentType::Burn => self.total_burned += adjustment_amount as u128,
            AdjustmentType::None => {},
        }
        
        let reason = format!(
            "PID output: {}bps, Price error: ${}, Integral: {}, Derivative: {}",
            output_bps,
            error as f64 / 1e6,
            self.integral,
            derivative
        );
        
        Ok(SupplyAdjustment {
            adjustment_type,
            amount: adjustment_amount,
            reason,
        })
    }
    
    pub fn reset(&mut self) {
        self.integral = 0;
        self.previous_error = 0;
        self.last_update_timestamp = 0;
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug, PartialEq)]
pub enum AdjustmentType {
    None,
    Mint,
    Burn,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct SupplyAdjustment {
    pub adjustment_type: AdjustmentType,
    pub amount: u64,
    pub reason: String,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct PIDControllerParams {
    pub kp: i64, // Proportional gain (basis points)
    pub ki: i64, // Integral gain (basis points)
    pub kd: i64, // Derivative gain (basis points)
    pub target_price: u64,
    pub price_tolerance_bps: u64,
    pub max_mint_rate_bps: u64,
    pub max_burn_rate_bps: u64,
    pub adjustment_cooldown: i64,
    pub integral_min: i128,
    pub integral_max: i128,
    pub output_min: i64,
    pub output_max: i64,
}