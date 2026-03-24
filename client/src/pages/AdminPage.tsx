import { useState, useEffect } from 'react';
import api from '../services/api';

export default function AdminPage() {
  const [seasons, setSeasons] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<string>('시즌');
  const [newYear, setNewYear] = useState(2025);
  const [simDate, setSimDate] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [usersRes] = await Promise.all([
        api.get('/admin/users')
      ]);
      setUsers(usersRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  const action = async (fn: () => Promise<any>) => {
    setLoading(true);
    setMessage('');
    try {
      const { data } = await fn();
      setMessage(data.message || '완료');
    } catch (err: any) {
      setMessage('에러: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">관리자 패널</h1>

      <div className="flex gap-2 mb-4">
        {['시즌', '유저', '경기'].map(t => (
          <button key={t} className={tab === t ? 'primary' : 'secondary'} onClick={() => setTab(t)}>
            {t} 관리
          </button>
        ))}
      </div>

      {message && (
        <div className="card mb-4" style={{ background: message.startsWith('에러') ? '#7f1d1d' : '#065f46', padding: 12, fontSize: 14 }}>
          {message}
        </div>
      )}

      {tab === '시즌' && (
        <div className="grid-2">
          <div className="card">
            <h3 className="font-bold mb-2">시즌 관리</h3>
            <div className="flex gap-2 mb-4">
              <input type="number" value={newYear} onChange={e => setNewYear(parseInt(e.target.value))} style={{ width: 100 }} />
              <button className="primary" onClick={() => action(() => api.post('/admin/season/create', { year: newYear }))} disabled={loading}>
                새 시즌 생성
              </button>
            </div>

            <h4 className="font-bold mb-2 mt-4">시즌 진행</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="secondary" onClick={() => action(() => api.post('/admin/season/1/generate-league', { phase: '봄리그' }))} disabled={loading}>
                봄 리그 일정 생성
              </button>
              <button className="secondary" onClick={() => action(() => api.post('/admin/season/1/generate-ar-cup'))} disabled={loading}>
                AR상단배 대회 생성
              </button>
              <button className="secondary" onClick={() => action(() => api.post('/admin/season/1/generate-league', { phase: '여름리그' }))} disabled={loading}>
                여름 리그 일정 생성
              </button>
              <button className="secondary" onClick={() => action(() => api.post('/admin/season/1/generate-national'))} disabled={loading}>
                마전국기 생성
              </button>
              <button className="secondary" onClick={() => action(() => api.post('/admin/season/1/offseason'))} disabled={loading}>
                오프시즌 처리 (졸업/성장/신입생)
              </button>
            </div>

            <h4 className="font-bold mb-2 mt-4">대회 관리</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="flex gap-2">
                <input type="number" id="tournamentIdInput" placeholder="대회 ID" style={{ width: 100 }} />
                <button className="secondary" onClick={() => {
                  const tid = (document.getElementById('tournamentIdInput') as HTMLInputElement).value;
                  if (tid) action(() => api.post(`/admin/tournament/${tid}/knockout`));
                }} disabled={loading}>
                  8강 토너먼트 생성
                </button>
                <button className="secondary" onClick={() => {
                  const tid = (document.getElementById('tournamentIdInput') as HTMLInputElement).value;
                  if (tid) action(() => api.post(`/admin/tournament/${tid}/distribute-prizes`));
                }} disabled={loading}>
                  상금 분배
                </button>
              </div>
            </div>
          </div>

          <div className="card">
            <h3 className="font-bold mb-2">일일 관리</h3>
            <button className="primary mb-2" onClick={() => action(() => api.post('/admin/daily-update'))} disabled={loading} style={{ width: '100%' }}>
              일일 컨디션 업데이트
            </button>

            <h4 className="font-bold mb-2 mt-4">경기 시뮬레이션</h4>
            <div className="flex gap-2">
              <input type="date" value={simDate} onChange={e => setSimDate(e.target.value)} />
              <button className="primary" onClick={() => action(() => api.post('/admin/simulate-day', { date: simDate }))} disabled={loading || !simDate}>
                해당 날짜 전체 시뮬
              </button>
            </div>

            <h4 className="font-bold mb-2 mt-4">시즌 페이즈 변경</h4>
            <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
              {['봄리그', 'AR상단배', '여름리그', '마전국기', '오프시즌'].map(phase => (
                <button
                  key={phase}
                  className="secondary"
                  onClick={() => action(() => api.post('/admin/season/1/change-phase', { phase }))}
                  disabled={loading}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  {phase}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === '유저' && (
        <div className="card">
          <h3 className="font-bold mb-2">유저 목록</h3>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>아이디</th>
                <th>역할</th>
                <th>팀</th>
                <th>평판</th>
                <th>IP</th>
                <th>가입일</th>
                <th>최근 접속</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.id}</td>
                  <td className="font-bold">{u.username}</td>
                  <td><span className={`badge ${u.role === 'admin' ? 'blue' : 'silver'}`}>{u.role}</span></td>
                  <td>{u.team_name || '-'}</td>
                  <td>{u.reputation}</td>
                  <td className="text-sm text-muted">{u.ip_address}</td>
                  <td className="text-sm">{new Date(u.created_at).toLocaleDateString('ko-KR')}</td>
                  <td className="text-sm">{new Date(u.last_login).toLocaleDateString('ko-KR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === '경기' && (
        <div className="card">
          <h3 className="font-bold mb-2">개별 경기 시뮬레이션</h3>
          <p className="text-muted text-sm mb-4">경기 ID를 입력하여 개별 시뮬레이션을 실행할 수 있습니다.</p>
          <div className="flex gap-2">
            <input type="number" id="matchIdInput" placeholder="경기 ID" />
            <button className="primary" onClick={() => {
              const matchId = (document.getElementById('matchIdInput') as HTMLInputElement).value;
              if (matchId) action(() => api.post(`/matches/${matchId}/simulate`));
            }} disabled={loading}>
              시뮬레이션 실행
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
