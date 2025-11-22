import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, UserCheck, UserX } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const UserManagement = ({ currentUser }) => {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newUser, setNewUser] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'agent',
    team_id: ''
  });

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
      toast.error('Errore nel caricamento degli utenti');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.post(`${API}/crm/users`, newUser, { headers });
      toast.success('Utente creato con successo');
      setShowCreateModal(false);
      setNewUser({ email: '', full_name: '', password: '', role: 'agent', team_id: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Errore nella creazione dell\'utente');
    }
  };

  const handleToggleActive = async (userId, isActive) => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.put(`${API}/crm/users/${userId}`, { is_active: !isActive }, { headers });
      toast.success(isActive ? 'Utente disattivato' : 'Utente attivato');
      fetchData();
    } catch (error) {
      toast.error('Errore nell\'aggiornamento dell\'utente');
    }
  };

  const getRoleBadge = (role) => {
    const colors = {
      admin: 'bg-red-100 text-red-800',
      manager: 'bg-purple-100 text-purple-800',
      supervisor: 'bg-blue-100 text-blue-800',
      agent: 'bg-green-100 text-green-800'
    };
    return colors[role] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return <div className="text-center py-12">Caricamento utenti...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-black">Gestione Utenti</h2>
        {currentUser.role === 'admin' && (
          <Button onClick={() => setShowCreateModal(true)} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
            <Plus className="w-4 h-4 mr-2" />
            Nuovo Utente
          </Button>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-white border-2 border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-black">
            <tr>
              <th className="text-left text-white p-4 font-semibold">Nome</th>
              <th className="text-left text-white p-4 font-semibold">Email</th>
              <th className="text-left text-white p-4 font-semibold">Ruolo</th>
              <th className="text-left text-white p-4 font-semibold">Team</th>
              <th className="text-left text-white p-4 font-semibold">Stato</th>
              <th className="text-left text-white p-4 font-semibold">Ultimo Accesso</th>
              <th className="text-left text-white p-4 font-semibold">Azioni</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-gray-200 hover:bg-gray-50">
                <td className="p-4 text-black font-semibold">{user.full_name}</td>
                <td className="p-4 text-gray-700">{user.email}</td>
                <td className="p-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getRoleBadge(user.role)}`}>
                    {user.role}
                  </span>
                </td>
                <td className="p-4 text-gray-700">
                  {user.team_id ? teams.find(t => t.id === user.team_id)?.name || 'N/A' : 'Nessun team'}
                </td>
                <td className="p-4">
                  {user.is_active ? (
                    <span className="text-green-600 font-semibold flex items-center gap-1">
                      <UserCheck className="w-4 h-4" /> Attivo
                    </span>
                  ) : (
                    <span className="text-red-600 font-semibold flex items-center gap-1">
                      <UserX className="w-4 h-4" /> Inattivo
                    </span>
                  )}
                </td>
                <td className="p-4 text-gray-700">
                  {user.last_login ? new Date(user.last_login).toLocaleString('it-IT') : 'Mai'}
                </td>
                <td className="p-4">
                  {currentUser.role === 'admin' && user.id !== currentUser.id && (
                    <Button
                      onClick={() => handleToggleActive(user.id, user.is_active)}
                      size="sm"
                      className={`${user.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white rounded-none`}
                    >
                      {user.is_active ? 'Disattiva' : 'Attiva'}
                    </Button>
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
              <DialogTitle className="text-2xl font-bold text-black">Crea Nuovo Utente</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Nome Completo</label>
                <Input
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                  placeholder="Mario Rossi"
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Email</label>
                <Input
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="mario@1lawsolicitors.com"
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Password</label>
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
                <label className="block text-sm font-semibold text-black mb-2">Team (Opzionale)</label>
                <Select value={newUser.team_id || "none"} onValueChange={(value) => setNewUser({ ...newUser, team_id: value === "none" ? "" : value })}>
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
              <Button onClick={handleCreateUser} className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                Crea Utente
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default UserManagement;