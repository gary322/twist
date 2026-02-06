import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';
import { api } from '../services/api';
import { formatToken } from '../utils/format';
import { useWallet } from '../hooks/useWallet';
import * as LocalAuthentication from 'expo-local-authentication';

interface StakingBottomSheetProps {
  influencer: any;
  onClose: () => void;
  onSuccess: () => void;
}

export const StakingBottomSheet: React.FC<StakingBottomSheetProps> = ({
  influencer,
  onClose,
  onSuccess,
}) => {
  const { publicKey } = useWallet();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const minStake = 1000; // 1000 TWIST minimum

  const handleStake = async () => {
    if (!publicKey) {
      Alert.alert('Error', 'Please connect your wallet first');
      return;
    }

    const stakeAmount = parseFloat(amount);
    if (!stakeAmount || stakeAmount < minStake) {
      setError(`Minimum stake is ${minStake} TWIST`);
      return;
    }

    // Request biometric authentication
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to confirm stake',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use passcode',
      });

      if (!result.success) {
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      const amountInSmallestUnit = (stakeAmount * 10 ** 9).toString();

      await api.stakeOnInfluencer({
        influencerId: influencer.id,
        amount: amountInSmallestUnit,
        wallet: publicKey,
      });

      Alert.alert(
        'Success!',
        `Successfully staked ${stakeAmount} TWIST on ${influencer.displayName}`,
        [{ text: 'OK', onPress: onSuccess }]
      );
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Staking failed');
    } finally {
      setLoading(false);
    }
  };

  const calculateEstimatedRewards = () => {
    const stakeAmount = parseFloat(amount) || 0;
    const yearlyRewards = stakeAmount * (influencer.metrics.apy / 100);
    const monthlyRewards = yearlyRewards / 12;
    return {
      yearly: yearlyRewards.toFixed(2),
      monthly: monthlyRewards.toFixed(2),
    };
  };

  const rewards = calculateEstimatedRewards();

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={true}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <View style={styles.bottomSheet}>
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.dragHandle} />
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeButton}
                >
                  <Icon name="x" size={24} color="#6B7280" />
                </TouchableOpacity>
              </View>

              {/* Title */}
              <Text style={styles.title}>
                Stake on {influencer.displayName}
              </Text>
              <Text style={styles.subtitle}>
                Earn {influencer.metrics.revenueSharePercent}% of their revenue
              </Text>

              {/* Influencer Info */}
              <View style={styles.infoCard}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Total Staked</Text>
                  <Text style={styles.infoValue}>
                    {formatToken(influencer.metrics.totalStaked)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Current APY</Text>
                  <Text style={[styles.infoValue, styles.apyText]}>
                    {influencer.metrics.apy.toFixed(2)}%
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Minimum Stake</Text>
                  <Text style={styles.infoValue}>{minStake} TWIST</Text>
                </View>
              </View>

              {/* Amount Input */}
              <View style={styles.inputContainer}>
                <Text style={styles.inputLabel}>Amount to Stake</Text>
                <View style={styles.inputWrapper}>
                  <TextInput
                    style={styles.input}
                    placeholder={`Min ${minStake} TWIST`}
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                    placeholderTextColor="#9CA3AF"
                  />
                  <Text style={styles.inputSuffix}>TWIST</Text>
                </View>
                {error ? (
                  <Text style={styles.errorText}>{error}</Text>
                ) : null}
              </View>

              {/* Estimated Rewards */}
              {amount && parseFloat(amount) >= minStake && (
                <View style={styles.rewardsCard}>
                  <Text style={styles.rewardsTitle}>Estimated Rewards</Text>
                  <View style={styles.rewardsGrid}>
                    <View style={styles.rewardItem}>
                      <Text style={styles.rewardLabel}>Monthly</Text>
                      <Text style={styles.rewardValue}>
                        ~{rewards.monthly} TWIST
                      </Text>
                    </View>
                    <View style={styles.rewardItem}>
                      <Text style={styles.rewardLabel}>Yearly</Text>
                      <Text style={styles.rewardValue}>
                        ~{rewards.yearly} TWIST
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.rewardNote}>
                    *Based on current {influencer.metrics.apy.toFixed(2)}% APY
                  </Text>
                </View>
              )}

              {/* Actions */}
              <View style={styles.actions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={onClose}
                  disabled={loading}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.stakeButton,
                    (!amount || parseFloat(amount) < minStake || loading) &&
                      styles.stakeButtonDisabled,
                  ]}
                  onPress={handleStake}
                  disabled={!amount || parseFloat(amount) < minStake || loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.stakeButtonText}>Stake TWIST</Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.disclaimer}>
                You can unstake your tokens at any time
              </Text>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = {
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  keyboardAvoid: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  header: {
    alignItems: 'center',
    marginBottom: 16,
  },
  dragHandle: {
    width: 48,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    marginBottom: 16,
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    top: 0,
    padding: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  },
  infoCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  apyText: {
    color: '#10B981',
  },
  inputContainer: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 16,
    color: '#111827',
  },
  inputSuffix: {
    fontSize: 16,
    color: '#6B7280',
  },
  errorText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
  },
  rewardsCard: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  rewardsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  rewardsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  rewardItem: {
    flex: 1,
  },
  rewardLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  rewardValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#8B5CF6',
  },
  rewardNote: {
    fontSize: 11,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  stakeButton: {
    flex: 1,
    paddingVertical: 14,
    backgroundColor: '#8B5CF6',
    borderRadius: 8,
    alignItems: 'center',
  },
  stakeButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  stakeButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  disclaimer: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
  },
};