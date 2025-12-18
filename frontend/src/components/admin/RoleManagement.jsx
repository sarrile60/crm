import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Shield, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api/admin`;

const RoleManagement = () => {
  const { t } = useTranslation();
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    description: ''
  });

  useEffect(() => {
    fetchRoles();
  }, []);

  const fetchRoles = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${API}/roles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRoles(response.data);
    } catch (error) {
      toast.error(t('roles.errorLoading'));
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      await axios.post(`${API}/roles`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(t('roles.createSuccess'));
      setShowCreateModal(false);
      setFormData({ name: '', description: '' });
      fetchRoles();
    } catch (error) {
      toast.error(t('roles.errorCreating'));
      console.error('Error:', error);
    }
  };

  const handleEdit = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      await axios.put(`${API}/roles/${selectedRole.id}`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(t('roles.updateSuccess'));
      setShowEditModal(false);
      setSelectedRole(null);
      setFormData({ name: '', description: '' });
      fetchRoles();
    } catch (error) {
      toast.error(t('roles.errorUpdating'));
      console.error('Error:', error);
    }
  };

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      await axios.delete(`${API}/roles/${selectedRole.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success(t('roles.deleteSuccess'));
      setShowDeleteConfirm(false);
      setSelectedRole(null);
      fetchRoles();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('roles.errorDeleting'));
      console.error('Error:', error);
    }
  };

  const openEditModal = (role) => {
    setSelectedRole(role);
    setFormData({
      name: role.name,
      description: role.description || ''
    });
    setShowEditModal(true);
  };

  const openDeleteConfirm = (role) => {
    setSelectedRole(role);
    setShowDeleteConfirm(true);
  };

  if (loading) {
    return <div className="text-center py-8">{t('roles.loading')}</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('roles.title')}</h2>
          <p className="text-gray-600 mt-1">{t('roles.subtitle')}</p>
        </div>
        <Button
          onClick={() => {
            setFormData({ name: '', description: '' });
            setShowCreateModal(true);
          }}
          className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
        >
          <Plus className="w-4 h-4 mr-2" />
          {t('roles.createRole')}
        </Button>
      </div>

      {/* Roles Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map(role => (
          <div
            key={role.id}
            className="bg-white border-2 border-gray-200 p-6 hover:border-[#D4AF37] transition-colors"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#D4AF37] bg-opacity-10 flex items-center justify-center">
                  <Shield className="w-6 h-6 text-[#D4AF37]" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-black">{role.name}</h3>
                  {role.is_system && (
                    <span className="text-xs text-gray-500">{t('roles.systemRole')}</span>
                  )}
                </div>
              </div>
            </div>
            
            <p className="text-gray-600 text-sm mb-4 min-h-[40px]">
              {role.description?.startsWith('role_desc_') 
                ? t(`roles.descriptions.${role.description}`)
                : (role.description || t('roles.noDescription'))}
            </p>

            <div className="flex gap-2">
              <Button
                onClick={() => openEditModal(role)}
                className="flex-1 bg-black hover:bg-gray-800 text-white rounded-none"
              >
                <Edit className="w-4 h-4 mr-2" />
                {t('common.edit')}
              </Button>
              <Button
                onClick={() => openDeleteConfirm(role)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-none"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {t('common.delete')}
              </Button>
            </div>
          </div>
        ))}
      </div>

      {roles.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          {t('roles.noRolesYet')}
        </div>
      )}

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="bg-white rounded-none">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-black">{t('roles.createNewRole')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('roles.roleName')} *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder={t('roles.roleNamePlaceholder')}
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('common.description')}</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={t('roles.descriptionPlaceholder')}
                className="bg-white border-gray-300 rounded-none"
                rows={3}
              />
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <Button
                onClick={() => setShowCreateModal(false)}
                className="bg-gray-200 hover:bg-gray-300 text-black rounded-none"
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!formData.name}
                className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
              >
                {t('roles.createRole')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="bg-white rounded-none">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-black">
              {t('roles.editRole')}
              {selectedRole?.is_system && (
                <span className="text-sm font-normal text-gray-500 ml-2">({t('roles.systemRole')})</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('roles.roleName')} *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('common.description')}</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="bg-white border-gray-300 rounded-none"
                rows={3}
              />
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <Button
                onClick={() => setShowEditModal(false)}
                className="bg-gray-200 hover:bg-gray-300 text-black rounded-none"
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleEdit}
                disabled={!formData.name}
                className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
              >
                {t('common.saveChanges')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="bg-white rounded-none">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6" />
              {t('roles.deleteRole')}?
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <p className="text-gray-700 mb-4">
              {t('roles.confirmDelete', { name: selectedRole?.name })}
            </p>
            {selectedRole?.is_system && (
              <div className="bg-yellow-50 border-2 border-yellow-400 p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ {t('roles.systemRoleWarning')}
                </p>
              </div>
            )}
            <p className="text-sm text-gray-600">
              {t('roles.deleteWarning')}
            </p>
            <div className="flex gap-3 justify-end mt-6">
              <Button
                onClick={() => setShowDeleteConfirm(false)}
                className="bg-gray-200 hover:bg-gray-300 text-black rounded-none"
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white rounded-none"
              >
                {t('roles.deleteRole')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RoleManagement;
