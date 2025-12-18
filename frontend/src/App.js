import './App.css';
import './i18n/i18n'; // Initialize i18n
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useEffect } from 'react';
import axios from 'axios';
import i18n from './i18n/i18n';
import Home from './pages/Home';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import CRMLogin from './pages/CRMLogin';
import CRMDashboard from './pages/CRMDashboard';
import ThankYou from './pages/ThankYou';
import AdminPanel from './pages/AdminPanel';
import { Toaster } from './components/ui/sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function App() {
  // Load system language on app start
  useEffect(() => {
    const loadSystemLanguage = async () => {
      try {
        // Try to get the system language setting (no auth required for public pages)
        const response = await axios.get(`${BACKEND_URL}/api/system/language`);
        if (response.data?.language) {
          i18n.changeLanguage(response.data.language);
          localStorage.setItem('i18nextLng', response.data.language);
        }
      } catch (error) {
        // If API fails, check localStorage or use default
        const savedLang = localStorage.getItem('i18nextLng');
        if (savedLang) {
          i18n.changeLanguage(savedLang);
        }
      }
    };
    loadSystemLanguage();
  }, []);

  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/thank-you" element={<ThankYou />} />
          <Route path="/admin-portal-login" element={<AdminLogin />} />
          <Route path="/admin-dashboard" element={<AdminDashboard />} />
          <Route path="/crm/login" element={<CRMLogin />} />
          <Route path="/crm/dashboard" element={<CRMDashboard />} />
          <Route path="/crm/admin" element={<AdminPanel />} />
        </Routes>
      </BrowserRouter>
      <Toaster />
    </div>
  );
}

export default App;