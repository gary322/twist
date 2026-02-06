import React, { useState, useEffect } from 'react';
import SimpleChart from './SimpleChart';

interface EarningsViewProps {
  earnings: {
    total: number;
    daily: number;
  };
}

interface RecentSite {
  domain: string;
  earned: number;
}

const EarningsView: React.FC<EarningsViewProps> = ({ earnings }) => {
  const [recentSites, setRecentSites] = useState<RecentSite[]>([]);

  useEffect(() => {
    loadRecentSites();
  }, []);

  const loadRecentSites = async () => {
    try {
      const sites = await chrome.runtime.sendMessage({ type: 'GET_RECENT_SITES' });
      setRecentSites(sites || []);
    } catch (error) {
      console.error('Failed to load recent sites:', error);
    }
  };

  return (
    <div className="earnings-view">
      <div className="earnings-summary">
        <div className="earning-stat">
          <span className="label">Today</span>
          <span className="value">{earnings.daily} TWIST</span>
        </div>
        <div className="earning-stat">
          <span className="label">Total</span>
          <span className="value">{earnings.total} TWIST</span>
        </div>
      </div>

      <div className="recent-sites">
        <h3>Recent Activity</h3>
        {recentSites.length > 0 ? (
          <ul>
            {recentSites.map((site, index) => (
              <li key={index}>
                <img 
                  src={`https://www.google.com/s2/favicons?domain=${site.domain}`} 
                  alt="" 
                />
                <span className="domain">{site.domain}</span>
                <span className="earned">+{site.earned}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">Start browsing to earn TWIST!</p>
        )}
      </div>

      <div className="earnings-chart">
        <h3>7-Day Trend</h3>
        <SimpleChart data={[10, 15, 8, 22, 18, 25, earnings.daily]} />
      </div>
    </div>
  );
};

export default EarningsView;