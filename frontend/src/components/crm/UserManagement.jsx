import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, UserCheck, UserX, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const UserManagement = ({ currentUser }) => {
  const { t } = useTranslation();
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [newUser, setNewUser] = useState({
    username: '',
    full_name: '',
    password: '',
    role: 'agent',
    team_id: ''
  });
  const [editUser, setEditUser] = useState({
    username: '',
    full_name: '',
    password: '',
    role: '',
    team_id: ''
  });
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const [usersRes, teamsRes] = await Promise.all([
        axios.get(`${API}/crm/users`, { headers }),
        axios.get(`${API}/crm/teams`, { headers })
      ]);

      setUsers(usersRes.data);
      setTeams(teamsRes.data);
    } catch (error) {
      toast.error(t('users.errorLoadingUsers'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.post(`${API}/crm/users`, newUser, { headers });
      toast.success(t('users.userCreated'));
      setShowCreateModal(false);
      setNewUser({ username: '', full_name: '', password: '', role: 'agent', team_id: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('users.errorCreatingUser'));
    }
  };

  const handleEditUser = (user) => {
    setSelectedUser(user);
    setEditUser({
      username: user.username,
      full_name: user.full_name,
      password: '', // Leave blank, only update if filled
      role: user.role,
      team_id: user.team_id || ''
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      // Build update payload - only include fields that have values
      const updateData = {
        full_name: editUser.full_name,
        username: editUser.username,
        role: editUser.role,
        team_id: editUser.team_id || null
      };

      // Only include password if it was entered
      if (editUser.password) {
        updateData.password = editUser.password;
      }

      await axios.put(`${API}/crm/users/${selectedUser.id}`, updateData, { headers });
      toast.success(t('users.userUpdated'));
      setShowEditModal(false);
      setSelectedUser(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('users.errorUpdatingUser'));
    }
  };

  const handleToggleActive = async (userId, isActive) => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.put(`${API}/crm/users/${userId}`, { is_active: !isActive }, { headers });
      toast.success(isActive ? t('users.userDeactivated') : t('users.userActivated'));
      fetchData();
    } catch (error) {
      toast.error(t('users.errorUpdatingUser'));
    }
  };

  const handleDeleteClick = (user) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = async () => {
    if (!userToDelete) return;
    
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.delete(`${API}/crm/users/${userToDelete.id}`, { headers });
      toast.success(t('users.userDeleted'));
      setShowDeleteModal(false);
      setUserToDelete(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('users.errorDeletingUser'));
    }
  };

  const getRoleBadge = (role) => {
    const colors = {
      admin: 'bg-red-100 text-red-800',
      supervisor: 'bg-blue-100 text-blue-800',
      agent: 'bg-green-100 text-green-800'
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return <div className="text-center py-12">{t('common.loading')}...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-black">{t('users.title')}</h2>
        {currentUser.role === 'admin' && (
          <Button onClick={() => setShowCreateModal(true)} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
            <Plus className="w-4 h-4 mr-2" />
            {t('users.newUser')}
          </Button>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white border-2 border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-black">
            <tr>
              <th className="text-left text-white p-4 font-semibold">{t('common.name')}</th>
              <th className="text-left text-white p-4 font-semibold">{t('users.usernameLabel')}</th>
              <th className="text-left text-white p-4 font-semibold">{t('users.role')}</th>
              <th className="text-left text-white p-4 font-semibold">{t('users.team')}</th>
              <th className="text-left text-white p-4 font-semibold">{t('common.status')}</th>
              <th className="text-left text-white p-4 font-semibold">{t('users.lastLogin')}</th>
              <th className="text-left text-white p-4 font-semibold">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-gray-200 hover:bg-gray-50">
                <td className="p-4 text-black font-semibold">{user.full_name}</td>
                <td className="p-4 text-gray-700">{user.username}</td>
                <td className="p-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadge(user.role)}`}>
                    {user.role}
                  </span>
                </td>
                <td className="p-4 text-gray-700">
                  {user.team_id ? teams.find(t => t.id === user.team_id)?.name || 'N/A' : t('common.noTeam')}
                </td>
                <td className="p-4">
                  {user.is_active ? (
                    <span className="text-green-600 font-semibold flex items-center gap-1">
                      <UserCheck className="w-4 h-4" /> {t('users.active')}
                    </span>
                  ) : (
                    <span className="text-red-600 font-semibold flex items-center gap-1">
                      <UserX className="w-4 h-4" /> {t('users.inactive')}
                    </span>
                  )}
                </td>
                <td className="p-4 text-gray-700">
                  {user.last_login ? new Date(user.last_login).toLocaleString() : t('common.never')}
                </td>
                <td className="p-4">
                  {currentUser.role === 'admin' && (
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleEditUser(user)}
                        size="sm"
                        className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      {user.id !== currentUser.id && (
                        <>
                          <Button
                            onClick={() => handleToggleActive(user.id, user.is_active)}
                            size="sm"
                            className={`${user.is_active ? 'bg-orange-500 hover:bg-orange-600' : 'bg-green-600 hover:bg-green-700'} text-white rounded-none`}
                          >
                            {user.is_active ? t('users.deactivate') : t('users.activate')}
                          </Button>
                          <Button
                            onClick={() => handleDeleteClick(user)}
                            size="sm"
                            className="bg-red-600 hover:bg-red-700 text-white rounded-none"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-black">{t('users.createUser')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-black mb-2">{t('leads.fullName')}</label>
                <Input
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  placeholder="Mario Rossi"
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">{t('users.usernameLabel')}</label>
                <Input
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  placeholder="mario_rossi"
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">{t('users.passwordLabel')}</label>
                <Input
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  placeholder="Password sicura"
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Ruolo</label>
                <Select value={newUser.role} onValueChange={(value) => setNewUser({ ...newUser, role: value })}>
                  <SelectTrigger className="bg-white border-gray-300 rounded-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">{t('crm.teamOptional')}</label>
                <Select value={newUser.team_id || "none"} onValueChange={(value) => setNewUser({ ...newUser, team_id: value === "none" ? "" : value })}>
                  <SelectTrigger className="bg-white border-gray-300 rounded-none">
                    <SelectValue placeholder={t('common.noTeam')} />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="none">{t('common.noTeam')}</SelectItem>
                    {teams.map(team => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreateUser} className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                {t('users.createUser')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-black">{t('users.editUser')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-black mb-2">{t('leads.fullName')}</label>
                <Input
                  value={editUser.full_name}
                  onChange={(e) => setEditUser({ ...editUser, full_name: e.target.value })}
                  placeholder="Mario Rossi"
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Username</label>
                <Input
                  type="text"
                  value={editUser.username}
                  onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
                  placeholder="mario_rossi"
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Nuova Password (opzionale)</label>
                <Input
                  type="password"
                  value={editUser.password}
                  onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
                  placeholder="Lascia vuoto per non modificare"
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Ruolo</label>
                <Select value={editUser.role} onValueChange={(value) => setEditUser({ ...editUser, role: value })}>
                  <SelectTrigger className="bg-white border-gray-300 rounded-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="supervisor">Supervisor</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Team</label>
                <Select value={editUser.team_id || "none"} onValueChange={(value) => setEditUser({ ...editUser, team_id: value === "none" ? "" : value })}>
                  <SelectTrigger className="bg-white border-gray-300 rounded-none">
                    <SelectValue placeholder="Nessun team" />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="none">Nessun team</SelectItem>
                    {teams.map(team => (
                      <SelectItem key={team.id} value={team.id}>{team.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleSaveEdit} className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                Salva Modifiche
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete User Confirmation Modal */}
      {showDeleteModal && userToDelete && (
        <Dialog open={showDeleteModal} onOpenChange={setShowDeleteModal}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6" />
                Conferma Eliminazione
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-gray-700">
                Sei sicuro di voler eliminare l'utente <strong>{userToDelete.full_name}</strong> ({userToDelete.username})?
              </p>
              <p className="text-sm text-gray-500">
                L'utente verrà disattivato e non potrà più accedere al sistema. 
                I lead assegnati a questo utente rimarranno nel sistema.
              </p>
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={() => setShowDeleteModal(false)}
                  className="flex-1 bg-gray-200 text-black hover:bg-gray-300 rounded-none"
                >
                  Annulla
                </Button>
                <Button
                  onClick={handleConfirmDelete}
                  className="flex-1 bg-red-600 text-white hover:bg-red-700 rounded-none"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Elimina
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default UserManagement;