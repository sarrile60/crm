import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Shield, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/admin`;

const RoleManagement = () => {
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
      toast.error('Error loading roles');
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
      
      toast.success('Role created successfully');
      setShowCreateModal(false);
      setFormData({ name: '', description: '' });
      fetchRoles();
    } catch (error) {
      toast.error('Error creating role');
      console.error('Error:', error);
    }
  };

  const handleEdit = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      await axios.put(`${API}/roles/${selectedRole.id}`, formData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Role updated successfully');
      setShowEditModal(false);
      setSelectedRole(null);
      setFormData({ name: '', description: '' });
      fetchRoles();
    } catch (error) {
      toast.error('Error updating role');
      console.error('Error:', error);
    }
  };

  const handleDelete = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      await axios.delete(`${API}/roles/${selectedRole.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      toast.success('Role deleted successfully');
      setShowDeleteConfirm(false);
      setSelectedRole(null);
      fetchRoles();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Error deleting role');
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
    return <div className="text-center py-8">Loading roles...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-black">Role Management</h2>
          <p className="text-gray-600 mt-1">Create and manage user roles for your CRM</p>
        </div>
        <Button
          onClick={() => {
            setFormData({ name: '', description: '' });
            setShowCreateModal(true);
          }}
          className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Role
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
                    <span className="text-xs text-gray-500">System Role</span>
                  )}
                </div>
              </div>
            </div>
            
            <p className="text-gray-600 text-sm mb-4 min-h-[40px]">
              {role.description || 'No description'}
            </p>

            <div className="flex gap-2">
              <Button
                onClick={() => openEditModal(role)}
                className="flex-1 bg-black hover:bg-gray-800 text-white rounded-none"
              >
                <Edit className="w-4 h-4 mr-2" />
                Edit
              </Button>
              <Button
                onClick={() => openDeleteConfirm(role)}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-none"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {roles.length === 0 && (
        <div className="text-center py-12 text-gray-500">
          No roles created yet. Click "Create Role" to get started.
        </div>
      )}

      {/* Create Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="bg-white rounded-none">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-black">Create New Role</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-semibold text-black mb-2">Role Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Sales Manager"
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">Description</label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Describe the role's responsibilities..."
                className="bg-white border-gray-300 rounded-none"
                rows={3}
              />
            </div>
            <div className="flex gap-3 justify-end mt-6">
              <Button
                onClick={() => setShowCreateModal(false)}
                className="bg-gray-200 hover:bg-gray-300 text-black rounded-none"
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!formData.name}
                className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
              >
                Create Role
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
              Edit Role
              {selectedRole?.is_system && (
                <span className="text-sm font-normal text-gray-500 ml-2">(System Role)</span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-semibold text-black mb-2">Role Name *</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">Description</label>
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
                Cancel
              </Button>
              <Button
                onClick={handleEdit}
                disabled={!formData.name}
                className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
              >
                Save Changes
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
              Delete Role?
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4">
            <p className="text-gray-700 mb-4">
              Are you sure you want to delete the role <strong>"{selectedRole?.name}"</strong>?
            </p>
            {selectedRole?.is_system && (
              <div className="bg-yellow-50 border-2 border-yellow-400 p-3 mb-4">
                <p className="text-sm text-yellow-800">
                  ⚠️ This is a system role. Deleting it may affect existing functionality.
                </p>
              </div>
            )}
            <p className="text-sm text-gray-600">
              Users with this role will lose their permissions. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end mt-6">
              <Button
                onClick={() => setShowDeleteConfirm(false)}
                className="bg-gray-200 hover:bg-gray-300 text-black rounded-none"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700 text-white rounded-none"
              >
                Delete Role
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RoleManagement;
