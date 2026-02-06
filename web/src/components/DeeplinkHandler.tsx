import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { deeplinkService } from '../services/deeplink';
import { useAuth } from '../hooks/useAuth';

export const DeeplinkHandler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, loading: authLoading } = useAuth();

  useEffect(() => {
    // Initialize deeplink service with navigation
    if (!authLoading) {
      deeplinkService.initialize(navigate);
    }
  }, [navigate, authLoading]);

  useEffect(() => {
    // Handle authentication-required deeplinks
    if (!authLoading && location.state?.requiresAuth && !isAuthenticated) {
      // Store intended destination
      sessionStorage.setItem('redirectAfterLogin', location.pathname + location.search);
      navigate('/login');
    }
  }, [isAuthenticated, authLoading, location, navigate]);

  useEffect(() => {
    // Handle post-login redirect
    if (isAuthenticated && !authLoading) {
      const redirectPath = sessionStorage.getItem('redirectAfterLogin');
      if (redirectPath) {
        sessionStorage.removeItem('redirectAfterLogin');
        navigate(redirectPath);
      }
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Listen for deeplink copied events
  useEffect(() => {
    const handleDeeplinkCopied = (event: CustomEvent) => {
      // You can show a toast notification here
      logger.log('Deeplink copied:', event.detail);
    };

    window.addEventListener('deeplink:copied', handleDeeplinkCopied as EventListener);
    return () => {
      window.removeEventListener('deeplink:copied', handleDeeplinkCopied as EventListener);
    };
  }, []);

  return <>{children}</>;
};