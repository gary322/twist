import React, { useState, useEffect } from 'react';

interface Settings {
  apiKey?: string;
  privacyMode: 'strict' | 'balanced' | 'permissive';
  notifications: boolean;
  autoSubmitVAU: boolean;
  trackingEnabled: boolean;
}

const OptionsApp: React.FC = () => {
  const [settings, setSettings] = useState<Settings>({
    privacyMode: 'balanced',
    notifications: true,
    autoSubmitVAU: true,
    trackingEnabled: true
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const stored = await chrome.storage.local.get(['settings']);
    if (stored.settings) {
      setSettings(stored.settings);
    }
  };

  const saveSettings = async () => {
    await chrome.storage.local.set({ settings });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="options-container">
      <header>
        <img src="/assets/icon-48.png" alt="TWIST" />
        <h1>TWIST Extension Settings</h1>
      </header>

      <main>
        <section>
          <h2>API Configuration</h2>
          <div className="form-group">
            <label htmlFor="apiKey">API Key (Optional)</label>
            <input
              id="apiKey"
              type="text"
              value={settings.apiKey || ''}
              onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
              placeholder="Enter your TWIST API key"
            />
            <p className="help-text">
              Advanced users can provide their own API key for enhanced features.
            </p>
          </div>
        </section>

        <section>
          <h2>Privacy Settings</h2>
          <div className="form-group">
            <label htmlFor="privacyMode">Privacy Mode</label>
            <select
              id="privacyMode"
              value={settings.privacyMode}
              onChange={(e) => setSettings({ 
                ...settings, 
                privacyMode: e.target.value as 'strict' | 'balanced' | 'permissive' 
              })}
            >
              <option value="strict">Strict - No tracking on sensitive sites</option>
              <option value="balanced">Balanced - Smart detection (Recommended)</option>
              <option value="permissive">Permissive - Track all sites</option>
            </select>
          </div>

          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={settings.trackingEnabled}
                onChange={(e) => setSettings({ ...settings, trackingEnabled: e.target.checked })}
              />
              Enable activity tracking
            </label>
          </div>
        </section>

        <section>
          <h2>Notification Preferences</h2>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={settings.notifications}
                onChange={(e) => setSettings({ ...settings, notifications: e.target.checked })}
              />
              Show earning notifications
            </label>
          </div>
        </section>

        <section>
          <h2>Advanced Settings</h2>
          <div className="form-group">
            <label>
              <input
                type="checkbox"
                checked={settings.autoSubmitVAU}
                onChange={(e) => setSettings({ ...settings, autoSubmitVAU: e.target.checked })}
              />
              Automatically submit verified active usage
            </label>
          </div>
        </section>

        <div className="actions">
          <button onClick={saveSettings} className="save-button">
            Save Settings
          </button>
          {saved && <span className="saved-message">Settings saved!</span>}
        </div>
      </main>

      <style>{`
        .options-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 2rem;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }

        header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 2rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid #e5e7eb;
        }

        header img {
          width: 48px;
          height: 48px;
        }

        header h1 {
          margin: 0;
          color: #1f2937;
        }

        section {
          background: white;
          border-radius: 8px;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }

        section h2 {
          margin: 0 0 1rem 0;
          font-size: 1.25rem;
          color: #1f2937;
        }

        .form-group {
          margin-bottom: 1rem;
        }

        .form-group:last-child {
          margin-bottom: 0;
        }

        label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 500;
          color: #374151;
        }

        input[type="text"],
        select {
          width: 100%;
          padding: 0.5rem 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.375rem;
          font-size: 0.875rem;
        }

        input[type="checkbox"] {
          margin-right: 0.5rem;
        }

        .help-text {
          margin-top: 0.25rem;
          font-size: 0.875rem;
          color: #6b7280;
        }

        .actions {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-top: 2rem;
        }

        .save-button {
          background-color: #9333ea;
          color: white;
          padding: 0.75rem 2rem;
          border: none;
          border-radius: 0.375rem;
          font-weight: 500;
          cursor: pointer;
          transition: background-color 0.2s;
        }

        .save-button:hover {
          background-color: #7c3aed;
        }

        .saved-message {
          color: #16a34a;
          font-size: 0.875rem;
        }
      `}</style>
    </div>
  );
};

export default OptionsApp;