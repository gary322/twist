import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Feather';
import { useWallet } from '../hooks/useWallet';
import { api } from '../services/api';
import { formatToken } from '../utils/format';
import { StakingBottomSheet } from '../components/StakingBottomSheet';

export const InfluencerStakingScreen: React.FC = () => {
  const { publicKey } = useWallet();
  const [searchQuery, setSearchQuery] = useState('');
  const [influencers, setInfluencers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedInfluencer, setSelectedInfluencer] = useState(null);
  const [sortBy, setSortBy] = useState('totalStaked');

  useEffect(() => {
    loadInfluencers();
  }, [searchQuery, sortBy]);

  const loadInfluencers = async () => {
    setLoading(true);
    try {
      const results = await api.searchInfluencers({
        query: searchQuery,
        sortBy,
        limit: 20,
      });
      setInfluencers(results);
    } catch (error) {
      console.error('Failed to load influencers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadInfluencers();
    setRefreshing(false);
  };

  const renderInfluencer = ({ item }) => (
    <TouchableOpacity
      onPress={() => setSelectedInfluencer(item)}
      style={styles.influencerCard}
    >
      <View style={styles.influencerHeader}>
        <Image 
          source={{ uri: item.avatar || '/default-avatar.png' }}
          style={styles.avatar}
        />
        <View style={styles.influencerInfo}>
          <Text style={styles.displayName}>{item.displayName}</Text>
          <Text style={styles.username}>@{item.username}</Text>
        </View>
        <View style={[styles.tierBadge, styles[`tier${item.tier}`]]}>
          <Text style={styles.tierText}>{item.tier}</Text>
        </View>
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Staked</Text>
          <Text style={styles.metricValue}>
            {formatToken(item.metrics.totalStaked)}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>Stakers</Text>
          <Text style={styles.metricValue}>
            {item.metrics.stakerCount}
          </Text>
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>APY</Text>
          <Text style={[styles.metricValue, styles.apyText]}>
            {item.metrics.apy.toFixed(2)}%
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.stakeButton}>
        <Text style={styles.stakeButtonText}>Stake TWIST</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Stake on Influencers</Text>
        <Text style={styles.subtitle}>
          Earn a share of influencer revenue
        </Text>
      </View>

      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color="#666" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search influencers..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
        />
      </View>

      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        style={styles.sortContainer}
      >
        {[
          { key: 'totalStaked', label: 'Most Staked', icon: 'trending-up' },
          { key: 'stakerCount', label: 'Most Stakers', icon: 'users' },
          { key: 'apy', label: 'Highest APY', icon: 'award' },
        ].map((sort) => (
          <TouchableOpacity
            key={sort.key}
            onPress={() => setSortBy(sort.key)}
            style={[
              styles.sortButton,
              sortBy === sort.key && styles.sortButtonActive,
            ]}
          >
            <Icon 
              name={sort.icon} 
              size={16} 
              color={sortBy === sort.key ? '#fff' : '#666'} 
            />
            <Text style={[
              styles.sortButtonText,
              sortBy === sort.key && styles.sortButtonTextActive,
            ]}>
              {sort.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8B5CF6" />
        </View>
      ) : (
        <FlatList
          data={influencers}
          renderItem={renderInfluencer}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={['#8B5CF6']}
            />
          }
        />
      )}

      {selectedInfluencer && (
        <StakingBottomSheet
          influencer={selectedInfluencer}
          onClose={() => setSelectedInfluencer(null)}
          onSuccess={() => {
            setSelectedInfluencer(null);
            loadInfluencers();
          }}
        />
      )}
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
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    margin: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    color: '#111827',
  },
  sortContainer: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginRight: 8,
  },
  sortButtonActive: {
    backgroundColor: '#8B5CF6',
    borderColor: '#8B5CF6',
  },
  sortButtonText: {
    marginLeft: 6,
    fontSize: 14,
    color: '#6B7280',
  },
  sortButtonTextActive: {
    color: '#fff',
  },
  listContent: {
    padding: 16,
  },
  influencerCard: {
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
  influencerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  influencerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  displayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  username: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
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
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
  apyText: {
    color: '#10B981',
  },
  stakeButton: {
    backgroundColor: '#8B5CF6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  stakeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
};

export default InfluencerStakingScreen;