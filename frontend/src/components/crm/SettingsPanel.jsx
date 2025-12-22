import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SettingsPanel = () => {
  const { t } = useTranslation();
  const [statuses, setStatuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStatus, setNewStatus] = useState({
    name: '',
    color: '#3B82F6',
    order: 0
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const statusesRes = await axios.get(`${API}/crm/statuses`, { headers });
      setStatuses(statusesRes.data);
    } catch (error) {
      toast.error(t('users.errorLoadingData'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStatus = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.post(`${API}/crm/statuses`, newStatus, { headers });
      toast.success(t('settings.statusCreated'));
      setShowCreateModal(false);
      setNewStatus({ name: '', color: '#3B82F6', order: 0 });
      fetchData();
    } catch (error) {
      toast.error(t('settings.errorCreatingStatus'));
    }
  };

  const handleDeleteStatus = async (statusId) => {
    if (!window.confirm(t('settings.confirmDeleteStatus'))) return;

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.delete(`${API}/crm/statuses/${statusId}`, { headers });
      toast.success(t('settings.statusDeleted'));
      fetchData();
    } catch (error) {
      toast.error(t('settings.errorDeletingStatus'));
    }
  };

  if (loading) {
    return <div className="text-center py-12">{t('common.loading')}...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-black">{t('settings.crmSettings')}</h2>
      </div>

      {/* Custom Statuses Section */}
      <div className="bg-white border-2 border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-black">{t('settings.customStatuses')}</h3>
          <Button onClick={() => setShowCreateModal(true)} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
            <Plus className="w-4 h-4 mr-2" />
            {t('settings.newStatus')}
          </Button>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {statuses.map((status) => (
            <div key={status.id} className="border-2 border-gray-200 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-6 h-6 rounded-full"
                  style={{ backgroundColor: status.color }}
                />
                <span className="font-semibold text-black">{status.name}</span>
              </div>
              <Button
                onClick={() => handleDeleteStatus(status.id)}
                size="sm"
                className="bg-red-600 text-white hover:bg-red-700 rounded-none"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-gray-50 border-2 border-gray-200 p-6">
        <h3 className="text-xl font-bold text-black mb-4">{t('settings.systemInfo')}</h3>
        <div className="space-y-2 text-gray-700">
          <p><strong>{t('settings.crmVersion')}:</strong> 1.0.0</p>
          <p><strong>{t('settings.activeStatuses')}:</strong> {statuses.length}</p>
        </div>
      </div>

      {/* Create Status Modal */}
      {showCreateModal && (
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-black">{t('settings.createNewStatus')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-black mb-2">{t('settings.statusName')}</label>
                <Input
                  value={newStatus.name}
                  onChange={(e) => setNewStatus({ ...newStatus, name: e.target.value })}
                  placeholder={t('settings.statusNamePlaceholder')}
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">{t('settings.statusColor')}</label>
                <Input
                  type="color"
                  value={newStatus.color}
                  onChange={(e) => setNewStatus({ ...newStatus, color: e.target.value })}
                  className="bg-white border-gray-300 rounded-none h-12 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">{t('settings.order')}</label>
                <Input
                  type="number"
                  value={newStatus.order}
                  onChange={(e) => setNewStatus({ ...newStatus, order: parseInt(e.target.value) })}
                  placeholder="0"
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <Button onClick={handleCreateStatus} className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                {t('settings.createStatus')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default SettingsPanel;
