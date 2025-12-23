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
  
  // Deposit History Filters (Agent/Supervisor)
  const [depositStatusFilter, setDepositStatusFilter] = useState('all');
  const [depositSearchQuery, setDepositSearchQuery] = useState('');
  
  // Admin Filters
  const [teams, setTeams] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState('all');
  const [selectedAgent, setSelectedAgent] = useState('all');
  
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

  // Fetch teams and agents for admin filters
  useEffect(() => {
    const fetchFiltersData = async () => {
      if (role !== 'admin') return;
      
      try {
        const token = localStorage.getItem('crmToken');
        const headers = { Authorization: `Bearer ${token}` };
        
        // Fetch teams
        const teamsRes = await axios.get(`${API}/crm/teams`, { headers });
        setTeams(teamsRes.data || []);
        
        // Fetch all agents
        const usersRes = await axios.get(`${API}/crm/users`, { headers });
        const allAgents = (usersRes.data || []).filter(u => u.role === 'agent' && !u.deleted_at);
        setAgents(allAgents);
      } catch (error) {
        console.error('Error fetching filter data:', error);
      }
    };
    
    fetchFiltersData();
  }, [role]);

  const fetchFinancialData = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      let endpoint = '';
      let queryParams = `month=${selectedMonth}&year=${selectedYear}`;
      
      if (role === 'agent') {
        endpoint = `/crm/finance/agent/dashboard`;
      } else if (role === 'supervisor') {
        endpoint = `/crm/finance/supervisor/dashboard`;
      } else if (role === 'admin') {
        endpoint = `/crm/finance/admin/overview`;
        // Add admin filters
        if (selectedTeam && selectedTeam !== 'all') {
          queryParams += `&team_id=${selectedTeam}`;
        }
        if (selectedAgent && selectedAgent !== 'all') {
          queryParams += `&agent_id=${selectedAgent}`;
        }
      }
      
      const res = await axios.get(`${API}${endpoint}?${queryParams}`, { headers });
      setData(res.data);
    } catch (error) {
      console.error('Error fetching financial data:', error);
      toast.error(t('common.error'));
    } finally {
      setLoading(false);
    }
  }, [role, selectedMonth, selectedYear, selectedTeam, selectedAgent, t]);

  useEffect(() => {
    fetchFinancialData();
  }, [selectedMonth, selectedYear, selectedTeam, selectedAgent, fetchFinancialData]);

  // Fetch expenses list (Admin only)
  const fetchExpenses = useCallback(async () => {
    if (role !== 'admin') return;
    setExpensesLoading(true);
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/crm/finance/expenses?month=${selectedMonth}&year=${selectedYear}`, { headers });
      setExpensesList(res.data.expenses || []);
    } catch (error) {
      console.error('Error fetching expenses:', error);
    } finally {
      setExpensesLoading(false);
    }
  }, [role, selectedMonth, selectedYear]);

  useEffect(() => {
    if (showExpensesList) {
      fetchExpenses();
    }
  }, [showExpensesList, selectedMonth, selectedYear, fetchExpenses]);

  // Create new expense (Admin only)
  const handleCreateExpense = async (e) => {
    e.preventDefault();
    if (!newExpense.expense_type || !newExpense.amount || !newExpense.date) {
      toast.error(t('common.fillAllFields'));
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const formData = new FormData();
      formData.append('expense_type', newExpense.expense_type);
      formData.append('amount', parseFloat(newExpense.amount));
      formData.append('date', newExpense.date);
      formData.append('description', newExpense.description);
      formData.append('paid_by', newExpense.paid_by);

      await axios.post(`${API}/crm/finance/expenses`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      toast.success(t('finance.expenseCreated'));
      setShowExpenseModal(false);
      setNewExpense({
        expense_type: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        paid_by: ''
      });
      fetchFinancialData();
      if (showExpensesList) fetchExpenses();
    } catch (error) {
      console.error('Error creating expense:', error);
      toast.error(t('finance.errorCreatingExpense'));
    }
  };

  // Delete expense (Admin only)
  const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm(t('finance.confirmDeleteExpense'))) return;

    try {
      const token = localStorage.getItem('crmToken');
      await axios.delete(`${API}/crm/finance/expenses/${expenseId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(t('finance.expenseDeleted'));
      fetchFinancialData();
      fetchExpenses();
    } catch (error) {
      console.error('Error deleting expense:', error);
      toast.error(t('finance.errorDeletingExpense'));
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  };

  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { 
      day: '2-digit', 
      month: 'short', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const years = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

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
                  {years.map(y => (
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
                  {years.map(y => (
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

    // Filter agents by selected team
    const filteredAgents = selectedTeam === 'all' 
      ? agents 
      : agents.filter(a => {
          const team = teams.find(t => t.id === selectedTeam);
          return team?.members?.includes(a.id);
        });

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a1a2e] to-[#2d2d44] text-white p-6 border-2 border-[#D4AF37]">
          <div className="flex flex-col gap-4">
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
            
            {/* Filters Row */}
            <div className="flex items-center gap-3 pt-2 border-t border-white/10">
              <span className="text-sm text-gray-300">{t('common.filters')}:</span>
              <Select value={selectedTeam} onValueChange={(v) => { setSelectedTeam(v); setSelectedAgent('all'); }}>
                <SelectTrigger className="w-44 bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder={t('common.allTeams')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.allTeams')}</SelectItem>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedAgent} onValueChange={(v) => setSelectedAgent(v)}>
                <SelectTrigger className="w-44 bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder={t('common.allAgents')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('common.allAgents')}</SelectItem>
                  {filteredAgents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>{agent.full_name || agent.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {(selectedTeam !== 'all' || selectedAgent !== 'all') && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => { setSelectedTeam('all'); setSelectedAgent('all'); }}
                  className="text-[#D4AF37] hover:text-[#C5A028] hover:bg-white/10"
                >
                  {t('common.clearFilters')}
                </Button>
              )}
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

        {/* Expense Management Section */}
        <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Receipt className="w-5 h-5 text-[#D4AF37]" />
              {t('finance.expenseManagement')}
            </h3>
            <div className="flex gap-2">
              <Button 
                onClick={() => setShowExpenseModal(true)}
                className="bg-[#D4AF37] text-black hover:bg-[#C5A028]"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('finance.addExpense')}
              </Button>
              <Button 
                onClick={() => setShowExpensesList(!showExpensesList)}
                variant="outline"
              >
                <FileText className="w-4 h-4 mr-2" />
                {showExpensesList ? t('finance.hideExpenses') : t('finance.viewAllExpenses')}
              </Button>
            </div>
          </div>

          {/* Expense List */}
          {showExpensesList && (
            <div className="border-t pt-4">
              {expensesLoading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#D4AF37]"></div>
                </div>
              ) : expensesList.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="p-3 text-left">{t('common.date')}</th>
                        <th className="p-3 text-left">{t('common.type')}</th>
                        <th className="p-3 text-left">{t('common.description')}</th>
                        <th className="p-3 text-left">{t('finance.paidBy')}</th>
                        <th className="p-3 text-right">{t('common.amount')}</th>
                        <th className="p-3 text-center">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expensesList.map((expense, idx) => (
                        <tr key={expense.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                          <td className="p-3 text-sm">
                            {expense.date ? new Date(expense.date).toLocaleDateString('en-GB') : '-'}
                          </td>
                          <td className="p-3">
                            <span className={`px-2 py-1 rounded text-xs ${
                              expense.type === 'Rent' ? 'bg-blue-100 text-blue-800' :
                              expense.type === 'Salaries' ? 'bg-purple-100 text-purple-800' :
                              expense.type === 'Marketing' ? 'bg-green-100 text-green-800' :
                              expense.type === 'Equipment' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {expense.type}
                            </span>
                          </td>
                          <td className="p-3 text-sm text-gray-600">{expense.description || '-'}</td>
                          <td className="p-3 text-sm">{expense.paid_by || '-'}</td>
                          <td className="p-3 text-right font-semibold text-red-600">
                            {formatCurrency(expense.amount)}
                          </td>
                          <td className="p-3 text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteExpense(expense.id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">{t('finance.noExpensesRecorded')}</p>
              )}
            </div>
          )}
        </div>

        {/* Add Expense Modal */}
        {showExpenseModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold">{t('finance.addExpense')}</h3>
                <button onClick={() => setShowExpenseModal(false)} className="text-gray-500 hover:text-gray-700">
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <form onSubmit={handleCreateExpense} className="space-y-4">
                <div>
                  <Label>{t('common.type')} *</Label>
                  <Select 
                    value={newExpense.expense_type} 
                    onValueChange={(v) => setNewExpense({...newExpense, expense_type: v})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t('finance.selectType')} />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPENSE_TYPES.map(type => (
                        <SelectItem key={type} value={type}>{type}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>{t('common.amount')} (€) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <Label>{t('common.date')} *</Label>
                  <Input
                    type="date"
                    value={newExpense.date}
                    onChange={(e) => setNewExpense({...newExpense, date: e.target.value})}
                    required
                  />
                </div>

                <div>
                  <Label>{t('common.description')}</Label>
                  <Input
                    type="text"
                    value={newExpense.description}
                    onChange={(e) => setNewExpense({...newExpense, description: e.target.value})}
                    placeholder={t('finance.expenseDescriptionPlaceholder')}
                  />
                </div>

                <div>
                  <Label>{t('finance.paidBy')}</Label>
                  <Input
                    type="text"
                    value={newExpense.paid_by}
                    onChange={(e) => setNewExpense({...newExpense, paid_by: e.target.value})}
                    placeholder={t('finance.paidByPlaceholder')}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowExpenseModal(false)}
                    className="flex-1"
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1 bg-[#D4AF37] text-black hover:bg-[#C5A028]"
                  >
                    {t('finance.addExpense')}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
};

export default FinancialDashboard;
