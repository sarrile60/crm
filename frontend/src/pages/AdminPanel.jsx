import React, { useState, useEffect } from 'react';
import { Settings, Shield, Database, Users, ArrowLeft, AlertTriangle, UserCog, Building2, Eye, FileText, Clock, Languages } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import RoleManagement from '../components/admin/RoleManagement';
import PermissionMatrix from '../components/admin/PermissionMatrix';
import EntityConfiguration from '../components/admin/EntityConfiguration';
import UsersManagement from '../components/admin/UsersManagement';
import TeamsManagement from '../components/admin/TeamsManagement';
import DataVisibilityRules from '../components/admin/DataVisibilityRules';
import AuditLogs from '../components/admin/AuditLogs';
import SessionSettings from '../components/admin/SessionSettings';
import LanguageSettings from '../components/admin/LanguageSettings';

const AdminPanel = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('users');
  const [isAuthorized, setIsAuthorized] = useState(null); // null = checking, true = admin, false = not admin
  const [currentUser, setCurrentUser] = useState(null);

  // Route protection - check if user is admin
  useEffect(() => {
    const token = localStorage.getItem('crmToken');
    const user = localStorage.getItem('crmUser');
    
    if (!token || !user) {
      // Not logged in, redirect to login
      navigate('/crm/login');
      return;
    }
    
    try {
      const userData = JSON.parse(user);
      setCurrentUser(userData);
      
      if (userData.role === 'admin') {
        setIsAuthorized(true);
      } else {
        setIsAuthorized(false);
      }
    } catch (e) {
      // Invalid user data
      navigate('/crm/login');
    }
  }, [navigate]);

  // Show loading while checking authorization
  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">{t('admin.verifyingAuth')}</div>
      </div>
    );
  }

  // Show access denied if not admin
  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white border-2 border-red-400 p-8 max-w-md text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-red-600 mb-2">{t('admin.accessDenied')}</h1>
          <p className="text-gray-600 mb-6">
            {t('admin.accessDeniedMessage')}
          </p>
          <Button
            onClick={() => navigate('/crm/dashboard')}
            className="bg-black hover:bg-gray-800 text-white rounded-none"
          >
            {t('admin.backToCRM')}
          </Button>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'users', label: t('admin.users'), icon: UserCog, component: UsersManagement },
    { id: 'teams', label: t('admin.teams'), icon: Building2, component: TeamsManagement },
    { id: 'roles', label: t('admin.roles'), icon: Shield, component: RoleManagement },
    { id: 'permissions', label: t('admin.permissions'), icon: Database, component: PermissionMatrix },
    { id: 'visibility', label: t('admin.visibility'), icon: Eye, component: DataVisibilityRules },
    { id: 'session', label: t('admin.sessionSettings'), icon: Clock, component: SessionSettings },
    { id: 'language', label: t('admin.language'), icon: Languages, component: LanguageSettings },
    { id: 'audit', label: t('admin.auditLogs'), icon: FileText, component: AuditLogs },
    { id: 'entities', label: 'Entity Config', icon: Settings, component: EntityConfiguration }
  ];

  const ActiveComponent = tabs.find(t => t.id === activeTab)?.component;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-black text-white py-4 px-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              onClick={() => navigate('/crm/dashboard')}
              className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-none"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('admin.backToCRM')}
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Administration Panel</h1>
              <p className="text-sm text-gray-400">Manage roles, permissions, and system configuration</p>
            </div>
          </div>
          <Users className="w-8 h-8 text-[#D4AF37]" />
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-4 border-b-2 font-semibold transition-colors ${
                    isActive
                      ? 'border-[#D4AF37] text-black bg-gray-50'
                      : 'border-transparent text-gray-600 hover:text-black hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        {ActiveComponent && <ActiveComponent />}
      </div>
    </div>
  );
};

export default AdminPanel;
