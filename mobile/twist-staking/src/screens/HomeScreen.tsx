import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useNavigation } from '@react-navigation/native';
import { api } from '../services/api';
import { formatToken, formatNumber } from '../utils/format';

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [platformStats, setPlatformStats] = useState({
    totalStaked: '0',
    totalStakers: 0,
    averageApy: 0,
    topInfluencers: [],
    trendingInfluencers: [],
  });

  useEffect(() => {
    loadPlatformData();
  }, []);

  const loadPlatformData = async () => {
    try {
      const [stats, topInfluencers, trendingInfluencers] = await Promise.all([
        api.getPlatformStats(),
        api.searchInfluencers({ sortBy: 'totalStaked', limit: 5 }),
        api.searchInfluencers({ sortBy: 'stakerCount', limit: 5 }),
      ]);

      setPlatformStats({
        totalStaked: stats.totalStaked,
        totalStakers: stats.totalStakers,
        averageApy: stats.averageApy,
        topInfluencers,
        trendingInfluencers,
      });
    } catch (error) {
      console.error('Failed to load platform data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPlatformData();
    setRefreshing(false);
  };

  const navigateToStaking = () => {
    navigation.navigate('Staking' as any);
  };

  const navigateToInfluencer = (influencer: any) => {
    navigation.navigate('Staking', {
      screen: 'StakingList',
      params: { influencerId: influencer.id },
    } as any);
  };

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
          <Text style={styles.welcomeText}>Welcome to</Text>
          <Text style={styles.brandText}>TWIST Staking</Text>
          <Text style={styles.tagline}>
            Stake on influencers, earn from their success
          </Text>
        </View>

        {/* Platform Stats */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Platform Overview</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Icon name="trending-up" size={24} color="#8B5CF6" />
              <Text style={styles.statValue}>
                {formatToken(platformStats.totalStaked)}
              </Text>
              <Text style={styles.statLabel}>Total Staked</Text>
            </View>
            <View style={styles.statItem}>
              <Icon name="users" size={24} color="#8B5CF6" />
              <Text style={styles.statValue}>
                {formatNumber(platformStats.totalStakers)}
              </Text>
              <Text style={styles.statLabel}>Active Stakers</Text>
            </View>
            <View style={styles.statItem}>
              <Icon name="percent" size={24} color="#8B5CF6" />
              <Text style={styles.statValue}>
                {platformStats.averageApy.toFixed(1)}%
              </Text>
              <Text style={styles.statLabel}>Average APY</Text>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={navigateToStaking}
          >
            <Icon name="search" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Find Influencers</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Portfolio' as any)}
          >
            <Icon name="briefcase" size={20} color="#8B5CF6" />
            <Text style={styles.secondaryButtonText}>My Portfolio</Text>
          </TouchableOpacity>
        </View>

        {/* Top Staked Influencers */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Top Staked</Text>
            <TouchableOpacity onPress={navigateToStaking}>
              <Text style={styles.seeAllText}>See all</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {platformStats.topInfluencers.map((influencer) => (
              <TouchableOpacity
                key={influencer.id}
                style={styles.influencerCard}
                onPress={() => navigateToInfluencer(influencer)}
              >
                <Image
                  source={{ uri: influencer.avatar || '/default-avatar.png' }}
                  style={styles.influencerAvatar}
                />
                <Text style={styles.influencerName} numberOfLines={1}>
                  {influencer.displayName}
                </Text>
                <Text style={styles.influencerUsername} numberOfLines={1}>
                  @{influencer.username}
                </Text>
                <View style={styles.influencerStats}>
                  <Text style={styles.influencerStaked}>
                    {formatToken(influencer.metrics.totalStaked)}
                  </Text>
                  <Text style={styles.influencerApy}>
                    {influencer.metrics.apy.toFixed(1)}% APY
                  </Text>
                </View>
                <View style={[styles.tierTag, styles[`tier${influencer.tier}`]]}>
                  <Text style={styles.tierTagText}>{influencer.tier}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Trending Influencers */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Trending</Text>
            <Icon name="zap" size={18} color="#F59E0B" />
          </View>
          {platformStats.trendingInfluencers.map((influencer) => (
            <TouchableOpacity
              key={influencer.id}
              style={styles.trendingCard}
              onPress={() => navigateToInfluencer(influencer)}
            >
              <Image
                source={{ uri: influencer.avatar || '/default-avatar.png' }}
                style={styles.trendingAvatar}
              />
              <View style={styles.trendingInfo}>
                <Text style={styles.trendingName}>{influencer.displayName}</Text>
                <Text style={styles.trendingStats}>
                  {influencer.metrics.stakerCount} stakers • {influencer.metrics.apy.toFixed(1)}% APY
                </Text>
              </View>
              <View style={styles.trendingMetric}>
                <Icon name="trending-up" size={16} color="#10B981" />
                <Text style={styles.trendingValue}>
                  +{((Math.random() * 50) + 10).toFixed(0)}%
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Learn More */}
        <View style={styles.learnCard}>
          <Icon name="info" size={24} color="#8B5CF6" />
          <Text style={styles.learnTitle}>New to Staking?</Text>
          <Text style={styles.learnText}>
            Learn how to stake on influencers and earn passive income from their success
          </Text>
          <TouchableOpacity style={styles.learnButton}>
            <Text style={styles.learnButtonText}>Learn More</Text>
          </TouchableOpacity>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 24,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  welcomeText: {
    fontSize: 16,
    color: '#6B7280',
  },
  brandText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 4,
  },
  tagline: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  statsCard: {
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
  statsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginBottom: 24,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#8B5CF6',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  secondaryButtonText: {
    color: '#8B5CF6',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  seeAllText: {
    fontSize: 14,
    color: '#8B5CF6',
    fontWeight: '500',
  },
  influencerCard: {
    backgroundColor: '#fff',
    width: 160,
    padding: 16,
    borderRadius: 12,
    marginLeft: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  influencerAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginBottom: 12,
  },
  influencerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  influencerUsername: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  influencerStats: {
    marginTop: 8,
    alignItems: 'center',
  },
  influencerStaked: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  influencerApy: {
    fontSize: 12,
    color: '#10B981',
    marginTop: 2,
  },
  tierTag: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
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
  tierTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#1F2937',
  },
  trendingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
  },
  trendingAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  trendingInfo: {
    flex: 1,
    marginLeft: 12,
  },
  trendingName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  trendingStats: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  trendingMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trendingValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
  },
  learnCard: {
    backgroundColor: '#EDE9FE',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  learnTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#5B21B6',
    marginTop: 12,
  },
  learnText: {
    fontSize: 14,
    color: '#6B5A9F',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  learnButton: {
    backgroundColor: '#8B5CF6',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  learnButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
};

export default HomeScreen;