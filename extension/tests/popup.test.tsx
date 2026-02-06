import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { chrome } from 'jest-chrome';
import App from '../popup/src/App';

describe('Popup UI', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('App Component', () => {
    it('should show loading state initially', () => {
      chrome.runtime.sendMessage.mockImplementation(() => 
        new Promise(() => {}) // Never resolves to keep loading
      );

      render(<App />);
      
      expect(screen.getByTestId('spinner')).toBeInTheDocument();
    });

    it('should show login view when not authenticated', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({
        session: { isAuthenticated: false },
        earnings: { total: 0, daily: 0 }
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('TWIST')).toBeInTheDocument();
        expect(screen.getByText('Earn tokens while you browse')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Password')).toBeInTheDocument();
      });
    });

    it('should show main view when authenticated', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({
        session: {
          isAuthenticated: true,
          email: 'test@example.com',
          walletAddress: '0x1234567890'
        },
        earnings: { total: 100, daily: 10 }
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('test@example.com')).toBeInTheDocument();
        expect(screen.getByText('Earnings')).toBeInTheDocument();
        expect(screen.getByText('Settings')).toBeInTheDocument();
      });
    });
  });

  describe('Login Flow', () => {
    it('should handle successful login', async () => {
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({
          session: { isAuthenticated: false },
          earnings: { total: 0, daily: 0 }
        })
        .mockResolvedValueOnce({
          success: true,
          email: 'test@example.com'
        })
        .mockResolvedValueOnce({
          session: {
            isAuthenticated: true,
            email: 'test@example.com'
          },
          earnings: { total: 0, daily: 0 }
        });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
      });

      // Fill login form
      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'test@example.com' }
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: 'password123' }
      });

      // Submit form
      fireEvent.click(screen.getByText('Log In'));

      await waitFor(() => {
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
          type: 'AUTHENTICATE',
          payload: {
            email: 'test@example.com',
            password: 'password123'
          }
        });
      });

      // Should show main view after successful login
      await waitFor(() => {
        expect(screen.getByText('Earnings')).toBeInTheDocument();
      });
    });

    it('should show error on failed login', async () => {
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({
          session: { isAuthenticated: false },
          earnings: { total: 0, daily: 0 }
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Invalid credentials'
        });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
      });

      // Fill and submit form
      fireEvent.change(screen.getByPlaceholderText('Email'), {
        target: { value: 'test@example.com' }
      });
      fireEvent.change(screen.getByPlaceholderText('Password'), {
        target: { value: 'wrongpassword' }
      });
      fireEvent.click(screen.getByText('Log In'));

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
    });
  });

  describe('Earnings View', () => {
    beforeEach(async () => {
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({
          session: {
            isAuthenticated: true,
            email: 'test@example.com'
          },
          earnings: { total: 100, daily: 10 }
        })
        .mockResolvedValueOnce([]); // Recent sites

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Earnings')).toBeInTheDocument();
      });
    });

    it('should display earnings summary', () => {
      expect(screen.getByText('Today')).toBeInTheDocument();
      expect(screen.getByText('10 TWIST')).toBeInTheDocument();
      expect(screen.getByText('Total')).toBeInTheDocument();
      expect(screen.getByText('100 TWIST')).toBeInTheDocument();
    });

    it('should show recent activity', async () => {
      chrome.runtime.sendMessage.mockResolvedValue([
        { domain: 'example.com', earned: 5 },
        { domain: 'test.com', earned: 3 }
      ]);

      // Re-render to trigger loading recent sites
      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Recent Activity')).toBeInTheDocument();
      });
    });

    it('should display earnings chart', () => {
      expect(screen.getByText('7-Day Trend')).toBeInTheDocument();
      // Chart component should be rendered
    });
  });

  describe('Settings View', () => {
    beforeEach(async () => {
      chrome.runtime.sendMessage.mockResolvedValue({
        session: {
          isAuthenticated: true,
          email: 'test@example.com',
          walletAddress: '0x1234567890'
        },
        earnings: { total: 100, daily: 10 }
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Settings')).toBeInTheDocument();
      });

      // Switch to settings tab
      fireEvent.click(screen.getByText('Settings'));
    });

    it('should display wallet info when connected', () => {
      expect(screen.getByText(/Connected: 0x12345678/)).toBeInTheDocument();
      expect(screen.getByText('Copy')).toBeInTheDocument();
    });

    it('should show connect wallet button when not connected', async () => {
      chrome.runtime.sendMessage.mockResolvedValue({
        session: {
          isAuthenticated: true,
          email: 'test@example.com'
        },
        earnings: { total: 100, daily: 10 }
      });

      render(<App />);

      await waitFor(() => {
        fireEvent.click(screen.getByText('Settings'));
      });

      expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
    });

    it('should handle logout', async () => {
      chrome.runtime.sendMessage
        .mockResolvedValueOnce({ success: true })
        .mockResolvedValueOnce({
          session: { isAuthenticated: false },
          earnings: { total: 0, daily: 0 }
        });

      fireEvent.click(screen.getByText('Log Out'));

      await waitFor(() => {
        expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
          type: 'LOGOUT'
        });
      });

      // Should show login view after logout
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Email')).toBeInTheDocument();
      });
    });

    it('should open wallet connection in new tab', () => {
      fireEvent.click(screen.getByText('Connect Wallet'));

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://twist.io/connect-wallet'
      });
    });
  });

  describe('Navigation', () => {
    beforeEach(async () => {
      chrome.runtime.sendMessage.mockResolvedValue({
        session: {
          isAuthenticated: true,
          email: 'test@example.com'
        },
        earnings: { total: 100, daily: 10 }
      });

      render(<App />);

      await waitFor(() => {
        expect(screen.getByText('Earnings')).toBeInTheDocument();
      });
    });

    it('should switch between tabs', () => {
      // Initially on earnings tab
      expect(screen.getByText('Today')).toBeInTheDocument();

      // Switch to settings
      fireEvent.click(screen.getByText('Settings'));
      expect(screen.getByText('Account')).toBeInTheDocument();

      // Switch back to earnings
      fireEvent.click(screen.getByText('Earnings'));
      expect(screen.getByText('Today')).toBeInTheDocument();
    });
  });
});