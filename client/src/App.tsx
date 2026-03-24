import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import TeamSelectPage from './pages/TeamSelectPage';
import DashboardPage from './pages/DashboardPage';
import RosterPage from './pages/RosterPage';
import PlayerDetailPage from './pages/PlayerDetailPage';
import SchedulePage from './pages/SchedulePage';
import MatchDetailPage from './pages/MatchDetailPage';
import StandingsPage from './pages/StandingsPage';
import TrainingPage from './pages/TrainingPage';
import ScoutPage from './pages/ScoutPage';
import FinancePage from './pages/FinancePage';
import AdminPage from './pages/AdminPage';
import TacticsPage from './pages/TacticsPage';
import LineupPage from './pages/LineupPage';
import StadiumPage from './pages/StadiumPage';
import LeaguePage from './pages/LeaguePage';
import TeamDetailPage from './pages/TeamDetailPage';
import LiveMatchPage from './pages/LiveMatchPage';
import ManagerPage from './pages/ManagerPage';
import LeagueStatsPage from './pages/LeagueStatsPage';

interface User {
  id: number;
  username: string;
  role: string;
  teamId: number | null;
}

function MobileBottomNav() {
  const location = useLocation();
  const navItems = [
    { path: '/dashboard', label: '홈', icon: '⚾' },
    { path: '/roster', label: '로스터', icon: '👥' },
    { path: '/schedule', label: '일정', icon: '📅' },
    { path: '/league', label: '리그', icon: '🏆' },
    { path: '/standings', label: '순위', icon: '📊' },
  ];
  return (
    <div className="mobile-bottom-nav">
      <div className="mobile-bottom-nav-inner">
        {navItems.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className={`mobile-nav-item ${location.pathname === item.path ? 'active' : ''}`}
          >
            <span className="mobile-nav-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('user');
    if (saved) {
      setUser(JSON.parse(saved));
    }
  }, []);

  const handleLogin = (userData: User, token: string) => {
    setUser(userData);
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('token', token);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('user');
    localStorage.removeItem('token');
  };

  const handleTeamSelect = (teamId: number, token: string) => {
    const updated = { ...user!, teamId };
    setUser(updated);
    localStorage.setItem('user', JSON.stringify(updated));
    localStorage.setItem('token', token);
  };

  const handleTeamChange = (teamId: number | null, token: string) => {
    const updated = { ...user!, teamId };
    setUser(updated);
    localStorage.setItem('user', JSON.stringify(updated));
    localStorage.setItem('token', token);
  };

  return (
    <BrowserRouter>
      {user && <Navbar user={user} onLogout={handleLogout} />}
      <div className="container">
        <Routes>
          <Route path="/login" element={
            user ? <Navigate to={user.teamId ? "/dashboard" : "/select-team"} /> :
            <LoginPage onLogin={handleLogin} />
          } />
          <Route path="/select-team" element={
            !user ? <Navigate to="/login" /> :
            user.teamId ? <Navigate to="/dashboard" /> :
            <TeamSelectPage onSelect={handleTeamSelect} />
          } />
          <Route path="/dashboard" element={
            !user ? <Navigate to="/login" /> :
            !user.teamId ? <Navigate to="/manager" /> :
            <DashboardPage user={user} />
          } />
          <Route path="/roster" element={user?.teamId ? <RosterPage user={user} /> : <Navigate to="/login" />} />
          <Route path="/player/:id" element={user ? <PlayerDetailPage /> : <Navigate to="/login" />} />
          <Route path="/schedule" element={user ? <SchedulePage user={user} /> : <Navigate to="/login" />} />
          <Route path="/match/:id" element={user ? <MatchDetailPage /> : <Navigate to="/login" />} />
          <Route path="/standings" element={user ? <StandingsPage user={user} /> : <Navigate to="/login" />} />
          <Route path="/training" element={user?.teamId ? <TrainingPage user={user} /> : <Navigate to="/login" />} />
          <Route path="/scout" element={user?.teamId ? <ScoutPage user={user} /> : <Navigate to="/login" />} />
          <Route path="/finance" element={user?.teamId ? <FinancePage user={user} /> : <Navigate to="/login" />} />
          <Route path="/tactics" element={user?.teamId ? <TacticsPage user={user} /> : <Navigate to="/login" />} />
          <Route path="/lineup" element={user?.teamId ? <LineupPage user={user} /> : <Navigate to="/login" />} />
          <Route path="/stadium" element={user?.teamId ? <StadiumPage user={user} /> : <Navigate to="/login" />} />
          <Route path="/league" element={user ? <LeaguePage /> : <Navigate to="/login" />} />
          <Route path="/team/:id" element={user ? <TeamDetailPage /> : <Navigate to="/login" />} />
          <Route path="/live/:id" element={user ? <LiveMatchPage /> : <Navigate to="/login" />} />
          <Route path="/stats" element={user ? <LeagueStatsPage /> : <Navigate to="/login" />} />
          <Route path="/manager" element={user ? <ManagerPage user={user} onTeamChange={handleTeamChange} /> : <Navigate to="/login" />} />
          <Route path="/admin" element={user?.role === 'admin' ? <AdminPage /> : <Navigate to="/login" />} />
          <Route path="*" element={<Navigate to={user ? "/dashboard" : "/login"} />} />
        </Routes>
      </div>
      {user && user.teamId && <MobileBottomNav />}
    </BrowserRouter>
  );
}

export default App;
