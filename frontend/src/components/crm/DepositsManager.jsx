import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  DollarSign, Plus, Eye, Upload, Check, X, Clock, 
  CreditCard, Bitcoin, FileText, User, Users, Building, Download, Image
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DepositsManager = ({ currentUser, pendingDepositData, onDepositCreated }) => {
  const { t } = useTranslation();
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedDeposit, setSelectedDeposit] = useState(null);
  const [leads, setLeads] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [uploading, setUploading] = useState({});
  const [prefilledNotificationId, setPrefilledNotificationId] = useState(null);
  
  // Create deposit form state
  const [newDeposit, setNewDeposit] = useState({
    lead_id: '',
    agent_id: '',
    payment_type: 'IBAN',
    amount: '',
    currency: 'EUR',
    iban: '',
    bank_name: '',
    crypto_type: '',
    wallet_address: '',
    notes: ''
  });

  // Attachment files for IBAN deposits
  const [attachmentFiles, setAttachmentFiles] = useState({
    id_front: null,
    id_back: null,
    proof_of_residence: null,
    selfie_with_id: null
  });

  const role = currentUser?.role?.toLowerCase();
  const isSupervisor = role === 'supervisor';
  const isAdmin = role === 'admin';
  const isAgent = role === 'agent';

  // Handle pending deposit data from notification click
  useEffect(() => {
    if (pendingDepositData) {
      const { lead_id, lead_name, agent_id, agent_name, notification_id } = pendingDepositData;
      // Pre-fill the deposit form
      setNewDeposit(prev => ({
        ...prev,
        lead_id: lead_id || '',
        agent_id: agent_id || ''
      }));
      setPrefilledNotificationId(notification_id);
      setShowCreateModal(true);
    }
  }, [pendingDepositData]);

  // Listen for openDepositCreate event (for when already on deposits page)
  useEffect(() => {
    const handleOpenDepositCreate = (event) => {
      const { lead_id, lead_name, agent_id, agent_name, notification_id } = event.detail;
      // Pre-fill the deposit form
      setNewDeposit(prev => ({
        ...prev,
        lead_id: lead_id || '',
        agent_id: agent_id || ''
      }));
      setPrefilledNotificationId(notification_id);
      setShowCreateModal(true);
    };

    window.addEventListener('openDepositCreate', handleOpenDepositCreate);
    return () => {
      window.removeEventListener('openDepositCreate', handleOpenDepositCreate);
    };
  }, []);

  // Fetch deposits
  const fetchDeposits = useCallback(async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      let url = `${API}/crm/deposits`;
      if (filter !== 'all') {
        url += `?status=${filter}`;
      }
      
      const res = await axios.get(url, { headers });
      setDeposits(res.data || []);
    } catch (error) {
      console.error('Error fetching deposits:', error);
      toast.error(t('deposits.errorFetching'));
    } finally {
      setLoading(false);
    }
  }, [filter, t]);

  // Fetch leads for dropdown
  const fetchLeads = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/crm/leads`, { headers });
      // Handle both old array format and new paginated format
      const leadsData = Array.isArray(res.data) ? res.data : (res.data.data || []);
      setLeads(leadsData);
    } catch (error) {
      console.error('Error fetching leads:', error);
    }
  };

  // Fetch team members for dropdown
  const fetchTeamMembers = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      const res = await axios.get(`${API}/crm/team-members-status`, { headers });
      setTeamMembers(res.data.members || []);
    } catch (error) {
      console.error('Error fetching team members:', error);
    }
  };

  useEffect(() => {
    fetchDeposits();
    if (isSupervisor || isAdmin) {
      fetchLeads();
      fetchTeamMembers();
    }
  }, [fetchDeposits, isSupervisor, isAdmin]);

  // Create deposit
  const handleCreateDeposit = async () => {
    if (!newDeposit.lead_id || !newDeposit.agent_id || !newDeposit.amount) {
      toast.error(t('deposits.fillRequired'));
      return;
    }

    if (newDeposit.payment_type === 'IBAN' && !newDeposit.iban) {
      toast.error(t('deposits.ibanRequired'));
      return;
    }

    if (newDeposit.payment_type === 'Crypto' && (!newDeposit.crypto_type || !newDeposit.wallet_address)) {
      toast.error(t('deposits.cryptoRequired'));
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      // Create the deposit first
      const depositRes = await axios.post(`${API}/crm/deposits`, {
        ...newDeposit,
        amount: parseFloat(newDeposit.amount)
      }, { headers });
      
      const depositId = depositRes.data.id;
      
      // Upload attachments for IBAN deposits
      if (newDeposit.payment_type === 'IBAN' && depositId) {
        const attachmentTypes = ['id_front', 'id_back', 'proof_of_residence', 'selfie_with_id'];
        
        for (const type of attachmentTypes) {
          if (attachmentFiles[type]) {
            try {
              const formData = new FormData();
              formData.append('file', attachmentFiles[type]);
              
              await axios.post(
                `${API}/crm/deposits/${depositId}/attachments/${type}`,
                formData,
                {
                  headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'multipart/form-data'
                  }
                }
              );
            } catch (uploadError) {
              console.error(`Error uploading ${type}:`, uploadError);
            }
          }
        }
      }
      
      // Mark the notification as processed if this was from a notification click
      if (prefilledNotificationId) {
        try {
          await axios.put(
            `${API}/crm/supervisor/deposit-notifications/${prefilledNotificationId}/processed`,
            {},
            { headers }
          );
        } catch (notifError) {
          console.error('Error marking notification as processed:', notifError);
        }
        setPrefilledNotificationId(null);
      }
      
      toast.success(t('deposits.created'));
      setShowCreateModal(false);
      
      // Notify parent that deposit was created (to clear pending data)
      if (onDepositCreated) {
        onDepositCreated();
      }
      
      setNewDeposit({
        lead_id: '',
        agent_id: '',
        payment_type: 'IBAN',
        amount: '',
        currency: 'EUR',
        iban: '',
        bank_name: '',
        crypto_type: '',
        wallet_address: '',
        notes: ''
      });
      // Reset attachment files
      setAttachmentFiles({
        id_front: null,
        id_back: null,
        proof_of_residence: null,
        selfie_with_id: null
      });
      fetchDeposits();
    } catch (error) {
      console.error('Error creating deposit:', error);
      toast.error(error.response?.data?.detail || t('deposits.errorCreating'));
    }
  };

  // View deposit details
  const viewDeposit = (deposit) => {
    setSelectedDeposit(deposit);
    setShowDetailModal(true);
  };

  // Handle file upload for IBAN deposits
  const handleFileUpload = async (depositId, attachmentType, file) => {
    if (!file) return;
    
    setUploading(prev => ({ ...prev, [attachmentType]: true }));
    
    try {
      const token = localStorage.getItem('crmToken');
      const formData = new FormData();
      formData.append('file', file);
      
      await axios.post(
        `${API}/crm/deposits/${depositId}/attachments/${attachmentType}`,
        formData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );
      
      toast.success(t('deposits.attachmentUploaded'));
      // Refresh deposit details
      const res = await axios.get(`${API}/crm/deposits/${depositId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSelectedDeposit(res.data);
      fetchDeposits();
    } catch (error) {
      console.error('Error uploading attachment:', error);
      toast.error(error.response?.data?.detail || t('deposits.uploadError'));
    } finally {
      setUploading(prev => ({ ...prev, [attachmentType]: false }));
    }
  };

  // Download/view attachment
  const handleDownloadAttachment = async (depositId, attachmentType) => {
    try {
      const token = localStorage.getItem('crmToken');
      const url = `${API}/crm/deposits/${depositId}/attachments/${attachmentType}/download`;
      
      // Open in new tab for viewing
      window.open(`${url}?token=${token}`, '_blank');
    } catch (error) {
      console.error('Error downloading attachment:', error);
      toast.error(t('deposits.downloadError'));
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-semibold flex items-center gap-1"><Clock className="w-3 h-3" /> {t('deposits.pending')}</span>;
      case 'approved':
        return <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-semibold flex items-center gap-1"><Check className="w-3 h-3" /> {t('deposits.approved')}</span>;
      case 'rejected':
        return <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-semibold flex items-center gap-1"><X className="w-3 h-3" /> {t('deposits.rejected')}</span>;
      default:
        return null;
    }
  };

  const getPaymentIcon = (type) => {
    return type === 'IBAN' ? <CreditCard className="w-4 h-4" /> : <Bitcoin className="w-4 h-4" />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#1a1a2e] text-white p-6 border-2 border-[#D4AF37]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <DollarSign className="w-8 h-8 text-[#D4AF37]" />
            <div>
              <h1 className="text-2xl font-bold">{t('deposits.title')}</h1>
              <p className="text-gray-400">{t('deposits.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-3xl font-bold text-[#D4AF37]">{deposits.length}</div>
              <div className="text-sm text-gray-400">{t('deposits.total')}</div>
            </div>
            {(isSupervisor || isAdmin) && (
              <Button
                onClick={() => setShowCreateModal(true)}
                className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('deposits.create')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {['all', 'pending', 'approved', 'rejected'].map(status => (
          <Button
            key={status}
            variant={filter === status ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(status)}
            className={filter === status ? 'bg-[#D4AF37] text-black' : 'rounded-none'}
          >
            {t(`deposits.filter.${status}`)}
          </Button>
        ))}
      </div>

      {/* Deposits Table */}
      {deposits.length === 0 ? (
        <div className="bg-white border-2 border-gray-200 p-8 text-center">
          <DollarSign className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-600 mb-2">{t('deposits.noDeposits')}</h2>
          <p className="text-gray-500">{t('deposits.noDepositsDesc')}</p>
        </div>
      ) : (
        <div className="bg-white border-2 border-gray-200">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3 text-left font-semibold">{t('deposits.client')}</th>
                <th className="p-3 text-left font-semibold">{t('deposits.agent')}</th>
                <th className="p-3 text-left font-semibold">{t('deposits.type')}</th>
                <th className="p-3 text-left font-semibold">{t('deposits.amount')}</th>
                <th className="p-3 text-left font-semibold">{t('deposits.status')}</th>
                <th className="p-3 text-left font-semibold">{t('deposits.date')}</th>
                <th className="p-3 text-left font-semibold">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map(deposit => (
                <tr key={deposit.id} className="border-t hover:bg-gray-50">
                  <td className="p-3">
                    <div className="font-medium">{deposit.lead_name}</div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      {deposit.agent_name}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {getPaymentIcon(deposit.payment_type)}
                      <span>{deposit.payment_type}</span>
                      {deposit.payment_type === 'Crypto' && (
                        <span className="text-xs text-gray-500">({deposit.crypto_type})</span>
                      )}
                    </div>
                  </td>
                  <td className="p-3 font-semibold">
                    {deposit.amount.toLocaleString()} {deposit.currency}
                  </td>
                  <td className="p-3">
                    {getStatusBadge(deposit.status)}
                  </td>
                  <td className="p-3 text-sm text-gray-600">
                    {new Date(deposit.created_at).toLocaleDateString()}
                  </td>
                  <td className="p-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => viewDeposit(deposit)}
                      className="rounded-none"
                    >
                      <Eye className="w-4 h-4 mr-1" />
                      {t('common.view')}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Deposit Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#D4AF37]" />
              {t('deposits.createNew')}
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Lead Selection */}
            <div>
              <label className="block text-sm font-medium mb-1">{t('deposits.selectLead')} *</label>
              <select
                value={newDeposit.lead_id}
                onChange={(e) => setNewDeposit({...newDeposit, lead_id: e.target.value})}
                className="w-full border rounded p-2"
              >
                <option value="">{t('deposits.chooseLead')}</option>
                {leads.map(lead => (
                  <option key={lead.id} value={lead.id}>{lead.fullName} - {lead.phone}</option>
                ))}
              </select>
            </div>

            {/* Agent Selection */}
            <div>
              <label className="block text-sm font-medium mb-1">{t('deposits.assignAgent')} *</label>
              <select
                value={newDeposit.agent_id}
                onChange={(e) => setNewDeposit({...newDeposit, agent_id: e.target.value})}
                className="w-full border rounded p-2"
              >
                <option value="">{t('deposits.chooseAgent')}</option>
                {teamMembers.map(member => (
                  <option key={member.id} value={member.id}>{member.full_name} (@{member.username})</option>
                ))}
              </select>
            </div>

            {/* Payment Type */}
            <div>
              <label className="block text-sm font-medium mb-1">{t('deposits.paymentType')} *</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="payment_type"
                    value="IBAN"
                    checked={newDeposit.payment_type === 'IBAN'}
                    onChange={(e) => setNewDeposit({...newDeposit, payment_type: e.target.value})}
                  />
                  <CreditCard className="w-4 h-4" />
                  IBAN ({t('deposits.bankTransfer')})
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="payment_type"
                    value="Crypto"
                    checked={newDeposit.payment_type === 'Crypto'}
                    onChange={(e) => setNewDeposit({...newDeposit, payment_type: e.target.value})}
                  />
                  <Bitcoin className="w-4 h-4" />
                  Crypto
                </label>
              </div>
            </div>

            {/* Amount */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">{t('deposits.amount')} *</label>
                <Input
                  type="number"
                  value={newDeposit.amount}
                  onChange={(e) => setNewDeposit({...newDeposit, amount: e.target.value})}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">{t('deposits.currency')}</label>
                <select
                  value={newDeposit.currency}
                  onChange={(e) => setNewDeposit({...newDeposit, currency: e.target.value})}
                  className="w-full border rounded p-2"
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
            </div>

            {/* IBAN Details */}
            {newDeposit.payment_type === 'IBAN' && (
              <div className="space-y-4 p-4 bg-blue-50 rounded border border-blue-200">
                <h4 className="font-semibold flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  {t('deposits.bankDetails')}
                </h4>
                <div>
                  <label className="block text-sm font-medium mb-1">IBAN *</label>
                  <Input
                    value={newDeposit.iban}
                    onChange={(e) => setNewDeposit({...newDeposit, iban: e.target.value})}
                    placeholder="IT60X0542811101000000123456"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('deposits.bankName')}</label>
                  <Input
                    value={newDeposit.bank_name}
                    onChange={(e) => setNewDeposit({...newDeposit, bank_name: e.target.value})}
                    placeholder="Bank name"
                  />
                </div>
                
                {/* Attachment Upload Section */}
                <div className="mt-4 pt-4 border-t border-blue-200">
                  <h5 className="font-semibold text-sm mb-3 flex items-center gap-2">
                    <Upload className="w-4 h-4" />
                    {t('deposits.requiredDocuments')}
                  </h5>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { key: 'id_front', label: t('deposits.attachment.id_front') },
                      { key: 'id_back', label: t('deposits.attachment.id_back') },
                      { key: 'proof_of_residence', label: t('deposits.attachment.proof_of_residence') },
                      { key: 'selfie_with_id', label: t('deposits.attachment.selfie_with_id') }
                    ].map(({ key, label }) => (
                      <div key={key} className="relative">
                        <label className="block text-xs font-medium mb-1">{label}</label>
                        <div className={`border-2 border-dashed rounded p-2 text-center cursor-pointer hover:bg-blue-100 transition-colors ${
                          attachmentFiles[key] ? 'border-green-400 bg-green-50' : 'border-gray-300'
                        }`}>
                          <input
                            type="file"
                            accept="image/*,.pdf"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setAttachmentFiles(prev => ({ ...prev, [key]: file }));
                              }
                            }}
                          />
                          {attachmentFiles[key] ? (
                            <div className="flex items-center justify-center gap-1 text-green-600">
                              <Image className="w-4 h-4" />
                              <span className="text-xs truncate max-w-[100px]">{attachmentFiles[key].name}</span>
                            </div>
                          ) : (
                            <div className="flex items-center justify-center gap-1 text-gray-500">
                              <Upload className="w-4 h-4" />
                              <span className="text-xs">{t('common.upload')}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-blue-600 mt-2">
                    ℹ️ {t('deposits.attachmentsOptionalNow')}
                  </p>
                </div>
              </div>
            )}

            {/* Crypto Details */}
            {newDeposit.payment_type === 'Crypto' && (
              <div className="space-y-4 p-4 bg-orange-50 rounded border border-orange-200">
                <h4 className="font-semibold flex items-center gap-2">
                  <Bitcoin className="w-4 h-4" />
                  {t('deposits.cryptoDetails')}
                </h4>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('deposits.cryptoType')} *</label>
                  <select
                    value={newDeposit.crypto_type}
                    onChange={(e) => setNewDeposit({...newDeposit, crypto_type: e.target.value})}
                    className="w-full border rounded p-2"
                  >
                    <option value="">{t('deposits.selectCrypto')}</option>
                    <option value="BTC">Bitcoin (BTC)</option>
                    <option value="ETH">Ethereum (ETH)</option>
                    <option value="USDT">Tether (USDT)</option>
                    <option value="USDC">USD Coin (USDC)</option>
                    <option value="BNB">Binance Coin (BNB)</option>
                    <option value="XRP">Ripple (XRP)</option>
                    <option value="Other">{t('deposits.other')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('deposits.walletAddress')} *</label>
                  <Input
                    value={newDeposit.wallet_address}
                    onChange={(e) => setNewDeposit({...newDeposit, wallet_address: e.target.value})}
                    placeholder="0x..."
                  />
                </div>
              </div>
            )}

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium mb-1">{t('deposits.notes')}</label>
              <textarea
                value={newDeposit.notes}
                onChange={(e) => setNewDeposit({...newDeposit, notes: e.target.value})}
                className="w-full border rounded p-2 h-20"
                placeholder={t('deposits.notesPlaceholder')}
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleCreateDeposit}
                className="bg-[#D4AF37] text-black hover:bg-[#C5A028]"
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('deposits.create')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Deposit Detail Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-2xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-[#D4AF37]" />
              {t('deposits.details')}
            </DialogTitle>
          </DialogHeader>
          
          {selectedDeposit && (
            <div className="space-y-4">
              {/* Status Banner */}
              <div className={`p-4 rounded ${
                selectedDeposit.status === 'approved' ? 'bg-green-50 border border-green-200' :
                selectedDeposit.status === 'rejected' ? 'bg-red-50 border border-red-200' :
                'bg-yellow-50 border border-yellow-200'
              }`}>
                <div className="flex items-center justify-between">
                  {getStatusBadge(selectedDeposit.status)}
                  <span className="text-sm text-gray-600">
                    {new Date(selectedDeposit.created_at).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Client & Agent Info */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-500 mb-1">{t('deposits.client')}</div>
                  <div className="font-semibold">{selectedDeposit.lead_name}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-500 mb-1">{t('deposits.agent')}</div>
                  <div className="font-semibold">{selectedDeposit.agent_name}</div>
                </div>
              </div>

              {/* Payment Details */}
              <div className={`p-4 rounded border ${
                selectedDeposit.payment_type === 'IBAN' ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'
              }`}>
                <div className="flex items-center gap-2 mb-3">
                  {getPaymentIcon(selectedDeposit.payment_type)}
                  <span className="font-semibold">{selectedDeposit.payment_type}</span>
                  {selectedDeposit.crypto_type && (
                    <span className="text-gray-500">({selectedDeposit.crypto_type})</span>
                  )}
                </div>
                
                <div className="text-3xl font-bold mb-3">
                  {selectedDeposit.amount.toLocaleString()} {selectedDeposit.currency}
                </div>

                {selectedDeposit.payment_type === 'IBAN' ? (
                  <div className="space-y-2 text-sm">
                    <div><strong>IBAN:</strong> {selectedDeposit.iban}</div>
                    {selectedDeposit.bank_name && (
                      <div><strong>{t('deposits.bankName')}:</strong> {selectedDeposit.bank_name}</div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div><strong>{t('deposits.walletAddress')}:</strong></div>
                    <div className="font-mono text-xs break-all bg-white p-2 rounded">
                      {selectedDeposit.wallet_address}
                    </div>
                  </div>
                )}
              </div>

              {/* Attachments (IBAN only) */}
              {selectedDeposit.payment_type === 'IBAN' && (
                <div className="p-4 bg-gray-50 rounded">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    {t('deposits.attachments')}
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    {['id_front', 'id_back', 'proof_of_residence', 'selfie_with_id'].map(type => {
                      const attachment = selectedDeposit.attachments?.[type];
                      const canUpload = selectedDeposit.status === 'pending' && (isSupervisor || isAdmin);
                      
                      return (
                        <div 
                          key={type}
                          className={`p-3 border rounded ${
                            attachment 
                              ? 'bg-green-50 border-green-200' 
                              : 'bg-red-50 border-red-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            {attachment ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <X className="w-4 h-4 text-red-600" />
                            )}
                            <span className="text-sm font-medium">{t(`deposits.attachment.${type}`)}</span>
                          </div>
                          
                          {attachment ? (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 truncate flex-1">
                                {attachment.filename}
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs"
                                onClick={() => {
                                  // Download the file
                                  const token = localStorage.getItem('crmToken');
                                  const url = `${API}/crm/deposits/${selectedDeposit.id}/attachments/${type}/download`;
                                  // Create hidden link and click it
                                  const link = document.createElement('a');
                                  link.href = url;
                                  link.setAttribute('download', attachment.filename);
                                  // Add auth header via fetch and blob
                                  fetch(url, {
                                    headers: { Authorization: `Bearer ${token}` }
                                  })
                                    .then(res => res.blob())
                                    .then(blob => {
                                      const blobUrl = window.URL.createObjectURL(blob);
                                      link.href = blobUrl;
                                      link.click();
                                      window.URL.revokeObjectURL(blobUrl);
                                    })
                                    .catch(err => toast.error(t('deposits.downloadError')));
                                }}
                              >
                                <Download className="w-3 h-3 mr-1" />
                                {t('common.download')}
                              </Button>
                            </div>
                          ) : canUpload ? (
                            <div className="relative">
                              <input
                                type="file"
                                accept="image/*,.pdf"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) {
                                    handleFileUpload(selectedDeposit.id, type, file);
                                  }
                                }}
                                disabled={uploading[type]}
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs w-full"
                                disabled={uploading[type]}
                              >
                                {uploading[type] ? (
                                  <span className="flex items-center gap-1">
                                    <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                                    {t('common.uploading')}
                                  </span>
                                ) : (
                                  <>
                                    <Upload className="w-3 h-3 mr-1" />
                                    {t('common.upload')}
                                  </>
                                )}
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-red-500">{t('deposits.notUploaded')}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedDeposit.notes && (
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-sm text-gray-500 mb-1">{t('deposits.notes')}</div>
                  <div>{selectedDeposit.notes}</div>
                </div>
              )}

              {/* Admin Notes */}
              {selectedDeposit.admin_notes && (
                <div className="p-4 bg-purple-50 rounded border border-purple-200">
                  <div className="text-sm text-purple-600 mb-1">{t('deposits.adminNotes')}</div>
                  <div>{selectedDeposit.admin_notes}</div>
                </div>
              )}

              {/* Approved/Rejected Info */}
              {selectedDeposit.status !== 'pending' && selectedDeposit.approved_by_name && (
                <div className="text-sm text-gray-500 text-center">
                  {selectedDeposit.status === 'approved' ? t('deposits.approvedBy') : t('deposits.rejectedBy')}: {selectedDeposit.approved_by_name}
                  {' '}{t('common.on')} {new Date(selectedDeposit.approved_at).toLocaleString()}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DepositsManager;
