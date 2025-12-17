import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import CRMLogin from './pages/CRMLogin';
import CRMDashboard from './pages/CRMDashboard';
import ThankYou from './pages/ThankYou';
import AdminPanel from './pages/AdminPanel';
import { Toaster } from './components/ui/sonner';

function App() {
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