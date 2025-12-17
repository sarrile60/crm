import React, { useState } from 'react';
import { Settings, Shield, Database, Users, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import RoleManagement from '../components/admin/RoleManagement';
import PermissionMatrix from '../components/admin/PermissionMatrix';
import EntityConfiguration from '../components/admin/EntityConfiguration';

const AdminPanel = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('roles');

  const tabs = [
    { id: 'roles', label: 'Roles', icon: Shield, component: RoleManagement },
    { id: 'permissions', label: 'Permission Matrix', icon: Database, component: PermissionMatrix },
    { id: 'entities', label: 'Entity Configuration', icon: Settings, component: EntityConfiguration }
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
              Back to CRM
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
