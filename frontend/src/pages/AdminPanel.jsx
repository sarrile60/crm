import React, { useState, useEffect } from 'react';
import { Settings, Shield, Database, Users, ArrowLeft, AlertTriangle, UserCog, Building2, Eye, FileText, Clock, Languages, Search, ChevronRight, Key, Globe, Layout, Activity } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import RoleManagement from '../components/admin/RoleManagement';
import PermissionMatrix from '../components/admin/PermissionMatrix';
import EntityConfiguration from '../components/admin/EntityConfiguration';
import UsersManagement from '../components/admin/UsersManagement';
import TeamsManagement from '../components/admin/TeamsManagement';
import DataVisibilityRules from '../components/admin/DataVisibilityRules';
import AuditLogs from '../components/admin/AuditLogs';
import SessionSettings from '../components/admin/SessionSettings';
import LanguageSettings from '../components/admin/LanguageSettings';
import ChatWidget from '../components/chat/ChatWidget';

const AdminPanel = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState(null); // null = show overview
  const [isAuthorized, setIsAuthorized] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('crmToken');
    const user = localStorage.getItem('crmUser');
    
    if (!token || !user) {
      navigate('/crm/login');
      return;
    }
    
    try {
      const userData = JSON.parse(user);
      setCurrentUser(userData);
      setIsAuthorized(userData.role === 'admin');
    } catch (e) {
      navigate('/crm/login');
    }
  }, [navigate]);

  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">{t('admin.verifyingAuth')}</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white border-2 border-red-400 p-8 max-w-md text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-red-600 mb-2">{t('admin.accessDenied')}</h1>
          <p className="text-gray-600 mb-6">{t('admin.accessDeniedMessage')}</p>
          <Button onClick={() => navigate('/crm/dashboard')} className="bg-black hover:bg-gray-800 text-white rounded-sm">
            {t('admin.backToCRM')}
          </Button>
        </div>
      </div>
    );
  }

  // Admin menu categories - like EspoCRM
  const categories = [
    {
      title: 'Users',
      items: [
        { id: 'users', label: 'Users', description: 'Create, edit and manage system users.', icon: UserCog, component: UsersManagement },
        { id: 'teams', label: 'Teams', description: 'Team management and member assignment.', icon: Building2, component: TeamsManagement },
        { id: 'roles', label: 'Roles', description: 'Define roles and access levels.', icon: Shield, component: RoleManagement },
      ]
    },
    {
      title: 'Access Control',
      items: [
        { id: 'permissions', label: 'Permission Matrix', description: 'Configure entity access permissions for each role.', icon: Key, component: PermissionMatrix },
        { id: 'visibility', label: 'Data Visibility', description: 'Control which data fields are visible to each role.', icon: Eye, component: DataVisibilityRules },
        { id: 'session', label: 'Session Settings', description: 'Work hours, session timeouts, and after-hours access.', icon: Clock, component: SessionSettings },
      ]
    },
    {
      title: 'System',
      items: [
        { id: 'language', label: 'Language', description: 'System language and localization settings.', icon: Globe, component: LanguageSettings },
        { id: 'entities', label: 'Entity Configuration', description: 'Manage entities, fields, and system structure.', icon: Layout, component: EntityConfiguration },
        { id: 'audit', label: 'Audit Logs', description: 'View login history, user actions, and system events.', icon: Activity, component: AuditLogs },
      ]
    }
  ];

  // Flatten for search
  const allItems = categories.flatMap(c => c.items);
  
  // Filter by search
  const filteredCategories = searchQuery
    ? categories.map(c => ({
        ...c,
        items: c.items.filter(item => 
          item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.description.toLowerCase().includes(searchQuery.toLowerCase())
        )
      })).filter(c => c.items.length > 0)
    : categories;

  // Get active component
  const activeItem = allItems.find(item => item.id === activeSection);
  const ActiveComponent = activeItem?.component;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-black text-white px-6 sticky top-0 z-50 border-b border-[#D4AF37]">
        <div className="max-w-5xl mx-auto flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <Button
              onClick={() => activeSection ? setActiveSection(null) : navigate('/crm/dashboard')}
              size="sm"
              className="bg-[#D4AF37] hover:bg-[#B8941F] text-black rounded-sm h-9"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              {activeSection ? 'Back' : t('admin.backToCRM')}
            </Button>
            <div>
              <h1 className="text-base font-semibold">
                {activeSection ? activeItem?.label : t('admin.title')}
              </h1>
              <p className="text-xs text-gray-400">
                {activeSection ? activeItem?.description : t('admin.subtitle')}
              </p>
            </div>
          </div>
          <Settings className="w-6 h-6 text-[#D4AF37]" />
        </div>
      </div>

      {activeSection && ActiveComponent ? (
        /* Active Section Content */
        <div className="max-w-7xl mx-auto px-6 py-6">
          <ActiveComponent />
        </div>
      ) : (
        /* Overview - EspoCRM-style categorized layout */
        <div className="max-w-3xl mx-auto px-6 py-6">
          {/* Search */}
          <div className="relative mb-6">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              placeholder="Search administration..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-10 bg-white border-gray-300 rounded-sm text-sm"
            />
          </div>

          {/* Categories */}
          {filteredCategories.map(category => (
            <div key={category.title} className="mb-6">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-2 px-1">
                {category.title}
              </h2>
              <div className="bg-white border border-gray-200 rounded-sm divide-y divide-gray-100">
                {category.items.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      className="w-full flex items-center gap-4 px-4 py-3 hover:bg-gray-50 transition-colors text-left group"
                    >
                      <div className="w-8 h-8 rounded bg-[#D4AF37]/10 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-[#D4AF37]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-[#D4AF37] group-hover:underline">{item.label}</div>
                        <div className="text-xs text-gray-500">{item.description}</div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
      
      <ChatWidget currentUser={currentUser} />
    </div>
  );
};

export default AdminPanel;
