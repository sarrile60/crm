import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Scale } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AdminLogin = () => {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post(`${API}/admin/login`, credentials);
      
      if (response.data.success) {
        localStorage.setItem('adminToken', response.data.token);
        toast.success('Login effettuato con successo!');
        navigate('/admin-dashboard');
      }
    } catch (error) {
      toast.error('Credenziali non valide');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <Scale className="w-10 h-10 text-[#00FFD1]" />
            <span className="text-white text-2xl font-semibold">1 LAW SOLICITORS</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Admin Portal</h1>
          <p className="text-white/85">Accedi al pannello di amministrazione</p>
        </div>

        <div className="bg-[#121212] border border-white/25 p-8">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-white mb-2 text-sm">Username</label>
              <Input
                type="text"
                value={credentials.username}
                onChange={(e) => setCredentials({ ...credentials, username: e.target.value })}
                placeholder="admin"
                className="bg-black border-white/25 text-white rounded-none"
                required
              />
            </div>
            <div>
              <label className="block text-white mb-2 text-sm">Password</label>
              <Input
                type="password"
                value={credentials.password}
                onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                placeholder="••••••••"
                className="bg-black border-white/25 text-white rounded-none"
                required
              />
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-[#00FFD1] text-black hover:bg-[#00FFD1]/90 rounded-none text-lg py-6"
            >
              {loading ? 'Accesso in corso...' : 'Accedi'}
            </Button>
          </form>
        </div>

        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/')}
            className="text-white/85 hover:text-white underline"
          >
            Torna al sito
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;