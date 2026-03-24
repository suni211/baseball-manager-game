import { Link, useLocation } from 'react-router-dom';

interface NavbarProps {
  user: { id: number; username: string; role: string; teamId: number | null };
  onLogout: () => void;
}

export default function Navbar({ user, onLogout }: NavbarProps) {
  const location = useLocation();

  const links = [
    { path: '/dashboard', label: '대시보드' },
    { path: '/league', label: '리그' },
    { path: '/roster', label: '로스터' },
    { path: '/training', label: '훈련' },
    { path: '/schedule', label: '일정' },
    { path: '/standings', label: '순위' },
    { path: '/scout', label: '스카우트' },
    { path: '/finance', label: '재정' },
    { path: '/tactics', label: '전술' },
    { path: '/lineup', label: '타순' },
    { path: '/stadium', label: '구장' },
  ];

  if (user.role === 'admin') {
    links.push({ path: '/admin', label: '관리자' });
  }

  const isActive = (path: string) => {
    if (path === '/league') {
      return location.pathname === '/league' || location.pathname.startsWith('/team/');
    }
    return location.pathname === path;
  };

  return (
    <nav style={{
      background: 'var(--bg-card)',
      borderBottom: '1px solid var(--border-primary)',
      padding: '0 24px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <div style={{
        maxWidth: 1440,
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: 56,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, overflowX: 'auto' }}>
          <Link to="/dashboard" style={{
            fontSize: 17,
            fontWeight: 900,
            color: 'var(--blue-light)',
            letterSpacing: -0.5,
            whiteSpace: 'nowrap',
            marginRight: 4,
          }}>
            고교야구 감독
          </Link>
          {user.teamId && links.map(link => (
            <Link
              key={link.path}
              to={link.path}
              style={{
                color: isActive(link.path) ? 'var(--blue-light)' : 'var(--text-muted)',
                fontSize: 13,
                fontWeight: isActive(link.path) ? 700 : 500,
                padding: '17px 0',
                borderBottom: isActive(link.path) ? '2px solid var(--blue)' : '2px solid transparent',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s ease',
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {user.username}
            {user.role === 'admin' && <span className="badge blue" style={{ marginLeft: 6 }}>관리자</span>}
          </span>
          <button className="secondary sm" onClick={onLogout}>
            로그아웃
          </button>
        </div>
      </div>
    </nav>
  );
}
