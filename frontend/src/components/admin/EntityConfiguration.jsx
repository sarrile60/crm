import React, { useState, useEffect } from 'react';
import { Database, Edit, Check, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/admin`;

const EntityConfiguration = () => {
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingEntity, setEditingEntity] = useState(null);
  const [editForm, setEditForm] = useState({ display_name: '', icon: '' });

  useEffect(() => {
    fetchEntities();
  }, []);

  const fetchEntities = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('crmToken');
      const response = await axios.get(`${API}/entities`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setEntities(response.data);
    } catch (error) {
      toast.error('Error loading entities');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleEntity = async (entityName, currentStatus) => {
    try {
      const token = localStorage.getItem('crmToken');
      await axios.put(
        `${API}/entities/${entityName}`,
        { enabled: !currentStatus },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`Entity ${!currentStatus ? 'enabled' : 'disabled'}`);
      fetchEntities();
    } catch (error) {
      toast.error('Error updating entity');
      console.error('Error:', error);
    }
  };

  const startEdit = (entity) => {
    setEditingEntity(entity.entity_name);
    setEditForm({
      display_name: entity.display_name,
      icon: entity.icon || ''
    });
  };

  const saveEdit = async (entityName) => {
    try {
      const token = localStorage.getItem('crmToken');
      await axios.put(
        `${API}/entities/${entityName}`,
        editForm,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success('Entity updated successfully');
      setEditingEntity(null);
      fetchEntities();
    } catch (error) {
      toast.error('Error updating entity');
      console.error('Error:', error);
    }
  };

  const cancelEdit = () => {
    setEditingEntity(null);
    setEditForm({ display_name: '', icon: '' });
  };

  if (loading) {
    return <div className="text-center py-8">Loading entities...</div>;
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-black">Entity Configuration</h2>
        <p className="text-gray-600 mt-1">Enable/disable entities and customize their display properties</p>
      </div>

      {/* Entities List */}
      <div className="bg-white border-2 border-gray-200">
        <table className="w-full">
          <thead className="bg-black text-white">
            <tr>
              <th className="text-left p-4 font-semibold">Entity Name</th>
              <th className="text-left p-4 font-semibold">Display Name</th>
              <th className="text-left p-4 font-semibold">Icon</th>
              <th className="text-center p-4 font-semibold">Order</th>
              <th className="text-center p-4 font-semibold">Enabled</th>
              <th className="text-center p-4 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((entity) => {
              const isEditing = editingEntity === entity.entity_name;
              
              return (
                <tr key={entity.entity_name} className="border-t border-gray-200 hover:bg-gray-50">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-gray-600" />
                      <span className="font-mono text-sm">{entity.entity_name}</span>
                    </div>
                  </td>
                  
                  <td className="p-4">
                    {isEditing ? (
                      <Input
                        value={editForm.display_name}
                        onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                        className="bg-white border-gray-300 rounded-none"
                        placeholder="Display Name"
                      />
                    ) : (
                      <span className="font-semibold text-black">{entity.display_name}</span>
                    )}
                  </td>
                  
                  <td className="p-4">
                    {isEditing ? (
                      <Input
                        value={editForm.icon}
                        onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}
                        className="bg-white border-gray-300 rounded-none"
                        placeholder="Icon name (lucide-react)"
                      />
                    ) : (
                      <span className="text-gray-600 text-sm">{entity.icon || 'None'}</span>
                    )}
                  </td>
                  
                  <td className="p-4 text-center">
                    <span className="text-gray-600">{entity.order}</span>
                  </td>
                  
                  <td className="p-4 text-center">
                    <button
                      onClick={() => toggleEntity(entity.entity_name, entity.enabled)}
                      disabled={isEditing}
                      className={`px-4 py-1 font-semibold rounded-none transition-colors ${
                        entity.enabled
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-red-100 text-red-700 hover:bg-red-200'
                      }`}
                    >
                      {entity.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                  
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-2">
                      {isEditing ? (
                        <>
                          <Button
                            onClick={() => saveEdit(entity.entity_name)}
                            className="bg-green-600 hover:bg-green-700 text-white rounded-none px-3 py-1"
                          >
                            <Check className="w-4 h-4" />
                          </Button>
                          <Button
                            onClick={cancelEdit}
                            className="bg-gray-200 hover:bg-gray-300 text-black rounded-none px-3 py-1"
                          >
                            <X className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={() => startEdit(entity)}
                          className="bg-black hover:bg-gray-800 text-white rounded-none px-3 py-1"
                        >
                          <Edit className="w-4 h-4 mr-2" />
                          Edit
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 p-4">
        <h3 className="font-semibold text-black mb-2">💡 Configuration Tips:</h3>
        <ul className="text-sm text-gray-700 space-y-1">
          <li>• <strong>Display Name:</strong> Shown in UI (e.g., "Leads", "Contacts")</li>
          <li>• <strong>Icon:</strong> Use lucide-react icon names (e.g., "users", "phone")</li>
          <li>• <strong>Enabled:</strong> Disabled entities won't appear in permission matrix</li>
          <li>• <strong>Order:</strong> Controls display order in lists (lower = first)</li>
        </ul>
      </div>
    </div>
  );
};

export default EntityConfiguration;
