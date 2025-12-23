import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  BarChart3, TrendingUp, TrendingDown, Users, DollarSign, 
  FileText, Calendar, RefreshCw, Filter, ArrowUpRight, 
  ArrowDownRight, Clock, CheckCircle, XCircle, AlertCircle,
  PieChart as PieChartIcon, Activity, Eye, ChevronDown, User
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Area, AreaChart
} from 'recharts';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Chart colors
const COLORS = ['#D4AF37', '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899'];
const STATUS_COLORS = {
  'New': '#3B82F6',
  'Callback': '#F59E0B',
  'Potential Callback': '#F97316',
  'Deposit': '#10B981',
  'Deposit 1': '#10B981',
  'Deposit 2': '#059669',
  'Won': '#22C55E',
  'Lost': '#EF4444',
  'Unknown': '#9CA3AF'
};

const AnalyticsDashboard = ({ currentUser }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [realtimeData, setRealtimeData] = useState(null);
  
  // Filter states
  const [period, setPeriod] = useState('month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Deposits detail states
  const [showDepositsDetail, setShowDepositsDetail] = useState(false);
  const [depositsDetail, setDepositsDetail] = useState(null);
  const [depositsLoading, setDepositsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [depositDateFrom, setDepositDateFrom] = useState('');
  const [depositDateTo, setDepositDateTo] = useState('');

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Build query params
      const params = new URLSearchParams();
      params.append('period', period);
      if (period === 'custom' && dateFrom && dateTo) {
        params.append('date_from', new Date(dateFrom).toISOString());
        params.append('date_to', new Date(dateTo).toISOString());
      }
      
      const [overviewRes, realtimeRes] = await Promise.all([
        axios.get(`${API}/crm/analytics/overview?${params.toString()}`, { headers }),
        axios.get(`${API}/crm/analytics/realtime`, { headers })
      ]);
      
      setData(overviewRes.data);
      setRealtimeData(realtimeRes.data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [period, dateFrom, dateTo, t]);

  const fetchDepositsDetail = useCallback(async () => {
    setDepositsLoading(true);
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      const params = new URLSearchParams();
      
      // Use deposit-specific date filters if set, otherwise use global period
      if (depositDateFrom || depositDateTo) {
        params.append('period', 'custom');
        if (depositDateFrom) {
          params.append('date_from', new Date(depositDateFrom).toISOString());
        }
        if (depositDateTo) {
          params.append('date_to', new Date(depositDateTo).toISOString());
        }
      } else {
        params.append('period', period);
        if (period === 'custom' && dateFrom && dateTo) {
          params.append('date_from', new Date(dateFrom).toISOString());
          params.append('date_to', new Date(dateTo).toISOString());
        }
      }
      
      if (selectedAgent && selectedAgent !== 'all') {
        params.append('agent_id', selectedAgent);
      }
      if (selectedStatus && selectedStatus !== 'all') {
        params.append('status', selectedStatus);
      }
      
      const res = await axios.get(`${API}/crm/analytics/deposits/detail?${params.toString()}`, { headers });
      setDepositsDetail(res.data);
    } catch (error) {
      console.error('Error fetching deposits detail:', error);
      toast.error(t('common.error'));
    } finally {
      setDepositsLoading(false);
    }
  }, [period, dateFrom, dateTo, depositDateFrom, depositDateTo, selectedAgent, selectedStatus, t]);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  useEffect(() => {
    if (showDepositsDetail) {
      fetchDepositsDetail();
    }
  }, [showDepositsDetail, selectedAgent, selectedStatus, depositDateFrom, depositDateTo]);

  // Auto-refresh realtime data every 30 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem('crmToken');
        const headers = { Authorization: `Bearer ${token}` };
        const res = await axios.get(`${API}/crm/analytics/realtime`, { headers });
        setRealtimeData(res.data);
      } catch (e) {
        // Silently fail
      }
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const handleApplyFilters = () => {
    fetchAnalytics();
    if (showDepositsDetail) {
      fetchDepositsDetail();
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const formatPercent = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a1a2e] to-[#2d2d44] text-white p-6 border-2 border-[#D4AF37]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BarChart3 className="w-8 h-8 text-[#D4AF37]" />
            <div>
              <h1 className="text-2xl font-bold">{t('analytics.title')}</h1>
              <p className="text-gray-300 text-sm">{t('analytics.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              onClick={fetchAnalytics}
              className="bg-[#D4AF37] text-black hover:bg-[#C5A028]"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </Button>
          </div>
        </div>
      </div>

      {/* Time Period Selector */}
      <div className="bg-white border-2 border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-500" />
            <span className="font-medium">{t('analytics.timePeriod')}:</span>
          </div>
          
          <div className="flex gap-2">
            {['today', 'week', 'month', 'year'].map(p => (
              <Button
                key={p}
                variant={period === p ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setPeriod(p); setTimeout(fetchAnalytics, 100); }}
                className={period === p ? 'bg-[#D4AF37] text-black' : ''}
              >
                {t(`analytics.period.${p}`)}
              </Button>
            ))}
            <Button
              variant={period === 'custom' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod('custom')}
              className={period === 'custom' ? 'bg-[#D4AF37] text-black' : ''}
            >
              {t('analytics.period.custom')}
            </Button>
          </div>
          
          {period === 'custom' && (
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-40"
              />
              <span>-</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-40"
              />
              <Button onClick={handleApplyFilters} size="sm" className="bg-[#D4AF37] text-black">
                {t('common.apply')}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Real-time Stats Bar */}
      {realtimeData && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 animate-pulse" />
                <span className="font-medium">{t('analytics.realtime')}</span>
              </div>
              <div className="flex gap-6">
                <div>
                  <span className="text-blue-200 text-sm">{t('analytics.todayLeads')}:</span>
                  <span className="ml-2 font-bold">{realtimeData.today?.leads || 0}</span>
                </div>
                <div>
                  <span className="text-blue-200 text-sm">{t('analytics.todayRevenue')}:</span>
                  <span className="ml-2 font-bold">{formatCurrency(realtimeData.today?.revenue || 0)}</span>
                </div>
                <div>
                  <span className="text-blue-200 text-sm">{t('analytics.activeUsers')}:</span>
                  <span className="ml-2 font-bold">{realtimeData.active_users || 0}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="bg-yellow-500 text-black px-3 py-1 rounded text-sm">
                <AlertCircle className="w-4 h-4 inline mr-1" />
                {realtimeData.pending?.deposits || 0} {t('analytics.pendingDeposits')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      {data?.summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Leads */}
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <FileText className="w-10 h-10 text-blue-500" />
              <div className={`flex items-center text-sm ${data.summary.leads_change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {data.summary.leads_change >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                {formatPercent(data.summary.leads_change)}
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900">{data.summary.total_leads}</div>
            <p className="text-gray-500 text-sm">{t('analytics.totalLeads')}</p>
          </div>

          {/* Conversion Rate */}
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <TrendingUp className="w-10 h-10 text-green-500" />
              <div className="text-sm text-gray-500">{t('analytics.toDeposit')}</div>
            </div>
            <div className="text-3xl font-bold text-gray-900">{data.summary.conversion_rate}%</div>
            <p className="text-gray-500 text-sm">{t('analytics.conversionRate')}</p>
          </div>

          {/* Total Revenue */}
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <DollarSign className="w-10 h-10 text-[#D4AF37]" />
              <div className={`flex items-center text-sm ${data.summary.revenue_change >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {data.summary.revenue_change >= 0 ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                {formatPercent(data.summary.revenue_change)}
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900">{formatCurrency(data.summary.total_revenue)}</div>
            <p className="text-gray-500 text-sm">{t('analytics.totalRevenue')}</p>
          </div>

          {/* Approval Rate */}
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <CheckCircle className="w-10 h-10 text-purple-500" />
              <div className="text-sm text-gray-500">
                {data.summary.approved_deposits}/{data.summary.total_deposits}
              </div>
            </div>
            <div className="text-3xl font-bold text-gray-900">{data.summary.approval_rate}%</div>
            <p className="text-gray-500 text-sm">{t('analytics.approvalRate')}</p>
          </div>
        </div>
      )}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Leads Over Time */}
        {data?.leads?.over_time && data.leads.over_time.length > 0 && (
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#D4AF37]" />
              {t('analytics.leadsOverTime')}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data.leads.over_time}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
                />
                <YAxis />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                />
                <Area type="monotone" dataKey="count" stroke="#D4AF37" fill="#D4AF37" fillOpacity={0.3} name={t('analytics.leads')} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Deposits Over Time */}
        {data?.deposits?.over_time && data.deposits.over_time.length > 0 && (
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#D4AF37]" />
              {t('analytics.depositsOverTime')}
            </h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={data.deposits.over_time}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="date" 
                  tickFormatter={(value) => new Date(value).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
                />
                <YAxis yAxisId="left" orientation="left" stroke="#4F46E5" />
                <YAxis yAxisId="right" orientation="right" stroke="#10B981" />
                <Tooltip 
                  labelFormatter={(value) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  formatter={(value, name) => [name === 'amount' ? formatCurrency(value) : value, name === 'amount' ? t('analytics.revenue') : t('analytics.count')]}
                />
                <Bar yAxisId="left" dataKey="count" fill="#4F46E5" name={t('analytics.count')} />
                <Bar yAxisId="right" dataKey="amount" fill="#10B981" name={t('analytics.revenue')} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Charts Row 2 - Pie Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leads by Status */}
        {data?.leads?.by_status && data.leads.by_status.length > 0 && (
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-[#D4AF37]" />
              {t('analytics.leadsByStatus')}
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={data.leads.by_status}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                  nameKey="status"
                  label={({ status, percent }) => `${status} (${(percent * 100).toFixed(0)}%)`}
                >
                  {data.leads.by_status.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status] || COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Leads by Source */}
        {data?.leads?.by_source && data.leads.by_source.length > 0 && (
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-[#D4AF37]" />
              {t('analytics.leadsBySource')}
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={data.leads.by_source}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                  nameKey="source"
                  label={({ source, percent }) => `${source} (${(percent * 100).toFixed(0)}%)`}
                >
                  {data.leads.by_source.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Deposits by Payment Type */}
        {data?.deposits?.by_type && data.deposits.by_type.length > 0 && (
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-[#D4AF37]" />
              {t('analytics.depositsByType')}
            </h3>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={data.deposits.by_type}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="amount"
                  nameKey="type"
                  label={({ type, percent }) => `${type} (${(percent * 100).toFixed(0)}%)`}
                >
                  {data.deposits.by_type.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.type === 'IBAN' ? '#4F46E5' : '#F59E0B'} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Team Performance */}
      {data?.teams && data.teams.length > 0 && (
        <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-[#D4AF37]" />
            {t('analytics.teamPerformance')}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-left font-semibold">{t('analytics.team')}</th>
                  <th className="p-3 text-center font-semibold">{t('analytics.members')}</th>
                  <th className="p-3 text-center font-semibold">{t('analytics.leads')}</th>
                  <th className="p-3 text-center font-semibold">{t('analytics.conversions')}</th>
                  <th className="p-3 text-center font-semibold">{t('analytics.conversionRate')}</th>
                  <th className="p-3 text-right font-semibold">{t('analytics.revenue')}</th>
                  <th className="p-3 text-right font-semibold">{t('analytics.avgPerMember')}</th>
                </tr>
              </thead>
              <tbody>
                {data.teams.map((team, idx) => (
                  <tr key={team.team_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="p-3 font-medium">{team.team_name}</td>
                    <td className="p-3 text-center">{team.members}</td>
                    <td className="p-3 text-center">{team.leads}</td>
                    <td className="p-3 text-center">{team.conversions}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded text-sm ${
                        team.conversion_rate >= 20 ? 'bg-green-100 text-green-800' :
                        team.conversion_rate >= 10 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {team.conversion_rate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3 text-right font-semibold text-green-600">{formatCurrency(team.revenue)}</td>
                    <td className="p-3 text-right text-gray-600">{formatCurrency(team.avg_revenue_per_member)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Agent Performance */}
      {data?.agents && data.agents.length > 0 && (
        <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-[#D4AF37]" />
            {t('analytics.topAgents')}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-left font-semibold">#</th>
                  <th className="p-3 text-left font-semibold">{t('analytics.agent')}</th>
                  <th className="p-3 text-center font-semibold">{t('analytics.role')}</th>
                  <th className="p-3 text-center font-semibold">{t('analytics.leadsAssigned')}</th>
                  <th className="p-3 text-center font-semibold">{t('analytics.converted')}</th>
                  <th className="p-3 text-center font-semibold">{t('analytics.conversionRate')}</th>
                  <th className="p-3 text-center font-semibold">{t('analytics.activities')}</th>
                  <th className="p-3 text-right font-semibold">{t('analytics.revenue')}</th>
                </tr>
              </thead>
              <tbody>
                {data.agents.map((agent, idx) => (
                  <tr key={agent.agent_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="p-3 text-gray-500">{idx + 1}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#D4AF37] text-black flex items-center justify-center text-sm font-bold">
                          {agent.agent_name?.charAt(0) || '?'}
                        </div>
                        <span className="font-medium">{agent.agent_name}</span>
                      </div>
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded text-xs ${
                        agent.role === 'supervisor' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'
                      }`}>
                        {agent.role}
                      </span>
                    </td>
                    <td className="p-3 text-center">{agent.leads_assigned}</td>
                    <td className="p-3 text-center">{agent.leads_converted}</td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded text-sm ${
                        agent.conversion_rate >= 20 ? 'bg-green-100 text-green-800' :
                        agent.conversion_rate >= 10 ? 'bg-yellow-100 text-yellow-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {agent.conversion_rate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="p-3 text-center">{agent.activities}</td>
                    <td className="p-3 text-right font-semibold text-green-600">{formatCurrency(agent.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Deposits Detail Section */}
      <div className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowDepositsDetail(!showDepositsDetail)}
          className="w-full p-6 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <DollarSign className="w-6 h-6 text-[#D4AF37]" />
            <div className="text-left">
              <h3 className="text-lg font-bold">{t('analytics.depositsDetail')}</h3>
              <p className="text-sm text-gray-500">{t('analytics.depositsDetailDesc')}</p>
            </div>
          </div>
          <ChevronDown className={`w-5 h-5 text-gray-500 transition-transform ${showDepositsDetail ? 'rotate-180' : ''}`} />
        </button>
        
        {showDepositsDetail && (
          <div className="border-t p-6">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-6 pb-4 border-b items-end">
              {/* Date Range Filters */}
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <Label>{t('analytics.dateFrom')}:</Label>
                <Input
                  type="date"
                  value={depositDateFrom}
                  onChange={(e) => setDepositDateFrom(e.target.value)}
                  className="w-40"
                />
              </div>
              
              <div className="flex items-center gap-2">
                <Label>{t('analytics.dateTo')}:</Label>
                <Input
                  type="date"
                  value={depositDateTo}
                  onChange={(e) => setDepositDateTo(e.target.value)}
                  className="w-40"
                />
              </div>
              
              {/* Agent Filter */}
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" />
                <Label>{t('analytics.filterByAgent')}:</Label>
                <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder={t('common.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    {data?.available_agents?.map(agent => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.name} ({agent.role})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-500" />
                <Label>{t('common.status')}:</Label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder={t('common.all')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('common.all')}</SelectItem>
                    <SelectItem value="pending">{t('analytics.statusPending')}</SelectItem>
                    <SelectItem value="approved">{t('analytics.statusApproved')}</SelectItem>
                    <SelectItem value="rejected">{t('analytics.statusRejected')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Clear Filters Button */}
              {(depositDateFrom || depositDateTo || selectedAgent !== 'all' || selectedStatus !== 'all') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setDepositDateFrom('');
                    setDepositDateTo('');
                    setSelectedAgent('all');
                    setSelectedStatus('all');
                  }}
                  className="text-gray-500"
                >
                  {t('common.clearFilters')}
                </Button>
              )}
              
              {depositsDetail && (
                <div className="ml-auto flex items-center gap-4 text-sm">
                  <span className="text-gray-500">
                    {t('common.total')}: <strong>{depositsDetail.total_count}</strong> {t('analytics.deposits')}
                  </span>
                  <span className="text-green-600 font-semibold">
                    {t('analytics.approvedTotal')}: {formatCurrency(depositsDetail.approved_amount)}
                  </span>
                </div>
              )}
            </div>
            
            {/* Deposits Table */}
            {depositsLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#D4AF37]"></div>
              </div>
            ) : depositsDetail?.deposits?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="p-3 text-left font-semibold">{t('analytics.client')}</th>
                      <th className="p-3 text-left font-semibold">{t('analytics.agent')}</th>
                      <th className="p-3 text-right font-semibold">{t('common.amount')}</th>
                      <th className="p-3 text-center font-semibold">{t('analytics.paymentType')}</th>
                      <th className="p-3 text-center font-semibold">{t('common.status')}</th>
                      <th className="p-3 text-center font-semibold">{t('analytics.createdAt')}</th>
                      <th className="p-3 text-center font-semibold">{t('analytics.approvedAt')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depositsDetail.deposits.map((deposit, idx) => (
                      <tr key={deposit.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="p-3">
                          <div className="font-medium">{deposit.lead_name}</div>
                          {deposit.lead_email && (
                            <div className="text-xs text-gray-500">{deposit.lead_email}</div>
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-[#D4AF37] text-black flex items-center justify-center text-xs font-bold">
                              {deposit.agent_name?.charAt(0) || '?'}
                            </div>
                            <span className="text-sm">{deposit.agent_name}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-semibold text-green-600">
                          {formatCurrency(deposit.amount)}
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded text-xs ${
                            deposit.payment_type === 'IBAN' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'
                          }`}>
                            {deposit.payment_type}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded text-xs ${
                            deposit.status === 'approved' ? 'bg-green-100 text-green-800' :
                            deposit.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {deposit.status === 'approved' ? '✓ ' : deposit.status === 'rejected' ? '✗ ' : '⏳ '}
                            {deposit.status}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <div className="text-sm">{deposit.created_date}</div>
                          <div className="text-xs text-gray-500">{deposit.created_time}</div>
                        </td>
                        <td className="p-3 text-center">
                          {deposit.approved_date ? (
                            <>
                              <div className="text-sm text-green-600">{deposit.approved_date}</div>
                              <div className="text-xs text-gray-500">{deposit.approved_time}</div>
                            </>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <DollarSign className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>{t('analytics.noDepositsFound')}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* No Data Message */}
      {data && data.summary?.total_leads === 0 && (
        <div className="bg-white border-2 border-gray-200 p-12 text-center rounded-lg">
          <BarChart3 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">{t('analytics.noData')}</h3>
          <p className="text-gray-500">{t('analytics.noDataDescription')}</p>
        </div>
      )}
    </div>
  );
};

export default AnalyticsDashboard;
