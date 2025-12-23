import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  DollarSign, Users, TrendingUp, Filter, Calendar, 
  RefreshCw, Building, User, CreditCard, Bitcoin,
  ChevronDown, X, BarChart3
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
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const TeamRevenue = ({ currentUser }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  
  // Quick date filter state
  const [activeQuickFilter, setActiveQuickFilter] = useState('all');
  
  // Filter states
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedAgent, setSelectedAgent] = useState('all');
  const [selectedPaymentType, setSelectedPaymentType] = useState('all');
  
  // Available filter options
  const [availableTeams, setAvailableTeams] = useState([]);
  const [availableAgents, setAvailableAgents] = useState([]);

  // Quick date filter helper
  const applyQuickDateFilter = useCallback((filterKey) => {
    setActiveQuickFilter(filterKey);
    const now = new Date();
    
    if (filterKey === 'all') {
      setDateFrom('');
      setDateTo('');
    } else if (filterKey === 'today') {
      const today = now.toISOString().split('T')[0];
      setDateFrom(today);
      setDateTo(today);
    } else if (filterKey === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      setDateFrom(weekAgo.toISOString().split('T')[0]);
      setDateTo(now.toISOString().split('T')[0]);
    } else if (filterKey === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setDateFrom(monthAgo.toISOString().split('T')[0]);
      setDateTo(now.toISOString().split('T')[0]);
    } else if (filterKey === 'lastMonth') {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      setDateFrom(firstDayLastMonth.toISOString().split('T')[0]);
      setDateTo(lastDayLastMonth.toISOString().split('T')[0]);
    } else if (filterKey === 'year') {
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      setDateFrom(startOfYear.toISOString().split('T')[0]);
      setDateTo(now.toISOString().split('T')[0]);
    }
  }, []);

  const fetchRevenueStats = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Build query params
      const params = new URLSearchParams();
      if (dateFrom) params.append('date_from', new Date(dateFrom).toISOString());
      if (dateTo) params.append('date_to', new Date(dateTo).toISOString());
      if (selectedTeam && selectedTeam !== 'all') params.append('team_id', selectedTeam);
      if (selectedAgent && selectedAgent !== 'all') params.append('agent_id', selectedAgent);
      if (selectedPaymentType && selectedPaymentType !== 'all') params.append('payment_type', selectedPaymentType);
      
      const response = await axios.get(`${API}/crm/deposits/stats/revenue?${params.toString()}`, { headers });
      setStats(response.data);
      
      // Update available filters
      if (response.data.filters) {
        setAvailableTeams(response.data.filters.teams || []);
        setAvailableAgents(response.data.filters.agents || []);
      }
    } catch (error) {
      console.error('Error fetching revenue stats:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedTeam, selectedAgent, selectedPaymentType, t]);

  useEffect(() => {
    fetchRevenueStats();
  }, [dateFrom, dateTo, fetchRevenueStats]);

  const handleApplyFilters = () => {
    fetchRevenueStats();
  };

  const handleClearFilters = () => {
    setDateFrom('');
    setDateTo('');
    setSelectedTeam('all');
    setSelectedAgent('all');
    setSelectedPaymentType('all');
    setActiveQuickFilter('all');
  };

  const formatCurrency = (amount, currency = 'EUR') => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  // Filter agents based on selected team
  const filteredAgents = selectedTeam && selectedTeam !== 'all'
    ? availableAgents.filter(a => a.team_id === selectedTeam)
    : availableAgents;

  if (loading && !stats) {
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
              <h1 className="text-2xl font-bold">{t('revenue.title')}</h1>
              <p className="text-gray-300 text-sm">{t('revenue.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button 
              onClick={() => setShowFilters(!showFilters)}
              variant="outline"
              className="border-[#D4AF37] text-[#D4AF37] hover:bg-[#D4AF37] hover:text-black"
            >
              <Filter className="w-4 h-4 mr-2" />
              {t('common.filters')}
              <ChevronDown className={`w-4 h-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </Button>
            <Button 
              onClick={fetchRevenueStats}
              className="bg-[#D4AF37] text-black hover:bg-[#C5A028]"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {t('common.refresh')}
            </Button>
          </div>
        </div>
      </div>

      {/* Quick Date Filters */}
      <div className="bg-white border-2 border-gray-200 p-4 rounded-lg">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#D4AF37]" />
            {t('common.quickFilters')}:
          </span>
          {[
            { key: 'all', label: t('common.all') },
            { key: 'today', label: t('analytics.period.today') },
            { key: 'week', label: t('analytics.period.week') },
            { key: 'month', label: t('analytics.period.month') },
            { key: 'lastMonth', label: t('revenue.lastMonth') },
            { key: 'year', label: t('analytics.period.year') }
          ].map(filter => (
            <Button
              key={filter.key}
              variant={activeQuickFilter === filter.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => applyQuickDateFilter(filter.key)}
              className={activeQuickFilter === filter.key ? 'bg-[#D4AF37] text-black hover:bg-[#C5A028]' : ''}
            >
              {filter.label}
            </Button>
          ))}
          
          {/* Show current date range if custom or any filter is active */}
          {(dateFrom || dateTo) && (
            <span className="text-sm text-gray-500 ml-4 flex items-center gap-2">
              <span className="font-medium">{t('revenue.showing')}:</span>
              {dateFrom && new Date(dateFrom).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
              {dateFrom && dateTo && ' - '}
              {dateTo && new Date(dateTo).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white border-2 border-gray-200 p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <Filter className="w-5 h-5 text-[#D4AF37]" />
              {t('revenue.filterDeposits')}
            </h3>
            <Button variant="ghost" size="sm" onClick={handleClearFilters}>
              <X className="w-4 h-4 mr-1" />
              {t('common.clearFilters')}
            </Button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {/* Date From */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {t('revenue.dateFrom')}
              </Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border-gray-300"
              />
            </div>

            {/* Date To */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                {t('revenue.dateTo')}
              </Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border-gray-300"
              />
            </div>

            {/* Team Filter */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building className="w-4 h-4" />
                {t('revenue.team')}
              </Label>
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  {availableTeams.map(team => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Agent Filter */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="w-4 h-4" />
                {t('revenue.agent')}
              </Label>
              <Select value={selectedAgent} onValueChange={setSelectedAgent}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  {filteredAgents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Payment Type Filter */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                {t('revenue.paymentType')}
              </Label>
              <Select value={selectedPaymentType} onValueChange={setSelectedPaymentType}>
                <SelectTrigger>
                  <SelectValue placeholder={t('common.all')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.all')}</SelectItem>
                  <SelectItem value="IBAN">IBAN</SelectItem>
                  <SelectItem value="Crypto">Crypto</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleApplyFilters} className="bg-[#D4AF37] text-black hover:bg-[#C5A028]">
              {t('revenue.applyFilters')}
            </Button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Total Revenue */}
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <DollarSign className="w-10 h-10 opacity-80" />
            <span className="text-xs uppercase tracking-wide opacity-80">{t('revenue.approvedOnly')}</span>
          </div>
          <div className="text-4xl font-bold mb-2">
            {formatCurrency(stats?.total_revenue || 0, stats?.currency)}
          </div>
          <p className="text-green-100">{t('revenue.totalRevenue')}</p>
        </div>

        {/* Total Deposits */}
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <TrendingUp className="w-10 h-10 opacity-80" />
            <span className="text-xs uppercase tracking-wide opacity-80">{t('revenue.count')}</span>
          </div>
          <div className="text-4xl font-bold mb-2">
            {stats?.total_deposits || 0}
          </div>
          <p className="text-blue-100">{t('revenue.approvedDeposits')}</p>
        </div>

        {/* Average Deposit */}
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-lg shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <BarChart3 className="w-10 h-10 opacity-80" />
            <span className="text-xs uppercase tracking-wide opacity-80">{t('revenue.average')}</span>
          </div>
          <div className="text-4xl font-bold mb-2">
            {formatCurrency(
              stats?.total_deposits > 0 ? stats?.total_revenue / stats?.total_deposits : 0,
              stats?.currency
            )}
          </div>
          <p className="text-purple-100">{t('revenue.avgDeposit')}</p>
        </div>
      </div>

      {/* Status Breakdown */}
      {stats?.by_status && stats.by_status.length > 0 && (
        <div className="bg-white border-2 border-gray-200 p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#D4AF37]" />
            {t('revenue.byStatus')}
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.by_status.map(item => (
              <div 
                key={item.status}
                className={`p-4 rounded-lg border-2 ${
                  item.status === 'approved' ? 'bg-green-50 border-green-200' :
                  item.status === 'pending' ? 'bg-yellow-50 border-yellow-200' :
                  item.status === 'rejected' ? 'bg-red-50 border-red-200' :
                  'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="text-sm font-medium text-gray-600 mb-1 capitalize">
                  {t(`deposits.${item.status}`, item.status)}
                </div>
                <div className="text-2xl font-bold">
                  {formatCurrency(item.revenue, stats?.currency)}
                </div>
                <div className="text-sm text-gray-500">
                  {item.count} {t('revenue.deposits')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revenue by Team */}
      {stats?.by_team && stats.by_team.length > 0 && (
        <div className="bg-white border-2 border-gray-200 p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Building className="w-5 h-5 text-[#D4AF37]" />
            {t('revenue.byTeam')}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-left font-semibold">{t('revenue.team')}</th>
                  <th className="p-3 text-right font-semibold">{t('revenue.deposits')}</th>
                  <th className="p-3 text-right font-semibold">{t('revenue.revenue')}</th>
                  <th className="p-3 text-right font-semibold">{t('revenue.avgDeposit')}</th>
                  <th className="p-3 text-left font-semibold">{t('revenue.share')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.by_team.map((team, idx) => {
                  const share = stats.total_revenue > 0 
                    ? (team.revenue / stats.total_revenue * 100).toFixed(1) 
                    : 0;
                  return (
                    <tr key={team.team_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-gray-400" />
                          {team.team_name || t('common.noTeam')}
                        </div>
                      </td>
                      <td className="p-3 text-right">{team.count}</td>
                      <td className="p-3 text-right font-semibold text-green-600">
                        {formatCurrency(team.revenue, stats?.currency)}
                      </td>
                      <td className="p-3 text-right text-gray-600">
                        {formatCurrency(team.count > 0 ? team.revenue / team.count : 0, stats?.currency)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                            <div 
                              className="bg-[#D4AF37] h-2 rounded-full" 
                              style={{ width: `${share}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600">{share}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Revenue by Agent */}
      {stats?.by_agent && stats.by_agent.length > 0 && (
        <div className="bg-white border-2 border-gray-200 p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <User className="w-5 h-5 text-[#D4AF37]" />
            {t('revenue.byAgent')}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 text-left font-semibold">#</th>
                  <th className="p-3 text-left font-semibold">{t('revenue.agent')}</th>
                  <th className="p-3 text-right font-semibold">{t('revenue.deposits')}</th>
                  <th className="p-3 text-right font-semibold">{t('revenue.revenue')}</th>
                  <th className="p-3 text-right font-semibold">{t('revenue.avgDeposit')}</th>
                  <th className="p-3 text-left font-semibold">{t('revenue.share')}</th>
                </tr>
              </thead>
              <tbody>
                {stats.by_agent.map((agent, idx) => {
                  const share = stats.total_revenue > 0 
                    ? (agent.revenue / stats.total_revenue * 100).toFixed(1) 
                    : 0;
                  return (
                    <tr key={agent.agent_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-3 text-gray-500">{idx + 1}</td>
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-[#D4AF37] text-black flex items-center justify-center text-sm font-bold">
                            {agent.agent_name?.charAt(0) || '?'}
                          </div>
                          {agent.agent_name}
                        </div>
                      </td>
                      <td className="p-3 text-right">{agent.count}</td>
                      <td className="p-3 text-right font-semibold text-green-600">
                        {formatCurrency(agent.revenue, stats?.currency)}
                      </td>
                      <td className="p-3 text-right text-gray-600">
                        {formatCurrency(agent.count > 0 ? agent.revenue / agent.count : 0, stats?.currency)}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[100px]">
                            <div 
                              className="bg-blue-500 h-2 rounded-full" 
                              style={{ width: `${share}%` }}
                            />
                          </div>
                          <span className="text-sm text-gray-600">{share}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Revenue by Payment Type */}
      {stats?.by_payment_type && stats.by_payment_type.length > 0 && (
        <div className="bg-white border-2 border-gray-200 p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-[#D4AF37]" />
            {t('revenue.byPaymentType')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {stats.by_payment_type.map(item => (
              <div 
                key={item.payment_type}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border"
              >
                <div className="flex items-center gap-3">
                  {item.payment_type === 'IBAN' ? (
                    <CreditCard className="w-8 h-8 text-blue-500" />
                  ) : (
                    <Bitcoin className="w-8 h-8 text-orange-500" />
                  )}
                  <div>
                    <div className="font-semibold">{item.payment_type}</div>
                    <div className="text-sm text-gray-500">{item.count} {t('revenue.deposits')}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-green-600">
                    {formatCurrency(item.revenue, stats?.currency)}
                  </div>
                  <div className="text-sm text-gray-500">
                    {stats.total_revenue > 0 
                      ? (item.revenue / stats.total_revenue * 100).toFixed(1) 
                      : 0}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Data Message */}
      {stats && stats.total_deposits === 0 && (
        <div className="bg-white border-2 border-gray-200 p-12 text-center">
          <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-600 mb-2">{t('revenue.noData')}</h3>
          <p className="text-gray-500">{t('revenue.noDataDescription')}</p>
        </div>
      )}
    </div>
  );
};

export default TeamRevenue;
