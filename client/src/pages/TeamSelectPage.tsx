import { useState, useEffect } from 'react';
import api from '../services/api';

interface Props {
  onSelect: (teamId: number, token: string) => void;
}

export default function TeamSelectPage({ onSelect }: Props) {
  const [teams, setTeams] = useState<any[]>([]);
  const [leagues, setLeagues] = useState<any[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<number | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [teamsRes, leaguesRes] = await Promise.all([
      api.get('/teams'),
      api.get('/leagues')
    ]);
    setTeams(teamsRes.data);
    setLeagues(leaguesRes.data);
    if (leaguesRes.data.length > 0) setSelectedLeague(leaguesRes.data[0].id);
  };

  const handleSelect = async (teamId: number) => {
    try {
      const { data } = await api.post('/auth/select-team', { teamId });
      onSelect(data.teamId, data.token);
    } catch (err: any) {
      alert(err.response?.data?.error || '팀 선택 실패');
    }
  };

  const filteredTeams = selectedLeague ? teams.filter(t => t.league_id === selectedLeague) : teams;

  return (
    <div style={{ maxWidth: 800, margin: '40px auto' }}>
      <h1 className="text-xl font-bold mb-4" style={{ textAlign: 'center' }}>팀 선택</h1>
      <p className="text-center text-muted mb-4">감독으로 이끌 학교를 선택하세요. 한 번 선택하면 변경할 수 없습니다.</p>

      <div className="flex-center gap-2 mb-4">
        {leagues.map(l => (
          <button
            key={l.id}
            className={selectedLeague === l.id ? 'primary' : 'secondary'}
            onClick={() => setSelectedLeague(l.id)}
          >
            {l.name}
          </button>
        ))}
      </div>

      <div className="grid-2">
        {filteredTeams.map(team => (
          <div key={team.id} className="card" style={{ cursor: team.owner_name ? 'not-allowed' : 'pointer', opacity: team.owner_name ? 0.5 : 1 }}>
            <div className="flex-between mb-2">
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>{team.name}</h3>
              {team.owner_name ? (
                <span className="badge red">감독: {team.owner_name}</span>
              ) : (
                <span className="badge green">선택 가능</span>
              )}
            </div>
            <p className="text-sm text-muted">{team.league_name}</p>
            {!team.owner_name && (
              <button className="primary mt-2" style={{ width: '100%' }} onClick={() => handleSelect(team.id)}>
                이 학교 선택
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
