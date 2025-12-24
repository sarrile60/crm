import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, UserCheck, UserX, Key, Search, Filter, Users, Bot, Archive, RotateCcw, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const UsersManagement = () => {
  const { t, i18n } = useTranslation();
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  
  // Helper to get proper locale for date formatting
  const getLocale = () => {
    const lang = i18n.language;
    return lang === 'en' ? 'en-GB' : 
           lang === 'it' ? 'it-IT' :
           lang === 'de' ? 'de-DE' :
           lang === 'fr' ? 'fr-FR' :
           lang === 'es' ? 'es-ES' : 'en-GB';
  };
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  const [showPermanentDeleteModal, setShowPermanentDeleteModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  
  // View mode: 'active' or 'archived'
  const [viewMode, setViewMode] = useState('active');
  
  // Selected user for operations
  const [selectedUser, setSelectedUser] = useState(null);
  
  // Filters
  const [filters, setFilters] = useState({
    search: '',
    role: '',
    team: '',
    status: ''
  });
  
  // Form data
  const [formData, setFormData] = useState({
    username: '',
    full_name: '',
    password: '',
    role: 'agent',
    team_ids: [],
    default_team_id: '',
    is_system_user: false,
    sip_extension: ''
  });
  
  const [adminPassword, setAdminPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    // Get current user from localStorage
    const user = localStorage.getItem('crmUser');
    if (user) {
      const userData = JSON.parse(user);
      setCurrentUser(userData);
    }
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const [usersRes, rolesRes, teamsRes] = await Promise.all([
        axios.get(`${API}/admin/users`, { headers }),
        axios.get(`${API}/admin/roles`, { headers }),
        axios.get(`${API}/crm/teams`, { headers })
      ]);

      setUsers(usersRes.data);
      setRoles(rolesRes.data);
      setTeams(teamsRes.data);
    } catch (error) {
      toast.error(t('users.errorLoadingData'));
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!formData.username || !formData.full_name || !formData.password) {
      toast.error(t('users.fillRequiredFields'));
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.post(`${API}/admin/users`, formData, { headers });
      toast.success(t('users.userCreatedSuccess'));
      setShowCreateModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('users.errorCreatingUser'));
    }
  };

  const handleEditUser = async () => {
    if (!formData.full_name) {
      toast.error(t('users.fullNameRequired'));
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const updateData = {
        full_name: formData.full_name,
        username: formData.username,
        role: formData.role,
        team_ids: formData.team_ids,
        default_team_id: formData.default_team_id || null,
        is_system_user: formData.is_system_user
      };

      await axios.put(`${API}/admin/users/${selectedUser.id}`, updateData, { headers });
      toast.success(t('users.userUpdatedSuccess'));
      setShowEditModal(false);
      setSelectedUser(null);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('users.errorUpdatingUser'));
    }
  };

  const handleResetPassword = async () => {
    if (!adminPassword) {
      toast.error(t('users.enterCurrentPassword'));
      return;
    }
    
    if (!newPassword || newPassword.length < 4) {
      toast.error(t('users.newPasswordMinLength'));
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error(t('users.passwordsDoNotMatch'));
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.put(`${API}/admin/users/${selectedUser.id}/password`, 
        { 
          admin_password: adminPassword,
          new_password: newPassword 
        }, 
        { headers }
      );
      toast.success(t('users.passwordResetSuccess'));
      setShowResetPasswordModal(false);
      setSelectedUser(null);
      setAdminPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || t('users.errorResettingPassword'));
    }
  };

  const handleToggleStatus = async (user) => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const newStatus = user.is_active ? 'inactive' : 'active';
      await axios.put(`${API}/admin/users/${user.id}/status`, 
        { status: newStatus }, 
        { headers }
      );
      toast.success(user.is_active ? t('users.userDeactivated') : t('users.userActivated'));
      fetchData();
    } catch (error) {
      toast.error(t('users.errorUpdatingStatus'));
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.delete(`${API}/admin/users/${selectedUser.id}`, { headers });
      toast.success(t('users.userArchivedSuccess'));
      setShowDeleteModal(false);
      setSelectedUser(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('users.errorDeletingUser'));
    }
  };

  const handleRestoreUser = async () => {
    if (!selectedUser) return;

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.post(`${API}/admin/users/${selectedUser.id}/restore`, {}, { headers });
      toast.success(t('users.userRestoredSuccess'));
      setShowRestoreModal(false);
      setSelectedUser(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('users.errorRestoringUser'));
    }
  };

  const handlePermanentDelete = async () => {
    if (!selectedUser) return;

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.delete(`${API}/admin/users/${selectedUser.id}/permanent`, { headers });
      toast.success(t('users.userPermanentlyDeletedSuccess'));
      setShowPermanentDeleteModal(false);
      setSelectedUser(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('users.errorPermanentlyDeletingUser'));
    }
  };

  const openRestoreModal = (user) => {
    setSelectedUser(user);
    setShowRestoreModal(true);
  };

  const openPermanentDeleteModal = (user) => {
    setSelectedUser(user);
    setShowPermanentDeleteModal(true);
  };

  const openEditModal = (user) => {
    setSelectedUser(user);
    setFormData({
      username: user.username,
      full_name: user.full_name,
      password: '',
      role: user.role,
      team_ids: user.team_ids || (user.team_id ? [user.team_id] : []),
      default_team_id: user.default_team_id || user.team_id || '',
      is_system_user: user.is_system_user || false,
      sip_extension: user.sip_extension || ''
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (user) => {
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  const openResetPasswordModal = (user) => {
    setSelectedUser(user);
    setNewPassword('');
    setShowResetPasswordModal(true);
  };

  const resetForm = () => {
    setFormData({
      username: '',
      full_name: '',
      password: '',
      role: 'agent',
      team_ids: [],
      default_team_id: '',
      is_system_user: false,
      sip_extension: ''
    });
  };

  const getStatusBadge = (user) => {
    if (user.deleted_at) {
      return <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs font-semibold rounded">{t('common.deleted')}</span>;
    }
    if (!user.is_active) {
      return <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-semibold rounded">{t('common.inactive')}</span>;
    }
    return <span className="px-2 py-1 bg-green-100 text-green-600 text-xs font-semibold rounded">{t('common.active')}</span>;
  };

  const getRoleBadge = (role) => {
    const colors = {
      admin: 'bg-red-100 text-red-800 border-red-200',
      supervisor: 'bg-blue-100 text-blue-800 border-blue-200',
      agent: 'bg-green-100 text-green-800 border-green-200'
    };
    return colors[role?.toLowerCase()] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const formatDate = (dateString) => {
    if (!dateString) return t('common.never');
    return new Date(dateString).toLocaleString(getLocale(), {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Filter users based on viewMode first
  const filteredUsers = users.filter(user => {
    // Filter by view mode (active vs archived)
    if (viewMode === 'active' && user.deleted_at) return false;
    if (viewMode === 'archived' && !user.deleted_at) return false;
    
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      if (!user.username?.toLowerCase().includes(searchLower) && 
          !user.full_name?.toLowerCase().includes(searchLower)) {
        return false;
      }
    }
    if (filters.role && user.role?.toLowerCase() !== filters.role.toLowerCase()) {
      return false;
    }
    if (filters.team && user.team_id !== filters.team && !user.team_ids?.includes(filters.team)) {
      return false;
    }
    if (filters.status && viewMode === 'active') {
      if (filters.status === 'active' && !user.is_active) return false;
      if (filters.status === 'inactive' && user.is_active) return false;
    }
    return true;
  });
  
  // Count archived users for badge
  const archivedCount = users.filter(u => u.deleted_at).length;

  if (loading) {
    return <div className="text-center py-12 text-gray-600">{t('users.loadingUsers')}</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-black">{t('users.title')}</h2>
          <p className="text-gray-600 mt-1">{t('users.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex border border-gray-300">
            <Button
              variant="ghost"
              onClick={() => setViewMode('active')}
              className={`rounded-none px-4 ${viewMode === 'active' ? 'bg-[#D4AF37] text-black' : 'text-gray-600'}`}
            >
              <Users className="w-4 h-4 mr-2" />
              {t('users.activeUsers')}
            </Button>
            <Button
              variant="ghost"
              onClick={() => setViewMode('archived')}
              className={`rounded-none px-4 ${viewMode === 'archived' ? 'bg-[#D4AF37] text-black' : 'text-gray-600'}`}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {t('users.archive')}
              {archivedCount > 0 && (
                <span className="ml-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                  {archivedCount}
                </span>
              )}
            </Button>
          </div>
          
          {viewMode === 'active' && (
            <Button 
              onClick={() => { resetForm(); setShowCreateModal(true); }}
              className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('users.createUser')}
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-2 border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder={t('users.searchUser')}
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-10 bg-white border-gray-300 rounded-none"
            />
          </div>
          <Select value={filters.role || "all"} onValueChange={(value) => setFilters({ ...filters, role: value === "all" ? "" : value })}>
            <SelectTrigger className="bg-white border-gray-300 rounded-none">
              <SelectValue placeholder={t('users.filterByRole')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('users.allRoles')}</SelectItem>
              {roles.map(role => (
                <SelectItem key={role.id} value={role.name.toLowerCase()}>{role.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.team || "all"} onValueChange={(value) => setFilters({ ...filters, team: value === "all" ? "" : value })}>
            <SelectTrigger className="bg-white border-gray-300 rounded-none">
              <SelectValue placeholder={t('users.filterByTeam')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('users.allTeams')}</SelectItem>
              {teams.map(team => (
                <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.status || "all"} onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? "" : value })}>
            <SelectTrigger className="bg-white border-gray-300 rounded-none">
              <SelectValue placeholder={t('users.filterByStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('users.allStatuses')}</SelectItem>
              <SelectItem value="active">{t('common.active')}</SelectItem>
              <SelectItem value="inactive">{t('common.inactive')}</SelectItem>
              <SelectItem value="deleted">{t('common.deleted')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white border-2 border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-black text-white">
              <tr>
                <th className="text-left p-4 font-semibold">{t('users.user')}</th>
                <th className="text-left p-4 font-semibold">{t('users.role')}</th>
                <th className="text-left p-4 font-semibold">{t('users.team')}</th>
                <th className="text-left p-4 font-semibold">{t('common.status')}</th>
                <th className="text-left p-4 font-semibold">{t('users.lastAccess')}</th>
                <th className="text-left p-4 font-semibold">{t('users.userType')}</th>
                <th className="text-left p-4 font-semibold">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500">
                    {t('users.noUsersFound')}
                  </td>
                </tr>
              ) : (
                filteredUsers.map(user => (
                  <tr key={user.id} className="border-t border-gray-200 hover:bg-gray-50">
                    <td className="p-4">
                      <div>
                        <div className="font-semibold text-black">{user.full_name}</div>
                        <div className="text-sm text-gray-500">@{user.username}</div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className={`px-3 py-1 rounded border text-xs font-semibold ${getRoleBadge(user.role)}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="p-4 text-gray-700">
                      {user.team_ids?.length > 0 ? (
                        <div>
                          {user.team_ids.map(tid => {
                            const team = teams.find(t => t.id === tid);
                            const isDefault = tid === user.default_team_id;
                            return team ? (
                              <span key={tid} className={`inline-block mr-1 mb-1 px-2 py-0.5 text-xs rounded ${isDefault ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                {team.name}{isDefault ? ' ★' : ''}
                              </span>
                            ) : null;
                          })}
                        </div>
                      ) : user.team_id ? (
                        teams.find(t => t.id === user.team_id)?.name || 'N/A'
                      ) : (
                        <span className="text-gray-400">{t('common.noTeam')}</span>
                      )}
                    </td>
                    <td className="p-4">
                      {getStatusBadge(user)}
                    </td>
                    <td className="p-4 text-gray-600 text-sm">
                      {formatDate(user.last_login)}
                    </td>
                    <td className="p-4">
                      {user.is_system_user ? (
                        <span className="flex items-center gap-1 text-purple-600 text-xs">
                          <Bot className="w-4 h-4" /> {t('users.systemApiUser')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-600 text-xs">
                          <Users className="w-4 h-4" /> {t('users.regularUser')}
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        {/* Show different actions based on viewMode */}
                        {viewMode === 'active' ? (
                          <>
                            <Button
                              onClick={() => openEditModal(user)}
                              size="sm"
                              className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none"
                              title={t('common.edit')}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => openResetPasswordModal(user)}
                              size="sm"
                              className="bg-blue-600 text-white hover:bg-blue-700 rounded-none"
                              title={t('users.resetPassword')}
                            >
                              <Key className="w-4 h-4" />
                            </Button>
                            {user.id !== currentUser?.id && (
                              <>
                                <Button
                                  onClick={() => handleToggleStatus(user)}
                                  size="sm"
                                  className={`${user.is_active ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'} text-white rounded-none`}
                                  title={user.is_active ? t('users.deactivate') : t('users.activate')}
                                >
                                  {user.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                                </Button>
                                <Button
                                  onClick={() => openDeleteModal(user)}
                                  size="sm"
                                  className="bg-red-600 text-white hover:bg-red-700 rounded-none"
                                  title={t('users.archive')}
                                >
                                  <Archive className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </>
                        ) : (
                          /* Archive view actions - Restore or Permanently Delete */
                          <>
                            <Button
                              onClick={() => openRestoreModal(user)}
                              size="sm"
                              className="bg-green-600 text-white hover:bg-green-700 rounded-none"
                              title={t('users.restore')}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => openPermanentDeleteModal(user)}
                              size="sm"
                              className="bg-red-600 text-white hover:bg-red-700 rounded-none"
                              title={t('users.permanentDelete')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-4 text-sm text-gray-600">
        {t('users.totalUsers')}: {filteredUsers.length} | 
        {t('users.activeUsers')}: {filteredUsers.filter(u => u.is_active && !u.deleted_at).length} | 
        {t('users.inactiveUsers')}: {filteredUsers.filter(u => !u.is_active && !u.deleted_at).length} |
        {t('users.deletedUsers')}: {filteredUsers.filter(u => u.deleted_at).length}
      </div>

      {/* Create User Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-black">{t('users.createNewUser')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('users.usernameLabel')} *</label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="e.g. john_doe"
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('users.fullNameLabel')} *</label>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="e.g. John Doe"
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('users.passwordLabel')} *</label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Secure password"
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('users.roleLabel')} *</label>
              <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                <SelectTrigger className="bg-white border-gray-300 rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map(role => (
                    <SelectItem key={role.id} value={role.name.toLowerCase()}>{role.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('users.teamLabel')}</label>
              <Select 
                value={formData.team_ids[0] || 'none'} 
                onValueChange={(value) => setFormData({ 
                  ...formData, 
                  team_ids: value !== 'none' ? [value] : [],
                  default_team_id: value !== 'none' ? value : ''
                })}
              >
                <SelectTrigger className="bg-white border-gray-300 rounded-none">
                  <SelectValue placeholder={t('users.selectTeam')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('common.noTeam')}</SelectItem>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('users.sipExtension')}</label>
              <Input
                value={formData.sip_extension}
                onChange={(e) => setFormData({ ...formData, sip_extension: e.target.value })}
                placeholder={t('users.sipExtensionPlaceholder')}
                className="bg-white border-gray-300 rounded-none"
              />
              <p className="text-xs text-gray-500 mt-1">{t('users.sipExtensionHelp')}</p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_system_user"
                checked={formData.is_system_user}
                onCheckedChange={(checked) => setFormData({ ...formData, is_system_user: checked })}
              />
              <label htmlFor="is_system_user" className="text-sm text-gray-700">
                {t('users.systemUserLabel')}
              </label>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setShowCreateModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleCreateUser}
                className="flex-1 bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none"
              >
                {t('users.createUser')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-black">{t('users.editUser')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('users.usernameLabel')}</label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('users.fullNameLabel')} *</label>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('users.roleLabel')}</label>
              <Select value={formData.role} onValueChange={(value) => setFormData({ ...formData, role: value })}>
                <SelectTrigger className="bg-white border-gray-300 rounded-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map(role => (
                    <SelectItem key={role.id} value={role.name.toLowerCase()}>{role.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('users.team')}</label>
              <Select 
                value={formData.team_ids[0] || 'none'} 
                onValueChange={(value) => setFormData({ 
                  ...formData, 
                  team_ids: value !== 'none' ? [value] : [],
                  default_team_id: value !== 'none' ? value : ''
                })}
              >
                <SelectTrigger className="bg-white border-gray-300 rounded-none">
                  <SelectValue placeholder={t('users.selectTeam')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('common.noTeam')}</SelectItem>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('users.sipExtension')}</label>
              <Input
                value={formData.sip_extension}
                onChange={(e) => setFormData({ ...formData, sip_extension: e.target.value })}
                placeholder={t('users.sipExtensionPlaceholder')}
                className="bg-white border-gray-300 rounded-none"
              />
              <p className="text-xs text-gray-500 mt-1">{t('users.sipExtensionHelp')}</p>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit_is_system_user"
                checked={formData.is_system_user}
                onCheckedChange={(checked) => setFormData({ ...formData, is_system_user: checked })}
              />
              <label htmlFor="edit_is_system_user" className="text-sm text-gray-700">
                {t('users.systemApiUser')}
              </label>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setShowEditModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleEditUser}
                className="flex-1 bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none"
              >
                {t('common.saveChanges')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Modal */}
      <Dialog open={showResetPasswordModal} onOpenChange={(open) => {
        setShowResetPasswordModal(open);
        if (!open) {
          setAdminPassword('');
          setNewPassword('');
          setConfirmPassword('');
          setShowPassword(false);
        }
      }}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-black flex items-center gap-2">
              <Key className="w-6 h-6 text-blue-600" />
              {t('users.resetPassword')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-gray-600">
              {t('users.resettingPasswordFor')} <strong>{selectedUser?.full_name}</strong> (@{selectedUser?.username})
            </p>
            
            <div className="bg-gray-50 border border-gray-200 p-4 rounded">
              <label className="block text-sm font-semibold text-black mb-2">
                🔐 {t('users.yourCurrentPassword')} *
              </label>
              <Input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder={t('users.enterYourPassword')}
                className="bg-white border-gray-300 rounded-none"
              />
              <p className="text-xs text-gray-500 mt-1">
                {t('users.securityConfirm')}
              </p>
            </div>

            <hr className="border-gray-200" />

            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('users.newPasswordForUser')} *</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t('users.enterNewPassword')}
                  className="bg-white border-gray-300 rounded-none pr-20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:text-blue-800"
                >
                  {showPassword ? t('users.hide') : t('users.show')}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">{t('users.confirmNewPassword')} *</label>
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t('users.confirmNewPasswordPlaceholder')}
                className={`bg-white border-gray-300 rounded-none ${
                  confirmPassword && newPassword !== confirmPassword ? 'border-red-500' : ''
                }`}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-red-500 text-xs mt-1">{t('users.passwordsDoNotMatch')}</p>
              )}
            </div>
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
              <p className="text-sm text-yellow-800">
                <strong>⚠️</strong> {t('users.securityNote')}
              </p>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setShowResetPasswordModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleResetPassword}
                disabled={!adminPassword || !newPassword || newPassword.length < 4 || newPassword !== confirmPassword}
                className="flex-1 bg-blue-600 text-white hover:bg-blue-700 rounded-none disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('users.resetPassword')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Archive User Modal (Soft Delete) */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-orange-600 flex items-center gap-2">
              <Archive className="w-6 h-6" />
              {t('users.confirmArchive')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-gray-700">
              {t('users.archiveWarning')} <strong>{selectedUser?.full_name}</strong> (@{selectedUser?.username})?
            </p>
            <div className="bg-blue-50 border border-blue-200 p-3 rounded">
              <p className="text-sm text-blue-800">
                <strong>ℹ️</strong> {t('users.archiveNote')}
              </p>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleDeleteUser}
                className="flex-1 bg-orange-600 text-white hover:bg-orange-700 rounded-none"
              >
                {t('users.archive')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Restore User Modal */}
      <Dialog open={showRestoreModal} onOpenChange={setShowRestoreModal}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-green-600 flex items-center gap-2">
              <RotateCcw className="w-6 h-6" />
              {t('users.confirmRestore')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-gray-700">
              {t('users.restoreWarning')} <strong>{selectedUser?.full_name}</strong> (@{selectedUser?.username})?
            </p>
            <div className="bg-green-50 border border-green-200 p-3 rounded">
              <p className="text-sm text-green-800">
                <strong>✓</strong> {t('users.restoreNote')}
              </p>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setShowRestoreModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handleRestoreUser}
                className="flex-1 bg-green-600 text-white hover:bg-green-700 rounded-none"
              >
                {t('users.restore')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permanent Delete Modal */}
      <Dialog open={showPermanentDeleteModal} onOpenChange={setShowPermanentDeleteModal}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-red-600 flex items-center gap-2">
              <AlertTriangle className="w-6 h-6" />
              {t('users.confirmPermanentDelete')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-gray-700">
              {t('users.permanentDeleteWarning')} <strong>{selectedUser?.full_name}</strong> (@{selectedUser?.username})?
            </p>
            <div className="bg-red-50 border border-red-200 p-3 rounded">
              <p className="text-sm text-red-800">
                <strong>⚠️ {t('common.warning')}:</strong> {t('users.permanentDeleteNote')}
              </p>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setShowPermanentDeleteModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                {t('common.cancel')}
              </Button>
              <Button 
                onClick={handlePermanentDelete}
                className="flex-1 bg-red-600 text-white hover:bg-red-700 rounded-none"
              >
                {t('users.permanentDelete')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersManagement;
