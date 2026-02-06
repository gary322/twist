import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Tag,
  Button,
  Input,
  Select,
  Modal,
  Form,
  Statistic,
  Row,
  Col,
  Alert,
  Tabs,
  Timeline,
  Badge,
  Tooltip,
  Space,
  DatePicker,
  Switch,
  InputNumber,
  Divider,
  message,
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  EditOutlined,
  StopOutlined,
  PlayCircleOutlined,
  DollarOutlined,
  TeamOutlined,
  LineChartOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { Line, Column, Pie } from '@ant-design/plots';
import { adminApi } from '../services/adminApi';
import { formatToken, formatNumber, formatPercent } from '../utils/format';

const { Option } = Select;
const { RangePicker } = DatePicker;
const { TabPane } = Tabs;

interface PoolData {
  id: string;
  influencer: {
    id: string;
    username: string;
    displayName: string;
    tier: string;
    verified: boolean;
  };
  poolAddress: string;
  totalStaked: string;
  stakerCount: number;
  revenueShareBps: number;
  minStake: string;
  currentApy: number;
  totalRewardsDistributed: string;
  isActive: boolean;
  createdAt: string;
  fraudScore?: number;
  alerts?: number;
}

export const PoolManagement: React.FC = () => {
  const [pools, setPools] = useState<PoolData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPool, setSelectedPool] = useState<PoolData | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFraudModal, setShowFraudModal] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    tier: 'all',
    status: 'all',
    sortBy: 'totalStaked',
  });
  const [stats, setStats] = useState({
    totalPools: 0,
    activePools: 0,
    totalValueLocked: '0',
    totalStakers: 0,
    averageApy: 0,
    totalRewardsDistributed: '0',
  });
  const [fraudAlerts, setFraudAlerts] = useState([]);
  const [poolHistory, setPoolHistory] = useState([]);

  const [form] = Form.useForm();

  useEffect(() => {
    loadPools();
    loadStats();
  }, [filters]);

  const loadPools = async () => {
    setLoading(true);
    try {
      const data = await adminApi.getPools(filters);
      setPools(data);
    } catch (error) {
      message.error('Failed to load pools');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const data = await adminApi.getPoolStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadPoolDetails = async (poolId: string) => {
    try {
      const [history, alerts] = await Promise.all([
        adminApi.getPoolHistory(poolId),
        adminApi.getPoolFraudAlerts(poolId),
      ]);
      setPoolHistory(history);
      setFraudAlerts(alerts);
    } catch (error) {
      console.error('Failed to load pool details:', error);
    }
  };

  const handleUpdatePool = async (values: any) => {
    if (!selectedPool) return;

    try {
      await adminApi.updatePool(selectedPool.id, {
        revenueShareBps: values.revenueShareBps,
        minStake: values.minStake.toString(),
        isActive: values.isActive,
      });
      message.success('Pool updated successfully');
      setShowEditModal(false);
      loadPools();
    } catch (error) {
      message.error('Failed to update pool');
    }
  };

  const handleTogglePoolStatus = async (pool: PoolData) => {
    try {
      await adminApi.updatePool(pool.id, {
        isActive: !pool.isActive,
      });
      message.success(`Pool ${pool.isActive ? 'deactivated' : 'activated'} successfully`);
      loadPools();
    } catch (error) {
      message.error('Failed to update pool status');
    }
  };

  const handleResolveFraud = async (alertId: string, action: 'approve' | 'block') => {
    try {
      await adminApi.resolveFraudAlert(alertId, action);
      message.success(`Fraud alert ${action}d`);
      if (selectedPool) {
        loadPoolDetails(selectedPool.id);
      }
    } catch (error) {
      message.error('Failed to resolve fraud alert');
    }
  };

  const columns = [
    {
      title: 'Influencer',
      key: 'influencer',
      render: (record: PoolData) => (
        <Space>
          <div>
            <div style={{ fontWeight: 600 }}>{record.influencer.displayName}</div>
            <div style={{ fontSize: 12, color: '#666' }}>@{record.influencer.username}</div>
          </div>
          <Tag color={getTierColor(record.influencer.tier)}>{record.influencer.tier}</Tag>
          {record.influencer.verified && <CheckCircleOutlined style={{ color: '#1890ff' }} />}
        </Space>
      ),
    },
    {
      title: 'Total Staked',
      dataIndex: 'totalStaked',
      key: 'totalStaked',
      sorter: true,
      render: (value: string) => formatToken(value),
    },
    {
      title: 'Stakers',
      dataIndex: 'stakerCount',
      key: 'stakerCount',
      sorter: true,
      render: (value: number) => formatNumber(value),
    },
    {
      title: 'APY',
      dataIndex: 'currentApy',
      key: 'currentApy',
      sorter: true,
      render: (value: number) => (
        <span style={{ color: '#52c41a', fontWeight: 600 }}>
          {formatPercent(value)}%
        </span>
      ),
    },
    {
      title: 'Revenue Share',
      dataIndex: 'revenueShareBps',
      key: 'revenueShareBps',
      render: (value: number) => `${value / 100}%`,
    },
    {
      title: 'Status',
      key: 'status',
      render: (record: PoolData) => (
        <Space>
          <Badge status={record.isActive ? 'success' : 'default'} />
          <span>{record.isActive ? 'Active' : 'Inactive'}</span>
          {record.fraudScore && record.fraudScore > 50 && (
            <Tooltip title={`Fraud Score: ${record.fraudScore}`}>
              <WarningOutlined style={{ color: '#ff4d4f' }} />
            </Tooltip>
          )}
          {record.alerts && record.alerts > 0 && (
            <Badge count={record.alerts} style={{ backgroundColor: '#ff4d4f' }} />
          )}
        </Space>
      ),
    },
    {
      title: 'Actions',
      key: 'actions',
      render: (record: PoolData) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={() => {
              setSelectedPool(record);
              form.setFieldsValue({
                revenueShareBps: record.revenueShareBps,
                minStake: Number(record.minStake) / 10 ** 9,
                isActive: record.isActive,
              });
              setShowEditModal(true);
            }}
          >
            Edit
          </Button>
          <Button
            icon={record.isActive ? <StopOutlined /> : <PlayCircleOutlined />}
            onClick={() => handleTogglePoolStatus(record)}
            danger={record.isActive}
          >
            {record.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          {record.alerts && record.alerts > 0 && (
            <Button
              icon={<ExclamationCircleOutlined />}
              onClick={() => {
                setSelectedPool(record);
                loadPoolDetails(record.id);
                setShowFraudModal(true);
              }}
              danger
            >
              View Alerts
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const getTierColor = (tier: string) => {
    const colors = {
      BRONZE: 'orange',
      SILVER: 'default',
      GOLD: 'gold',
      PLATINUM: 'purple',
    };
    return colors[tier] || 'default';
  };

  const renderPoolStats = () => (
    <Row gutter={16} style={{ marginBottom: 24 }}>
      <Col span={4}>
        <Card>
          <Statistic
            title="Total Pools"
            value={stats.totalPools}
            prefix={<TeamOutlined />}
          />
        </Card>
      </Col>
      <Col span={4}>
        <Card>
          <Statistic
            title="Active Pools"
            value={stats.activePools}
            valueStyle={{ color: '#3f8600' }}
            prefix={<PlayCircleOutlined />}
          />
        </Card>
      </Col>
      <Col span={4}>
        <Card>
          <Statistic
            title="Total Value Locked"
            value={formatToken(stats.totalValueLocked)}
            prefix={<DollarOutlined />}
          />
        </Card>
      </Col>
      <Col span={4}>
        <Card>
          <Statistic
            title="Total Stakers"
            value={formatNumber(stats.totalStakers)}
            prefix={<TeamOutlined />}
          />
        </Card>
      </Col>
      <Col span={4}>
        <Card>
          <Statistic
            title="Average APY"
            value={stats.averageApy}
            suffix="%"
            valueStyle={{ color: '#52c41a' }}
            prefix={<LineChartOutlined />}
          />
        </Card>
      </Col>
      <Col span={4}>
        <Card>
          <Statistic
            title="Rewards Distributed"
            value={formatToken(stats.totalRewardsDistributed)}
            prefix={<DollarOutlined />}
          />
        </Card>
      </Col>
    </Row>
  );

  const renderFilters = () => (
    <Card style={{ marginBottom: 24 }}>
      <Row gutter={16}>
        <Col span={6}>
          <Input
            placeholder="Search by username or address"
            prefix={<SearchOutlined />}
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
        </Col>
        <Col span={4}>
          <Select
            style={{ width: '100%' }}
            value={filters.tier}
            onChange={(value) => setFilters({ ...filters, tier: value })}
          >
            <Option value="all">All Tiers</Option>
            <Option value="BRONZE">Bronze</Option>
            <Option value="SILVER">Silver</Option>
            <Option value="GOLD">Gold</Option>
            <Option value="PLATINUM">Platinum</Option>
          </Select>
        </Col>
        <Col span={4}>
          <Select
            style={{ width: '100%' }}
            value={filters.status}
            onChange={(value) => setFilters({ ...filters, status: value })}
          >
            <Option value="all">All Status</Option>
            <Option value="active">Active</Option>
            <Option value="inactive">Inactive</Option>
            <Option value="flagged">Flagged</Option>
          </Select>
        </Col>
        <Col span={4}>
          <Select
            style={{ width: '100%' }}
            value={filters.sortBy}
            onChange={(value) => setFilters({ ...filters, sortBy: value })}
          >
            <Option value="totalStaked">Total Staked</Option>
            <Option value="stakerCount">Staker Count</Option>
            <Option value="apy">APY</Option>
            <Option value="createdAt">Created Date</Option>
          </Select>
        </Col>
        <Col span={6}>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadPools}
            loading={loading}
          >
            Refresh
          </Button>
        </Col>
      </Row>
    </Card>
  );

  const renderFraudAlerts = () => (
    <Timeline>
      {fraudAlerts.map((alert: any) => (
        <Timeline.Item
          key={alert.id}
          color={alert.severity === 'critical' ? 'red' : 'orange'}
          dot={<WarningOutlined />}
        >
          <Card size="small">
            <Row justify="space-between" align="middle">
              <Col span={16}>
                <h4>{alert.type}</h4>
                <p>{alert.description}</p>
                <Space>
                  <Tag color={alert.severity === 'critical' ? 'red' : 'orange'}>
                    {alert.severity}
                  </Tag>
                  <span>Risk Score: {alert.riskScore}</span>
                  <span>{new Date(alert.createdAt).toLocaleString()}</span>
                </Space>
              </Col>
              <Col span={8} style={{ textAlign: 'right' }}>
                {alert.status === 'open' && (
                  <Space>
                    <Button
                      type="primary"
                      size="small"
                      onClick={() => handleResolveFraud(alert.id, 'approve')}
                    >
                      Approve
                    </Button>
                    <Button
                      danger
                      size="small"
                      onClick={() => handleResolveFraud(alert.id, 'block')}
                    >
                      Block
                    </Button>
                  </Space>
                )}
                {alert.status !== 'open' && (
                  <Tag color={alert.status === 'approved' ? 'green' : 'red'}>
                    {alert.status}
                  </Tag>
                )}
              </Col>
            </Row>
          </Card>
        </Timeline.Item>
      ))}
    </Timeline>
  );

  const renderPoolHistory = () => {
    const chartData = poolHistory.map((item: any) => ({
      date: item.date,
      totalStaked: Number(item.totalStaked) / 10 ** 9,
      stakerCount: item.stakerCount,
      apy: item.apy,
    }));

    const config = {
      data: chartData,
      xField: 'date',
      yField: 'totalStaked',
      seriesField: 'type',
      smooth: true,
      animation: {
        appear: {
          animation: 'path-in',
          duration: 1000,
        },
      },
    };

    return (
      <div>
        <h3>Staking History</h3>
        <Line {...config} />
      </div>
    );
  };

  return (
    <div>
      <h1>Staking Pool Management</h1>
      
      {renderPoolStats()}
      {renderFilters()}

      <Card>
        <Table
          columns={columns}
          dataSource={pools}
          rowKey="id"
          loading={loading}
          pagination={{
            total: pools.length,
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `Total ${total} pools`,
          }}
        />
      </Card>

      {/* Edit Pool Modal */}
      <Modal
        title="Edit Staking Pool"
        visible={showEditModal}
        onCancel={() => setShowEditModal(false)}
        footer={null}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleUpdatePool}
        >
          <Form.Item
            name="revenueShareBps"
            label="Revenue Share (%)"
            rules={[
              { required: true, message: 'Please enter revenue share' },
              { type: 'number', min: 0, max: 5000, message: 'Must be between 0-50%' },
            ]}
          >
            <InputNumber
              min={0}
              max={5000}
              step={100}
              formatter={(value) => `${(value || 0) / 100}%`}
              parser={(value) => Number(value?.replace('%', '')) * 100}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            name="minStake"
            label="Minimum Stake (TWIST)"
            rules={[{ required: true, message: 'Please enter minimum stake' }]}
          >
            <InputNumber
              min={1}
              formatter={(value) => `${value} TWIST`}
              parser={(value) => Number(value?.replace(' TWIST', ''))}
              style={{ width: '100%' }}
            />
          </Form.Item>

          <Form.Item
            name="isActive"
            label="Pool Status"
            valuePropName="checked"
          >
            <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                Update Pool
              </Button>
              <Button onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* Fraud Alerts Modal */}
      <Modal
        title="Fraud Alerts & Pool History"
        visible={showFraudModal}
        onCancel={() => setShowFraudModal(false)}
        width={800}
        footer={null}
      >
        <Tabs defaultActiveKey="alerts">
          <TabPane tab="Fraud Alerts" key="alerts">
            {fraudAlerts.length > 0 ? (
              renderFraudAlerts()
            ) : (
              <Alert
                message="No fraud alerts"
                description="This pool has no pending fraud alerts."
                type="success"
                showIcon
              />
            )}
          </TabPane>
          <TabPane tab="Pool History" key="history">
            {poolHistory.length > 0 ? (
              renderPoolHistory()
            ) : (
              <Alert
                message="No history data"
                description="Pool history data is not available."
                type="info"
                showIcon
              />
            )}
          </TabPane>
        </Tabs>
      </Modal>
    </div>
  );
};