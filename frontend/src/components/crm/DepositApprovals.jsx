import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  DollarSign, Check, X, Clock, Eye, CreditCard, Bitcoin, 
  FileText, User, AlertCircle, CheckCircle, XCircle
} from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DepositApprovals = ({ currentUser }) => {
  const { t } = useTranslation();
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeposit, setSelectedDeposit] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [processing, setProcessing] = useState(false);

  // Fetch pending deposits
  const fetchDeposits = useCallback(async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      const res = await axios.get(`${API}/crm/deposits?status=pending`, { headers });
      setDeposits(res.data || []);
    } catch (error) {
      console.error('Error fetching deposits:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeposits();
    // Poll for new deposits every 30 seconds
    const interval = setInterval(fetchDeposits, 30000);
    return () => clearInterval(interval);
  }, [fetchDeposits]);

  // Approve deposit
  const handleApprove = async (depositId) => {
    setProcessing(true);
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      await axios.put(`${API}/crm/deposits/${depositId}/approve`, {
        admin_notes: adminNotes
      }, { headers });
      
      toast.success(t('deposits.approveSuccess'));
      setShowDetailModal(false);
      setAdminNotes('');
      fetchDeposits();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('deposits.approveError'));
    } finally {
      setProcessing(false);
    }
  };

  // Reject deposit
  const handleReject = async (depositId) => {
    if (!adminNotes.trim()) {
      toast.error(t('deposits.rejectReasonRequired'));
      return;
    }
    
    setProcessing(true);
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };
      
      await axios.put(`${API}/crm/deposits/${depositId}/reject`, {
        admin_notes: adminNotes
      }, { headers });
      
      toast.success(t('deposits.rejectSuccess'));
      setShowDetailModal(false);
      setAdminNotes('');
      fetchDeposits();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('deposits.rejectError'));
    } finally {
      setProcessing(false);
    }
  };

  // View deposit details
  const viewDeposit = (deposit) => {
    setSelectedDeposit(deposit);
    setAdminNotes('');
    setShowDetailModal(true);
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
              <h1 className="text-2xl font-bold">{t('deposits.approvals')}</h1>
              <p className="text-gray-400">{t('deposits.approvalsSubtitle')}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-yellow-400">{deposits.length}</div>
            <div className="text-sm text-gray-400">{t('deposits.pendingApproval')}</div>
          </div>
        </div>
      </div>

      {/* Pending Deposits */}
      {deposits.length === 0 ? (
        <div className="bg-white border-2 border-gray-200 p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-600 mb-2">{t('deposits.noPending')}</h2>
          <p className="text-gray-500">{t('deposits.noPendingDesc')}</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {deposits.map(deposit => (
            <div 
              key={deposit.id} 
              className="bg-white border-2 border-yellow-300 p-4 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-semibold flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {t('deposits.pending')}
                    </span>
                    <span className="text-sm text-gray-500">
                      {new Date(deposit.created_at).toLocaleString()}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-4 gap-4 mt-3">
                    <div>
                      <div className="text-xs text-gray-500">{t('deposits.client')}</div>
                      <div className="font-semibold">{deposit.lead_name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">{t('deposits.agent')}</div>
                      <div className="flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {deposit.agent_name}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">{t('deposits.type')}</div>
                      <div className="flex items-center gap-1">
                        {getPaymentIcon(deposit.payment_type)}
                        {deposit.payment_type}
                        {deposit.crypto_type && ` (${deposit.crypto_type})`}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">{t('deposits.amount')}</div>
                      <div className="font-bold text-lg text-green-600">
                        {deposit.amount.toLocaleString()} {deposit.currency}
                      </div>
                    </div>
                  </div>

                  {/* IBAN Attachments Status */}
                  {deposit.payment_type === 'IBAN' && (
                    <div className="mt-3 flex gap-2">
                      {['id_front', 'id_back', 'proof_of_residence', 'selfie_with_id'].map(type => (
                        <span 
                          key={type}
                          className={`text-xs px-2 py-1 rounded flex items-center gap-1 ${
                            deposit.attachments?.[type] 
                              ? 'bg-green-100 text-green-700' 
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {deposit.attachments?.[type] ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                          {t(`deposits.attachment.${type}`)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex gap-2 ml-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => viewDeposit(deposit)}
                    className="rounded-none"
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    {t('common.review')}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail & Approval Modal */}
      <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
        <DialogContent className="max-w-3xl bg-white max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-500" />
              {t('deposits.reviewDeposit')}
            </DialogTitle>
          </DialogHeader>
          
          {selectedDeposit && (
            <div className="space-y-4">
              {/* Amount Banner */}
              <div className={`p-6 rounded text-center ${
                selectedDeposit.payment_type === 'IBAN' ? 'bg-blue-50' : 'bg-orange-50'
              }`}>
                <div className="flex items-center justify-center gap-2 mb-2">
                  {getPaymentIcon(selectedDeposit.payment_type)}
                  <span className="font-semibold">{selectedDeposit.payment_type}</span>
                  {selectedDeposit.crypto_type && (
                    <span className="text-gray-500">({selectedDeposit.crypto_type})</span>
                  )}
                </div>
                <div className="text-4xl font-bold text-gray-800">
                  {selectedDeposit.amount.toLocaleString()} {selectedDeposit.currency}
                </div>
              </div>

              {/* Client & Agent Info */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500 mb-1">{t('deposits.client')}</div>
                  <div className="font-semibold">{selectedDeposit.lead_name}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500 mb-1">{t('deposits.agent')}</div>
                  <div className="font-semibold">{selectedDeposit.agent_name}</div>
                </div>
                <div className="p-4 bg-gray-50 rounded">
                  <div className="text-xs text-gray-500 mb-1">{t('deposits.createdBy')}</div>
                  <div className="font-semibold">{selectedDeposit.supervisor_name}</div>
                </div>
              </div>

              {/* Payment Details */}
              <div className={`p-4 rounded border ${
                selectedDeposit.payment_type === 'IBAN' ? 'border-blue-200' : 'border-orange-200'
              }`}>
                {selectedDeposit.payment_type === 'IBAN' ? (
                  <div className="space-y-2">
                    <div><strong>IBAN:</strong> <span className="font-mono">{selectedDeposit.iban}</span></div>
                    {selectedDeposit.bank_name && (
                      <div><strong>{t('deposits.bankName')}:</strong> {selectedDeposit.bank_name}</div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div><strong>{t('deposits.cryptoType')}:</strong> {selectedDeposit.crypto_type}</div>
                    <div>
                      <strong>{t('deposits.walletAddress')}:</strong>
                      <div className="font-mono text-xs break-all bg-gray-100 p-2 rounded mt-1">
                        {selectedDeposit.wallet_address}
                      </div>
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
                      return (
                        <div 
                          key={type}
                          className={`p-3 border rounded ${
                            attachment ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {attachment ? (
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            ) : (
                              <XCircle className="w-5 h-5 text-red-600" />
                            )}
                            <div>
                              <div className="font-medium">{t(`deposits.attachment.${type}`)}</div>
                              {attachment && (
                                <div className="text-xs text-gray-500">{attachment.filename}</div>
                              )}
                            </div>
                          </div>
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

              {/* Admin Notes Input */}
              <div className="p-4 bg-purple-50 rounded border border-purple-200">
                <label className="block text-sm font-medium mb-2">{t('deposits.adminNotes')}</label>
                <textarea
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  className="w-full border rounded p-2 h-20"
                  placeholder={t('deposits.adminNotesPlaceholder')}
                />
                <p className="text-xs text-purple-600 mt-1">
                  * {t('deposits.rejectNoteRequired')}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => setShowDetailModal(false)}
                  disabled={processing}
                >
                  {t('common.cancel')}
                </Button>
                <Button 
                  variant="destructive"
                  onClick={() => handleReject(selectedDeposit.id)}
                  disabled={processing}
                  className="bg-red-600 hover:bg-red-700"
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  {t('deposits.reject')}
                </Button>
                <Button 
                  onClick={() => handleApprove(selectedDeposit.id)}
                  disabled={processing}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {t('deposits.approve')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DepositApprovals;
