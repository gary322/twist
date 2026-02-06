# Gain Controller Program

## Overview

The Gain Controller Program implements a PID (Proportional-Integral-Derivative) controller for managing AC-D token supply dynamics. It adjusts system parameters based on the deviation between target and actual supply metrics to maintain economic stability.

## Purpose

- **Supply Management**: Automatically adjust burn rates and reward multipliers
- **Price Stability**: Maintain AC-D price within target bands relative to floor
- **System Balance**: Ensure sustainable tokenomics under varying market conditions
- **Adaptive Response**: React to demand shocks and supply imbalances

## Key Components

### 1. PID Controller State

```rust
pub struct ControllerState {
    // Authority
    pub authority: Pubkey,           // Program admin
    pub update_authority: Pubkey,    // Can update parameters
    
    // Controller gains
    pub kp: f64,                     // Proportional gain (0.1 - 10.0)
    pub ki: f64,                     // Integral gain (0.01 - 1.0)
    pub kd: f64,                     // Derivative gain (0.001 - 0.1)
    
    // State variables
    pub setpoint: f64,               // Target metric (e.g., price/floor ratio)
    pub integral: f64,               // Accumulated error
    pub prev_error: f64,             // Previous error for derivative
    
    // Limits
    pub output_min: f64,             // Minimum control output
    pub output_max: f64,             // Maximum control output
    pub integral_max: f64,           // Anti-windup limit
    
    // Timing
    pub last_update: i64,            // Unix timestamp of last update
    pub update_interval: i64,        // Minimum seconds between updates
    
    // Metrics
    pub total_updates: u64,          // Number of control updates
    pub last_output: f64,            // Most recent control output
}
```

### 2. Control Targets

```rust
pub struct ControlTarget {
    pub target_type: TargetType,
    pub current_value: f64,
    pub smoothing_factor: f64,       // EMA smoothing (0-1)
    pub measurement_source: Pubkey,   // Oracle or data source
}

pub enum TargetType {
    PriceFloorRatio,                 // AC-D price / floor price
    DailyBurnRate,                   // Tokens burned per day
    SupplyGrowthRate,                // Daily supply change %
    VelocityMetric,                  // Transaction velocity
}
```

### 3. Control Outputs

```rust
pub struct ControlOutput {
    pub output_type: OutputType,
    pub base_value: f64,
    pub multiplier: f64,             // PID output multiplier
    pub min_value: f64,
    pub max_value: f64,
    pub target_program: Pubkey,      // Program to update
}

pub enum OutputType {
    HarbergerTaxRate,                // Adjust CHB tax rate
    BondYieldMultiplier,             // Adjust PSAB yield
    RewardMultiplier,                // Adjust VAU rewards
    BuybackThreshold,                // Adjust buyback trigger
}
```

## Instructions

### 1. Initialize Controller

```rust
pub fn initialize_controller(
    ctx: Context<InitializeController>,
    params: InitializeParams,
) -> Result<()> {
    let controller = &mut ctx.accounts.controller_state;
    
    // Set authorities
    controller.authority = ctx.accounts.authority.key();
    controller.update_authority = ctx.accounts.update_authority.key();
    
    // Initialize PID gains
    controller.kp = params.kp;
    controller.ki = params.ki;
    controller.kd = params.kd;
    
    // Set limits
    controller.output_min = params.output_min;
    controller.output_max = params.output_max;
    controller.integral_max = params.integral_max;
    
    // Initialize state
    controller.setpoint = params.initial_setpoint;
    controller.integral = 0.0;
    controller.prev_error = 0.0;
    
    // Set timing
    controller.update_interval = params.update_interval;
    controller.last_update = Clock::get()?.unix_timestamp;
    
    Ok(())
}
```

### 2. Update Control Loop

```rust
pub fn update_control(
    ctx: Context<UpdateControl>,
    measured_value: f64,
) -> Result<()> {
    let controller = &mut ctx.accounts.controller_state;
    let clock = Clock::get()?;
    
    // Check update interval
    require!(
        clock.unix_timestamp >= controller.last_update + controller.update_interval,
        ErrorCode::UpdateTooSoon
    );
    
    // Calculate error
    let error = controller.setpoint - measured_value;
    
    // Calculate time delta
    let dt = (clock.unix_timestamp - controller.last_update) as f64;
    
    // Proportional term
    let p_term = controller.kp * error;
    
    // Integral term with anti-windup
    controller.integral += error * dt;
    controller.integral = controller.integral
        .max(-controller.integral_max)
        .min(controller.integral_max);
    let i_term = controller.ki * controller.integral;
    
    // Derivative term with filtering
    let derivative = (error - controller.prev_error) / dt;
    let d_term = controller.kd * derivative;
    
    // Calculate output
    let output = p_term + i_term + d_term;
    
    // Apply limits
    let limited_output = output
        .max(controller.output_min)
        .min(controller.output_max);
    
    // Update state
    controller.prev_error = error;
    controller.last_update = clock.unix_timestamp;
    controller.last_output = limited_output;
    controller.total_updates += 1;
    
    // Emit event
    emit!(ControlUpdateEvent {
        timestamp: clock.unix_timestamp,
        measured_value,
        error,
        output: limited_output,
        p_term,
        i_term,
        d_term,
    });
    
    Ok(())
}
```

