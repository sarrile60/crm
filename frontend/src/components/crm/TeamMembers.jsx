import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Phone, Mail, Clock, CheckCircle, XCircle, MessageCircle } from 'lucide-react';
import { Button } from '../ui/button';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const TeamMembers = ({ currentUser }) => {
  const { t } = useTranslation();
  const [team, setTeam] = useState(null);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [memberStats, setMemberStats] = useState({});

  useEffect(() => {
    fetchTeamData();
  }, [currentUser]);

  const fetchTeamData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('crmToken');
      const headers = { Authorization: `Bearer ${token}` };

      // Get teams that this supervisor manages
      const teamsRes = await axios.get(`${API}/chat/teams`, { headers });
      const teams = teamsRes.data.teams || [];
      
      if (teams.length > 0) {
        setTeam(teams[0]); // Get first team (supervisor's team)
        
        // Get team members
        const membersRes = await axios.get(`${API}/admin/teams/${teams[0].id}/members`, { headers });
        const teamMembers = membersRes.data.members || [];
        setMembers(teamMembers);
        
        // Get stats for each member
        const stats = {};
        for (const member of teamMembers) {
          try {
            const statsRes = await axios.get(`${API}/crm/user-stats/${member.id}`, { headers });
            stats[member.id] = statsRes.data;
          } catch (e) {
            stats[member.id] = { total_leads: 0, completed_today: 0 };
          }
        }
        setMemberStats(stats);
      }
    } catch (error) {
      console.error('Error fetching team data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-red-100 text-red-800';
      case 'away': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleColor = (role) => {
    switch (role?.toLowerCase()) {
      case 'supervisor': return 'bg-purple-100 text-purple-800';
      case 'agent': return 'bg-blue-100 text-blue-800';
      case 'admin': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37]"></div>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="bg-white border-2 border-gray-200 p-8 text-center">
        <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-600 mb-2">{t('team.noTeamAssigned')}</h2>
        <p className="text-gray-500">{t('team.noTeamDescription')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Team Header */}
      <div className="bg-[#1a1a2e] text-white p-6 border-2 border-[#D4AF37]">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Users className="w-8 h-8 text-[#D4AF37]" />
              {team.name}
            </h1>
            <p className="text-gray-300 mt-1">{team.description || t('team.defaultDescription')}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-[#D4AF37]">{members.length}</div>
            <div className="text-sm text-gray-400">{t('team.members')}</div>
          </div>
        </div>
      </div>

      {/* Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {members.map(member => {
          const stats = memberStats[member.id] || {};
          
          return (
            <div key={member.id} className="bg-white border-2 border-gray-200 hover:border-[#D4AF37] transition-colors">
              {/* Member Header */}
              <div className="p-4 border-b bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-[#D4AF37] rounded-full flex items-center justify-center text-white text-xl font-bold">
                    {member.full_name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{member.full_name}</h3>
                    <p className="text-sm text-gray-500">@{member.username}</p>
                  </div>
                  <div className={`px-2 py-1 text-xs font-semibold rounded ${getStatusColor(member.status)}`}>
                    {member.status === 'active' ? (
                      <><CheckCircle className="w-3 h-3 inline mr-1" />{t('users.active')}</>
                    ) : (
                      <><XCircle className="w-3 h-3 inline mr-1" />{t('users.inactive')}</>
                    )}
                  </div>
                </div>
              </div>

              {/* Member Details */}
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${getRoleColor(member.role)}`}>
                    {t(`users.roles.${member.role}`) || member.role}
                  </span>
                </div>
                
                {member.email && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Mail className="w-4 h-4" />
                    <span className="truncate">{member.email}</span>
                  </div>
                )}
                
                {member.phone && (
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <Phone className="w-4 h-4" />
                    <span>{member.phone}</span>
                  </div>
                )}

                {/* Stats */}
                <div className="pt-3 border-t grid grid-cols-2 gap-2 text-center">
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-lg font-bold text-[#1a1a2e]">{stats.total_leads || 0}</div>
                    <div className="text-xs text-gray-500">{t('team.totalLeads')}</div>
                  </div>
                  <div className="bg-gray-50 p-2 rounded">
                    <div className="text-lg font-bold text-green-600">{stats.completed_today || 0}</div>
                    <div className="text-xs text-gray-500">{t('team.completedToday')}</div>
                  </div>
                </div>

                {/* Last Activity */}
                {member.last_login && (
                  <div className="flex items-center gap-2 text-xs text-gray-400 pt-2">
                    <Clock className="w-3 h-3" />
                    {t('team.lastActive')}: {new Date(member.last_login).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {members.length === 0 && (
        <div className="bg-white border-2 border-gray-200 p-8 text-center">
          <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-600 mb-2">{t('team.noMembers')}</h2>
          <p className="text-gray-500">{t('team.noMembersDescription')}</p>
        </div>
      )}
    </div>
  );
};

export default TeamMembers;
