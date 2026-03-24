import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

interface Props {
  user: { teamId: number | null };
}

function StatCell({ value }: { value: number }) {
  const cls = value >= 70 ? 'stat-val-high' : value >= 50 ? 'stat-val-mid' : 'stat-val-low';
  return <td style={{ textAlign: 'center', padding: '6px 3px', fontSize: 12 }}><span className={cls}>{value}</span></td>;
}

export default function RosterPage({ user }: Props) {
  const [players, setPlayers] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('전체');
  const [sortBy, setSortBy] = useState<string>('overall');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadPlayers(); }, []);

  const loadPlayers = async () => {
    try {
      const { data } = await api.get(`/players/team/${user.teamId}`);
      setPlayers(data || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleRosterToggle = async (playerId: number, newStatus: string) => {
    try { await api.post('/players/roster', { playerId, status: newStatus }); loadPlayers(); }
    catch (err: any) { alert(err.response?.data?.error || '오류'); }
  };

  const handleRelease = async (playerId: number, name: string) => {
    if (!confirm(`${name} 선수를 방출하시겠습니까?`)) return;
    try { await api.post(`/players/release/${playerId}`); loadPlayers(); }
    catch (err: any) { alert(err.response?.data?.error || '오류'); }
  };

  const ovr = (p: any) => p.is_pitcher
    ? Math.round((p.velocity + p.control_stat + p.stamina + p.breaking_ball) / 4)
    : Math.round((p.contact + p.power + p.eye + p.speed + p.fielding) / 5);

  const filtered = players.filter(p => {
    if (search) {
      const q = search.toLowerCase();
      if (!p.name.toLowerCase().includes(q) && !p.position.toLowerCase().includes(q)) return false;
    }
    if (filter === '전체') return true;
    if (filter === '선발') return p.roster_status === '선발로스터';
    if (filter === '투수') return p.is_pitcher;
    if (filter === '야수') return !p.is_pitcher;
    if (filter === '부상') return p.is_injured;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === 'overall') return ovr(b) - ovr(a);
    if (sortBy === 'position') return a.position.localeCompare(b.position);
    if (sortBy === 'grade') return b.grade - a.grade;
    if (sortBy === 'condition') return b.condition - a.condition;
    return 0;
  });

  const rosterCount = players.filter(p => p.roster_status === '선발로스터').length;
  const injuredCount = players.filter(p => p.is_injured).length;

  if (loading) return <div className="loading">로스터 불러오는 중...</div>;

  const isPitcherView = filter === '투수';
  const isHitterView = filter === '야수';

  return (
    <div>
      <div className="page-header">
        <h1>로스터 관리</h1>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="badge blue">전체 {players.length}/36</span>
          <span className="badge green">선발 {rosterCount}/23</span>
          {injuredCount > 0 && <span className="badge red">부상 {injuredCount}</span>}
        </div>
      </div>

      {/* 컨트롤 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        {['전체', '선발', '투수', '야수', '부상'].map(f => (
          <button key={f} className={filter === f ? 'primary sm' : 'secondary sm'}
            onClick={() => setFilter(f)} style={{ fontSize: 11, padding: '4px 10px' }}>
            {f}
          </button>
        ))}
        <input type="text" placeholder="검색..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ fontSize: 12, padding: '5px 10px', width: 120 }} />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}
          style={{ fontSize: 12, padding: '5px 8px' }}>
          <option value="overall">종합순</option>
          <option value="position">포지션순</option>
          <option value="grade">학년순</option>
          <option value="condition">컨디션순</option>
        </select>
      </div>

      {/* 테이블 */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            <thead>
              <tr>
                <th style={{ padding: '8px 6px', minWidth: 60 }}>이름</th>
                <th style={{ padding: '8px 4px', textAlign: 'center' }}>OVR</th>
                <th style={{ padding: '8px 4px' }}>포지션</th>
                <th style={{ padding: '8px 4px', textAlign: 'center' }}>학년</th>
                <th style={{ padding: '8px 4px', textAlign: 'center' }}>잠재</th>
                <th style={{ padding: '8px 4px', textAlign: 'center' }}>컨디</th>
                <th style={{ padding: '8px 4px', textAlign: 'center' }}>피로</th>
                {(!isPitcherView) && <>
                  <th style={{ padding: '8px 3px', textAlign: 'center' }}>컨택</th>
                  <th style={{ padding: '8px 3px', textAlign: 'center' }}>파워</th>
                  <th style={{ padding: '8px 3px', textAlign: 'center' }}>선구</th>
                  <th style={{ padding: '8px 3px', textAlign: 'center' }}>스피</th>
                  <th style={{ padding: '8px 3px', textAlign: 'center' }}>수비</th>
                </>}
                {(!isHitterView) && <>
                  <th style={{ padding: '8px 3px', textAlign: 'center' }}>구속</th>
                  <th style={{ padding: '8px 3px', textAlign: 'center' }}>제구</th>
                  <th style={{ padding: '8px 3px', textAlign: 'center' }}>체력</th>
                  <th style={{ padding: '8px 3px', textAlign: 'center' }}>변화</th>
                </>}
                <th style={{ padding: '8px 4px' }}>스킬</th>
                <th style={{ padding: '8px 4px' }}>관리</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(p => {
                const o = ovr(p);
                const ovrCls = o >= 70 ? 'text-green' : o >= 50 ? 'text-yellow' : 'text-red';
                const potCls = p.potential === 'S' ? 'gold' : p.potential === 'A' ? 'blue' : p.potential === 'B' ? 'green' : 'silver';

                return (
                  <tr key={p.id} style={{ opacity: p.is_injured ? 0.5 : 1, height: 36 }}>
                    <td style={{ padding: '4px 6px' }}>
                      <Link to={`/player/${p.id}`} style={{ fontWeight: 700, fontSize: 12 }}>{p.name}</Link>
                      {p.is_injured && <span style={{ color: 'var(--red)', fontSize: 9, marginLeft: 3 }}>부상</span>}
                    </td>
                    <td style={{ textAlign: 'center', padding: '4px 4px' }}>
                      <span className={`font-black ${ovrCls}`} style={{ fontSize: 14 }}>{o}</span>
                    </td>
                    <td style={{ padding: '4px 4px', fontSize: 11 }}>
                      {p.position}
                      {p.pitcher_role && <span style={{ color: 'var(--text-muted)', marginLeft: 2, fontSize: 10 }}>({p.pitcher_role[0]})</span>}
                    </td>
                    <td style={{ textAlign: 'center', padding: '4px 4px', fontSize: 11 }}>{p.grade}</td>
                    <td style={{ textAlign: 'center', padding: '4px 4px' }}>
                      <span className={`badge ${potCls}`} style={{ fontSize: 9, padding: '1px 6px' }}>{p.potential}</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '4px 4px' }}>
                      <span className={p.condition >= 70 ? 'text-green' : p.condition >= 40 ? 'text-yellow' : 'text-red'} style={{ fontSize: 12 }}>{p.condition}</span>
                    </td>
                    <td style={{ textAlign: 'center', padding: '4px 4px' }}>
                      <span className={p.fatigue > 70 ? 'text-red' : p.fatigue > 40 ? 'text-yellow' : 'text-green'} style={{ fontSize: 12 }}>{p.fatigue}</span>
                    </td>
                    {(!isPitcherView) && <>
                      <StatCell value={p.contact} />
                      <StatCell value={p.power} />
                      <StatCell value={p.eye} />
                      <StatCell value={p.speed} />
                      <StatCell value={p.fielding} />
                    </>}
                    {(!isHitterView) && (
                      p.is_pitcher ? <>
                        <StatCell value={p.velocity} />
                        <StatCell value={p.control_stat} />
                        <StatCell value={p.stamina} />
                        <StatCell value={p.breaking_ball} />
                      </> : <>
                        <td style={{ textAlign: 'center', padding: '4px 3px', color: 'var(--text-muted)', fontSize: 11 }}>-</td>
                        <td style={{ textAlign: 'center', padding: '4px 3px', color: 'var(--text-muted)', fontSize: 11 }}>-</td>
                        <td style={{ textAlign: 'center', padding: '4px 3px', color: 'var(--text-muted)', fontSize: 11 }}>-</td>
                        <td style={{ textAlign: 'center', padding: '4px 3px', color: 'var(--text-muted)', fontSize: 11 }}>-</td>
                      </>
                    )}
                    <td style={{ padding: '4px 4px' }}>
                      {p.skills && p.skills.length > 0
                        ? p.skills.slice(0, 1).map((s: any, i: number) => (
                            <span key={i} className="badge gold" style={{ fontSize: 9, padding: '1px 5px' }}>{s.skill_name}</span>
                          ))
                        : <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>-</span>}
                    </td>
                    <td style={{ padding: '4px 4px' }}>
                      {p.roster_status === '선발로스터' ? (
                        <button className="secondary sm" style={{ fontSize: 10, padding: '2px 6px' }}
                          onClick={() => handleRosterToggle(p.id, '후보')}>후보</button>
                      ) : (
                        <button className="success sm" style={{ fontSize: 10, padding: '2px 6px' }}
                          onClick={() => handleRosterToggle(p.id, '선발로스터')}>선발</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {sorted.length === 0 && <div className="empty-state"><p>해당 조건의 선수가 없습니다</p></div>}
      </div>
    </div>
  );
}
