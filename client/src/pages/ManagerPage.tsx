import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

interface Props {
  user: { id: number; username: string; role: string; teamId: number | null };
  onTeamChange: (teamId: number | null, token: string) => void;
}

export default function ManagerPage({ user, onTeamChange }: Props) {
  const [profile, setProfile] = useState<any>(null);
  const [availableTeams, setAvailableTeams] = useState<any[]>([]);
  const [reputation, setReputation] = useState(0);
  const [tab, setTab] = useState<string>(user.teamId ? '프로필' : '팀 찾기');
  const [message, setMessage] = useState('');
  const [msgType, setMsgType] = useState<'success' | 'error' | 'info'>('info');
  const [loading, setLoading] = useState(false);
  const [negotiating, setNegotiating] = useState<number | null>(null);
  const navigate = useNavigate();

  useEffect(() => { loadProfile(); }, []);

  const loadProfile = async () => {
    try {
      const { data } = await api.get('/manager/profile');
      setProfile(data);
      setReputation(data.reputation);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAvailableTeams = async () => {
    try {
      const { data } = await api.get('/manager/available-teams');
      setAvailableTeams(data.teams);
      setReputation(data.reputation);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (tab === '팀 찾기') loadAvailableTeams();
  }, [tab]);

  const showMsg = (text: string, type: 'success' | 'error' | 'info') => {
    setMessage(text);
    setMsgType(type);
    setTimeout(() => setMessage(''), 5000);
  };

  const handleNegotiate = async (teamId: number) => {
    setNegotiating(teamId);
    setLoading(true);
    try {
      const { data } = await api.post('/manager/negotiate', { targetTeamId: teamId });
      if (data.success) {
        showMsg(data.message, 'success');
        onTeamChange(data.teamId, data.token);
        setTimeout(() => navigate('/dashboard'), 2000);
      } else {
        showMsg(data.message, 'error');
        setReputation(prev => Math.max(0, prev - (data.reputationLost || 0)));
        loadAvailableTeams();
      }
    } catch (err: any) {
      showMsg(err.response?.data?.error || '협상 실패', 'error');
    } finally {
      setLoading(false);
      setNegotiating(null);
    }
  };

  const handleResign = async () => {
    if (!window.confirm('정말 사임하시겠습니까? 평판이 15 감소합니다.')) return;
    setLoading(true);
    try {
      const { data } = await api.post('/manager/resign');
      showMsg(data.message, 'info');
      onTeamChange(null, data.token);
      setTab('팀 찾기');
      loadProfile();
      loadAvailableTeams();
    } catch (err: any) {
      showMsg(err.response?.data?.error || '사임 실패', 'error');
    } finally {
      setLoading(false);
    }
  };

  const repColor = reputation >= 70 ? 'var(--green-light)' : reputation >= 40 ? 'var(--yellow-light)' : 'var(--red-light)';
  const repLabel = reputation >= 80 ? '명장' : reputation >= 60 ? '유능' : reputation >= 40 ? '보통' : reputation >= 20 ? '부진' : '위기';

  return (
    <div>
      <div className="page-header">
        <h1>감독 관리</h1>
      </div>

      {/* 평판 바 */}
      <div className="card mb-4" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ flexShrink: 0 }}>
          <p className="text-sm text-muted">평판</p>
          <p style={{ fontSize: 28, fontWeight: 900, color: repColor }}>{reputation}</p>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span className="text-sm font-bold" style={{ color: repColor }}>{repLabel}</span>
            <span className="text-sm text-muted">{reputation}/100</span>
          </div>
          <div style={{ background: 'var(--bg-primary)', borderRadius: 6, height: 10, overflow: 'hidden' }}>
            <div style={{
              width: `${reputation}%`,
              height: '100%',
              background: repColor,
              borderRadius: 6,
              transition: 'width 0.5s ease',
            }} />
          </div>
        </div>
        {user.teamId && (
          <button className="danger sm" onClick={handleResign} disabled={loading}
            style={{ flexShrink: 0 }}>
            사임
          </button>
        )}
      </div>

      {message && (
        <div className="card mb-4" style={{
          background: msgType === 'success' ? '#065f46' : msgType === 'error' ? '#7f1d1d' : '#1e3a5f',
          padding: 12, fontSize: 14
        }}>
          {message}
        </div>
      )}

      {/* 탭 */}
      <div className="tabs" style={{ marginBottom: 16 }}>
        {(user.teamId ? ['프로필', '팀 찾기', '이적 기록'] : ['팀 찾기', '이적 기록']).map(t => (
          <button
            key={t}
            className={`tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {/* 프로필 */}
      {tab === '프로필' && profile && (
        <div className="grid-2">
          <div className="card">
            <h3 className="font-bold mb-4">현재 팀 성적</h3>
            {profile.teamRecord ? (
              <div>
                <p className="font-bold" style={{ fontSize: 18, marginBottom: 12 }}>
                  {profile.teamRecord.name}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                  <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-primary)', borderRadius: 8 }}>
                    <p className="text-sm text-muted">승</p>
                    <p className="text-green font-bold" style={{ fontSize: 24 }}>{profile.teamRecord.wins || 0}</p>
                  </div>
                  <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-primary)', borderRadius: 8 }}>
                    <p className="text-sm text-muted">패</p>
                    <p className="text-red font-bold" style={{ fontSize: 24 }}>{profile.teamRecord.losses || 0}</p>
                  </div>
                  <div style={{ textAlign: 'center', padding: 12, background: 'var(--bg-primary)', borderRadius: 8 }}>
                    <p className="text-sm text-muted">승률</p>
                    <p className="font-bold" style={{ fontSize: 24 }}>
                      {(parseInt(profile.teamRecord.wins) + parseInt(profile.teamRecord.losses)) > 0
                        ? (parseInt(profile.teamRecord.wins) / (parseInt(profile.teamRecord.wins) + parseInt(profile.teamRecord.losses))).toFixed(3)
                        : '.000'}
                    </p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <p className="text-sm text-muted">사기</p>
                    <p className={profile.teamRecord.morale >= 60 ? 'stat-val-high' : profile.teamRecord.morale >= 40 ? 'stat-val-mid' : 'stat-val-low'}>
                      {profile.teamRecord.morale}
                    </p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p className="text-sm text-muted">화학</p>
                    <p className={profile.teamRecord.chemistry >= 60 ? 'stat-val-high' : profile.teamRecord.chemistry >= 40 ? 'stat-val-mid' : 'stat-val-low'}>
                      {profile.teamRecord.chemistry}
                    </p>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <p className="text-sm text-muted">예산</p>
                    <p className="font-bold">{Number(profile.teamRecord.budget || 0).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="empty-state"><p>팀 데이터 없음</p></div>
            )}
          </div>

          <div className="card">
            <h3 className="font-bold mb-4">평판 가이드</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { range: '80~100', label: '명장', desc: '어떤 팀이든 환영. 높은 협상 성공률', color: '#22c55e' },
                { range: '60~79', label: '유능', desc: '강팀도 관심을 보임. 좋은 성공률', color: '#3b82f6' },
                { range: '40~59', label: '보통', desc: '중위권 팀에 지원 가능', color: '#eab308' },
                { range: '20~39', label: '부진', desc: '약팀만 지원 가능. 경질 위험', color: '#f97316' },
                { range: '0~19', label: '위기', desc: '최하위 팀만 가능. 재기 필요', color: '#ef4444' },
              ].map(tier => (
                <div key={tier.label} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                  background: reputation >= parseInt(tier.range) ? 'rgba(255,255,255,0.05)' : 'transparent',
                  borderRadius: 6,
                  borderLeft: `3px solid ${tier.color}`,
                }}>
                  <span className="font-bold" style={{ color: tier.color, width: 55 }}>{tier.range}</span>
                  <span className="font-bold" style={{ width: 40 }}>{tier.label}</span>
                  <span className="text-sm text-muted">{tier.desc}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-primary)', borderRadius: 8 }}>
              <p className="text-sm text-muted">
                승리 시 +1, 대패(3점차+) 시 -1. 페이즈 종료 시 성적 부진 감독은 자동 경질됩니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 팀 찾기 */}
      {tab === '팀 찾기' && (
        <div>
          {!user.teamId && (
            <div className="card mb-4" style={{ background: '#7f1d1d', padding: 12 }}>
              <p className="font-bold" style={{ color: '#fca5a5' }}>
                현재 소속 팀이 없습니다. 아래에서 새 팀을 찾아 지원하세요.
              </p>
            </div>
          )}

          {availableTeams.length === 0 ? (
            <div className="empty-state">
              <p>현재 감독을 구하는 팀이 없습니다</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {availableTeams.map(t => (
                <div key={t.id} className="card" style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  opacity: t.can_negotiate ? 1 : 0.5,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span className="font-bold" style={{ fontSize: 16 }}>{t.name}</span>
                      <span className="badge silver">{t.league_name}</span>
                      <span className={`badge ${t.difficulty === '상' ? 'blue' : t.difficulty === '중' ? '' : ''}`}
                        style={{
                          background: t.difficulty === '상' ? '#1e3a5f' : t.difficulty === '중' ? '#4a3520' : '#1a3020',
                          color: t.difficulty === '상' ? '#60a5fa' : t.difficulty === '중' ? '#fbbf24' : '#4ade80',
                        }}>
                        난이도 {t.difficulty}
                      </span>
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span>전력: <span className="font-bold">{t.team_overall || '?'}</span></span>
                      <span>성적: <span className="text-green">{t.season_wins}승</span> <span className="text-red">{t.season_losses}패</span></span>
                      <span>예산: {Number(t.budget || 0).toLocaleString()}</span>
                      <span className="text-muted">요구 평판: {t.required_reputation}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', flexShrink: 0, marginLeft: 16 }}>
                    {t.can_negotiate ? (
                      <>
                        <p className="text-sm mb-1">성공률 <span className="font-bold" style={{
                          color: t.success_rate >= 70 ? 'var(--green-light)' : t.success_rate >= 40 ? 'var(--yellow-light)' : 'var(--red-light)'
                        }}>{t.success_rate}%</span></p>
                        <button
                          className="primary sm"
                          onClick={() => handleNegotiate(t.id)}
                          disabled={loading || negotiating === t.id}
                        >
                          {negotiating === t.id ? '협상 중...' : '협상'}
                        </button>
                      </>
                    ) : (
                      <p className="text-sm text-muted">평판 부족</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 이적 기록 */}
      {tab === '이적 기록' && profile && (
        <div className="card">
          <h3 className="font-bold mb-4">감독 이력</h3>
          {profile.transferHistory.length === 0 ? (
            <div className="empty-state"><p>이적 기록이 없습니다</p></div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>날짜</th>
                  <th>이전 팀</th>
                  <th>새 팀</th>
                  <th>사유</th>
                  <th>당시 평판</th>
                </tr>
              </thead>
              <tbody>
                {profile.transferHistory.map((h: any) => (
                  <tr key={h.id}>
                    <td className="text-sm">{new Date(h.transferred_at).toLocaleDateString('ko-KR')}</td>
                    <td>{h.from_team_name || '-'}</td>
                    <td>{h.to_team_name || <span className="text-red">없음</span>}</td>
                    <td>
                      <span className={`badge ${h.reason === '경질' ? '' : h.reason === '자진사임' ? '' : 'blue'}`}
                        style={{
                          background: h.reason === '경질' ? '#7f1d1d' : h.reason === '자진사임' ? '#4a3520' : undefined,
                          color: h.reason === '경질' ? '#fca5a5' : h.reason === '자진사임' ? '#fbbf24' : undefined,
                        }}>
                        {h.reason || '이적'}
                      </span>
                    </td>
                    <td className="text-sm">{h.reputation_at_transfer}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
