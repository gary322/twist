import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useWallet } from '../hooks/useWallet';
import { formatAddress } from '../utils/format';
import * as LocalAuthentication from 'expo-local-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const ProfileScreen: React.FC = () => {
  const { publicKey, connected, connect, disconnect } = useWallet();
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await AsyncStorage.multiGet([
        'biometric_enabled',
        'notifications_enabled',
        'dark_mode',
      ]);
      
      setBiometricEnabled(settings[0][1] === 'true');
      setNotificationsEnabled(settings[1][1] !== 'false');
      setDarkMode(settings[2][1] === 'true');
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  const handleBiometricToggle = async (value: boolean) => {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (!hasHardware || !isEnrolled) {
        Alert.alert(
          'Biometric Authentication',
          'Your device does not support or have biometric authentication enabled.',
          [{ text: 'OK' }]
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Enable biometric authentication',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use passcode',
      });

      if (!result.success) {
        return;
      }
    }

    setBiometricEnabled(value);
    await AsyncStorage.setItem('biometric_enabled', value.toString());
  };

  const handleNotificationsToggle = async (value: boolean) => {
    setNotificationsEnabled(value);
    await AsyncStorage.setItem('notifications_enabled', value.toString());
  };

  const handleDarkModeToggle = async (value: boolean) => {
    setDarkMode(value);
    await AsyncStorage.setItem('dark_mode', value.toString());
    // In a real app, this would trigger a theme change
  };

  const handleConnectWallet = async () => {
    try {
      await connect();
    } catch (error) {
      Alert.alert('Error', 'Failed to connect wallet');
    }
  };

  const handleDisconnectWallet = () => {
    Alert.alert(
      'Disconnect Wallet',
      'Are you sure you want to disconnect your wallet?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: disconnect,
        },
      ]
    );
  };

  const handleExportData = () => {
    Alert.alert(
      'Export Data',
      'Export your staking data and transaction history?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Export', onPress: () => {
          Alert.alert('Success', 'Data exported to your device');
        }},
      ]
    );
  };

  const handleSupport = () => {
    Alert.alert(
      'Support',
      'Choose how to contact support:',
      [
        { text: 'Email', onPress: () => {} },
        { text: 'Discord', onPress: () => {} },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
        </View>

        {/* Wallet Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wallet</Text>
          {connected ? (
            <View style={styles.walletCard}>
              <View style={styles.walletInfo}>
                <Icon name="credit-card" size={24} color="#8B5CF6" />
                <View style={styles.walletDetails}>
                  <Text style={styles.walletLabel}>Connected</Text>
                  <Text style={styles.walletAddress}>
                    {formatAddress(publicKey || '')}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.disconnectButton}
                onPress={handleDisconnectWallet}
              >
                <Text style={styles.disconnectButtonText}>Disconnect</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.connectCard}
              onPress={handleConnectWallet}
            >
              <Icon name="link" size={24} color="#8B5CF6" />
              <Text style={styles.connectText}>Connect Wallet</Text>
              <Icon name="chevron-right" size={20} color="#6B7280" />
            </TouchableOpacity>
          )}
        </View>

        {/* Security Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Security</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Icon name="shield" size={20} color="#6B7280" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Biometric Authentication</Text>
                <Text style={styles.settingDescription}>
                  Use FaceID/TouchID for transactions
                </Text>
              </View>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={handleBiometricToggle}
              trackColor={{ false: '#D1D5DB', true: '#8B5CF6' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Preferences Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Icon name="bell" size={20} color="#6B7280" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Push Notifications</Text>
                <Text style={styles.settingDescription}>
                  Stake updates and rewards alerts
                </Text>
              </View>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={handleNotificationsToggle}
              trackColor={{ false: '#D1D5DB', true: '#8B5CF6' }}
              thumbColor="#fff"
            />
          </View>
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Icon name="moon" size={20} color="#6B7280" />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>Dark Mode</Text>
                <Text style={styles.settingDescription}>
                  Easier on the eyes at night
                </Text>
              </View>
            </View>
            <Switch
              value={darkMode}
              onValueChange={handleDarkModeToggle}
              trackColor={{ false: '#D1D5DB', true: '#8B5CF6' }}
              thumbColor="#fff"
            />
          </View>
        </View>

        {/* Actions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actions</Text>
          <TouchableOpacity style={styles.actionItem} onPress={handleExportData}>
            <Icon name="download" size={20} color="#6B7280" />
            <Text style={styles.actionText}>Export Data</Text>
            <Icon name="chevron-right" size={20} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem} onPress={handleSupport}>
            <Icon name="help-circle" size={20} color="#6B7280" />
            <Text style={styles.actionText}>Support</Text>
            <Icon name="chevron-right" size={20} color="#6B7280" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionItem}>
            <Icon name="book" size={20} color="#6B7280" />
            <Text style={styles.actionText}>Terms & Privacy</Text>
            <Icon name="chevron-right" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* About Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.aboutCard}>
            <Text style={styles.appName}>TWIST Staking</Text>
            <Text style={styles.appVersion}>Version 1.0.0</Text>
            <Text style={styles.appDescription}>
              Stake on influencers and earn from their success
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Built with 💜 by TWIST Team
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginBottom: 12,
  },
  walletCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  walletInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  walletDetails: {
    flex: 1,
  },
  walletLabel: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600',
  },
  walletAddress: {
    fontSize: 14,
    color: '#111827',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  disconnectButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  disconnectButtonText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
  },
  connectCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  connectText: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
    marginLeft: 12,
  },
  settingItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 12,
  },
  settingText: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
  },
  settingDescription: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  actionItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    fontWeight: '500',
    marginLeft: 12,
  },
  aboutCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  appName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  appVersion: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  appDescription: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
  footer: {
    alignItems: 'center',
    padding: 32,
  },
  footerText: {
    fontSize: 14,
    color: '#6B7280',
  },
};

export default ProfileScreen;