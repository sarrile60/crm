import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SettingsPanel = () => {
  const [statuses, setStatuses] = useState([]);
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [newStatus, setNewStatus] = useState({
    name: '',
    color: '#3B82F6',
    order: 0
  });
  const [newTeam, setNewTeam] = useState({
    name: '',
    description: '',
    supervisor_id: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      const [statusesRes, teamsRes, usersRes] = await Promise.all([
        axios.get(`${API}/crm/statuses`, { headers }),
        axios.get(`${API}/crm/teams`, { headers }),
        axios.get(`${API}/crm/users`, { headers })
      ]);

      setStatuses(statusesRes.data);
      setTeams(teamsRes.data);
      setUsers(usersRes.data);
    } catch (error) {
      toast.error('Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStatus = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.post(`${API}/crm/statuses`, newStatus, { headers });
      toast.success('Stato creato con successo');
      setShowCreateModal(false);
      setNewStatus({ name: '', color: '#3B82F6', order: 0 });
      fetchData();
    } catch (error) {
      toast.error('Errore nella creazione dello stato');
    }
  };

  const handleCreateTeam = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.post(`${API}/crm/teams`, newTeam, { headers });
      toast.success('Team creato con successo');
      setShowCreateTeamModal(false);
      setNewTeam({ name: '', description: '', supervisor_id: '' });
      fetchData();
    } catch (error) {
      toast.error('Errore nella creazione del team');
    }
  };

  const handleDeleteStatus = async (statusId) => {
    if (!window.confirm('Sei sicuro di voler eliminare questo stato?')) return;

    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.delete(`${API}/crm/statuses/${statusId}`, { headers });
      toast.success('Stato eliminato');
      fetchData();
    } catch (error) {
      toast.error('Errore nell\'eliminazione dello stato');
    }
  };

  if (loading) {
    return <div className="text-center py-12">Caricamento impostazioni...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-3xl font-bold text-black">Impostazioni CRM</h2>
      </div>

      {/* Custom Statuses Section */}
      <div className="bg-white border-2 border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-black">Stati Personalizzati</h3>
          <Button onClick={() => setShowCreateModal(true)} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
            <Plus className="w-4 h-4 mr-2" />
            Nuovo Stato
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

      {/* Teams Section */}
      <div className="bg-white border-2 border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-black">Gestione Team</h3>
          <Button onClick={() => setShowCreateTeamModal(true)} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
            <Plus className="w-4 h-4 mr-2" />
            Nuovo Team
          </Button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-3 font-semibold text-black">Nome Team</th>
                <th className="text-left p-3 font-semibold text-black">Descrizione</th>
                <th className="text-left p-3 font-semibold text-black">Supervisor</th>
                <th className="text-left p-3 font-semibold text-black">Membri</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => {
                const teamMembers = users.filter(u => u.team_id === team.id);
                const supervisor = users.find(u => u.id === team.supervisor_id);
                return (
                  <tr key={team.id} className="border-t border-gray-200">
                    <td className="p-3 font-semibold text-black">{team.name}</td>
                    <td className="p-3 text-gray-700">{team.description || 'N/A'}</td>
                    <td className="p-3 text-gray-700">{supervisor?.full_name || 'Nessuno'}</td>
                    <td className="p-3 text-gray-700">{teamMembers.length} utenti</td>
                  </tr>
                );
              })}
              {teams.length === 0 && (
                <tr>
                  <td colSpan="4" className="p-4 text-center text-gray-600">Nessun team creato</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-gray-50 border-2 border-gray-200 p-6">
        <h3 className="text-xl font-bold text-black mb-4">Informazioni Sistema</h3>
        <div className="space-y-2 text-gray-700">
          <p><strong>Versione CRM:</strong> 1.0.0</p>
          <p><strong>Stati Attivi:</strong> {statuses.length}</p>
          <p><strong>Team Attivi:</strong> {teams.length}</p>
        </div>
      </div>

      {/* Create Status Modal */}
      {showCreateModal && (
        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-black">Crea Nuovo Stato</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Nome Stato</label>
                <Input
                  value={newStatus.name}
                  onChange={(e) => setNewStatus({ ...newStatus, name: e.target.value })}
                  placeholder="Es. Qualificato"
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Colore</label>
                <Input
                  type="color"
                  value={newStatus.color}
                  onChange={(e) => setNewStatus({ ...newStatus, color: e.target.value })}
                  className="bg-white border-gray-300 rounded-none h-12"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">Ordine</label>
                <Input
                  type="number"
                  value={newStatus.order}
                  onChange={(e) => setNewStatus({ ...newStatus, order: parseInt(e.target.value) })}
                  placeholder="0"
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <Button onClick={handleCreateStatus} className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                Crea Stato
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default SettingsPanel;