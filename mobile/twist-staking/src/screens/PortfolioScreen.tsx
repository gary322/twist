import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useWallet } from '../hooks/useWallet';
import { api } from '../services/api';
import { formatToken, formatAddress } from '../utils/format';
import * as LocalAuthentication from 'expo-local-authentication';

export const PortfolioScreen: React.FC = () => {
  const { publicKey, connected } = useWallet();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stakes, setStakes] = useState([]);
  const [totalStaked, setTotalStaked] = useState('0');
  const [totalPendingRewards, setTotalPendingRewards] = useState('0');
  const [claimingRewards, setClaimingRewards] = useState<string | null>(null);

  useEffect(() => {
    if (connected) {
      loadPortfolio();
    } else {
      setLoading(false);
    }
  }, [connected]);

  const loadPortfolio = async () => {
    try {
      const userStakes = await api.getUserStakes();
      setStakes(userStakes);

      const totalStaked = userStakes.reduce(
        (sum, stake) => sum + BigInt(stake.stake.amount),
        0n
      );
      const totalPending = userStakes.reduce(
        (sum, stake) => sum + BigInt(stake.stake.pendingRewards),
        0n
      );

      setTotalStaked(totalStaked.toString());
      setTotalPendingRewards(totalPending.toString());
    } catch (error) {
      console.error('Failed to load portfolio:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPortfolio();
    setRefreshing(false);
  };

  const handleClaimRewards = async (stake: any) => {
    if (!publicKey) {
      Alert.alert('Error', 'Please connect your wallet first');
      return;
    }

    // Request biometric authentication
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to claim rewards',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use passcode',
      });

      if (!result.success) {
        return;
      }
    }

    setClaimingRewards(stake.influencer.id);

    try {
      await api.claimRewards({
        influencerId: stake.influencer.id,
        wallet: publicKey,
      });

      Alert.alert(
        'Success!',
        `Successfully claimed ${formatToken(stake.stake.pendingRewards)}`,
        [{ text: 'OK', onPress: loadPortfolio }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to claim rewards');
    } finally {
      setClaimingRewards(null);
    }
  };

  const handleUnstake = async (stake: any) => {
    Alert.alert(
      'Unstake TWIST',
      `Are you sure you want to unstake ${formatToken(stake.stake.amount)} from ${stake.influencer.displayName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unstake',
          style: 'destructive',
          onPress: () => performUnstake(stake),
        },
      ]
    );
  };

  const performUnstake = async (stake: any) => {
    if (!publicKey) {
      Alert.alert('Error', 'Please connect your wallet first');
      return;
    }

    // Request biometric authentication
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (hasHardware && isEnrolled) {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to unstake',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use passcode',
      });

      if (!result.success) {
        return;
      }
    }

    try {
      await api.unstake({
        influencerId: stake.influencer.id,
        amount: stake.stake.amount,
        wallet: publicKey,
      });

      Alert.alert(
        'Success!',
        `Successfully unstaked ${formatToken(stake.stake.amount)}`,
        [{ text: 'OK', onPress: loadPortfolio }]
      );
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to unstake');
    }
  };

  if (!connected) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyContainer}>
          <Icon name="briefcase" size={64} color="#D1D5DB" />
          <Text style={styles.emptyTitle}>Connect Your Wallet</Text>
          <Text style={styles.emptyText}>
            Connect your wallet to view your staking portfolio
          </Text>
          <TouchableOpacity style={styles.connectButton}>
            <Text style={styles.connectButtonText}>Connect Wallet</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8B5CF6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#8B5CF6']}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>My Portfolio</Text>
          <TouchableOpacity style={styles.walletBadge}>
            <Icon name="credit-card" size={16} color="#8B5CF6" />
            <Text style={styles.walletAddress}>
              {formatAddress(publicKey || '')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Portfolio Stats */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Total Staked</Text>
            <Text style={styles.statValue}>{formatToken(totalStaked)}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Pending Rewards</Text>
            <Text style={[styles.statValue, styles.rewardsText]}>
              {formatToken(totalPendingRewards)}
            </Text>
          </View>
        </View>

        {/* Stakes List */}
        {stakes.length > 0 ? (
          <View style={styles.stakesList}>
            <Text style={styles.sectionTitle}>Active Stakes</Text>
            {stakes.map((stake) => (
              <View key={stake.influencer.id} style={styles.stakeCard}>
                <View style={styles.stakeHeader}>
                  <Image
                    source={{ uri: stake.influencer.avatar || '/default-avatar.png' }}
                    style={styles.avatar}
                  />
                  <View style={styles.stakeInfo}>
                    <Text style={styles.influencerName}>
                      {stake.influencer.displayName}
                    </Text>
                    <View style={styles.stakeStats}>
                      <Text style={styles.stakeAmount}>
                        {formatToken(stake.stake.amount)} staked
                      </Text>
                      <Text style={styles.statsSeparator}>•</Text>
                      <Text style={styles.apy}>
                        {stake.stake.apy.toFixed(1)}% APY
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.tierBadge, styles[`tier${stake.influencer.tier}`]]}>
                    <Text style={styles.tierText}>{stake.influencer.tier}</Text>
                  </View>
                </View>

                <View style={styles.rewardsCard}>
                  <View style={styles.rewardsInfo}>
                    <Text style={styles.rewardsLabel}>Pending Rewards</Text>
                    <Text style={styles.rewardsValue}>
                      {formatToken(stake.stake.pendingRewards)}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.claimButton,
                      BigInt(stake.stake.pendingRewards) === 0n && styles.claimButtonDisabled,
                    ]}
                    onPress={() => handleClaimRewards(stake)}
                    disabled={
                      BigInt(stake.stake.pendingRewards) === 0n ||
                      claimingRewards === stake.influencer.id
                    }
                  >
                    {claimingRewards === stake.influencer.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.claimButtonText}>Claim</Text>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.stakeDetails}>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Staked Since</Text>
                    <Text style={styles.detailValue}>
                      {new Date(stake.stake.stakedAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Total Claimed</Text>
                    <Text style={styles.detailValue}>
                      {formatToken(stake.stake.totalClaimed)}
                    </Text>
                  </View>
                  <View style={styles.detailItem}>
                    <Text style={styles.detailLabel}>Pool Share</Text>
                    <Text style={styles.detailValue}>
                      {stake.pool.revenueSharePercent}%
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.unstakeButton}
                  onPress={() => handleUnstake(stake)}
                >
                  <Icon name="log-out" size={16} color="#EF4444" />
                  <Text style={styles.unstakeButtonText}>Unstake</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.emptyStakes}>
            <Icon name="layers" size={48} color="#D1D5DB" />
            <Text style={styles.emptyStakesTitle}>No Active Stakes</Text>
            <Text style={styles.emptyStakesText}>
              Start staking on influencers to earn rewards
            </Text>
            <TouchableOpacity style={styles.findInfluencersButton}>
              <Text style={styles.findInfluencersButtonText}>
                Find Influencers
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 16,
  },
  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  connectButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
    marginBottom: 8,
  },
  walletBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    alignSelf: 'flex-start',
  },
  walletAddress: {
    fontSize: 12,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  statsCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  rewardsText: {
    color: '#10B981',
  },
  divider: {
    width: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 4,
  },
  stakesList: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 12,
  },
  stakeCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  stakeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  stakeInfo: {
    flex: 1,
    marginLeft: 12,
  },
  influencerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  stakeStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  stakeAmount: {
    fontSize: 14,
    color: '#6B7280',
  },
  statsSeparator: {
    marginHorizontal: 6,
    color: '#D1D5DB',
  },
  apy: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '500',
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tierBRONZE: {
    backgroundColor: '#FED7AA',
  },
  tierSILVER: {
    backgroundColor: '#E5E7EB',
  },
  tierGOLD: {
    backgroundColor: '#FEF3C7',
  },
  tierPLATINUM: {
    backgroundColor: '#E9D5FF',
  },
  tierText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
  },
  rewardsCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  rewardsInfo: {
    flex: 1,
  },
  rewardsLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  rewardsValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#10B981',
    marginTop: 2,
  },
  claimButton: {
    backgroundColor: '#10B981',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 6,
  },
  claimButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  stakeDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  detailItem: {
    flex: 1,
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
    marginTop: 2,
  },
  unstakeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  unstakeButtonText: {
    fontSize: 14,
    color: '#EF4444',
    fontWeight: '500',
  },
  emptyStakes: {
    alignItems: 'center',
    padding: 48,
  },
  emptyStakesTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 16,
  },
  emptyStakesText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  findInfluencersButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  findInfluencersButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
};

export default PortfolioScreen;