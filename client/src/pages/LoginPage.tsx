import { useState } from 'react';
import api from '../services/api';

interface Props {
  onLogin: (user: any, token: string) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = isRegister ? '/auth/register' : '/auth/login';
      const { data } = await api.post(endpoint, { username, password });
      onLogin(data.user, data.token);
    } catch (err: any) {
      setError(err.response?.data?.error || '오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <div className="card" style={{ width: 400, textAlign: 'center' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#60a5fa', marginBottom: 8 }}>
          고교야구 감독 온라인
        </h1>
        <p className="text-muted mb-4">당신의 고교야구 감독 이야기가 시작됩니다</p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 12 }}>
            <input
              type="text"
              placeholder="아이디"
              value={username}
              onChange={e => setUsername(e.target.value)}
              style={{ width: '100%' }}
              required
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <input
              type="password"
              placeholder="비밀번호"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={{ width: '100%' }}
              required
            />
          </div>

          {error && <p className="text-red text-sm mb-2">{error}</p>}

          <button className="primary" style={{ width: '100%', padding: 12, fontSize: 16 }} disabled={loading}>
            {loading ? '처리중...' : isRegister ? '회원가입' : '로그인'}
          </button>
        </form>

        <p className="text-sm mt-4" style={{ color: '#6b7280' }}>
          {isRegister ? '이미 계정이 있나요?' : '계정이 없나요?'}
          {' '}
          <span
            style={{ color: '#60a5fa', cursor: 'pointer' }}
            onClick={() => { setIsRegister(!isRegister); setError(''); }}
          >
            {isRegister ? '로그인' : '회원가입'}
          </span>
        </p>
        <p className="text-sm mt-2 text-muted">IP당 1개 계정만 생성 가능</p>
      </div>
    </div>
  );
}
