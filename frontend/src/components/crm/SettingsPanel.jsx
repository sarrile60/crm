import React, { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Archive, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SettingsPanel = () => {
  const { t } = useTranslation();
  const [statuses, setStatuses] = useState([]);
  const [teams, setTeams] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showArchivedTeams, setShowArchivedTeams] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState(null);
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

  const handleCreateTeam = async () => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.post(`${API}/crm/teams`, newTeam, { headers });
      toast.success(t('teams.teamCreated'));
      setShowCreateTeamModal(false);
      setNewTeam({ name: '', description: '', supervisor_id: '' });
      fetchData();
    } catch (error) {
      toast.error(t('teams.errorCreatingTeam'));
    }
  };

  // Archive a team (soft delete)
  const handleArchiveTeam = async (teamId) => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.put(`${API}/crm/teams/${teamId}/archive`, {}, { headers });
      toast.success(t('teams.teamArchived'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('teams.errorArchivingTeam'));
    }
  };

  // Restore an archived team
  const handleRestoreTeam = async (teamId) => {
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.put(`${API}/crm/teams/${teamId}/restore`, {}, { headers });
      toast.success(t('teams.teamRestored'));
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('teams.errorRestoringTeam'));
    }
  };

  // Permanently delete a team (only archived teams can be deleted)
  const handleDeleteTeam = async () => {
    if (!teamToDelete) return;
    
    try {
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      await axios.delete(`${API}/crm/teams/${teamToDelete.id}`, { headers });
      toast.success(t('teams.teamDeleted'));
      setShowDeleteConfirm(false);
      setTeamToDelete(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || t('teams.errorDeletingTeam'));
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

      {/* Teams Section */}
      <div className="bg-white border-2 border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h3 className="text-xl font-bold text-black">{t('teams.title')}</h3>
            <Button 
              onClick={() => setShowArchivedTeams(!showArchivedTeams)} 
              variant="outline"
              size="sm"
              className={`rounded-none ${showArchivedTeams ? 'bg-gray-200' : ''}`}
            >
              {showArchivedTeams ? <EyeOff className="w-4 h-4 mr-2" /> : <Eye className="w-4 h-4 mr-2" />}
              {showArchivedTeams ? t('teams.hideArchived') : t('teams.showArchived')}
            </Button>
          </div>
          <Button onClick={() => setShowCreateTeamModal(true)} className="bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none">
            <Plus className="w-4 h-4 mr-2" />
            {t('teams.newTeam')}
          </Button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-100">
              <tr>
                <th className="text-left p-3 font-semibold text-black">{t('teams.teamName')}</th>
                <th className="text-left p-3 font-semibold text-black">{t('common.description')}</th>
                <th className="text-left p-3 font-semibold text-black">{t('teams.supervisor')}</th>
                <th className="text-left p-3 font-semibold text-black">{t('teams.members')}</th>
                <th className="text-left p-3 font-semibold text-black">{t('common.status')}</th>
                <th className="text-left p-3 font-semibold text-black">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {teams
                .filter(team => showArchivedTeams ? true : !team.archived)
                .map((team) => {
                const teamMembers = users.filter(u => u.team_id === team.id);
                const supervisor = users.find(u => u.id === team.supervisor_id);
                const isArchived = team.archived;
                return (
                  <tr key={team.id} className={`border-t border-gray-200 ${isArchived ? 'bg-gray-50 opacity-70' : ''}`}>
                    <td className="p-3 font-semibold text-black">
                      {team.name}
                      {isArchived && <span className="ml-2 text-xs text-gray-500">({t('teams.archived')})</span>}
                    </td>
                    <td className="p-3 text-gray-700">{team.description || 'N/A'}</td>
                    <td className="p-3 text-gray-700">{supervisor?.full_name || t('common.none')}</td>
                    <td className="p-3 text-gray-700">{teamMembers.length} {t('users.users')}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 text-xs rounded ${
                        isArchived 
                          ? 'bg-gray-200 text-gray-700' 
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {isArchived ? t('teams.archived') : t('teams.active')}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {isArchived ? (
                          <>
                            <Button
                              onClick={() => handleRestoreTeam(team.id)}
                              size="sm"
                              className="bg-green-600 text-white hover:bg-green-700 rounded-none"
                              title={t('teams.restore')}
                            >
                              <RotateCcw className="w-4 h-4" />
                            </Button>
                            <Button
                              onClick={() => {
                                setTeamToDelete(team);
                                setShowDeleteConfirm(true);
                              }}
                              size="sm"
                              className="bg-red-600 text-white hover:bg-red-700 rounded-none"
                              title={t('teams.deletePermanently')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        ) : (
                          <Button
                            onClick={() => handleArchiveTeam(team.id)}
                            size="sm"
                            className="bg-orange-500 text-white hover:bg-orange-600 rounded-none"
                            title={t('teams.archive')}
                          >
                            <Archive className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {teams.filter(team => showArchivedTeams ? true : !team.archived).length === 0 && (
                <tr>
                  <td colSpan="6" className="p-4 text-center text-gray-600">{t('teams.noTeamsCreated')}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-gray-50 border-2 border-gray-200 p-6">
        <h3 className="text-xl font-bold text-black mb-4">{t('settings.systemInfo')}</h3>
        <div className="space-y-2 text-gray-700">
          <p><strong>{t('settings.crmVersion')}:</strong> 1.0.0</p>
          <p><strong>{t('settings.activeStatuses')}:</strong> {statuses.length}</p>
          <p><strong>{t('settings.activeTeams')}:</strong> {teams.length}</p>
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
                  placeholder="Es. Qualificato"
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">{t('settings.color')}</label>
                <Input
                  type="color"
                  value={newStatus.color}
                  onChange={(e) => setNewStatus({ ...newStatus, color: e.target.value })}
                  className="bg-white border-gray-300 rounded-none h-12"
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

      {/* Create Team Modal */}
      {showCreateTeamModal && (
        <Dialog open={showCreateTeamModal} onOpenChange={setShowCreateTeamModal}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-black">{t('teams.createNewTeam')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-black mb-2">{t('teams.teamName')}</label>
                <Input
                  value={newTeam.name}
                  onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })}
                  placeholder={t('teams.teamNamePlaceholder')}
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">{t('common.description')}</label>
                <Input
                  value={newTeam.description}
                  onChange={(e) => setNewTeam({ ...newTeam, description: e.target.value })}
                  placeholder={t('teams.descriptionOptional')}
                  className="bg-white border-gray-300 rounded-none"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-black mb-2">{t('teams.supervisor')}</label>
                <Select value={newTeam.supervisor_id || "_none"} onValueChange={(value) => setNewTeam({ ...newTeam, supervisor_id: value === "_none" ? "" : value })}>
                  <SelectTrigger className="bg-white border-gray-300 rounded-none">
                    <SelectValue placeholder={t('teams.selectSupervisor')} />
                  </SelectTrigger>
                  <SelectContent className="bg-white">
                    <SelectItem value="_none">{t('teams.noSupervisor')}</SelectItem>
                    {users.filter(u => u.role === 'supervisor').map(user => (
                      <SelectItem key={user.id} value={user.id}>{user.full_name} ({user.role})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreateTeam} className="w-full bg-[#D4AF37] text-black hover:bg-[#C5A028] rounded-none font-semibold">
                {t('teams.createTeam')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Delete Team Confirmation Modal */}
      {showDeleteConfirm && teamToDelete && (
        <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
          <DialogContent className="max-w-md bg-white">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-red-600">{t('teams.confirmDeleteTitle')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-red-50 border-2 border-red-200 p-4">
                <p className="text-sm text-red-800">
                  {t('teams.confirmDeleteMessage', { teamName: teamToDelete.name })}
                </p>
                <p className="text-xs text-red-600 mt-2 font-semibold">
                  {t('teams.deleteWarning')}
                </p>
              </div>
              <div className="flex gap-3">
                <Button 
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setTeamToDelete(null);
                  }} 
                  variant="outline"
                  className="flex-1 rounded-none"
                >
                  {t('common.cancel')}
                </Button>
                <Button 
                  onClick={handleDeleteTeam} 
                  className="flex-1 bg-red-600 text-white hover:bg-red-700 rounded-none"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  {t('teams.deletePermanently')}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default SettingsPanel;