### 3. Apply Control Output

```rust
pub fn apply_control_output(
    ctx: Context<ApplyControlOutput>,
    target_index: u8,
) -> Result<()> {
    let controller = &ctx.accounts.controller_state;
    let target = &ctx.accounts.control_target;
    let output_config = &ctx.accounts.control_output;
    
    // Calculate adjusted value
    let base = output_config.base_value;
    let adjustment = controller.last_output * output_config.multiplier;
    let new_value = (base + adjustment)
        .max(output_config.min_value)
        .min(output_config.max_value);
    
    // Update target program based on output type
    match output_config.output_type {
        OutputType::HarbergerTaxRate => {
            // Update CHB program tax rate
            let cpi_accounts = UpdateTaxRate {
                authority: ctx.accounts.controller_authority.to_account_info(),
                config: ctx.accounts.target_config.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(
                ctx.accounts.target_program.to_account_info(),
                cpi_accounts,
            );
            harberger_burn::cpi::update_tax_rate(cpi_ctx, new_value)?;
        },
        OutputType::BondYieldMultiplier => {
            // Update PSAB yield multiplier
            let cpi_accounts = UpdateYieldMultiplier {
                authority: ctx.accounts.controller_authority.to_account_info(),
                config: ctx.accounts.target_config.to_account_info(),
            };
            let cpi_ctx = CpiContext::new(
                ctx.accounts.target_program.to_account_info(),
                cpi_accounts,
            );
            bond_pool::cpi::update_yield_multiplier(cpi_ctx, new_value)?;
        },
        // ... other output types
    }
    
    Ok(())
}
```

### 4. Update Controller Parameters

```rust
pub fn update_gains(
    ctx: Context<UpdateGains>,
    new_kp: Option<f64>,
    new_ki: Option<f64>,
    new_kd: Option<f64>,
) -> Result<()> {
    let controller = &mut ctx.accounts.controller_state;
    
    // Update gains if provided
    if let Some(kp) = new_kp {
        require!(kp >= 0.1 && kp <= 10.0, ErrorCode::InvalidGain);
        controller.kp = kp;
    }
    
    if let Some(ki) = new_ki {
        require!(ki >= 0.01 && ki <= 1.0, ErrorCode::InvalidGain);
        controller.ki = ki;
        // Reset integral on ki change to prevent bumps
        controller.integral = 0.0;
    }
    
    if let Some(kd) = new_kd {
        require!(kd >= 0.001 && kd <= 0.1, ErrorCode::InvalidGain);
        controller.kd = kd;
    }
    
    emit!(GainsUpdatedEvent {
        timestamp: Clock::get()?.unix_timestamp,
        kp: controller.kp,
        ki: controller.ki,
        kd: controller.kd,
    });
    
    Ok(())
}
```

## Control Strategies

### 1. Price Stability Control

```rust
// Maintain AC-D price within 5% of floor price
pub fn price_stability_strategy() -> ControllerConfig {
    ControllerConfig {
        setpoint: 1.025,  // Target 2.5% above floor
        kp: 2.0,          // Moderate proportional response
        ki: 0.1,          // Slow integral action
        kd: 0.01,         // Minimal derivative
        output_min: -0.5, // Max 50% reduction
        output_max: 0.5,  // Max 50% increase
    }
}
```

### 2. Supply Growth Control

```rust
// Target negative supply growth to increase floor price
pub fn supply_control_strategy() -> ControllerConfig {
    ControllerConfig {
        setpoint: -0.001, // Target -0.1% daily supply change
        kp: 5.0,          // Strong proportional response
        ki: 0.2,          // Moderate integral
        kd: 0.02,         // Some derivative damping
        output_min: -0.8, // Strong reduction possible
        output_max: 0.2,  // Limited increase
    }
}
```

### 3. Velocity Control

