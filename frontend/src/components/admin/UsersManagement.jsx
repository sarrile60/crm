import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, UserCheck, UserX, Key, Search, Filter, Users, Bot } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Checkbox } from '../ui/checkbox';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const UsersManagement = () => {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showResetPasswordModal, setShowResetPasswordModal] = useState(false);
  
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
    is_system_user: false
  });
  
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    // Get current user from localStorage
    const user = localStorage.getItem('crmUser');
    if (user) {
      setCurrentUser(JSON.parse(user));
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
      toast.error('Errore nel caricamento dei dati');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    if (!formData.username || !formData.full_name || !formData.password) {
      toast.error('Compila tutti i campi obbligatori');
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.post(`${API}/admin/users`, formData, { headers });
      toast.success('Utente creato con successo');
      setShowCreateModal(false);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Errore nella creazione dell\'utente');
    }
  };

  const handleEditUser = async () => {
    if (!formData.full_name) {
      toast.error('Il nome completo è obbligatorio');
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      // Build update payload - exclude password if not changed
      const updateData = {
        full_name: formData.full_name,
        username: formData.username,
        role: formData.role,
        team_ids: formData.team_ids,
        default_team_id: formData.default_team_id || null,
        is_system_user: formData.is_system_user
      };

      await axios.put(`${API}/admin/users/${selectedUser.id}`, updateData, { headers });
      toast.success('Utente aggiornato con successo');
      setShowEditModal(false);
      setSelectedUser(null);
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Errore nell\'aggiornamento dell\'utente');
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 4) {
      toast.error('La password deve essere di almeno 4 caratteri');
      return;
    }

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.put(`${API}/admin/users/${selectedUser.id}/password`, 
        { password: newPassword }, 
        { headers }
      );
      toast.success('Password reimpostata con successo');
      setShowResetPasswordModal(false);
      setSelectedUser(null);
      setNewPassword('');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Errore nella reimpostazione della password');
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
      toast.success(user.is_active ? 'Utente disattivato' : 'Utente attivato');
      fetchData();
    } catch (error) {
      toast.error('Errore nell\'aggiornamento dello stato');
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.delete(`${API}/admin/users/${selectedUser.id}`, { headers });
      toast.success('Utente eliminato con successo');
      setShowDeleteModal(false);
      setSelectedUser(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Errore nell\'eliminazione dell\'utente');
    }
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
      is_system_user: user.is_system_user || false
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
      is_system_user: false
    });
  };

  const getStatusBadge = (user) => {
    if (user.deleted_at) {
      return <span className="px-2 py-1 bg-gray-200 text-gray-600 text-xs font-semibold rounded">Eliminato</span>;
    }
    if (!user.is_active) {
      return <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-semibold rounded">Inattivo</span>;
    }
    return <span className="px-2 py-1 bg-green-100 text-green-600 text-xs font-semibold rounded">Attivo</span>;
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
    if (!dateString) return 'Mai';
    return new Date(dateString).toLocaleString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Filter users
  const filteredUsers = users.filter(user => {
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
    if (filters.status) {
      if (filters.status === 'active' && !user.is_active) return false;
      if (filters.status === 'inactive' && user.is_active) return false;
      if (filters.status === 'deleted' && !user.deleted_at) return false;
    }
    return true;
  });

  if (loading) {
    return <div className="text-center py-12 text-gray-600">Caricamento utenti...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-black">Users Management</h2>
          <p className="text-gray-600 mt-1">Create, edit, and manage system users</p>
        </div>
        <Button 
          onClick={() => { resetForm(); setShowCreateModal(true); }}
          className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create User
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white border-2 border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              placeholder="Cerca utente..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="pl-10 bg-white border-gray-300 rounded-none"
            />
          </div>
          <Select value={filters.role || "all"} onValueChange={(value) => setFilters({ ...filters, role: value === "all" ? "" : value })}>
            <SelectTrigger className="bg-white border-gray-300 rounded-none">
              <SelectValue placeholder="Filtra per ruolo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i ruoli</SelectItem>
              {roles.map(role => (
                <SelectItem key={role.id} value={role.name.toLowerCase()}>{role.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.team || "all"} onValueChange={(value) => setFilters({ ...filters, team: value === "all" ? "" : value })}>
            <SelectTrigger className="bg-white border-gray-300 rounded-none">
              <SelectValue placeholder="Filtra per team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti i team</SelectItem>
              {teams.map(team => (
                <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filters.status || "all"} onValueChange={(value) => setFilters({ ...filters, status: value === "all" ? "" : value })}>
            <SelectTrigger className="bg-white border-gray-300 rounded-none">
              <SelectValue placeholder="Filtra per stato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="active">Attivo</SelectItem>
              <SelectItem value="inactive">Inattivo</SelectItem>
              <SelectItem value="deleted">Eliminato</SelectItem>
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
                <th className="text-left p-4 font-semibold">Utente</th>
                <th className="text-left p-4 font-semibold">Ruolo</th>
                <th className="text-left p-4 font-semibold">Team</th>
                <th className="text-left p-4 font-semibold">Stato</th>
                <th className="text-left p-4 font-semibold">Ultimo Accesso</th>
                <th className="text-left p-4 font-semibold">Tipo</th>
                <th className="text-left p-4 font-semibold">Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-gray-500">
                    Nessun utente trovato
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
                        <span className="text-gray-400">Nessun team</span>
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
                          <Bot className="w-4 h-4" /> Sistema/API
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-gray-600 text-xs">
                          <Users className="w-4 h-4" /> Utente
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <Button
                          onClick={() => openEditModal(user)}
                          size="sm"
                          className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none"
                          title="Modifica"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          onClick={() => openResetPasswordModal(user)}
                          size="sm"
                          className="bg-blue-600 text-white hover:bg-blue-700 rounded-none"
                          title="Reimposta Password"
                        >
                          <Key className="w-4 h-4" />
                        </Button>
                        {user.id !== currentUser?.id && !user.deleted_at && (
                          <>
                            <Button
                              onClick={() => handleToggleStatus(user)}
                              size="sm"
                              className={`${user.is_active ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'} text-white rounded-none`}
                              title={user.is_active ? 'Disattiva' : 'Attiva'}
                            >
                              {user.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                            </Button>
                            <Button
                              onClick={() => openDeleteModal(user)}
                              size="sm"
                              className="bg-red-600 text-white hover:bg-red-700 rounded-none"
                              title="Elimina"
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
        Totale: {filteredUsers.length} utenti | 
        Attivi: {filteredUsers.filter(u => u.is_active && !u.deleted_at).length} | 
        Inattivi: {filteredUsers.filter(u => !u.is_active && !u.deleted_at).length} |
        Eliminati: {filteredUsers.filter(u => u.deleted_at).length}
      </div>

      {/* Create User Modal */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-black">Crea Nuovo Utente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-semibold text-black mb-2">Username *</label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="es. mario_rossi"
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">Nome Completo *</label>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="es. Mario Rossi"
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">Password *</label>
              <Input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                placeholder="Password sicura"
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">Ruolo *</label>
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
              <label className="block text-sm font-semibold text-black mb-2">Team (Opzionale)</label>
              <Select 
                value={formData.team_ids[0] || 'none'} 
                onValueChange={(value) => setFormData({ 
                  ...formData, 
                  team_ids: value !== 'none' ? [value] : [],
                  default_team_id: value !== 'none' ? value : ''
                })}
              >
                <SelectTrigger className="bg-white border-gray-300 rounded-none">
                  <SelectValue placeholder="Seleziona team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessun team</SelectItem>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="is_system_user"
                checked={formData.is_system_user}
                onCheckedChange={(checked) => setFormData({ ...formData, is_system_user: checked })}
              />
              <label htmlFor="is_system_user" className="text-sm text-gray-700">
                Utente di sistema/API (non può effettuare login interattivo)
              </label>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setShowCreateModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                Annulla
              </Button>
              <Button 
                onClick={handleCreateUser}
                className="flex-1 bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none"
              >
                Crea Utente
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
        <DialogContent className="max-w-lg bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-black">Modifica Utente</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="block text-sm font-semibold text-black mb-2">Username</label>
              <Input
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">Nome Completo *</label>
              <Input
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">Ruolo</label>
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
              <label className="block text-sm font-semibold text-black mb-2">Team</label>
              <Select 
                value={formData.team_ids[0] || ''} 
                onValueChange={(value) => setFormData({ 
                  ...formData, 
                  team_ids: value ? [value] : [],
                  default_team_id: value || ''
                })}
              >
                <SelectTrigger className="bg-white border-gray-300 rounded-none">
                  <SelectValue placeholder="Seleziona team" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nessun team</SelectItem>
                  {teams.map(team => (
                    <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="edit_is_system_user"
                checked={formData.is_system_user}
                onCheckedChange={(checked) => setFormData({ ...formData, is_system_user: checked })}
              />
              <label htmlFor="edit_is_system_user" className="text-sm text-gray-700">
                Utente di sistema/API
              </label>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setShowEditModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                Annulla
              </Button>
              <Button 
                onClick={handleEditUser}
                className="flex-1 bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none"
              >
                Salva Modifiche
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reset Password Modal */}
      <Dialog open={showResetPasswordModal} onOpenChange={setShowResetPasswordModal}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-black flex items-center gap-2">
              <Key className="w-6 h-6 text-blue-600" />
              Reimposta Password
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-gray-600">
              Stai reimpostando la password per <strong>{selectedUser?.full_name}</strong> (@{selectedUser?.username})
            </p>
            <div>
              <label className="block text-sm font-semibold text-black mb-2">Nuova Password</label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Inserisci nuova password"
                className="bg-white border-gray-300 rounded-none"
              />
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setShowResetPasswordModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                Annulla
              </Button>
              <Button 
                onClick={handleResetPassword}
                className="flex-1 bg-blue-600 text-white hover:bg-blue-700 rounded-none"
              >
                Reimposta Password
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete User Modal */}
      <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-red-600 flex items-center gap-2">
              <Trash2 className="w-6 h-6" />
              Conferma Eliminazione
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <p className="text-gray-700">
              Sei sicuro di voler eliminare l'utente <strong>{selectedUser?.full_name}</strong> (@{selectedUser?.username})?
            </p>
            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded">
              <p className="text-sm text-yellow-800">
                <strong>⚠️ Nota:</strong> L'utente verrà disattivato e non potrà più accedere al sistema.
                I dati associati (lead, note, attività) saranno mantenuti.
              </p>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
              >
                Annulla
              </Button>
              <Button 
                onClick={handleDeleteUser}
                className="flex-1 bg-red-600 text-white hover:bg-red-700 rounded-none"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Elimina Utente
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UsersManagement;
