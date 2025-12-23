import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  DollarSign, TrendingUp, Wallet, Calendar, RefreshCw, 
  ArrowUpRight, Target, Users, Receipt, PieChart as PieChartIcon,
  ChevronDown, FileText, CheckCircle, Clock, XCircle, Plus, Trash2, X
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
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const COLORS = ['#D4AF37', '#4F46E5', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'];
const EXPENSE_TYPES = ['Rent', 'Utilities', 'Equipment', 'Supplies', 'Marketing', 'Salaries', 'Other'];

const FinancialDashboard = ({ currentUser }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showTiers, setShowTiers] = useState(false);
  
  // Expense Management States (Admin only)
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showExpensesList, setShowExpensesList] = useState(false);
  const [expensesList, setExpensesList] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [newExpense, setNewExpense] = useState({
    expense_type: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    paid_by: ''
  });

  const role = currentUser?.role?.toLowerCase();

  const fetchFinancialData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      let endpoint = '';
      if (role === 'agent') {
        endpoint = `/crm/finance/agent/dashboard`;
      } else if (role === 'supervisor') {
        endpoint = `/crm/finance/supervisor/dashboard`;
      } else if (role === 'admin') {
        endpoint = `/crm/finance/admin/overview`;
      }
      
      const res = await axios.get(`${API}${endpoint}?month=${selectedMonth}&year=${selectedYear}`, { headers });
      setData(res.data);
    } catch (error) {
      console.error('Error fetching financial data:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [role, selectedMonth, selectedYear, t]);

  useEffect(() => {
    fetchFinancialData();
  }, [selectedMonth, selectedYear]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  };

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37]"></div>
      </div>
    );
  }

  // ==================== AGENT DASHBOARD ====================
  if (role === 'agent') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a1a2e] to-[#2d2d44] text-white p-6 border-2 border-[#D4AF37]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wallet className="w-8 h-8 text-[#D4AF37]" />
              <div>
                <h1 className="text-2xl font-bold">{t('finance.myEarnings')}</h1>
                <p className="text-gray-300 text-sm">{data?.period?.month_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                <SelectTrigger className="w-36 bg-white/10 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="w-24 bg-white/10 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={fetchFinancialData} className="bg-[#D4AF37] text-black hover:bg-[#C5A028]">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-8 h-8 opacity-80" />
              <span className="text-xs uppercase tracking-wide opacity-80">{t('finance.baseSalary')}</span>
            </div>
            <div className="text-3xl font-bold">{formatCurrency(data?.summary?.base_salary)}</div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-8 h-8 opacity-80" />
              <span className="text-xs uppercase tracking-wide opacity-80">{data?.summary?.commission_rate}</span>
            </div>
            <div className="text-3xl font-bold">{formatCurrency(data?.summary?.commission_earned)}</div>
            <p className="text-green-100 text-sm">{t('finance.commissionEarned')}</p>
          </div>

          <div className="bg-gradient-to-br from-[#D4AF37] to-[#C5A028] text-black p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <Wallet className="w-8 h-8 opacity-80" />
              <span className="text-xs uppercase tracking-wide opacity-80">{t('finance.total')}</span>
            </div>
            <div className="text-3xl font-bold">{formatCurrency(data?.summary?.total_earnings)}</div>
            <p className="text-black/70 text-sm">{t('finance.totalEarnings')}</p>
          </div>

          <div className="bg-gradient-to-br from-yellow-500 to-orange-500 text-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <Clock className="w-8 h-8 opacity-80" />
              <span className="text-xs uppercase tracking-wide opacity-80">{t('finance.pending')}</span>
            </div>
            <div className="text-3xl font-bold">{formatCurrency(data?.summary?.pending_commission)}</div>
            <p className="text-yellow-100 text-sm">{t('finance.pendingCommission')}</p>
          </div>
        </div>

        {/* Next Tier Progress */}
        {data?.next_tier && (
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-[#D4AF37]" />
              {t('finance.nextTierProgress')}
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-600">{t('finance.currentTier')}: <strong>{data.next_tier.current_tier}</strong></span>
                  <span className="text-sm text-gray-600">{t('finance.nextTier')}: <strong>{data.next_tier.next_tier}</strong></span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div 
                    className="bg-[#D4AF37] h-4 rounded-full transition-all" 
                    style={{ width: `${Math.min(100, (data.summary.total_approved_volume / data.next_tier.next_tier_threshold) * 100)}%` }}
                  />
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  {t('finance.needMore')} <strong>{formatCurrency(data.next_tier.amount_needed)}</strong> {t('finance.toReachNextTier')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Commission Tiers */}
        <div className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowTiers(!showTiers)}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
          >
            <span className="font-semibold flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-[#D4AF37]" />
              {t('finance.commissionTiers')}
            </span>
            <ChevronDown className={`w-5 h-5 transition-transform ${showTiers ? 'rotate-180' : ''}`} />
          </button>
          {showTiers && (
            <div className="p-4 border-t grid grid-cols-2 md:grid-cols-4 gap-2">
              {data?.commission_tiers?.map((tier, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded text-center">
                  <div className="text-sm text-gray-600">{tier.range}</div>
                  <div className="text-lg font-bold text-[#D4AF37]">{tier.rate}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Deposit History */}
        <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#D4AF37]" />
            {t('finance.depositHistory')}
          </h3>
          {data?.deposit_history?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-3 text-left">{t('common.date')}</th>
                    <th className="p-3 text-left">{t('finance.client')}</th>
                    <th className="p-3 text-right">{t('common.amount')}</th>
                    <th className="p-3 text-center">{t('common.status')}</th>
                    <th className="p-3 text-right">{t('finance.commission')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.deposit_history.map((dep, idx) => (
                    <tr key={dep.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-3 text-sm">
                        {dep.date ? new Date(dep.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-'}
                      </td>
                      <td className="p-3">{dep.client_name}</td>
                      <td className="p-3 text-right font-semibold">{formatCurrency(dep.amount)}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs ${
                          dep.status === 'approved' ? 'bg-green-100 text-green-800' :
                          dep.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {dep.status === 'approved' && <CheckCircle className="w-3 h-3 inline mr-1" />}
                          {dep.status === 'pending' && <Clock className="w-3 h-3 inline mr-1" />}
                          {dep.status === 'rejected' && <XCircle className="w-3 h-3 inline mr-1" />}
                          {dep.status}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        {dep.status === 'approved' ? (
                          <span className="text-green-600 font-semibold">{formatCurrency(dep.commission_earned)}</span>
                        ) : dep.status === 'pending' ? (
                          <span className="text-yellow-600 text-sm">~{formatCurrency(dep.pending_commission)}</span>
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
            <p className="text-gray-500 text-center py-8">{t('finance.noDeposits')}</p>
          )}
        </div>
      </div>
    );
  }

  // ==================== SUPERVISOR DASHBOARD ====================
  if (role === 'supervisor') {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a1a2e] to-[#2d2d44] text-white p-6 border-2 border-[#D4AF37]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Wallet className="w-8 h-8 text-[#D4AF37]" />
              <div>
                <h1 className="text-2xl font-bold">{t('finance.myEarnings')}</h1>
                <p className="text-gray-300 text-sm">{data?.period?.month_name} - {t('finance.teamBased')}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                <SelectTrigger className="w-36 bg-white/10 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="w-24 bg-white/10 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={fetchFinancialData} className="bg-[#D4AF37] text-black hover:bg-[#C5A028]">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <DollarSign className="w-8 h-8 opacity-80" />
              <span className="text-xs uppercase tracking-wide opacity-80">{t('finance.baseSalary')}</span>
            </div>
            <div className="text-3xl font-bold">{formatCurrency(data?.summary?.base_salary)}</div>
          </div>

          <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-8 h-8 opacity-80" />
              <span className="text-xs uppercase tracking-wide opacity-80">{data?.summary?.commission_rate}</span>
            </div>
            <div className="text-3xl font-bold">{formatCurrency(data?.summary?.commission_earned)}</div>
            <p className="text-green-100 text-sm">{t('finance.teamCommission')}</p>
          </div>

          <div className="bg-gradient-to-br from-[#D4AF37] to-[#C5A028] text-black p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <Wallet className="w-8 h-8 opacity-80" />
              <span className="text-xs uppercase tracking-wide opacity-80">{t('finance.total')}</span>
            </div>
            <div className="text-3xl font-bold">{formatCurrency(data?.summary?.total_earnings)}</div>
            <p className="text-black/70 text-sm">{t('finance.totalEarnings')}</p>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-8 h-8 opacity-80" />
              <span className="text-xs uppercase tracking-wide opacity-80">{t('finance.teamVolume')}</span>
            </div>
            <div className="text-3xl font-bold">{formatCurrency(data?.summary?.team_approved_volume)}</div>
            <p className="text-purple-100 text-sm">{data?.summary?.approved_deposits_count} {t('finance.approvedDeposits')}</p>
          </div>
        </div>

        {/* Next Tier Progress */}
        {data?.next_tier && (
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-[#D4AF37]" />
              {t('finance.nextTierProgress')}
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-gray-600">{t('finance.currentTier')}: <strong>{data.next_tier.current_tier}</strong></span>
                  <span className="text-sm text-gray-600">{t('finance.nextTier')}: <strong>{data.next_tier.next_tier}</strong></span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div 
                    className="bg-[#D4AF37] h-4 rounded-full transition-all" 
                    style={{ width: `${Math.min(100, (data.summary.team_approved_volume / data.next_tier.next_tier_threshold) * 100)}%` }}
                  />
                </div>
                <p className="text-sm text-gray-500 mt-2">
                  {t('finance.teamNeeds')} <strong>{formatCurrency(data.next_tier.amount_needed)}</strong> {t('finance.toReachNextTier')}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Commission Tiers */}
        <div className="bg-white border-2 border-gray-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowTiers(!showTiers)}
            className="w-full p-4 flex items-center justify-between hover:bg-gray-50"
          >
            <span className="font-semibold flex items-center gap-2">
              <PieChartIcon className="w-5 h-5 text-[#D4AF37]" />
              {t('finance.supervisorCommissionTiers')}
            </span>
            <ChevronDown className={`w-5 h-5 transition-transform ${showTiers ? 'rotate-180' : ''}`} />
          </button>
          {showTiers && (
            <div className="p-4 border-t grid grid-cols-2 md:grid-cols-4 gap-2">
              {data?.commission_tiers?.map((tier, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded text-center">
                  <div className="text-sm text-gray-600">{tier.range}</div>
                  <div className="text-lg font-bold text-[#D4AF37]">{tier.rate}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Agents Performance */}
        {data?.agents_performance?.length > 0 && (
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-[#D4AF37]" />
              {t('finance.agentsPerformance')}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-3 text-left">{t('finance.agent')}</th>
                    <th className="p-3 text-right">{t('finance.approvedVolume')}</th>
                    <th className="p-3 text-right">{t('finance.pendingVolume')}</th>
                    <th className="p-3 text-right">{t('finance.totalVolume')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents_performance.map((agent, idx) => (
                    <tr key={agent.agent_id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-3 font-medium">{agent.agent_name}</td>
                      <td className="p-3 text-right text-green-600">{formatCurrency(agent.approved_volume)}</td>
                      <td className="p-3 text-right text-yellow-600">{formatCurrency(agent.pending_volume)}</td>
                      <td className="p-3 text-right font-semibold">{formatCurrency(agent.total_volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Team Deposits */}
        <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#D4AF37]" />
            {t('finance.teamDeposits')}
          </h3>
          {data?.team_deposits?.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-3 text-left">{t('common.date')}</th>
                    <th className="p-3 text-left">{t('finance.agent')}</th>
                    <th className="p-3 text-left">{t('finance.client')}</th>
                    <th className="p-3 text-right">{t('common.amount')}</th>
                    <th className="p-3 text-center">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.team_deposits.slice(0, 10).map((dep, idx) => (
                    <tr key={dep.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="p-3 text-sm">
                        {dep.date ? new Date(dep.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : '-'}
                      </td>
                      <td className="p-3">{dep.agent_name}</td>
                      <td className="p-3">{dep.client_name}</td>
                      <td className="p-3 text-right font-semibold">{formatCurrency(dep.amount)}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-1 rounded text-xs ${
                          dep.status === 'approved' ? 'bg-green-100 text-green-800' :
                          dep.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {dep.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">{t('finance.noTeamDeposits')}</p>
          )}
        </div>
      </div>
    );
  }

  // ==================== ADMIN DASHBOARD ====================
  if (role === 'admin') {
    const expensesPieData = data?.expenses?.by_type?.map((e, idx) => ({
      name: e.type,
      value: e.amount,
      color: COLORS[idx % COLORS.length]
    })) || [];

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a1a2e] to-[#2d2d44] text-white p-6 border-2 border-[#D4AF37]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DollarSign className="w-8 h-8 text-[#D4AF37]" />
              <div>
                <h1 className="text-2xl font-bold">{t('finance.financialOverview')}</h1>
                <p className="text-gray-300 text-sm">{data?.period?.month_name}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select value={selectedMonth.toString()} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                <SelectTrigger className="w-36 bg-white/10 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value.toString()}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger className="w-24 bg-white/10 border-white/20 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026].map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={fetchFinancialData} className="bg-[#D4AF37] text-black hover:bg-[#C5A028]">
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </div>

        {/* Profit/Loss Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <ArrowUpRight className="w-8 h-8 opacity-80" />
              <span className="text-xs uppercase tracking-wide opacity-80">{t('finance.revenue')}</span>
            </div>
            <div className="text-3xl font-bold">{formatCurrency(data?.profit_loss?.total_revenue)}</div>
            <p className="text-green-100 text-sm">{data?.deposits?.approved_count} {t('finance.approvedDeposits')}</p>
          </div>

          <div className="bg-gradient-to-br from-red-500 to-red-600 text-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <Receipt className="w-8 h-8 opacity-80" />
              <span className="text-xs uppercase tracking-wide opacity-80">{t('finance.totalCosts')}</span>
            </div>
            <div className="text-3xl font-bold">{formatCurrency(data?.profit_loss?.total_costs)}</div>
            <p className="text-red-100 text-sm">{t('finance.salariesCommissionsExpenses')}</p>
          </div>

          <div className={`bg-gradient-to-br ${data?.profit_loss?.net_profit >= 0 ? 'from-[#D4AF37] to-[#C5A028]' : 'from-red-600 to-red-700'} text-black p-6 rounded-lg shadow-lg`}>
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="w-8 h-8 opacity-80" />
              <span className="text-xs uppercase tracking-wide opacity-80">{t('finance.netProfit')}</span>
            </div>
            <div className="text-3xl font-bold">{formatCurrency(data?.profit_loss?.net_profit)}</div>
            <p className="text-black/70 text-sm">{data?.profit_loss?.profit_margin}% {t('finance.margin')}</p>
          </div>

          <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-6 rounded-lg shadow-lg">
            <div className="flex items-center justify-between mb-2">
              <Users className="w-8 h-8 opacity-80" />
              <span className="text-xs uppercase tracking-wide opacity-80">{t('finance.staff')}</span>
            </div>
            <div className="text-3xl font-bold">{data?.staff?.total_staff}</div>
            <p className="text-purple-100 text-sm">{data?.staff?.agents_count} {t('finance.agents')} + {data?.staff?.supervisors_count} {t('finance.supervisors')}</p>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Salaries */}
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-500" />
              {t('finance.salaries')}
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">{t('finance.agentSalaries')} ({data?.staff?.agents_count} × €600)</span>
                <span className="font-semibold">{formatCurrency(data?.salaries?.agent_salaries)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{t('finance.supervisorSalaries')} ({data?.staff?.supervisors_count} × €1,200)</span>
                <span className="font-semibold">{formatCurrency(data?.salaries?.supervisor_salaries)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">{t('finance.totalSalaries')}</span>
                <span className="font-bold text-blue-600">{formatCurrency(data?.salaries?.total_salaries)}</span>
              </div>
            </div>
          </div>

          {/* Commissions */}
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              {t('finance.commissions')}
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">{t('finance.agentCommissions')}</span>
                <span className="font-semibold">{formatCurrency(data?.commissions?.agent_commissions)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">{t('finance.supervisorCommissions')}</span>
                <span className="font-semibold">{formatCurrency(data?.commissions?.supervisor_commissions)}</span>
              </div>
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold">{t('finance.totalCommissions')}</span>
                <span className="font-bold text-green-600">{formatCurrency(data?.commissions?.total_commissions)}</span>
              </div>
            </div>
          </div>

          {/* Expenses */}
          <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
            <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
              <Receipt className="w-5 h-5 text-red-500" />
              {t('finance.expenses')}
            </h3>
            {expensesPieData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width={100} height={100}>
                  <PieChart>
                    <Pie
                      data={expensesPieData}
                      cx="50%"
                      cy="50%"
                      outerRadius={40}
                      dataKey="value"
                    >
                      {expensesPieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-1">
                  {expensesPieData.map((e, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: e.color }}></span>
                        {e.name}
                      </span>
                      <span>{formatCurrency(e.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">{t('finance.noExpenses')}</p>
            )}
            <div className="flex justify-between border-t pt-2 mt-3">
              <span className="font-semibold">{t('finance.totalExpenses')}</span>
              <span className="font-bold text-red-600">{formatCurrency(data?.expenses?.total_expenses)}</span>
            </div>
          </div>
        </div>

        {/* Deposits Summary */}
        <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-[#D4AF37]" />
            {t('finance.depositsSummary')}
          </h3>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-3xl font-bold text-green-600">{data?.deposits?.approved_count}</div>
              <div className="text-sm text-gray-600">{t('finance.approved')}</div>
              <div className="text-lg font-semibold text-green-700">{formatCurrency(data?.deposits?.total_approved)}</div>
            </div>
            <div className="text-center p-4 bg-yellow-50 rounded-lg">
              <div className="text-3xl font-bold text-yellow-600">{data?.deposits?.pending_count}</div>
              <div className="text-sm text-gray-600">{t('finance.pending')}</div>
              <div className="text-lg font-semibold text-yellow-700">{formatCurrency(data?.deposits?.total_pending)}</div>
            </div>
            <div className="text-center p-4 bg-red-50 rounded-lg">
              <div className="text-3xl font-bold text-red-600">{data?.deposits?.rejected_count}</div>
              <div className="text-sm text-gray-600">{t('finance.rejected')}</div>
              <div className="text-lg font-semibold text-red-700">{formatCurrency(data?.deposits?.total_rejected)}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

export default FinancialDashboard;
