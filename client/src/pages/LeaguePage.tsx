import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function LeaguePage() {
  const [leagues, setLeagues] = useState<any[]>([]);
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [leaguesRes, teamsRes] = await Promise.all([
        api.get('/leagues'),
        api.get('/teams')
      ]);
      setLeagues(leaguesRes.data || []);
      setAllTeams(teamsRes.data || []);
    } catch (err) {
      console.error('리그/팀 데이터 로딩 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTeams = allTeams.filter(t => {
    if (selectedLeague && t.league_id !== selectedLeague) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.name.toLowerCase().includes(q) && !(t.owner_name || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const getTeamCount = (leagueId: number) => allTeams.filter(t => t.league_id === leagueId).length;
  const statColor = (val: number) => val >= 70 ? 'stat-val-high' : val >= 50 ? 'stat-val-mid' : 'stat-val-low';

  if (loading) return <div className="loading">리그 정보 불러오는 중...</div>;

  return (
    <div>
      <div className="page-header">
        <h1>리그 & 팀</h1>
        <div>
          <input
            type="text"
            placeholder="팀 또는 감독 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 280 }}
          />
        </div>
      </div>

      {/* League Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(leagues.length + 1, 6)}, 1fr)`, gap: 12, marginBottom: 20 }}>
        <div
          className={`card clickable ${selectedLeague === null ? '' : ''}`}
          onClick={() => setSelectedLeague(null)}
          style={{
            borderColor: selectedLeague === null ? 'var(--blue)' : undefined,
            textAlign: 'center',
            padding: '16px 12px'
          }}
        >
          <p className="text-2xl font-black text-blue">{allTeams.length}</p>
          <p className="text-sm font-bold" style={{ marginTop: 4 }}>전체</p>
        </div>
        {leagues.map(l => (
          <div
            key={l.id}
            className="card clickable"
            onClick={() => setSelectedLeague(selectedLeague === l.id ? null : l.id)}
            style={{
              borderColor: selectedLeague === l.id ? 'var(--blue)' : undefined,
              textAlign: 'center',
              padding: '16px 12px'
            }}
          >
            <p className="text-2xl font-black" style={{ color: selectedLeague === l.id ? 'var(--blue-light)' : 'var(--text-primary)' }}>
              {getTeamCount(l.id)}
            </p>
            <p className="text-sm font-bold" style={{ marginTop: 4 }}>{l.name}</p>
            {l.region && <p className="text-xs text-muted">{l.region}</p>}
          </div>
        ))}
      </div>

      {/* Team Cards Grid */}
      {filteredTeams.length === 0 ? (
        <div className="empty-state">
          <p>표시할 팀이 없습니다</p>
        </div>
      ) : (
        <div className="grid-3">
          {filteredTeams.map(team => {
            const wins = team.wins || 0;
            const losses = team.losses || 0;
            const wr = (wins + losses) > 0 ? (wins / (wins + losses)).toFixed(3) : '.000';
            return (
              <Link key={team.id} to={`/team/${team.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card clickable">
                  <div className="flex-between mb-2">
                    <h3 className="font-bold">{team.name}</h3>
                    <span className="badge blue" style={{ fontSize: 10 }}>{team.league_name || '-'}</span>
                  </div>

                  <div className="flex-between" style={{ marginBottom: 8 }}>
                    <span className="text-sm text-secondary">
                      {team.owner_name ? `${team.owner_name} 감독` : 'AI 감독'}
                    </span>
                    <span className="text-sm">
                      <span className="text-green font-bold">{wins}</span>
                      <span className="text-muted"> / </span>
                      <span className="text-red font-bold">{losses}</span>
                      <span className="text-muted text-xs"> ({wr})</span>
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                    <div style={{ textAlign: 'center', padding: 6, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                      <p className="text-xs text-muted">사기</p>
                      <p className={`font-bold ${statColor(team.morale || 0)}`}>{team.morale ?? '-'}</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: 6, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                      <p className="text-xs text-muted">화학</p>
                      <p className={`font-bold ${statColor(team.chemistry || 0)}`}>{team.chemistry ?? '-'}</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: 6, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                      <p className="text-xs text-muted">인기</p>
                      <p className={`font-bold ${statColor(team.popularity || 0)}`}>{team.popularity ?? '-'}</p>
                    </div>
                    <div style={{ textAlign: 'center', padding: 6, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)' }}>
                      <p className="text-xs text-muted">예산</p>
                      <p className="font-bold text-yellow text-xs">
                        {((team.budget || 0) / 10000).toFixed(0)}만
                      </p>
                    </div>
                  </div>

                  {team.stadium_name && (
                    <p className="text-xs text-muted" style={{ marginTop: 8 }}>
                      구장: {team.stadium_name}
                      {team.stadium_capacity ? ` (${team.stadium_capacity.toLocaleString()}석)` : ''}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
