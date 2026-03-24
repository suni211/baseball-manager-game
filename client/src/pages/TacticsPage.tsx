import { useState, useEffect } from 'react';
import api from '../services/api';

interface Props {
  user: { teamId: number | null };
}

export default function TacticsPage({ user }: Props) {
  const [tactics, setTactics] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [pitchers, setPitchers] = useState<any[]>([]);
  const [pitcherSaving, setPitcherSaving] = useState(false);

  useEffect(() => { loadTactics(); loadPitchers(); }, []);

  const loadTactics = async () => {
    const { data } = await api.get('/tactics');
    setTactics(data);
  };

  const loadPitchers = async () => {
    if (!user.teamId) return;
    const { data } = await api.get(`/players/team/${user.teamId}`);
    const teamPitchers = data.filter((p: any) => p.is_pitcher && p.roster_status === '선발로스터' && !p.is_injured);
    setPitchers(teamPitchers);
  };

  const setPitcherRole = (playerId: number, role: string) => {
    setPitchers(prev => prev.map(p => p.id === playerId ? { ...p, pitcher_role: role } : p));
  };

  const savePitcherRotation = async () => {
    setPitcherSaving(true);
    try {
      const rotation = pitchers.map(p => ({ playerId: p.id, pitcher_role: p.pitcher_role || '중계' }));
      await api.post('/players/pitching-rotation', { rotation });
      setMessage('투수 로테이션 저장 완료!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(err.response?.data?.error || '저장 실패');
    } finally { setPitcherSaving(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/tactics', tactics);
      setMessage('전술 저장 완료!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(err.response?.data?.error || '저장 실패');
    } finally { setSaving(false); }
  };

  if (!tactics) return <div className="text-center mt-4">로딩중...</div>;

  const SliderField = ({ label, field, min = 0, max = 100, desc }: { label: string; field: string; min?: number; max?: number; desc: string }) => (
    <div style={{ marginBottom: 20 }}>
      <div className="flex-between">
        <label className="font-bold">{label}</label>
        <span className="text-blue font-bold">{tactics[field]}</span>
      </div>
      <input type="range" min={min} max={max} value={tactics[field]}
        onChange={e => setTactics({ ...tactics, [field]: parseInt(e.target.value) })}
        style={{ width: '100%', accentColor: '#2563eb' }} />
      <p className="text-sm text-muted">{desc}</p>
    </div>
  );

  return (
    <div>
      <div className="flex-between mb-4">
        <h1 className="text-xl font-bold">전술 설정</h1>
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? '저장중...' : '전술 저장'}
        </button>
      </div>

      {message && <div className="card mb-4" style={{ background: '#065f46', padding: 12 }}>{message}</div>}

      <div className="grid-2">
        <div className="card">
          <h3 className="font-bold mb-4">공격 전술</h3>
          <SliderField label="도루 적극성" field="steal_tendency" desc="높을수록 도루를 자주 시도합니다" />
          <SliderField label="번트 적극성" field="bunt_tendency" desc="높을수록 희생번트를 자주 사용합니다" />
          <SliderField label="히트앤런" field="hit_and_run" desc="높을수록 히트앤런 작전을 자주 사용합니다" />
          <SliderField label="공격 성향" field="aggression" desc="전반적인 공격 성향 (높음=적극적)" />
        </div>

        <div className="card">
          <h3 className="font-bold mb-4">투수/수비 전술</h3>
          <SliderField label="투수 교체 기준 (투구수)" field="pitcher_change_threshold" min={50} max={105}
            desc="이 투구수에 도달하면 투수를 교체합니다 (대회 제한: 105구)" />
          <SliderField label="마무리 등판 이닝" field="closer_inning" min={7} max={9}
            desc="이 이닝부터 마무리 투수를 투입합니다" />
          <SliderField label="고의사구 기준 (파워)" field="intentional_walk_threshold" min={50} max={100}
            desc="타자의 파워가 이 이상이면 고의사구를 고려합니다" />
          <SliderField label="대타 기준 (컨택)" field="pinch_hitter_threshold" min={30} max={100}
            desc="7회 이후 접전 시, 타자 컨택이 이 이하이면 대타 투입" />

          <div style={{ marginBottom: 20 }}>
            <div className="flex-between">
              <label className="font-bold">수비 시프트</label>
              <button
                className={tactics.defensive_shift ? 'primary' : 'secondary'}
                onClick={() => setTactics({ ...tactics, defensive_shift: !tactics.defensive_shift })}
                style={{ padding: '4px 12px', fontSize: 12 }}
              >
                {tactics.defensive_shift ? 'ON' : 'OFF'}
              </button>
            </div>
            <p className="text-sm text-muted mt-2">수비 시프트를 사용합니다 (풀 히터 대응)</p>
          </div>
        </div>
      </div>

      {/* 투수 로테이션 설정 */}
      <div className="card mt-4">
        <div className="flex-between mb-4">
          <h3 className="font-bold">투수 로테이션 설정</h3>
          <button className="primary" onClick={savePitcherRotation} disabled={pitcherSaving}>
            {pitcherSaving ? '저장중...' : '로테이션 저장'}
          </button>
        </div>

        {pitchers.length === 0 ? (
          <div className="empty-state"><p>선발 로스터에 등록된 투수가 없습니다</p></div>
        ) : (
          <div>
            <div style={{ marginBottom: 16 }}>
              <p className="text-sm text-muted mb-2">각 투수의 역할을 선발/중계/마무리로 설정하세요. 선발 최소 1명, 마무리 최대 1명.</p>
              <div className="flex gap-3 text-sm">
                <span className="badge blue">선발 {pitchers.filter(p => p.pitcher_role === '선발').length}명</span>
                <span className="badge silver">중계 {pitchers.filter(p => p.pitcher_role === '중계').length}명</span>
                <span className="badge" style={{ background: '#7c2d12' }}>마무리 {pitchers.filter(p => p.pitcher_role === '마무리').length}명</span>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>이름</th>
                  <th>학년</th>
                  <th style={{ textAlign: 'center' }}>구속</th>
                  <th style={{ textAlign: 'center' }}>제구</th>
                  <th style={{ textAlign: 'center' }}>체력</th>
                  <th style={{ textAlign: 'center' }}>변화구</th>
                  <th style={{ textAlign: 'center' }}>멘탈</th>
                  <th style={{ textAlign: 'center' }}>컨디션</th>
                  <th>역할</th>
                </tr>
              </thead>
              <tbody>
                {pitchers.sort((a, b) => {
                  const roleOrder: Record<string, number> = { '선발': 0, '중계': 1, '마무리': 2 };
                  return (roleOrder[a.pitcher_role] ?? 1) - (roleOrder[b.pitcher_role] ?? 1);
                }).map(p => (
                  <tr key={p.id}>
                    <td className="font-bold">{p.name}</td>
                    <td className="text-sm text-muted">{p.grade}학년</td>
                    <td style={{ textAlign: 'center', color: p.velocity >= 70 ? 'var(--green-light)' : p.velocity >= 50 ? 'var(--yellow-light)' : 'var(--red-light)' }}>{p.velocity}</td>
                    <td style={{ textAlign: 'center', color: p.control_stat >= 70 ? 'var(--green-light)' : p.control_stat >= 50 ? 'var(--yellow-light)' : 'var(--red-light)' }}>{p.control_stat}</td>
                    <td style={{ textAlign: 'center', color: p.stamina >= 70 ? 'var(--green-light)' : p.stamina >= 50 ? 'var(--yellow-light)' : 'var(--red-light)' }}>{p.stamina}</td>
                    <td style={{ textAlign: 'center', color: p.breaking_ball >= 70 ? 'var(--green-light)' : p.breaking_ball >= 50 ? 'var(--yellow-light)' : 'var(--red-light)' }}>{p.breaking_ball}</td>
                    <td style={{ textAlign: 'center', color: p.mental >= 70 ? 'var(--green-light)' : p.mental >= 50 ? 'var(--yellow-light)' : 'var(--red-light)' }}>{p.mental}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={p.condition >= 70 ? 'stat-val-high' : p.condition >= 45 ? 'stat-val-mid' : 'stat-val-low'}>{p.condition}</span>
                    </td>
                    <td>
                      <select
                        value={p.pitcher_role || '중계'}
                        onChange={e => setPitcherRole(p.id, e.target.value)}
                        style={{ width: 80, padding: '4px 8px', fontSize: 12 }}
                      >
                        <option value="선발">선발</option>
                        <option value="중계">중계</option>
                        <option value="마무리">마무리</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card mt-4">
        <h3 className="font-bold mb-2">전술 가이드</h3>
        <div className="grid-3">
          <div style={{ padding: 12, background: '#0a0e17', borderRadius: 8 }}>
            <p className="font-bold text-yellow">스몰볼</p>
            <p className="text-sm text-muted">도루 70+, 번트 60+, 공격 30~</p>
            <p className="text-sm">번트와 도루로 한 점씩 만들어가는 전략</p>
          </div>
          <div style={{ padding: 12, background: '#0a0e17', borderRadius: 8 }}>
            <p className="font-bold text-red">파워 야구</p>
            <p className="text-sm text-muted">도루 20~, 번트 10~, 공격 80+</p>
            <p className="text-sm">장타와 홈런으로 한 방에 뒤집는 전략</p>
          </div>
          <div style={{ padding: 12, background: '#0a0e17', borderRadius: 8 }}>
            <p className="font-bold text-blue">밸런스</p>
            <p className="text-sm text-muted">도루 50, 번트 30, 공격 50</p>
            <p className="text-sm">상황에 따라 유연하게 대처하는 전략</p>
          </div>
        </div>
      </div>
    </div>
  );
}
