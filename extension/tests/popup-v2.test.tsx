import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from '../popup/src/App-v2';
import { HomePage } from '../popup/src/pages/HomePage';
import { SearchPage } from '../popup/src/pages/SearchPage';
import { WalletPage } from '../popup/src/pages/WalletPage';
import { SettingsPage } from '../popup/src/pages/SettingsPage';
import { StakingModal } from '../popup/src/components/StakingModal';
import { MessageType } from '../types';
import '../jest.setup';

describe('Popup UI v2.0', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (chrome.storage.local.get as jest.Mock).mockResolvedValue({});
    (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({ success: true });
  });

  describe('App Component', () => {
    it('should show loading state initially', () => {
      render(<App />);
      expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();
    });

    it('should show login view for unauthenticated users', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        identity: null
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Welcome to TWIST')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter your email')).toBeInTheDocument();
      });
    });

    it('should show main interface for authenticated users', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        identity: {
          userId: 'test-user',
          email: 'test@example.com'
        },
        balance: '1000000000000'
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('TWIST')).toBeInTheDocument();
        expect(screen.getByText('1000 TWIST')).toBeInTheDocument();
      });
    });

    it('should switch between tabs', async () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        identity: { userId: 'test-user' }
      });

      render(<App />);
      
      await waitFor(() => {
        expect(screen.getByText('Home')).toBeInTheDocument();
      });

      // Click Search tab
      fireEvent.click(screen.getByText('Search'));
      expect(screen.getByPlaceholderText('Search influencers...')).toBeInTheDocument();

      // Click Wallet tab
      fireEvent.click(screen.getByText('Wallet'));
      expect(screen.getByText('Portfolio Overview')).toBeInTheDocument();

      // Click Settings tab
      fireEvent.click(screen.getByText('Settings'));
      expect(screen.getByText('Account Settings')).toBeInTheDocument();
    });
  });

  describe('HomePage Component', () => {
    const mockProps = {
      userIdentity: {
        userId: 'test-user',
        email: 'test@example.com',
        deviceId: 'device-123',
        trustScore: 100,
        createdAt: new Date().toISOString()
      },
      balance: BigInt(1000000000000),
      stakes: [
        {
          influencer: {
            id: 'inf1',
            username: 'testinfluencer',
            displayName: 'Test Influencer',
            avatar: 'https://example.com/avatar.jpg',
            tier: 'GOLD' as const,
            metrics: {
              totalStaked: '5000000000000',
              stakerCount: 100,
              apy: 15,
              volume24h: '100000000000',
              avgStakeAmount: '50000000000'
            }
          },
          stake: {
            amount: '100000000000',
            stakedAt: Date.now(),
            pendingRewards: '5000000000',
            apy: 15
          }
        }
      ],
      detectedInfluencer: null,
      onIdentify: jest.fn(),
      onStake: jest.fn()
    };

    it('should display user balance and earnings', () => {
      render(<HomePage {...mockProps} />);
      
      expect(screen.getByText('Your Balance')).toBeInTheDocument();
      expect(screen.getByText('1000')).toBeInTheDocument();
      expect(screen.getByText(/\$50\.00 USD/)).toBeInTheDocument();
    });

    it('should display staking overview', () => {
      render(<HomePage {...mockProps} />);
      
      expect(screen.getByText('Staking Overview')).toBeInTheDocument();
      expect(screen.getByText('Total Staked')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('Active Stakes')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('Pending Rewards')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should show claim button when rewards are high', () => {
      const propsWithHighRewards = {
        ...mockProps,
        stakes: [{
          ...mockProps.stakes[0],
          stake: {
            ...mockProps.stakes[0].stake,
            pendingRewards: '15000000000' // 15 TWIST
          }
        }]
      };

      render(<HomePage {...propsWithHighRewards} />);
      
      expect(screen.getByText('Claim All Rewards')).toBeInTheDocument();
    });

    it('should display detected influencer alert', () => {
      const propsWithDetected = {
        ...mockProps,
        detectedInfluencer: {
          influencer: {
            id: 'inf2',
            displayName: 'Detected Influencer',
            metrics: {
              apy: 20,
              stakerCount: 500
            }
          },
          platform: 'twitter'
        }
      };

      render(<HomePage {...propsWithDetected} />);
      
      expect(screen.getByText('Influencer Detected!')).toBeInTheDocument();
      expect(screen.getByText(/Detected Influencer is on TWIST/)).toBeInTheDocument();
      expect(screen.getByText('20% APY')).toBeInTheDocument();
      expect(screen.getByText('500 stakers')).toBeInTheDocument();
      
      // Click stake button
      fireEvent.click(screen.getByText('Stake Now'));
      expect(mockProps.onStake).toHaveBeenCalledWith(propsWithDetected.detectedInfluencer.influencer);
    });

    it('should display user stakes', () => {
      render(<HomePage {...mockProps} />);
      
      expect(screen.getByText('Your Stakes')).toBeInTheDocument();
      expect(screen.getByText('Test Influencer')).toBeInTheDocument();
      expect(screen.getByText('100 staked')).toBeInTheDocument();
      expect(screen.getByText('+5')).toBeInTheDocument();
      expect(screen.getByText('15% APY')).toBeInTheDocument();
    });
  });

  describe('SearchPage Component', () => {
    const mockOnStake = jest.fn();

    beforeEach(() => {
      (chrome.runtime.sendMessage as jest.Mock).mockImplementation((msg) => {
        if (msg.type === MessageType.SEARCH_INFLUENCERS) {
          return Promise.resolve([
            {
              id: 'inf1',
              username: 'cryptoking',
              displayName: 'Crypto King',
              tier: 'PLATINUM',
              metrics: {
                totalStaked: '10000000000000',
                stakerCount: 1000,
                apy: 25,
                volume24h: '500000000000',
                avgStakeAmount: '10000000000'
              }
            },
            {
              id: 'inf2',
              username: 'defimaster',
              displayName: 'DeFi Master',
              tier: 'GOLD',
              metrics: {
                totalStaked: '5000000000000',
                stakerCount: 500,
                apy: 20,
                volume24h: '250000000000',
                avgStakeAmount: '10000000000'
              }
            }
          ]);
        }
        return Promise.resolve({ error: 'Unknown message' });
      });
    });

    it('should search for influencers', async () => {
      render(<SearchPage onStake={mockOnStake} />);
      
      const searchInput = screen.getByPlaceholderText('Search influencers...');
      fireEvent.change(searchInput, { target: { value: 'crypto' } });
      
      await waitFor(() => {
        expect(screen.getByText('Crypto King')).toBeInTheDocument();
        expect(screen.getByText('DeFi Master')).toBeInTheDocument();
      });
    });

    it('should display influencer metrics', async () => {
      render(<SearchPage onStake={mockOnStake} />);
      
      const searchInput = screen.getByPlaceholderText('Search influencers...');
      fireEvent.change(searchInput, { target: { value: 'test' } });
      
      await waitFor(() => {
        expect(screen.getByText('Staked: 10000')).toBeInTheDocument();
        expect(screen.getByText('APY: 25%')).toBeInTheDocument();
        expect(screen.getByText('Stakers: 1000')).toBeInTheDocument();
      });
    });

    it('should allow sorting results', async () => {
      render(<SearchPage onStake={mockOnStake} />);
      
      const searchInput = screen.getByPlaceholderText('Search influencers...');
      fireEvent.change(searchInput, { target: { value: 'test' } });
      
      await waitFor(() => {
        expect(screen.getByText('Crypto King')).toBeInTheDocument();
      });

      // Click APY sort
      fireEvent.click(screen.getByText('APY'));
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.SEARCH_INFLUENCERS,
        params: {
          query: 'test',
          sortBy: 'apy',
          limit: 10
        }
      });
    });

    it('should trigger stake action on influencer click', async () => {
      render(<SearchPage onStake={mockOnStake} />);
      
      const searchInput = screen.getByPlaceholderText('Search influencers...');
      fireEvent.change(searchInput, { target: { value: 'test' } });
      
      await waitFor(() => {
        expect(screen.getByText('Crypto King')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Crypto King').closest('div.cursor-pointer')!);
      
      expect(mockOnStake).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Crypto King'
        })
      );
    });
  });

  describe('WalletPage Component', () => {
    const mockProps = {
      balance: BigInt(2000000000000),
      stakes: [
        {
          influencer: {
            id: 'inf1',
            username: 'influencer1',
            displayName: 'Influencer One',
            avatar: 'https://example.com/avatar1.jpg',
            tier: 'PLATINUM' as const,
            metrics: {
              totalStaked: '10000000000000',
              stakerCount: 1000,
              apy: 30,
              volume24h: '1000000000000',
              avgStakeAmount: '10000000000'
            }
          },
          stake: {
            amount: '500000000000',
            stakedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
            pendingRewards: '50000000000',
            apy: 30
          }
        },
        {
          influencer: {
            id: 'inf2',
            username: 'influencer2',
            displayName: 'Influencer Two',
            avatar: 'https://example.com/avatar2.jpg',
            tier: 'GOLD' as const,
            metrics: {
              totalStaked: '5000000000000',
              stakerCount: 500,
              apy: 20,
              volume24h: '500000000000',
              avgStakeAmount: '10000000000'
            }
          },
          stake: {
            amount: '200000000000',
            stakedAt: Date.now() - 15 * 24 * 60 * 60 * 1000,
            pendingRewards: '10000000000',
            apy: 20
          }
        }
      ]
    };

    it('should display portfolio overview', () => {
      render(<WalletPage {...mockProps} />);
      
      expect(screen.getByText('Portfolio Overview')).toBeInTheDocument();
      expect(screen.getByText('2000')).toBeInTheDocument(); // Available balance
      expect(screen.getByText('700')).toBeInTheDocument(); // Total staked
      expect(screen.getByText('60')).toBeInTheDocument(); // Total rewards
    });

    it('should display individual stakes', () => {
      render(<WalletPage {...mockProps} />);
      
      expect(screen.getByText('Active Stakes')).toBeInTheDocument();
      expect(screen.getByText('Influencer One')).toBeInTheDocument();
      expect(screen.getByText('Influencer Two')).toBeInTheDocument();
      
      // Check stake details
      expect(screen.getByText('500 TWIST')).toBeInTheDocument();
      expect(screen.getByText('200 TWIST')).toBeInTheDocument();
      
      // Check rewards
      expect(screen.getByText('50 TWIST')).toBeInTheDocument();
      expect(screen.getByText('10 TWIST')).toBeInTheDocument();
    });

    it('should allow claiming individual rewards', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
        success: true,
        claimedAmount: '50000000000'
      });

      render(<WalletPage {...mockProps} />);
      
      const claimButtons = screen.getAllByText('Claim');
      fireEvent.click(claimButtons[0]);
      
      await waitFor(() => {
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
          type: MessageType.CLAIM_REWARDS,
          influencerId: 'inf1'
        });
      });
    });

    it('should show claim all button when multiple rewards available', () => {
      render(<WalletPage {...mockProps} />);
      
      expect(screen.getByText('Claim All (60 TWIST)')).toBeInTheDocument();
    });

    it('should display portfolio chart', () => {
      render(<WalletPage {...mockProps} />);
      
      expect(screen.getByText('Portfolio Distribution')).toBeInTheDocument();
      // Chart would be rendered here
    });
  });

  describe('SettingsPage Component', () => {
    const mockProps = {
      userIdentity: {
        userId: 'test-user',
        email: 'test@example.com',
        deviceId: 'device-123',
        trustScore: 100,
        createdAt: new Date().toISOString()
      }
    };

    it('should display account information', () => {
      render(<SettingsPage {...mockProps} />);
      
      expect(screen.getByText('Account Settings')).toBeInTheDocument();
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
      expect(screen.getByText('Trust Score: 100')).toBeInTheDocument();
    });

    it('should show wallet connection status', () => {
      (chrome.storage.local.get as jest.Mock).mockResolvedValue({
        wallet: { publicKey: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' }
      });

      render(<SettingsPage {...mockProps} />);
      
      expect(screen.getByText(/Connected:/)).toBeInTheDocument();
      expect(screen.getByText(/7xKX...sAsU/)).toBeInTheDocument();
    });

    it('should allow connecting wallet', () => {
      render(<SettingsPage {...mockProps} />);
      
      const connectButton = screen.getByText('Connect Wallet');
      fireEvent.click(connectButton);
      
      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://twist.to/connect-wallet'
      });
    });

    it('should allow changing privacy settings', () => {
      render(<SettingsPage {...mockProps} />);
      
      const privacySelect = screen.getByRole('combobox');
      fireEvent.change(privacySelect, { target: { value: 'strict' } });
      
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        privacyMode: 'strict'
      });
    });

    it('should allow toggling notifications', () => {
      render(<SettingsPage {...mockProps} />);
      
      const notificationCheckbox = screen.getByRole('checkbox');
      fireEvent.click(notificationCheckbox);
      
      expect(chrome.storage.local.set).toHaveBeenCalledWith({
        notifications: false
      });
    });

    it('should handle logout', () => {
      render(<SettingsPage {...mockProps} />);
      
      const logoutButton = screen.getByText('Log Out');
      fireEvent.click(logoutButton);
      
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
        type: MessageType.LOGOUT
      });
    });
  });

  describe('StakingModal Component', () => {
    const mockProps = {
      influencer: {
        id: 'inf1',
        username: 'testinfluencer',
        displayName: 'Test Influencer',
        avatar: 'https://example.com/avatar.jpg',
        tier: 'GOLD' as const,
        metrics: {
          totalStaked: '5000000000000',
          stakerCount: 100,
          apy: 15,
          volume24h: '100000000000',
          avgStakeAmount: '50000000000'
        }
      },
      balance: BigInt(1000000000000),
      onClose: jest.fn(),
      onSuccess: jest.fn()
    };

    it('should display influencer information', () => {
      render(<StakingModal {...mockProps} />);
      
      expect(screen.getByText('Stake on Test Influencer')).toBeInTheDocument();
      expect(screen.getByText('@testinfluencer')).toBeInTheDocument();
      expect(screen.getByText('GOLD')).toBeInTheDocument();
      expect(screen.getByText('5000')).toBeInTheDocument();
      expect(screen.getByText('15%')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should validate minimum stake amount', () => {
      render(<StakingModal {...mockProps} />);
      
      const input = screen.getByPlaceholderText('0.00');
      fireEvent.change(input, { target: { value: '5' } });
      
      const stakeButton = screen.getByText('Stake');
      fireEvent.click(stakeButton);
      
      expect(screen.getByText(/Minimum stake amount is 10 TWIST/)).toBeInTheDocument();
    });

    it('should validate balance', () => {
      render(<StakingModal {...mockProps} />);
      
      const input = screen.getByPlaceholderText('0.00');
      fireEvent.change(input, { target: { value: '2000' } });
      
      const stakeButton = screen.getByText('Stake');
      fireEvent.click(stakeButton);
      
      expect(screen.getByText('Insufficient balance')).toBeInTheDocument();
    });

    it('should use percentage buttons', () => {
      render(<StakingModal {...mockProps} />);
      
      fireEvent.click(screen.getByText('50%'));
      
      const input = screen.getByPlaceholderText('0.00') as HTMLInputElement;
      expect(input.value).toBe('500.00');
    });

    it('should show estimated returns', () => {
      render(<StakingModal {...mockProps} />);
      
      const input = screen.getByPlaceholderText('0.00');
      fireEvent.change(input, { target: { value: '100' } });
      
      expect(screen.getByText(/Estimated yearly return:/)).toBeInTheDocument();
      expect(screen.getByText(/15 TWIST/)).toBeInTheDocument();
    });

    it('should submit stake successfully', async () => {
      (chrome.runtime.sendMessage as jest.Mock).mockResolvedValue({
        success: true,
        transactionId: 'tx123'
      });

      render(<StakingModal {...mockProps} />);
      
      const input = screen.getByPlaceholderText('0.00');
      fireEvent.change(input, { target: { value: '100' } });
      
      const stakeButton = screen.getByText('Stake');
      fireEvent.click(stakeButton);
      
      await waitFor(() => {
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
          type: MessageType.STAKE,
          payload: {
            influencerId: 'inf1',
            amount: 100000000000
          }
        });
        expect(mockProps.onSuccess).toHaveBeenCalled();
      });
    });

    it('should close modal on cancel', () => {
      render(<StakingModal {...mockProps} />);
      
      fireEvent.click(screen.getByText('Cancel'));
      expect(mockProps.onClose).toHaveBeenCalled();
    });

    it('should close modal on X button', () => {
      render(<StakingModal {...mockProps} />);
      
      const closeButton = screen.getByRole('button', { name: /close/i });
      fireEvent.click(closeButton);
      expect(mockProps.onClose).toHaveBeenCalled();
    });
  });
});