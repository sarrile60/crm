import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Settings, DollarSign, Users, UserCheck, Plus, Trash2, 
  Save, RefreshCw, AlertTriangle, Check, X, Edit2
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import axios from 'axios';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CommissionSettings = ({ currentUser }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(null);
  
  // Edit states
  const [agentTiers, setAgentTiers] = useState([]);
  const [supervisorTiers, setSupervisorTiers] = useState([]);
  const [agentBaseSalary, setAgentBaseSalary] = useState(600);
  const [supervisorBaseSalary, setSupervisorBaseSalary] = useState(1200);
  
  // New tier form
  const [showAddAgentTier, setShowAddAgentTier] = useState(false);
  const [showAddSupervisorTier, setShowAddSupervisorTier] = useState(false);
  const [newTier, setNewTier] = useState({ min_amount: '', max_amount: '', rate: '' });

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('crmToken');
      const res = await axios.get(`${API}/crm/finance/settings/commission`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettings(res.data);
      setAgentTiers(res.data.agent_tiers || []);
      setSupervisorTiers(res.data.supervisor_tiers || []);
      setAgentBaseSalary(res.data.agent_base_salary || 600);
      setSupervisorBaseSalary(res.data.supervisor_base_salary || 1200);
    } catch (error) {
      console.error('Error fetching commission settings:', error);
      toast.error('Error loading commission settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      const token = localStorage.getItem('crmToken');
      await axios.put(`${API}/crm/finance/settings/commission`, {
        agent_tiers: agentTiers,
        supervisor_tiers: supervisorTiers,
        agent_base_salary: parseFloat(agentBaseSalary),
        supervisor_base_salary: parseFloat(supervisorBaseSalary)
      }, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      toast.success(t('commission.settingsSaved'));
      fetchSettings();
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error(t('commission.errorSaving'));
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = async () => {
    if (!window.confirm(t('commission.confirmReset'))) return;
    
    setSaving(true);
    try {
      const token = localStorage.getItem('crmToken');
      await axios.post(`${API}/crm/finance/settings/commission/reset`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      toast.success(t('commission.settingsReset'));
      fetchSettings();
    } catch (error) {
      console.error('Error resetting settings:', error);
      toast.error(t('commission.errorResetting'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddTier = (type) => {
    if (!newTier.min_amount || !newTier.rate) {
      toast.error(t('commission.fillRequired'));
      return;
    }

    const tier = {
      min_amount: parseFloat(newTier.min_amount),
      max_amount: newTier.max_amount ? parseFloat(newTier.max_amount) : null,
      rate: parseFloat(newTier.rate)
    };

    if (type === 'agent') {
      const updated = [...agentTiers, tier].sort((a, b) => a.min_amount - b.min_amount);
      setAgentTiers(updated);
      setShowAddAgentTier(false);
    } else {
      const updated = [...supervisorTiers, tier].sort((a, b) => a.min_amount - b.min_amount);
      setSupervisorTiers(updated);
      setShowAddSupervisorTier(false);
    }
    
    setNewTier({ min_amount: '', max_amount: '', rate: '' });
  };

  const handleDeleteTier = (type, index) => {
    if (type === 'agent') {
      const updated = agentTiers.filter((_, i) => i !== index);
      setAgentTiers(updated);
    } else {
      const updated = supervisorTiers.filter((_, i) => i !== index);
      setSupervisorTiers(updated);
    }
  };

  const handleUpdateTier = (type, index, field, value) => {
    if (type === 'agent') {
      const updated = [...agentTiers];
      updated[index] = { ...updated[index], [field]: value === '' ? null : parseFloat(value) };
      setAgentTiers(updated);
    } else {
      const updated = [...supervisorTiers];
      updated[index] = { ...updated[index], [field]: value === '' ? null : parseFloat(value) };
      setSupervisorTiers(updated);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('it-IT', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#D4AF37]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#1a1a2e] to-[#2d2d44] text-white p-6 rounded-lg border-2 border-[#D4AF37]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-8 h-8 text-[#D4AF37]" />
            <div>
              <h1 className="text-2xl font-bold">{t('commission.title')}</h1>
              <p className="text-gray-300 text-sm">{t('commission.subtitle')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={handleResetDefaults} 
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10"
              disabled={saving}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {t('commission.resetDefaults')}
            </Button>
            <Button 
              onClick={handleSaveSettings}
              className="bg-[#D4AF37] text-black hover:bg-[#C5A028]"
              disabled={saving}
            >
              {saving ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              {t('common.save')}
            </Button>
          </div>
        </div>
      </div>

      {/* Base Salaries Section */}
      <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-[#D4AF37]" />
          {t('commission.baseSalaries')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              {t('commission.agentBaseSalary')}
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">€</span>
              <Input
                type="number"
                value={agentBaseSalary}
                onChange={(e) => setAgentBaseSalary(e.target.value)}
                className="w-40"
                min="0"
                step="50"
              />
              <span className="text-sm text-gray-500">/ {t('commission.perMonth')}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              {t('commission.supervisorBaseSalary')}
            </Label>
            <div className="flex items-center gap-2">
              <span className="text-gray-500">€</span>
              <Input
                type="number"
                value={supervisorBaseSalary}
                onChange={(e) => setSupervisorBaseSalary(e.target.value)}
                className="w-40"
                min="0"
                step="50"
              />
              <span className="text-sm text-gray-500">/ {t('commission.perMonth')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Commission Tiers */}
      <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Users className="w-5 h-5 text-[#D4AF37]" />
            {t('commission.agentTiers')}
          </h2>
          <Button 
            onClick={() => setShowAddAgentTier(true)}
            variant="outline"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('commission.addTier')}
          </Button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3 text-left">{t('commission.minAmount')} (€)</th>
                <th className="p-3 text-left">{t('commission.maxAmount')} (€)</th>
                <th className="p-3 text-left">{t('commission.rate')} (%)</th>
                <th className="p-3 text-center">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {agentTiers.map((tier, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="p-3">
                    <Input
                      type="number"
                      value={tier.min_amount}
                      onChange={(e) => handleUpdateTier('agent', idx, 'min_amount', e.target.value)}
                      className="w-32"
                      min="0"
                    />
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      value={tier.max_amount || ''}
                      onChange={(e) => handleUpdateTier('agent', idx, 'max_amount', e.target.value)}
                      className="w-32"
                      placeholder="∞"
                      min="0"
                    />
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      value={tier.rate}
                      onChange={(e) => handleUpdateTier('agent', idx, 'rate', e.target.value)}
                      className="w-24"
                      min="0"
                      max="100"
                      step="0.5"
                    />
                  </td>
                  <td className="p-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTier('agent', idx)}
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

        {/* Add New Agent Tier Form */}
        {showAddAgentTier && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold mb-3">{t('commission.addNewAgentTier')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Label>{t('commission.minAmount')} (€)</Label>
                <Input
                  type="number"
                  value={newTier.min_amount}
                  onChange={(e) => setNewTier({...newTier, min_amount: e.target.value})}
                  placeholder="0"
                  min="0"
                />
              </div>
              <div>
                <Label>{t('commission.maxAmount')} (€)</Label>
                <Input
                  type="number"
                  value={newTier.max_amount}
                  onChange={(e) => setNewTier({...newTier, max_amount: e.target.value})}
                  placeholder="∞ (leave empty)"
                  min="0"
                />
              </div>
              <div>
                <Label>{t('commission.rate')} (%)</Label>
                <Input
                  type="number"
                  value={newTier.rate}
                  onChange={(e) => setNewTier({...newTier, rate: e.target.value})}
                  placeholder="10"
                  min="0"
                  max="100"
                  step="0.5"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleAddTier('agent')} className="bg-green-600 hover:bg-green-700 text-white">
                  <Check className="w-4 h-4" />
                </Button>
                <Button onClick={() => { setShowAddAgentTier(false); setNewTier({ min_amount: '', max_amount: '', rate: '' }); }} variant="outline">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Supervisor Commission Tiers */}
      <div className="bg-white border-2 border-gray-200 p-6 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[#D4AF37]" />
            {t('commission.supervisorTiers')}
          </h2>
          <Button 
            onClick={() => setShowAddSupervisorTier(true)}
            variant="outline"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-2" />
            {t('commission.addTier')}
          </Button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3 text-left">{t('commission.minAmount')} (€)</th>
                <th className="p-3 text-left">{t('commission.maxAmount')} (€)</th>
                <th className="p-3 text-left">{t('commission.rate')} (%)</th>
                <th className="p-3 text-center">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {supervisorTiers.map((tier, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                  <td className="p-3">
                    <Input
                      type="number"
                      value={tier.min_amount}
                      onChange={(e) => handleUpdateTier('supervisor', idx, 'min_amount', e.target.value)}
                      className="w-32"
                      min="0"
                    />
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      value={tier.max_amount || ''}
                      onChange={(e) => handleUpdateTier('supervisor', idx, 'max_amount', e.target.value)}
                      className="w-32"
                      placeholder="∞"
                      min="0"
                    />
                  </td>
                  <td className="p-3">
                    <Input
                      type="number"
                      value={tier.rate}
                      onChange={(e) => handleUpdateTier('supervisor', idx, 'rate', e.target.value)}
                      className="w-24"
                      min="0"
                      max="100"
                      step="0.5"
                    />
                  </td>
                  <td className="p-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteTier('supervisor', idx)}
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

        {/* Add New Supervisor Tier Form */}
        {showAddSupervisorTier && (
          <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold mb-3">{t('commission.addNewSupervisorTier')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <Label>{t('commission.minAmount')} (€)</Label>
                <Input
                  type="number"
                  value={newTier.min_amount}
                  onChange={(e) => setNewTier({...newTier, min_amount: e.target.value})}
                  placeholder="0"
                  min="0"
                />
              </div>
              <div>
                <Label>{t('commission.maxAmount')} (€)</Label>
                <Input
                  type="number"
                  value={newTier.max_amount}
                  onChange={(e) => setNewTier({...newTier, max_amount: e.target.value})}
                  placeholder="∞ (leave empty)"
                  min="0"
                />
              </div>
              <div>
                <Label>{t('commission.rate')} (%)</Label>
                <Input
                  type="number"
                  value={newTier.rate}
                  onChange={(e) => setNewTier({...newTier, rate: e.target.value})}
                  placeholder="1"
                  min="0"
                  max="100"
                  step="0.5"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleAddTier('supervisor')} className="bg-green-600 hover:bg-green-700 text-white">
                  <Check className="w-4 h-4" />
                </Button>
                <Button onClick={() => { setShowAddSupervisorTier(false); setNewTier({ min_amount: '', max_amount: '', rate: '' }); }} variant="outline">
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
          <div>
            <h4 className="font-semibold text-yellow-800">{t('commission.importantNote')}</h4>
            <p className="text-sm text-yellow-700 mt-1">{t('commission.noteText')}</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CommissionSettings;