```rust
// Maintain healthy transaction velocity
pub fn velocity_control_strategy() -> ControllerConfig {
    ControllerConfig {
        setpoint: 0.1,    // Target 10% daily velocity
        kp: 1.0,          // Balanced response
        ki: 0.05,         // Slow adaptation
        kd: 0.005,        // Minimal derivative
        output_min: -0.3, // Moderate adjustments
        output_max: 0.3,
    }
}
```

## Helper Functions

### Calculate Smoothed Measurement

```rust
pub fn calculate_smoothed_value(
    current_raw: f64,
    previous_smooth: f64,
    alpha: f64,
) -> f64 {
    // Exponential moving average
    alpha * current_raw + (1.0 - alpha) * previous_smooth
}
```

### Validate Control Stability

```rust
pub fn check_stability(
    controller: &ControllerState,
    recent_outputs: &[f64],
) -> StabilityStatus {
    if recent_outputs.len() < 10 {
        return StabilityStatus::Insufficient;
    }
    
    // Calculate variance
    let mean = recent_outputs.iter().sum::<f64>() / recent_outputs.len() as f64;
    let variance = recent_outputs.iter()
        .map(|x| (x - mean).powi(2))
        .sum::<f64>() / recent_outputs.len() as f64;
    
    // Check oscillation
    let sign_changes = recent_outputs.windows(2)
        .filter(|w| w[0].signum() != w[1].signum())
        .count();
    
    if variance > 0.1 || sign_changes > 5 {
        StabilityStatus::Unstable
    } else if variance < 0.01 {
        StabilityStatus::Stable
    } else {
        StabilityStatus::Converging
    }
}
```

## Security Considerations

### 1. Input Validation
- Validate all oracle inputs for freshness and bounds
- Reject outlier measurements that could destabilize control
- Implement rate limiting on control updates

### 2. Authority Management
- Separate update authority from main authority
- Implement timelock for parameter changes
- Require multisig for critical updates

### 3. Fail-Safe Mechanisms
- Automatic shutdown if output oscillates
- Manual override capability
- Gradual parameter changes only

## Testing

### 1. Unit Tests
```rust
#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_pid_calculation() {
        let mut controller = create_test_controller();
        
        // Test proportional response
        let output = calculate_pid_output(&controller, 1.0, 0.9, 1.0);
        assert!((output - 0.1 * controller.kp).abs() < 0.001);
        
        // Test integral accumulation
        controller.integral = 0.5;
        let output = calculate_pid_output(&controller, 1.0, 0.9, 1.0);
        assert!(output > 0.1 * controller.kp);
    }
    
    #[test]
    fn test_anti_windup() {
        let mut controller = create_test_controller();
        controller.integral = 100.0; // Large integral
        
        apply_anti_windup(&mut controller);
        assert_eq!(controller.integral, controller.integral_max);
    }
}
```

### 2. Simulation Tests
- Test step response to setpoint changes
- Verify stability under various gain settings
- Simulate market conditions and disturbances

### 3. Integration Tests
- Test CPI calls to target programs
- Verify parameter updates propagate correctly
- Test emergency shutdown procedures

## Monitoring

### Key Metrics
- Control error magnitude and trend
- Output saturation frequency
- Integral windup occurrences
- System stability indicators

### Alerts
- Sustained large error (> 10% for 1 hour)
- Output saturation (> 90% of time)
- Rapid oscillation detected
- Oracle feed interruption

## Future Enhancements

### 1. Adaptive Control
- Self-tuning gains based on system response
- Multiple controller modes for different market conditions
- Machine learning integration for pattern recognition

### 2. Multi-Variable Control
- MIMO (Multiple Input Multiple Output) control
- Coordinated control of multiple system parameters
- Cascade control structures

### 3. Advanced Strategies
- Model Predictive Control (MPC)
- Fuzzy logic control for non-linear regions
- Robust control for uncertainty handling

## Configuration Examples

### Conservative Setup
```toml
[controller.conservative]
kp = 0.5
ki = 0.05
kd = 0.005
output_min = -0.2
output_max = 0.2
update_interval = 3600  # 1 hour
```

### Aggressive Setup
```toml
[controller.aggressive]
kp = 5.0
ki = 0.5
kd = 0.05
output_min = -0.8
output_max = 0.8
update_interval = 300   # 5 minutes
```

### Adaptive Setup
```toml
[controller.adaptive]
# Base gains
kp = 2.0
ki = 0.1
kd = 0.02

# Adaptation parameters
gain_adaptation_rate = 0.01
stability_threshold = 0.05
adaptation_enabled = true
``` 